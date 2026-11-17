from collections.abc import Callable
from uuid import uuid4

import pytest
from pydantic import BaseModel, ConfigDict

from talentpulse_ai.agent_foundation.contracts import (
    AgentDefinition,
    AgentErrorCode,
    AgentRequest,
    ToolCallDecision,
)
from talentpulse_ai.agent_foundation.tools import (
    ToolDefinition,
    ToolDispatcher,
    ToolDispatchError,
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


class AllowAuthorizer:
    def __init__(self, allowed: bool) -> None:
        self.allowed = allowed

    def is_authorized(self, request: AgentRequest, operation: str) -> bool:
        return self.allowed


def make_request() -> AgentRequest:
    return AgentRequest(
        run_id=uuid4(),
        correlation_id="tool-test",
        capability_id="synthetic.search",
        prompt="lookup",
    )


def make_definition(
    *, allowlist: frozenset[str] = frozenset({"synthetic.lookup"})
) -> AgentDefinition:
    return AgentDefinition(
        capability_id="synthetic.search",
        model_profile="synthetic",
        output_model=CapabilityOutput,
        tool_allowlist=allowlist,
    )


def make_dispatcher(
    handler: Callable[[BaseModel, ToolExecutionContext], object],
    *,
    authorized: bool = True,
    allowed_capabilities: frozenset[str] = frozenset({"synthetic.search"}),
) -> ToolDispatcher:
    definition = ToolDefinition(
        tool_id="synthetic.lookup",
        description="Lookup synthetic data by query.",
        input_model=LookupInput,
        output_model=LookupOutput,
        allowed_capabilities=allowed_capabilities,
        required_operation="synthetic:lookup",
        timeout_seconds=2.0,
        side_effect_class=ToolSideEffect.READ_ONLY,
        handler=handler,
    )
    return ToolDispatcher(
        ToolRegistry((definition,)),
        AllowAuthorizer(authorized),
    )


def tool_decision(
    *,
    tool_id: str = "synthetic.lookup",
    tool_input: dict[str, object] | None = None,
) -> ToolCallDecision:
    return ToolCallDecision(
        tool_call_id="call-1",
        tool_id=tool_id,
        input=tool_input if tool_input is not None else {"query": "roles"},
    )


def test_dispatcher_validates_and_returns_typed_tool_output() -> None:
    seen_contexts: list[ToolExecutionContext] = []

    def handler(value: BaseModel, context: ToolExecutionContext) -> object:
        seen_contexts.append(context)
        assert isinstance(value, LookupInput)
        return {"value": f"found:{value.query}"}

    result = make_dispatcher(handler).dispatch(
        tool_decision(),
        request=make_request(),
        definition=make_definition(),
        remaining_tool_calls=1,
    )

    assert result.output == {"value": "found:roles"}
    assert result.tool_id == "synthetic.lookup"
    assert len(seen_contexts) == 1
    assert seen_contexts[0].timeout_seconds == 2.0


def test_tool_timeout_is_capped_by_remaining_execution_time() -> None:
    seen_contexts: list[ToolExecutionContext] = []

    def handler(value: BaseModel, context: ToolExecutionContext) -> object:
        seen_contexts.append(context)
        return {"value": "found"}

    make_dispatcher(handler).dispatch(
        tool_decision(),
        request=make_request(),
        definition=make_definition(),
        remaining_tool_calls=1,
        remaining_time_seconds=0.5,
    )

    assert seen_contexts[0].timeout_seconds == 0.5


def test_invalid_tool_input_is_rejected_before_handler() -> None:
    calls: list[bool] = []
    dispatcher = make_dispatcher(lambda value, context: calls.append(True))

    with pytest.raises(ToolDispatchError) as error:
        dispatcher.dispatch(
            tool_decision(tool_input={"unknown": "roles"}),
            request=make_request(),
            definition=make_definition(),
            remaining_tool_calls=1,
        )

    assert error.value.code is AgentErrorCode.INVALID_INPUT
    assert calls == []


def test_invalid_tool_output_is_rejected_as_safe_error() -> None:
    dispatcher = make_dispatcher(lambda value, context: {"private": "do not expose"})

    with pytest.raises(ToolDispatchError) as error:
        dispatcher.dispatch(
            tool_decision(),
            request=make_request(),
            definition=make_definition(),
            remaining_tool_calls=1,
        )

    assert error.value.code is AgentErrorCode.OUTPUT_INVALID
    assert "do not expose" not in str(error.value)


def test_unknown_tool_is_rejected_before_handler() -> None:
    calls: list[bool] = []
    dispatcher = make_dispatcher(lambda value, context: calls.append(True))

    with pytest.raises(ToolDispatchError) as error:
        dispatcher.dispatch(
            tool_decision(tool_id="unregistered.tool"),
            request=make_request(),
            definition=make_definition(),
            remaining_tool_calls=1,
        )

    assert error.value.code is AgentErrorCode.TOOL_NOT_ALLOWED
    assert calls == []


def test_capability_allowlist_is_checked_before_handler() -> None:
    calls: list[bool] = []
    dispatcher = make_dispatcher(lambda value, context: calls.append(True))

    with pytest.raises(ToolDispatchError) as error:
        dispatcher.dispatch(
            tool_decision(),
            request=make_request(),
            definition=make_definition(allowlist=frozenset()),
            remaining_tool_calls=1,
        )

    assert error.value.code is AgentErrorCode.TOOL_NOT_ALLOWED
    assert calls == []


def test_tool_allowed_capabilities_are_checked_before_handler() -> None:
    calls: list[bool] = []
    dispatcher = make_dispatcher(
        lambda value, context: calls.append(True),
        allowed_capabilities=frozenset({"synthetic.other"}),
    )

    with pytest.raises(ToolDispatchError) as error:
        dispatcher.dispatch(
            tool_decision(),
            request=make_request(),
            definition=make_definition(),
            remaining_tool_calls=1,
        )

    assert error.value.code is AgentErrorCode.TOOL_NOT_ALLOWED
    assert calls == []


def test_denied_operation_is_rejected_before_handler() -> None:
    calls: list[bool] = []
    dispatcher = make_dispatcher(lambda value, context: calls.append(True), authorized=False)

    with pytest.raises(ToolDispatchError) as error:
        dispatcher.dispatch(
            tool_decision(),
            request=make_request(),
            definition=make_definition(),
            remaining_tool_calls=1,
        )

    assert error.value.code is AgentErrorCode.PERMISSION_DENIED
    assert calls == []


def test_exhausted_tool_budget_is_rejected_before_handler() -> None:
    calls: list[bool] = []
    dispatcher = make_dispatcher(lambda value, context: calls.append(True))

    with pytest.raises(ToolDispatchError) as error:
        dispatcher.dispatch(
            tool_decision(),
            request=make_request(),
            definition=make_definition(),
            remaining_tool_calls=0,
        )

    assert error.value.code is AgentErrorCode.EXECUTION_LIMIT_EXCEEDED
    assert calls == []


def test_handler_exception_is_normalized_without_leaking_detail() -> None:
    dispatcher = make_dispatcher(
        lambda value, context: (_ for _ in ()).throw(RuntimeError("private handler detail"))
    )

    with pytest.raises(ToolDispatchError) as error:
        dispatcher.dispatch(
            tool_decision(),
            request=make_request(),
            definition=make_definition(),
            remaining_tool_calls=1,
        )

    assert error.value.code is AgentErrorCode.TOOL_ERROR
    assert "private handler detail" not in str(error.value)
