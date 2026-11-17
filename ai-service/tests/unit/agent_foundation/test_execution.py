from typing import get_type_hints
from uuid import uuid4

import pytest
from pydantic import BaseModel, ValidationError

from talentpulse_ai.agent_foundation.contracts import (
    AgentDefinition,
    AgentErrorCode,
    AgentExecutionState,
    AgentRequest,
    AgentResult,
    AgentStatus,
    FinalDecision,
    ModelDecision,
    ToolCallDecision,
    parse_model_decision,
)
from talentpulse_ai.agent_foundation.execution import build_agent_graph, execute_agent
from talentpulse_ai.agent_foundation.model import AgentModelError


class SyntheticOutput(BaseModel):
    answer: str


class FixedModel:
    def __init__(self, decision: ModelDecision | AgentModelError) -> None:
        self.decision = decision
        self.calls = 0

    def decide(self, prompt: str, *, timeout: float | None = None) -> ModelDecision:
        self.calls += 1
        if isinstance(self.decision, AgentModelError):
            raise self.decision
        return self.decision


def make_request(capability_id: str, prompt: str) -> AgentRequest:
    return AgentRequest(
        run_id=uuid4(),
        correlation_id=f"correlation-{capability_id}",
        capability_id=capability_id,
        prompt=prompt,
    )


def make_definition(capability_id: str) -> AgentDefinition:
    return AgentDefinition(
        capability_id=capability_id,
        model_profile="synthetic",
        output_model=SyntheticOutput,
    )


def test_execution_contracts_include_typed_run_state_and_result() -> None:
    run_id = uuid4()
    result = AgentResult(
        run_id=run_id,
        correlation_id="request-1",
        capability_id="synthetic",
        status=AgentStatus.COMPLETE,
        output={"answer": "grounded"},
    )

    assert result.run_id == run_id
    assert result.status is AgentStatus.COMPLETE
    state_fields = get_type_hints(AgentExecutionState)
    assert "request" in state_fields
    assert "step_count" in state_fields
    assert AgentErrorCode.PROVIDER_ERROR.value == "PROVIDER_ERROR"


def test_model_decision_envelope_parses_final_and_tool_call() -> None:
    final = parse_model_decision({"kind": "final", "output": {"answer": "ok"}})
    tool_call = parse_model_decision(
        {
            "kind": "tool_call",
            "tool_call_id": "call-1",
            "tool_id": "synthetic.lookup",
            "input": {"query": "test"},
        }
    )

    assert isinstance(final, FinalDecision)
    assert final.output == {"answer": "ok"}
    assert isinstance(tool_call, ToolCallDecision)
    assert tool_call.tool_id == "synthetic.lookup"


def test_unknown_model_decision_kind_is_rejected() -> None:
    with pytest.raises(ValidationError):
        parse_model_decision({"kind": "execute", "output": {}})


def test_compiled_graph_has_shared_nodes_and_no_checkpointer() -> None:
    graph = build_agent_graph()
    drawable = graph.get_graph()
    node_names = set(drawable.nodes)
    edges = {(edge.source, edge.target) for edge in drawable.edges}

    assert graph.checkpointer is None
    assert {"prepare", "model_decision", "tool_dispatch", "validate_finalize"} <= node_names
    assert ("prepare", "model_decision") in edges
    assert ("tool_dispatch", "model_decision") in edges
    assert ("validate_finalize", "__end__") in edges
    assert ("model_decision", "tool_dispatch") in edges
    assert ("model_decision", "validate_finalize") in edges


def test_executor_returns_output_validated_by_capability_contract() -> None:
    model = FixedModel(FinalDecision(output={"answer": "grounded"}))

    result = execute_agent(
        make_request("synthetic", "answer"),
        make_definition("synthetic"),
        model,
    )

    assert result.status is AgentStatus.COMPLETE
    assert result.output == {"answer": "grounded"}
    assert result.usage.model_calls == 1


def test_two_capabilities_share_model_contract_without_sharing_prompt() -> None:
    model = FixedModel(FinalDecision(output={"answer": "shared contract"}))

    first = execute_agent(
        make_request("synthetic.first", "first capability"),
        make_definition("synthetic.first"),
        model,
    )
    second = execute_agent(
        make_request("synthetic.second", "second capability"),
        make_definition("synthetic.second"),
        model,
    )

    assert first.status is AgentStatus.COMPLETE
    assert second.status is AgentStatus.COMPLETE
    assert first.capability_id != second.capability_id
    assert model.calls == 2


def test_invalid_capability_output_returns_safe_classified_error() -> None:
    model = FixedModel(FinalDecision(output={"unexpected": "private"}))

    result = execute_agent(
        make_request("synthetic", "answer"),
        make_definition("synthetic"),
        model,
    )

    assert result.status is AgentStatus.FAILED
    assert result.output is None
    assert result.error is not None
    assert result.error.code is AgentErrorCode.OUTPUT_INVALID
    assert "private" not in result.error.safe_message


def test_interrupted_execution_retry_uses_a_new_run_without_resuming_state() -> None:
    model = FixedModel(
        AgentModelError(AgentErrorCode.INTERRUPTED, "Execution was interrupted.")
    )
    definition = make_definition("synthetic")
    interrupted_request = make_request("synthetic", "first run")

    interrupted = execute_agent(interrupted_request, definition, model)
    model.decision = FinalDecision(output={"answer": "fresh run"})
    retry_request = make_request("synthetic", "retry run")
    retried = execute_agent(retry_request, definition, model)

    assert interrupted.status is AgentStatus.INTERRUPTED
    assert retried.status is AgentStatus.COMPLETE
    assert retried.run_id != interrupted.run_id
    assert retried.output == {"answer": "fresh run"}
    assert model.calls == 2
