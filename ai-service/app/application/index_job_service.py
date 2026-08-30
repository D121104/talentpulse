from __future__ import annotations

import hashlib
import json
from collections.abc import Callable, Mapping
from datetime import UTC, datetime
from typing import Any, Literal, cast
from uuid import UUID

from app.application.indexing import (
    CHUNKING_VERSION,
    DEFAULT_MAX_CHUNK_CHARS,
    INDEX_SCHEMA_VERSION,
    MAX_CHUNK_COUNT,
    NORMALIZATION_VERSION,
    build_chunks,
    build_search_text,
    compute_content_hash,
    compute_metadata_hash,
    normalized_job_metadata,
    point_ids_for_job,
)
from app.core.errors import ProviderError, ServiceError
from app.ports import (
    EmbeddingInputType,
    EmbeddingModel,
    VectorRecord,
    VectorStore,
    validate_vector,
    validate_vectors,
)
from app.schemas.indexing import (
    CanonicalJobSnapshot,
    IndexJobDeleteRequest,
    IndexJobResponse,
    IndexJobUpsertRequest,
    IndexOperationStatus,
)

_MAX_IDEMPOTENCY_ENTRIES = 4096


class IndexJobService:
    """Idempotent application service for the derived job vector index."""

    def __init__(
        self,
        embedding_model: EmbeddingModel,
        vector_store: VectorStore,
        *,
        clock: Callable[[], datetime] | None = None,
        max_chunk_chars: int = DEFAULT_MAX_CHUNK_CHARS,
    ) -> None:
        if max_chunk_chars < 128:
            raise ValueError("max_chunk_chars must leave room for semantic identity metadata")
        collection_name = getattr(vector_store, "collection_name", "")
        if not isinstance(collection_name, str) or not collection_name.strip():
            raise ValueError("vector store collection name is required")

        model_name = getattr(embedding_model, "model_name", "")
        model_dimensions = getattr(embedding_model, "dimensions", None)
        provider_name = getattr(embedding_model, "provider_name", "")
        if (
            not isinstance(model_name, str)
            or not model_name.strip()
            or not isinstance(provider_name, str)
            or not provider_name.strip()
            or not isinstance(model_dimensions, int)
            or isinstance(model_dimensions, bool)
            or model_dimensions < 1
        ):
            raise ValueError("embedding model metadata is required")

        # The vector store is part of the server-owned representation contract.
        # Do not allow a store with missing metadata to silently share a
        # collection with a different model space.
        store_dimensions = getattr(vector_store, "dimensions", None)
        if (
            not isinstance(store_dimensions, int)
            or isinstance(store_dimensions, bool)
            or store_dimensions < 1
            or store_dimensions != model_dimensions
        ):
            raise ValueError("vector store dimensions do not match the embedding model")
        store_model = getattr(vector_store, "embedding_model", None)
        if not isinstance(store_model, str) or not store_model.strip():
            raise ValueError("vector store embedding model is required")
        if store_model != model_name:
            raise ValueError("vector store model does not match the embedding model")
        store_provider = getattr(vector_store, "embedding_provider", None)
        if not isinstance(store_provider, str) or not store_provider.strip():
            raise ValueError("vector store embedding provider is required")
        if store_provider != provider_name:
            raise ValueError("vector store provider does not match the embedding model")
        collection_version = getattr(vector_store, "collection_version", None)
        if collection_version is not None:
            if not isinstance(collection_version, str):
                raise ValueError("vector store collection version is invalid")
            collection_version = collection_version.strip()
            if not collection_version or len(collection_version) > 128:
                raise ValueError("vector store collection version is invalid")
        self._embedding_model = embedding_model
        self._vector_store = vector_store
        self._collection_name = collection_name
        self._embedding_provider = provider_name
        self._collection_version = collection_version
        self._clock = clock or (lambda: datetime.now(UTC))
        self._max_chunk_chars = max_chunk_chars
        self._idempotency: dict[str, tuple[str, str, str, IndexJobResponse]] = {}
        self._source_versions: dict[str, int] = {}
        self._deleted_source_versions: dict[str, int] = {}

    async def upsert(
        self, request: IndexJobUpsertRequest, *, request_id: str | None = None
    ) -> IndexJobResponse:
        job = request.job
        fingerprint = self._fingerprint(request)
        cached = self._cached(request.idempotency_key, "UPSERT", str(job.job_id), fingerprint)
        if cached is not None:
            return self._response_for_request(cached, request_id)
        try:
            existing = await self._get_existing(str(job.job_id))
            try:
                self._assert_source_version(
                    str(job.job_id), request.source_version, existing, operation="UPSERT"
                )
            except _StaleIndexEvent:
                return self._stale_response(
                    job.job_id, request.source_version, "UPSERT", request_id
                )

            # Stale events must be harmless even when their old projection is
            # no longer eligible according to the server clock.
            self._assert_eligible(job)
            versions = self._effective_versions(request)
            search_text = build_search_text(job)
            content_hash = compute_content_hash(search_text)
            self._assert_hash(request.content_hash, content_hash, "content_hash")
            metadata_hash = compute_metadata_hash(
                job,
                source_version=request.source_version,
                embedding_model_version=versions[0],
                embedding_dimensions=versions[1],
                normalization_version=versions[2],
                chunking_version=versions[3],
                index_schema_version=versions[4],
            )
            self._assert_hash(request.metadata_hash, metadata_hash, "metadata_hash")

            chunks = build_chunks(job, max_chars=self._max_chunk_chars)
            chunk_count = len(chunks)
            if not chunks:
                raise ServiceError("AI_INVALID_REQUEST", "Job search text is empty", 422)
            if chunk_count > MAX_CHUNK_COUNT:
                raise ServiceError(
                    "AI_INVALID_REQUEST",
                    "Job search text produces too many chunks",
                    422,
                    {
                        "reason": "TOO_MANY_CHUNKS",
                        "chunk_count": chunk_count,
                        "max_chunk_count": MAX_CHUNK_COUNT,
                    },
                )
            point_ids = point_ids_for_job(job.job_id, chunk_count, chunking_version=versions[3])
            desired_payloads = self._build_payloads(
                job,
                point_ids=point_ids,
                chunk_count=chunk_count,
                content_hash=content_hash,
                metadata_hash=metadata_hash,
                source_version=request.source_version,
                versions=versions,
            )

            current_source_version = self._current_source_version(str(job.job_id), existing)
            existing_by_id = {record.point_id: record for record in existing}
            if request.source_version == current_source_version and existing:
                # A failed write may leave old and current points together.
                # Validate only current-version points; the normal repair path
                # below still upserts missing desired IDs and removes stale IDs.
                current_records = [
                    record
                    for record in existing
                    if record.payload.get("source_version") == request.source_version
                ]
                if current_records and not self._same_representation(
                    current_records,
                    content_hash=content_hash,
                    metadata_hash=metadata_hash,
                    versions=versions,
                ):
                    raise ServiceError(
                        "AI_INDEX_VERSION_CONFLICT",
                        "Index source version already represents different job content",
                        409,
                    )

            stale_point_ids = [
                record.point_id for record in existing if record.point_id not in point_ids
            ]
            reusable = self._can_reuse_vectors(
                point_ids,
                existing_by_id,
                content_hash=content_hash,
                versions=versions,
            )

            if reusable:
                payload_changed = any(
                    existing_by_id[point_id].payload != desired_payload
                    for point_id, desired_payload in zip(point_ids, desired_payloads, strict=True)
                )
                if payload_changed:
                    await self._vector_store.upsert(
                        [
                            VectorRecord(
                                point_id,
                                existing_by_id[point_id].vector,
                                desired_payload,
                            )
                            for point_id, desired_payload in zip(
                                point_ids, desired_payloads, strict=True
                            )
                        ]
                    )
                if stale_point_ids:
                    await self._vector_store.delete(stale_point_ids)
                status = "UPDATED" if payload_changed or stale_point_ids else "SKIPPED"
                embedded = False
            else:
                embedding_response = await self._embedding_model.embed(
                    [chunk.text for chunk in chunks], EmbeddingInputType.DOCUMENT
                )
                if (
                    embedding_response.provider != self._embedding_provider
                    or embedding_response.model != versions[0]
                    or embedding_response.dimensions != versions[1]
                ):
                    raise ProviderError("Embedding provider returned mismatched model metadata")
                try:
                    vectors = validate_vectors(
                        embedding_response.vectors,
                        versions[1],
                        chunk_count,
                    )
                except ValueError as exc:
                    raise ProviderError("Embedding provider returned invalid vectors") from exc
                await self._vector_store.upsert(
                    [
                        VectorRecord(point_id, vector, payload)
                        for point_id, vector, payload in zip(
                            point_ids, vectors, desired_payloads, strict=True
                        )
                    ]
                )
                if stale_point_ids:
                    await self._vector_store.delete(stale_point_ids)
                status = "INDEXED" if not existing else "UPDATED"
                embedded = True

            self._source_versions[str(job.job_id)] = request.source_version
            self._deleted_source_versions.pop(str(job.job_id), None)
            response = IndexJobResponse(
                job_id=job.job_id,
                operation="UPSERT",
                status=cast(IndexOperationStatus, status),
                source_version=request.source_version,
                point_ids=[UUID(point_id) for point_id in point_ids],
                deleted_point_ids=[UUID(point_id) for point_id in stale_point_ids],
                content_hash=content_hash,
                metadata_hash=metadata_hash,
                chunk_count=chunk_count,
                embedded=embedded,
                embedding_provider=self._embedding_provider,
                embedding_model_version=versions[0],
                embedding_dimensions=versions[1],
                normalization_version=versions[2],
                chunking_version=versions[3],
                index_schema_version=versions[4],
                collection_name=self._collection_name,
                collection_version=self._collection_version,
                request_id=UUID(request_id) if request_id is not None else None,
            )
            self._remember(
                request.idempotency_key, "UPSERT", str(job.job_id), fingerprint, response
            )
            return response
        except ServiceError:
            raise
        except Exception as exc:
            raise ProviderError() from exc

    async def delete(
        self, request: IndexJobDeleteRequest, *, request_id: str | None = None
    ) -> IndexJobResponse:
        fingerprint = self._fingerprint(request)
        cached = self._cached(request.idempotency_key, "DELETE", str(request.job_id), fingerprint)
        if cached is not None:
            return self._response_for_request(cached, request_id)

        job_id = str(request.job_id)
        try:
            existing = await self._get_existing(job_id)
            try:
                self._assert_source_version(
                    job_id, request.source_version, existing, operation="DELETE"
                )
            except _StaleIndexEvent:
                return self._stale_response(
                    request.job_id, request.source_version, "DELETE", request_id
                )
            point_ids = [record.point_id for record in existing]
            if point_ids:
                await self._vector_store.delete(point_ids)
                status = "DELETED"
            else:
                status = "ALREADY_DELETED"
            self._source_versions[job_id] = request.source_version
            self._deleted_source_versions[job_id] = request.source_version
            response = IndexJobResponse(
                job_id=request.job_id,
                operation="DELETE",
                status=cast(IndexOperationStatus, status),
                source_version=request.source_version,
                deleted_point_ids=[UUID(point_id) for point_id in point_ids],
                chunk_count=0,
                embedded=False,
                embedding_provider=self._embedding_provider,
                embedding_model_version=self._embedding_model.model_name,
                embedding_dimensions=self._embedding_model.dimensions,
                normalization_version=NORMALIZATION_VERSION,
                chunking_version=CHUNKING_VERSION,
                index_schema_version=INDEX_SCHEMA_VERSION,
                collection_name=self._collection_name,
                collection_version=self._collection_version,
                request_id=UUID(request_id) if request_id is not None else None,
            )
            self._remember(request.idempotency_key, "DELETE", job_id, fingerprint, response)
            return response
        except ServiceError:
            raise
        except Exception as exc:
            raise ProviderError() from exc

    @staticmethod
    def _response_for_request(
        response: IndexJobResponse, request_id: str | None
    ) -> IndexJobResponse:
        if request_id is None:
            return response
        request_uuid = UUID(request_id)
        if response.request_id == request_uuid:
            return response
        return response.model_copy(update={"request_id": request_uuid})

    def _assert_eligible(self, job: CanonicalJobSnapshot) -> None:
        reason: str | None = None
        if not job.is_active:
            reason = "INACTIVE_JOB"
        elif job.is_deleted or job.deleted_at is not None:
            reason = "DELETED_JOB"
        elif not job.company_is_active:
            reason = "INACTIVE_COMPANY"
        elif job.company_is_deleted or job.company_deleted_at is not None:
            reason = "DELETED_COMPANY"
        elif job.start_date is None:
            reason = "MISSING_START_DATE"
        elif job.end_date is None:
            reason = "MISSING_END_DATE"
        elif job.start_date >= job.end_date:
            reason = "INVALID_DATE_RANGE"
        else:
            now = self._clock()
            if now.tzinfo is None or now.utcoffset() is None:
                now = now.replace(tzinfo=UTC)
            now = now.astimezone(UTC)
            if job.start_date > now:
                reason = "NOT_STARTED"
            elif job.end_date <= now:
                reason = "EXPIRED"
        if reason is not None:
            raise ServiceError(
                "AI_INVALID_REQUEST",
                "Job is not eligible for indexing",
                422,
                {"reason": reason},
            )

    def _effective_versions(self, request: IndexJobUpsertRequest) -> tuple[str, int, str, str, str]:
        """Resolve representation versions exclusively from service configuration.

        Request fields are useful as replay assertions, but must never select a
        different model space, collection schema, or normalization policy.
        Otherwise a caller could write vectors with spoofed version metadata and
        silently mix incompatible representations in one collection.
        """

        configured = (
            self._embedding_model.model_name,
            self._embedding_model.dimensions,
            NORMALIZATION_VERSION,
            CHUNKING_VERSION,
            INDEX_SCHEMA_VERSION,
        )
        requested = (
            request.embedding_model_version,
            request.embedding_dimensions,
            request.normalization_version,
            request.chunking_version,
            request.index_schema_version,
        )
        field_names = (
            "embedding_model_version",
            "embedding_dimensions",
            "normalization_version",
            "chunking_version",
            "index_schema_version",
        )
        for name, requested_value, configured_value in zip(
            field_names, requested, configured, strict=True
        ):
            if requested_value is not None and requested_value != configured_value:
                raise ServiceError(
                    "AI_INVALID_REQUEST",
                    f"{name} does not match the configured index representation",
                    422,
                )
        return configured

    @staticmethod
    def _assert_hash(provided: str | None, computed: str, field: str) -> None:
        if provided is not None and provided.lower() != computed:
            raise ServiceError(
                "AI_INVALID_REQUEST",
                f"{field} does not match the canonical job projection",
                422,
            )

    def _build_payloads(
        self,
        job: CanonicalJobSnapshot,
        *,
        point_ids: list[str],
        chunk_count: int,
        content_hash: str,
        metadata_hash: str,
        source_version: int,
        versions: tuple[str, int, str, str, str],
    ) -> list[dict[str, Any]]:
        metadata = normalized_job_metadata(job)
        payloads: list[dict[str, Any]] = []
        for chunk_index, _ in enumerate(point_ids):
            payload: dict[str, Any] = {
                **metadata,
                "chunk_index": chunk_index,
                "chunk_count": chunk_count,
                "is_chunked": chunk_count > 1,
                "content_hash": content_hash,
                "metadata_hash": metadata_hash,
                "source_version": source_version,
                "embedding_provider": self._embedding_provider,
                "collection_name": self._collection_name,
                "embedding_model_version": versions[0],
                "embedding_dimensions": versions[1],
                "normalization_version": versions[2],
                "chunking_version": versions[3],
                "index_schema_version": versions[4],
            }
            if self._collection_version is not None:
                payload["collection_version"] = self._collection_version
            payloads.append(payload)
        return payloads

    async def _get_existing(self, job_id: str) -> list[VectorRecord]:
        get_by_job_id = getattr(self._vector_store, "get_by_job_id", None)
        if not callable(get_by_job_id):
            raise ProviderError("Vector store does not support job index state")
        return list(await get_by_job_id(job_id))

    def _can_reuse_vectors(
        self,
        point_ids: list[str],
        existing_by_id: Mapping[str, VectorRecord],
        *,
        content_hash: str,
        versions: tuple[str, int, str, str, str],
    ) -> bool:
        if any(point_id not in existing_by_id for point_id in point_ids):
            return False
        for point_id in point_ids:
            record = existing_by_id[point_id]
            try:
                validate_vector(record.vector, versions[1])
            except ValueError:
                return False
            if not (
                record.payload.get("content_hash") == content_hash
                and record.payload.get("embedding_provider") == self._embedding_provider
                and record.payload.get("collection_name") == self._collection_name
                and record.payload.get("collection_version") == self._collection_version
                and record.payload.get("embedding_model_version") == versions[0]
                and record.payload.get("embedding_dimensions") == versions[1]
                and record.payload.get("normalization_version") == versions[2]
                and record.payload.get("chunking_version") == versions[3]
                and record.payload.get("index_schema_version") == versions[4]
            ):
                return False
        return True

    def _current_source_version(self, job_id: str, existing: list[VectorRecord]) -> int:
        persisted = [
            int(record.payload["source_version"])
            for record in existing
            if isinstance(record.payload.get("source_version"), int)
            and not isinstance(record.payload.get("source_version"), bool)
        ]
        return max(
            self._source_versions.get(job_id, 0),
            self._deleted_source_versions.get(job_id, 0),
            *persisted,
            0,
        )

    def _same_representation(
        self,
        records: list[VectorRecord],
        *,
        content_hash: str,
        metadata_hash: str,
        versions: tuple[str, int, str, str, str],
    ) -> bool:
        for record in records:
            try:
                validate_vector(record.vector, versions[1])
            except ValueError:
                return False
            if not (
                record.payload.get("content_hash") == content_hash
                and record.payload.get("metadata_hash") == metadata_hash
                and record.payload.get("embedding_provider") == self._embedding_provider
                and record.payload.get("collection_name") == self._collection_name
                and record.payload.get("collection_version") == self._collection_version
                and record.payload.get("embedding_model_version") == versions[0]
                and record.payload.get("embedding_dimensions") == versions[1]
                and record.payload.get("normalization_version") == versions[2]
                and record.payload.get("chunking_version") == versions[3]
                and record.payload.get("index_schema_version") == versions[4]
            ):
                return False
        return True

    def _assert_source_version(
        self,
        job_id: str,
        source_version: int,
        existing: list[VectorRecord],
        *,
        operation: str,
    ) -> None:
        current = self._current_source_version(job_id, existing)
        if source_version < current:
            raise _StaleIndexEvent(current)
        if source_version == current and current > 0 and operation == "UPSERT" and not existing:
            raise ServiceError(
                "AI_INDEX_VERSION_CONFLICT",
                "Index source version conflicts with a previously deleted job",
                409,
            )

    @staticmethod
    def _fingerprint(request: IndexJobUpsertRequest | IndexJobDeleteRequest) -> str:
        data = request.model_dump(mode="json")
        data.pop("idempotency_key", None)
        encoded = json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
        return hashlib.sha256(encoded.encode("utf-8")).hexdigest()

    def _cached(
        self,
        key: str,
        operation: str,
        job_id: str,
        fingerprint: str,
    ) -> IndexJobResponse | None:
        cached = self._idempotency.get(key)
        if cached is None:
            return None
        cached_operation, cached_job_id, cached_fingerprint, response = cached
        if (cached_operation, cached_job_id, cached_fingerprint) != (
            operation,
            job_id,
            fingerprint,
        ):
            raise ServiceError(
                "AI_IDEMPOTENCY_CONFLICT",
                "Idempotency key was already used for a different index request",
                409,
            )
        return response

    def _remember(
        self,
        key: str,
        operation: str,
        job_id: str,
        fingerprint: str,
        response: IndexJobResponse,
    ) -> None:
        if len(self._idempotency) >= _MAX_IDEMPOTENCY_ENTRIES:
            oldest = next(iter(self._idempotency))
            self._idempotency.pop(oldest)
        self._idempotency[key] = (operation, job_id, fingerprint, response)

    def _stale_response(
        self,
        job_id: UUID,
        source_version: int,
        operation: Literal["UPSERT", "DELETE"],
        request_id: str | None,
    ) -> IndexJobResponse:
        return IndexJobResponse(
            job_id=job_id,
            operation=operation,
            status="STALE_IGNORED",
            source_version=source_version,
            chunk_count=0,
            embedded=False,
            embedding_provider=self._embedding_provider,
            embedding_model_version=self._embedding_model.model_name,
            embedding_dimensions=self._embedding_model.dimensions,
            normalization_version=NORMALIZATION_VERSION,
            chunking_version=CHUNKING_VERSION,
            index_schema_version=INDEX_SCHEMA_VERSION,
            collection_name=self._collection_name,
            collection_version=self._collection_version,
            request_id=UUID(request_id) if request_id is not None else None,
        )


class _StaleIndexEvent(Exception):
    def __init__(self, current: int) -> None:
        self.current = current
        self.current_source_version = current
