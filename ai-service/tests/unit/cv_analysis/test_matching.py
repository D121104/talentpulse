from __future__ import annotations

from talentpulse_ai.modules.cv_analysis.matching import MatchService
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
