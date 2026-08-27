from __future__ import annotations

from collections.abc import Mapping
from datetime import UTC, datetime
from math import isfinite
from typing import Annotated, Literal

from pydantic import BeforeValidator, Field, field_validator, model_validator

from app.ports import MAX_SCAN_LIMIT, validate_scan_cursor
from app.schemas.contracts import ContractModel, Salary, ShortText, UuidValue

_SHA256_PATTERN = r"^[A-Fa-f0-9]{64}$"
MAX_SAFE_SOURCE_VERSION = 2**53 - 1
Sha256Hash = Annotated[str, Field(pattern=_SHA256_PATTERN)]


def _parse_utc_datetime(value: object) -> datetime:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        if not 1 <= len(value) <= 64:
            raise ValueError("datetime string is out of bounds")
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError("must be an ISO-8601 datetime") from exc
    else:
        raise ValueError("must be an ISO-8601 datetime")

    # Canonical dates are UTC timestamps. Legacy JSON without an offset is
    # interpreted as UTC, avoiding host-local timezone differences in checks.
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


UtcDateTime = Annotated[datetime, BeforeValidator(_parse_utc_datetime)]


class CanonicalCompanySnapshot(ContractModel):
    """Bounded company projection needed by the indexing eligibility check."""

    company_id: UuidValue
    name: ShortText
    is_active: bool
    is_deleted: bool
    deleted_at: UtcDateTime | None = None


class CanonicalJobSnapshot(ContractModel):
    """Bounded, non-PII projection accepted by the derived-index boundary.

    Company lifecycle fields are included because the AI service must fail
    closed for stale projections. PostgreSQL/NestJS remains authoritative for
    the values; this service does not look up business data itself.
    """

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
    salary: Salary | int | float | None = None
    salary_currency: Annotated[str, Field(min_length=1, max_length=16)] | None = None
    start_date: UtcDateTime | None = None
    end_date: UtcDateTime | None = None
    updated_at: UtcDateTime | None = None
    is_active: bool
    is_deleted: bool
    deleted_at: UtcDateTime | None = None
    company_is_active: bool
    company_is_deleted: bool
    company_deleted_at: UtcDateTime | None = None

    @model_validator(mode="before")
    @classmethod
    def accept_known_backend_projection(cls, value: object) -> object:
        """Accept known Job/Company aliases without accepting arbitrary data."""

        if not isinstance(value, Mapping):
            return value
        data = dict(value)
        company = data.pop("company", None)
        if company is not None and not isinstance(company, Mapping):
            raise ValueError("company must be an object")
        if isinstance(company, Mapping):
            allowed_company_keys = {
                "company_id",
                "_id",
                "company_name",
                "name",
                "is_active",
                "isActive",
                "is_deleted",
                "isDeleted",
                "deleted_at",
                "deletedAt",
            }
            unknown_company_keys = set(company) - allowed_company_keys
            if unknown_company_keys:
                raise ValueError("company contains unknown fields")
            company_aliases = {
                "company_id": ("company_id", "_id"),
                "company_name": ("company_name", "name"),
                "company_is_active": ("company_is_active", "is_active", "isActive"),
                "company_is_deleted": ("company_is_deleted", "is_deleted", "isDeleted"),
                "company_deleted_at": ("company_deleted_at", "deleted_at", "deletedAt"),
            }
            for target, candidates in company_aliases.items():
                nested_value = next((company[key] for key in candidates if key in company), None)
                if target in data and nested_value is not None and data[target] != nested_value:
                    raise ValueError(f"{target} does not match the nested company projection")
                if target not in data and nested_value is not None:
                    data[target] = nested_value

        field_aliases = {
            "job_id": "_id",
            "title": "name",
            "company_id": "companyId",
            "company_name": "companyName",
            "start_date": "startDate",
            "end_date": "endDate",
            "updated_at": "updatedAt",
            "is_active": "isActive",
            "is_deleted": "isDeleted",
            "deleted_at": "deletedAt",
            "company_is_active": "companyIsActive",
            "company_is_deleted": "companyIsDeleted",
            "company_deleted_at": "companyDeletedAt",
            "salary_currency": "salaryCurrency",
            "work_mode": "workMode",
            "employment_type": "employmentType",
        }
        for target, source in field_aliases.items():
            if target not in data and source in data:
                data[target] = data.pop(source)
        if data.get("description") is None:
            data["description"] = ""
        return data

    @field_validator("title", "company_name")
    @classmethod
    def validate_required_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("required job text must not be blank")
        return value

    @field_validator("salary")
    @classmethod
    def validate_salary_value(
        cls, value: Salary | int | float | None
    ) -> Salary | int | float | None:
        if isinstance(value, bool):
            raise ValueError("salary must be numeric")
        if isinstance(value, (int, float)) and not isfinite(float(value)):
            raise ValueError("salary must be finite")
        return value

    @field_validator("location", "level", "work_mode", "employment_type", "salary_currency")
    @classmethod
    def validate_optional_text(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            return None
        return value


class IndexJobUpsertRequest(ContractModel):
    job: CanonicalJobSnapshot
    idempotency_key: Annotated[str, Field(min_length=1, max_length=128)]
    source_version: int = Field(ge=1, le=MAX_SAFE_SOURCE_VERSION)
    # Optional on input: the service computes these values and validates them
    # when supplied, while every written point always contains them.
    content_hash: Sha256Hash | None = None
    metadata_hash: Sha256Hash | None = None
    embedding_model_version: Annotated[str, Field(min_length=1, max_length=256)] | None = None
    embedding_dimensions: int | None = Field(default=None, ge=1, le=4096)
    normalization_version: Annotated[str, Field(min_length=1, max_length=64)] | None = None
    chunking_version: Annotated[str, Field(min_length=1, max_length=64)] | None = None
    index_schema_version: Annotated[str, Field(min_length=1, max_length=64)] | None = None

    @field_validator("idempotency_key")
    @classmethod
    def validate_idempotency_key(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("idempotency_key must not be blank")
        return value


class IndexJobDeleteRequest(ContractModel):
    job_id: UuidValue
    idempotency_key: Annotated[str, Field(min_length=1, max_length=128)]
    source_version: int = Field(ge=1, le=MAX_SAFE_SOURCE_VERSION)

    @field_validator("idempotency_key")
    @classmethod
    def validate_idempotency_key(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("idempotency_key must not be blank")
        return value


IndexOperation = Literal["UPSERT", "DELETE"]
IndexOperationStatus = Literal[
    "INDEXED",
    "UPDATED",
    "SKIPPED",
    "STALE_IGNORED",
    "DELETED",
    "ALREADY_DELETED",
]


class IndexJobResponse(ContractModel):
    job_id: UuidValue
    operation: IndexOperation
    status: IndexOperationStatus
    source_version: int = Field(ge=1, le=MAX_SAFE_SOURCE_VERSION)
    point_ids: list[UuidValue] = Field(default_factory=list, max_length=128)
    deleted_point_ids: list[UuidValue] = Field(default_factory=list, max_length=128)
    content_hash: Sha256Hash | None = None
    metadata_hash: Sha256Hash | None = None
    chunk_count: int = Field(ge=0, le=128)
    embedded: bool
    request_id: UuidValue | None = None
    embedding_model_version: Annotated[str, Field(min_length=1, max_length=256)] | None = None
    embedding_dimensions: int | None = Field(default=None, ge=1, le=4096)
    normalization_version: Annotated[str, Field(min_length=1, max_length=64)] | None = None
    chunking_version: Annotated[str, Field(min_length=1, max_length=64)] | None = None
    index_schema_version: Annotated[str, Field(min_length=1, max_length=64)] | None = None


# Explicit aliases make the endpoint contract discoverable to callers.
IndexJobUpsertResponse = IndexJobResponse
IndexJobDeleteResponse = IndexJobResponse


class IndexMetadataScanRequest(ContractModel):
    """Bounded cursor request for operational Qdrant reconciliation scans."""

    cursor: Annotated[str, Field(min_length=1, max_length=128)] | None = None
    limit: int = Field(default=MAX_SCAN_LIMIT, ge=1, le=MAX_SCAN_LIMIT)

    @field_validator("cursor")
    @classmethod
    def validate_cursor(cls, value: str | None) -> str | None:
        try:
            return validate_scan_cursor(value)
        except ValueError as exc:
            raise ValueError(str(exc)) from exc


class IndexPointMetadata(ContractModel):
    """Publicly transportable point metadata; vectors and job text are excluded."""

    point_id: UuidValue
    job_id: UuidValue
    company_id: UuidValue
    source_version: int = Field(ge=1, le=MAX_SAFE_SOURCE_VERSION)
    content_hash: Sha256Hash
    metadata_hash: Sha256Hash | None = None
    embedding_provider: Annotated[str, Field(min_length=1, max_length=64)] | None = None
    embedding_model_version: Annotated[str, Field(min_length=1, max_length=256)]
    embedding_dimensions: int = Field(ge=1, le=4096)
    normalization_version: Annotated[str, Field(min_length=1, max_length=64)]
    chunking_version: Annotated[str, Field(min_length=1, max_length=64)]
    index_schema_version: Annotated[str, Field(min_length=1, max_length=64)]


class IndexMetadataScanResponse(ContractModel):
    points: list[IndexPointMetadata] = Field(max_length=MAX_SCAN_LIMIT)
    next_cursor: Annotated[str, Field(min_length=1, max_length=128)] | None = None
    request_id: UuidValue

    @field_validator("next_cursor")
    @classmethod
    def validate_next_cursor(cls, value: str | None) -> str | None:
        try:
            return validate_scan_cursor(value)
        except ValueError as exc:
            raise ValueError(str(exc)) from exc
