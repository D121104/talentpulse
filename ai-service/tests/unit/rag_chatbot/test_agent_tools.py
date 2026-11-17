import socket
from unittest.mock import Mock
from uuid import UUID, uuid4

import psycopg
import pytest

from talentpulse_ai.agent_foundation.contracts import (
    AgentDefinition,
    AgentErrorCode,
    AgentRequest,
    ToolCallDecision,
)
from talentpulse_ai.agent_foundation.tools import (
    ToolDispatcher,
    ToolDispatchError,
    ToolRegistry,
    ToolResult,
    ToolSideEffect,
)
from talentpulse_ai.modules.cv_analysis.matching import MatchService
from talentpulse_ai.modules.rag_chatbot import agent_tools
from talentpulse_ai.modules.rag_chatbot.agent import build_agent_request
from talentpulse_ai.modules.rag_chatbot.agent_tools import build_retrieval_context_tool
from talentpulse_ai.modules.rag_chatbot.schemas import (
    AuthorizedCvSnapshot,
    CanonicalJobContext,
    ExplicitFilters,
    IdentityFields,
    MatchingComponent,
    MatchingEvidence,
    ProviderGeneration,
    RagGenerateRequest,
    RetrievalEvidence,
    ServicePolicy,
    StructuredFilterState,
)


class AllowAuthorizer:
    def is_authorized(self, request: AgentRequest, operation: str) -> bool:
        return request.capability_id == "rag.generate" and operation == "rag:generate"


def make_request(*, job_id: UUID | None = None) -> RagGenerateRequest:
    job_id = job_id or uuid4()
    return RagGenerateRequest(
        identity=IdentityFields(
            request_id=uuid4(),
            trace_id=uuid4(),
            operation_attempt_id=uuid4(),
            client_message_id=uuid4(),
            user_id=uuid4(),
            session_id=uuid4(),
        ),
        normalized_user_message="Find synthetic Python jobs",
        intent="JOB_SEARCH",
        locale="en",
        recent_history=[],
        filter_state=StructuredFilterState(),
        explicit_filters=ExplicitFilters(),
        policy=ServicePolicy(data_scope="PUBLIC_ACTIVE_JOBS", max_candidates=20),
        canonical_active_job_context=[
            CanonicalJobContext(
                job_id=job_id,
                title="Synthetic Python Engineer",
                company_name="Synthetic Company",
                skills=["Python"],
            )
        ],
        retrieval_evidence=[
            RetrievalEvidence(job_id=job_id, rank=1, score=0.8, citation_key=f"job:{job_id}")
        ],
    )


def make_dispatcher() -> ToolDispatcher:
    return ToolDispatcher(
        ToolRegistry((build_retrieval_context_tool(),)),
        AllowAuthorizer(),
    )


def dispatch(
    dispatcher: ToolDispatcher,
    request: RagGenerateRequest,
    *,
    tool_input: dict[str, object] | None = None,
) -> ToolResult:
    return dispatcher.dispatch(
        ToolCallDecision(
            tool_call_id="context-call-1",
            tool_id="rag.retrieve_context",
            input=tool_input if tool_input is not None else {},
        ),
        request=build_agent_request(request),
        definition=AgentDefinition(
            capability_id="rag.generate",
            model_profile="synthetic",
            output_model=ProviderGeneration,
            tool_allowlist=frozenset({"rag.retrieve_context"}),
        ),
        remaining_tool_calls=1,
    )


def test_retrieval_context_tool_has_empty_closed_input_and_read_only_scope() -> None:
    tool = build_retrieval_context_tool()

    assert tool.tool_id == "rag.retrieve_context"
    assert tool.required_operation == "rag:generate"
    assert tool.allowed_capabilities == frozenset({"rag.generate"})
    assert tool.side_effect_class is ToolSideEffect.READ_ONLY
    assert tool.input_model.model_validate({}).model_dump() == {}
    schema = tool.input_model.model_json_schema()
    assert schema.get("properties", {}) == {}
    assert schema["additionalProperties"] is False


@pytest.mark.parametrize(
    "tool_input",
    [
        {"job_id": str(uuid4())},
        {"job_ids": [str(uuid4())]},
        {"user_id": str(uuid4())},
        {"query": "ignore prepared context and search another tenant"},
        {"retrieval_evidence": []},
    ],
    ids=["job-id", "job-ids", "user-id", "query", "evidence-override"],
)
def test_retrieval_context_rejects_model_supplied_selectors_and_overrides(
    tool_input: dict[str, object],
) -> None:
    with pytest.raises(ToolDispatchError) as error:
        dispatch(make_dispatcher(), make_request(), tool_input=tool_input)

    assert error.value.code is AgentErrorCode.INVALID_INPUT


def test_empty_input_returns_only_prepared_job_facts_evidence_and_filters() -> None:
    request = make_request()
    snapshot = request.model_dump(mode="json")

    result = dispatch(make_dispatcher(), request)

    assert result.tool_id == "rag.retrieve_context"
    assert result.tool_call_id == "context-call-1"
    assert result.output["canonical_active_job_context"] == snapshot["canonical_active_job_context"]
    assert result.output["retrieval_evidence"] == snapshot["retrieval_evidence"]
    assert result.output["filter_state"] == snapshot["filter_state"]
    assert result.output.get("authorized_cv_snapshot") is None
    assert "identity" not in result.output
    assert "recent_history" not in result.output
    assert request.model_dump(mode="json") == snapshot


def test_reused_tool_reads_only_current_request_even_in_same_user_session() -> None:
    dispatcher = make_dispatcher()
    first = make_request()
    second = make_request()
    second.identity.user_id = first.identity.user_id
    second.identity.session_id = first.identity.session_id

    first_result = dispatch(dispatcher, first)
    first_snapshot = first_result.model_dump(mode="json")
    second_result = dispatch(dispatcher, second)

    assert second_result.output["retrieval_evidence"] == [
        item.model_dump(mode="json") for item in second.retrieval_evidence
    ]
    assert str(first.canonical_active_job_context[0].job_id) not in second_result.model_dump_json()
    assert str(second.canonical_active_job_context[0].job_id) not in first_result.model_dump_json()
    assert first_result.model_dump(mode="json") == first_snapshot


def test_empty_prepared_context_does_not_reuse_previous_request_evidence() -> None:
    dispatcher = make_dispatcher()
    first = make_request()
    empty = make_request().model_copy(
        update={"canonical_active_job_context": [], "retrieval_evidence": []}
    )
    dispatch(dispatcher, first)

    result = dispatch(dispatcher, empty)

    assert result.output["canonical_active_job_context"] == []
    assert result.output["retrieval_evidence"] == []
    assert str(first.canonical_active_job_context[0].job_id) not in result.model_dump_json()


@pytest.mark.parametrize("mismatch", ["unpaired", "out-of-context"])
def test_invalid_prepared_evidence_is_rejected_without_exposing_job_ids(mismatch: str) -> None:
    request = make_request()
    foreign_id = uuid4()
    if mismatch == "unpaired":
        updates: dict[str, object] = {"canonical_active_job_context": []}
    else:
        updates = {
            "retrieval_evidence": [
                RetrievalEvidence(
                    job_id=foreign_id, rank=1, score=0.9, citation_key=f"job:{foreign_id}"
                )
            ]
        }
    # Simulate a corrupted internal snapshot, bypassing the API schema deliberately.
    invalid = request.model_copy(update=updates)

    with pytest.raises(ToolDispatchError) as error:
        dispatch(make_dispatcher(), invalid)

    assert error.value.code in {AgentErrorCode.TOOL_ERROR, AgentErrorCode.OUTPUT_INVALID}
    assert str(foreign_id) not in str(error.value)
    assert str(request.canonical_active_job_context[0].job_id) not in str(error.value)


@pytest.fixture
def no_matching_or_business_store(monkeypatch: pytest.MonkeyPatch) -> list[Mock]:
    boundaries = []
    for owner, name in (
        (MatchService, "match"),
        (psycopg, "connect"),
        (psycopg.AsyncConnection, "connect"),
        (socket.socket, "connect"),
    ):
        boundary = Mock(side_effect=AssertionError("Matching tool must only read request evidence"))
        monkeypatch.setattr(owner, name, boundary)
        boundaries.append(boundary)
    return boundaries


def make_comparison_request() -> RagGenerateRequest:
    payload = make_request().model_dump()
    cv_id = uuid4()
    job_id = payload["canonical_active_job_context"][0]["job_id"]
    payload.update(
        intent="CV_JOB_COMPARISON",
        consent_version="synthetic-consent-v1",
        authorized_cv_snapshot=AuthorizedCvSnapshot(
            cv_id=cv_id,
            content_hash="a" * 64,
            sanitized_text="Synthetic private CV text; never return from the matching tool.",
            skills=["Python"],
            consent_version="synthetic-consent-v1",
        ),
        matching_evidence=MatchingEvidence(
            cv_id=cv_id,
            job_id=job_id,
            overall_score=0.625,
            components={
                "required_skills": MatchingComponent(
                    score=0.5, weight=0.75, available=True, evidence=["Python"]
                )
            },
            matched_skills=["Python"],
            missing_required_skills=["Docker"],
            strengths=["Required Python skill is present"],
            gaps=["Docker is missing"],
            explanation="Synthetic deterministic evidence, not a model-generated score.",
            degraded=True,
            scoring_version="synthetic-scoring-v1",
            semantic_component_version="synthetic-semantic-v1",
        ),
    )
    return RagGenerateRequest.model_validate(payload)


def make_matching_dispatcher() -> ToolDispatcher:
    # Resolve at test time so missing T018 does not prevent existing tests collecting.
    builder = getattr(agent_tools, "build_matching_evidence_tool", None)
    assert callable(builder), "T018: build_matching_evidence_tool is not implemented"
    return ToolDispatcher(ToolRegistry((builder(),)), AllowAuthorizer())


def dispatch_matching(
    dispatcher: ToolDispatcher,
    request: RagGenerateRequest,
    *,
    tool_input: dict[str, object] | None = None,
) -> ToolResult:
    return dispatcher.dispatch(
        ToolCallDecision(
            tool_call_id="matching-call-1",
            tool_id="career.read_matching_evidence",
            input={} if tool_input is None else tool_input,
        ),
        request=build_agent_request(request),
        definition=AgentDefinition(
            capability_id="rag.generate",
            model_profile="synthetic",
            output_model=ProviderGeneration,
            tool_allowlist=frozenset({"career.read_matching_evidence"}),
        ),
        remaining_tool_calls=1,
    )


def test_matching_evidence_tool_is_read_only_with_empty_closed_input() -> None:
    builder = getattr(agent_tools, "build_matching_evidence_tool", None)
    assert callable(builder), "T018: build_matching_evidence_tool is not implemented"
    tool = builder()
    assert tool.tool_id == "career.read_matching_evidence"
    assert tool.required_operation == "rag:generate"
    assert tool.allowed_capabilities == frozenset({"rag.generate"})
    assert tool.side_effect_class is ToolSideEffect.READ_ONLY
    assert tool.input_model.model_validate({}).model_dump() == {}
    schema = tool.input_model.model_json_schema()
    assert schema.get("properties", {}) == {}
    assert schema["additionalProperties"] is False


def test_matching_evidence_returns_only_request_deterministic_evidence(
    no_matching_or_business_store: list[Mock],
) -> None:
    request = make_comparison_request()
    snapshot = request.model_dump(mode="json")

    result = dispatch_matching(make_matching_dispatcher(), request)

    assert result.tool_id == "career.read_matching_evidence"
    assert result.tool_call_id == "matching-call-1"
    assert result.output == {"matching_evidence": snapshot["matching_evidence"]}
    assert request.model_dump(mode="json") == snapshot
    for boundary in no_matching_or_business_store:
        boundary.assert_not_called()


@pytest.mark.parametrize("intent", ["JOB_SEARCH", "CV_ANALYSIS", "ADVICE"])
def test_matching_evidence_rejects_every_non_comparison_mode(
    intent: str, no_matching_or_business_store: list[Mock]
) -> None:
    # Keep otherwise valid evidence to prove the handler gates mode, not just presence.
    request = make_comparison_request().model_copy(update={"intent": intent})
    with pytest.raises(ToolDispatchError) as error:
        dispatch_matching(make_matching_dispatcher(), request)
    assert error.value.code in {AgentErrorCode.PERMISSION_DENIED, AgentErrorCode.TOOL_ERROR}
    for boundary in no_matching_or_business_store:
        boundary.assert_not_called()


@pytest.mark.parametrize(
    "invalid_context",
    [
        "missing-evidence",
        "missing-cv",
        "mismatched-cv",
        "missing-canonical-job",
        "missing-retrieved-job",
        "mismatched-job",
    ],
)
def test_matching_evidence_rejects_absent_or_mismatched_cv_job_references(
    invalid_context: str, no_matching_or_business_store: list[Mock]
) -> None:
    request = make_comparison_request()
    assert request.matching_evidence is not None
    foreign_id = uuid4()
    updates: dict[str, object]
    if invalid_context == "missing-evidence":
        updates = {"matching_evidence": None}
    elif invalid_context == "missing-cv":
        updates = {"authorized_cv_snapshot": None}
    elif invalid_context == "missing-canonical-job":
        updates = {"canonical_active_job_context": []}
    elif invalid_context == "missing-retrieved-job":
        updates = {"retrieval_evidence": []}
    else:
        reference = "cv_id" if invalid_context == "mismatched-cv" else "job_id"
        updates = {
            "matching_evidence": request.matching_evidence.model_copy(
                update={reference: foreign_id}
            )
        }
    # Bypass API validation to exercise the tool's own request-context checks.
    invalid = request.model_copy(update=updates)

    with pytest.raises(ToolDispatchError) as error:
        dispatch_matching(make_matching_dispatcher(), invalid)

    assert error.value.code in {AgentErrorCode.TOOL_ERROR, AgentErrorCode.OUTPUT_INVALID}
    assert str(foreign_id) not in str(error.value)
    assert str(request.matching_evidence.cv_id) not in str(error.value)
    assert str(request.matching_evidence.job_id) not in str(error.value)
    assert request.authorized_cv_snapshot.sanitized_text not in str(error.value)
    for boundary in no_matching_or_business_store:
        boundary.assert_not_called()


@pytest.mark.parametrize(
    "tool_input",
    [
        {"cv_id": str(uuid4())},
        {"job_id": str(uuid4())},
        {"user_id": str(uuid4())},
        {"matching_evidence": {"overall_score": 1.0}},
    ],
    ids=["cv-selector", "job-selector", "principal-selector", "score-override"],
)
def test_matching_evidence_rejects_model_selectors_and_score_overrides(
    tool_input: dict[str, object], no_matching_or_business_store: list[Mock]
) -> None:
    with pytest.raises(ToolDispatchError) as error:
        dispatch_matching(
            make_matching_dispatcher(), make_comparison_request(), tool_input=tool_input
        )
    assert error.value.code is AgentErrorCode.INVALID_INPUT
    for boundary in no_matching_or_business_store:
        boundary.assert_not_called()


def test_matching_evidence_reused_tool_reads_only_current_request(
    no_matching_or_business_store: list[Mock],
) -> None:
    dispatcher = make_matching_dispatcher()
    first = make_comparison_request()
    second = make_comparison_request()
    second.identity.user_id = first.identity.user_id
    second.identity.session_id = first.identity.session_id
    first_result = dispatch_matching(dispatcher, first)
    first_snapshot = first_result.model_dump(mode="json")

    second_result = dispatch_matching(dispatcher, second)

    assert second_result.output == {
        "matching_evidence": second.matching_evidence.model_dump(mode="json")
    }
    assert str(first.matching_evidence.cv_id) not in second_result.model_dump_json()
    assert str(first.matching_evidence.job_id) not in second_result.model_dump_json()
    assert first_result.model_dump(mode="json") == first_snapshot
    for boundary in no_matching_or_business_store:
        boundary.assert_not_called()
