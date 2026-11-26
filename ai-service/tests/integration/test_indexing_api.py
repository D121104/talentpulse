import time

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from tests.indexing_fixtures import FakeEmbedding, FakeGeneration, FakeVector, make_upsert

from talentpulse_ai.core.config import Settings, get_settings
from talentpulse_ai.main import create_app


@pytest.mark.parametrize("boundary", ["embed_document", "upsert_point", "delete_point"])
def test_indexing_provider_failure_preserves_error_and_retry_contract(boundary, monkeypatch):
    from tests.indexing_fixtures import make_delete

    from talentpulse_ai.core.exceptions import ProviderFailure, ProviderFailureDetails

    embedding, vector = FakeEmbedding(), FakeVector()
    application = create_app(
        Settings(environment="test", auth_required=False),
        embedding_provider=embedding,
        vector_retriever=vector,
        generation_provider=FakeGeneration(),
    )
    application.dependency_overrides[get_settings] = lambda: Settings(
        environment="test", auth_required=False
    )
    target = embedding if boundary == "embed_document" else vector
    original = getattr(target, boundary)
    calls = []

    def fail(*args, **kwargs):
        calls.append(True)
        raise ProviderFailure(
            "SYNTHETIC_PRIVATE_PROVIDER_MESSAGE",
            details=ProviderFailureDetails(
                provider="cohere" if boundary == "embed_document" else "qdrant",
                model="synthetic-model",
                category="rate_limited",
                provider_status=429,
                provider_code="SyntheticQuotaExceeded",
            ),
        )

    request = make_upsert()
    if boundary == "delete_point":
        request = make_delete(request.job.job_id)
    path = "/internal/v1/index/jobs/" + ("delete" if boundary == "delete_point" else "upsert")
    payload = request.model_dump(mode="json")
    monkeypatch.setattr(target, boundary, fail)
    with TestClient(application) as client:
        failed = client.post(path, json=payload)
        assert calls
        assert failed.status_code == 503
        assert failed.json() == {
            "code": "index_unavailable",
            "message": "Job indexing is temporarily unavailable.",
        }
        monkeypatch.setattr(target, boundary, original)
        retried = client.post(path, json=payload)
        replay = client.post(path, json=payload)

    assert retried.status_code == replay.status_code == 200
    assert retried.json() == replay.json()
    body = retried.json()
    for key, value in payload["identity"].items():
        assert body[key] == value
    assert "idempotency_key" not in body
    assert len(vector.deletes if boundary == "delete_point" else vector.upserts) == 1
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
        assert internal not in retried.text


def test_jobs_index_scope_allows_valid_token_and_rejects_wrong_scope() -> None:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    settings = Settings(
        environment="demo",
        auth_required=True,
        jwt_algorithms=("RS256",),
        jwt_public_key=private_key.public_key()
        .public_bytes(
            serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode(),
        jwt_issuer="https://issuer.example",
        jwt_audience="talentpulse-ai",
        jwt_subject="indexer",
        embedding_provider="cohere",
        vector_store_provider="qdrant",
        generation_provider="bedrock",
    )
    embedding = FakeEmbedding()
    vector = FakeVector()
    application = create_app(
        settings,
        embedding_provider=embedding,
        vector_retriever=vector,
        generation_provider=FakeGeneration(),
    )
    application.dependency_overrides[get_settings] = lambda: settings
    payload = make_upsert().model_dump(mode="json")

    def token(scope: str, subject: str = "indexer") -> str:
        return jwt.encode(
            {
                "sub": subject,
                "scope": scope,
                "iss": settings.jwt_issuer,
                "aud": settings.jwt_audience,
                "exp": int(time.time()) + 60,
            },
            private_key,
            algorithm="RS256",
        )

    try:
        with TestClient(application) as client:
            allowed = client.post(
                "/internal/v1/index/jobs/upsert",
                json=payload,
                headers={"Authorization": f"Bearer {token('jobs:index')}"},
            )
            denied = client.post(
                "/internal/v1/index/jobs/upsert",
                json=payload,
                headers={"Authorization": f"Bearer {token('jobs:read')}"},
            )
            mismatched_subject = client.post(
                "/internal/v1/index/jobs/upsert",
                json=payload,
                headers={"Authorization": f"Bearer {token('jobs:index', 'untrusted-service')}"},
            )
    finally:
        application.dependency_overrides.clear()

    assert allowed.status_code == 200
    assert denied.status_code == 403
    assert denied.json()["detail"]["code"] == "insufficient_scope"
    assert mismatched_subject.status_code == 401
    assert mismatched_subject.json() == {
        "detail": {
            "code": "invalid_bearer_token",
            "message": "Bearer token is invalid.",
        }
    }


@pytest.mark.parametrize(
    ("subject", "scope", "status_code", "error_code"),
    [
        ("untrusted-service", "jobs:index", 401, "invalid_bearer_token"),
        (None, "jobs:index", 401, "invalid_bearer_token"),
        ("talentpulse-backend", "jobs:read", 403, "insufficient_scope"),
        ("talentpulse-backend", None, 403, "insufficient_scope"),
    ],
)
def test_non_local_job_indexing_auth_requires_exact_subject_and_scope(
    non_local_auth, subject, scope, status_code, error_code
) -> None:
    settings, token = non_local_auth
    settings.embedding_provider = "cohere"
    settings.vector_store_provider = "qdrant"
    settings.generation_provider = "bedrock"
    application = create_app(
        settings,
        embedding_provider=FakeEmbedding(),
        vector_retriever=FakeVector(),
        generation_provider=FakeGeneration(),
    )
    application.dependency_overrides[get_settings] = lambda: settings

    try:
        with TestClient(application) as client:
            response = client.post(
                "/internal/v1/index/jobs/upsert",
                json=make_upsert().model_dump(mode="json"),
                headers={"Authorization": f"Bearer {token(subject=subject, scope=scope)}"},
            )
    finally:
        application.dependency_overrides.clear()

    assert response.status_code == status_code
    assert response.json()["detail"]["code"] == error_code


def test_non_local_job_indexing_auth_accepts_valid_claims(non_local_auth) -> None:
    settings, token = non_local_auth
    settings.embedding_provider = "cohere"
    settings.vector_store_provider = "qdrant"
    settings.generation_provider = "bedrock"
    application = create_app(
        settings,
        embedding_provider=FakeEmbedding(),
        vector_retriever=FakeVector(),
        generation_provider=FakeGeneration(),
    )
    application.dependency_overrides[get_settings] = lambda: settings

    try:
        with TestClient(application) as client:
            response = client.post(
                "/internal/v1/index/jobs/upsert",
                json=make_upsert().model_dump(mode="json"),
                headers={"Authorization": f"Bearer {token(scope='jobs:index')}"},
            )
    finally:
        application.dependency_overrides.clear()

    assert response.status_code == 200
