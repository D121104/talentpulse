from __future__ import annotations

import hashlib
import time
from uuid import UUID, uuid4

import jwt
import pytest
from app.application.indexing import (
    JobIndexingService,
    build_job_document,
    compute_content_hash,
    normalize_job_text,
    stable_job_point_id,
)
from app.core.config import Settings, get_settings
from app.core.errors import ServiceError
from app.domain.indexing import (
    CanonicalJobSnapshot,
    IndexIdentity,
    IndexJobDeleteRequest,
    IndexJobUpsertRequest,
)
from app.infrastructure.rag_providers import CohereEmbeddingAdapter, QdrantVectorRetriever
from app.main import create_app
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient


class FakeEmbedding:
    dimensions = 4
    provider_name = "fake"
    model_name = "fake-document-v1"

    def __init__(self, vector: list[float] | None = None) -> None:
        self.calls: list[str] = []
        self.vector = vector or [0.1, 0.2, 0.3, 0.4]

    def embed_document(self, text: str) -> list[float]:
        self.calls.append(text)
        return list(self.vector)


class FakeVector:
    dimensions = 4

    def __init__(self) -> None:
        self.upserts: list[tuple[str, list[float], dict[str, object]]] = []
        self.deletes: list[str] = []

    def upsert_point(self, point_id: str, vector: list[float], payload: dict[str, object]) -> None:
        self.upserts.append((point_id, list(vector), dict(payload)))

    def delete_point(self, point_id: str) -> None:
        self.deletes.append(point_id)


class FakeGeneration:
    def generate(self, prompt: str) -> object:
        del prompt
        return None


class FakeQdrant:
    def __init__(self) -> None:
        self.upserts: list[dict[str, object]] = []
        self.deletes: list[dict[str, object]] = []

    def upsert(self, **kwargs: object) -> object:
        self.upserts.append(kwargs)
        return None

    def delete(self, **kwargs: object) -> object:
        self.deletes.append(kwargs)
        return None


def indexing_settings(*, auth_required: bool = False) -> Settings:
    return Settings(
        auth_required=auth_required,
        jwt_secret="local-test-secret-that-is-long-enough",
        jwt_algorithms=("HS256",),
        jwt_subject="indexer",
    )


def make_job() -> CanonicalJobSnapshot:
    return CanonicalJobSnapshot(
        job_id=uuid4(),
        title="Python Engineer",
        description="Build reliable services.",
        skills=["Python", "PostgreSQL"],
        company_id=uuid4(),
        company_name="Acme",
        location="Hanoi",
        level="mid",
        work_mode="hybrid",
        employment_type="full-time",
        salary=2500,
        salary_currency="USD",
        is_active=True,
        is_deleted=False,
        company_is_active=True,
        company_is_deleted=False,
    )


def make_identity() -> IndexIdentity:
    return IndexIdentity(request_id=uuid4(), trace_id=uuid4(), operation_attempt_id=uuid4())


def make_upsert(
    *, job: CanonicalJobSnapshot | None = None, key: str = "index-key"
) -> IndexJobUpsertRequest:
    active_job = job or make_job()
    document = build_job_document(active_job)
    return IndexJobUpsertRequest(
        identity=make_identity(),
        job=active_job,
        idempotency_key=key,
        source_version="source-v1",
        representation_version="demo-v1",
        content_hash=compute_content_hash(document),
    )


def make_delete(job_id: UUID, *, key: str = "delete-key") -> IndexJobDeleteRequest:
    return IndexJobDeleteRequest(
        identity=make_identity(),
        job_id=job_id,
        idempotency_key=key,
        source_version="source-v1",
        representation_version="demo-v1",
    )


def test_create_app_wires_indexing_service_and_routes() -> None:
    embedding = FakeEmbedding()
    vector = FakeVector()
    application = create_app(
        indexing_settings(),
        embedding_provider=embedding,
        vector_retriever=vector,
        generation_provider=FakeGeneration(),
    )

    assert isinstance(application.state.job_indexing_service, JobIndexingService)
    assert application.state.job_indexing_service._embedding is embedding
    assert application.state.job_indexing_service._vector is vector
    paths = set(application.openapi()["paths"])
    assert "/internal/v1/index/jobs/upsert" in paths
    assert "/internal/v1/index/jobs/delete" in paths


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


def test_job_representation_matches_backend_snapshot_contract_byte_for_byte() -> None:
    job = make_job().model_copy(
        update={
            "title": "Backend &amp; APIs",
            "description": "<p>Build &amp; ship</p>",
            "skills": ["Python &amp; SQL", "PostgreSQL"],
            "company_name": "Acme <b>Labs</b>",
        }
    )
    expected = "\n".join(
        [
            "title: Backend & APIs",
            "description: Build & ship",
            "skills: PostgreSQL, Python & SQL",
            "company: Acme Labs",
            "location: Hanoi",
            "level: mid",
            "work_mode: hybrid",
            "employment_type: full-time",
        ]
    )

    assert normalize_job_text("<p>Build &amp; ship</p>") == "Build & ship"
    assert build_job_document(job) == expected
    assert (
        compute_content_hash(build_job_document(job))
        == hashlib.sha256(expected.encode("utf-8")).hexdigest()
    )


def test_indexing_upsert_uses_document_embedding_and_allowlisted_payload() -> None:
    embedding = FakeEmbedding()
    vector = FakeVector()
    service = JobIndexingService(embedding, vector)
    request = make_upsert()

    response = service.upsert(request)

    assert response.status == "INDEXED"
    assert embedding.calls == [build_job_document(request.job)]
    point_id, values, payload = vector.upserts[0]
    assert point_id == str(stable_job_point_id(request.job.job_id, "demo-v1"))
    assert values == [0.1, 0.2, 0.3, 0.4]
    assert "description" not in payload
    assert payload["job_id"] == str(request.job.job_id)
    assert payload["content_hash"] == request.content_hash
    assert payload["index_version"] == "demo-v1"
    assert payload["status"] == "ACTIVE"
    assert payload["skills"] == ["PostgreSQL", "Python"]
    assert set(payload) == {
        "job_id",
        "company_id",
        "title",
        "company_name",
        "location",
        "level",
        "work_mode",
        "employment_type",
        "skills",
        "salary",
        "salary_currency",
        "start_date",
        "end_date",
        "is_active",
        "is_deleted",
        "status",
        "company_is_active",
        "company_is_deleted",
        "content_hash",
        "source_version",
        "representation_version",
        "index_version",
        "normalization_version",
        "point_id",
    }
    assert all("description" not in str(value).casefold() for value in payload.values())


def test_indexing_delete_writes_stable_point_id() -> None:
    vector = FakeVector()
    service = JobIndexingService(FakeEmbedding(), vector)
    request = make_delete(uuid4())

    response = service.delete(request)

    assert response.status == "DELETED"
    assert vector.deletes == [str(stable_job_point_id(request.job_id, "demo-v1"))]


def test_indexing_rejects_content_hash_mismatch_without_provider_calls() -> None:
    embedding = FakeEmbedding()
    vector = FakeVector()
    service = JobIndexingService(embedding, vector)
    request = make_upsert().model_copy(update={"content_hash": "0" * 64})

    with pytest.raises(ServiceError, match="content_hash does not match"):
        service.upsert(request)

    assert embedding.calls == []
    assert vector.upserts == []


def test_indexing_replays_same_idempotency_key_and_rejects_conflict() -> None:
    embedding = FakeEmbedding()
    vector = FakeVector()
    service = JobIndexingService(embedding, vector)
    request = make_upsert(key="same-key")

    first = service.upsert(request)
    replay = service.upsert(request.model_copy(update={"identity": make_identity()}))
    assert replay == first
    assert len(embedding.calls) == 1
    assert len(vector.upserts) == 1

    conflict = request.model_copy(update={"source_version": "source-v2"})
    with pytest.raises(ServiceError, match="Idempotency key was reused") as error:
        service.upsert(conflict)
    assert error.value.code == "idempotency_conflict"


def test_indexing_rejects_dimension_mismatch() -> None:
    class WrongDimensionVector(FakeVector):
        dimensions = 3

    with pytest.raises(ValueError, match="dimensions do not match"):
        JobIndexingService(FakeEmbedding(), WrongDimensionVector())


def test_cohere_document_embedding_uses_search_document_input_type() -> None:
    class Client:
        def __init__(self) -> None:
            self.calls: list[dict[str, object]] = []

        def embed(self, **kwargs: object) -> object:
            self.calls.append(kwargs)
            return {"float": [[0.1, 0.2]]}

    client = Client()
    adapter = CohereEmbeddingAdapter(client, "cohere.embed-multilingual-v3", dimensions=2)

    assert adapter.embed_document("job document") == [0.1, 0.2]
    assert client.calls[0]["input_type"] == "search_document"
    assert client.calls[0]["embedding_types"] == ["float"]


def test_qdrant_adapter_upsert_filters_payload_and_delete_uses_alias() -> None:
    client = FakeQdrant()
    adapter = QdrantVectorRetriever(
        client, "jobs_collection", collection_alias="jobs_current", dimensions=2
    )

    adapter.upsert_point(
        "point-1",
        [0.1, 0.2],
        {"job_id": str(uuid4()), "content_hash": "a" * 64, "secret": "omit"},
    )
    adapter.delete_point("point-1")

    upsert = client.upserts[0]
    assert upsert["collection_name"] == "jobs_current"
    point = upsert["points"][0]
    assert point.id == "point-1"
    assert point.payload is not None
    assert "secret" not in point.payload
    assert client.deletes[0]["collection_name"] == "jobs_current"
    assert list(client.deletes[0]["points_selector"].points) == ["point-1"]


@pytest.mark.parametrize(
    "settings",
    [
        Settings(
            environment="production",
            embedding_provider="cohere",
            vector_store_provider="qdrant",
            generation_provider="bedrock",
        ),
        Settings(
            environment="production",
            embedding_provider="cohere",
            vector_store_provider="qdrant",
            generation_provider="bedrock",
            jwt_secret="symmetric-secret",
            jwt_issuer="issuer",
            jwt_audience="audience",
            jwt_algorithms=("HS256",),
        ),
    ],
)
def test_production_rejects_invalid_jwt_configuration(settings: Settings) -> None:
    with pytest.raises(RuntimeError, match="asymmetric JWT configuration"):
        create_app(
            settings,
            embedding_provider=FakeEmbedding(),
            vector_retriever=FakeVector(),
            generation_provider=FakeGeneration(),
        )
