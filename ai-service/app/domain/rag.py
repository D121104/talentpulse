from __future__ import annotations

from datetime import datetime
from math import isfinite
from typing import Annotated, Literal, Protocol, TypeAlias
from uuid import UUID

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, field_validator, model_validator


def _uuid(value: object) -> UUID:
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


UuidValue = Annotated[UUID, BeforeValidator(_uuid)]
BoundedText = Annotated[str, Field(min_length=1, max_length=4_000)]
ShortText = Annotated[str, Field(min_length=1, max_length=500)]
ScalarValue: TypeAlias = str | int | float | bool | None  # noqa: UP040


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class IdentityFields(StrictModel):
    request_id: UuidValue
    trace_id: UuidValue
    operation_attempt_id: UuidValue
    client_message_id: UuidValue
    user_id: UuidValue
    session_id: UuidValue


class StructuredFilterState(StrictModel):
    company: ShortText | None = None
    location: ShortText | None = None
    level: ShortText | None = None
    salary_min: int | float | None = Field(default=None, ge=0, le=10**12)
    salary_max: int | float | None = Field(default=None, ge=0, le=10**12)
    skills: list[ShortText] = Field(default_factory=list, max_length=30)

    @field_validator("salary_min", "salary_max")
    @classmethod
    def finite_salary(cls, value: int | float | None) -> int | float | None:
        if isinstance(value, float) and not isfinite(value):
            raise ValueError("salary must be finite")
        return value

    @model_validator(mode="after")
    def valid_range(self) -> StructuredFilterState:
        if (
            self.salary_min is not None
            and self.salary_max is not None
            and self.salary_min > self.salary_max
        ):
            raise ValueError("salary_min must not exceed salary_max")
        return self


class ExplicitFilters(StrictModel):
    company_ids: list[UuidValue] = Field(default_factory=list, max_length=30)
    locations: list[ShortText] = Field(default_factory=list, max_length=30)
    levels: list[ShortText] = Field(default_factory=list, max_length=30)
    skills_any: list[ShortText] = Field(default_factory=list, max_length=30)
    skills_all: list[ShortText] = Field(default_factory=list, max_length=30)
    salary_gte: int | float | None = Field(default=None, ge=0, le=10**12)
    salary_lte: int | float | None = Field(default=None, ge=0, le=10**12)

    @model_validator(mode="after")
    def valid_range(self) -> ExplicitFilters:
        if (
            self.salary_gte is not None
            and self.salary_lte is not None
            and self.salary_gte > self.salary_lte
        ):
            raise ValueError("salary_gte must not exceed salary_lte")
        return self


class ServicePolicy(StrictModel):
    data_scope: Literal["PUBLIC_ACTIVE_JOBS"]
    max_candidates: Literal[20]
    max_context_jobs: Literal[8] | None = None


class RagRetrieveRequest(StrictModel):
    identity: IdentityFields
    normalized_user_message: BoundedText
    locale: Annotated[str, Field(min_length=2, max_length=16)]
    recent_history: list[BoundedText] = Field(default_factory=list, max_length=8)
    filter_state: StructuredFilterState
    explicit_filters: ExplicitFilters
    filter_provenance: dict[str, ShortText] = Field(default_factory=dict, max_length=30)
    policy: ServicePolicy

    @model_validator(mode="after")
    def bounded_history(self) -> RagRetrieveRequest:
        if sum(len(item) for item in self.recent_history) > 6_000:
            raise ValueError("recent_history is too large")
        return self


class RetrievalItem(StrictModel):
    job_id: UuidValue
    rank: int = Field(ge=1, le=20)
    score: float = Field(ge=-1, le=1)
    metadata: dict[str, str] = Field(default_factory=dict, max_length=20)

    @field_validator("score")
    @classmethod
    def finite_score(cls, value: float) -> float:
        if not isfinite(value):
            raise ValueError("score must be finite")
        return value


class RagRetrieveResponse(StrictModel):
    request_id: UuidValue
    trace_id: UuidValue
    job_ids: list[UuidValue] = Field(max_length=20)
    results: list[RetrievalItem] = Field(max_length=20)
    applied_filters: dict[str, str] = Field(default_factory=dict, max_length=30)
    unsupported_filters: list[ShortText] = Field(default_factory=list, max_length=30)


class AuthorizedCvSnapshot(StrictModel):
    cv_id: UuidValue
    content_hash: Annotated[str, Field(pattern=r"^[A-Fa-f0-9]{64,128}$")]
    title: ShortText | None = None
    target: ShortText | None = None
    skills: list[ShortText] = Field(default_factory=list, max_length=30)
    education: list[ShortText] = Field(default_factory=list, max_length=30)
    experience: list[ShortText] = Field(default_factory=list, max_length=30)
    certificates: list[ShortText] = Field(default_factory=list, max_length=30)
    sanitized_text: Annotated[str, Field(min_length=1, max_length=12_000)]
    consent_version: Annotated[str, Field(min_length=1, max_length=80)] | None = None


class Salary(StrictModel):
    amount: int | float = Field(ge=0, le=10**12)
    currency: Annotated[str, Field(min_length=1, max_length=16)]

    @field_validator("amount")
    @classmethod
    def finite_amount(cls, value: int | float) -> int | float:
        if isinstance(value, float) and not isfinite(value):
            raise ValueError("salary amount must be finite")
        return value


class CanonicalJobContext(StrictModel):
    job_id: UuidValue
    title: ShortText
    company_name: ShortText
    location: ShortText | None = None
    level: ShortText | None = None
    salary: Salary | None = None
    skills: list[ShortText] = Field(default_factory=list, max_length=30)
    start_date: Annotated[str, Field(min_length=10, max_length=64)] | None = None
    end_date: Annotated[str, Field(min_length=10, max_length=64)] | None = None

    @field_validator("start_date", "end_date")
    @classmethod
    def iso_date(cls, value: str | None) -> str | None:
        if value is not None:
            try:
                datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError as exc:
                raise ValueError("job dates must be ISO-8601 values") from exc
        return value


class RetrievalEvidence(StrictModel):
    job_id: UuidValue
    rank: int = Field(ge=1, le=20)
    score: float = Field(ge=-1, le=1)
    citation_key: Annotated[str, Field(min_length=1, max_length=64)]

    @field_validator("score")
    @classmethod
    def finite_score(cls, value: float) -> float:
        if not isfinite(value):
            raise ValueError("score must be finite")
        return value


RagIntent = Literal["JOB_SEARCH", "CV_ANALYSIS", "CV_JOB_COMPARISON", "ADVICE"]


class RagGenerateRequest(StrictModel):
    identity: IdentityFields
    normalized_user_message: BoundedText
    intent: RagIntent
    locale: Annotated[str, Field(min_length=2, max_length=16)]
    recent_history: list[BoundedText] = Field(default_factory=list, max_length=8)
    filter_state: StructuredFilterState
    authorized_cv_snapshot: AuthorizedCvSnapshot | None = None
    canonical_active_job_context: list[CanonicalJobContext] = Field(
        default_factory=list, max_length=8
    )
    retrieval_evidence: list[RetrievalEvidence] = Field(default_factory=list, max_length=20)
    explicit_filters: ExplicitFilters
    policy: ServicePolicy
    consent_version: Annotated[str, Field(min_length=1, max_length=80)] | None = None

    @model_validator(mode="after")
    def bounded_history(self) -> RagGenerateRequest:
        if sum(len(item) for item in self.recent_history) > 6_000:
            raise ValueError("recent_history is too large")
        return self

    @model_validator(mode="after")
    def intent_cv_invariant(self) -> RagGenerateRequest:
        requires_cv = self.intent in {"CV_ANALYSIS", "CV_JOB_COMPARISON"}
        if requires_cv and (self.authorized_cv_snapshot is None or self.consent_version is None):
            raise ValueError("consented CV snapshot is required")
        if not requires_cv and (
            self.authorized_cv_snapshot is not None or self.consent_version is not None
        ):
            raise ValueError("CV context is not allowed for this intent")
        if (
            self.authorized_cv_snapshot is not None
            and self.authorized_cv_snapshot.consent_version
            not in {
                None,
                self.consent_version,
            }
        ):
            raise ValueError("consent_version must match the CV snapshot")
        context_ids = {job.job_id for job in self.canonical_active_job_context}
        evidence_ids = {item.job_id for item in self.retrieval_evidence}
        if not evidence_ids.issubset(context_ids):
            raise ValueError("retrieval evidence must refer to canonical job context")
        return self


class AnswerBlock(StrictModel):
    kind: Literal["ADVICE", "INFERENCE", "REFUSAL"]
    text: Annotated[str, Field(min_length=1, max_length=2_000)]


ClaimType = Literal[
    "JOB_TITLE",
    "COMPANY_NAME",
    "LOCATION",
    "SALARY",
    "LEVEL",
    "SKILL",
    "JOB_DATE",
    "CV_SKILL",
    "CV_EXPERIENCE",
    "CV_EDUCATION",
    "ADVICE",
    "INFERENCE",
]
ClaimValue: TypeAlias = str | dict[str, ScalarValue]  # noqa: UP040


class TypedClaim(StrictModel):
    claim_id: Annotated[str, Field(min_length=1, max_length=64)]
    type: ClaimType
    subject_id: UuidValue | None = None
    value: ClaimValue
    citation_keys: list[Annotated[str, Field(min_length=1, max_length=64)]] = Field(
        default_factory=list, max_length=10
    )


class ProviderGeneration(StrictModel):
    answer_blocks: list[AnswerBlock] = Field(max_length=20)
    claims: list[TypedClaim] = Field(max_length=50)
    citation_keys: list[Annotated[str, Field(min_length=1, max_length=64)]] = Field(
        default_factory=list, max_length=50
    )
    referenced_job_ids: list[UuidValue] = Field(default_factory=list, max_length=20)


class RagGenerateResponse(StrictModel):
    request_id: UuidValue
    trace_id: UuidValue
    client_message_id: UuidValue
    answer_status: Literal["COMPLETE", "DEGRADED", "NO_EVIDENCE"]
    answer_blocks: list[AnswerBlock] = Field(max_length=20)
    claims: list[TypedClaim] = Field(max_length=50)
    citation_keys: list[Annotated[str, Field(min_length=1, max_length=64)]] = Field(max_length=50)
    referenced_job_ids: list[UuidValue] = Field(max_length=20)
    filters: StructuredFilterState
    state_delta: dict[str, object] = Field(default_factory=dict, max_length=30)
    degraded: bool


class EmbeddingProvider(Protocol):
    dimensions: int

    def embed_query(self, text: str) -> list[float]: ...


class VectorRetriever(Protocol):
    def search(
        self, vector: list[float], query_filter: dict[str, object], limit: int
    ) -> list[RetrievedChunk]: ...


class GenerationProvider(Protocol):
    def generate(self, prompt: str) -> object: ...


class RetrievedChunk:
    __slots__ = ("job_id", "score", "metadata")

    def __init__(self, job_id: UUID, score: float, metadata: dict[str, str]) -> None:
        self.job_id = job_id
        self.score = score
        self.metadata = metadata
