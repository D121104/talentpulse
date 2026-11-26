from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import replace
from pathlib import Path
from string import Template
from time import monotonic
from uuid import uuid4

from pydantic import ValidationError

from talentpulse_ai.agent_foundation.contracts import (
    AgentDefinition,
    AgentErrorCode,
    AgentRequest,
    AgentStatus,
    ExecutionPolicy,
    FinalDecision,
    ModelDecision,
    ToolCallDecision,
)
from talentpulse_ai.agent_foundation.execution import AgentModelPort, execute_agent
from talentpulse_ai.agent_foundation.model import AgentModelError
from talentpulse_ai.agent_foundation.observability import record_execution_observation
from talentpulse_ai.agent_foundation.tools import ToolDispatcher, ToolRegistry
from talentpulse_ai.core.exceptions import ProviderFailure, ServiceError
from talentpulse_ai.core.logging import (
    agent_response_shape,
    log_ai_agent_validation_failure,
    log_ai_provider_failure,
    validation_error_summary,
)
from talentpulse_ai.modules.rag_chatbot.agent_tools import (
    build_matching_evidence_tool,
    build_retrieval_context_authorizer,
    build_retrieval_context_tool,
    build_skill_framework_tool,
)
from talentpulse_ai.modules.rag_chatbot.generation.generator import (
    GenerationService,
)
from talentpulse_ai.modules.rag_chatbot.generation.locale import _effective_locale
from talentpulse_ai.modules.rag_chatbot.generation.prompt_builder import (
    ComparisonExplanation,
    render_repair_prompt,
)
from talentpulse_ai.modules.rag_chatbot.schemas import (
    AgentAnswer,
    AgentCvAnswer,
    RagGenerateRequest,
    RagGenerateResponse,
)

_PROMPT_TEMPLATE = Template(
    Path(__file__)
    .with_name("prompts")
    .joinpath("career_chat_agent_v1.txt")
    .read_text(encoding="utf-8")
)
_CAPABILITY_ID = "rag.generate"
_EXECUTION_POLICY = ExecutionPolicy(
    max_steps=8,
    max_model_calls=4,
    max_tool_calls=2,
    timeout_seconds=24.0,
)


class _GroundingModel:
    def __init__(self, model: AgentModelPort, request: RagGenerateRequest) -> None:
        self.provider = model
        self._request = request
        self._model_calls = 0
        self._tool_calls = 0
        self._repair_attempted = False

    @property
    def model_calls(self) -> int:
        return self._model_calls

    def decide(
        self,
        prompt: str,
        *,
        timeout: float | None = None,
        final_output_schema: Mapping[str, object] | None = None,
        tool_input_schemas: Mapping[str, Mapping[str, object]] | None = None,
        allow_text_recovery: bool = False,
    ) -> ModelDecision:
        started_at = monotonic()
        try:
            decision = self._call_model(
                prompt,
                timeout,
                final_output_schema,
                tool_input_schemas,
                allow_text_recovery and self._tool_calls > 0,
            )
        except AgentModelError as error:
            if error.code is not AgentErrorCode.OUTPUT_INVALID:
                raise
            return self._repair(
                prompt,
                "invalid_schema",
                timeout,
                started_at,
                final_output_schema,
                tool_input_schemas,
                allow_text_recovery and self._tool_calls > 0,
            )

        if not isinstance(decision, FinalDecision):
            return decision
        try:
            normalized = GenerationService.validate_agent_output(self._request, decision.output)
        except (TypeError, ValueError) as error:
            log_ai_agent_validation_failure(
                stage="final_output",
                request_id=self._request.identity.request_id,
                trace_id=self._request.identity.trace_id,
                attempt_index=self._model_calls,
                validation_errors=(
                    validation_error_summary(error)
                    if isinstance(error, ValidationError)
                    else "contract:rejected"
                ),
                response_shape=agent_response_shape({"kind": "final", "output": decision.output}),
            )
            return self._repair(
                prompt,
                "invalid_output",
                timeout,
                started_at,
                final_output_schema,
                tool_input_schemas,
                allow_text_recovery and self._tool_calls > 0,
            )
        if self._request.intent == "CV_JOB_COMPARISON":
            return decision
        return decision.model_copy(update={"output": normalized.model_dump(mode="json")})

    def _call_model(
        self,
        prompt: str,
        timeout: float | None,
        final_output_schema: Mapping[str, object] | None = None,
        tool_input_schemas: Mapping[str, Mapping[str, object]] | None = None,
        allow_text_recovery: bool = False,
    ) -> ModelDecision:
        if self._model_calls >= _EXECUTION_POLICY.max_model_calls:
            raise AgentModelError(
                AgentErrorCode.EXECUTION_LIMIT_EXCEEDED,
                "Model call limit has been reached.",
            )
        self._model_calls += 1
        try:
            decision = self.provider.decide(
                prompt,
                timeout=timeout,
                final_output_schema=final_output_schema,
                tool_input_schemas=tool_input_schemas,
                allow_text_recovery=allow_text_recovery,
            )
        except ProviderFailure as exc:
            if exc.details is not None:
                log_ai_provider_failure(
                    details=exc.details,
                    capability="rag_chat",
                    operation="agent_model",
                    attempt="agent_model",
                    request_id=self._request.identity.request_id,
                    trace_id=self._request.identity.trace_id,
                    attempt_index=self._model_calls,
                )
            raise AgentModelError(
                AgentErrorCode.PROVIDER_ERROR,
                "Model provider request failed.",
                details=exc.details,
                attempt_index=self._model_calls,
            ) from None
        except AgentModelError as error:
            error.attempt_index = self._model_calls
            if error.details is not None:
                log_ai_provider_failure(
                    details=error.details,
                    capability="rag_chat",
                    operation="agent_model",
                    attempt="agent_model",
                    request_id=self._request.identity.request_id,
                    trace_id=self._request.identity.trace_id,
                    attempt_index=self._model_calls,
                    validation_errors=error.validation_errors,
                    response_shape=error.response_shape,
                )
            raise
        if isinstance(decision, ToolCallDecision):
            self._tool_calls += 1
        return decision

    def _repair(
        self,
        prompt: str,
        code: str,
        timeout: float | None,
        started_at: float,
        final_output_schema: Mapping[str, object] | None,
        tool_input_schemas: Mapping[str, Mapping[str, object]] | None,
        allow_text_recovery: bool,
    ) -> FinalDecision:
        remaining = None if timeout is None else timeout - (monotonic() - started_at)
        if (
            self._repair_attempted
            or self._model_calls >= _EXECUTION_POLICY.max_model_calls
            or 1 + self._model_calls + self._tool_calls + 1 > _EXECUTION_POLICY.max_steps
            or remaining is None
            or remaining <= 0
        ):
            raise AgentModelError(
                AgentErrorCode.OUTPUT_INVALID,
                "Model output could not be validated within the execution budget.",
            )

        self._repair_attempted = True
        repaired = self._call_model(
            render_repair_prompt(prompt, self._request, code),
            remaining,
            final_output_schema,
            tool_input_schemas,
            allow_text_recovery,
        )
        if not isinstance(repaired, FinalDecision):
            log_ai_agent_validation_failure(
                stage="repair_decision",
                request_id=self._request.identity.request_id,
                trace_id=self._request.identity.trace_id,
                attempt_index=self._model_calls,
                validation_errors="decision:not_final",
                response_shape=agent_response_shape(repaired.model_dump(mode="python")),
            )
            raise AgentModelError(
                AgentErrorCode.OUTPUT_INVALID,
                "Model repair did not return a final answer.",
            )
        try:
            normalized = GenerationService.validate_agent_output(self._request, repaired.output)
        except (TypeError, ValueError) as error:
            log_ai_agent_validation_failure(
                stage="repair_output",
                request_id=self._request.identity.request_id,
                trace_id=self._request.identity.trace_id,
                attempt_index=self._model_calls,
                validation_errors=(
                    validation_error_summary(error)
                    if isinstance(error, ValidationError)
                    else "contract:rejected"
                ),
                response_shape=agent_response_shape({"kind": "final", "output": repaired.output}),
            )
            raise AgentModelError(
                AgentErrorCode.OUTPUT_INVALID,
                "Model repair output could not be validated.",
            ) from None
        if self._request.intent == "CV_JOB_COMPARISON":
            return repaired
        return repaired.model_copy(update={"output": normalized.model_dump(mode="json")})


def build_agent_request(request: RagGenerateRequest) -> AgentRequest:
    """Build an isolated Foundation request from only this RAG request's context."""
    context = {
        "mode": request.intent,
        "locale": request.locale,
        "recent_history": request.recent_history[:8],
        "user_message": request.normalized_user_message,
    }
    encoded_context = json.dumps(context, ensure_ascii=False, separators=(",", ":"))
    encoded_context = (
        encoded_context.replace("&", r"\u0026").replace("<", r"\u003c").replace(">", r"\u003e")
    )
    prompt = _PROMPT_TEMPLATE.substitute(
        locale=_effective_locale(request),
        mode=request.intent,
        context=encoded_context,
    )
    return AgentRequest(
        run_id=uuid4(),
        correlation_id=str(request.identity.trace_id),
        capability_id=_CAPABILITY_ID,
        prompt=prompt,
        input={"intent": request.intent, "locale": request.locale},
        authorized_context={"rag_request": request},
        locale=request.locale,
    )


class CareerChatAgent:
    def __init__(self, model: AgentModelPort) -> None:
        self._model = model
        self._tool_dispatcher = ToolDispatcher(
            ToolRegistry(
                (
                    build_retrieval_context_tool(),
                    build_matching_evidence_tool(),
                    build_skill_framework_tool(),
                )
            ),
            build_retrieval_context_authorizer(),
        )
        self._definition = AgentDefinition(
            capability_id=_CAPABILITY_ID,
            model_profile="career-chat",
            output_model=AgentAnswer,
            tool_allowlist=frozenset({"rag.retrieve_context"}),
            execution_policy=_EXECUTION_POLICY,
        )
        self._advice_definition = AgentDefinition(
            capability_id=_CAPABILITY_ID,
            model_profile="career-chat",
            output_model=AgentAnswer,
            tool_allowlist=frozenset({"rag.retrieve_context", "career.lookup_skill_framework"}),
            execution_policy=_EXECUTION_POLICY,
        )

    def _definition_for(self, request: RagGenerateRequest) -> AgentDefinition:
        if request.intent == "CV_ANALYSIS":
            return AgentDefinition(
                capability_id=_CAPABILITY_ID,
                model_profile="career-chat",
                output_model=AgentCvAnswer,
                tool_allowlist=frozenset({"rag.retrieve_context"}),
                execution_policy=_EXECUTION_POLICY,
            )
        if request.intent != "CV_JOB_COMPARISON":
            if request.intent == "ADVICE":
                return self._advice_definition
            return self._definition
        return AgentDefinition(
            capability_id=_CAPABILITY_ID,
            model_profile="career-chat",
            output_model=ComparisonExplanation,
            tool_allowlist=frozenset({"rag.retrieve_context", "career.read_matching_evidence"}),
            execution_policy=_EXECUTION_POLICY,
        )

    def generate(self, request: RagGenerateRequest) -> RagGenerateResponse:
        agent_request = build_agent_request(request)
        model = _GroundingModel(self._model, request)
        definition = self._definition_for(request)
        if getattr(self._model, "supports_structured_outputs", False) is True:
            definition = replace(
                definition,
                execution_policy=replace(definition.execution_policy, timeout_seconds=125.0),
            )
        try:
            result = execute_agent(
                agent_request,
                definition,
                model,
                tool_dispatcher=self._tool_dispatcher,
            )
        except ProviderFailure:
            raise ServiceError(
                "generation_unavailable",
                "Career assistant is temporarily unavailable.",
                503,
            ) from None
        if result.usage.model_calls < model.model_calls:
            result = result.model_copy(
                update={"usage": result.usage.model_copy(update={"model_calls": model.model_calls})}
            )
        record_execution_observation(result)
        if result.status is not AgentStatus.COMPLETE or result.output is None:
            error_code = result.error.code if result.error is not None else None
            if error_code is AgentErrorCode.PROVIDER_ERROR:
                return GenerationService._fallback(request, degraded=True, reason="provider_error")
            if error_code is AgentErrorCode.EXECUTION_LIMIT_EXCEEDED:
                raise ServiceError(
                    "generation_timeout",
                    "Career assistant request exceeded its execution budget.",
                    504,
                )
            if error_code is AgentErrorCode.PERMISSION_DENIED:
                raise ServiceError(
                    "generation_not_authorized",
                    "Career assistant action is not authorized.",
                    403,
                )
            if error_code is AgentErrorCode.INVALID_INPUT:
                raise ServiceError(
                    "generation_invalid_request",
                    "Career assistant request is invalid.",
                    400,
                )
            raise ServiceError(
                "generation_unavailable",
                "Career assistant is temporarily unavailable.",
                503,
            )
        response = GenerationService.finalize_agent_output(request, result.output)
        return response
