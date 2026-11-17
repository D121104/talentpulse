from __future__ import annotations

from pydantic import BaseModel, ConfigDict

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


class _RequestContextAuthorizer:
    def is_authorized(self, request: AgentRequest, operation: str) -> bool:
        return (
            request.capability_id == "rag.generate"
            and operation == "rag:generate"
            and isinstance(request.authorized_context.get("rag_request"), RagGenerateRequest)
        )


def build_retrieval_context_authorizer() -> _RequestContextAuthorizer:
    return _RequestContextAuthorizer()
