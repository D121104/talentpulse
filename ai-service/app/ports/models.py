from __future__ import annotations

import math
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any, Protocol
from uuid import UUID

MAX_SCAN_LIMIT = 256
MAX_SCAN_CURSOR_LENGTH = 128
MAX_SAFE_SOURCE_VERSION = 2**53 - 1
_MAX_SCAN_NUMERIC_CURSOR = 2**64 - 1
_SHA256_RE = re.compile(r"^[A-Fa-f0-9]{64}$")

# Scans are used by reconciliation and deliberately return only this fixed
# metadata set.  In particular, vectors and searchable text are never part of
# the scan port or its transport contract.
SCAN_METADATA_PAYLOAD_FIELDS: tuple[str, ...] = (
    "job_id",
    "company_id",
    "source_version",
    "content_hash",
    "metadata_hash",
    "embedding_provider",
    "embedding_model_version",
    "embedding_dimensions",
    "normalization_version",
    "chunking_version",
    "index_schema_version",
    "collection_name",
    "collection_version",
)


def validate_vector(vector: Sequence[float], dimensions: int) -> list[float]:
    if len(vector) != dimensions or any(
        not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value)
        for value in vector
    ):
        raise ValueError("vector has invalid dimensions or non-finite values")
    return [float(value) for value in vector]


def validate_vectors(
    vectors: Sequence[Sequence[float]], dimensions: int, expected_count: int
) -> list[list[float]]:
    if len(vectors) != expected_count:
        raise ValueError("embedding count does not match input count")
    return [validate_vector(vector, dimensions) for vector in vectors]


def bounded_scan_limit(limit: int) -> int:
    """Validate and cap a metadata page size before crossing a provider boundary."""

    if isinstance(limit, bool) or not isinstance(limit, int) or limit < 1:
        raise ValueError("scan limit must be a positive integer")
    return min(limit, MAX_SCAN_LIMIT)


def validate_scan_cursor(cursor: object) -> str | None:
    """Validate the small opaque cursor language accepted by the scan port.

    Job point IDs are UUIDs, but Qdrant also permits integer point offsets.
    Supporting both makes the adapter tolerant of SDK response shapes while
    still rejecting arbitrary strings and oversized offsets.
    """

    if cursor is None:
        return None
    if isinstance(cursor, UUID):
        return str(cursor)
    if isinstance(cursor, bool):
        raise ValueError("scan cursor is invalid")
    if isinstance(cursor, int):
        if not 0 <= cursor <= _MAX_SCAN_NUMERIC_CURSOR:
            raise ValueError("scan cursor is invalid")
        return str(cursor)
    if not isinstance(cursor, str) or not 1 <= len(cursor) <= MAX_SCAN_CURSOR_LENGTH:
        raise ValueError("scan cursor is invalid")

    try:
        parsed_uuid = UUID(cursor)
    except ValueError:
        if not cursor.isdecimal() or len(cursor) > 20:
            raise ValueError("scan cursor must be a UUID or numeric offset") from None
        numeric = int(cursor)
        if numeric > _MAX_SCAN_NUMERIC_CURSOR or str(numeric) != cursor:
            raise ValueError("scan cursor must use canonical notation") from None
        return cursor
    if str(parsed_uuid) != cursor.lower():
        raise ValueError("scan cursor must use canonical UUID notation")
    return str(parsed_uuid)


def _metadata_uuid(value: object, field_name: str) -> UUID:
    if isinstance(value, UUID):
        return value
    if not isinstance(value, str):
        raise ValueError(f"{field_name} must be a UUID")
    try:
        parsed = UUID(value)
    except ValueError as exc:
        raise ValueError(f"{field_name} must be a UUID") from exc
    if str(parsed) != value.lower():
        raise ValueError(f"{field_name} must use canonical UUID notation")
    return parsed


def _metadata_string(value: object, field_name: str, max_length: int) -> str:
    if not isinstance(value, str) or not value or len(value) > max_length or value != value.strip():
        raise ValueError(f"{field_name} is invalid")
    return value


def _metadata_hash(value: object, field_name: str) -> str:
    if not isinstance(value, str) or _SHA256_RE.fullmatch(value) is None:
        raise ValueError(f"{field_name} must be a SHA-256 hash")
    return value.lower()


def _metadata_integer(value: object, field_name: str, maximum: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= maximum:
        raise ValueError(f"{field_name} is invalid")
    return value


@dataclass(frozen=True, slots=True)
class VectorPointMetadata:
    """Safe metadata for one indexed point, with no vector or searchable text."""

    point_id: UUID
    job_id: UUID
    company_id: UUID
    source_version: int
    content_hash: str
    embedding_model_version: str
    embedding_dimensions: int
    normalization_version: str
    chunking_version: str
    index_schema_version: str
    metadata_hash: str | None = None
    embedding_provider: str | None = None
    collection_name: str | None = None
    collection_version: str | None = None


@dataclass(frozen=True, slots=True)
class VectorMetadataScanPage:
    points: list[VectorPointMetadata]
    next_cursor: str | None

    def __post_init__(self) -> None:
        if len(self.points) > MAX_SCAN_LIMIT:
            raise ValueError("scan page exceeds the maximum size")
        validate_scan_cursor(self.next_cursor)


def parse_vector_point_metadata(
    point_id: object, payload: Mapping[str, object]
) -> VectorPointMetadata:
    """Validate only the allowlisted fields needed for reconciliation."""

    if not isinstance(payload, Mapping):
        raise ValueError("vector point payload must be an object")
    provider_value = payload.get("embedding_provider")
    metadata_hash_value = payload.get("metadata_hash")
    collection_name_value = payload.get("collection_name")
    collection_version_value = payload.get("collection_version")
    return VectorPointMetadata(
        point_id=_metadata_uuid(point_id, "point_id"),
        job_id=_metadata_uuid(payload.get("job_id"), "job_id"),
        company_id=_metadata_uuid(payload.get("company_id"), "company_id"),
        source_version=_metadata_integer(
            payload.get("source_version"), "source_version", MAX_SAFE_SOURCE_VERSION
        ),
        content_hash=_metadata_hash(payload.get("content_hash"), "content_hash"),
        embedding_model_version=_metadata_string(
            payload.get("embedding_model_version"), "embedding_model_version", 256
        ),
        embedding_dimensions=_metadata_integer(
            payload.get("embedding_dimensions"), "embedding_dimensions", 4096
        ),
        normalization_version=_metadata_string(
            payload.get("normalization_version"), "normalization_version", 64
        ),
        chunking_version=_metadata_string(payload.get("chunking_version"), "chunking_version", 64),
        index_schema_version=_metadata_string(
            payload.get("index_schema_version"), "index_schema_version", 64
        ),
        metadata_hash=(
            None
            if metadata_hash_value is None
            else _metadata_hash(metadata_hash_value, "metadata_hash")
        ),
        embedding_provider=(
            None
            if provider_value is None
            else _metadata_string(provider_value, "embedding_provider", 64)
        ),
        collection_name=(
            None
            if collection_name_value is None
            else _metadata_string(collection_name_value, "collection_name", 255)
        ),
        collection_version=(
            None
            if collection_version_value is None
            else _metadata_string(collection_version_value, "collection_version", 128)
        ),
    )


class EmbeddingInputType(StrEnum):
    DOCUMENT = "document"
    QUERY = "query"


@dataclass(frozen=True, slots=True)
class ChatRequest:
    system_instruction: str
    user_content: str
    max_output_tokens: int = 1024
    temperature: float = 0.0


@dataclass(frozen=True, slots=True)
class ChatResponse:
    text: str
    model: str
    provider: str
    finish_reason: str | None = None
    usage: dict[str, int] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class EmbeddingResponse:
    vectors: list[list[float]]
    model: str
    provider: str
    dimensions: int


@dataclass(frozen=True, slots=True)
class VectorRecord:
    point_id: str
    vector: list[float]
    payload: dict[str, Any]


@dataclass(frozen=True, slots=True)
class VectorMatch:
    point_id: str
    score: float
    payload: dict[str, Any]


class ChatModel(Protocol):
    provider_name: str
    model_name: str

    async def complete(self, request: ChatRequest) -> ChatResponse: ...

    async def health(self) -> bool: ...


class EmbeddingModel(Protocol):
    provider_name: str
    model_name: str
    dimensions: int

    async def embed(
        self, texts: Sequence[str], input_type: EmbeddingInputType
    ) -> EmbeddingResponse: ...

    async def health(self) -> bool: ...


class VectorStore(Protocol):
    collection_name: str
    collection_version: str | None
    dimensions: int
    embedding_model: str
    embedding_provider: str

    async def health(self) -> bool: ...

    async def search(
        self, vector: Sequence[float], limit: int, filters: dict[str, Any] | None = None
    ) -> list[VectorMatch]: ...

    async def upsert(self, records: Sequence[VectorRecord]) -> None: ...

    async def delete(self, point_ids: Sequence[str]) -> None: ...

    async def get_by_job_id(self, job_id: str) -> list[VectorRecord]: ...

    async def scan_metadata(self, cursor: str | None, limit: int) -> VectorMetadataScanPage: ...
