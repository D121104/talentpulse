from __future__ import annotations

import inspect
import re
from collections import Counter
from collections.abc import Mapping, Sequence
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeoutError
from time import monotonic

from pydantic import BaseModel, TypeAdapter, ValidationError

from talentpulse_ai.core.config import Settings
from talentpulse_ai.core.exceptions import ServiceError
from talentpulse_ai.core.logging import _LOGGER
from talentpulse_ai.modules.cv_generator.context_builder import (
    _entry_target_terms,
    _fallback_bullets,
    _fallback_objective,
    _group_skills,
    _localization_target_key,
    _localization_targets,
    _localized_field,
    _localized_text_list,
    _scalar_target_plan,
    _selected_entry_indices,
    _shape_bullet,
    _split_clauses,
)
from talentpulse_ai.modules.cv_generator.prompt_builder import (
    render_cv_draft_prompt,
    render_scalar_batch_prompt,
)
from talentpulse_ai.modules.cv_generator.schemas import (
    CandidateEducation,
    CandidateExperience,
    CandidateProject,
    CvDraft,
    CvDraftRequest,
    DraftExperience,
    DraftProject,
    ProviderCoreDraft,
    ShortText,
)
from talentpulse_ai.modules.cv_generator.validators import (
    _RESPONSIBILITY_ACTION_RE,
    _application_role,
    _dedupe_texts,
    _entry_has_evidence,
    _grounding_rejection_reason,
    _is_generic_bullet,
    _is_grounded,
    _locale_literals,
    _localized_value_is_grounded,
    _salient_anchors,
    _skill_member_display,
    _skill_member_is_relevant,
    _source_localization_evidence,
    _stable_source_text,
    _target_skill_literal,
    _target_skill_pattern,
    _translation_cache_key,
    _validate_localized_payload,
)
from talentpulse_ai.modules.rag_chatbot.schemas import GenerationProvider

_GROUNDED_WARNING = (
    "AI text was omitted because it could not be grounded in the supplied candidate or job facts."
)
_PROVIDER_WARNING = (
    "AI structured output was unavailable or invalid; the draft contains "
    "candidate-provided facts only."
)
_FALLBACK_WARNING = "Deterministic fallback bullets were used; review wording before publishing."
_INSUFFICIENT_EVIDENCE_WARNING = (
    "Insufficient source evidence for a responsibility bullet; "
    "only factual source details were retained."
)
_LOCALIZATION_WARNING = (
    "Some source fields could not be localized with sufficient factual grounding; "
    "edit the draft or retry generation before publishing."
)
_RICH_OMISSION_WARNING = (
    "Some rich source content was omitted because targeted translation or rewriting "
    "could not be grounded; edit the draft or retry generation."
)
_OBJECTIVE_OMISSION_WARNING = (
    "Career objective was omitted because a grounded translation was unavailable; "
    "edit the draft or retry generation."
)
_PROVIDER_PROVENANCE = "cv_generation.provenance=provider"
_FALLBACK_PROVENANCE = "cv_generation.provenance=fallback"
_LOCALIZATION_PROVENANCE = "cv_generation.localization=provider"
# Async-worker defaults are deliberately separate from the shorter browser/NestJS
# request timeout. A warm CPU-only qwen3:4b six-item chunk measured about 36 seconds,
# while the richer core prompt took about 90 seconds. The configured per-call bounds
# leave headroom for that observed latency; the total deadline, chunk size, one repair
# pass, and provider-call cap keep work bounded. Failed provider timeouts are not retried.
_LOCALIZATION_CHUNK_SIZE = 6
_REPAIR_CHUNK_SIZE = 6
_MAX_REPAIR_CALLS = 1
_MAX_PROVIDER_CALLS = 12
_CORE_CALL_TIMEOUT_SECONDS = 120.0
_PRIMARY_CALL_TIMEOUT_SECONDS = 45.0
_REPAIR_CALL_TIMEOUT_SECONDS = 45.0
_LOCALIZATION_NUM_PREDICT = 256
_CV_TOTAL_TIMEOUT_SECONDS = 600.0
_NON_RETRYABLE_LOCALIZATION_FAILURES = frozenset(
    {"provider_timeout", "provider_deadline", "provider_call_cap"}
)
_APPLICATION_HEADING_ADAPTER: TypeAdapter[str] = TypeAdapter(ShortText)


def _is_timeout_exception(exc: BaseException) -> bool:
    """Recognize sanitized provider failures whose cause was a timeout."""
    current: BaseException | None = exc
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        if isinstance(current, TimeoutError):
            return True
        cause = current.__cause__ or current.__context__
        current = cause if isinstance(cause, BaseException) else None
    return False


def _provider_call(
    provider: GenerationProvider,
    prompt: str,
    schema: object,
    *,
    timeout: float | None = None,
    num_predict: int | None = None,
) -> object:
    """Invoke a provider while preserving compatibility with older adapters.

    The optional timeout is enforced locally as well as forwarded to adapters that expose
    it. ``num_predict`` is an Ollama-specific optional bound; providers that do not expose
    that keyword continue to receive the original prompt/schema contract. A worker thread
    is not joined after timeout, so a stuck provider cannot consume the remaining deadline;
    cancellation is therefore best-effort at the provider boundary.
    """
    method = getattr(provider, "generate_structured", None)
    if callable(method):
        parameters: Mapping[str, inspect.Parameter]
        try:
            parameters = inspect.signature(method).parameters
        except (TypeError, ValueError):
            parameters = {}
        accepts_timeout = "timeout" in parameters
        accepts_num_predict = "num_predict" in parameters

        def invoke() -> object:
            kwargs: dict[str, object] = {}
            if timeout is not None and accepts_timeout:
                kwargs["timeout"] = timeout
            if num_predict is not None and accepts_num_predict:
                kwargs["num_predict"] = num_predict
            return method(prompt, schema, **kwargs)
    else:

        def invoke() -> object:
            return provider.generate(prompt)

    if timeout is None:
        return invoke()

    executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="cv-provider")
    future = executor.submit(invoke)
    try:
        return future.result(timeout=timeout)
    except FutureTimeoutError as exc:
        future.cancel()
        raise TimeoutError("provider call exceeded its bounded timeout") from exc
    finally:
        executor.shutdown(wait=False, cancel_futures=True)


_CORE_PROVIDER_OUTPUT_FIELDS = frozenset({"bullets", "project_bullets", "coverage", "warnings"})


def _validate_provider_model[ModelT: BaseModel](raw: object, model: type[ModelT]) -> ModelT:
    """Validate core structured output while tolerating legacy core-only extras."""
    try:
        return model.model_validate(raw)
    except Exception:
        if model is not ProviderCoreDraft or not isinstance(raw, Mapping):
            raise
        extras = set(raw).difference(model.model_fields)
        if not extras or not extras.issubset(_CORE_PROVIDER_OUTPUT_FIELDS):
            raise
        return model.model_validate(
            {key: value for key, value in raw.items() if key in model.model_fields}
        )


class CvDraftGenerationService:
    def __init__(self, provider: GenerationProvider, settings: Settings | None = None) -> None:
        self._provider = provider
        self._settings = settings
        self.last_metrics: dict[str, object] = {}

    def _budget_seconds(self) -> tuple[float, float, float, float]:
        if self._settings is None:
            return (
                _CV_TOTAL_TIMEOUT_SECONDS,
                _CORE_CALL_TIMEOUT_SECONDS,
                _PRIMARY_CALL_TIMEOUT_SECONDS,
                _REPAIR_CALL_TIMEOUT_SECONDS,
            )
        return (
            self._settings.cv_generation_total_timeout_seconds,
            self._settings.cv_generation_core_timeout_seconds,
            self._settings.cv_generation_chunk_timeout_seconds,
            self._settings.cv_generation_repair_timeout_seconds,
        )

    def generate(self, request: CvDraftRequest) -> CvDraft:
        started_at = monotonic()
        selected_experience, selected_projects = _selected_entry_indices(request)
        application_role = _application_role(request)
        application_heading = None
        if application_role is not None:
            prefix = (
                "Ứng tuyển: " if request.locale.casefold().startswith("vi") else "Applying for: "
            )
            try:
                application_heading = _APPLICATION_HEADING_ADAPTER.validate_python(
                    prefix + application_role
                )
            except ValidationError:
                raise ServiceError(
                    "invalid_cv_request",
                    "Application heading exceeds the 500-character limit.",
                    422,
                ) from None
        (
            total_timeout_seconds,
            core_timeout_seconds,
            chunk_timeout_seconds,
            repair_timeout_seconds,
        ) = self._budget_seconds()
        total_deadline = started_at + total_timeout_seconds
        required_patterns = [
            (_target_skill_literal(skill), re.compile(_target_skill_pattern(skill), re.IGNORECASE))
            for skill in dict.fromkeys(request.job.required_skills)
        ]
        preferred_patterns = [
            (_target_skill_literal(skill), re.compile(_target_skill_pattern(skill), re.IGNORECASE))
            for skill in dict.fromkeys(request.job.preferred_skills)
        ]

        def target_priority(text: str, own_terms: Sequence[str] | None = None) -> tuple[int, int]:
            # Stable ordering of existing grounded facts, not a generated suitability score.
            return (
                -sum(
                    bool(pattern.search(text))
                    for skill, pattern in required_patterns
                    if own_terms is None or skill in own_terms
                ),
                -sum(
                    bool(pattern.search(text))
                    for skill, pattern in preferred_patterns
                    if own_terms is None or skill in own_terms
                ),
            )

        warnings: list[str] = []
        diagnostics: Counter[str] = Counter()
        provider_call_count = 0
        provider_elapsed_seconds = 0.0
        provider_call_latencies_ms: list[float] = []
        provider_call_kinds: list[str] = []
        provider_timeout_kinds: list[str] = []

        def mark(code: str, amount: int = 1) -> None:
            diagnostics[code] += amount

        def invoke(
            prompt: str,
            schema: object,
            *,
            deadline: float,
            timeout: float,
            call_kind: str,
            num_predict: int | None = None,
        ) -> object:
            nonlocal provider_call_count, provider_elapsed_seconds
            if provider_call_count >= _MAX_PROVIDER_CALLS:
                mark("provider_call_cap")
                raise TimeoutError("CV provider call cap reached")
            remaining = deadline - monotonic()
            if remaining <= 0:
                mark("provider_deadline")
                raise TimeoutError("CV provider total deadline reached")
            provider_call_count += 1
            provider_call_kinds.append(call_kind)
            call_started = monotonic()
            try:
                return _provider_call(
                    self._provider,
                    prompt,
                    schema,
                    timeout=min(timeout, remaining),
                    num_predict=num_predict,
                )
            except Exception as exc:
                if _is_timeout_exception(exc):
                    provider_timeout_kinds.append(call_kind)
                raise
            finally:
                elapsed = monotonic() - call_started
                provider_elapsed_seconds += elapsed
                provider_call_latencies_ms.append(round(elapsed * 1000, 2))

        localized_fields: dict[tuple[str, int, str], str] = {}
        localization_provider_used = False
        provider_used = False
        fallback_used = False

        def accept_core(
            core: ProviderCoreDraft,
            *,
            experience_indices: set[int] | None = None,
            project_indices: set[int] | None = None,
        ) -> None:
            nonlocal provider_used
            for bullet in core.bullets:
                if experience_indices is not None and bullet.source_index not in experience_indices:
                    continue
                if bullet.source_index >= len(request.candidate.experience):
                    mark("grounding_anchor_rejection")
                    warnings.append(_GROUNDED_WARNING)
                    continue
                source = request.candidate.experience[bullet.source_index]
                if not _entry_has_evidence(source):
                    mark("grounding_anchor_rejection")
                    warnings.append(_GROUNDED_WARNING)
                    continue
                source_evidence = [
                    value for value in source.model_dump().values() if isinstance(value, str)
                ]
                if _is_generic_bullet(bullet.text):
                    mark("grounding_anchor_rejection")
                    warnings.append(_GROUNDED_WARNING)
                    continue
                rejection = _grounding_rejection_reason(
                    bullet.text,
                    source_evidence,
                    locale=request.locale,
                    preserved_literals=_locale_literals(request.candidate),
                )
                if rejection is not None:
                    mark(rejection)
                    warnings.append(_GROUNDED_WARNING)
                    continue
                accepted = _dedupe_texts(
                    (
                        item
                        for item in _shape_bullet(bullet.text)
                        if _is_grounded(
                            item,
                            source_evidence,
                            locale=request.locale,
                            preserved_literals=_locale_literals(request.candidate),
                        )
                    ),
                    exclude=[source.description or ""],
                    limit=10,
                )
                if accepted:
                    bullets_by_experience.setdefault(bullet.source_index, []).extend(accepted)
                    provider_used = True

            for project_bullet in core.project_bullets:
                if (
                    project_indices is not None
                    and project_bullet.source_index not in project_indices
                ):
                    continue
                if project_bullet.source_index >= len(request.candidate.projects):
                    mark("grounding_anchor_rejection")
                    warnings.append(_GROUNDED_WARNING)
                    continue
                project_source = request.candidate.projects[project_bullet.source_index]
                if not _entry_has_evidence(project_source):
                    mark("grounding_anchor_rejection")
                    warnings.append(_GROUNDED_WARNING)
                    continue
                source_evidence = [
                    value
                    for value in project_source.model_dump().values()
                    if isinstance(value, str)
                ] + project_source.technologies
                if _is_generic_bullet(project_bullet.text):
                    mark("grounding_anchor_rejection")
                    warnings.append(_GROUNDED_WARNING)
                    continue
                rejection = _grounding_rejection_reason(
                    project_bullet.text,
                    source_evidence,
                    locale=request.locale,
                    preserved_literals=_locale_literals(request.candidate),
                )
                if rejection is not None:
                    mark(rejection)
                    warnings.append(_GROUNDED_WARNING)
                    continue
                accepted = _dedupe_texts(
                    (
                        item
                        for item in _shape_bullet(project_bullet.text)
                        if _is_grounded(
                            item,
                            source_evidence,
                            locale=request.locale,
                            preserved_literals=_locale_literals(request.candidate),
                        )
                    ),
                    exclude=[project_source.description or ""],
                    limit=10,
                )
                if accepted:
                    bullets_by_project.setdefault(project_bullet.source_index, []).extend(accepted)
                    provider_used = True

        def merge_scalar(
            section: str,
            source_index: int,
            field: str,
            value: str | None,
        ) -> str | None:
            nonlocal localization_provider_used
            accepted, reason = _localized_value_is_grounded(
                request,
                value,
                section=section,
                source_index=source_index,
                field=field,
            )
            if accepted is None:
                return reason or "localization_rejection"
            localized_fields[(section, source_index, field)] = accepted
            localization_provider_used = True
            return None

        def provider_warning_values(model: BaseModel) -> list[str]:
            raw = getattr(model, "warnings", [])
            if not isinstance(raw, list):
                return []
            return [value for value in raw if isinstance(value, str)]

        def validate_core_payload(
            raw: object,
            experience_indices: Sequence[int] = (),
            project_indices: Sequence[int] = (),
        ) -> ProviderCoreDraft:
            try:
                return _validate_provider_model(raw, ProviderCoreDraft)
            except Exception:
                if not isinstance(raw, Mapping):
                    raise
                coerced = dict(raw)
                if isinstance(coerced.get("bullets"), list) and len(experience_indices) == 1:
                    values = coerced["bullets"]
                    if all(isinstance(value, str) for value in values):
                        coerced["bullets"] = [
                            {"source_index": experience_indices[0], "text": value}
                            for value in values
                        ]
                if isinstance(coerced.get("project_bullets"), list) and len(project_indices) == 1:
                    values = coerced["project_bullets"]
                    if all(isinstance(value, str) for value in values):
                        coerced["project_bullets"] = [
                            {"source_index": project_indices[0], "text": value} for value in values
                        ]
                return _validate_provider_model(coerced, ProviderCoreDraft)

        bullets_by_experience: dict[int, list[str]] = {}
        bullets_by_project: dict[int, list[str]] = {}

        # Core generation is one small structured call.  It never carries the
        # localization object, so Qwen can focus on complete rich bullets.
        core_indices_experience = {
            index
            for index, item in enumerate(request.candidate.experience)
            if index in selected_experience and _entry_has_evidence(item)
        }
        core_indices_projects = {
            index
            for index, item in enumerate(request.candidate.projects)
            if index in selected_projects and _entry_has_evidence(item)
        }
        core: ProviderCoreDraft | None = None
        if core_indices_experience or core_indices_projects:
            try:
                core = validate_core_payload(
                    invoke(
                        render_cv_draft_prompt(request),
                        ProviderCoreDraft.model_json_schema(),
                        deadline=total_deadline,
                        timeout=core_timeout_seconds,
                        call_kind="core",
                    ),
                    tuple(sorted(core_indices_experience)),
                    tuple(sorted(core_indices_projects)),
                )
                warnings.extend(provider_warning_values(core))
                accept_core(core)
            except Exception as exc:
                error_method = getattr(exc, "errors", None)
                validation_paths: list[str] = []
                if callable(error_method):
                    validation_failed = True
                    validation_paths = [
                        ".".join(str(part) for part in error.get("loc", ()))
                        for error in error_method()
                    ]
                else:
                    validation_failed = False
                if validation_failed:
                    mark("schema_validation")
                elif _is_timeout_exception(exc):
                    mark("provider_timeout")
                else:
                    mark("provider_exception")
                _LOGGER.warning(
                    "cv_generation_core_failed request_id=%s trace_id=%s model=%s "
                    "exception_class=%s validation_failed=%s failure_reason=%s "
                    "validation_paths=%s",
                    request.identity.request_id,
                    request.identity.trace_id,
                    getattr(
                        self._provider,
                        "model_name",
                        getattr(self._provider, "_model", "unknown"),
                    ),
                    type(exc).__name__,
                    validation_failed,
                    (
                        "provider_validation_error"
                        if validation_failed
                        else "provider_timeout"
                        if _is_timeout_exception(exc)
                        else "provider_exception"
                    ),
                    validation_paths,
                )
                warnings.append(_PROVIDER_WARNING)

        # Repair partial successful output before fallback can hide missing provider entries.
        # A failed/timed-out core call is not retried with another slow inference call.
        missing_experience = sorted(core_indices_experience - bullets_by_experience.keys())
        missing_projects = sorted(core_indices_projects - bullets_by_project.keys())
        if missing_experience or missing_projects:
            mark("missing_provider_item", len(missing_experience) + len(missing_projects))
        # Reorder valid owning facts before deciding whether a single repair is needed.
        for index, bullets in bullets_by_experience.items():
            own_terms = _entry_target_terms(request, request.candidate.experience[index])
            bullets.sort(key=lambda text: target_priority(text, own_terms))
        for index, bullets in bullets_by_project.items():
            own_terms = _entry_target_terms(request, request.candidate.projects[index])
            bullets.sort(key=lambda text: target_priority(text, own_terms))
        focus_experience = [
            index
            for index in sorted(core_indices_experience)
            if index not in missing_experience
            and (
                (
                    bool(
                        own_terms := _entry_target_terms(
                            request, request.candidate.experience[index]
                        )
                    )
                    and target_priority(bullets_by_experience[index][0], own_terms) == (0, 0)
                )
                or not _salient_anchors(
                    request.candidate.experience[index].description or ""
                ).issubset(_salient_anchors(" ".join(bullets_by_experience[index])))
            )
        ]
        focus_projects = [
            index
            for index in sorted(core_indices_projects)
            if index not in missing_projects
            and (
                (
                    bool(
                        own_terms := _entry_target_terms(request, request.candidate.projects[index])
                    )
                    and target_priority(bullets_by_project[index][0], own_terms) == (0, 0)
                )
                or not _salient_anchors(
                    request.candidate.projects[index].description or ""
                ).issubset(_salient_anchors(" ".join(bullets_by_project[index])))
            )
        ]
        repair_entries: list[tuple[list[int], list[int]]] = [
            ([index], []) for index in [*missing_experience, *focus_experience]
        ] + [([], [index]) for index in [*missing_projects, *focus_projects]]
        for experience_indices, project_indices in repair_entries:
            if core is None or provider_call_count >= _MAX_PROVIDER_CALLS:
                break
            if monotonic() >= total_deadline:
                break
            # One bounded attempt per entry avoids a small model borrowing another entry's
            # source index. Grammar and application checks both retain the original index.
            repair_schema = ProviderCoreDraft.model_json_schema()
            repair_schema["properties"] = {
                key: repair_schema["properties"][key] for key in ("bullets", "project_bullets")
            }
            repair_schema["$defs"] = {
                key: repair_schema["$defs"][key]
                for key in ("GeneratedBullet", "GeneratedProjectBullet")
            }
            repair_schema["required"] = ["bullets", "project_bullets"]
            for repair_field, definition, indices in (
                ("bullets", "GeneratedBullet", experience_indices),
                ("project_bullets", "GeneratedProjectBullet", project_indices),
            ):
                if indices:
                    index_schema = repair_schema["$defs"][definition]["properties"]["source_index"]
                    index_schema["enum"] = indices
                    repair_schema["properties"][repair_field]["minItems"] = 1
                    repair_schema["properties"][repair_field]["maxItems"] = 3
                    repair_schema["$defs"][definition]["properties"]["text"]["maxLength"] = 250
                else:
                    repair_schema["properties"][repair_field]["maxItems"] = 0
            try:
                repaired_core = validate_core_payload(
                    invoke(
                        render_cv_draft_prompt(
                            request,
                            experience_indices=experience_indices,
                            project_indices=project_indices,
                        ),
                        repair_schema,
                        deadline=total_deadline,
                        timeout=repair_timeout_seconds,
                        call_kind="core_repair",
                        num_predict=768,
                    ),
                    experience_indices,
                    project_indices,
                )
                accept_core(
                    repaired_core,
                    experience_indices=set(experience_indices),
                    project_indices=set(project_indices),
                )
            except Exception as exc:
                mark("provider_timeout" if _is_timeout_exception(exc) else "core_repair_failure")
                warnings.append(_PROVIDER_WARNING)
                if _is_timeout_exception(exc):
                    break

        # Build target keys and deduplicate equal source text before provider calls. Mapping
        # from provider keys back to CV fields stays entirely in this application-side plan.
        plans = _scalar_target_plan(request, localized_fields)
        translation_cache: dict[tuple[str, str], str] = {}
        cache_hits = 0
        localization_failure_details: list[str] = []

        def plan_label(section: str, source_index: int, field: str) -> str:
            return f"{section}[{source_index}].{field}"

        def record_scalar_failure(label: str, reason: str) -> None:
            mark("localization_failure/omission")
            detail = f"{label}:{reason}"
            if detail not in localization_failure_details:
                localization_failure_details.append(detail)

        translation_groups: dict[tuple[str, str], list[dict[str, object]]] = {}
        for plan in plans:
            section = plan.get("section")
            source_index = plan.get("source_index")
            field = plan.get("field")
            source = plan.get("source")
            if (
                not isinstance(section, str)
                or not isinstance(source_index, int)
                or not isinstance(field, str)
                or not isinstance(source, str)
                or not source.strip()
            ):
                mark("localization_target_rejection")
                continue
            cache_key = _translation_cache_key(source, request.locale)
            cached = translation_cache.get(cache_key)
            if cached is not None:
                cache_hits += 1
                rejection = merge_scalar(section, source_index, field, cached)
                if rejection is not None:
                    mark(rejection)
                continue
            group = translation_groups.setdefault(cache_key, [])
            if group:
                # Equal source values are translated once and merged to every target key.
                cache_hits += 1
            group.append(plan)

        unique_plans = [group[0] for group in translation_groups.values()]
        pending: dict[str, dict[str, object]] = {}
        failure_reasons: dict[str, str] = {}
        accepted_plan_keys: set[str] = set()

        def apply_batch_value(plan: Mapping[str, object], value: str) -> str | None:
            source = plan.get("source")
            if not isinstance(source, str):
                return "localization_target_rejection"
            cache_key = _translation_cache_key(source, request.locale)
            first_rejection: str | None = None
            accepted_any = False
            for alias in translation_groups.get(cache_key, [dict(plan)]):
                section = alias.get("section")
                source_index = alias.get("source_index")
                field = alias.get("field")
                if (
                    not isinstance(section, str)
                    or not isinstance(source_index, int)
                    or not isinstance(field, str)
                ):
                    first_rejection = first_rejection or "localization_target_rejection"
                    continue
                rejection = merge_scalar(section, source_index, field, value)
                if rejection is None:
                    accepted_any = True
                else:
                    first_rejection = first_rejection or rejection
                    mark(rejection)
            plan_key = plan.get("key")
            if accepted_any and isinstance(plan_key, str):
                accepted_plan_keys.add(plan_key)
                translation_cache[cache_key] = value
            return None if accepted_any else (first_rejection or "localization_rejection")

        def process_localization_batch(
            batch: Sequence[Mapping[str, object]],
            *,
            retry: bool,
            retry_reasons: Mapping[str, str] | None = None,
        ) -> bool:
            if not batch:
                return False
            requested_keys = {
                key for target in batch if isinstance((key := target.get("key")), str)
            }
            # The static list schema permits a valid one-item answer to a six-item request.
            # Constrain this call's shape, while still validating returned keys locally.
            batch_schema = {
                "type": "object",
                "properties": {
                    "items": {
                        "type": "array",
                        "minItems": len(requested_keys),
                        "maxItems": len(requested_keys),
                        "items": {
                            "type": "object",
                            "properties": {
                                "key": {"type": "string", "enum": sorted(requested_keys)},
                                "text": {"type": "string"},
                            },
                            "required": ["key", "text"],
                            "additionalProperties": False,
                        },
                    }
                },
                "required": ["items"],
                "additionalProperties": False,
            }
            try:
                raw = invoke(
                    render_scalar_batch_prompt(
                        request,
                        batch,
                        retry=retry,
                        retry_reasons=retry_reasons,
                    ),
                    batch_schema,
                    deadline=total_deadline,
                    timeout=(repair_timeout_seconds if retry else chunk_timeout_seconds),
                    call_kind="localization_repair" if retry else "localization_primary",
                    num_predict=_LOCALIZATION_NUM_PREDICT * len(requested_keys),
                )
                values, unknown_count, duplicate_count = _validate_localized_payload(
                    raw, requested_keys
                )
                if unknown_count:
                    mark("localization_unknown_key", unknown_count)
                if duplicate_count:
                    mark("localization_duplicate_key", duplicate_count)
            except TimeoutError as exc:
                reason = (
                    "provider_call_cap"
                    if "cap" in str(exc)
                    else "provider_deadline"
                    if "deadline" in str(exc)
                    else "provider_timeout"
                )
                mark(reason)
                for target in batch:
                    key = target.get("key")
                    if isinstance(key, str):
                        pending[key] = dict(target)
                        failure_reasons[key] = reason
                return False
            except Exception as exc:
                reason = (
                    "schema_validation"
                    if callable(getattr(exc, "errors", None))
                    else "provider_timeout"
                    if _is_timeout_exception(exc)
                    else "provider_exception"
                )
                mark(reason)
                for target in batch:
                    key = target.get("key")
                    if isinstance(key, str):
                        pending[key] = dict(target)
                        failure_reasons[key] = reason
                return True

            for target in batch:
                key = target.get("key")
                if not isinstance(key, str):
                    mark("localization_target_rejection")
                    continue
                value = values.get(key)
                if value is None:
                    pending[key] = dict(target)
                    failure_reasons[key] = "localization_missing"
                    continue
                rejection = apply_batch_value(target, value)
                if rejection is not None:
                    pending[key] = dict(target)
                    failure_reasons[key] = rejection
            for key in tuple(pending):
                if key in accepted_plan_keys:
                    pending.pop(key, None)
                    failure_reasons.pop(key, None)
            return True

        # Primary localization calls use six items by default. A provider response may be
        # partial; retryable unresolved keys get one bounded repair batch. Timeout failures
        # are omitted safely instead of consuming another slow CPU inference call.
        for offset in range(0, len(unique_plans), _LOCALIZATION_CHUNK_SIZE):
            if provider_call_count >= _MAX_PROVIDER_CALLS:
                mark("provider_call_cap")
                for target in unique_plans[offset:]:
                    key = target.get("key")
                    if isinstance(key, str):
                        pending[key] = target
                        failure_reasons[key] = "provider_call_cap"
                break
            if monotonic() >= total_deadline:
                mark("provider_deadline")
                for target in unique_plans[offset:]:
                    key = target.get("key")
                    if isinstance(key, str):
                        pending[key] = target
                        failure_reasons[key] = "provider_deadline"
                break
            process_localization_batch(
                unique_plans[offset : offset + _LOCALIZATION_CHUNK_SIZE],
                retry=False,
            )

        repair_calls = 0
        pending_plans = [
            target
            for target in pending.values()
            if failure_reasons.get(str(target.get("key")))
            not in _NON_RETRYABLE_LOCALIZATION_FAILURES
        ]
        for offset in range(0, len(pending_plans), _REPAIR_CHUNK_SIZE):
            if repair_calls >= _MAX_REPAIR_CALLS:
                break
            if provider_call_count >= _MAX_PROVIDER_CALLS:
                mark("provider_call_cap")
                break
            if monotonic() >= total_deadline:
                mark("provider_deadline")
                break
            repair_batch = pending_plans[offset : offset + _REPAIR_CHUNK_SIZE]
            reasons = {
                key: failure_reasons.get(key, "localization_missing")
                for target in repair_batch
                if isinstance((key := target.get("key")), str)
            }
            process_localization_batch(repair_batch, retry=True, retry_reasons=reasons)
            repair_calls += 1
            for key in tuple(pending):
                if key in accepted_plan_keys:
                    pending.pop(key, None)
                    failure_reasons.pop(key, None)

        def missing_indices() -> tuple[list[int], list[int]]:
            return (
                [
                    index
                    for index, item in enumerate(request.candidate.experience)
                    if index in selected_experience
                    and _entry_has_evidence(item)
                    and not bullets_by_experience.get(index)
                ],
                [
                    index
                    for index, item in enumerate(request.candidate.projects)
                    if index in selected_projects
                    and _entry_has_evidence(item)
                    and not bullets_by_project.get(index)
                ],
            )

        # Failed translations are omitted safely. Only canonical/same-locale values are copied by
        # `_localized_field`; no opposite-locale filler is introduced after bounded repairs.
        final_unresolved_localization = _localization_targets(request, localized_fields)
        if final_unresolved_localization:
            warnings.append(_PROVIDER_WARNING)
        for target in final_unresolved_localization:
            target_section = target.get("section")
            target_source_index = target.get("source_index")
            target_field = target.get("field")
            if (
                isinstance(target_section, str)
                and isinstance(target_source_index, int)
                and isinstance(target_field, str)
            ):
                mark("localization_missing")
                label = plan_label(target_section, target_source_index, target_field)
                target_key = _localization_target_key(
                    target_section, target_source_index, target_field
                )
                if not any(
                    detail.startswith(f"{label}:") for detail in localization_failure_details
                ):
                    record_scalar_failure(label, failure_reasons.get(target_key, "unresolved"))
            else:
                mark("localization_target_rejection")
        if final_unresolved_localization:
            warnings.append(_LOCALIZATION_WARNING)

        action_groups: tuple[
            tuple[str, Sequence[CandidateExperience | CandidateProject], dict[int, list[str]]], ...
        ] = (
            ("experience", request.candidate.experience, bullets_by_experience),
            ("projects", request.candidate.projects, bullets_by_project),
        )
        for section, sources, mapped in action_groups:
            for index, source in enumerate(sources):
                accepted = mapped.get(index, [])
                own_terms = _entry_target_terms(request, source)
                if not accepted or not own_terms:
                    continue
                accepted.sort(key=lambda text: target_priority(text, own_terms))
                if target_priority(accepted[0], own_terms) != (0, 0):
                    continue
                translated = localized_fields.get((section, index, "description"))
                for description, provider_action in (
                    (translated, True),
                    (source.description, False),
                ):
                    selected = []
                    for clause in _split_clauses(description or ""):
                        for action in _shape_bullet(clause):
                            if (
                                len(action) < 10
                                or _is_generic_bullet(action)
                                or target_priority(action, own_terms) == (0, 0)
                                or re.match(
                                    r"^(?:skills?|technologies|tools|tech stack|"
                                    r"kỹ năng|công nghệ)\b",
                                    action,
                                    re.IGNORECASE,
                                )
                                or not _RESPONSIBILITY_ACTION_RE.search(action)
                                or not _is_grounded(
                                    action,
                                    _source_localization_evidence(request, section, index),
                                    locale=request.locale,
                                    preserved_literals=_locale_literals(request.candidate),
                                )
                            ):
                                continue
                            selected.append(action)
                    if selected:
                        selected = sorted(
                            selected, key=lambda text: target_priority(text, own_terms)
                        )[:1]
                        mapped[index] = [*selected, *accepted]
                        if provider_action:
                            provider_used = True
                            mark("target_focus_localized_action", len(selected))
                        else:
                            fallback_used = True
                            mark("target_focus_source_fallback", len(selected))
                        break

        # Same-locale source clauses can be safely shaped as deterministic bullets.
        # Opposite-locale rich prose is never replaced by generic filler.
        for index, experience_source in enumerate(request.candidate.experience):
            if index not in selected_experience:
                continue
            if not bullets_by_experience.get(index):
                rewrites, insufficient = _fallback_bullets(
                    experience_source,
                    locale=request.locale,
                    kind="experience",
                    preserved_literals=_locale_literals(request.candidate),
                )
                if insufficient:
                    warnings.append(_INSUFFICIENT_EVIDENCE_WARNING)
                if rewrites:
                    bullets_by_experience[index] = rewrites[:4]
                    fallback_used = True
        for index, project_source in enumerate(request.candidate.projects):
            if index not in selected_projects:
                continue
            if not bullets_by_project.get(index):
                rewrites, insufficient = _fallback_bullets(
                    project_source,
                    locale=request.locale,
                    kind="project",
                    preserved_literals=_locale_literals(request.candidate),
                )
                if insufficient:
                    warnings.append(_INSUFFICIENT_EVIDENCE_WARNING)
                if rewrites:
                    bullets_by_project[index] = rewrites[:4]
                    fallback_used = True

        for descriptions, mapped_bullets in (
            ([entry.description for entry in request.candidate.experience], bullets_by_experience),
            ([entry.description for entry in request.candidate.projects], bullets_by_project),
        ):
            for index, description in enumerate(descriptions):
                if index not in (
                    selected_experience
                    if mapped_bullets is bullets_by_experience
                    else selected_projects
                ):
                    continue
                missing_salient = _salient_anchors(description or "") - _salient_anchors(
                    " ".join(mapped_bullets.get(index, []))
                )
                if not missing_salient:
                    continue
                mark("missing_salient_anchor", len(missing_salient))
                source_bullets = [
                    bullet
                    for clause in _split_clauses(description or "")
                    for bullet in _shape_bullet(clause)
                    if _salient_anchors(bullet) & missing_salient
                    and _is_grounded(
                        bullet,
                        [description or ""],
                        locale=request.locale,
                        preserved_literals=_locale_literals(request.candidate),
                    )
                ]
                if source_bullets:
                    # Keep salient source facts before the existing ten-bullet cap.
                    mapped_bullets[index] = [*source_bullets, *mapped_bullets.get(index, [])]
                    fallback_used = True
                    mark("salient_anchor_fallback", len(source_bullets))

        bullets_by_experience = {
            key: sorted(
                _dedupe_texts(
                    sorted(value, key=lambda text: not bool(_salient_anchors(text))), limit=10
                ),
                key=lambda text: target_priority(
                    text, _entry_target_terms(request, request.candidate.experience[key])
                ),
            )
            for key, value in bullets_by_experience.items()
        }
        bullets_by_project = {
            key: sorted(
                _dedupe_texts(
                    sorted(value, key=lambda text: not bool(_salient_anchors(text))), limit=10
                ),
                key=lambda text: target_priority(
                    text, _entry_target_terms(request, request.candidate.projects[key])
                ),
            )
            for key, value in bullets_by_project.items()
        }
        remaining_experience, remaining_projects = missing_indices()
        if remaining_experience or remaining_projects:
            omitted_count = len(remaining_experience) + len(remaining_projects)
            mark("repair_failure/omission", omitted_count)
            warnings.append(_RICH_OMISSION_WARNING)

        draft_projects: list[DraftProject] = []
        for index in selected_projects:
            project = request.candidate.projects[index]
            project_values = project.model_dump()
            project_name = _localized_field(
                request, localized_fields, "projects", index, "project_name"
            )
            project_values.update(
                {
                    "project_name": project_name
                    or (
                        f"Dự án {index + 1}"
                        if request.locale.casefold().startswith("vi")
                        else f"Project {index + 1}"
                    ),
                    "role": _localized_field(request, localized_fields, "projects", index, "role"),
                    "description": _localized_field(
                        request, localized_fields, "projects", index, "description"
                    ),
                }
            )
            draft_projects.append(
                DraftProject(
                    **project_values, source_index=index, bullets=bullets_by_project.get(index, [])
                )
            )

        draft_experience: list[DraftExperience] = []
        for index in selected_experience:
            experience = request.candidate.experience[index]
            experience_values = experience.model_dump()
            experience_values.update(
                {
                    "position": _localized_field(
                        request, localized_fields, "experience", index, "position"
                    ),
                    "description": _localized_field(
                        request, localized_fields, "experience", index, "description"
                    ),
                }
            )
            draft_experience.append(
                DraftExperience(
                    **experience_values,
                    source_index=index,
                    bullets=bullets_by_experience.get(index, []),
                )
            )

        localized_education: list[CandidateEducation] = []
        for index, education in enumerate(request.candidate.education):
            education_values = education.model_dump()
            education_values.update(
                {
                    "degree": _localized_field(
                        request, localized_fields, "education", index, "degree"
                    ),
                    "major": _localized_field(
                        request, localized_fields, "education", index, "major"
                    ),
                    "description": _localized_field(
                        request, localized_fields, "education", index, "description"
                    ),
                }
            )
            localized_education.append(CandidateEducation(**education_values))

        objective_value = _localized_field(
            request, localized_fields, "objective", 0, "career_objective"
        ) or _fallback_objective(request.candidate, request.locale)
        objective_omitted = bool(request.candidate.career_objective and not objective_value)
        if objective_omitted:
            warnings.append(_OBJECTIVE_OMISSION_WARNING)
        if provider_used:
            warnings.append(_PROVIDER_PROVENANCE)
        if localization_provider_used:
            warnings.append(_LOCALIZATION_PROVENANCE)
        if fallback_used:
            _LOGGER.warning(
                "cv_generation_fallback request_id=%s trace_id=%s model=%s fallback_reason=%s",
                request.identity.request_id,
                request.identity.trace_id,
                getattr(self._provider, "model_name", getattr(self._provider, "_model", "unknown")),
                (
                    "salient_anchor_supplementation"
                    if provider_used and diagnostics["salient_anchor_fallback"]
                    else "partial_grounded_provider_bullets"
                    if provider_used
                    else "no_grounded_provider_bullets"
                ),
            )
            warnings.append(_FALLBACK_WARNING)
            warnings.append(_FALLBACK_PROVENANCE)
        elapsed_seconds = monotonic() - started_at
        self.last_metrics = {
            "provider_calls": provider_call_count,
            "provider_elapsed_ms": round(provider_elapsed_seconds * 1000, 2),
            "provider_call_latencies_ms": provider_call_latencies_ms,
            "provider_call_kinds": provider_call_kinds,
            "provider_timeout_count": len(provider_timeout_kinds),
            "provider_timeout_kinds": provider_timeout_kinds,
            "total_elapsed_ms": round(elapsed_seconds * 1000, 2),
            "deadline_seconds": total_timeout_seconds,
            "core_timeout_seconds": core_timeout_seconds,
            "chunk_timeout_seconds": chunk_timeout_seconds,
            "repair_timeout_seconds": repair_timeout_seconds,
            "deadline_exceeded": elapsed_seconds >= total_timeout_seconds
            or diagnostics.get("provider_deadline", 0) > 0,
            "call_cap": _MAX_PROVIDER_CALLS,
            "cache_hits": cache_hits,
            "localization_targets": len(plans),
            "localization_unique_targets": len(unique_plans),
            "localization_primary_chunks": (
                (len(unique_plans) + _LOCALIZATION_CHUNK_SIZE - 1) // _LOCALIZATION_CHUNK_SIZE
            ),
            "localization_repair_calls": repair_calls,
            "localization_unresolved": len(final_unresolved_localization),
        }
        if diagnostics:
            _LOGGER.info(
                "cv_generation_diagnostics request_id=%s trace_id=%s provider_calls=%s "
                "provider_elapsed_ms=%.2f total_elapsed_ms=%.2f codes=%s",
                request.identity.request_id,
                request.identity.trace_id,
                provider_call_count,
                provider_elapsed_seconds * 1000,
                elapsed_seconds * 1000,
                ",".join(f"{code}:{count}" for code, count in sorted(diagnostics.items())),
            )
            warnings.extend(
                f"cv_generation.diagnostic={code}:count={count}"
                for code, count in sorted(diagnostics.items())
            )
        if localization_failure_details:
            omission_prefix = "cv_generation.localization_omission="
            current = omission_prefix
            for detail in localization_failure_details:
                candidate = detail if current == omission_prefix else f"; {detail}"
                if len(current) + len(candidate) > 480:
                    warnings.append(current)
                    current = omission_prefix + detail
                else:
                    current += candidate
            if current != omission_prefix:
                warnings.append(current)
        application_position = _localized_field(
            request, localized_fields, "headline", 0, "headline"
        )
        if application_role:
            application_position = application_heading
            candidate_text = " ".join(
                [
                    *request.candidate.skills,
                    *(entry.description or "" for entry in request.candidate.experience),
                    *(entry.description or "" for entry in request.candidate.projects),
                    *(
                        technology
                        for entry in request.candidate.projects
                        for technology in entry.technologies
                    ),
                ]
            )
            supported_skills = [
                skill
                for skill in dict.fromkeys(
                    _target_skill_literal(value)
                    for value in [*request.job.required_skills, *request.job.preferred_skills]
                )
                if _stable_source_text(skill)
                and re.search(_target_skill_pattern(skill), candidate_text, re.IGNORECASE)
            ]
            gaps = [
                skill
                for skill in request.job.required_skills
                if not re.search(
                    _target_skill_pattern(skill),
                    candidate_text,
                    re.IGNORECASE,
                )
            ]
            if gaps:
                warnings.append("cv_generation.target_skill_gaps=" + ", ".join(gaps)[:440])
            if request.locale.casefold().startswith("vi"):
                objective_value = f"Ứng tuyển vị trí {application_role}."
                if supported_skills:
                    objective_value += (
                        f" Mong muốn vận dụng kinh nghiệm với {', '.join(supported_skills[:4])} "
                        "để đóng góp trong vai trò này."
                    )
            else:
                objective_value = f"Applying for the {application_role} role."
                if supported_skills:
                    objective_value += (
                        f" Seeking to contribute experience with {', '.join(supported_skills[:4])} "
                        "in this role."
                    )
        omitted_skill_members = sum(
            _skill_member_display(request, source) is None
            for source in request.candidate.skills
            if _skill_member_is_relevant(request, source)
        )
        if omitted_skill_members:
            warnings.insert(
                0,
                "cv_generation.diagnostic=skill_member_locale_omission:count="
                + str(omitted_skill_members),
            )
        unique_warnings = list(dict.fromkeys(warnings))[:20]
        return CvDraft(
            request_id=request.identity.request_id,
            trace_id=request.identity.trace_id,
            operation_attempt_id=request.identity.operation_attempt_id,
            candidate_id=request.candidate.candidate_id,
            target_job_id=request.job.job_id,
            template_type=request.template_type,
            full_name=request.candidate.full_name,
            title=(
                f"Hồ sơ - {request.candidate.full_name}"
                if request.locale.casefold().startswith("vi")
                else f"CV - {request.candidate.full_name}"
            ),
            position=application_position,
            email=request.candidate.email,
            phone=request.candidate.phone,
            link=request.candidate.link,
            address=request.candidate.address,
            career_objective=objective_value,
            education=localized_education,
            projects=draft_projects,
            work_experience=draft_experience,
            skills=_group_skills(request),
            activities=_localized_text_list(
                request, localized_fields, "activities", request.candidate.activities
            ),
            certificates=_localized_text_list(
                request, localized_fields, "certificates", request.candidate.certificates
            ),
            awards=_localized_text_list(
                request, localized_fields, "awards", request.candidate.awards
            ),
            warnings=unique_warnings,
            source_version=request.source_version,
            content_version=request.content_version,
        )
