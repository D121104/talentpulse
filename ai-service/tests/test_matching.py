from __future__ import annotations

from uuid import uuid4

from app.application.generation import DeterministicGenerationProvider
from app.core.config import Settings, get_settings
from app.domain.contracts import CVProfile, JobProfile, MatchRequest
from app.domain.matching import MatchService
from app.infrastructure.rag_providers import InMemoryVectorRetriever
from app.main import create_app
from fastapi.testclient import TestClient


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


class SpyEmbedding:
    dimensions = 4
    model_name = "deterministic-match-v1"

    def __init__(self) -> None:
        self.queries: list[str] = []

    def embed_query(self, text: str) -> list[float]:
        self.queries.append(text)
        return [1.0, 0.0, 0.0, 0.0]


def test_match_route_uses_composition_root_embedding_provider() -> None:
    valid_match_payload: dict[str, object] = {
        "identity": {
            "request_id": str(uuid4()),
            "trace_id": str(uuid4()),
            "operation_attempt_id": str(uuid4()),
        },
        "cv_id": str(uuid4()),
        "job_id": str(uuid4()),
        "content_hash": "a" * 64,
        "content_version": "cv-content-v1",
        "job_source_version": "job-source-v1",
        "idempotency_key": "cv-match:test:cv-content-v1:job-source-v1",
        "locale": "en",
        "candidate": {
            "skills": ["Python", "PostgreSQL"],
            "years_experience": 4.0,
            "level": "mid",
            "location": "Hanoi",
            "work_modes": ["hybrid"],
        },
        "job": {
            "required_skills": ["python", "Docker"],
            "preferred_skills": ["PostgreSQL"],
            "min_years_experience": 3.0,
            "level": "mid",
            "location": "Hanoi",
        },
    }
    settings = Settings(auth_required=False)
    embedding = SpyEmbedding()
    application = create_app(
        settings,
        embedding_provider=embedding,
        vector_retriever=InMemoryVectorRetriever(dimensions=4),
        generation_provider=DeterministicGenerationProvider(),
    )
    application.dependency_overrides[get_settings] = lambda: settings

    try:
        with TestClient(application) as client:
            response = client.post("/internal/v1/cv/match", json=valid_match_payload)
    finally:
        application.dependency_overrides.clear()

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["degraded"] is False
    assert body["semantic_component_version"] == "deterministic-match-v1"
    assert body["components"]["semantic"]["available"] is True
    assert len(embedding.queries) == 2
