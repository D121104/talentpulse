from __future__ import annotations

import logging
import re
from typing import Final, cast
from uuid import UUID

from pydantic import ValidationError

from talentpulse_ai.core.exceptions import ServiceError
from talentpulse_ai.modules.rag_chatbot.generation import rendering
from talentpulse_ai.modules.rag_chatbot.generation.citations import (
    parse_and_validate,
    retrieval_citation_jobs,
)
from talentpulse_ai.modules.rag_chatbot.generation.locale import (
    OutputLocale as OutputLocale,
)
from talentpulse_ai.modules.rag_chatbot.generation.locale import (
    _canonical_answer_terms as _canonical_answer_terms,
)
from talentpulse_ai.modules.rag_chatbot.generation.locale import (
    _detected_message_locale as _detected_message_locale,
)
from talentpulse_ai.modules.rag_chatbot.generation.locale import (
    _effective_locale as _effective_locale,
)
from talentpulse_ai.modules.rag_chatbot.generation.locale import (
    _generated_answer_matches_locale,
)
from talentpulse_ai.modules.rag_chatbot.generation.locale import (
    _has_unsupported_letters as _has_unsupported_letters,
)
from talentpulse_ai.modules.rag_chatbot.generation.locale import (
    _language_scores as _language_scores,
)
from talentpulse_ai.modules.rag_chatbot.generation.locale import (
    _requested_locale as _requested_locale,
)
from talentpulse_ai.modules.rag_chatbot.generation.locale import (
    _without_canonical_answer_terms as _without_canonical_answer_terms,
)
from talentpulse_ai.modules.rag_chatbot.generation.prompt_builder import (
    _JOB_COMPARISON_INSTRUCTIONS as _JOB_COMPARISON_INSTRUCTIONS,
)
from talentpulse_ai.modules.rag_chatbot.generation.prompt_builder import (
    _JOB_SEARCH_INSTRUCTIONS as _JOB_SEARCH_INSTRUCTIONS,
)
from talentpulse_ai.modules.rag_chatbot.generation.prompt_builder import (
    _JOB_SEARCH_REVIEW_INSTRUCTIONS as _JOB_SEARCH_REVIEW_INSTRUCTIONS,
)
from talentpulse_ai.modules.rag_chatbot.generation.prompt_builder import (
    _JOB_SEARCH_SELECTION_INSTRUCTIONS as _JOB_SEARCH_SELECTION_INSTRUCTIONS,
)
from talentpulse_ai.modules.rag_chatbot.generation.prompt_builder import (
    _LANGUAGE_INSTRUCTIONS as _LANGUAGE_INSTRUCTIONS,
)
from talentpulse_ai.modules.rag_chatbot.generation.prompt_builder import (
    _QA_TEMPLATE as _QA_TEMPLATE,
)
from talentpulse_ai.modules.rag_chatbot.generation.prompt_builder import (
    SYSTEM_INSTRUCTIONS as SYSTEM_INSTRUCTIONS,
)
from talentpulse_ai.modules.rag_chatbot.generation.prompt_builder import (
    ComparisonExplanation,
    ComparisonGroundingReview,
    JobSearchExplanation,
    JobSearchGroundingReview,
    render_comparison_review_prompt,
    render_job_search_review_prompt,
    render_job_search_selection_prompt,
    render_repair_prompt,
    render_schema_prompt,
)
from talentpulse_ai.modules.rag_chatbot.generation.prompt_builder import (
    _json_encode_untrusted as _json_encode_untrusted,
)
from talentpulse_ai.modules.rag_chatbot.generation.prompt_builder import (
    render_generation_prompt as render_generation_prompt,
)
from talentpulse_ai.modules.rag_chatbot.schemas import (
    AnswerBlock,
    FallbackReason,
    GenerationProvider,
    ProviderGeneration,
    RagGenerateRequest,
    RagGenerateResponse,
    StructuredGenerationProvider,
)

logger = logging.getLogger(__name__)

_REJECTION_CODES: Final = {
    "job search answer is missing evidence references": "missing_evidence_references",
    "provider returned an unknown citation": "unknown_citation",
    "provider returned an unknown job": "unknown_job",
    "provider claim returned an unknown citation": "unknown_claim_citation",
    "provider claim citation is not declared": "undeclared_claim_citation",
    "provider citations and job references are not paired": "unpaired_references",
    "provider claim has an unknown subject": "unknown_claim_subject",
    "provider job claim citation is not paired": "unpaired_claim_reference",
    "retrieval citation maps to multiple jobs": "ambiguous_citation",
    "job search prose is unsupported by canonical facts": "unsupported_job_prose",
    "comparison prose is unsupported or contradicts canonical facts": (
        "unsupported_comparison_prose"
    ),
}


def _rejection_code(error: ValueError) -> str:
    if isinstance(error, ValidationError):
        return "invalid_schema"
    # Never interpolate exception text: provider errors may contain sensitive output.
    return _REJECTION_CODES.get(str(error), "invalid_output")


def _generation_event(request: RagGenerateRequest, attempt: str, code: str) -> None:
    if code == "provider_error":
        stage = "provider"
    elif code == "accepted":
        stage = "complete"
    elif code.startswith("unsupported_"):
        stage = "grounding"
    else:
        stage = "validation"
    logger.info(
        "rag_generation attempt=%s stage=%s code=%s request_id=%s trace_id=%s",
        attempt,
        stage,
        code,
        request.identity.request_id,
        request.identity.trace_id,
    )


class GenerationService:
    def __init__(self, provider: GenerationProvider) -> None:
        self._provider = provider

    @property
    def provider(self) -> GenerationProvider:
        return self._provider

    def generate(self, request: RagGenerateRequest) -> RagGenerateResponse:
        if request.policy.data_scope != "PUBLIC_ACTIVE_JOBS":
            raise ServiceError("invalid_policy", "Only public active jobs are supported.", 422)
        selection_contract = request.intent == "JOB_SEARCH" and callable(
            getattr(self._provider, "generate_structured", None)
        )
        prompt = render_generation_prompt(request, search_selection_contract=selection_contract)
        degraded = False
        generated: ProviderGeneration | None = None
        fallback_reason: FallbackReason = "validation_error"
        try:
            generated = self._generate_validated(prompt, request)
        except ValueError as error:
            # A single repair call is allowed when structured output cannot be parsed or validated.
            code = _rejection_code(error)
            _generation_event(request, "initial", code)
            repair_prompt = render_repair_prompt(
                prompt, request, code, search_selection_contract=selection_contract
            )
            try:
                generated = self._generate_validated(repair_prompt, request)
                _generation_event(request, "repair", "accepted")
                degraded = True
            except ValueError as error:
                _generation_event(request, "repair", _rejection_code(error))
                generated = None
                degraded = True
            except Exception:
                _generation_event(request, "repair", "provider_error")
                generated = None
                degraded = True
                fallback_reason = "provider_error"
        except Exception:
            _generation_event(request, "initial", "provider_error")
            generated = None
            degraded = True
            fallback_reason = "provider_error"

        if generated is None:
            return self._fallback(request, degraded=True, reason=fallback_reason)
        if not _generated_answer_matches_locale(request, generated):
            _generation_event(request, "final", "locale_mismatch")
            return self._fallback(request, degraded=True, reason="locale_mismatch")
        return self._response(request, generated, degraded=degraded)

    def _generate_validated(self, prompt: str, request: RagGenerateRequest) -> ProviderGeneration:
        if request.intent == "CV_JOB_COMPARISON" and callable(
            getattr(self._provider, "generate_structured", None)
        ):
            value = cast(StructuredGenerationProvider, self._provider).generate_structured(
                prompt, ComparisonExplanation.model_json_schema(), timeout=60, num_predict=768
            )
        elif request.intent == "JOB_SEARCH" and callable(
            getattr(self._provider, "generate_structured", None)
        ):
            schema = JobSearchExplanation.model_json_schema()
            allowed = {
                str(job.job_id)
                for job in request.canonical_active_job_context
                if job.job_id in retrieval_citation_jobs(request).values()
            }
            schema["properties"]["selected_job_ids"]["items"] = {
                "type": "string",
                "enum": sorted(allowed),
            }
            selection_value = cast(
                StructuredGenerationProvider, self._provider
            ).generate_structured(
                render_job_search_selection_prompt(prompt),
                schema,
                timeout=60,
                num_predict=1536,
            )
            selection = JobSearchExplanation.model_validate(selection_value)
            if not {str(job_id) for job_id in selection.selected_job_ids}.issubset(allowed):
                raise ValueError("provider returned an unknown job")
            if len(set(selection.selected_job_ids)) != len(selection.selected_job_ids):
                raise ValueError("provider citations and job references are not paired")
            refusal = all(block.kind == "REFUSAL" for block in selection.answer_blocks)
            if refusal and selection.selected_job_ids:
                raise ValueError("provider citations and job references are not paired")
            if request.retrieval_evidence and not refusal and not selection.selected_job_ids:
                raise ValueError("job search answer is missing evidence references")
            citation_jobs = retrieval_citation_jobs(request)
            value = ProviderGeneration(
                answer_blocks=selection.answer_blocks,
                claims=[],
                referenced_job_ids=selection.selected_job_ids,
                citation_keys=[
                    next(key for key, value in citation_jobs.items() if value == job_id)
                    for job_id in selection.selected_job_ids
                ],
            ).model_dump(mode="json")
        else:
            value = self._provider.generate(prompt)
        if request.intent == "JOB_SEARCH":
            candidate = ProviderGeneration.model_validate(value)
            has_references = bool(candidate.citation_keys or candidate.referenced_job_ids)
            if has_references or candidate.claims:
                parse_and_validate(value, request)
            if request.retrieval_evidence and any(
                block.kind != "REFUSAL" for block in candidate.answer_blocks
            ):
                text = "\n".join(block.text for block in candidate.answer_blocks).casefold()
                citation_jobs = retrieval_citation_jobs(request)
                jobs = request.canonical_active_job_context
                mentioned = [
                    job
                    for job in jobs
                    if job.job_id in citation_jobs.values()
                    and (
                        job.job_id in candidate.referenced_job_ids
                        if has_references
                        else (
                            re.search(
                                r"(?<!\w)" + re.escape(job.title.casefold()) + r"(?!\w)", text
                            )
                            and sum(
                                other.title.casefold() == job.title.casefold() for other in jobs
                            )
                            == 1
                        )
                    )
                ]
                if mentioned:
                    review_prompt = render_job_search_review_prompt(request, mentioned, candidate)
                    schema = JobSearchGroundingReview.model_json_schema()
                    if callable(getattr(self._provider, "generate_structured", None)):
                        review_value = cast(
                            StructuredGenerationProvider, self._provider
                        ).generate_structured(review_prompt, schema, timeout=30, num_predict=256)
                    else:
                        review_value = self._provider.generate(
                            render_schema_prompt(review_prompt, schema)
                        )
                    search_review = JobSearchGroundingReview.model_validate(
                        review_value, strict=True
                    )
                    if not search_review.all_assertions_supported:
                        raise ValueError("job search prose is unsupported by canonical facts")
                    citations = [
                        next(key for key, job_id in citation_jobs.items() if job_id == job.job_id)
                        for job in mentioned
                    ]
                    value = candidate.model_copy(
                        update={
                            "citation_keys": citations,
                            "referenced_job_ids": [job.job_id for job in mentioned],
                            "claims": [
                                claim
                                for job, key in zip(mentioned, citations, strict=True)
                                for claim in self._canonical_job_claims(job, key)
                            ],
                        }
                    ).model_dump(mode="json")
        generated = self._parse_and_validate(value, request)
        if request.intent != "CV_JOB_COMPARISON":
            return generated
        review_prompt = render_comparison_review_prompt(request, generated)
        schema = ComparisonGroundingReview.model_json_schema()
        if callable(getattr(self._provider, "generate_structured", None)):
            provider = cast(StructuredGenerationProvider, self._provider)
            review_value = provider.generate_structured(
                review_prompt,
                schema,
                timeout=30,
                num_predict=256,
            )
        else:
            review_value = self._provider.generate(render_schema_prompt(review_prompt, schema))
        review = ComparisonGroundingReview.model_validate(review_value, strict=True)
        if not all(review.model_dump().values()):
            raise ValueError("comparison prose is unsupported or contradicts canonical facts")
        return generated

    @staticmethod
    def _job_search_needs_fallback(
        request: RagGenerateRequest, generated: ProviderGeneration
    ) -> bool:
        if request.intent != "JOB_SEARCH" or not request.retrieval_evidence:
            return False
        if generated.answer_blocks and all(
            block.kind == "REFUSAL" for block in generated.answer_blocks
        ):
            return True
        valid_citations = {item.citation_key for item in request.retrieval_evidence}.intersection(
            generated.citation_keys
        )
        if not valid_citations:
            return True
        retrieved_job_ids = {item.job_id for item in request.retrieval_evidence}
        return not retrieved_job_ids.intersection(generated.referenced_job_ids)

    @staticmethod
    def _retrieval_citation_jobs(request: RagGenerateRequest) -> dict[str, UUID]:
        return retrieval_citation_jobs(request)

    @staticmethod
    def _parse_and_validate(value: object, request: RagGenerateRequest) -> ProviderGeneration:
        if request.intent == "CV_JOB_COMPARISON":
            if isinstance(value, str):
                explanation = ComparisonExplanation.model_validate_json(value)
            else:
                explanation = ComparisonExplanation.model_validate(value)
            generated = ProviderGeneration(
                answer_blocks=[AnswerBlock(kind="INFERENCE", text=explanation.explanation)],
                claims=[],
            )
        else:
            generated = parse_and_validate(value, request)
        evidence = request.matching_evidence
        if request.intent == "CV_JOB_COMPARISON" and evidence is not None:
            job = next(
                job for job in request.canonical_active_job_context if job.job_id == evidence.job_id
            )
            citations = [
                item.citation_key
                for item in request.retrieval_evidence
                if item.job_id == evidence.job_id
            ]
            job_ids = [evidence.job_id]
            canonical_claims = [
                GenerationService._matching_claim(evidence, citations[0]),
                *GenerationService._canonical_job_claims(job, citations[0]),
            ]
            if not generated.answer_blocks or all(
                block.kind == "REFUSAL" for block in generated.answer_blocks
            ):
                raise ValueError("comparison requires an explanation of supplied evidence")
            text = "\n".join(block.text for block in generated.answer_blocks)
            percentages = re.findall(r"(?<![\d.,])(\d+(?:[.,]\d+)?)\s*%", text)
            if any(
                float(value.replace(",", ".")) != round(evidence.overall_score * 100)
                for value in percentages
            ):
                raise ValueError("comparison percentage differs from deterministic score")
            decimals = re.findall(r"(?<![\d.,])0[.,]\d+", text)
            if any(float(value.replace(",", ".")) != evidence.overall_score for value in decimals):
                raise ValueError("comparison decimal differs from deterministic score")
            score_assertions = re.findall(
                r"(?:score|điểm|mức độ phù hợp)\s*(?:is|of|là|:|=)?\s*"
                r"(\d+(?:[.,]\d+)?)"
                r"(?:\s*(?:/|out\s+of|trên)\s*(\d+(?:[.,]\d+)?))?",
                text,
                re.IGNORECASE,
            )
            for numerator, denominator in score_assertions:
                value = float(numerator.replace(",", "."))
                scale = (
                    float(denominator.replace(",", "."))
                    if denominator
                    else (100 if value > 1 else 1)
                )
                if scale <= 0 or abs(value / scale - evidence.overall_score) > 0.005:
                    raise ValueError("comparison score assertion differs from deterministic score")
            # Structured matching facts are owned by the application, never the provider.
            generated = generated.model_copy(
                update={
                    "claims": canonical_claims,
                    "citation_keys": citations[:1],
                    "referenced_job_ids": job_ids,
                }
            )
        return generated

    @staticmethod
    def _response(
        request: RagGenerateRequest, generated: ProviderGeneration, *, degraded: bool
    ) -> RagGenerateResponse:
        if not generated.answer_blocks:
            return GenerationService._fallback(request, degraded=True, reason="empty_answer")
        return RagGenerateResponse(
            request_id=request.identity.request_id,
            trace_id=request.identity.trace_id,
            client_message_id=request.identity.client_message_id,
            answer_status="DEGRADED" if degraded else "COMPLETE",
            answer_blocks=generated.answer_blocks,
            claims=generated.claims,
            citation_keys=generated.citation_keys,
            referenced_job_ids=generated.referenced_job_ids,
            filters=request.filter_state,
            degraded=degraded,
        )

    # Preserve the existing helper entry points while rendering stays provider-independent.
    _fallback = staticmethod(rendering._fallback)
    _display = staticmethod(rendering._display)
    _job_fact_lines = staticmethod(rendering._job_fact_lines)
    _canonical_job_claims = staticmethod(rendering._canonical_job_claims)
    _job_search_fallback = staticmethod(rendering._job_search_fallback)
    _match_explanation_lines = staticmethod(rendering._match_explanation_lines)
    _matching_claim = staticmethod(rendering._matching_claim)
    _comparison_fallback = staticmethod(rendering._comparison_fallback)
