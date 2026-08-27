from __future__ import annotations

import asyncio
import math
from collections.abc import Iterable, Mapping, Sequence
from itertools import islice
from typing import Any, cast
from uuid import UUID

from app.core.errors import ProviderError
from app.core.index_representation import (
    CHUNKING_VERSION,
    INDEX_SCHEMA_VERSION,
    NORMALIZATION_VERSION,
)
from app.ports import (
    SCAN_METADATA_PAYLOAD_FIELDS,
    VectorMatch,
    VectorMetadataScanPage,
    VectorRecord,
    VectorStore,
    bounded_scan_limit,
    parse_vector_point_metadata,
    validate_scan_cursor,
    validate_vector,
)

# Qdrant payload indexes are created on the physical collection.  Reads that
# participate in reconciliation use the current alias, so an alias switch
# remains atomic from the caller's perspective.
PAYLOAD_INDEX_SCHEMAS: dict[str, str] = {
    "job_id": "uuid",
    "company_id": "uuid",
    "is_active": "bool",
    "is_deleted": "bool",
    "company_is_active": "bool",
    "company_is_deleted": "bool",
    "is_chunked": "bool",
    "start_date": "datetime",
    "end_date": "datetime",
    "updated_at": "datetime",
    "deleted_at": "datetime",
    "company_deleted_at": "datetime",
    "location": "keyword",
    "level": "keyword",
    "work_mode": "keyword",
    "employment_type": "keyword",
    "skills": "keyword",
    "salary": "float",
}

# This is the complete payload that the application may read back for an
# indexed job.  It intentionally excludes descriptions and any future or
# provider-specific fields.
INDEX_PAYLOAD_FIELDS: tuple[str, ...] = (
    "job_id",
    "company_id",
    "title",
    "company_name",
    "skills",
    "location",
    "level",
    "work_mode",
    "employment_type",
    "salary",
    "salary_currency",
    "start_date",
    "end_date",
    "updated_at",
    "is_active",
    "is_deleted",
    "deleted_at",
    "company_is_active",
    "company_is_deleted",
    "company_deleted_at",
    "chunk_index",
    "chunk_count",
    "is_chunked",
    "content_hash",
    "metadata_hash",
    "source_version",
    "embedding_provider",
    "collection_name",
    "embedding_model_version",
    "embedding_dimensions",
    "normalization_version",
    "chunking_version",
    "index_schema_version",
)

_FOUNDATION_METADATA: dict[str, object] = {"foundation_version": "phase1"}
_REPRESENTATION_METADATA_FIELDS: dict[str, object] = {
    # embedding_model is retained for Phase 1 compatibility; the explicit
    # *_version key is the Phase 2 representation contract.
    "embedding_model": "",  # filled from the store instance
    "embedding_model_version": "",  # filled from the store instance
    "embedding_dimensions": 0,
    "normalization_version": NORMALIZATION_VERSION,
    "chunking_version": CHUNKING_VERSION,
    "index_schema_version": INDEX_SCHEMA_VERSION,
}
_PHASE2_VERSION_METADATA_KEYS = frozenset(
    {
        "embedding_model_version",
        "embedding_dimensions",
        "normalization_version",
        "chunking_version",
        "index_schema_version",
    }
)
_MISSING = object()


def _member(value: object, name: str, default: object = _MISSING) -> object:
    if isinstance(value, Mapping):
        result = value.get(name, default)
    else:
        result = getattr(value, name, default)
    if result is _MISSING:
        return default
    return result


def _canonical_uuid(value: object, field_name: str) -> str:
    if isinstance(value, UUID):
        return str(value)
    if not isinstance(value, str):
        raise ValueError(f"{field_name} must be a UUID")
    try:
        parsed = UUID(value)
    except ValueError as exc:
        raise ValueError(f"{field_name} must be a UUID") from exc
    if str(parsed) != value.lower():
        raise ValueError(f"{field_name} must use canonical UUID notation")
    return str(parsed)


def _scroll_parts(response: object) -> tuple[object, object]:
    """Normalize SDK tuple, model and REST-like scroll response shapes."""

    if isinstance(response, (tuple, list)):
        if len(response) != 2:
            raise ValueError("Qdrant scroll response tuple is invalid")
        return response[0], response[1]

    result: object = response
    if isinstance(result, Mapping) and "result" in result:
        result = result["result"]
    points = _member(result, "points")
    next_offset = _member(result, "next_page_offset", None)
    if points is _MISSING:
        raise ValueError("Qdrant scroll response has no points")
    return points, next_offset


def _cursor_token(value: object) -> str | None:
    """Convert Qdrant point-offset variants to the route's opaque string."""

    if value is None:
        return None
    if isinstance(value, Mapping):
        if "uuid" in value and value["uuid"] is not None:
            value = value["uuid"]
        elif "num" in value and value["num"] is not None:
            value = value["num"]
        elif "id" in value and value["id"] is not None:
            value = value["id"]
        else:
            raise ValueError("Qdrant next page offset is invalid")
    else:
        uuid_value = getattr(value, "uuid", _MISSING)
        number_value = getattr(value, "num", _MISSING)
        if uuid_value is not _MISSING and uuid_value is not None:
            value = uuid_value
        elif number_value is not _MISSING and number_value is not None:
            value = number_value

    return validate_scan_cursor(value)


def _qdrant_offset(cursor: str | None) -> str | int | None:
    if cursor is None:
        return None
    if cursor.isdecimal():
        return int(cursor)
    return cursor


def _safe_payload(payload: object) -> dict[str, Any]:
    if not isinstance(payload, Mapping):
        raise ValueError("Qdrant point payload must be an object")
    # Do not return the provider's mapping or any fields outside the explicit
    # application payload contract.
    return {
        field: cast(Any, payload[field])
        for field in INDEX_PAYLOAD_FIELDS
        if field in payload
    }


def _schema_data_type(value: object) -> str | None:
    raw = _member(value, "data_type", _MISSING)
    if raw is _MISSING and isinstance(value, Mapping):
        raw = value.get("type", _MISSING)
    if raw is _MISSING or raw is None:
        return None
    normalized = getattr(raw, "value", raw)
    return str(normalized).casefold()


class QdrantVectorStore(VectorStore):
    def __init__(
        self,
        url: str,
        collection_name: str,
        alias_name: str | None = None,
        api_key: str | None = None,
        timeout_seconds: float = 3.0,
        dimensions: int = 1024,
        embedding_model: str = "",
        auto_initialize: bool = False,
    ) -> None:
        from qdrant_client import QdrantClient

        if dimensions < 1 or not collection_name.strip():
            raise ValueError("Qdrant collection and dimensions are required")
        if not embedding_model.strip():
            raise ValueError("Qdrant embedding model is required")
        self.collection_name = collection_name
        self.alias_name = alias_name or collection_name
        self.dimensions = dimensions
        self.embedding_model = embedding_model
        self.auto_initialize = auto_initialize
        self._client = QdrantClient(
            url=url, api_key=api_key, timeout=max(1, math.ceil(timeout_seconds))
        )

    def _collection_vector_config(self, info: Any) -> Any | None:
        config = getattr(info, "config", None)
        params = getattr(config, "params", None)
        vectors = getattr(params, "vectors", None)
        if isinstance(vectors, dict) or vectors is None:
            return None
        return vectors

    def _collection_vector_size(self, info: Any) -> int | None:
        vectors = self._collection_vector_config(info)
        size = getattr(vectors, "size", None)
        return int(size) if isinstance(size, int) and not isinstance(size, bool) else None

    def _collection_distance(self, info: Any) -> str | None:
        vectors = self._collection_vector_config(info)
        if vectors is None:
            return None
        distance = getattr(vectors, "distance", None)
        if distance is None:
            return None
        return str(getattr(distance, "value", distance))

    def _expected_collection_metadata(self) -> dict[str, object]:
        return {
            **_FOUNDATION_METADATA,
            **{
                **_REPRESENTATION_METADATA_FIELDS,
                "embedding_model": self.embedding_model,
                "embedding_dimensions": self.dimensions,
            },
        }

    def _metadata_state(self, info: Any) -> str:
        metadata = getattr(getattr(info, "config", None), "metadata", None)
        if not isinstance(metadata, Mapping):
            return "mismatch"
        expected = self._expected_collection_metadata()
        for key, value in _FOUNDATION_METADATA.items():
            if metadata.get(key) != value:
                return "mismatch"

        if metadata.get("embedding_dimensions") != self.dimensions:
            return "mismatch"
        if metadata.get("embedding_model") != self.embedding_model:
            return "mismatch"

        # Phase 1 already stored model name/dimension.  Only the new
        # representation markers distinguish a fully upgraded Phase 2
        # collection from that compatible legacy metadata.
        present_versions = _PHASE2_VERSION_METADATA_KEYS.intersection(metadata)
        if not present_versions:
            return "legacy"
        if present_versions != _PHASE2_VERSION_METADATA_KEYS:
            return "mismatch"
        for key in _PHASE2_VERSION_METADATA_KEYS:
            if metadata.get(key) != expected[key]:
                return "mismatch"
        return "current"

    def _upgrade_legacy_metadata_sync(self, info: Any) -> tuple[str, Any]:
        state = self._metadata_state(info)
        if state != "legacy":
            return state, info
        update_collection = getattr(self._client, "update_collection", None)
        if not callable(update_collection):
            # The phase-1 client contract did not expose collection metadata
            # updates.  Keep its model-space readiness behavior intact; real
            # qdrant-client versions have update_collection and take the
            # upgrade path below.
            return "legacy", info
        if not self.auto_initialize:
            # A Phase 1 collection is still a compatible model space.  Do not
            # make an existing deployment unready merely because it has not
            # opted into the additive Phase 2 metadata update yet.
            return "legacy", info
        try:
            update_collection(
                collection_name=self.collection_name,
                metadata=self._expected_collection_metadata(),
            )
        except Exception:
            return "mismatch", info
        # Qdrant acknowledges the metadata update as an operation.  Avoid a
        # second read here: some server/client combinations return the old
        # CollectionInfo until the operation has propagated.
        return "current", info

    def _ensure_payload_indexes_sync(self, info: Any) -> bool:
        payload_schema = getattr(info, "payload_schema", None)
        if payload_schema is not None and not isinstance(payload_schema, Mapping):
            return False
        existing = payload_schema if isinstance(payload_schema, Mapping) else {}
        create_payload_index = getattr(self._client, "create_payload_index", None)
        for field_name, field_type in PAYLOAD_INDEX_SCHEMAS.items():
            current = existing.get(field_name)
            if current is not None:
                if _schema_data_type(current) != field_type:
                    return False
                continue
            if not callable(create_payload_index):
                # Preserve compatibility with the small phase-1 test/client
                # doubles.  Supported production clients always expose this
                # operation, and health will fail on its actual errors.
                continue
            try:
                from qdrant_client import models

                field_schema = getattr(models.PayloadSchemaType, field_type.upper())
                create_payload_index(
                    collection_name=self.collection_name,
                    field_name=field_name,
                    field_schema=field_schema,
                    wait=True,
                )
            except Exception:
                return False
        return True

    def _ensure_foundation_sync(self) -> bool:
        self._client.get_collections()
        exists = self._client.collection_exists(self.collection_name)
        if not exists:
            if not self.auto_initialize:
                return False
            from qdrant_client import models

            # Keep the phase-1 foundation metadata unchanged at creation time.
            # The metadata upgrade immediately below adds the phase-2
            # representation contract without invalidating existing tooling.
            self._client.create_collection(
                collection_name=self.collection_name,
                vectors_config=models.VectorParams(
                    size=self.dimensions, distance=models.Distance.COSINE
                ),
                metadata={
                    "embedding_model": self.embedding_model,
                    "embedding_dimensions": self.dimensions,
                    "foundation_version": "phase1",
                },
            )
        info = self._client.get_collection(self.collection_name)
        if self._collection_vector_size(info) != self.dimensions:
            return False
        if self._collection_distance(info) != "Cosine":
            return False

        metadata_state, info = self._upgrade_legacy_metadata_sync(info)
        if metadata_state == "mismatch":
            return False
        if not self._ensure_payload_indexes_sync(info):
            return False

        aliases_response = self._client.get_aliases()
        aliases = getattr(aliases_response, "aliases", None)
        if not isinstance(aliases, Iterable):
            return False
        matching = [
            alias
            for alias in aliases
            if _member(alias, "alias_name", None) == self.alias_name
        ]
        if len(matching) > 1 or (
            matching and _member(matching[0], "collection_name", None) != self.collection_name
        ):
            return False
        if not matching and self.alias_name != self.collection_name:
            if not self.auto_initialize:
                return False
            from qdrant_client import models

            self._client.update_collection_aliases(
                [
                    models.CreateAliasOperation(
                        create_alias=models.CreateAlias(
                            collection_name=self.collection_name, alias_name=self.alias_name
                        )
                    )
                ]
            )
        return True

    async def health(self) -> bool:
        try:
            return await asyncio.to_thread(self._ensure_foundation_sync)
        except Exception:
            return False

    async def search(
        self, vector: Sequence[float], limit: int, filters: dict[str, Any] | None = None
    ) -> list[VectorMatch]:
        try:
            query_vector = validate_vector(vector, self.dimensions)
        except ValueError as exc:
            raise ProviderError("Query vector dimensions or values are invalid") from exc
        from qdrant_client import models

        query_filter = None
        if filters:
            query_filter = models.Filter(
                must=[
                    models.FieldCondition(key=key, match=models.MatchValue(value=value))
                    for key, value in filters.items()
                ]
            )
        try:
            points_response = await asyncio.to_thread(
                self._client.query_points,
                collection_name=self.alias_name,
                query=query_vector,
                query_filter=query_filter,
                limit=max(1, min(limit, 50)),
                with_payload=list(INDEX_PAYLOAD_FIELDS),
            )
            points = points_response.points
        except Exception as exc:
            raise ProviderError() from exc
        matches: list[VectorMatch] = []
        for point in points:
            try:
                point_id = _canonical_uuid(_member(point, "id"), "point_id")
                score = float(_member(point, "score"))
                payload = _safe_payload(_member(point, "payload"))
            except (TypeError, ValueError) as exc:
                raise ProviderError("Vector store returned invalid search metadata") from exc
            matches.append(VectorMatch(point_id, score, payload))
        return matches

    async def upsert(self, records: Sequence[VectorRecord]) -> None:
        from qdrant_client import models

        try:
            points = [
                models.PointStruct(
                    id=record.point_id,
                    vector=validate_vector(record.vector, self.dimensions),
                    payload=record.payload,
                )
                for record in records
            ]
        except ValueError as exc:
            raise ProviderError("Vector dimensions or values are invalid") from exc
        if points:
            try:
                await asyncio.to_thread(
                    self._client.upsert,
                    collection_name=self.alias_name,
                    points=points,
                    wait=True,
                )
            except Exception as exc:
                raise ProviderError() from exc

    async def delete(self, point_ids: Sequence[str]) -> None:
        from qdrant_client import models

        if point_ids:
            try:
                await asyncio.to_thread(
                    self._client.delete,
                    collection_name=self.alias_name,
                    points_selector=models.PointIdsList(points=list(point_ids)),
                    wait=True,
                )
            except Exception as exc:
                raise ProviderError() from exc

    async def get_by_job_id(self, job_id: str) -> list[VectorRecord]:
        """Read the current job's bounded payload and vectors for idempotent replay."""

        from qdrant_client import models

        try:
            canonical_job_id = _canonical_uuid(job_id, "job_id")
        except ValueError as exc:
            raise ProviderError("Job ID is invalid") from exc
        query_filter = models.Filter(
            must=[
                models.FieldCondition(
                    key="job_id",
                    match=models.MatchValue(value=canonical_job_id),
                )
            ]
        )
        try:
            response = await asyncio.to_thread(
                self._client.scroll,
                collection_name=self.alias_name,
                scroll_filter=query_filter,
                limit=128,
                with_payload=list(INDEX_PAYLOAD_FIELDS),
                with_vectors=True,
            )
            raw_points, _ = _scroll_parts(response)
            if isinstance(raw_points, (str, bytes, Mapping)) or not isinstance(
                raw_points, Iterable
            ):
                raise ValueError("Qdrant scroll points are invalid")
            points = raw_points
        except ProviderError:
            raise
        except ValueError as exc:
            raise ProviderError("Vector store returned invalid stored points") from exc
        except Exception as exc:
            raise ProviderError() from exc
        records: list[VectorRecord] = []
        for point in points:
            try:
                point_id = _canonical_uuid(_member(point, "id"), "point_id")
                vector_value: object = _member(point, "vector")
                if isinstance(vector_value, Mapping):
                    # The job collection is dense-only. Refuse a malformed or
                    # unexpectedly named vector rather than guessing a vector.
                    vector_value = vector_value.get("")
                if not isinstance(vector_value, list):
                    raise ValueError("stored vector is not a list")
                vector = validate_vector(vector_value, self.dimensions)
                payload = _safe_payload(_member(point, "payload"))
            except (TypeError, ValueError) as exc:
                raise ProviderError("Vector store returned invalid stored point") from exc
            records.append(VectorRecord(point_id, vector, payload))
        return records

    async def scan_metadata(self, cursor: str | None, limit: int) -> VectorMetadataScanPage:
        """Scroll bounded reconciliation metadata without vectors or job text."""

        safe_limit = bounded_scan_limit(limit)
        normalized_cursor = validate_scan_cursor(cursor)
        offset = _qdrant_offset(normalized_cursor)
        try:
            response = await asyncio.to_thread(
                self._client.scroll,
                collection_name=self.alias_name,
                offset=offset,
                limit=safe_limit,
                with_payload=list(SCAN_METADATA_PAYLOAD_FIELDS),
                with_vectors=False,
            )
            raw_points, raw_next_cursor = _scroll_parts(response)
            if isinstance(raw_points, (str, bytes, Mapping)) or not isinstance(
                raw_points, Iterable
            ):
                raise ValueError("Qdrant scroll points are invalid")
            points = list(islice(raw_points, safe_limit))
            metadata = [
                parse_vector_point_metadata(
                    _member(point, "id"),
                    cast(Mapping[str, object], _member(point, "payload")),
                )
                for point in points
            ]
            next_cursor = _cursor_token(raw_next_cursor)
            if next_cursor == normalized_cursor:
                raise ValueError("Qdrant scroll cursor did not advance")
            return VectorMetadataScanPage(metadata, next_cursor)
        except ProviderError:
            raise
        except ValueError as exc:
            raise ProviderError("Vector store returned invalid metadata scan") from exc
        except Exception as exc:
            raise ProviderError() from exc
