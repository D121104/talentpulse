from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from typing import Protocol, cast

from qdrant_client.models import (
    CreateAlias,
    CreateAliasOperation,
    Distance,
    PayloadSchemaType,
    PointStruct,
    VectorParams,
)

from app.application.indexing import NORMALIZATION_VERSION
from app.application.retrieval import (
    FILTERABLE_PAYLOAD_SCHEMA,
    REPRESENTATION_MARKER_FIELD,
    REPRESENTATION_MARKER_VALUE,
)
from app.core.config import Settings


class QdrantAdminClient(Protocol):
    """Only the Qdrant control-plane calls needed by the operator command."""

    def collection_exists(self, collection_name: str) -> bool: ...

    def get_collection(self, collection_name: str) -> object: ...

    def get_aliases(self) -> object: ...

    def create_collection(self, **kwargs: object) -> object: ...

    def create_payload_index(self, **kwargs: object) -> object: ...

    def update_collection_aliases(self, **kwargs: object) -> object: ...

    def retrieve(self, **kwargs: object) -> object: ...

    def count(self, **kwargs: object) -> object: ...

    def upsert(self, **kwargs: object) -> object: ...


class QdrantAdminError(RuntimeError):
    """Safe operator-facing failure; provider exception details never cross this boundary."""


class QdrantAdminAdapter:
    def __init__(self, client: object, settings: Settings) -> None:
        self._client = cast(QdrantAdminClient, client)
        self._collection = _required(settings.qdrant_collection, "collection")
        self._alias = _required(settings.qdrant_alias, "alias")
        self._index_version = _required(settings.qdrant_index_version, "index version")
        self._embedding_model = _required(settings.cohere_model, "embedding model")
        self._dimensions = settings.cohere_dimensions

    def initialize_and_verify(self) -> dict[str, object]:
        """Create/verify the demo index without deleting or repointing state."""
        try:
            aliases = _aliases(self._client.get_aliases())
            alias_target = next((target for name, target in aliases if name == self._alias), None)
            if alias_target is not None and alias_target != self._collection:
                raise QdrantAdminError("Configured Qdrant alias targets another collection.")

            created_collection = not self._client.collection_exists(self._collection)
            if created_collection:
                self._client.create_collection(
                    collection_name=self._collection,
                    vectors_config=VectorParams(size=self._dimensions, distance=Distance.COSINE),
                )

            info = self._client.get_collection(self._collection)
            _verify_vectors(info, self._dimensions)
            schema = _payload_schema(info)
            incompatible = [
                field_name
                for field_name, field_type in FILTERABLE_PAYLOAD_SCHEMA.items()
                if field_name in schema and schema[field_name] != field_type
            ]
            if incompatible:
                raise QdrantAdminError(
                    f"Qdrant payload index has an incompatible type: {incompatible[0]}."
                )
            marker_created = self._ensure_representation_marker(
                created_collection=created_collection
            )

            created_indexes: list[str] = []
            for field_name, field_type in FILTERABLE_PAYLOAD_SCHEMA.items():
                if field_name in schema:
                    continue
                self._client.create_payload_index(
                    collection_name=self._collection,
                    field_name=field_name,
                    field_schema=PayloadSchemaType(field_type),
                    wait=True,
                )
                created_indexes.append(field_name)

            if alias_target is None:
                self._client.update_collection_aliases(
                    change_aliases_operations=[
                        CreateAliasOperation(
                            create_alias=CreateAlias(
                                collection_name=self._collection, alias_name=self._alias
                            )
                        )
                    ]
                )

            final_info = self._client.get_collection(self._collection)
            _verify_vectors(final_info, self._dimensions)
            final_schema = _payload_schema(final_info)
            for field_name, field_type in FILTERABLE_PAYLOAD_SCHEMA.items():
                if final_schema.get(field_name) != field_type:
                    raise QdrantAdminError(
                        f"Qdrant payload index could not be verified: {field_name}."
                    )
            final_aliases = _aliases(self._client.get_aliases())
            if (self._alias, self._collection) not in final_aliases:
                raise QdrantAdminError("Configured Qdrant alias could not be verified.")
            final_marker_found, final_marker = _marker_record(
                self._client.retrieve(
                    collection_name=self._collection,
                    ids=[_representation_marker_id()],
                    with_payload=True,
                    with_vectors=False,
                )
            )
            expected_marker = _representation_marker_payload(
                collection=self._collection,
                alias=self._alias,
                index_version=self._index_version,
                embedding_model=self._embedding_model,
                dimensions=self._dimensions,
            )
            if not final_marker_found or final_marker != expected_marker:
                raise QdrantAdminError("Qdrant representation marker could not be verified.")
            return {
                "status": "ready",
                "collection": self._collection,
                "alias": self._alias,
                "vector_size": self._dimensions,
                "distance": "Cosine",
                "payload_indexes": sorted(FILTERABLE_PAYLOAD_SCHEMA),
                "created_collection": created_collection,
                "created_payload_indexes": created_indexes,
                "created_alias": alias_target is None,
                "representation_marker": REPRESENTATION_MARKER_VALUE,
                "created_representation_marker": marker_created,
            }
        except QdrantAdminError:
            raise
        except Exception as exc:
            raise QdrantAdminError("Qdrant administration operation failed.") from exc

    def _ensure_representation_marker(self, *, created_collection: bool) -> bool:
        records = self._client.retrieve(
            collection_name=self._collection,
            ids=[_representation_marker_id()],
            with_payload=True,
            with_vectors=False,
        )
        marker_found, payload = _marker_record(records)
        expected = _representation_marker_payload(
            collection=self._collection,
            alias=self._alias,
            index_version=self._index_version,
            embedding_model=self._embedding_model,
            dimensions=self._dimensions,
        )
        if marker_found:
            if payload != expected:
                raise QdrantAdminError(
                    "Existing Qdrant representation marker is incompatible "
                    "with the configured demo."
                )
            return False

        if not created_collection:
            count = _collection_point_count(
                self._client.count(collection_name=self._collection, exact=True)
            )
            if count > 0:
                raise QdrantAdminError(
                    "Existing non-empty collection has no representation marker."
                )

        self._client.upsert(
            collection_name=self._collection,
            points=[
                PointStruct(
                    id=_representation_marker_id(),
                    vector=_representation_marker_vector(self._dimensions),
                    payload=expected,
                )
            ],
            wait=True,
        )
        verified_found, verified = _marker_record(
            self._client.retrieve(
                collection_name=self._collection,
                ids=[_representation_marker_id()],
                with_payload=True,
                with_vectors=False,
            )
        )
        if not verified_found or verified != expected:
            raise QdrantAdminError("Qdrant representation marker could not be verified.")
        return True


def _required(value: str | None, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise QdrantAdminError(f"Qdrant {label} is not configured.")
    return value.strip()


def _representation_marker_id() -> str:
    return "00000000-0000-4000-8000-000000000001"


def _representation_marker_vector(dimensions: int) -> list[float]:
    return [1.0, *([0.0] * (dimensions - 1))]


def _representation_marker_payload(
    *,
    collection: str,
    alias: str,
    index_version: str,
    embedding_model: str,
    dimensions: int,
) -> dict[str, object]:
    return {
        REPRESENTATION_MARKER_FIELD: REPRESENTATION_MARKER_VALUE,
        "marker_version": "qdrant-representation-marker-v1",
        "collection": collection,
        "alias": alias,
        "index_version": index_version,
        "representation_version": index_version,
        "embedding_provider": "cohere",
        "embedding_model": embedding_model,
        "embedding_dimensions": dimensions,
        "vector_distance": Distance.COSINE.value,
        "payload_schema": json.dumps(
            FILTERABLE_PAYLOAD_SCHEMA, sort_keys=True, separators=(",", ":")
        ),
        "normalization_version": NORMALIZATION_VERSION,
        "is_active": False,
        "is_deleted": True,
        "company_is_active": False,
        "company_is_deleted": True,
        "status": "REPRESENTATION_MARKER",
    }


def _marker_record(records: object) -> tuple[bool, dict[str, object] | None]:
    if not isinstance(records, Sequence) or isinstance(records, (str, bytes)) or not records:
        return False, None
    record = records[0]
    payload = _read(record, "payload")
    if not isinstance(payload, Mapping):
        return True, None
    return True, dict(payload)


def _read(value: object, key: str) -> object:
    if isinstance(value, Mapping):
        return value.get(key)
    return getattr(value, key, None)


def _collection_point_count(result: object) -> int:
    count = _read(result, "count")
    if not isinstance(count, int) or isinstance(count, bool) or count < 0:
        raise QdrantAdminError("Qdrant collection point count could not be verified.")
    return count


def _enum_value(value: object) -> str:
    raw = getattr(value, "value", value)
    return raw.casefold() if isinstance(raw, str) else ""


def _verify_vectors(info: object, dimensions: int) -> None:
    config = _read(info, "config")
    params = _read(config, "params")
    vectors = _read(params, "vectors")
    if isinstance(vectors, Mapping):
        vectors = vectors.get("")
    size = _read(vectors, "size")
    distance = _enum_value(_read(vectors, "distance"))
    if size != dimensions or distance != Distance.COSINE.value.casefold():
        raise QdrantAdminError("Existing Qdrant collection has incompatible vector configuration.")


def _payload_schema(info: object) -> dict[str, str]:
    raw = _read(info, "payload_schema")
    if not isinstance(raw, Mapping):
        return {}
    result: dict[str, str] = {}
    for key, value in raw.items():
        if not isinstance(key, str):
            continue
        result[key] = _enum_value(_read(value, "data_type"))
    return result


def _aliases(response: object) -> list[tuple[str, str]]:
    raw = _read(response, "aliases")
    if not isinstance(raw, Sequence) or isinstance(raw, (str, bytes)):
        return []
    result: list[tuple[str, str]] = []
    for item in raw:
        name = _read(item, "alias_name")
        collection = _read(item, "collection_name")
        if isinstance(name, str) and isinstance(collection, str):
            result.append((name, collection))
    return result
