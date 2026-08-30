from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid5

import pytest
from app.adapters.fakes import FakeEmbeddingModel, InMemoryVectorStore
from app.application.index_job_service import IndexJobService
from app.application.indexing import (
    CHUNKING_VERSION,
    POINT_NAMESPACE,
    build_chunks,
    build_search_text,
    compute_content_hash,
    normalize_text,
    point_id_for_job,
    point_ids_for_job,
)
from app.core.errors import ServiceError
from app.schemas import IndexJobDeleteRequest, IndexJobUpsertRequest

JOB_ID = UUID("11111111-1111-4111-8111-111111111111")
COMPANY_ID = UUID("22222222-2222-4222-8222-222222222222")
NOW = datetime(2026, 8, 27, 12, 0, tzinfo=UTC)


def job(**overrides: object) -> dict[str, object]:
    value: dict[str, object] = {
        "job_id": str(JOB_ID),
        "title": "Backend Engineer",
        "description": "Build reliable APIs with Python and FastAPI.",
        "skills": [" Python ", "FastAPI", "python"],
        "company_id": str(COMPANY_ID),
        "company_name": "Acme Labs",
        "location": "Ha Noi",
        "level": "MID",
        "salary": {"amount": 30_000_000, "currency": "VND"},
        "start_date": "2026-08-01T00:00:00Z",
        "end_date": "2026-09-30T00:00:00Z",
        "updated_at": "2026-08-27T11:00:00Z",
        "is_active": True,
        "is_deleted": False,
        "company_is_active": True,
        "company_is_deleted": False,
    }
    value.update(overrides)
    return value


def request(
    *,
    source_version: int = 1,
    key: str = "event-1",
    request_overrides: dict[str, object] | None = None,
    **overrides: object,
) -> IndexJobUpsertRequest:
    payload: dict[str, object] = {
        "job": job(**overrides),
        "source_version": source_version,
        "idempotency_key": key,
    }
    payload.update(request_overrides or {})
    return IndexJobUpsertRequest.model_validate(payload)


def service() -> tuple[IndexJobService, FakeEmbeddingModel, InMemoryVectorStore]:
    embedding = FakeEmbeddingModel(dimensions=4)
    store = InMemoryVectorStore(dimensions=4)
    return IndexJobService(embedding, store, clock=lambda: NOW), embedding, store


def test_snapshot_is_bounded_and_rejects_unknown_nested_company_fields() -> None:
    with pytest.raises(ValueError):
        request(
            request_overrides=None,
            **{
                "company": {
                    "_id": str(COMPANY_ID),
                    "name": "Acme",
                    "isActive": True,
                    "isDeleted": False,
                    "email": "pii@example.test",
                }
            },
        )

    with pytest.raises(ValueError):
        request(request_overrides={"source_version": 2**53})


def test_normalization_and_search_text_are_deterministic_and_safe() -> None:
    assert normalize_text("  <b>FastAPI</b> &amp; Python\n") == "fastapi & python"
    assert normalize_text("<script>alert('x')</script>Backend") == "backend"
    first = build_search_text(job())
    second = build_search_text(job(skills=["python", "FastAPI", " Python "]))
    assert first == second
    assert compute_content_hash(first) == compute_content_hash(second)


def test_chunk_ids_are_stable_uuidv5_and_single_job_uses_canonical_uuid() -> None:
    assert point_id_for_job(JOB_ID) == str(JOB_ID)
    expected = str(uuid5(POINT_NAMESPACE, f"{JOB_ID}:0:{CHUNKING_VERSION}"))
    assert point_id_for_job(JOB_ID, chunked=True) == expected
    assert UUID(expected).version == 5
    assert point_ids_for_job(JOB_ID, 3) == point_ids_for_job(str(JOB_ID), 3)


def test_long_jobs_are_bounded_and_repeat_identity_metadata() -> None:
    chunks = build_chunks(job(description="word " * 300), max_chars=300)
    assert len(chunks) > 1
    assert all(len(chunk.text) <= 300 for chunk in chunks)
    assert all("title: backend engineer" in chunk.text for chunk in chunks)
    assert [chunk.chunk_index for chunk in chunks] == list(range(len(chunks)))


@pytest.mark.parametrize(
    ("field", "value", "reason"),
    [
        ("is_active", False, "INACTIVE_JOB"),
        ("is_deleted", True, "DELETED_JOB"),
        ("company_is_active", False, "INACTIVE_COMPANY"),
        ("company_is_deleted", True, "DELETED_COMPANY"),
        ("start_date", None, "MISSING_START_DATE"),
        ("end_date", None, "MISSING_END_DATE"),
        ("start_date", "2026-09-01T00:00:00Z", "NOT_STARTED"),
        ("end_date", "2026-08-15T00:00:00Z", "EXPIRED"),
    ],
)
async def test_upsert_rejects_ineligible_jobs(field: str, value: object, reason: str) -> None:
    indexer, _, _ = service()
    with pytest.raises(ServiceError) as error:
        await indexer.upsert(request(**{field: value}))
    assert error.value.status_code == 422
    assert error.value.details == {"reason": reason}


async def test_upsert_is_idempotent_and_does_not_reembed_duplicate_request() -> None:
    indexer, embedding, store = service()
    first = await indexer.upsert(request())
    second = await indexer.upsert(request())
    assert first == second
    assert first.status == "INDEXED"
    assert first.embedded is True
    assert len(embedding.calls) == 1
    assert len(store.records) == 1
    replay = await indexer.upsert(request(), request_id="33333333-3333-4333-8333-333333333333")
    assert replay.request_id == UUID("33333333-3333-4333-8333-333333333333")
    assert next(iter(store.records.values())).payload["collection_name"] == "fake-collection"


async def test_metadata_only_update_reuses_vector_and_updates_payload() -> None:
    indexer, embedding, store = service()
    await indexer.upsert(request(source_version=1, key="event-1"))
    updated = await indexer.upsert(
        request(
            source_version=2,
            key="event-2",
            salary={"amount": 35_000_000, "currency": "VND"},
            updated_at="2026-08-27T11:30:00Z",
        )
    )
    assert updated.status == "UPDATED"
    assert updated.embedded is False
    assert len(embedding.calls) == 1
    assert next(iter(store.records.values())).payload["salary"] == 35_000_000
    assert next(iter(store.records.values())).payload["source_version"] == 2
    assert "description" not in next(iter(store.records.values())).payload


async def test_content_change_reembeds() -> None:
    indexer, embedding, _ = service()
    first = await indexer.upsert(request())
    second = await indexer.upsert(
        request(source_version=2, key="event-2", description="Design distributed systems.")
    )
    assert first.content_hash != second.content_hash
    assert second.embedded is True
    assert len(embedding.calls) == 2


async def test_single_to_chunk_transition_deletes_stale_single_point() -> None:
    indexer, _, store = service()
    first = await indexer.upsert(request())
    second = await indexer.upsert(
        request(source_version=2, key="event-2", description="long " * 500)
    )
    assert first.point_ids[0] in second.deleted_point_ids
    assert first.point_ids[0] not in store.records
    assert len(store.records) == second.chunk_count
    assert second.chunk_count > 1


async def test_chunk_to_single_transition_deletes_stale_chunk_points() -> None:
    indexer, _, store = service()
    first = await indexer.upsert(
        request(source_version=1, key="event-1", description="long " * 500)
    )
    second = await indexer.upsert(request(source_version=2, key="event-2"))
    assert first.chunk_count > 1
    assert set(first.point_ids) == set(second.deleted_point_ids)
    assert second.point_ids == [JOB_ID]
    assert set(store.records) == {str(JOB_ID)}


async def test_delete_is_idempotent_and_stale_delete_is_ignored() -> None:
    indexer, _, store = service()
    indexed = await indexer.upsert(request())
    deleted = await indexer.delete(
        IndexJobDeleteRequest(job_id=JOB_ID, idempotency_key="delete-1", source_version=2)
    )
    repeated = await indexer.delete(
        IndexJobDeleteRequest(job_id=JOB_ID, idempotency_key="delete-1", source_version=2)
    )
    stale = await indexer.delete(
        IndexJobDeleteRequest(job_id=JOB_ID, idempotency_key="delete-0", source_version=1)
    )
    assert deleted.status == "DELETED"
    assert repeated == deleted
    assert stale.status == "STALE_IGNORED"
    assert store.records == {}
    assert deleted.deleted_point_ids == indexed.point_ids


async def test_same_idempotency_key_with_different_payload_is_rejected() -> None:
    indexer, _, _ = service()
    await indexer.upsert(request())
    with pytest.raises(ServiceError) as error:
        await indexer.upsert(request(key="event-1", description="different"))
    assert error.value.code == "AI_IDEMPOTENCY_CONFLICT"


async def test_request_cannot_spoof_configured_embedding_or_index_versions() -> None:
    indexer, _, _ = service()
    with pytest.raises(ServiceError) as error:
        await indexer.upsert(
            request(
                request_overrides={
                    "embedding_model_version": "attacker-model",
                    "chunking_version": "attacker-v1",
                }
            )
        )
    assert error.value.status_code == 422
    assert "configured index representation" in error.value.message


async def test_index_responses_report_server_owned_metadata() -> None:
    embedding = FakeEmbeddingModel(dimensions=4)
    store = InMemoryVectorStore(
        collection_name="jobs_fake_v1",
        dimensions=4,
        embedding_model="fake-embedding",
        collection_version="collection-v1",
    )
    indexer = IndexJobService(embedding, store, clock=lambda: NOW)

    indexed = await indexer.upsert(request())
    indexed_payload = next(iter(store.records.values())).payload
    deleted = await indexer.delete(
        IndexJobDeleteRequest(job_id=JOB_ID, idempotency_key="delete-1", source_version=2)
    )

    assert indexed_payload["embedding_provider"] == "fake"
    assert indexed_payload["embedding_model_version"] == "fake-embedding"
    assert indexed_payload["embedding_dimensions"] == 4
    assert indexed_payload["collection_name"] == "jobs_fake_v1"
    assert indexed_payload["collection_version"] == "collection-v1"

    for response in (indexed, deleted):
        assert response.embedding_provider == "fake"
        assert response.embedding_model_version == "fake-embedding"
        assert response.embedding_dimensions == 4
        assert response.normalization_version is not None
        assert response.chunking_version is not None
        assert response.index_schema_version is not None
        assert response.collection_name == "jobs_fake_v1"
        assert response.collection_version == "collection-v1"
