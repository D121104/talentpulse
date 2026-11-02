from __future__ import annotations

import hashlib
from uuid import uuid4

import pytest
from tests.indexing_fixtures import (
    FakeEmbedding,
    FakeGeneration,
    FakeVector,
    indexing_settings,
    make_delete,
    make_identity,
    make_job,
    make_upsert,
)

from talentpulse_ai.core.config import Settings
from talentpulse_ai.core.exceptions import ServiceError
from talentpulse_ai.infrastructure.embeddings.model import CohereEmbeddingAdapter
from talentpulse_ai.infrastructure.vectorstore.qdrant import QdrantVectorRetriever
from talentpulse_ai.main import create_app
from talentpulse_ai.modules.job_indexing.schemas import (
    CanonicalJobSnapshot,
    IndexJobResponse,
)
from talentpulse_ai.modules.rag_chatbot.ingestion.indexer import (
    JobIndexingService,
    build_job_document,
    compute_content_hash,
    normalize_job_text,
    stable_job_point_id,
)


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


def test_normalize_job_text_decodes_html5_named_entities() -> None:
    assert normalize_job_text("&copy; &eacute; &ldquo;quoted&rdquo; &mdash; &frac12;") == (
        "© é “quoted” — ½"
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
        "start_date_epoch_ms",
        "end_date_epoch_ms",
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


def test_indexing_assigns_distinct_stable_point_ids_to_distinct_jobs() -> None:
    embedding = FakeEmbedding()
    vector = FakeVector()
    service = JobIndexingService(embedding, vector)
    first_job = make_job()
    second_job = make_job()

    first = service.upsert(make_upsert(job=first_job, key="first-job"))
    second = service.upsert(make_upsert(job=second_job, key="second-job"))

    assert first.point_id != second.point_id
    assert {point_id for point_id, _, _ in vector.upserts} == {
        str(stable_job_point_id(first_job.job_id, "demo-v1")),
        str(stable_job_point_id(second_job.job_id, "demo-v1")),
    }


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
    retry_identity = make_identity()
    replay = service.upsert(request.model_copy(update={"identity": retry_identity}))
    assert replay == first.model_copy(
        update={
            "request_id": retry_identity.request_id,
            "trace_id": retry_identity.trace_id,
            "operation_attempt_id": retry_identity.operation_attempt_id,
        }
    )
    assert replay.request_id == retry_identity.request_id
    assert replay.trace_id == retry_identity.trace_id
    assert replay.operation_attempt_id == retry_identity.operation_attempt_id
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


def test_qdrant_adapter_search_filters_to_configured_index_version() -> None:
    current_job_id = uuid4()
    demo_job_id = uuid4()
    stale_job_id = uuid4()
    points = [
        {
            "payload": {
                "job_id": str(current_job_id),
                "index_version": "local-ollama-qwen3-embedding-4b-2560-v2",
            },
            "score": 0.8,
        },
        {
            "payload": {"job_id": str(demo_job_id), "index_version": "demo-v1"},
            "score": 0.99,
        },
        {
            "payload": {"job_id": str(stale_job_id), "index_version": "local-ollama-v0"},
            "score": 0.95,
        },
    ]

    class SearchQdrant:
        def __init__(self) -> None:
            self.calls: list[dict[str, object]] = []

        def query_points(self, **kwargs: object) -> object:
            self.calls.append(kwargs)
            query_filter = kwargs["query_filter"]
            must = query_filter["must"]
            version_filter = next(
                (item for item in must if item.get("key") == "index_version"), None
            )
            expected_version = (
                version_filter["match"]["value"] if version_filter is not None else None
            )
            filtered_points = [
                point
                for point in points
                if expected_version is None or point["payload"]["index_version"] == expected_version
            ]
            return {"points": filtered_points}

    client = SearchQdrant()
    adapter = QdrantVectorRetriever(
        client,
        "jobs_collection",
        collection_alias="jobs_current",
        index_version="local-ollama-qwen3-embedding-4b-2560-v2",
        dimensions=2,
    )
    existing_filter = {
        "must": [{"key": "is_active", "match": {"value": True}}],
        "must_not": [{"key": "representation_marker", "match": {"value": "marker"}}],
        "should": [],
    }

    results = adapter.search([0.1, 0.2], existing_filter, 3)

    assert [chunk.job_id for chunk in results] == [current_job_id]
    assert client.calls[0]["query_filter"] == {
        "must": [
            {"key": "is_active", "match": {"value": True}},
            {"key": "index_version", "match": {"value": "local-ollama-qwen3-embedding-4b-2560-v2"}},
        ],
        "must_not": [{"key": "representation_marker", "match": {"value": "marker"}}],
        "should": [],
    }


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


def test_upsert_requires_consistent_epoch_date_window_fields() -> None:
    job = CanonicalJobSnapshot.model_validate(
        {
            **make_job().model_dump(mode="json"),
            "start_date": "2025-01-01T00:00:00Z",
            "end_date": "2025-02-01T00:00:00Z",
            "start_date_epoch_ms": 1735689600000,
            "end_date_epoch_ms": 1738368000000,
        }
    )
    request = make_upsert(job=job)
    assert request.job.start_date_epoch_ms == 1735689600000
    assert request.job.end_date_epoch_ms == 1738368000000

    dates_without_epochs = CanonicalJobSnapshot.model_validate(
        {
            **job.model_dump(mode="json"),
            "start_date_epoch_ms": None,
            "end_date_epoch_ms": None,
        }
    )
    with pytest.raises(ValueError, match="epoch fields are required"):
        make_upsert(job=dates_without_epochs)

    with pytest.raises(ValueError, match="start_date_epoch_ms"):
        CanonicalJobSnapshot.model_validate(
            {**job.model_dump(), "start_date_epoch_ms": 1735689600001}
        )


def test_expired_upsert_deletes_without_embedding_and_returns_skipped_status() -> None:
    embedding = FakeEmbedding()
    vector = FakeVector()
    service = JobIndexingService(embedding, vector, clock=lambda: 1_738_368_000_000)
    job = CanonicalJobSnapshot.model_validate(
        {
            **make_job().model_dump(mode="json"),
            "start_date": "2025-01-01T00:00:00Z",
            "end_date": "2025-02-01T00:00:00Z",
            "start_date_epoch_ms": 1735689600000,
            "end_date_epoch_ms": 1738368000000,
        }
    )

    response = service.upsert(make_upsert(job=job))

    assert response.status == "SKIPPED_INACTIVE"
    assert response.content_hash is None
    assert response.embedded is False
    assert embedding.calls == []
    assert vector.upserts == []
    assert vector.deletes == [str(stable_job_point_id(job.job_id, "demo-v1"))]


@pytest.mark.parametrize(
    ("field", "inactive_value"),
    [
        ("is_active", False),
        ("is_deleted", True),
        ("company_is_active", False),
        ("company_is_deleted", True),
    ],
)
@pytest.mark.parametrize("without_dates", [False, True])
def test_lifecycle_inactive_upsert_deletes_without_embedding(
    field: str, inactive_value: bool, without_dates: bool
) -> None:
    embedding = FakeEmbedding()
    vector = FakeVector()
    service = JobIndexingService(embedding, vector, clock=lambda: 1_750_000_000_000)
    values = make_job().model_dump(mode="json")
    values[field] = inactive_value
    if without_dates:
        values.update(
            {
                "start_date": None,
                "end_date": None,
                "start_date_epoch_ms": None,
                "end_date_epoch_ms": None,
            }
        )
    job = CanonicalJobSnapshot.model_validate(values)

    response = service.upsert(make_upsert(job=job, key=f"inactive-{field}-{without_dates}"))

    assert response.status == "SKIPPED_INACTIVE"
    assert response.content_hash is None
    assert response.embedded is False
    assert embedding.calls == []
    assert vector.upserts == []
    assert vector.deletes == [str(stable_job_point_id(job.job_id, "demo-v1"))]


def test_response_validation_accepts_skipped_inactive_status() -> None:
    job = CanonicalJobSnapshot.model_validate(
        {
            **make_job().model_dump(mode="json"),
            "start_date": "2025-01-01T00:00:00Z",
            "end_date": "2025-02-01T00:00:00Z",
            "start_date_epoch_ms": 1735689600000,
            "end_date_epoch_ms": 1738368000000,
        }
    )
    request = make_upsert(job=job)
    response = IndexJobResponse.model_validate(
        {
            "request_id": request.identity.request_id,
            "trace_id": request.identity.trace_id,
            "operation_attempt_id": request.identity.operation_attempt_id,
            "job_id": job.job_id,
            "operation": "UPSERT",
            "status": "SKIPPED_INACTIVE",
            "source_version": request.source_version,
            "representation_version": request.representation_version,
            "point_id": stable_job_point_id(job.job_id, request.representation_version),
            "content_hash": None,
            "embedding_provider": "fake",
            "embedding_model": "fake-document-v1",
            "embedding_dimensions": 4,
            "embedded": False,
        }
    )
    assert response.status == "SKIPPED_INACTIVE"
