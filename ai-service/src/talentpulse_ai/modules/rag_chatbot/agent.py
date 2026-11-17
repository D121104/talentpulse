from __future__ import annotations

import json
from pathlib import Path
from string import Template
from time import monotonic
from uuid import uuid4

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
from talentpulse_ai.modules.rag_chatbot.agent_tools import (
    build_matching_evidence_tool,
    build_retrieval_context_authorizer,
    build_retrieval_context_tool,
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
    ProviderGeneration,
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

    def decide(self, prompt: str, *, timeout: float | None = None) -> ModelDecision:
        started_at = monotonic()
        try:
            decision = self._call_model(prompt, timeout)
        except AgentModelError as error:
            if error.code is not AgentErrorCode.OUTPUT_INVALID:
                raise
            return self._repair(prompt, "invalid_schema", timeout, started_at)

        if not isinstance(decision, FinalDecision):
            return decision
        try:
            normalized = GenerationService.validate_agent_output(self._request, decision.output)
        except (TypeError, ValueError):
            return self._repair(prompt, "invalid_output", timeout, started_at)
        if self._request.intent == "CV_JOB_COMPARISON":
            return decision
        return decision.model_copy(update={"output": normalized.model_dump(mode="json")})

    def _call_model(self, prompt: str, timeout: float | None) -> ModelDecision:
        if self._model_calls >= _EXECUTION_POLICY.max_model_calls:
            raise AgentModelError(
                AgentErrorCode.EXECUTION_LIMIT_EXCEEDED,
                "Model call limit has been reached.",
            )
        self._model_calls += 1
        decision = self.provider.decide(prompt, timeout=timeout)
        if isinstance(decision, ToolCallDecision):
            self._tool_calls += 1
        return decision

    def _repair(
        self,
        prompt: str,
        code: str,
        timeout: float | None,
        started_at: float,
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
        repaired = self._call_model(render_repair_prompt(prompt, self._request, code), remaining)
        if not isinstance(repaired, FinalDecision):
            raise AgentModelError(
                AgentErrorCode.OUTPUT_INVALID,
                "Model repair did not return a final answer.",
            )
        try:
            normalized = GenerationService.validate_agent_output(self._request, repaired.output)
        except (TypeError, ValueError):
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
            ToolRegistry((build_retrieval_context_tool(), build_matching_evidence_tool())),
            build_retrieval_context_authorizer(),
        )
        self._definition = AgentDefinition(
            capability_id=_CAPABILITY_ID,
            model_profile="career-chat",
            output_model=ProviderGeneration,
            tool_allowlist=frozenset({"rag.retrieve_context"}),
            execution_policy=_EXECUTION_POLICY,
        )

    def _definition_for(self, request: RagGenerateRequest) -> AgentDefinition:
        if request.intent != "CV_JOB_COMPARISON":
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
        try:
            result = execute_agent(
                agent_request,
                self._definition_for(request),
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
        return GenerationService.finalize_agent_output(request, result.output)
