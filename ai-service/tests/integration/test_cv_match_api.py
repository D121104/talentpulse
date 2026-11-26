from uuid import uuid4

from fastapi.testclient import TestClient

from talentpulse_ai.core.config import Settings, get_settings
from talentpulse_ai.infrastructure.llm.deterministic import DeterministicGenerationProvider
from talentpulse_ai.infrastructure.vectorstore.memory import InMemoryVectorRetriever
from talentpulse_ai.main import create_app


def test_embedding_failure_preserves_degraded_match_contract(
    client, valid_match_payload, monkeypatch
) -> None:
    from talentpulse_ai.core.exceptions import ProviderFailure, ProviderFailureDetails

    calls = []

    def fail(*args, **kwargs):
        calls.append(True)
        raise ProviderFailure(
            "SYNTHETIC_PRIVATE_PROVIDER_MESSAGE",
            details=ProviderFailureDetails(
                provider="cohere",
                model="synthetic-model",
                category="rate_limited",
                provider_status=429,
                provider_code="SyntheticQuotaExceeded",
            ),
        )

    monkeypatch.setattr(client.app.state.embedding_provider, "embed_query", fail)
    response = client.post("/internal/v1/cv/match", json=valid_match_payload)

    assert calls
    assert response.status_code == 200
    body = response.json()
    assert body["degraded"] is True
    assert "semantic" not in body["components"]
    for key, value in valid_match_payload["identity"].items():
        assert body[key] == value
    for key in (
        "cv_id",
        "job_id",
        "content_hash",
        "content_version",
        "job_source_version",
        "idempotency_key",
        "locale",
    ):
        assert body[key] == valid_match_payload[key]
    for internal in (
        "ai_provider_failure",
        "SYNTHETIC_PRIVATE_PROVIDER_MESSAGE",
        "category",
        "provider_status",
        "provider_code",
        "provider_message",
        "SyntheticQuotaExceeded",
        "synthetic-model",
    ):
        assert internal not in response.text


def test_analysis_provider_failure_preserves_controlled_error(client, monkeypatch) -> None:
    from unittest.mock import Mock

    from tests.unit.cv_analysis.test_analysis import payload

    from talentpulse_ai.core.exceptions import ProviderFailure, ProviderFailureDetails
    from talentpulse_ai.infrastructure.llm.ollama import OllamaGenerationAdapter

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

    provider = Mock(spec=OllamaGenerationAdapter)
    provider.generate_structured.side_effect = fail
    monkeypatch.setattr(client.app.state.match_analysis_service, "provider", provider)
    response = client.post("/internal/v1/cv/match-analysis", json=payload())

    assert calls
    assert response.status_code == 502
    assert response.json() == {
        "code": "analysis_provider_failed",
        "message": "Analysis generation failed.",
    }


def test_hosted_analysis_keeps_response_contract_and_rejects_unsupported_evidence(
    client, monkeypatch
) -> None:
    from tests.unit.cv_analysis.test_analysis import output, payload

    from talentpulse_ai.modules.cv_analysis.schemas import MatchAnalysisRequest

    class HostedProvider:
        provider_name = "gemini"
        model_name = "synthetic-gemini"

        def __init__(self, result):
            self.result = result

        def generate_structured(self, prompt, schema, timeout=None, *, num_predict=None):
            return self.result

    raw_request = payload()
    request = MatchAnalysisRequest.model_validate(raw_request)
    provider = HostedProvider(output(request))
    monkeypatch.setattr(client.app.state.match_analysis_service, "provider", provider)
    response = client.post("/internal/v1/cv/match-analysis", json=raw_request)

    assert response.status_code == 200
    assert response.json()["identity"] == raw_request["identity"]
    assert response.json()["analysis_version_key"] == "a" * 64
    assert response.json()["narrative_version"] == "match-narrative-v1"
    assert response.json()["source"] == "llm"

    invalid = output(request)
    invalid["strengths"][0]["evidence"] = ["g0"]
    monkeypatch.setattr(
        client.app.state.match_analysis_service, "provider", HostedProvider(invalid)
    )
    rejected = client.post("/internal/v1/cv/match-analysis", json=raw_request)
    assert rejected.status_code == 502
    assert rejected.json()["code"] == "invalid_analysis_output"


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
