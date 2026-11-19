from uuid import uuid4

from pydantic import BaseModel, ConfigDict

from talentpulse_ai.agent_foundation.contracts import (
    AgentDefinition,
    AgentErrorCode,
    AgentRequest,
    AgentStatus,
    ExecutionPolicy,
    FinalDecision,
    ToolCallDecision,
)
from talentpulse_ai.agent_foundation.execution import execute_agent
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
    def __init__(self, tool_input: dict[str, object] | None = None) -> None:
        self.prompts: list[str] = []
        self.tool_input = tool_input or {"query": "platform roles"}

    def decide(self, prompt: str, *, timeout: float | None = None, **kwargs: object):
        del kwargs
        self.prompts.append(prompt)
        if len(self.prompts) == 1:
            return ToolCallDecision(
                tool_call_id="call-1",
                tool_id="synthetic.lookup",
                input=self.tool_input,
            )
        return FinalDecision(output={"answer": "found result"})


class StaticAuthorizer:
    def __init__(self, allowed: bool) -> None:
        self.allowed = allowed

    def is_authorized(self, request: AgentRequest, operation: str) -> bool:
        return self.allowed


def make_request() -> AgentRequest:
    return AgentRequest(
        run_id=uuid4(),
        correlation_id="synthetic-tool-integration",
        capability_id="synthetic.search",
        prompt="Find a platform role.",
    )


def make_definition(*, max_tool_calls: int = 1) -> AgentDefinition:
    return AgentDefinition(
        capability_id="synthetic.search",
        model_profile="synthetic",
        output_model=CapabilityOutput,
        tool_allowlist=frozenset({"synthetic.lookup"}),
        execution_policy=ExecutionPolicy(max_tool_calls=max_tool_calls),
    )


def make_dispatcher(
    handler,
    *,
    authorized: bool,
) -> ToolDispatcher:
    tool = ToolDefinition(
        tool_id="synthetic.lookup",
        description="Look up synthetic role data.",
        input_model=LookupInput,
        output_model=LookupOutput,
        allowed_capabilities=frozenset({"synthetic.search"}),
        required_operation="synthetic:lookup",
        timeout_seconds=2.0,
        side_effect_class=ToolSideEffect.READ_ONLY,
        handler=handler,
    )
    return ToolDispatcher(ToolRegistry((tool,)), StaticAuthorizer(authorized))


def test_agent_graph_dispatches_synthetic_tool_and_uses_validated_result() -> None:
    handler_calls: list[str] = []

    def handler(value: BaseModel, context: ToolExecutionContext) -> object:
        assert isinstance(value, LookupInput)
        handler_calls.append(value.query)
        return {"value": "Senior Platform Engineer"}

    model = SequenceModel()
    result = execute_agent(
        make_request(),
        make_definition(max_tool_calls=1),
        model,
        tool_dispatcher=make_dispatcher(handler, authorized=True),
    )

    assert result.status is AgentStatus.COMPLETE
    assert result.output == {"answer": "found result"}
    assert handler_calls == ["platform roles"]
    assert len(model.prompts) == 2
    assert "UNTRUSTED TOOL RESULTS" in model.prompts[1]
    assert "Senior Platform Engineer" in model.prompts[1]


def test_agent_graph_denies_unauthorized_tool_without_invoking_handler() -> None:
    handler_calls: list[bool] = []
    model = SequenceModel()
    result = execute_agent(
        make_request(),
        make_definition(max_tool_calls=1),
        model,
        tool_dispatcher=make_dispatcher(
            lambda value, context: handler_calls.append(True),
            authorized=False,
        ),
    )

    assert result.status is AgentStatus.FAILED
    assert result.error is not None
    assert result.error.code is AgentErrorCode.PERMISSION_DENIED
    assert handler_calls == []
    assert len(model.prompts) == 1


def test_agent_graph_rejects_invalid_tool_input_without_invoking_handler() -> None:
    handler_calls: list[bool] = []
    model = SequenceModel(tool_input={"query": "roles", "admin": True})
    result = execute_agent(
        make_request(),
        make_definition(max_tool_calls=1),
        model,
        tool_dispatcher=make_dispatcher(
            lambda value, context: handler_calls.append(True),
            authorized=True,
        ),
    )

    assert result.status is AgentStatus.FAILED
    assert result.error is not None
    assert result.error.code is AgentErrorCode.INVALID_INPUT
    assert handler_calls == []
    assert len(model.prompts) == 1
