"""T021: request-scoped failure and exhaustion contracts for T023."""

from dataclasses import replace
from importlib import import_module
from threading import Event
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import uuid4

import pytest
from pydantic import BaseModel, ConfigDict

from talentpulse_ai.agent_foundation import execution, policy
from talentpulse_ai.agent_foundation.contracts import (
    AgentErrorCode,
    AgentStatus,
    FinalDecision,
    ToolCallDecision,
)
from talentpulse_ai.agent_foundation.model import AgentModelError
from talentpulse_ai.agent_foundation.tools import (
    ToolDefinition,
    ToolDispatcher,
    ToolRegistry,
    ToolSideEffect,
)
from talentpulse_ai.core.exceptions import ServiceError
from talentpulse_ai.modules.rag_chatbot.schemas import (
    ExplicitFilters,
    IdentityFields,
    RagGenerateRequest,
    ServicePolicy,
    StructuredFilterState,
)

PRIVATE_MARKER = "SYNTHETIC_PRIVATE_PROVIDER_PAYLOAD"
TOOL_ID = "rag.retrieve_context"


class LookupInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    query: str


class LookupOutput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    evidence: list[str]


def tool_call(tool_id: str = TOOL_ID, **inputs: object) -> ToolCallDecision:
    return ToolCallDecision(tool_call_id="lookup-1", tool_id=tool_id, input=inputs)


@pytest.fixture
def run(monkeypatch):
    module = import_module("talentpulse_ai.modules.rag_chatbot.agent")
    request = RagGenerateRequest(
        identity=IdentityFields(
            **{
                key: uuid4()
                for key in (
                    "request_id",
                    "trace_id",
                    "operation_attempt_id",
                    "client_message_id",
                    "user_id",
                    "session_id",
                )
            }
        ),
        normalized_user_message="Help me prepare for interviews.",
        intent="ADVICE",
        locale="en",
        filter_state=StructuredFilterState(),
        explicit_filters=ExplicitFilters(),
        policy=ServicePolicy(data_scope="PUBLIC_ACTIVE_JOBS", max_candidates=20),
    )
    handler = Mock(return_value={"evidence": []})
    authorizer = Mock()
    authorizer.is_authorized.return_value = True
    registry = ToolRegistry(
        (
            ToolDefinition(
                tool_id=TOOL_ID,
                description="Synthetic request-scoped evidence lookup.",
                input_model=LookupInput,
                output_model=LookupOutput,
                allowed_capabilities=frozenset({"rag.generate"}),
                required_operation="rag.read",
                timeout_seconds=1.0,
                side_effect_class=ToolSideEffect.READ_ONLY,
                handler=handler,
            ),
        )
    )
    retrieval_tool = registry.get(TOOL_ID)
    assert retrieval_tool is not None
    registry.register(replace(retrieval_tool, tool_id="career.read_matching_evidence"))
    dispatcher = ToolDispatcher(registry, authorizer)
    model = Mock()
    model.decide.return_value = tool_call(query="interviews")
    cancelled = Event()
    results = []

    def execute(*args, **kwargs):
        result = execution.execute_agent(*args, **kwargs, cancellation_event=cancelled)
        results.append(result)
        return result

    executor = Mock(side_effect=execute)
    monkeypatch.setattr(module, "execute_agent", executor)
    legacy = Mock(side_effect=AssertionError("Legacy generation must not run."))
    monkeypatch.setattr(module.GenerationService, "generate", legacy)
    agent = module.CareerChatAgent(model=model)
    monkeypatch.setattr(agent, "_tool_dispatcher", dispatcher)

    def set_budget(**limits):
        updated = replace(module._EXECUTION_POLICY, **limits)
        monkeypatch.setattr(module, "_EXECUTION_POLICY", updated)
        monkeypatch.setattr(
            agent, "_definition", replace(agent._definition, execution_policy=updated)
        )

    def assert_stopped(code, *, model_calls, handler_calls=0, status=AgentStatus.FAILED):
        with pytest.raises(ServiceError) as caught:
            agent.generate(request)
        assert caught.value.status_code in {400, 403, 422, 429, 503, 504}
        assert PRIVATE_MARKER not in str(caught.value)
        assert PRIVATE_MARKER not in caught.value.code
        executor.assert_called_once()
        legacy.assert_not_called()
        assert len(results) == 1
        result = results[0]
        assert result.status is status
        assert result.output is None
        assert result.error is not None
        assert result.error.code is code
        assert PRIVATE_MARKER not in result.error.safe_message
        assert model.decide.call_count == model_calls
        assert handler.call_count == handler_calls
        return result

    return SimpleNamespace(
        model=model,
        handler=handler,
        authorizer=authorizer,
        cancelled=cancelled,
        set_budget=set_budget,
        assert_stopped=assert_stopped,
    )


@pytest.mark.parametrize("tool_id", ["unknown.tool", "career.read_matching_evidence"])
def test_unknown_or_non_allowlisted_tool_never_invokes_handler(run, tool_id):
    run.model.decide.return_value = tool_call(tool_id, query="interviews")
    run.assert_stopped(AgentErrorCode.TOOL_NOT_ALLOWED, model_calls=1)
    run.authorizer.is_authorized.assert_not_called()


def test_denied_tool_never_invokes_handler_or_next_model_step(run):
    run.authorizer.is_authorized.return_value = False
    run.assert_stopped(AgentErrorCode.PERMISSION_DENIED, model_calls=1)
    run.authorizer.is_authorized.assert_called_once()


@pytest.mark.parametrize("inputs", [{}, {"query": 12}, {"query": "ok", "extra": True}])
def test_malformed_tool_input_never_invokes_handler_or_next_model_step(run, inputs):
    run.model.decide.return_value = tool_call(**inputs)
    run.assert_stopped(AgentErrorCode.INVALID_INPUT, model_calls=1)


def test_malformed_tool_result_never_reaches_another_model_step(run):
    run.handler.return_value = {"evidence": PRIVATE_MARKER}
    run.assert_stopped(AgentErrorCode.OUTPUT_INVALID, model_calls=1, handler_calls=1)


def test_tool_failure_never_reaches_another_model_step(run):
    run.handler.side_effect = RuntimeError(PRIVATE_MARKER)
    run.assert_stopped(AgentErrorCode.TOOL_ERROR, model_calls=1, handler_calls=1)


@pytest.mark.parametrize("failure", [RuntimeError(PRIVATE_MARKER), TimeoutError(PRIVATE_MARKER)])
def test_provider_failure_or_timeout_stops_without_tool_or_retry(run, failure):
    run.model.decide.side_effect = failure
    run.assert_stopped(AgentErrorCode.PROVIDER_ERROR, model_calls=1)


@pytest.mark.parametrize("malformed", [False, True], ids=["final-schema", "decision-envelope"])
def test_malformed_model_output_stops_after_at_most_one_repair(run, malformed):
    if malformed:
        run.model.decide.side_effect = AgentModelError(
            AgentErrorCode.OUTPUT_INVALID, "Model output is invalid."
        )
    else:
        run.model.decide.return_value = FinalDecision(output={"private": PRIVATE_MARKER})
    run.assert_stopped(AgentErrorCode.OUTPUT_INVALID, model_calls=2)


@pytest.mark.parametrize("stage", ["before-model", "after-model", "after-tool"])
@pytest.mark.parametrize("interruption", ["timeout", "cancel"])
def test_interruption_discards_late_results_and_stops_next_step(
    run, monkeypatch, stage, interruption
):
    clock = [100.0]
    monkeypatch.setattr(execution, "monotonic", lambda: clock[0])
    monkeypatch.setattr(policy, "monotonic", lambda: clock[0])

    def interrupt():
        if interruption == "cancel":
            run.cancelled.set()
        else:
            clock[0] += 25.0

    def late_decision(*args, **kwargs):
        interrupt()
        return tool_call(query="interviews")

    def late_tool(*args, **kwargs):
        interrupt()
        return {"evidence": [PRIVATE_MARKER]}

    if stage == "before-model":
        if interruption == "cancel":
            interrupt()
        else:
            monkeypatch.setattr(policy, "monotonic", lambda: 125.0)
    elif stage == "after-model":
        run.model.decide.side_effect = late_decision
    else:
        run.handler.side_effect = late_tool
    run.assert_stopped(
        AgentErrorCode.CANCELLED
        if interruption == "cancel"
        else AgentErrorCode.EXECUTION_LIMIT_EXCEEDED,
        status=AgentStatus.CANCELLED if interruption == "cancel" else AgentStatus.FAILED,
        model_calls=0 if stage == "before-model" else 1,
        handler_calls=1 if stage == "after-tool" else 0,
    )


@pytest.mark.parametrize(
    ("limits", "model_calls", "handler_calls"),
    [
        ({"max_steps": 1}, 0, 0),
        ({"max_steps": 2}, 1, 0),
        ({"max_steps": 3}, 1, 1),
        ({"max_model_calls": 1}, 1, 0),
        ({"max_model_calls": 2}, 2, 1),
        ({"max_tool_calls": 0}, 1, 0),
        ({"max_tool_calls": 1}, 2, 1),
    ],
)
def test_execution_budgets_stop_before_another_handler_or_model_call(
    run, limits, model_calls, handler_calls
):
    run.set_budget(**limits)
    run.assert_stopped(
        AgentErrorCode.EXECUTION_LIMIT_EXCEEDED,
        model_calls=model_calls,
        handler_calls=handler_calls,
    )


@pytest.mark.parametrize("limits", [{"max_model_calls": 1}, {"max_steps": 2}])
def test_invalid_final_cannot_start_repair_after_budget_exhaustion(run, limits):
    run.set_budget(**limits)
    run.model.decide.return_value = FinalDecision(output={"private": PRIVATE_MARKER})
    run.assert_stopped(AgentErrorCode.OUTPUT_INVALID, model_calls=1)
