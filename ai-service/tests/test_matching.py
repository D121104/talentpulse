from app.domain.contracts import CVProfile, JobProfile, MatchRequest
from app.domain.matching import MatchService


def request(candidate: CVProfile, job: JobProfile) -> MatchRequest:
    from uuid import uuid4

    return MatchRequest(cv_id=uuid4(), job_id=uuid4(), candidate=candidate, job=job)


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
