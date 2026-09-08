from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import UTC, datetime
from math import isfinite
from typing import Annotated, Literal, Protocol
from uuid import UUID

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, field_validator, model_validator


def _canonical_uuid(value: object) -> UUID:
    if isinstance(value, UUID):
        return value
    if not isinstance(value, str):
        raise ValueError("must be a UUID string")
    try:
        parsed = UUID(value)
    except ValueError as exc:
        raise ValueError("must be a UUID string") from exc
    if str(parsed) != value.lower():
        raise ValueError("must use canonical UUID notation")
    return parsed


def _utc_datetime(value: object) -> datetime:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError("must be an ISO-8601 datetime") from exc
    else:
        raise ValueError("must be an ISO-8601 datetime")
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


UuidValue = Annotated[UUID, BeforeValidator(_canonical_uuid)]
UtcDateTime = Annotated[datetime, BeforeValidator(_utc_datetime)]
Sha256Value = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
VersionValue = Annotated[
    str, Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]*$")
]
ShortText = Annotated[str, Field(min_length=1, max_length=500)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class IndexIdentity(StrictModel):
    request_id: UuidValue
    trace_id: UuidValue
    operation_attempt_id: UuidValue


class CanonicalJobSnapshot(StrictModel):
    job_id: UuidValue
    title: ShortText
    description: Annotated[str, Field(max_length=50_000)] = ""
    skills: list[ShortText] = Field(default_factory=list, max_length=50)
    company_id: UuidValue
    company_name: ShortText
    location: ShortText | None = None
    level: ShortText | None = None
    work_mode: ShortText | None = None
    employment_type: ShortText | None = None
    salary: int | float | None = Field(default=None, ge=0, le=10**12)
    salary_currency: Annotated[str, Field(min_length=1, max_length=16)] | None = None
    start_date: UtcDateTime | None = None
    end_date: UtcDateTime | None = None
    is_active: bool
    is_deleted: bool
    company_is_active: bool
    company_is_deleted: bool

    @field_validator("salary")
    @classmethod
    def finite_salary(cls, value: int | float | None) -> int | float | None:
        if isinstance(value, bool) or (isinstance(value, float) and not isfinite(value)):
            raise ValueError("salary must be finite")
        return value

    @field_validator("title", "company_name", "description")
    @classmethod
    def required_text_is_trimmed(cls, value: str) -> str:
        if value != value.strip():
            raise ValueError("text values must be trimmed")
        return value

    @field_validator("location", "level", "work_mode", "employment_type", "salary_currency")
    @classmethod
    def non_blank_optional_text(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("optional text must not be blank")
        return value

    @model_validator(mode="after")
    def valid_date_range(self) -> CanonicalJobSnapshot:
        if (
            self.start_date is not None
            and self.end_date is not None
            and self.start_date >= self.end_date
        ):
            raise ValueError("start_date must be before end_date")
        return self


class IndexJobUpsertRequest(StrictModel):
    identity: IndexIdentity
    job: CanonicalJobSnapshot
    idempotency_key: Annotated[str, Field(min_length=1, max_length=128)]
    source_version: VersionValue
    representation_version: VersionValue
    content_hash: Sha256Value

    @field_validator("idempotency_key")
    @classmethod
    def trimmed_idempotency_key(cls, value: str) -> str:
        if value != value.strip():
            raise ValueError("idempotency_key must be trimmed")
        return value


class IndexJobDeleteRequest(StrictModel):
    identity: IndexIdentity
    job_id: UuidValue
    idempotency_key: Annotated[str, Field(min_length=1, max_length=128)]
    source_version: VersionValue
    representation_version: VersionValue

    @field_validator("idempotency_key")
    @classmethod
    def trimmed_idempotency_key(cls, value: str) -> str:
        if value != value.strip():
            raise ValueError("idempotency_key must be trimmed")
        return value


class IndexJobResponse(StrictModel):
    request_id: UuidValue
    trace_id: UuidValue
    operation_attempt_id: UuidValue
    job_id: UuidValue
    operation: Literal["UPSERT", "DELETE"]
    status: Literal["INDEXED", "DELETED", "ALREADY_DELETED", "STALE_IGNORED"]
    source_version: VersionValue
    representation_version: VersionValue
    point_id: UuidValue
    content_hash: Sha256Value | None = None
    embedding_provider: VersionValue
    embedding_model: VersionValue
    embedding_dimensions: int = Field(ge=1, le=4096)
    embedded: bool


class DocumentEmbeddingProvider(Protocol):
    provider_name: str
    model_name: str
    dimensions: int

    def embed_document(self, text: str) -> list[float]: ...


class JobVectorWriter(Protocol):
    def upsert_point(
        self, point_id: str, vector: Sequence[float], payload: Mapping[str, object]
    ) -> None: ...

    def delete_point(self, point_id: str) -> None: ...
