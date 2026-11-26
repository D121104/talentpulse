from uuid import uuid4

from fastapi.testclient import TestClient

from talentpulse_ai.core.config import Settings, get_settings
from talentpulse_ai.infrastructure.llm.deterministic import DeterministicGenerationProvider
from talentpulse_ai.infrastructure.vectorstore.memory import InMemoryVectorRetriever
from talentpulse_ai.main import create_app


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
