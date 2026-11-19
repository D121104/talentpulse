from __future__ import annotations

from unittest.mock import Mock

import pytest

from talentpulse_ai.core.exceptions import ProviderFailure, ProviderFailureDetails
from talentpulse_ai.modules.cv_analysis.matching import EmbeddingSemanticScorer, MatchService
from talentpulse_ai.modules.cv_analysis.schemas import CVProfile, JobProfile, MatchRequest


def request(candidate: CVProfile, job: JobProfile) -> MatchRequest:
    from uuid import uuid4

    return MatchRequest(
        identity={
            "request_id": uuid4(),
            "trace_id": uuid4(),
            "operation_attempt_id": uuid4(),
        },
        cv_id=uuid4(),
        job_id=uuid4(),
        content_hash="a" * 64,
        content_version="cv-content-v1",
        job_source_version="job-source-v1",
        idempotency_key="cv-match:test:cv-content-v1:job-source-v1",
        locale="en",
        candidate=candidate,
        job=job,
    )


def test_skill_scoring_normalizes_case_and_punctuation() -> None:
    result = MatchService().match(
        request(
            CVProfile(skills=["Node.js", "Python"]),
            JobProfile(required_skills=["nodejs", "python", "Docker"]),
        )
    )
    assert result.components["skills"].score == 2 / 3
    assert result.matched_skills == ["nodejs", "python"]
    assert result.missing_required_skills == ["Docker"]


def test_missing_semantic_component_renormalizes_weights() -> None:
    candidate = CVProfile(skills=["Python"])
    job = JobProfile(required_skills=["Python"])
    result = MatchService().match(request(candidate, job))
    assert result.degraded is True
    assert "semantic" not in result.components
    assert result.components["skills"].weight == 1.0
    assert result.overall_score == 1.0


def test_semantic_component_is_optional_and_versioned() -> None:
    class FakeSemantic:
        version = "fake-v1"

        def score(self, candidate, job):
            return 0.5

    result = MatchService(FakeSemantic()).match(request(CVProfile(), JobProfile()))
    assert result.degraded is False
    assert result.semantic_component_version == "fake-v1"
    assert result.components["semantic"].weight == 1.0


def test_grouped_skills_match_atomic_aliases() -> None:
    result = MatchService().match(
        request(
            CVProfile(
                skills=[
                    "Front-end NextJS, TypeScript, HTML, CSS, Ant Design.",
                    "Database PostgreSQL, MySQL, MongoDB, Redis, ClickHouse",
                ]
            ),
            JobProfile(required_skills=["Next.js", "TypeScript", "Postgres", "Redis"]),
        )
    )
    assert result.components["skills"].score == 1.0
    assert result.matched_skills == ["Next.js", "TypeScript", "Postgres", "Redis"]
    assert result.missing_required_skills == []
    assert result.scoring_version == "cv-job-match-v3"


def test_missing_extraction_is_not_known_skill_mismatch() -> None:
    unknown = MatchService().match(request(CVProfile(), JobProfile(required_skills=["Java"])))
    assert unknown.components["skills"].available is False
    assert unknown.missing_required_skills == []
    mismatch = MatchService().match(
        request(
            CVProfile(skills=["JavaScript"]),
            JobProfile(required_skills=["Java"]),
        )
    )
    assert mismatch.components["skills"].available is True
    assert mismatch.components["skills"].score == 0.0
    assert mismatch.missing_required_skills == ["Java"]


@pytest.mark.parametrize("failed_call", [1, 2])
def test_embedding_provider_failure_logs_correlated_event_and_degrades(failed_call, caplog):
    provider = Mock()
    failure = ProviderFailure(
        "private embedding exception with PrivateCandidateSkill and PrivateJobSkill",
        details=ProviderFailureDetails(
            provider="cohere",
            model="embed-multilingual-v3.0",
            category="rate_limited",
            provider_status=429,
            exception_type="HTTPError",
            duration_ms=17,
        ),
    )
    provider.embed_query.side_effect = [failure] if failed_call == 1 else [[1.0, 0.0], failure]
    match_request = request(
        CVProfile(skills=["Python", "PrivateCandidateSkill"]),
        JobProfile(required_skills=["Python", "PrivateJobSkill"]),
    )
    with caplog.at_level("WARNING"):
        result = MatchService(EmbeddingSemanticScorer(provider)).match(match_request)
    assert result.degraded is True
    assert "semantic" not in result.components
    assert result.components["skills"].weight == 1.0
    assert result.overall_score == 0.5
    assert result.request_id == match_request.identity.request_id
    assert result.trace_id == match_request.identity.trace_id
    assert provider.embed_query.call_count == failed_call
    events = [r for r in caplog.records if r.getMessage().startswith("ai_provider_failure ")]
    assert len(events) == 1
    fields = dict(item.split("=", 1) for item in events[0].getMessage().split()[1:])
    assert (
        fields.items()
        >= {
            "capability": "cv_analysis",
            "operation": "embed_query",
            "attempt": "single",
            "provider": "cohere",
            "model": "embed-multilingual-v3.0",
            "category": "rate_limited",
            "provider_status": "429",
            "request_id": str(match_request.identity.request_id),
            "trace_id": str(match_request.identity.trace_id),
        }.items()
    )
    assert fields["attempt_index"] == str(failed_call)
    for private in ("private embedding exception", "PrivateCandidateSkill", "PrivateJobSkill"):
        assert private not in caplog.text
    assert all(record.exc_info is None for record in caplog.records)


@pytest.mark.parametrize("failure", [TypeError("private scorer bug"), ValueError("private bug")])
def test_local_embedding_errors_are_not_classified_as_provider_failures(failure, caplog):
    provider = Mock()
    provider.embed_query.side_effect = failure
    with caplog.at_level("WARNING"):
        result = MatchService(EmbeddingSemanticScorer(provider)).match(
            request(CVProfile(skills=["Python"]), JobProfile(required_skills=["Python"]))
        )
    assert result.degraded is True
    assert "ai_provider_failure" not in caplog.text
    assert "category=provider" not in caplog.text
    assert str(failure) not in caplog.text
