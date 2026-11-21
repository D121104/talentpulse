from __future__ import annotations

import hashlib
import json
import logging
from collections.abc import Mapping
from dataclasses import replace
from math import isfinite
from time import perf_counter
from uuid import uuid4

from pydantic import BaseModel, ValidationError

from talentpulse_ai.agent_foundation.contracts import (
    AgentDefinition,
    AgentErrorCode,
    AgentRequest,
    AgentStatus,
    ExecutionPolicy,
)
from talentpulse_ai.agent_foundation.execution import AgentModelPort, execute_agent
from talentpulse_ai.agent_foundation.tools import (
    ToolAuthorizer,
    ToolDefinition,
    ToolDispatcher,
    ToolExecutionContext,
    ToolRegistry,
    ToolSideEffect,
)
from talentpulse_ai.core.exceptions import ServiceError
from talentpulse_ai.modules.cv_generator.schemas import (
    CvDraft,
    CvDraftRequest,
    CvGenerationReceipt,
    GenerateDraftToolInput,
    SafeGenerationWarning,
)
from talentpulse_ai.modules.cv_generator.service import (
    CvDraftGenerationService,
    CvDraftReviewResult,
)

CV_GENERATION_CAPABILITY_ID = "cv_generation"
CV_GENERATION_TOOL_ID = "cv.generate_draft"
CV_GENERATION_OPERATION = "cv.generate"
_CV_GENERATION_PROMPT = (
    "Use the single authorized CV generation tool exactly once. Return only the validated "
    "generation receipt from that tool. Never include CV content, personal data, or source "
    "facts in the final answer."
)
_EXECUTION_POLICY = ExecutionPolicy(
    max_steps=4,
    max_model_calls=2,
    max_tool_calls=1,
    timeout_seconds=300.0,
)
_LOGGER = logging.getLogger("uvicorn.error")


def _resolve_draft_path(draft: Mapping[str, object], path: str) -> object:
    value: object = draft
    for part in path.strip("/").split("/"):
        if isinstance(value, list):
            if not part.isdecimal() or int(part) >= len(value):
                return None
            value = value[int(part)]
        elif isinstance(value, Mapping):
            if part not in value:
                return None
            value = value[part]
        else:
            return None
    return value


class CvGenerationToolAuthorizer:
    """Accept only the application-owned, consented CV generation operation."""

    def is_authorized(self, request: AgentRequest, operation: str) -> bool:
        context = request.authorized_context
        return (
            request.capability_id == CV_GENERATION_CAPABILITY_ID
            and operation == CV_GENERATION_OPERATION
            and context.get("required_operation") == CV_GENERATION_OPERATION
            and isinstance(context.get("cv_draft_request"), Mapping)
            and isinstance(context.get("consent_version"), str)
            and bool(context.get("consent_version"))
        )


class _CvGenerationToolRun:
    """Per-run tool handler and holder for the draft and its receipt."""

    def __init__(self, service: CvDraftGenerationService, request: CvDraftRequest) -> None:
        self._service = service
        self._request = request
        self.review_result: CvDraftReviewResult | None = None
        self.receipt: CvGenerationReceipt | None = None
        self.service_error: ServiceError | None = None

    def __call__(self, _tool_input: BaseModel, context: ToolExecutionContext) -> object:
        authorized_request = context.authorized_context.get("cv_draft_request")
        if not isinstance(authorized_request, Mapping):
            raise ValueError("Authorized CV request is missing.")
        tool_request = CvDraftRequest.model_validate(authorized_request)
        if tool_request != self._request:
            raise ValueError("Authorized CV request does not match this execution.")

        try:
            review_result = self._service.generate_with_review(
                tool_request,
                timeout_seconds=context.timeout_seconds,
            )
        except ServiceError as exc:
            self.service_error = exc
            raise
        CvGenerationAgent._validate_draft_for_request(review_result.draft, tool_request)
        CvGenerationAgent._validate_review_metadata(review_result)
        receipt = CvGenerationAgent._receipt_for(review_result, tool_request)
        self.review_result = review_result
        self.receipt = receipt
        return receipt.model_dump(mode="json")


class CvGenerationAgent:
    def __init__(
        self,
        service: CvDraftGenerationService,
        model: AgentModelPort,
        *,
        tool_authorizer: ToolAuthorizer | None = None,
    ) -> None:
        self._service = service
        self._model = model
        self._tool_authorizer = tool_authorizer or CvGenerationToolAuthorizer()

    def generate_with_review(
        self, request: CvDraftRequest, *, timeout_seconds: float | None = None
    ) -> CvDraftReviewResult:
        started_at = perf_counter()
        if timeout_seconds is not None and (not isfinite(timeout_seconds) or timeout_seconds <= 0):
            self._log_observation(
                request,
                run_id=str(uuid4()),
                status="FAILED",
                review_status="FAILED",
                duration_ms=0,
                steps=0,
                model_calls=0,
                tool_calls=0,
                error_type=AgentErrorCode.EXECUTION_LIMIT_EXCEEDED.value,
            )
            raise ServiceError("cv_generation_timeout", "CV generation deadline was reached.", 504)
        policy = replace(
            _EXECUTION_POLICY,
            timeout_seconds=min(timeout_seconds, _EXECUTION_POLICY.timeout_seconds)
            if timeout_seconds is not None
            else _EXECUTION_POLICY.timeout_seconds,
        )
        tool_run = _CvGenerationToolRun(self._service, request)
        request_payload = request.model_dump(mode="json")
        tool = ToolDefinition(
            tool_id=CV_GENERATION_TOOL_ID,
            description="Generate a grounded CV draft from the authorized source snapshot.",
            input_model=GenerateDraftToolInput,
            output_model=CvGenerationReceipt,
            allowed_capabilities=frozenset({CV_GENERATION_CAPABILITY_ID}),
            required_operation=CV_GENERATION_OPERATION,
            timeout_seconds=policy.timeout_seconds,
            side_effect_class=ToolSideEffect.READ_ONLY,
            handler=tool_run,
        )
        agent_request = AgentRequest(
            run_id=uuid4(),
            correlation_id=str(request.identity.trace_id),
            capability_id=CV_GENERATION_CAPABILITY_ID,
            prompt=_CV_GENERATION_PROMPT,
            input={
                "operation_attempt_id": str(request.identity.operation_attempt_id),
                "source_version": request.source_version,
                "content_version": request.content_version,
                "consent_version": request.consent_version,
                "template_type": request.template_type,
                "locale": request.locale,
            },
            authorized_context={
                "required_operation": CV_GENERATION_OPERATION,
                "consent_version": request.consent_version,
                "cv_draft_request": request_payload,
            },
            locale=request.locale,
        )
        definition = AgentDefinition(
            capability_id=CV_GENERATION_CAPABILITY_ID,
            model_profile=CV_GENERATION_CAPABILITY_ID,
            output_model=CvGenerationReceipt,
            system_instructions=_CV_GENERATION_PROMPT,
            tool_allowlist=frozenset({CV_GENERATION_TOOL_ID}),
            execution_policy=policy,
        )
        result = execute_agent(
            agent_request,
            definition,
            self._model,
            tool_dispatcher=ToolDispatcher(ToolRegistry((tool,)), self._tool_authorizer),
        )
        tool_review = tool_run.review_result
        self._log_observation(
            request,
            run_id=str(result.run_id),
            status=result.status.value,
            review_status="PENDING_REVIEW" if tool_review is not None else "FAILED",
            duration_ms=max(0, int((perf_counter() - started_at) * 1000)),
            steps=result.usage.steps,
            model_calls=result.usage.model_calls,
            tool_calls=result.usage.tool_calls,
            error_type=result.error.code.value if result.error is not None else "none",
        )

        if result.status is not AgentStatus.COMPLETE or result.error is not None:
            if tool_run.service_error is not None:
                error = tool_run.service_error
                if error.code == "cv_generation_timeout" or error.status_code == 504:
                    raise ServiceError(
                        "cv_generation_timeout", "CV generation exceeded its time limit.", 504
                    )
                if error.code == "invalid_cv_request" or error.status_code == 422:
                    raise ServiceError(
                        "invalid_cv_request", "The CV generation request is invalid.", 422
                    )
                raise ServiceError(
                    "cv_generation_failed", "CV generation could not be completed.", 503
                )
            if result.error is not None and result.error.code is AgentErrorCode.PERMISSION_DENIED:
                raise ServiceError("permission_denied", "CV generation is not authorized.", 403)
            if result.error is not None and result.error.code is AgentErrorCode.OUTPUT_INVALID:
                raise ServiceError(
                    "cv_generation_receipt_invalid",
                    "CV generation result could not be verified.",
                    502,
                )
            if (
                result.error is not None
                and result.error.code is AgentErrorCode.EXECUTION_LIMIT_EXCEEDED
            ):
                raise ServiceError(
                    "cv_generation_timeout", "CV generation exceeded its time limit.", 504
                )
            raise ServiceError("cv_generation_failed", "CV generation could not be completed.", 503)
        if result.usage.tool_calls != 1 or result.output is None:
            raise ServiceError(
                "cv_generation_receipt_invalid", "CV generation result could not be verified.", 502
            )
        try:
            receipt = CvGenerationReceipt.model_validate(result.output)
        except ValidationError:
            raise ServiceError(
                "cv_generation_receipt_invalid", "CV generation result could not be verified.", 502
            ) from None

        review_result = tool_run.review_result
        expected_receipt = tool_run.receipt
        if (
            not isinstance(review_result, CvDraftReviewResult)
            or not isinstance(expected_receipt, CvGenerationReceipt)
            or receipt != expected_receipt
            or receipt.operation_attempt_id != request.identity.operation_attempt_id
            or receipt.source_version != request.source_version
            or receipt.content_version != request.content_version
            or receipt.draft_hash != self._draft_hash(review_result.draft)
        ):
            raise ServiceError(
                "cv_generation_receipt_invalid", "CV generation result could not be verified.", 502
            )
        return review_result

    @staticmethod
    def _log_observation(
        request: CvDraftRequest,
        *,
        run_id: str,
        status: str,
        review_status: str,
        duration_ms: int,
        steps: int,
        model_calls: int,
        tool_calls: int,
        error_type: str,
    ) -> None:
        _LOGGER.info(
            "cv_generation_observation run_id=%s request_id=%s trace_id=%s "
            "correlation_id=%s operation_attempt_id=%s capability_id=%s "
            "implementation=agent status=%s review_status=%s duration_ms=%d "
            "steps=%d model_calls=%d tool_calls=%d error_type=%s",
            run_id,
            request.identity.request_id,
            request.identity.trace_id,
            request.identity.trace_id,
            request.identity.operation_attempt_id,
            CV_GENERATION_CAPABILITY_ID,
            status,
            review_status,
            duration_ms,
            steps,
            model_calls,
            tool_calls,
            error_type,
        )

    @staticmethod
    def _draft_hash(draft: CvDraft) -> str:
        canonical = json.dumps(
            draft.model_dump(mode="json"),
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
        return hashlib.sha256(canonical).hexdigest()

    @classmethod
    def _receipt_for(
        cls, result: CvDraftReviewResult, request: CvDraftRequest
    ) -> CvGenerationReceipt:
        warning_codes = {
            origin
            for origin in result.review_metadata.field_origins_by_path.values()
            if origin == "FALLBACK"
        }
        warnings: list[SafeGenerationWarning] = ["FALLBACK_USED"] if warning_codes else []
        for omission in result.review_metadata.omissions_by_path:
            if omission.reason_code not in warnings:
                warnings.append(omission.reason_code)
        return CvGenerationReceipt(
            status="GENERATED",
            operation_attempt_id=request.identity.operation_attempt_id,
            source_version=request.source_version,
            content_version=request.content_version,
            receipt_id=uuid4(),
            draft_hash=cls._draft_hash(result.draft),
            warnings=warnings,
        )

    @staticmethod
    def _validate_draft_for_request(draft: CvDraft, request: CvDraftRequest) -> None:
        if (
            draft.request_id != request.identity.request_id
            or draft.trace_id != request.identity.trace_id
            or draft.operation_attempt_id != request.identity.operation_attempt_id
            or draft.candidate_id != request.candidate.candidate_id
            or draft.target_job_id != request.job.job_id
            or draft.template_type != request.template_type
            or draft.source_version != request.source_version
            or draft.content_version != request.content_version
        ):
            raise ValueError("Generated draft does not match its authorized request.")

    @staticmethod
    def _validate_review_metadata(result: CvDraftReviewResult) -> None:
        metadata = result.review_metadata
        if not metadata.field_origins_by_path:
            raise ValueError("CV generation has no safe reviewable content.")

        draft = result.draft.model_dump(mode="json")

        for path in metadata.field_origins_by_path:
            value = _resolve_draft_path(draft, path)
            if value is None or value == "" or value == []:
                raise ValueError("CV review provenance points to missing content.")

        referenced_paths = metadata.source_refs_by_path
        for omission in metadata.omissions_by_path:
            if omission.path in metadata.field_origins_by_path or not referenced_paths.get(
                omission.path
            ):
                raise ValueError("CV omission metadata is inconsistent.")
