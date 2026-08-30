from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Literal, Protocol

from app.core.index_representation import (
    REPRESENTATION_METADATA_POINT_ID,
    RepresentationManifest,
    validate_safe_identifier,
)

AliasOperation = Literal["SWITCH", "ROLLBACK"]
_MISSING = object()


class QdrantAliasClient(Protocol):
    """Synchronous Qdrant operations required by an explicit alias cutover."""

    def get_aliases(self) -> object: ...

    def get_collection(self, collection_name: str) -> object: ...

    def update_collection_aliases(
        self, change_aliases_operations: Sequence[Any], **kwargs: Any
    ) -> object: ...


class QdrantAliasOperationError(ValueError):
    """Safe, stable error raised when an operator alias operation is rejected."""

    def __init__(self, code: str, message: str = "Qdrant alias operation failed") -> None:
        self.code = code
        super().__init__(message)


@dataclass(frozen=True, slots=True)
class QdrantAliasPreflight:
    """Bounded evidence collected before one atomic alias change."""

    operation: AliasOperation
    alias_name: str
    target_collection: str
    expected_current_collection: str | None
    current_collection: str | None
    target_manifest: RepresentationManifest
    vector_dimensions: int
    vector_distance: Literal["Cosine"]
    payload_indexes: tuple[str, ...]
    marker_verified: bool = True

    def __post_init__(self) -> None:
        if self.operation not in ("SWITCH", "ROLLBACK"):
            raise ValueError("alias operation is invalid")
        validate_safe_identifier(self.alias_name, "Qdrant alias", 255)
        validate_safe_identifier(self.target_collection, "Qdrant physical collection", 255)
        if self.expected_current_collection is not None:
            validate_safe_identifier(
                self.expected_current_collection,
                "Qdrant expected current physical collection",
                255,
            )
        if self.current_collection is not None:
            validate_safe_identifier(
                self.current_collection, "Qdrant current physical collection", 255
            )
        if self.alias_name == self.target_collection:
            raise ValueError("Qdrant alias and physical collection must be distinct")
        if self.target_manifest.physical_collection != self.target_collection:
            raise ValueError("target manifest physical collection does not match preflight")
        if self.target_manifest.alias != self.alias_name:
            raise ValueError("target manifest alias does not match preflight")
        if (
            isinstance(self.vector_dimensions, bool)
            or not isinstance(self.vector_dimensions, int)
            or self.vector_dimensions != self.target_manifest.dimensions
        ):
            raise ValueError("preflight vector dimensions are invalid")
        if self.vector_distance != "Cosine":
            raise ValueError("preflight vector distance is invalid")
        if not self.marker_verified:
            raise ValueError("target marker must be verified")
        if tuple(sorted(set(self.payload_indexes))) != self.payload_indexes:
            raise ValueError("preflight payload indexes must be unique and sorted")

    @property
    def physical_collection(self) -> str:
        return self.target_collection

    @property
    def alias(self) -> str:
        return self.alias_name

    def as_dict(self) -> dict[str, object]:
        return {
            "operation": self.operation,
            "alias": self.alias_name,
            "physical_collection": self.target_collection,
            "expected_current_collection": self.expected_current_collection,
            "current_collection": self.current_collection,
            "manifest": self.target_manifest.as_dict(),
            "vector_dimensions": self.vector_dimensions,
            "vector_distance": self.vector_distance,
            "payload_indexes": list(self.payload_indexes),
            "marker_verified": self.marker_verified,
        }


@dataclass(frozen=True, slots=True)
class AliasCutoverResult:
    """Bounded result returned only after exact alias readback succeeds."""

    operation: AliasOperation
    alias_name: str
    previous_collection: str | None
    current_collection: str
    manifest: RepresentationManifest
    manifest_digest: str
    preflight: QdrantAliasPreflight

    def __post_init__(self) -> None:
        if self.operation not in ("SWITCH", "ROLLBACK"):
            raise ValueError("alias operation is invalid")
        validate_safe_identifier(self.alias_name, "Qdrant alias", 255)
        validate_safe_identifier(self.current_collection, "Qdrant current physical collection", 255)
        if self.previous_collection is not None:
            validate_safe_identifier(
                self.previous_collection, "Qdrant previous physical collection", 255
            )
        if self.manifest.alias != self.alias_name:
            raise ValueError("result manifest alias does not match result alias")
        if self.manifest.physical_collection != self.current_collection:
            raise ValueError("result manifest collection does not match readback")
        if self.manifest_digest != _manifest_digest(self.manifest):
            raise ValueError("result manifest digest does not match manifest")
        if self.preflight.target_collection != self.current_collection:
            raise ValueError("result target does not match preflight")
        if self.preflight.alias_name != self.alias_name:
            raise ValueError("result alias does not match preflight")

    @property
    def target_collection(self) -> str:
        return self.current_collection

    @property
    def physical_collection(self) -> str:
        return self.current_collection

    @property
    def alias(self) -> str:
        return self.alias_name

    @property
    def target_manifest(self) -> RepresentationManifest:
        """Compatibility name for callers that refer to the cutover target."""

        return self.manifest

    @property
    def readback_collection(self) -> str:
        return self.current_collection

    def as_dict(self) -> dict[str, object]:
        return {
            "operation": self.operation,
            "alias": self.alias_name,
            "previous_collection": self.previous_collection,
            "current_collection": self.current_collection,
            "manifest": self.manifest.as_dict(),
            "manifest_digest": self.manifest_digest,
            "preflight": self.preflight.as_dict(),
        }


# Preserve the result name used by the first Phase 2 adapter callers.
QdrantAliasOperationResult = AliasCutoverResult


def _manifest_digest(manifest: RepresentationManifest) -> str:
    serialized = json.dumps(
        manifest.as_dict(),
        ensure_ascii=True,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(serialized).hexdigest()


def representation_manifest_digest(manifest: RepresentationManifest) -> str:
    """Return the stable digest reported for a cutover manifest."""

    return _manifest_digest(manifest)


def _member(value: object, name: str, default: object = _MISSING) -> object:
    if isinstance(value, Mapping):
        result = value.get(name, default)
    else:
        result = getattr(value, name, default)
    return default if result is _MISSING else result


def _unwrap_result(value: object) -> object:
    result = _member(value, "result", _MISSING)
    return value if result is _MISSING else result


def _aliases_from_response(response: object) -> list[object]:
    response = _unwrap_result(response)
    aliases: object
    if isinstance(response, (list, tuple)):
        aliases = response
    else:
        aliases = _member(response, "aliases", _MISSING)
    if aliases is _MISSING or isinstance(aliases, (str, bytes, Mapping)):
        raise ValueError("alias response is malformed")
    if not isinstance(aliases, Iterable):
        raise ValueError("alias response is malformed")
    try:
        return list(aliases)
    except Exception as exc:
        raise ValueError("alias response is malformed") from exc


def _points_from_response(response: object) -> list[object]:
    response = _unwrap_result(response)
    points = _member(response, "points", _MISSING)
    if points is _MISSING:
        points = response
    if isinstance(points, (str, bytes, Mapping)) or not isinstance(points, Iterable):
        raise ValueError("point response is malformed")
    try:
        return list(points)
    except Exception as exc:
        raise ValueError("point response is malformed") from exc


def _scroll_parts(response: object) -> tuple[object, object]:
    if isinstance(response, (tuple, list)):
        if len(response) != 2:
            raise ValueError("Qdrant scroll response tuple is invalid")
        return response[0], response[1]
    result = _unwrap_result(response)
    points = _member(result, "points", _MISSING)
    next_offset = _member(result, "next_page_offset", None)
    if points is _MISSING:
        raise ValueError("Qdrant scroll response has no points")
    return points, next_offset


def _schema_data_type(value: object) -> str | None:
    raw = _member(value, "data_type", _MISSING)
    if raw is _MISSING and isinstance(value, Mapping):
        raw = value.get("type", _MISSING)
    if raw is _MISSING or raw is None:
        return None
    return str(getattr(raw, "value", raw)).casefold()


def _marker_payload_from_point(point: object) -> Mapping[str, object] | None:
    point_id = _member(point, "id", _MISSING)
    if point_id is _MISSING or str(point_id) != str(REPRESENTATION_METADATA_POINT_ID):
        return None
    payload = _member(point, "payload", _MISSING)
    return payload if isinstance(payload, Mapping) else {}


def _bounded_marker_payload(payload: Mapping[str, object] | None) -> dict[str, object] | None:
    if payload is None:
        return None
    try:
        if len(payload) > 16:
            return None
        bounded: dict[str, object] = {}
        for key, value in payload.items():
            if not isinstance(key, str) or not 1 <= len(key) <= 64:
                return None
            if isinstance(value, bool):
                return None
            if isinstance(value, int):
                if value < 0:
                    return None
                bounded[key] = value
                continue
            if isinstance(value, str):
                if not 1 <= len(value) <= 256 or value != value.strip():
                    return None
                if any(ord(character) < 32 or ord(character) == 127 for character in value):
                    return None
                bounded[key] = value
                continue
            return None
    except (AttributeError, TypeError, ValueError):
        return None
    return bounded


def _manifest_is_valid(manifest: object) -> bool:
    if not isinstance(manifest, RepresentationManifest):
        return False
    try:
        validate_safe_identifier(manifest.provider, "embedding provider", 64)
        if (
            not isinstance(manifest.model, str)
            or not 1 <= len(manifest.model) <= 256
            or manifest.model != manifest.model.strip()
            or any(ord(character) < 32 or ord(character) == 127 for character in manifest.model)
        ):
            return False
        if (
            isinstance(manifest.dimensions, bool)
            or not isinstance(manifest.dimensions, int)
            or not 1 <= manifest.dimensions <= 4096
        ):
            return False
        validate_safe_identifier(manifest.normalization_version, "normalization version", 64)
        validate_safe_identifier(manifest.chunking_version, "chunking version", 64)
        validate_safe_identifier(manifest.index_schema_version, "index schema version", 64)
        validate_safe_identifier(manifest.physical_collection, "physical collection", 255)
        validate_safe_identifier(manifest.alias, "alias", 255)
        if manifest.collection_version is not None:
            validate_safe_identifier(manifest.collection_version, "collection version", 128)
    except (TypeError, ValueError):
        return False
    return True


class QdrantAliasManager:
    """Explicit operator-only alias cutover boundary.

    Readiness and normal point operations never call this manager. The target
    collection must already be built, marked, and indexed before this service
    is invoked by an operator-controlled workflow.
    """

    def __init__(self, client: QdrantAliasClient) -> None:
        self._client = client

    def switch_alias(
        self,
        target_collection: str,
        alias_name: str,
        expected_current_collection: str | None,
        expected_manifest: RepresentationManifest,
    ) -> AliasCutoverResult:
        return self._change_alias(
            operation="SWITCH",
            alias_name=alias_name,
            target_collection=target_collection,
            expected_current_collection=expected_current_collection,
            expected_manifest=expected_manifest,
            allow_initial=True,
        )

    def rollback_alias(
        self,
        alias_name: str,
        previous_collection: str,
        expected_current_collection: str,
        expected_manifest: RepresentationManifest,
    ) -> AliasCutoverResult:
        return self._change_alias(
            operation="ROLLBACK",
            alias_name=alias_name,
            target_collection=previous_collection,
            expected_current_collection=expected_current_collection,
            expected_manifest=expected_manifest,
            allow_initial=False,
        )

    def _change_alias(
        self,
        *,
        operation: AliasOperation,
        alias_name: str,
        target_collection: str,
        expected_current_collection: str | None,
        expected_manifest: RepresentationManifest,
        allow_initial: bool,
    ) -> AliasCutoverResult:
        try:
            self._validate_request(
                alias_name=alias_name,
                target_collection=target_collection,
                expected_current_collection=expected_current_collection,
                expected_manifest=expected_manifest,
                allow_initial=allow_initial,
            )
            info = self._get_collection_info(target_collection)
            dimensions, distance = self._verify_vector_config(info, expected_manifest)
            self._verify_marker(target_collection, info, expected_manifest)
            payload_indexes = self._verify_payload_indexes(info)
            current_collection = self._read_current_mapping(alias_name, target_collection)
            if current_collection != expected_current_collection:
                raise QdrantAliasOperationError(
                    "QDRANT_ALIAS_CURRENT_MAPPING_MISMATCH",
                    "current alias mapping does not match the explicit expected target",
                )
            preflight = QdrantAliasPreflight(
                operation=operation,
                alias_name=alias_name,
                target_collection=target_collection,
                expected_current_collection=expected_current_collection,
                current_collection=current_collection,
                target_manifest=expected_manifest,
                vector_dimensions=dimensions,
                vector_distance=distance,
                payload_indexes=payload_indexes,
            )
            operations = self._build_operations(
                alias_name=alias_name,
                target_collection=target_collection,
                current_collection=current_collection,
            )
            self._update_aliases(operations)
            try:
                readback_collection = self._read_current_mapping(alias_name, target_collection)
            except Exception as exc:
                raise QdrantAliasOperationError(
                    "QDRANT_ALIAS_READBACK_FAILED",
                    "alias readback failed after the atomic operation",
                ) from exc
            if readback_collection != target_collection:
                raise QdrantAliasOperationError(
                    "QDRANT_ALIAS_READBACK_FAILED",
                    "alias readback did not exactly match the requested target",
                )
            return AliasCutoverResult(
                operation=operation,
                alias_name=alias_name,
                previous_collection=current_collection,
                current_collection=readback_collection,
                manifest=expected_manifest,
                manifest_digest=_manifest_digest(expected_manifest),
                preflight=preflight,
            )
        except QdrantAliasOperationError:
            raise
        except Exception as exc:
            raise QdrantAliasOperationError(
                "QDRANT_ALIAS_OPERATION_FAILED",
                "Qdrant alias operation failed",
            ) from exc

    @staticmethod
    def _validate_request(
        *,
        alias_name: str,
        target_collection: str,
        expected_current_collection: str | None,
        expected_manifest: RepresentationManifest,
        allow_initial: bool,
    ) -> None:
        try:
            validate_safe_identifier(alias_name, "Qdrant alias", 255)
            validate_safe_identifier(target_collection, "Qdrant physical collection", 255)
            if expected_current_collection is not None:
                validate_safe_identifier(
                    expected_current_collection,
                    "Qdrant expected current physical collection",
                    255,
                )
        except (TypeError, ValueError) as exc:
            raise QdrantAliasOperationError(
                "QDRANT_ALIAS_INVALID_REQUEST",
                "alias names are invalid or unbounded",
            ) from exc
        if not allow_initial and expected_current_collection is None:
            raise QdrantAliasOperationError(
                "QDRANT_ALIAS_INVALID_REQUEST",
                "rollback requires an explicit current collection",
            )
        if not _manifest_is_valid(expected_manifest):
            raise QdrantAliasOperationError(
                "QDRANT_ALIAS_MANIFEST_INVALID",
                "expected representation manifest is invalid",
            )
        if expected_manifest.alias != alias_name:
            raise QdrantAliasOperationError(
                "QDRANT_ALIAS_MANIFEST_MISMATCH",
                "expected manifest alias does not match the operator alias",
            )
        if expected_manifest.physical_collection != target_collection:
            raise QdrantAliasOperationError(
                "QDRANT_ALIAS_MANIFEST_MISMATCH",
                "expected manifest collection does not match the operator target",
            )
        if alias_name == target_collection:
            raise QdrantAliasOperationError(
                "QDRANT_ALIAS_NAME_AMBIGUOUS",
                "alias and target physical collection names must be distinct",
            )

    def _get_collection_info(self, target_collection: str) -> object:
        try:
            return self._client.get_collection(collection_name=target_collection)
        except Exception as exc:
            raise QdrantAliasOperationError(
                "QDRANT_ALIAS_TARGET_NOT_FOUND",
                "explicit target collection was not found",
            ) from exc

    def _read_current_mapping(
        self, alias_name: str, target_collection: str | None = None
    ) -> str | None:
        try:
            aliases = _aliases_from_response(self._client.get_aliases())
        except QdrantAliasOperationError:
            raise
        except Exception as exc:
            raise QdrantAliasOperationError(
                "QDRANT_ALIAS_READ_FAILED",
                "Qdrant alias listing failed",
            ) from exc

        matching_collection: str | None = None
        seen_aliases: set[str] = set()
        for alias in aliases:
            raw_alias_name = _member(alias, "alias_name", _MISSING)
            raw_collection_name = _member(alias, "collection_name", _MISSING)
            if (
                not isinstance(raw_alias_name, str)
                or not isinstance(raw_collection_name, str)
                or not raw_alias_name
                or not raw_collection_name
            ):
                raise QdrantAliasOperationError(
                    "QDRANT_ALIAS_CURRENT_MAPPING_MISMATCH",
                    "alias response contains an invalid mapping",
                )
            try:
                validate_safe_identifier(raw_alias_name, "Qdrant alias response name", 255)
                validate_safe_identifier(
                    raw_collection_name,
                    "Qdrant alias response collection name",
                    255,
                )
            except ValueError as exc:
                raise QdrantAliasOperationError(
                    "QDRANT_ALIAS_CURRENT_MAPPING_MISMATCH",
                    "alias response contains an unsafe mapping",
                ) from exc
            if raw_alias_name in seen_aliases:
                raise QdrantAliasOperationError(
                    "QDRANT_ALIAS_CURRENT_MAPPING_MISMATCH",
                    "alias has multiple current mappings",
                )
            seen_aliases.add(raw_alias_name)
            if raw_alias_name == raw_collection_name:
                raise QdrantAliasOperationError(
                    "QDRANT_ALIAS_NAME_AMBIGUOUS",
                    "alias response contains a physical collection name collision",
                )
            if target_collection is not None and raw_alias_name == target_collection:
                raise QdrantAliasOperationError(
                    "QDRANT_ALIAS_NAME_AMBIGUOUS",
                    "target physical collection is also registered as an alias",
                )
            if raw_alias_name == alias_name:
                matching_collection = raw_collection_name
        return matching_collection

    @staticmethod
    def _verify_vector_config(
        info: object, expected_manifest: RepresentationManifest
    ) -> tuple[int, Literal["Cosine"]]:
        info = _unwrap_result(info)
        config = _member(info, "config", _MISSING)
        params = _member(config, "params", _MISSING)
        vectors = _member(params, "vectors", _MISSING)
        dimensions = _member(vectors, "size", _MISSING)
        distance = _member(vectors, "distance", _MISSING)
        normalized_distance = (
            getattr(distance, "value", distance) if distance is not _MISSING else ""
        )
        if (
            isinstance(dimensions, bool)
            or not isinstance(dimensions, int)
            or dimensions != expected_manifest.dimensions
            or normalized_distance != "Cosine"
        ):
            raise QdrantAliasOperationError(
                "QDRANT_ALIAS_TARGET_VECTOR_CONFIG_MISMATCH",
                "target vector configuration does not match the manifest",
            )
        return dimensions, "Cosine"

    def _read_marker_payload(
        self, target_collection: str, info: object
    ) -> Mapping[str, object] | None:
        info = _unwrap_result(info)
        info_marker = _member(info, "marker", _MISSING)
        if info_marker is not _MISSING and info_marker is not None:
            payload = _marker_payload_from_point(info_marker)
            if payload is not None:
                return payload

        retrieve = getattr(self._client, "retrieve", None)
        if callable(retrieve):
            try:
                response = retrieve(
                    collection_name=target_collection,
                    ids=[str(REPRESENTATION_METADATA_POINT_ID)],
                    with_payload=True,
                    with_vectors=False,
                )
                for point in _points_from_response(response):
                    payload = _marker_payload_from_point(point)
                    if payload is not None:
                        return payload
                return None
            except Exception:
                # Older supported clients/doubles may only expose scroll.
                pass

        scroll = getattr(self._client, "scroll", None)
        if not callable(scroll):
            return None
        try:
            from qdrant_client import models

            response = scroll(
                collection_name=target_collection,
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
            if isinstance(points, (str, bytes, Mapping)) or not isinstance(points, Iterable):
                return {}
            for point in points:
                payload = _marker_payload_from_point(point)
                if payload is not None:
                    return payload
        except Exception:
            return {}
        return None

    def _verify_marker(
        self,
        target_collection: str,
        info: object,
        expected_manifest: RepresentationManifest,
    ) -> None:
        payload = _bounded_marker_payload(self._read_marker_payload(target_collection, info))
        if payload is None or payload != expected_manifest.to_marker_payload():
            raise QdrantAliasOperationError(
                "QDRANT_ALIAS_TARGET_MARKER_MISMATCH",
                "target representation marker is missing or does not exactly match",
            )

    @staticmethod
    def _verify_payload_indexes(info: object) -> tuple[str, ...]:
        from .store import PAYLOAD_INDEX_SCHEMAS

        info = _unwrap_result(info)
        payload_schema = _member(info, "payload_schema", _MISSING)
        if not isinstance(payload_schema, Mapping):
            raise QdrantAliasOperationError(
                "QDRANT_ALIAS_TARGET_PAYLOAD_INDEX_MISMATCH",
                "target payload index schema is missing",
            )
        for field_name, expected_type in PAYLOAD_INDEX_SCHEMAS.items():
            if _schema_data_type(payload_schema.get(field_name, _MISSING)) != expected_type:
                raise QdrantAliasOperationError(
                    "QDRANT_ALIAS_TARGET_PAYLOAD_INDEX_MISMATCH",
                    "target payload indexes do not match the required schema",
                )
        return tuple(sorted(PAYLOAD_INDEX_SCHEMAS))

    @staticmethod
    def _build_operations(
        *, alias_name: str, target_collection: str, current_collection: str | None
    ) -> list[object]:
        from qdrant_client import models

        operations: list[object] = []
        if current_collection is not None:
            operations.append(
                models.DeleteAliasOperation(delete_alias=models.DeleteAlias(alias_name=alias_name))
            )
        operations.append(
            models.CreateAliasOperation(
                create_alias=models.CreateAlias(
                    collection_name=target_collection,
                    alias_name=alias_name,
                )
            )
        )
        return operations

    def _update_aliases(self, operations: Sequence[object]) -> None:
        try:
            result = self._client.update_collection_aliases(change_aliases_operations=operations)
        except Exception as exc:
            raise QdrantAliasOperationError(
                "QDRANT_ALIAS_UPDATE_FAILED",
                "Qdrant did not acknowledge the atomic alias operation",
            ) from exc
        acknowledged = result is True or _member(result, "result", _MISSING) is True
        if not acknowledged:
            raise QdrantAliasOperationError(
                "QDRANT_ALIAS_UPDATE_FAILED",
                "Qdrant did not acknowledge the atomic alias operation",
            )
