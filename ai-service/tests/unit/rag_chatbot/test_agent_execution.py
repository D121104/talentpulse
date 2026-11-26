"""T008: CareerChatAgent(model=...).generate(request) execution contract for T009."""

from importlib import import_module
from unittest.mock import Mock
from uuid import uuid4

import pytest

from talentpulse_ai.agent_foundation import execution
from talentpulse_ai.agent_foundation.contracts import (
    AgentDefinition,
    AgentRequest,
    AgentResult,
    AgentStatus,
    FinalDecision,
    ModelDecision,
    ToolCallDecision,
)
from talentpulse_ai.core.exceptions import ProviderFailure, ServiceError
from talentpulse_ai.modules.rag_chatbot.schemas import (
    ExplicitFilters,
    IdentityFields,
    RagGenerateRequest,
    RagGenerateResponse,
    ServicePolicy,
    StructuredFilterState,
)


class FixedModel:
    def __init__(self, decision: ModelDecision | None = None) -> None:
        self.decision = decision or FinalDecision(
            output={
                "answer_blocks": [{"kind": "ADVICE", "text": "Practice interview answers."}],
                "claims": [],
                "citation_keys": [],
                "referenced_job_ids": [],
            }
        )
        self.prompts: list[str] = []

    def decide(
        self, prompt: str, *, timeout: float | None = None, **kwargs: object
    ) -> ModelDecision:
        del kwargs
        self.prompts.append(prompt)
        assert timeout is not None and 0 < timeout <= 24
        return self.decision


def make_request(message: str = "Help me prepare for interviews.") -> RagGenerateRequest:
    return RagGenerateRequest(
        identity=IdentityFields(
            request_id=uuid4(),
            trace_id=uuid4(),
            operation_attempt_id=uuid4(),
            client_message_id=uuid4(),
            user_id=uuid4(),
            session_id=uuid4(),
        ),
        normalized_user_message=message,
        intent="ADVICE",
        locale="en",
        filter_state=StructuredFilterState(),
        explicit_filters=ExplicitFilters(),
        policy=ServicePolicy(data_scope="PUBLIC_ACTIVE_JOBS", max_candidates=20),
    )


@pytest.fixture
def agent_module():
    # Deliberately fail, not skip, until T009 supplies this capability adapter.
    return import_module("talentpulse_ai.modules.rag_chatbot.agent")


def test_one_rag_generate_foundation_execution_per_request(agent_module, monkeypatch) -> None:
    executor = Mock(wraps=execution.execute_agent)
    monkeypatch.setattr(agent_module, "execute_agent", executor)
    model = FixedModel()
    agent = agent_module.CareerChatAgent(model=model)
    requests = [make_request(), make_request()]

    for index, request in enumerate(requests, start=1):
        response = agent.generate(request)

        assert isinstance(response, RagGenerateResponse)
        assert response.request_id == request.identity.request_id
        assert executor.call_count == index
        foundation_request, definition, passed_model = executor.call_args.args
        assert isinstance(foundation_request, AgentRequest)
        assert isinstance(definition, AgentDefinition)
        assert foundation_request.capability_id == definition.capability_id == "rag.generate"
        assert foundation_request.correlation_id in {
            str(request.identity.trace_id),
            str(request.identity.request_id),
        }
        assert getattr(passed_model, "provider", passed_model) is model

    first, second = [call.args[0] for call in executor.call_args_list]
    assert first.run_id != second.run_id
    assert len(model.prompts) == 2


@pytest.mark.parametrize("tool_id", ["agent.delegate", "rag.generate", "career.cv_agent"])
def test_subagent_delegation_never_starts_another_execution(
    agent_module, monkeypatch, tool_id: str
) -> None:
    results: list[AgentResult] = []

    def record_execution(*args, **kwargs):
        result = execution.execute_agent(*args, **kwargs)
        results.append(result)
        return result

    executor = Mock(side_effect=record_execution)
    monkeypatch.setattr(agent_module, "execute_agent", executor)
    model = FixedModel(ToolCallDecision(tool_call_id="delegate-1", tool_id=tool_id, input={}))
    agent = agent_module.CareerChatAgent(model=model)

    # Either an existing safe service error or a safe response is permitted.
    try:
        agent.generate(make_request())
    except (ProviderFailure, ServiceError):
        pass
    finally:
        executor.assert_called_once()
        definition = executor.call_args.args[1]
        assert definition.tool_allowlist <= {
            "rag.retrieve_context",
            "career.read_matching_evidence",
            "career.lookup_skill_framework",
        }
        assert tool_id not in definition.tool_allowlist
        assert len(model.prompts) == 1
        assert len(results) == 1
        assert results[0].status is AgentStatus.FAILED
        # Foundation counts denied dispatch attempts, not only successful handlers.
        assert results[0].usage.tool_calls == 1


def test_consecutive_requests_use_fresh_graph_state_without_checkpoint(
    agent_module, monkeypatch
) -> None:
    graphs = []
    invocations: list[tuple[dict, dict]] = []
    real_build_graph = execution.build_agent_graph

    def build_graph(*args, **kwargs):
        graph = real_build_graph(*args, **kwargs)
        assert graph.checkpointer is None
        assert graph.store is None
        graphs.append(graph)
        invoke = graph.invoke

        def record_invoke(state, config=None, **invoke_kwargs):
            invocations.append((state.copy(), dict(config or {})))
            return invoke(state, config=config, **invoke_kwargs)

        monkeypatch.setattr(graph, "invoke", record_invoke)
        return graph

    monkeypatch.setattr(execution, "build_agent_graph", build_graph)
    monkeypatch.setattr(agent_module, "execute_agent", execution.execute_agent)
    model = FixedModel()
    agent = agent_module.CareerChatAgent(model=model)
    first = make_request("FIRST_REQUEST_ONLY_SYNTHETIC_MARKER")
    second = make_request("SECOND_REQUEST_ONLY_SYNTHETIC_MARKER")
    # Even the same session must not implicitly restore the preceding turn.
    second.identity.session_id = first.identity.session_id
    before = [request.model_dump(mode="json") for request in (first, second)]

    agent.generate(first)
    agent.generate(second)

    assert len(graphs) == len(invocations) == 2
    assert graphs[0] is not graphs[1]
    for state, config in invocations:
        assert set(state) == {"request", "definition"}
        assert "configurable" not in config  # No thread/checkpoint resume identifiers.
    first_state, second_state = [state for state, _ in invocations]
    assert first_state["request"].run_id != second_state["request"].run_id
    assert (
        first_state["request"].authorized_context is not second_state["request"].authorized_context
    )
    assert "FIRST_REQUEST_ONLY_SYNTHETIC_MARKER" in model.prompts[0]
    assert "FIRST_REQUEST_ONLY_SYNTHETIC_MARKER" not in model.prompts[1]
    assert "FIRST_REQUEST_ONLY_SYNTHETIC_MARKER" not in second_state["request"].model_dump_json()
    assert "SECOND_REQUEST_ONLY_SYNTHETIC_MARKER" in model.prompts[1]
    assert [request.model_dump(mode="json") for request in (first, second)] == before
