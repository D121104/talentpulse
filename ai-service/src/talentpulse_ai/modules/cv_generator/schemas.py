from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from talentpulse_ai.modules.cv_analysis.schemas import (
    MatchIdentity,
    UuidValue,
    VersionValue,
)


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


Text = Annotated[str, Field(min_length=1, max_length=2_000)]
ShortText = Annotated[str, Field(min_length=1, max_length=500)]


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


class DraftProject(CandidateProject):
    source_index: int = Field(ge=0, le=49)
    bullets: list[Text] = Field(default_factory=list, max_length=10)


class DraftExperience(CandidateExperience):
    source_index: int = Field(ge=0, le=49)
    bullets: list[Text] = Field(default_factory=list, max_length=10)


class DraftSkill(StrictModel):
    name: ShortText
    description: Text | None = None


class GeneratedEducation(StrictModel):
    source_index: int = Field(ge=0, le=49)
    degree: ShortText | None = None
    major: ShortText | None = None
    description: Text | None = None


class GeneratedExperience(StrictModel):
    source_index: int = Field(ge=0, le=49)
    position: ShortText | None = None
    description: Text | None = None
    bullets: list[Text] = Field(default_factory=list, max_length=10)


class GeneratedProject(StrictModel):
    source_index: int = Field(ge=0, le=49)
    role: ShortText | None = None
    description: Text | None = None
    bullets: list[Text] = Field(default_factory=list, max_length=10)


class GeneratedSkillGroup(StrictModel):
    group_name: ShortText
    source_indices: list[int] = Field(min_length=1, max_length=100)
    job_skill_indices: list[int] = Field(max_length=100)


class GeneratedTextItem(StrictModel):
    source_index: int = Field(ge=0, le=49)
    text: ShortText


class CvGenerationContent(StrictModel):
    """Provider-generated CV content; request identity and contact fields stay application-owned."""

    model_config = ConfigDict(
        json_schema_extra={
            "required": [
                "title",
                "education",
                "projects",
                "work_experience",
                "skills",
                "activities",
                "certificates",
                "awards",
                "section_order",
            ]
        }
    )

    title: ShortText
    position: ShortText | None = None
    career_objective: Text | None = None
    education: list[GeneratedEducation] = Field(default_factory=list, max_length=50)
    projects: list[GeneratedProject] = Field(default_factory=list, max_length=3)
    work_experience: list[GeneratedExperience] = Field(default_factory=list, max_length=3)
    skills: list[GeneratedSkillGroup] = Field(default_factory=list, max_length=16)
    activities: list[GeneratedTextItem] = Field(default_factory=list, max_length=50)
    certificates: list[GeneratedTextItem] = Field(default_factory=list, max_length=50)
    awards: list[GeneratedTextItem] = Field(default_factory=list, max_length=50)
    section_order: list[SectionName] = Field(
        default_factory=lambda: list(_DEFAULT_SECTION_ORDER), max_length=8
    )


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


ReviewFieldPath = Annotated[
    str,
    Field(
        min_length=1,
        max_length=160,
        pattern=(
            r"^/(?:position|career_objective|"
            r"education/\d+/(?:school_name|degree|major|start_date|end_date|description)|"
            r"projects/\d+/(?:project_name|role|start_date|end_date|description|"
            r"technologies/\d+|bullets(?:/\d+)?)|"
            r"work_experience/\d+/(?:company_name|position|start_date|end_date|"
            r"description|bullets(?:/\d+)?)|skills/\d+/(?:name|description)|"
            r"activities/\d+|certificates/\d+|awards/\d+)$"
        ),
    ),
]
SourceReferencePath = Annotated[
    str,
    Field(min_length=1, max_length=192, pattern=r"^/(?:candidate|job)/[A-Za-z0-9_/-]+$"),
]
ReviewFieldOrigin = Literal["SOURCE", "LOCALIZED", "AI_SUGGESTED", "FALLBACK"]
ReviewOmissionReason = Literal[
    "INSUFFICIENT_EVIDENCE",
    "LOCALIZATION_FAILED",
    "SOURCE_UNAVAILABLE",
    "STRUCTURE_INVALID",
]


class CvDraftReviewOmission(StrictModel):
    path: ReviewFieldPath
    reason_code: ReviewOmissionReason


class CvDraftReviewMetadata(StrictModel):
    source_refs_by_path: dict[ReviewFieldPath, list[SourceReferencePath]] = Field(
        default_factory=dict, max_length=1_000
    )
    field_origins_by_path: dict[ReviewFieldPath, ReviewFieldOrigin] = Field(
        default_factory=dict, max_length=1_000
    )
    omissions_by_path: list[CvDraftReviewOmission] = Field(default_factory=list, max_length=200)

    @model_validator(mode="after")
    def validate_path_metadata(self) -> CvDraftReviewMetadata:
        output_paths = set(self.field_origins_by_path)
        omission_paths = [omission.path for omission in self.omissions_by_path]
        if len(omission_paths) != len(set(omission_paths)):
            raise ValueError("Omission paths must be unique.")
        if output_paths.intersection(omission_paths):
            raise ValueError("A field cannot be both present and omitted.")
        if not output_paths.union(omission_paths).issubset(self.source_refs_by_path):
            raise ValueError("Every reviewed path must map to an authorized source reference.")
        if any(not references for references in self.source_refs_by_path.values()):
            raise ValueError("Source references must not be empty.")
        return self


class CvDraftReviewEnvelope(StrictModel):
    implementation: Literal["agent"]
    draft: CvDraft
    review_metadata: CvDraftReviewMetadata


# Keep the common acronym spelling available to callers without duplicating contracts.
CVDraftRequest = CvDraftRequest
CVDraft = CvDraft
