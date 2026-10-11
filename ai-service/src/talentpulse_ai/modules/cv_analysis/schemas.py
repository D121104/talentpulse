from enum import StrEnum
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, field_validator, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


def _parse_uuid(value: object) -> UUID:
    return value if isinstance(value, UUID) else UUID(str(value))


UuidValue = Annotated[UUID, BeforeValidator(_parse_uuid)]
VersionValue = Annotated[
    str, Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]*$")
]
Sha256Value = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
LocaleValue = Annotated[
    str, Field(min_length=2, max_length=16, pattern=r"^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{2,8})?$")
]


class MatchIdentity(StrictModel):
    request_id: UuidValue
    trace_id: UuidValue
    operation_attempt_id: UuidValue


class MediaType(StrEnum):
    PDF = "application/pdf"
    DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


class ExperienceLevel(StrEnum):
    INTERN = "intern"
    JUNIOR = "junior"
    MID = "mid"
    SENIOR = "senior"
    LEAD = "lead"
    PRINCIPAL = "principal"


def _parse_media_type(value: object) -> MediaType:
    return value if isinstance(value, MediaType) else MediaType(str(value))


def _parse_experience_level(value: object) -> ExperienceLevel | None:
    if value is None or isinstance(value, ExperienceLevel):
        return value
    return ExperienceLevel(str(value))


MediaTypeInput = Annotated[MediaType, BeforeValidator(_parse_media_type)]
ExperienceLevelInput = Annotated[ExperienceLevel | None, BeforeValidator(_parse_experience_level)]


class WorkMode(StrEnum):
    ONSITE = "onsite"
    HYBRID = "hybrid"
    REMOTE = "remote"


class CVParseRequest(StrictModel):
    cv_id: UUID = Field(strict=False)
    filename: Annotated[str, Field(min_length=1, max_length=255)]
    media_type: MediaTypeInput
    content_base64: Annotated[str, Field(min_length=4, max_length=7_000_000)]
    content_version: Annotated[int, Field(ge=1, le=2_147_483_647)] = 1

    @field_validator("filename")
    @classmethod
    def filename_has_supported_extension(cls, value: str) -> str:
        suffix = value.rsplit(".", 1)[-1].lower() if "." in value else ""
        if suffix not in {"pdf", "docx"}:
            raise ValueError("filename must end in .pdf or .docx")
        return value

    @model_validator(mode="after")
    def media_type_matches_extension(self) -> "CVParseRequest":
        expected = "pdf" if self.media_type is MediaType.PDF else "docx"
        if not self.filename.lower().endswith(f".{expected}"):
            raise ValueError("media_type does not match filename extension")
        return self


class CVProfile(StrictModel):
    skills: Annotated[
        list[Annotated[str, Field(min_length=1, max_length=100)]], Field(max_length=200)
    ] = Field(default_factory=list)
    years_experience: float | None = Field(default=None, ge=0, le=80)
    level: ExperienceLevelInput = None
    location: Annotated[str, Field(min_length=1, max_length=160)] | None = None
    work_modes: list[WorkMode] = Field(default_factory=list, max_length=3)

    @field_validator("skills")
    @classmethod
    def unique_skills(cls, value: list[str]) -> list[str]:
        seen: set[str] = set()
        result: list[str] = []
        for skill in value:
            key = skill.strip().casefold()
            if key and key not in seen:
                seen.add(key)
                result.append(skill.strip())
        return result

    @field_validator("work_modes", mode="before")
    @classmethod
    def parse_work_modes(cls, value: object) -> object:
        if not isinstance(value, list):
            return value
        return [item if isinstance(item, WorkMode) else WorkMode(item) for item in value]

    @field_validator("work_modes")
    @classmethod
    def unique_work_modes(cls, value: list[WorkMode]) -> list[WorkMode]:
        return list(dict.fromkeys(value))


class JobProfile(StrictModel):
    required_skills: list[Annotated[str, Field(min_length=1, max_length=100)]] = Field(
        default_factory=list, max_length=200
    )
    preferred_skills: list[Annotated[str, Field(min_length=1, max_length=100)]] = Field(
        default_factory=list, max_length=200
    )
    min_years_experience: float | None = Field(default=None, ge=0, le=80)
    max_years_experience: float | None = Field(default=None, ge=0, le=80)
    level: ExperienceLevelInput = None
    location: Annotated[str, Field(min_length=1, max_length=160)] | None = None
    work_modes: list[WorkMode] = Field(default_factory=list, max_length=3)

    @field_validator("work_modes", mode="before")
    @classmethod
    def parse_work_modes(cls, value: object) -> object:
        if not isinstance(value, list):
            return value
        return [item if isinstance(item, WorkMode) else WorkMode(item) for item in value]

    @field_validator("work_modes")
    @classmethod
    def unique_work_modes(cls, value: list[WorkMode]) -> list[WorkMode]:
        return list(dict.fromkeys(value))

    @model_validator(mode="after")
    def valid_year_range(self) -> "JobProfile":
        if self.min_years_experience is not None and self.max_years_experience is not None:
            if self.max_years_experience < self.min_years_experience:
                raise ValueError("max_years_experience must be >= min_years_experience")
        return self


MAX_EXTRACTED_TEXT_CHARS = 100_000
MAX_STRUCTURED_ITEMS = 50
MAX_STRUCTURED_ITEM_CHARS = 500
MAX_PARSE_WARNINGS = 20
MAX_PARSE_WARNING_CHARS = 240


class CVParseResponse(StrictModel):
    cv_id: UUID = Field(strict=False)
    content_version: int = Field(ge=1, le=2_147_483_647)
    media_type: MediaTypeInput
    content_sha256: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
    extracted_text: Annotated[str, Field(max_length=MAX_EXTRACTED_TEXT_CHARS)]
    text_char_count: int = Field(ge=0, le=MAX_EXTRACTED_TEXT_CHARS)
    skills: list[Annotated[str, Field(min_length=1, max_length=MAX_STRUCTURED_ITEM_CHARS)]] = Field(
        default_factory=list, max_length=MAX_STRUCTURED_ITEMS
    )
    education: list[Annotated[str, Field(min_length=1, max_length=MAX_STRUCTURED_ITEM_CHARS)]] = (
        Field(default_factory=list, max_length=MAX_STRUCTURED_ITEMS)
    )
    experience: list[Annotated[str, Field(min_length=1, max_length=MAX_STRUCTURED_ITEM_CHARS)]] = (
        Field(default_factory=list, max_length=MAX_STRUCTURED_ITEMS)
    )
    certificates: list[
        Annotated[str, Field(min_length=1, max_length=MAX_STRUCTURED_ITEM_CHARS)]
    ] = Field(default_factory=list, max_length=MAX_STRUCTURED_ITEMS)
    warnings: list[Annotated[str, Field(min_length=1, max_length=MAX_PARSE_WARNING_CHARS)]] = Field(
        default_factory=list, max_length=MAX_PARSE_WARNINGS
    )
    parser_version: Annotated[str, Field(min_length=1, max_length=40)] = "structured-parser-v1"

    @model_validator(mode="after")
    def text_count_matches_extracted_text(self) -> "CVParseResponse":
        if self.text_char_count != len(self.extracted_text):
            raise ValueError("text_char_count must match extracted_text length")
        return self


class MatchRequest(StrictModel):
    identity: MatchIdentity
    cv_id: UuidValue
    job_id: UuidValue
    content_hash: Sha256Value
    content_version: VersionValue
    job_source_version: VersionValue
    idempotency_key: Annotated[
        str, Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]*$")
    ]
    locale: LocaleValue
    candidate: CVProfile
    job: JobProfile

    @field_validator("idempotency_key")
    @classmethod
    def trimmed_idempotency_key(cls, value: str) -> str:
        if value != value.strip():
            raise ValueError("idempotency_key must be trimmed")
        return value


class MatchComponent(StrictModel):
    score: float = Field(ge=0, le=1)
    weight: float = Field(ge=0, le=1)
    available: bool
    evidence: list[Annotated[str, Field(min_length=1, max_length=240)]] = Field(
        default_factory=list, max_length=20
    )


class MatchResponse(StrictModel):
    request_id: UuidValue
    trace_id: UuidValue
    operation_attempt_id: UuidValue
    cv_id: UuidValue
    job_id: UuidValue
    content_hash: Sha256Value
    content_version: VersionValue
    job_source_version: VersionValue
    idempotency_key: Annotated[
        str, Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]*$")
    ]
    locale: LocaleValue
    overall_score: float = Field(ge=0, le=1)
    components: dict[str, MatchComponent]
    matched_skills: list[str] = Field(max_length=200)
    missing_required_skills: list[str] = Field(max_length=200)
    strengths: list[str] = Field(max_length=20)
    gaps: list[str] = Field(max_length=20)
    explanation: str = Field(max_length=2_000)
    degraded: bool
    scoring_version: str = "cv-job-match-v1"
    semantic_component_version: str = "unavailable-v1"
