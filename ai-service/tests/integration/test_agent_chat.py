from uuid import UUID, uuid4

import pytest
from tests.unit.rag_chatbot.test_rag import generate_request, job

from talentpulse_ai.agent_foundation.contracts import FinalDecision, ToolCallDecision
from talentpulse_ai.core.exceptions import ServiceError
from talentpulse_ai.modules.rag_chatbot.agent import CareerChatAgent
from talentpulse_ai.modules.rag_chatbot.generation.generator import GenerationService
from talentpulse_ai.modules.rag_chatbot.schemas import (
    AuthorizedCvSnapshot,
    ExplicitFilters,
    IdentityFields,
    ProviderGeneration,
    RagGenerateRequest,
    RetrievalEvidence,
    ServicePolicy,
    StructuredFilterState,
)


def test_agent_provider_failure_returns_degraded_api_fallback(client, monkeypatch) -> None:
    from talentpulse_ai.core.exceptions import ProviderFailure, ProviderFailureDetails

    calls = []

    def fail(*args, **kwargs):
        calls.append(True)
        raise ProviderFailure(
            "SYNTHETIC_PRIVATE_PROVIDER_MESSAGE",
            details=ProviderFailureDetails(
                provider="gemini",
                model="synthetic-model",
                category="rate_limited",
                provider_status=429,
                provider_code="SyntheticQuotaExceeded",
            ),
        )

    agent = CareerChatAgent(model=FixedProvider())
    monkeypatch.setattr(agent._model, "decide", fail)
    monkeypatch.setattr(client.app.state, "generation_service", agent)
    request = make_request(session_id=uuid4(), history=[], message="Interview advice")
    response = client.post("/internal/v1/rag/generate", json=request.model_dump(mode="json"))

    assert calls
    assert response.status_code == 200
    assert response.json()["answer_status"] == "DEGRADED"
    assert response.json()["source"] == "deterministic_fallback"
    assert response.json()["fallbackReason"] == "provider_error"


class FixedProvider:
    def __init__(self) -> None:
        self.prompts: list[str] = []

    def decide(
        self, prompt: str, *, timeout: float | None = None, **kwargs: object
    ) -> FinalDecision:
        del kwargs
        self.prompts.append(prompt)
        assert timeout is not None and 0 < timeout <= 24
        return FinalDecision(
            output={
                "answer_blocks": [{"kind": "ADVICE", "text": "Prepare concise examples."}],
                "claims": [],
                "citation_keys": [],
                "referenced_job_ids": [],
            }
        )


class SequenceProvider:
    def __init__(self, *decisions) -> None:
        self.decisions = list(decisions)
        self.prompts: list[str] = []

    def decide(self, prompt: str, *, timeout: float | None = None, **kwargs: object):
        del kwargs
        self.prompts.append(prompt)
        assert timeout is not None and timeout > 0
        decision = self.decisions.pop(0)
        if isinstance(decision, ToolCallDecision):
            return decision
        return FinalDecision(output=decision)


def make_request(
    *,
    session_id: UUID,
    history: list[str],
    message: str,
) -> RagGenerateRequest:
    return RagGenerateRequest(
        identity=IdentityFields(
            request_id=uuid4(),
            trace_id=uuid4(),
            operation_attempt_id=uuid4(),
            client_message_id=uuid4(),
            user_id=uuid4(),
            session_id=session_id,
        ),
        normalized_user_message=message,
        intent="ADVICE",
        locale="en",
        recent_history=history,
        filter_state=StructuredFilterState(),
        explicit_filters=ExplicitFilters(),
        policy=ServicePolicy(data_scope="PUBLIC_ACTIVE_JOBS", max_candidates=20),
    )


def test_two_request_scoped_turns_use_only_their_supplied_history() -> None:
    session_id = uuid4()
    first = make_request(
        session_id=session_id,
        history=["FIRST_REQUEST_HISTORY_ONLY"],
        message="FIRST_REQUEST_CURRENT_TURN",
    )
    second = make_request(
        session_id=session_id,
        history=["SECOND_REQUEST_SUPPLIED_HISTORY"],
        message="SECOND_REQUEST_CURRENT_TURN",
    )
    provider = FixedProvider()
    agent = CareerChatAgent(model=provider)

    first_response = agent.generate(first)
    second_response = agent.generate(second)

    assert first_response.request_id == first.identity.request_id
    assert second_response.request_id == second.identity.request_id
    assert first_response.answer_blocks[0].text == "Prepare concise examples."
    assert second_response.answer_blocks[0].text == "Prepare concise examples."
    assert "FIRST_REQUEST_HISTORY_ONLY" in provider.prompts[0]
    assert "FIRST_REQUEST_CURRENT_TURN" in provider.prompts[0]
    assert "SECOND_REQUEST_SUPPLIED_HISTORY" in provider.prompts[1]
    assert "SECOND_REQUEST_CURRENT_TURN" in provider.prompts[1]
    assert "FIRST_REQUEST_HISTORY_ONLY" not in provider.prompts[1]
    assert "FIRST_REQUEST_CURRENT_TURN" not in provider.prompts[1]


def test_job_search_uses_prepared_context_tool_and_preserves_filters() -> None:
    canonical_job = job()
    request = generate_request(
        jobs=[canonical_job],
        evidence=[
            {
                "job_id": canonical_job["job_id"],
                "rank": 1,
                "score": 0.8,
                "citation_key": "job:1",
            }
        ],
    )
    request.filter_state = StructuredFilterState(location="Remote", skills=["Python"])
    context = request.canonical_active_job_context[0]
    output = ProviderGeneration(
        answer_blocks=[{"kind": "INFERENCE", "text": "Python Engineer at Acme is remote."}],
        claims=GenerationService._canonical_job_claims(context, "job:1"),
        citation_keys=["job:1"],
        referenced_job_ids=[context.job_id],
    ).model_dump(mode="json")
    provider = SequenceProvider(
        ToolCallDecision(
            tool_call_id="retrieve-current-context",
            tool_id="rag.retrieve_context",
            input={},
        ),
        output,
    )

    response = CareerChatAgent(model=provider).generate(request)

    assert response.answer_status == "COMPLETE"
    assert response.filters == request.filter_state
    assert response.citation_keys == ["job:1"]
    assert response.referenced_job_ids == [context.job_id]
    assert len(provider.prompts) == 2
    assert "Python Engineer" not in provider.prompts[0]
    assert "Python Engineer" in provider.prompts[1]
    assert "UNTRUSTED TOOL RESULTS" in provider.prompts[1]


def test_empty_job_search_returns_no_evidence_fallback() -> None:
    request = generate_request()
    provider = FixedProvider()

    response = CareerChatAgent(model=provider).generate(request)

    assert response.answer_status == "NO_EVIDENCE"
    assert response.source == "deterministic_fallback"
    assert response.citation_keys == []
    assert response.referenced_job_ids == []
    assert response.filters == request.filter_state


def test_advice_uses_licensed_skill_framework_for_mid_level_developer_question() -> None:
    request = make_request(
        session_id=uuid4(),
        history=[],
        message="What skills should a middle developer have?",
    )
    provider = SequenceProvider(
        ToolCallDecision(
            tool_call_id="lookup-software-developer-skills",
            tool_id="career.lookup_skill_framework",
            input={"occupation_query": "Middle Developer"},
        ),
        {
            "answer_blocks": [
                {
                    "kind": "ADVICE",
                    "text": (
                        "As a general occupation-wide reference, O*NET lists programming "
                        "and systems analysis. It does not define a middle-level benchmark. "
                        "Source: O*NET 31.0, CC BY 4.0."
                    ),
                }
            ],
            "claims": [],
            "citation_keys": [],
            "referenced_job_ids": [],
        },
    )

    response = CareerChatAgent(model=provider).generate(request)

    assert response.answer_status == "COMPLETE"
    assert len(provider.prompts) == 2
    assert "APPLICATION-DEFINED TOOL CATALOG" in provider.prompts[0]
    assert "career.lookup_skill_framework" in provider.prompts[0]
    assert "standard occupation title" in provider.prompts[0]
    assert "15-1252.00" in provider.prompts[1]
    assert "Programming" in provider.prompts[1]
    assert "level_suppression" in provider.prompts[1]
    assert "CC BY 4.0" in provider.prompts[1]
    assert response.answer_blocks[0].text.startswith("As a general occupation-wide reference")
    assert len(response.answer_blocks) == 1
    assert "O*NET 31.0 Database" not in response.answer_blocks[0].text
    assert "Database terms:" not in response.answer_blocks[0].text


def test_missing_canonical_context_is_a_controlled_error_not_empty_search() -> None:
    request = generate_request()
    request.retrieval_evidence = [
        RetrievalEvidence(job_id=uuid4(), rank=1, score=0.8, citation_key="job:unhydrated")
    ]
    provider = SequenceProvider(
        ToolCallDecision(
            tool_call_id="retrieve-current-context",
            tool_id="rag.retrieve_context",
            input={},
        )
    )

    with pytest.raises(ServiceError) as error:
        CareerChatAgent(model=provider).generate(request)

    assert error.value.status_code == 503
    assert "unhydrated" not in str(error.value)


def test_repair_is_attempted_once_then_fails_closed() -> None:
    canonical_job = job()
    request = generate_request(
        jobs=[canonical_job],
        evidence=[
            {
                "job_id": canonical_job["job_id"],
                "rank": 1,
                "score": 0.8,
                "citation_key": "job:1",
            }
        ],
    )
    invalid = ProviderGeneration(
        answer_blocks=[{"kind": "INFERENCE", "text": "Unsupported job claim."}],
        claims=[],
        citation_keys=["job:unknown"],
        referenced_job_ids=[canonical_job["job_id"]],
    ).model_dump(mode="json")
    provider = SequenceProvider(invalid, invalid)

    with pytest.raises(ServiceError):
        CareerChatAgent(model=provider).generate(request)

    assert len(provider.prompts) == 2
    assert "Return valid structured output only" in provider.prompts[1]


def test_cv_analysis_uses_only_the_authorized_snapshot() -> None:
    cv = AuthorizedCvSnapshot(
        cv_id=uuid4(),
        content_hash="a" * 64,
        sanitized_text="Private synthetic CV text.",
        skills=["Python"],
        consent_version="consent-v1",
    )
    request = generate_request("CV_ANALYSIS", cv=cv, consent_version="consent-v1", locale="en")
    provider = SequenceProvider(
        ToolCallDecision(
            tool_call_id="read-authorized-context",
            tool_id="rag.retrieve_context",
            input={},
        ),
        ProviderGeneration(
            answer_blocks=[{"kind": "ADVICE", "text": "Your CV lists Python."}],
            claims=[
                {
                    "claim_id": "cv-skill-python",
                    "type": "CV_SKILL",
                    "subject_id": cv.cv_id,
                    "value": "Python",
                }
            ],
        ).model_dump(mode="json"),
    )

    response = CareerChatAgent(model=provider).generate(request)

    assert response.answer_status == "COMPLETE"
    assert response.claims[0].subject_id == cv.cv_id
    assert "Private synthetic CV text." not in provider.prompts[0]
    assert "Private synthetic CV text." in provider.prompts[1]
    assert response.referenced_job_ids == []


def test_cv_job_comparison_uses_authorized_deterministic_match_evidence() -> None:
    canonical_job = job()
    cv_id = uuid4()
    cv = AuthorizedCvSnapshot(
        cv_id=cv_id,
        content_hash="b" * 64,
        sanitized_text="Private comparison CV text.",
        skills=["Python"],
        consent_version="consent-v2",
    )
    evidence = {
        "cv_id": cv_id,
        "job_id": canonical_job["job_id"],
        "overall_score": 0.625,
        "components": {},
        "matched_skills": ["Python"],
        "missing_required_skills": ["Docker"],
        "strengths": ["Python is present"],
        "gaps": ["Docker is missing"],
        "explanation": "Deterministic synthetic score.",
        "degraded": False,
        "scoring_version": "score-v1",
        "semantic_component_version": "semantic-v1",
    }
    request = generate_request(
        "CV_JOB_COMPARISON",
        jobs=[canonical_job],
        evidence=[
            {
                "job_id": canonical_job["job_id"],
                "rank": 1,
                "score": 0.9,
                "citation_key": "job:comparison",
            }
        ],
        cv=cv,
        consent_version="consent-v2",
        matching_evidence=evidence,
    )
    provider = SequenceProvider(
        ToolCallDecision(
            tool_call_id="read-canonical-job-context",
            tool_id="rag.retrieve_context",
            input={},
        ),
        ToolCallDecision(
            tool_call_id="read-deterministic-match",
            tool_id="career.read_matching_evidence",
            input={},
        ),
        {"explanation": "Match score: 0.625. Python is matched and Docker is a gap."},
    )

    response = CareerChatAgent(model=provider).generate(request)

    assert response.answer_status == "COMPLETE"
    assert response.citation_keys == ["job:comparison"]
    assert response.referenced_job_ids == [canonical_job["job_id"]]
    matching_claim = next(claim for claim in response.claims if claim.type == "INFERENCE")
    assert matching_claim.value["overall_score"] == 0.625
    assert len(provider.prompts) == 3
    assert "Private comparison CV text." not in provider.prompts[0]


def test_mismatched_cv_evidence_fails_without_exposing_cv_text() -> None:
    canonical_job = job()
    cv_id = uuid4()
    cv = AuthorizedCvSnapshot(
        cv_id=cv_id,
        content_hash="c" * 64,
        sanitized_text="Private CV text must not appear in errors.",
        skills=["Python"],
        consent_version="consent-v3",
    )
    evidence = {
        "cv_id": cv_id,
        "job_id": canonical_job["job_id"],
        "overall_score": 0.5,
        "components": {},
        "matched_skills": [],
        "missing_required_skills": [],
        "strengths": [],
        "gaps": [],
        "explanation": "Invalid cross-CV evidence.",
        "degraded": False,
        "scoring_version": "score-v1",
        "semantic_component_version": "semantic-v1",
    }
    request = generate_request(
        "CV_JOB_COMPARISON",
        jobs=[canonical_job],
        evidence=[
            {
                "job_id": canonical_job["job_id"],
                "rank": 1,
                "score": 0.9,
                "citation_key": "job:comparison",
            }
        ],
        cv=cv,
        consent_version="consent-v3",
        matching_evidence=evidence,
    )
    request = request.model_copy(
        update={
            "matching_evidence": request.matching_evidence.model_copy(update={"cv_id": uuid4()})
        }
    )
    provider = SequenceProvider(
        ToolCallDecision(
            tool_call_id="read-invalid-match",
            tool_id="career.read_matching_evidence",
            input={},
        )
    )

    with pytest.raises(ServiceError) as error:
        CareerChatAgent(model=provider).generate(request)

    assert error.value.status_code == 503
    assert "Private CV text must not appear in errors." not in str(error.value)
