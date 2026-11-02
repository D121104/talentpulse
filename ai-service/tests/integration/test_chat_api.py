import pytest
from fastapi.testclient import TestClient

from talentpulse_ai.core.config import Settings
from talentpulse_ai.infrastructure.embeddings.model import (
    CohereEmbeddingAdapter,
    DeterministicEmbeddingProvider,
)
from talentpulse_ai.infrastructure.vectorstore.memory import InMemoryVectorRetriever
from talentpulse_ai.infrastructure.vectorstore.qdrant import QdrantVectorRetriever
from talentpulse_ai.main import create_app


class NullProvider:
    def generate(self, prompt: str) -> object:
        del prompt
        return None


def test_health_endpoints_keep_compatibility_and_are_local_only() -> None:
    settings = Settings(auth_required=False)
    application = create_app(
        settings,
        embedding_provider=DeterministicEmbeddingProvider(settings.cohere_dimensions),
        vector_retriever=InMemoryVectorRetriever(dimensions=settings.cohere_dimensions),
    )
    with TestClient(application) as client:
        assert client.get("/health/live").status_code == 200
        assert client.get("/health").json() == {"status": "ok"}
        assert client.get("/health/ready").json() == {"status": "ok"}


def test_readiness_failure_is_sanitized_and_returns_503() -> None:
    settings = Settings(auth_required=False)
    application = create_app(
        settings,
        embedding_provider=DeterministicEmbeddingProvider(settings.cohere_dimensions),
        vector_retriever=InMemoryVectorRetriever(dimensions=settings.cohere_dimensions),
    )
    application.state.vector_provider = object()

    with TestClient(application) as client:
        response = client.get("/health/ready")

    assert response.status_code == 503
    assert response.json() == {
        "status": "not_ready",
        "code": "not_ready",
        "message": "Service is not ready.",
    }


def test_non_local_readiness_checks_configuration_without_provider_calls() -> None:
    settings = Settings(
        environment="demo",
        auth_required=True,
        jwt_algorithms=("RS256",),
        jwt_public_key="configured-public-key",
        jwt_issuer="https://issuer.example",
        jwt_audience="talentpulse-ai",
        jwt_subject="talentpulse-backend",
        embedding_provider="cohere",
        vector_store_provider="qdrant",
        generation_provider="bedrock",
        qdrant_url="https://qdrant.example",
        qdrant_collection="jobs_v1",
        qdrant_alias="jobs_current",
        qdrant_index_version="demo-v1",
        bedrock_region="ap-southeast-2",
        bedrock_model="amazon.nova-lite-v1:0",
    )
    embedding = CohereEmbeddingAdapter(object(), settings.cohere_model, settings.cohere_dimensions)
    vector = QdrantVectorRetriever(
        object(),
        settings.qdrant_collection,
        collection_alias=settings.qdrant_alias,
        index_version=settings.qdrant_index_version,
        dimensions=settings.cohere_dimensions,
    )
    application = create_app(
        settings,
        embedding_provider=embedding,
        vector_retriever=vector,
        generation_provider=NullProvider(),
    )

    with TestClient(application) as client:
        response = client.get("/health/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.parametrize(
    ("subject", "scope", "status_code", "error_code"),
    [
        ("untrusted-service", "rag:retrieve", 401, "invalid_bearer_token"),
        (None, "rag:retrieve", 401, "invalid_bearer_token"),
        ("talentpulse-backend", "rag:generate", 403, "insufficient_scope"),
        ("talentpulse-backend", None, 403, "insufficient_scope"),
    ],
)
def test_non_local_rag_auth_requires_exact_subject_and_endpoint_scope(
    client,
    non_local_auth,
    valid_rag_retrieve_payload,
    subject,
    scope,
    status_code,
    error_code,
) -> None:
    _, token = non_local_auth
    response = client.post(
        "/internal/v1/rag/retrieve",
        json=valid_rag_retrieve_payload,
        headers={"Authorization": f"Bearer {token(subject=subject, scope=scope)}"},
    )

    assert response.status_code == status_code
    assert response.json()["detail"]["code"] == error_code


def test_non_local_rag_auth_accepts_valid_claims(
    client, non_local_auth, valid_rag_retrieve_payload
) -> None:
    _, token = non_local_auth
    response = client.post(
        "/internal/v1/rag/retrieve",
        json=valid_rag_retrieve_payload,
        headers={"Authorization": f"Bearer {token(scope='rag:retrieve')}"},
    )

    assert response.status_code == 200
