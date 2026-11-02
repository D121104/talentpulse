from __future__ import annotations

from uuid import UUID

from talentpulse_ai.modules.rag_chatbot.schemas import ProviderGeneration, RagGenerateRequest


def retrieval_citation_jobs(request: RagGenerateRequest) -> dict[str, UUID]:
    citation_to_job: dict[str, UUID] = {}
    for evidence in request.retrieval_evidence:
        previous_job_id = citation_to_job.get(evidence.citation_key)
        if previous_job_id is not None and previous_job_id != evidence.job_id:
            raise ValueError("retrieval citation maps to multiple jobs")
        citation_to_job[evidence.citation_key] = evidence.job_id
    return citation_to_job


def parse_and_validate(value: object, request: RagGenerateRequest) -> ProviderGeneration:
    parsed = ProviderGeneration.model_validate(value)
    allowed_citations = {item.citation_key for item in request.retrieval_evidence}
    context_job_ids = {job.job_id for job in request.canonical_active_job_context}
    allowed_jobs = (
        {item.job_id for item in request.retrieval_evidence}
        if request.intent == "JOB_SEARCH"
        else context_job_ids
    )
    if not set(parsed.citation_keys).issubset(allowed_citations):
        raise ValueError("provider returned an unknown citation")
    if not set(parsed.referenced_job_ids).issubset(allowed_jobs):
        raise ValueError("provider returned an unknown job")
    claim_citations = {key for claim in parsed.claims for key in claim.citation_keys}
    if not claim_citations.issubset(allowed_citations):
        raise ValueError("provider claim returned an unknown citation")
    if not claim_citations.issubset(set(parsed.citation_keys)):
        raise ValueError("provider claim citation is not declared")
    if request.intent == "JOB_SEARCH":
        citation_to_job = retrieval_citation_jobs(request)
        cited_job_ids = {citation_to_job[key] for key in parsed.citation_keys}
        referenced_job_ids = set(parsed.referenced_job_ids)
        if cited_job_ids != referenced_job_ids:
            raise ValueError("provider citations and job references are not paired")
    else:
        citation_to_job = {}
    if (
        request.intent == "CV_ANALYSIS"
        and request.authorized_cv_snapshot is not None
        and any(
            (
                request.authorized_cv_snapshot.skills,
                request.authorized_cv_snapshot.education,
                request.authorized_cv_snapshot.experience,
                request.authorized_cv_snapshot.certificates,
            )
        )
        and parsed.answer_blocks
        and all(block.kind == "REFUSAL" for block in parsed.answer_blocks)
    ):
        raise ValueError("provider refused despite structured CV evidence")

    allowed_subjects = allowed_jobs
    if request.authorized_cv_snapshot is not None:
        allowed_subjects = {*allowed_subjects, request.authorized_cv_snapshot.cv_id}
    for claim in parsed.claims:
        if claim.subject_id is not None and claim.subject_id not in allowed_subjects:
            raise ValueError("provider claim has an unknown subject")
        if request.intent == "JOB_SEARCH" and claim.subject_id in allowed_jobs:
            claim_job_ids = {citation_to_job[key] for key in claim.citation_keys}
            if claim_job_ids != {claim.subject_id}:
                raise ValueError("provider job claim citation is not paired")
    return parsed
