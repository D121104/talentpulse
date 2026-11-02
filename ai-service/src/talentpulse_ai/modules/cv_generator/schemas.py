from __future__ import annotations

import re
import unicodedata
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from talentpulse_ai.modules.cv_analysis.schemas import MatchIdentity, UuidValue, VersionValue


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


Text = Annotated[str, Field(min_length=1, max_length=2_000)]
ShortText = Annotated[str, Field(min_length=1, max_length=500)]


def _content_key(value: str) -> str:
    """Compare user/provider text without changing the value we return."""
    normalized = unicodedata.normalize("NFKC", value).casefold()
    # Keep technology markers such as C++ and C# meaningful while treating
    # punctuation, bullets and repeated whitespace as presentation noise.
    normalized = re.sub(r"[^\w+#]+", " ", normalized, flags=re.UNICODE)
    return " ".join(normalized.split())


def _dedupe_texts(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        cleaned = " ".join(value.split()).strip()
        key = _content_key(cleaned)
        if cleaned and key and key not in seen:
            seen.add(key)
            result.append(cleaned)
    return result


def _model_key(value: BaseModel) -> str:
    parts: list[str] = []
    for field, item in value.model_dump().items():
        if isinstance(item, list):
            rendered = " ".join(_content_key(str(entry)) for entry in item)
        else:
            rendered = _content_key(str(item)) if item is not None else ""
        parts.append(f"{field}:{rendered}")
    return "|".join(parts)


def _dedupe_models(values: list[BaseModel]) -> list[BaseModel]:
    seen: set[str] = set()
    result: list[BaseModel] = []
    for value in values:
        key = _model_key(value)
        if key and key not in seen:
            seen.add(key)
            result.append(value)
    return result


SectionName = Literal[
    "objective",
    "education",
    "experience",
    "projects",
    "skills",
    "activities",
    "certificates",
    "awards",
]
LocalizationSection = Literal[
    "headline",
    "education",
    "experience",
    "projects",
    "skills",
    "certificates",
    "activities",
    "awards",
]
_DEFAULT_SECTION_ORDER: list[SectionName] = [
    "objective",
    "education",
    "experience",
    "projects",
    "skills",
    "activities",
    "certificates",
    "awards",
]


class CandidateExperience(StrictModel):
    company_name: ShortText | None = None
    position: ShortText | None = None
    start_date: ShortText | None = None
    end_date: ShortText | None = None
    description: Text | None = None


class CandidateProject(StrictModel):
    project_name: ShortText
    role: ShortText | None = None
    start_date: ShortText | None = None
    end_date: ShortText | None = None
    description: Text | None = None
    technologies: list[ShortText] = Field(default_factory=list, max_length=50)

    @field_validator("technologies")
    @classmethod
    def unique_technologies(cls, values: list[str]) -> list[str]:
        return _dedupe_texts(values)


class CandidateEducation(StrictModel):
    school_name: ShortText | None = None
    degree: ShortText | None = None
    major: ShortText | None = None
    start_date: ShortText | None = None
    end_date: ShortText | None = None
    description: Text | None = None


class CandidateProfile(StrictModel):
    candidate_id: UuidValue
    full_name: ShortText
    email: Annotated[str, Field(min_length=3, max_length=320)] | None = None
    phone: ShortText | None = None
    link: ShortText | None = None
    address: ShortText | None = None
    headline: ShortText | None = None
    career_objective: Text | None = None
    skills: list[ShortText] = Field(default_factory=list, max_length=100)
    experience: list[CandidateExperience] = Field(default_factory=list, max_length=50)
    education: list[CandidateEducation] = Field(default_factory=list, max_length=50)
    projects: list[CandidateProject] = Field(default_factory=list, max_length=50)
    certificates: list[ShortText] = Field(default_factory=list, max_length=50)
    activities: list[ShortText] = Field(default_factory=list, max_length=50)
    awards: list[ShortText] = Field(default_factory=list, max_length=50)

    @field_validator("skills", "certificates")
    @classmethod
    def unique_owned_literals(cls, values: list[str]) -> list[str]:
        seen: set[str] = set()
        result: list[str] = []
        for value in values:
            if not value.strip():
                raise ValueError("Owned skill and certificate literals must not be blank")
            key = _content_key(value)
            if key not in seen:
                seen.add(key)
                result.append(value)
        return result

    @field_validator("activities", "awards")
    @classmethod
    def unique_values(cls, values: list[str]) -> list[str]:
        return _dedupe_texts(values)

    @field_validator("education")
    @classmethod
    def unique_entries(cls, values: list[BaseModel]) -> list[BaseModel]:
        return _dedupe_models(values)


class JobProfile(StrictModel):
    job_id: UuidValue
    title: ShortText
    company_name: ShortText | None = None
    description: Annotated[str, Field(max_length=8_000)] | None = None
    location: ShortText | None = None
    work_mode: ShortText | None = None
    level: ShortText | None = None
    required_skills: list[ShortText] = Field(default_factory=list, max_length=100)
    preferred_skills: list[ShortText] = Field(default_factory=list, max_length=100)


class CvDraftRequest(StrictModel):
    identity: MatchIdentity
    candidate: CandidateProfile
    job: JobProfile
    template_type: Literal["template1", "template2"]
    # Keep legacy short values while making the two supported output locales explicit.
    locale: Literal["en-US", "vi-VN", "en", "vi"] = "en-US"
    source_version: VersionValue
    content_version: int = Field(ge=1, le=2_147_483_647)
    consent_version: Annotated[str, Field(min_length=1, max_length=80)] | None = None


class GeneratedProjectBullet(StrictModel):
    source_index: int = Field(ge=0, le=49, description="Zero-based candidate project index.")
    text: Text = Field(description="One concise, factual CV bullet in the requested locale.")


class GeneratedBullet(StrictModel):
    source_index: int = Field(ge=0, le=49, description="Zero-based candidate experience index.")
    text: Text = Field(description="One concise, factual CV bullet in the requested locale.")


class CoreCoverage(StrictModel):
    """Explicit source-index coverage for core bullets."""

    section: Literal["experience", "projects"]
    source_index: int = Field(ge=0, le=49)
    bullet_count: int = Field(ge=0, le=10)


class ProviderTextValue(StrictModel):
    """Legacy single-value payload retained for provider compatibility."""

    text: Text = Field(...)


class ProviderLocalizedItem(StrictModel):
    """One flat localized scalar keyed by an application-owned target key."""

    key: ShortText
    text: Text = Field(...)


class ProviderLocalizedItems(StrictModel):
    """Chunked localization payload; item keys never come from provider mapping."""

    items: list[ProviderLocalizedItem] = Field(default_factory=list, max_length=20)


class ProviderCoreDraft(StrictModel):
    """Provider payload for experience and project bullets only."""

    bullets: list[GeneratedBullet] = Field(default_factory=list, max_length=100)
    project_bullets: list[GeneratedProjectBullet] = Field(default_factory=list, max_length=100)
    coverage: list[CoreCoverage] = Field(default_factory=list, max_length=100)
    warnings: list[ShortText] = Field(default_factory=list, max_length=20)


class DraftProject(CandidateProject):
    source_index: int = Field(ge=0, le=49)
    bullets: list[Text] = Field(default_factory=list, max_length=10)


class DraftExperience(CandidateExperience):
    source_index: int = Field(ge=0, le=49)
    bullets: list[Text] = Field(default_factory=list, max_length=10)


class DraftSkill(StrictModel):
    name: ShortText
    description: Text | None = None


class CvDraft(StrictModel):
    request_id: UuidValue
    trace_id: UuidValue
    operation_attempt_id: UuidValue
    candidate_id: UuidValue
    target_job_id: UuidValue
    template_type: Literal["template1", "template2"]
    generation_mode: Literal["EDITOR_ONLY"] = "EDITOR_ONLY"
    full_name: ShortText
    title: ShortText
    position: ShortText | None = None
    email: Annotated[str, Field(min_length=3, max_length=320)] | None = None
    phone: ShortText | None = None
    link: ShortText | None = None
    address: ShortText | None = None
    career_objective: Text | None = None
    education: list[CandidateEducation] = Field(default_factory=list, max_length=50)
    projects: list[DraftProject] = Field(default_factory=list, max_length=3)
    work_experience: list[DraftExperience] = Field(default_factory=list, max_length=3)
    skills: list[DraftSkill] = Field(default_factory=list, max_length=100)
    activities: list[ShortText] = Field(default_factory=list, max_length=50)
    certificates: list[ShortText] = Field(default_factory=list, max_length=50)
    awards: list[ShortText] = Field(default_factory=list, max_length=50)
    section_order: list[SectionName] = Field(
        default_factory=lambda: list(_DEFAULT_SECTION_ORDER), max_length=8
    )
    warnings: list[ShortText] = Field(default_factory=list, max_length=20)
    generated_by: Annotated[str, Field(min_length=1, max_length=64)] = "ai-service"
    source_version: VersionValue
    content_version: int = Field(ge=1, le=2_147_483_647)


# Keep the common acronym spelling available to callers without duplicating contracts.
CVDraftRequest = CvDraftRequest
CVDraft = CvDraft
