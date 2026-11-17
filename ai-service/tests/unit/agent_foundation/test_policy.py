from threading import Event
from uuid import uuid4

import pytest
from pydantic import BaseModel, ConfigDict

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
from talentpulse_ai.agent_foundation.execution import execute_agent
from talentpulse_ai.agent_foundation.model import AgentModelError
from talentpulse_ai.agent_foundation.tools import (
    ToolDefinition,
    ToolDispatcher,
    ToolExecutionContext,
    ToolRegistry,
    ToolSideEffect,
)


class LookupInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    query: str


class LookupOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    value: str


class CapabilityOutput(BaseModel):
    answer: str


class SequenceModel:
    def __init__(
        self,
        decisions: list[ModelDecision | AgentModelError],
        *,
        on_decide=None,
    ) -> None:
        self.decisions = decisions
        self.on_decide = on_decide
        self.calls = 0
        self.timeouts: list[float | None] = []

    def decide(self, prompt: str, *, timeout: float | None = None) -> ModelDecision:
        self.timeouts.append(timeout)
        decision = self.decisions[self.calls]
        self.calls += 1
        if self.on_decide is not None:
            self.on_decide()
        if isinstance(decision, AgentModelError):
            raise decision
        return decision


class AllowAuthorizer:
    def is_authorized(self, request: AgentRequest, operation: str) -> bool:
        return True


def tool_decision() -> ToolCallDecision:
    return ToolCallDecision(
        tool_call_id="call-1",
        tool_id="synthetic.lookup",
        input={"query": "roles"},
    )


def make_request() -> AgentRequest:
    return AgentRequest(
        run_id=uuid4(),
        correlation_id="policy-test",
        capability_id="synthetic.search",
        prompt="look up roles",
    )


def make_definition(policy: ExecutionPolicy) -> AgentDefinition:
    return AgentDefinition(
        capability_id="synthetic.search",
        model_profile="synthetic",
        output_model=CapabilityOutput,
        tool_allowlist=frozenset({"synthetic.lookup"}),
        execution_policy=policy,
    )


def make_dispatcher(handler) -> ToolDispatcher:
    tool = ToolDefinition(
        tool_id="synthetic.lookup",
        description="Return synthetic test data.",
        input_model=LookupInput,
        output_model=LookupOutput,
        allowed_capabilities=frozenset({"synthetic.search"}),
        required_operation="synthetic:lookup",
        timeout_seconds=10.0,
        side_effect_class=ToolSideEffect.READ_ONLY,
        handler=handler,
    )
    return ToolDispatcher(ToolRegistry((tool,)), AllowAuthorizer())


def test_execution_policy_rejects_invalid_or_unbounded_values() -> None:
    with pytest.raises(ValueError):
        ExecutionPolicy(max_steps=0)
    with pytest.raises(ValueError):
        ExecutionPolicy(max_model_calls=0)
    with pytest.raises(ValueError):
        ExecutionPolicy(max_tool_calls=-1)
    with pytest.raises(ValueError):
        ExecutionPolicy(timeout_seconds=float("inf"))


def test_step_budget_stops_before_model_call() -> None:
    model = SequenceModel([FinalDecision(output={"answer": "unused"})])
    result = execute_agent(
        make_request(),
        make_definition(ExecutionPolicy(max_steps=1)),
        model,
    )

    assert result.status is AgentStatus.FAILED
    assert result.error is not None
    assert result.error.code is AgentErrorCode.EXECUTION_LIMIT_EXCEEDED
    assert model.calls == 0


def test_model_call_budget_prevents_tool_action_without_followup_call() -> None:
    handler_calls: list[bool] = []
    model = SequenceModel([tool_decision()])
    result = execute_agent(
        make_request(),
        make_definition(ExecutionPolicy(max_model_calls=1, max_tool_calls=1)),
        model,
        tool_dispatcher=make_dispatcher(lambda value, context: handler_calls.append(True)),
    )

    assert result.status is AgentStatus.FAILED
    assert result.error is not None
    assert result.error.code is AgentErrorCode.EXECUTION_LIMIT_EXCEEDED
    assert model.calls == 1
    assert handler_calls == []


def test_tool_call_budget_stops_before_extra_handler_call() -> None:
    handler_calls: list[bool] = []
    model = SequenceModel([tool_decision(), tool_decision()])
    result = execute_agent(
        make_request(),
        make_definition(ExecutionPolicy(max_model_calls=3, max_tool_calls=1)),
        model,
        tool_dispatcher=make_dispatcher(
            lambda value, context: (handler_calls.append(True) or {"value": "x"})
        ),
    )

    assert result.status is AgentStatus.FAILED
    assert result.error is not None
    assert result.error.code is AgentErrorCode.EXECUTION_LIMIT_EXCEEDED
    assert model.calls == 2
    assert handler_calls == [True]


def test_deadline_stops_before_model_call_and_propagates_timeout() -> None:
    model = SequenceModel([FinalDecision(output={"answer": "unused"})])
    result = execute_agent(
        make_request(),
        make_definition(ExecutionPolicy(timeout_seconds=1e-12)),
        model,
    )

    assert result.status is AgentStatus.FAILED
    assert result.error is not None
    assert result.error.code is AgentErrorCode.EXECUTION_LIMIT_EXCEEDED
    assert model.calls == 0


def test_model_receives_only_remaining_execution_timeout() -> None:
    model = SequenceModel([FinalDecision(output={"answer": "ok"})])

    result = execute_agent(
        make_request(),
        make_definition(ExecutionPolicy(timeout_seconds=10.0)),
        model,
    )

    assert result.status is AgentStatus.COMPLETE
    assert len(model.timeouts) == 1
    assert model.timeouts[0] is not None
    assert 0 < model.timeouts[0] <= 10.0


def test_pre_cancelled_execution_stops_before_model_call() -> None:
    cancellation = Event()
    cancellation.set()
    model = SequenceModel([FinalDecision(output={"answer": "unused"})])

    result = execute_agent(
        make_request(),
        make_definition(ExecutionPolicy()),
        model,
        cancellation_event=cancellation,
    )

    assert result.status is AgentStatus.CANCELLED
    assert result.error is not None
    assert result.error.code is AgentErrorCode.CANCELLED
    assert model.calls == 0


def test_late_provider_result_after_cancellation_is_discarded() -> None:
    cancellation = Event()
    handler_calls: list[bool] = []
    model = SequenceModel(
        [tool_decision()],
        on_decide=cancellation.set,
    )

    result = execute_agent(
        make_request(),
        make_definition(ExecutionPolicy()),
        model,
        tool_dispatcher=make_dispatcher(lambda value, context: handler_calls.append(True)),
        cancellation_event=cancellation,
    )

    assert result.status is AgentStatus.CANCELLED
    assert result.error is not None
    assert result.error.code is AgentErrorCode.CANCELLED
    assert model.calls == 1
    assert handler_calls == []


def test_late_tool_result_after_cancellation_does_not_start_another_model_call() -> None:
    cancellation = Event()
    model = SequenceModel([tool_decision(), FinalDecision(output={"answer": "late"})])

    def late_handler(value: BaseModel, context: ToolExecutionContext) -> object:
        cancellation.set()
        return {"value": "late result"}

    result = execute_agent(
        make_request(),
        make_definition(ExecutionPolicy()),
        model,
        tool_dispatcher=make_dispatcher(late_handler),
        cancellation_event=cancellation,
    )

    assert result.status is AgentStatus.CANCELLED
    assert result.error is not None
    assert result.error.code is AgentErrorCode.CANCELLED
    assert model.calls == 1
