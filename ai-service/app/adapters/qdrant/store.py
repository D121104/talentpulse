from __future__ import annotations

import asyncio
import inspect
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
    REPRESENTATION_METADATA_POINT_ID,
    RESERVED_POINT_PAYLOAD_KEY,
    RESERVED_POINT_PAYLOAD_VALUE,
    RESERVED_POINT_SCHEMA_KEY,
    RESERVED_POINT_SCHEMA_VERSION,
    RepresentationManifest,
    is_reserved_metadata_payload,
    validate_safe_identifier,
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
    "collection_version",
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
# ``embedding_dimensions`` was already part of the Phase 1 metadata contract.
# Only these additive markers identify the upgraded Phase 2 representation.
_PHASE2_VERSION_METADATA_KEYS = frozenset(
    {
        "embedding_provider",
        "embedding_model_version",
        "normalization_version",
        "chunking_version",
        "index_schema_version",
        "collection_version",
    }
)
_METADATA_MAX_KEYS = 10
_METADATA_MAX_STRING_LENGTH = 256
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


def _is_reserved_point_id(value: object) -> bool:
    try:
        return _canonical_uuid(value, "point_id") == str(REPRESENTATION_METADATA_POINT_ID)
    except ValueError:
        return False


def _supports_keyword(callable_object: object, keyword: str) -> bool:
    if not callable(callable_object):
        return False
    try:
        parameters = inspect.signature(callable_object).parameters
    except (TypeError, ValueError):
        return False
    return keyword in parameters or any(
        parameter.kind is inspect.Parameter.VAR_KEYWORD for parameter in parameters.values()
    )


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
    return {field: cast(Any, payload[field]) for field in INDEX_PAYLOAD_FIELDS if field in payload}


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
        collection_version: str | None = None,
        embedding_provider: str = "",
        allow_legacy_metadata: bool = False,
    ) -> None:
        from qdrant_client import QdrantClient

        if (
            not isinstance(dimensions, int)
            or isinstance(dimensions, bool)
            or not 1 <= dimensions <= 4096
        ):
            raise ValueError("Qdrant collection and dimensions are required and bounded")
        if not isinstance(embedding_model, str) or not 1 <= len(embedding_model.strip()) <= 256:
            raise ValueError("Qdrant embedding model is required and bounded")
        self.collection_name = validate_safe_identifier(collection_name, "Qdrant collection", 255)
        if alias_name is None:
            self.alias_name = self.collection_name
        else:
            self.alias_name = validate_safe_identifier(alias_name, "Qdrant alias", 255)
        self.dimensions = dimensions
        self.embedding_model = embedding_model.strip()
        self.embedding_provider = validate_safe_identifier(
            embedding_provider, "Qdrant embedding provider", 64
        )
        if collection_version is not None:
            collection_version = validate_safe_identifier(
                collection_version, "Qdrant collection version", 128
            )
        self.collection_version = collection_version
        self.allow_legacy_metadata = allow_legacy_metadata
        self.auto_initialize = auto_initialize
        # The service deliberately tolerates the supported Qdrant 1.13.x server
        # with a newer host client.  Compatibility is proved by the operations
        # used below; constructor warnings/errors must not prevent the adapter
        # from starting before readiness can report the bounded result.
        # Newer clients warn before making a request when the server is an
        # older, still-supported release.  Only pass this option when the
        # installed client explicitly supports it; older clients must not see
        # an invented constructor keyword.
        try:
            client_parameters: Mapping[str, inspect.Parameter] = inspect.signature(
                QdrantClient
            ).parameters
        except (TypeError, ValueError):
            client_parameters = {}
        if "check_compatibility" in client_parameters:
            self._client = QdrantClient(
                url=url,
                api_key=api_key,
                timeout=max(1, math.ceil(timeout_seconds)),
                check_compatibility=False,
            )
        else:
            self._client = QdrantClient(
                url=url,
                api_key=api_key,
                timeout=max(1, math.ceil(timeout_seconds)),
            )

    def _collection_vector_config(self, info: Any) -> Any | None:
        config = getattr(info, "config", None)
        params = getattr(config, "params", None)
        vectors = getattr(params, "vectors", None)
        if vectors is None:
            return None
        if isinstance(vectors, Mapping):
            if len(vectors) != 1 or "" not in vectors:
                return None
            vectors = vectors[""]
        if (
            _member(vectors, "size", _MISSING) is _MISSING
            or _member(vectors, "distance", _MISSING) is _MISSING
        ):
            return None
        return vectors

    def _collection_vector_size(self, info: Any) -> int | None:
        vectors = self._collection_vector_config(info)
        size = _member(vectors, "size", None)
        return int(size) if isinstance(size, int) and not isinstance(size, bool) else None

    def _collection_distance(self, info: Any) -> str | None:
        vectors = self._collection_vector_config(info)
        distance = _member(vectors, "distance", None)
        if distance is None:
            return None
        return str(getattr(distance, "value", distance))

    def representation_manifest(self) -> RepresentationManifest:
        return RepresentationManifest(
            provider=self.embedding_provider,
            model=self.embedding_model,
            dimensions=self.dimensions,
            normalization_version=NORMALIZATION_VERSION,
            chunking_version=CHUNKING_VERSION,
            index_schema_version=INDEX_SCHEMA_VERSION,
            physical_collection=self.collection_name,
            alias=self.alias_name,
            collection_version=self.collection_version,
        )

    def _expected_collection_metadata(self) -> dict[str, object]:
        embedding_provider = getattr(self, "embedding_provider", "")
        collection_version = getattr(self, "collection_version", None)
        metadata: dict[str, object] = {
            **_FOUNDATION_METADATA,
            **_REPRESENTATION_METADATA_FIELDS,
            "embedding_model": self.embedding_model,
            "embedding_model_version": self.embedding_model,
            "embedding_dimensions": self.dimensions,
        }
        if isinstance(embedding_provider, str) and embedding_provider:
            metadata["embedding_provider"] = embedding_provider
        if isinstance(collection_version, str) and collection_version:
            metadata["collection_version"] = collection_version
        return metadata

    def _legacy_metadata_allowed(self) -> bool:
        configured = getattr(self, "allow_legacy_metadata", None)
        if isinstance(configured, bool):
            return configured
        # Direct Phase 1 test doubles were created before this flag existed.
        # A missing collection version is the only compatibility shape they can
        # represent; real application instances always set the flag explicitly.
        return getattr(self, "collection_version", None) is None

    @staticmethod
    def _bounded_metadata(metadata: Mapping[str, object]) -> dict[str, object]:
        """Return the small, typed marker payload allowed in Qdrant."""

        if len(metadata) > _METADATA_MAX_KEYS:
            raise ValueError("Qdrant representation metadata has too many fields")
        result: dict[str, object] = {}
        for key, value in metadata.items():
            if not isinstance(key, str) or not key or len(key) > 64:
                raise ValueError("Qdrant representation metadata key is invalid")
            if isinstance(value, int) and not isinstance(value, bool) and value >= 1:
                result[key] = value
            elif (
                isinstance(value, str)
                and value
                and len(value) <= _METADATA_MAX_STRING_LENGTH
                and value == value.strip()
            ):
                result[key] = value
            else:
                raise ValueError("Qdrant representation metadata value is invalid")
        return result

    def _expected_marker_payload(self) -> dict[str, object]:
        metadata = self._bounded_metadata(self._expected_collection_metadata())
        return {
            RESERVED_POINT_PAYLOAD_KEY: RESERVED_POINT_PAYLOAD_VALUE,
            RESERVED_POINT_SCHEMA_KEY: RESERVED_POINT_SCHEMA_VERSION,
            **metadata,
        }

    def _metadata_state(self, metadata_or_info: object, *, marker: bool = False) -> str:
        """Classify collection or marker metadata without trusting its shape."""

        metadata: object = metadata_or_info
        if not isinstance(metadata, Mapping):
            metadata = getattr(getattr(metadata_or_info, "config", None), "metadata", _MISSING)
        if metadata is _MISSING or metadata is None:
            return "missing"
        if not isinstance(metadata, Mapping) or not metadata:
            return "mismatch"

        expected = self._expected_collection_metadata()
        values: Mapping[str, object] = metadata
        if marker:
            schema_version = metadata.get(RESERVED_POINT_SCHEMA_KEY)
            if (
                metadata.get(RESERVED_POINT_PAYLOAD_KEY) != RESERVED_POINT_PAYLOAD_VALUE
                or isinstance(schema_version, bool)
                or schema_version != RESERVED_POINT_SCHEMA_VERSION
            ):
                return "mismatch"
            values = {
                key: value
                for key, value in metadata.items()
                if key not in {RESERVED_POINT_PAYLOAD_KEY, RESERVED_POINT_SCHEMA_KEY}
            }

        try:
            bounded_values = self._bounded_metadata(values)
        except ValueError:
            return "mismatch"

        for key, value in _FOUNDATION_METADATA.items():
            if bounded_values.get(key) != value:
                return "mismatch"

        metadata_dimensions = bounded_values.get("embedding_dimensions")
        if (
            isinstance(metadata_dimensions, bool)
            or not isinstance(metadata_dimensions, int)
            or metadata_dimensions != self.dimensions
        ):
            return "mismatch"
        if bounded_values.get("embedding_model") != self.embedding_model:
            return "mismatch"

        expected_phase2 = {
            key: expected[key] for key in _PHASE2_VERSION_METADATA_KEYS if key in expected
        }
        required_phase2 = set(expected_phase2)
        has_complete_phase2 = required_phase2.issubset(bounded_values)
        if has_complete_phase2:
            if set(bounded_values) != set(expected):
                return "mismatch"
            if any(bounded_values.get(key) != value for key, value in expected_phase2.items()):
                return "mismatch"
            return "current"

        # A partially written Phase 2 marker is drift, not a legacy marker.
        # Legacy compatibility is limited to metadata with none of the
        # provider/version fields that identify the upgraded representation.
        if _PHASE2_VERSION_METADATA_KEYS.intersection(bounded_values):
            return "mismatch"
        if not self._legacy_metadata_allowed():
            return "mismatch"
        legacy_keys = set(_FOUNDATION_METADATA) | {
            "embedding_model",
            "embedding_model_version",
            "embedding_dimensions",
            "normalization_version",
            "chunking_version",
            "index_schema_version",
        }
        if set(bounded_values) - legacy_keys:
            return "mismatch"
        for key, value in expected_phase2.items():
            if key in bounded_values and bounded_values[key] != value:
                return "mismatch"
        return "legacy"

    def _marker_metadata_from_point(self, point: object) -> Mapping[str, object] | None:
        point_id = _member(point, "id")
        if point_id is _MISSING:
            return None
        try:
            if _canonical_uuid(point_id, "point_id") != str(REPRESENTATION_METADATA_POINT_ID):
                return None
        except ValueError:
            return None
        payload = _member(point, "payload")
        # Return malformed marker payloads as an empty mapping so readiness
        # fails closed instead of treating a reserved point as absent.
        return payload if isinstance(payload, Mapping) else {}

    def _read_marker_metadata_sync(self) -> Mapping[str, object] | None:
        """Read the reserved marker using APIs supported by Qdrant 1.13."""

        retrieve = getattr(self._client, "retrieve", None)
        if callable(retrieve):
            try:
                response = retrieve(
                    collection_name=self.collection_name,
                    ids=[str(REPRESENTATION_METADATA_POINT_ID)],
                    with_payload=True,
                    with_vectors=False,
                )
            except Exception:
                # A client double or older SDK may not expose retrieve.  Fall
                # through to scroll, which is part of the Phase 1 contract.
                response = None
            if isinstance(response, Iterable) and not isinstance(response, (str, bytes, Mapping)):
                for point in response:
                    marker = self._marker_metadata_from_point(point)
                    if marker is not None:
                        return marker
                return None

        scroll = getattr(self._client, "scroll", None)
        if not callable(scroll):
            return None
        from qdrant_client import models

        response = scroll(
            collection_name=self.collection_name,
            scroll_filter=models.Filter(
                must=[
                    models.HasIdCondition(has_id=[str(REPRESENTATION_METADATA_POINT_ID)]),
                ]
            ),
            limit=1,
            with_payload=True,
            with_vectors=False,
        )
        points, _ = _scroll_parts(response)
        if isinstance(points, Iterable) and not isinstance(points, (str, bytes, Mapping)):
            for point in points:
                marker = self._marker_metadata_from_point(point)
                if marker is not None:
                    return marker
        return None

    def _write_marker_metadata_sync(self) -> Mapping[str, object] | None:
        upsert = getattr(self._client, "upsert", None)
        if not callable(upsert):
            return None
        from qdrant_client import models

        payload = self._expected_marker_payload()
        upsert(
            collection_name=self.collection_name,
            points=[
                models.PointStruct(
                    id=str(REPRESENTATION_METADATA_POINT_ID),
                    # This point is never queried for relevance; a finite unit
                    # vector is accepted by all supported dense Qdrant spaces.
                    vector=[1.0] + [0.0] * (self.dimensions - 1),
                    payload=payload,
                )
            ],
            wait=True,
        )
        return self._read_marker_metadata_sync()

    @staticmethod
    def _collection_points_count(info: object) -> int | None:
        value = _member(info, "points_count", None)
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            return None
        return value

    def _ensure_representation_metadata_sync(self, info: object, *, created: bool = False) -> bool:
        """Verify durable Phase 2 metadata without relying on collection config."""

        collection_state = self._metadata_state(info)
        if collection_state == "mismatch":
            return False

        marker = self._read_marker_metadata_sync()
        marker_state = self._metadata_state(marker, marker=True)
        if marker is not None:
            if marker_state == "current":
                return True
            # A reserved point is authoritative.  A legacy marker is accepted
            # only by the explicit local compatibility path; it is never
            # silently upgraded into a different provider/model space.
            return marker_state == "legacy" and self._legacy_metadata_allowed()

        # A deployment running a Qdrant version that genuinely persists
        # collection metadata can use that supported collection-level marker.
        if collection_state == "current":
            return True

        # A Phase 1 model-space marker is safe to keep only in the explicit
        # local compatibility mode.  Existing local collections remain ready
        # even when their older client cannot read/write point markers.  A
        # newly-created collection still attempts the stronger marker whenever
        # the client exposes the required point API.
        if collection_state == "legacy" and self._legacy_metadata_allowed():
            if not created or not callable(getattr(self._client, "upsert", None)):
                return True
            marker = self._write_marker_metadata_sync()
            marker_state = self._metadata_state(marker, marker=True)
            return marker_state == "current"

        # Non-local deployments must never treat Phase 1 metadata as evidence
        # for the current provider/model space, even when the collection is
        # empty and auto-initialization is enabled.
        if collection_state == "legacy":
            return False

        if not self.auto_initialize:
            return False

        # On Qdrant 1.13, missing collection metadata is indistinguishable from
        # an unverified existing index.  Only an empty collection may be
        # initialized safely; otherwise a marker write could mix model spaces.
        if (
            not created
            and collection_state == "missing"
            and self._collection_points_count(info) != 0
        ):
            return False
        marker = self._write_marker_metadata_sync()
        marker_state = self._metadata_state(marker, marker=True)
        return marker_state == "current" or (
            marker_state == "legacy" and self._legacy_metadata_allowed()
        )

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

    @staticmethod
    def _aliases_for_collection(response: object) -> list[object] | None:
        """Normalize SDK and REST-like alias response shapes."""

        aliases = _member(response, "aliases", _MISSING)
        if aliases is _MISSING:
            result = _member(response, "result", _MISSING)
            if result is _MISSING:
                return None
            aliases = _member(result, "aliases", _MISSING)
        if aliases is _MISSING or isinstance(aliases, (str, bytes, Mapping)):
            return None
        if not isinstance(aliases, Iterable):
            return None
        try:
            return list(aliases)
        except Exception:
            return None

    def alias_manager(self) -> object:
        from .alias_manager import QdrantAliasManager

        return QdrantAliasManager(self._client)

    def _alias_matches_expected(self, response: object) -> bool:
        if self.alias_name == self.collection_name:
            return True
        aliases = self._aliases_for_collection(response)
        if aliases is None:
            return False
        matching = [
            alias for alias in aliases if _member(alias, "alias_name", None) == self.alias_name
        ]
        return len(matching) == 1 and (
            _member(matching[0], "collection_name", None) == self.collection_name
        )

    def switch_alias(
        self,
        *,
        target_collection: str,
        expected_current_collection: str | None,
        target_manifest: RepresentationManifest,
    ) -> object:
        """Operator-only alias switch; readiness never calls this boundary."""

        from .alias_manager import QdrantAliasManager

        manager = QdrantAliasManager(self._client)
        return manager.switch_alias(
            alias_name=self.alias_name,
            target_collection=target_collection,
            expected_current_collection=expected_current_collection,
            expected_manifest=target_manifest,
        )

    def rollback_alias(
        self,
        *,
        previous_collection: str,
        expected_current_collection: str,
        previous_manifest: RepresentationManifest,
    ) -> object:
        """Operator-only alias rollback; application paths never call it."""

        from .alias_manager import QdrantAliasManager

        manager = QdrantAliasManager(self._client)
        return manager.rollback_alias(
            alias_name=self.alias_name,
            previous_collection=previous_collection,
            expected_current_collection=expected_current_collection,
            expected_manifest=previous_manifest,
        )

    def _ensure_foundation_sync(self) -> bool:
        self._client.get_collections()
        exists = self._client.collection_exists(self.collection_name)
        created = False
        if not exists:
            if not self.auto_initialize:
                return False
            created = True
            from qdrant_client import models

            # The canonical collection metadata API is not reliable on the
            # supported Qdrant 1.13/server and client combination.  Persist the
            # Phase 2 representation marker through point APIs below.
            create_collection = self._client.create_collection
            create_kwargs: dict[str, Any] = {
                "collection_name": self.collection_name,
                "vectors_config": models.VectorParams(
                    size=self.dimensions, distance=models.Distance.COSINE
                ),
            }
            # Preserve the Phase 1 metadata for clients that support the
            # keyword, while never sending it to an older client.  The marker
            # below remains authoritative when the server accepts but drops it.
            if _supports_keyword(create_collection, "metadata"):
                create_kwargs["metadata"] = {
                    "embedding_model": self.embedding_model,
                    "embedding_dimensions": self.dimensions,
                    "foundation_version": "phase1",
                }
            create_collection(**create_kwargs)
        info = self._client.get_collection(self.collection_name)
        if self._collection_vector_size(info) != self.dimensions:
            return False
        if self._collection_distance(info) != "Cosine":
            return False

        if not self._ensure_representation_metadata_sync(info, created=created):
            return False
        if not self._ensure_payload_indexes_sync(info):
            return False

        # A physical collection name is already a valid point target; no alias
        # needs to exist for this explicitly configured mode.
        if self.alias_name == self.collection_name:
            return True

        aliases_response = self._client.get_aliases()
        if self._alias_matches_expected(aliases_response):
            return True
        aliases = self._aliases_for_collection(aliases_response)
        if aliases is None:
            return False
        matching = [
            alias for alias in aliases if _member(alias, "alias_name", None) == self.alias_name
        ]
        # An existing alias is immutable from this adapter.  Reassigning it
        # here could cut over readers and writers to an unintended collection.
        if matching:
            return False
        if not self.auto_initialize:
            return False
        from qdrant_client import models

        alias_update_result = self._client.update_collection_aliases(
            [
                models.CreateAliasOperation(
                    create_alias=models.CreateAlias(
                        collection_name=self.collection_name, alias_name=self.alias_name
                    )
                )
            ]
        )
        if not alias_update_result:
            return False
        return self._alias_matches_expected(self._client.get_aliases())

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

        filter_conditions = [
            models.FieldCondition(key=key, match=models.MatchValue(value=value))
            for key, value in (filters or {}).items()
        ]
        # Exclude the compatibility marker by ID so this does not depend on
        # an unindexed reserved payload field or a newer filter API.
        query_filter = models.Filter(
            must=cast(Any, filter_conditions),
            must_not=[models.HasIdCondition(has_id=[str(REPRESENTATION_METADATA_POINT_ID)])],
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
                score_value: object = _member(point, "score")
                if (
                    isinstance(score_value, bool)
                    or not isinstance(score_value, (int, float))
                    or not math.isfinite(score_value)
                ):
                    raise ValueError("search score is invalid")
                score = float(score_value)
                raw_payload = _member(point, "payload")
                if _is_reserved_point_id(point_id) or is_reserved_metadata_payload(raw_payload):
                    continue
                payload = _safe_payload(raw_payload)
            except (TypeError, ValueError) as exc:
                raise ProviderError("Vector store returned invalid search metadata") from exc
            matches.append(VectorMatch(point_id, score, payload))
        return matches

    async def upsert(self, records: Sequence[VectorRecord]) -> None:
        from qdrant_client import models

        try:
            if any(
                _is_reserved_point_id(record.point_id)
                or is_reserved_metadata_payload(record.payload)
                for record in records
            ):
                raise ValueError("reserved Qdrant metadata point cannot be indexed")
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
            if any(_is_reserved_point_id(point_id) for point_id in point_ids):
                raise ProviderError("reserved Qdrant metadata point cannot be deleted")
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
                raw_payload = _member(point, "payload")
                if _is_reserved_point_id(point_id) or is_reserved_metadata_payload(raw_payload):
                    continue
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

    async def scan_metadata(
        self, cursor: str | None, limit: int, job_id: str | None = None
    ) -> VectorMetadataScanPage:
        """Scroll bounded reconciliation metadata without vectors or job text."""

        safe_limit = bounded_scan_limit(limit)
        normalized_cursor = validate_scan_cursor(cursor)
        normalized_job_id = None
        if job_id is not None:
            try:
                normalized_job_id = _canonical_uuid(job_id, "job_id")
            except ValueError as exc:
                raise ProviderError("Job ID is invalid") from exc
        offset = _qdrant_offset(normalized_cursor)
        try:
            from qdrant_client import models

            must = (
                [
                    models.FieldCondition(
                        key="job_id",
                        match=models.MatchValue(value=normalized_job_id),
                    )
                ]
                if normalized_job_id is not None
                else []
            )
            response = await asyncio.to_thread(
                self._client.scroll,
                collection_name=self.alias_name,
                offset=offset,
                limit=safe_limit,
                scroll_filter=models.Filter(
                    must=cast(Any, must),
                    must_not=[models.HasIdCondition(has_id=[str(REPRESENTATION_METADATA_POINT_ID)])],
                ),
                with_payload=list(SCAN_METADATA_PAYLOAD_FIELDS),
                with_vectors=False,
            )
            raw_points, raw_next_cursor = _scroll_parts(response)
            if isinstance(raw_points, (str, bytes, Mapping)) or not isinstance(
                raw_points, Iterable
            ):
                raise ValueError("Qdrant scroll points are invalid")
            points = [
                point
                for point in islice(raw_points, safe_limit + 1)
                if not _is_reserved_point_id(_member(point, "id"))
                and not is_reserved_metadata_payload(_member(point, "payload"))
            ][:safe_limit]
            metadata = [
                parse_vector_point_metadata(
                    _member(point, "id"),
                    cast(Mapping[str, object], _member(point, "payload")),
                )
                for point in points
            ]
            next_cursor = _cursor_token(raw_next_cursor)
            if normalized_cursor is not None and next_cursor == normalized_cursor:
                raise ValueError("Qdrant scroll cursor did not advance")
            return VectorMetadataScanPage(metadata, next_cursor)
        except ProviderError:
            raise
        except ValueError as exc:
            raise ProviderError("Vector store returned invalid metadata scan") from exc
        except Exception as exc:
            raise ProviderError() from exc
