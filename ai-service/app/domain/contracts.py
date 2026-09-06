from enum import StrEnum
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, field_validator, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


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

    @model_validator(mode="after")
    def valid_year_range(self) -> "JobProfile":
        if self.min_years_experience is not None and self.max_years_experience is not None:
            if self.max_years_experience < self.min_years_experience:
                raise ValueError("max_years_experience must be >= min_years_experience")
        return self


class CVParseResponse(StrictModel):
    cv_id: UUID = Field(strict=False)
    content_version: int
    media_type: MediaTypeInput
    content_sha256: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
    extracted_text: Annotated[str, Field(max_length=100_000)]
    text_char_count: int = Field(ge=0)
    parser_version: str = "text-parser-v1"


class MatchRequest(StrictModel):
    cv_id: UUID = Field(strict=False)
    job_id: UUID = Field(strict=False)
    candidate: CVProfile
    job: JobProfile


class MatchComponent(StrictModel):
    score: float = Field(ge=0, le=1)
    weight: float = Field(ge=0, le=1)
    available: bool
    evidence: list[Annotated[str, Field(min_length=1, max_length=240)]] = Field(
        default_factory=list, max_length=20
    )


class MatchResponse(StrictModel):
    cv_id: UUID = Field(strict=False)
    job_id: UUID = Field(strict=False)
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
