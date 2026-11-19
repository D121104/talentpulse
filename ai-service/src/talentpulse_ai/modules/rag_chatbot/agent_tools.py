from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from talentpulse_ai.agent_foundation.contracts import AgentRequest
from talentpulse_ai.agent_foundation.tools import (
    ToolDefinition,
    ToolExecutionContext,
    ToolSideEffect,
)
from talentpulse_ai.modules.rag_chatbot.schemas import (
    AuthorizedCvSnapshot,
    CanonicalJobContext,
    MatchingEvidence,
    RagGenerateRequest,
    RetrievalEvidence,
    StructuredFilterState,
)


class RetrievalContextInput(BaseModel):
    model_config = ConfigDict(extra="forbid")


class RetrievalContextOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    canonical_active_job_context: list[CanonicalJobContext]
    retrieval_evidence: list[RetrievalEvidence]
    authorized_cv_snapshot: AuthorizedCvSnapshot | None
    matching_evidence: MatchingEvidence | None
    filter_state: StructuredFilterState


class MatchingEvidenceInput(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MatchingEvidenceOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    matching_evidence: MatchingEvidence


class SkillFrameworkInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    occupation_query: Annotated[
        str,
        Field(
            min_length=2,
            max_length=100,
            description=(
                "A standard occupation title to look up in the bundled O*NET dataset, such as "
                "Software Developers or Middle Developer. This is a title, not a URL, "
                "user selector, or search instruction."
            ),
        ),
    ]


class SkillFrameworkItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    element_id: str
    element_name: str
    domain: Literal["essential", "transferable"]
    description: str
    importance: float | None
    importance_suppression: str | None
    level: float | None
    level_suppression: str | None
    level_not_relevant: str | None


class SkillFrameworkScale(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scale_id: Literal["IM", "LV"]
    scale_name: str
    minimum: int
    maximum: int


class SkillFrameworkMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    framework: str
    framework_version: str
    retrieved_at: str
    source_url: str
    occupation_source_url: str
    license: str
    license_url: str
    database_license_url: str
    attribution: str
    change_statement: str


class SkillFrameworkOccupation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    onetsoc_code: str
    title: str
    description: str


class SkillFrameworkSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    metadata: SkillFrameworkMetadata
    occupation: SkillFrameworkOccupation
    scales: list[SkillFrameworkScale]
    skills: list[SkillFrameworkItem]


class SkillFrameworkOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    matched: bool
    framework: str
    framework_version: str
    retrieved_at: str
    source_url: str
    occupation_source_url: str
    license: str
    license_url: str
    database_license_url: str
    attribution: str
    change_statement: str
    occupation_code: str | None
    occupation_title: str | None
    occupation_description: str | None
    match_basis: Literal["exact_title", "occupation_code", "project_alias"] | None
    seniority_level_supported: bool
    scale_definitions: list[SkillFrameworkScale]
    skills: list[SkillFrameworkItem]


def _prepared_context(value: BaseModel, context: ToolExecutionContext) -> RetrievalContextOutput:
    del value
    request = context.authorized_context.get("rag_request")
    if not isinstance(request, RagGenerateRequest):
        raise ValueError("Authorized request context is unavailable.")

    job_ids = {job.job_id for job in request.canonical_active_job_context}
    evidence_ids = {item.job_id for item in request.retrieval_evidence}
    if not evidence_ids.issubset(job_ids):
        raise ValueError("Prepared retrieval evidence is invalid.")
    if request.matching_evidence is not None and (
        request.authorized_cv_snapshot is None
        or request.matching_evidence.cv_id != request.authorized_cv_snapshot.cv_id
        or request.matching_evidence.job_id not in evidence_ids
    ):
        raise ValueError("Prepared matching evidence is invalid.")

    return RetrievalContextOutput(
        canonical_active_job_context=request.canonical_active_job_context,
        retrieval_evidence=request.retrieval_evidence,
        authorized_cv_snapshot=request.authorized_cv_snapshot,
        matching_evidence=request.matching_evidence,
        filter_state=request.filter_state,
    )


def build_retrieval_context_tool() -> ToolDefinition:
    return ToolDefinition(
        tool_id="rag.retrieve_context",
        description=(
            "Return only this request's host-prepared, authorized career context. "
            "Do not supply selectors or search terms."
        ),
        input_model=RetrievalContextInput,
        output_model=RetrievalContextOutput,
        allowed_capabilities=frozenset({"rag.generate"}),
        required_operation="rag:generate",
        timeout_seconds=1.0,
        side_effect_class=ToolSideEffect.READ_ONLY,
        handler=_prepared_context,
    )


def _matching_evidence(value: BaseModel, context: ToolExecutionContext) -> MatchingEvidenceOutput:
    del value
    request = context.authorized_context.get("rag_request")
    if not isinstance(request, RagGenerateRequest):
        raise ValueError("Authorized request context is unavailable.")
    cv = request.authorized_cv_snapshot
    evidence = request.matching_evidence
    job_ids = {job.job_id for job in request.canonical_active_job_context}
    retrieved_job_ids = {item.job_id for item in request.retrieval_evidence}
    if (
        request.intent != "CV_JOB_COMPARISON"
        or cv is None
        or evidence is None
        or request.consent_version is None
        or cv.consent_version not in {None, request.consent_version}
        or evidence.cv_id != cv.cv_id
        or evidence.job_id not in job_ids
        or evidence.job_id not in retrieved_job_ids
    ):
        raise ValueError("Authorized matching evidence is unavailable.")
    return MatchingEvidenceOutput(matching_evidence=evidence)


def build_matching_evidence_tool() -> ToolDefinition:
    return ToolDefinition(
        tool_id="career.read_matching_evidence",
        description=(
            "Read only the deterministic CV-job matching evidence authorized for this request. "
            "Do not supply CV/job selectors or replacement scores."
        ),
        input_model=MatchingEvidenceInput,
        output_model=MatchingEvidenceOutput,
        allowed_capabilities=frozenset({"rag.generate"}),
        required_operation="rag:generate",
        timeout_seconds=1.0,
        side_effect_class=ToolSideEffect.READ_ONLY,
        handler=_matching_evidence,
    )


@lru_cache(maxsize=1)
def _skill_framework_snapshot() -> SkillFrameworkSnapshot:
    path = Path(__file__).with_name("onet_skill_framework_v31.json")
    return SkillFrameworkSnapshot.model_validate(json.loads(path.read_text(encoding="utf-8")))


def _normalize_occupation_query(value: str) -> str:
    return " ".join(re.sub(r"[^\w\s]", " ", value.casefold()).split())


def _skill_framework(value: BaseModel, context: ToolExecutionContext) -> SkillFrameworkOutput:
    if not isinstance(value, SkillFrameworkInput):
        raise ValueError("Skill framework input is invalid.")
    request = context.authorized_context.get("rag_request")
    if not isinstance(request, RagGenerateRequest) or request.intent != "ADVICE":
        raise ValueError("The skill framework is only available for career advice.")

    snapshot = _skill_framework_snapshot()
    occupation = snapshot.occupation

    query = _normalize_occupation_query(value.occupation_query)
    title = _normalize_occupation_query(occupation.title)
    aliases = {
        "software developer",
        "middle developer",
        "mid developer",
        "mid level developer",
        "middle software developer",
        "mid level software developer",
        "software developer mid level",
        "senior developer",
        "senior software developer",
        "senior level developer",
        "senior level software developer",
        "software developer senior level",
        "lap trinh vien trung cap",
        "lập trình viên trung cấp",
        "nha phat trien phan mem cap trung",
        "nhà phát triển phần mềm cấp trung",
        "lap trinh vien cao cap",
        "lập trình viên cao cấp",
        "nha phat trien phan mem cap cao",
        "nhà phát triển phần mềm cấp cao",
    }
    if query == title:
        match_basis: Literal["exact_title", "occupation_code", "project_alias"] | None = (
            "exact_title"
        )
    elif query == _normalize_occupation_query(occupation.onetsoc_code):
        match_basis = "occupation_code"
    elif query in aliases:
        match_basis = "project_alias"
    else:
        match_basis = None

    matched = match_basis is not None
    skills = snapshot.skills if matched else []

    return SkillFrameworkOutput(
        matched=matched,
        framework=snapshot.metadata.framework,
        framework_version=snapshot.metadata.framework_version,
        retrieved_at=snapshot.metadata.retrieved_at,
        source_url=snapshot.metadata.source_url,
        occupation_source_url=snapshot.metadata.occupation_source_url,
        license=snapshot.metadata.license,
        license_url=snapshot.metadata.license_url,
        database_license_url=snapshot.metadata.database_license_url,
        attribution=snapshot.metadata.attribution,
        change_statement=snapshot.metadata.change_statement,
        occupation_code=occupation.onetsoc_code if matched else None,
        occupation_title=occupation.title if matched else None,
        occupation_description=occupation.description if matched else None,
        match_basis=match_basis,
        seniority_level_supported=False,
        scale_definitions=snapshot.scales,
        skills=skills,
    )


def skill_framework_attribution() -> str:
    metadata = _skill_framework_snapshot().metadata
    return " ".join(
        (
            metadata.attribution,
            f"Dataset: {metadata.source_url}",
            f"License: {metadata.license_url}",
            f"Database terms: {metadata.database_license_url}",
            f"Changes: {metadata.change_statement}",
        )
    )


def build_skill_framework_tool() -> ToolDefinition:
    return ToolDefinition(
        tool_id="career.lookup_skill_framework",
        description=(
            "Look up occupation-wide essential and transferable skill benchmarks in the "
            "bundled O*NET 31.0 dataset. Use for general career-advice questions about "
            "Software Developers. Importance uses the 1-5 IM scale and level uses the 0-7 "
            "LV scale; neither is a percentage or a seniority-level assessment. The bundled "
            "dataset is read-only and no web search is performed."
        ),
        input_model=SkillFrameworkInput,
        output_model=SkillFrameworkOutput,
        allowed_capabilities=frozenset({"rag.generate"}),
        required_operation="rag:generate",
        timeout_seconds=1.0,
        side_effect_class=ToolSideEffect.READ_ONLY,
        handler=_skill_framework,
    )


class _RequestContextAuthorizer:
    def is_authorized(self, request: AgentRequest, operation: str) -> bool:
        return (
            request.capability_id == "rag.generate"
            and operation == "rag:generate"
            and isinstance(request.authorized_context.get("rag_request"), RagGenerateRequest)
        )


def build_retrieval_context_authorizer() -> _RequestContextAuthorizer:
    return _RequestContextAuthorizer()
