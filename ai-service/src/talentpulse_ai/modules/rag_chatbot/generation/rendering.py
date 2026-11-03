from __future__ import annotations

from typing import Final, Literal
from uuid import UUID

from talentpulse_ai.modules.rag_chatbot.generation.locale import OutputLocale, _effective_locale
from talentpulse_ai.modules.rag_chatbot.schemas import (
    AnswerBlock,
    CanonicalJobContext,
    FallbackReason,
    MatchingEvidence,
    RagGenerateRequest,
    RagGenerateResponse,
    TypedClaim,
)

_ANSWER_BLOCK_TEXT_MAX_LENGTH: Final = 2_000
_CV_SKILL_DISPLAY_LIMIT: Final = 100


def _fallback(
    request: RagGenerateRequest,
    *,
    degraded: bool = False,
    reason: FallbackReason = "validation_error",
) -> RagGenerateResponse:
    evidence = request.retrieval_evidence
    locale = _effective_locale(request)
    if request.intent in {"JOB_SEARCH", "CV_JOB_COMPARISON"} and not evidence:
        status: Literal["COMPLETE", "DEGRADED", "NO_EVIDENCE"] = "NO_EVIDENCE"
        text = (
            "Không tìm thấy bằng chứng về việc làm đang tuyển phù hợp cho yêu cầu này."
            if locale == "vi"
            else "No grounded active-job evidence was found for this request."
        )
        blocks = [AnswerBlock(kind="REFUSAL", text=text)]
        claims: list[TypedClaim] = []
        citations: list[str] = []
        job_ids: list[UUID] = []
    elif request.intent == "JOB_SEARCH" and evidence:
        blocks, claims, citations, job_ids = _job_search_fallback(request)
        status = "DEGRADED"
    elif request.intent == "CV_ANALYSIS" and request.authorized_cv_snapshot is not None:
        cv = request.authorized_cv_snapshot
        status = "DEGRADED"
        if locale == "vi":
            skills = ", ".join(
                _display(skill, limit=_CV_SKILL_DISPLAY_LIMIT) for skill in cv.skills
            )
            text = (
                f"Các kỹ năng được liệt kê trong CV của bạn: {skills}. "
                "Hãy làm nổi bật các kết quả có thể đo lường và điều chỉnh CV theo "
                "vị trí mục tiêu."
                if cv.skills
                else "CV chưa có danh sách kỹ năng có cấu trúc. Hãy bổ sung các công nghệ "
                "và năng lực "
                "được sử dụng trong kinh nghiệm làm việc."
            )
        else:
            skills = ", ".join(
                _display(skill, limit=_CV_SKILL_DISPLAY_LIMIT) for skill in cv.skills
            )
            text = (
                f"Skills listed in your CV: {skills}. Consider "
                "highlighting measurable outcomes and tailoring them to the target role."
                if cv.skills
                else "Your CV does not contain a structured skills list. Consider adding the "
                "technologies and competencies used in your experience."
            )
        blocks = [AnswerBlock(kind="ADVICE", text=text[:_ANSWER_BLOCK_TEXT_MAX_LENGTH])]
        claims = [
            TypedClaim(claim_id="cv-skills", type="CV_SKILL", value={"count": len(cv.skills)})
        ]
        citations = []
        job_ids = []
    elif request.intent == "CV_JOB_COMPARISON" and evidence:
        blocks, claims, citations, job_ids = _comparison_fallback(request)
        status = "DEGRADED"
    else:
        status = "DEGRADED"
        text = (
            "Hãy dùng thông tin đã cung cấp để xác định vị trí mục tiêu, nhận diện "
            "khoảng trống kỹ năng "
            "và làm hồ sơ ứng tuyển cụ thể hơn."
            if locale == "vi"
            else "Use the supplied information to define a target role, identify "
            "skill gaps, and make your next application more specific."
        )
        blocks = [AnswerBlock(kind="ADVICE", text=text)]
        claims = []
        citations = []
        job_ids = []
    return RagGenerateResponse(
        request_id=request.identity.request_id,
        trace_id=request.identity.trace_id,
        client_message_id=request.identity.client_message_id,
        answer_status=status,
        answer_blocks=blocks,
        claims=claims,
        citation_keys=citations,
        referenced_job_ids=job_ids,
        filters=request.filter_state,
        degraded=degraded or status == "DEGRADED",
        source="deterministic_fallback",
        fallbackReason=reason,
    )


def _display(value: str, *, limit: int = 240) -> str:
    """Flatten untrusted canonical text before placing it in a readable answer."""
    return " ".join(value.split())[:limit]


def _job_fact_lines(
    job: CanonicalJobContext, locale: OutputLocale, *, include_title: bool = True
) -> list[str]:
    if locale == "vi":
        labels = {
            "title": "Vị trí",
            "company": "Công ty",
            "location": "Địa điểm",
            "level": "Cấp độ",
            "salary": "Mức lương",
            "skills": "Kỹ năng",
            "dates": "Thời gian",
        }
    else:
        labels = {
            "title": "Title",
            "company": "Company",
            "location": "Location",
            "level": "Level",
            "salary": "Salary",
            "skills": "Skills",
            "dates": "Dates",
        }
    lines: list[str] = []
    if include_title:
        lines.append(f"{labels['title']}: {_display(job.title)}")
    lines.append(f"{labels['company']}: {_display(job.company_name)}")
    if job.location is not None:
        lines.append(f"{labels['location']}: {_display(job.location)}")
    if job.level is not None:
        lines.append(f"{labels['level']}: {_display(job.level)}")
    if job.salary is not None:
        amount = f"{job.salary.amount:,.10f}".rstrip("0").rstrip(".")
        if locale == "vi":
            amount = amount.translate(str.maketrans(",.", ".,"))
        currency = _display(job.salary.currency, limit=16)
        lines.append(f"{labels['salary']}: {amount} {currency}")
    if job.skills:
        skills = ", ".join(_display(skill, limit=100) for skill in job.skills[:8])
        lines.append(f"{labels['skills']}: {skills}")
    dates = [
        _display(date, limit=64) for date in (job.start_date, job.end_date) if date is not None
    ]
    if dates:
        lines.append(f"{labels['dates']}: {' – '.join(dates)}")
    return lines


def _canonical_job_claims(job: CanonicalJobContext, citation: str) -> list[TypedClaim]:
    claims = [
        TypedClaim(
            claim_id=f"job-title-{job.job_id}",
            type="JOB_TITLE",
            subject_id=job.job_id,
            value=_display(job.title),
            citation_keys=[citation],
        ),
        TypedClaim(
            claim_id=f"job-company-{job.job_id}",
            type="COMPANY_NAME",
            subject_id=job.job_id,
            value=_display(job.company_name),
            citation_keys=[citation],
        ),
    ]
    if job.location is not None:
        claims.append(
            TypedClaim(
                claim_id=f"job-location-{job.job_id}",
                type="LOCATION",
                subject_id=job.job_id,
                value=_display(job.location),
                citation_keys=[citation],
            )
        )
    if job.level is not None:
        claims.append(
            TypedClaim(
                claim_id=f"job-level-{job.job_id}",
                type="LEVEL",
                subject_id=job.job_id,
                value=_display(job.level),
                citation_keys=[citation],
            )
        )
    if job.salary is not None:
        claims.append(
            TypedClaim(
                claim_id=f"job-salary-{job.job_id}",
                type="SALARY",
                subject_id=job.job_id,
                value={
                    "amount": job.salary.amount,
                    "currency": _display(job.salary.currency, limit=16),
                },
                citation_keys=[citation],
            )
        )
    for index, skill in enumerate(job.skills[:8]):
        claims.append(
            TypedClaim(
                claim_id=f"job-skill-{job.job_id}-{index}",
                type="SKILL",
                subject_id=job.job_id,
                value=_display(skill, limit=100),
                citation_keys=[citation],
            )
        )
    if job.start_date or job.end_date:
        claims.append(
            TypedClaim(
                claim_id=f"job-date-{job.job_id}",
                type="JOB_DATE",
                subject_id=job.job_id,
                value=" – ".join(
                    _display(date, limit=64)
                    for date in (job.start_date, job.end_date)
                    if date is not None
                ),
                citation_keys=[citation],
            )
        )
    return claims


def _job_search_fallback(
    request: RagGenerateRequest,
) -> tuple[list[AnswerBlock], list[TypedClaim], list[str], list[UUID]]:
    jobs_by_id = {job.job_id: job for job in request.canonical_active_job_context}
    locale = _effective_locale(request)
    blocks: list[AnswerBlock] = []
    claims: list[TypedClaim] = []
    citations: list[str] = []
    job_ids: list[UUID] = []
    entries: list[str] = []
    seen_job_ids: set[UUID] = set()

    for evidence in request.retrieval_evidence[:20]:
        job = jobs_by_id.get(evidence.job_id)
        if job is None or job.job_id in seen_job_ids:
            continue
        seen_job_ids.add(job.job_id)
        citations.append(evidence.citation_key)
        job_ids.append(job.job_id)
        claims.append(
            TypedClaim(
                claim_id=f"job-title-{job.job_id}",
                type="JOB_TITLE",
                subject_id=job.job_id,
                value=_display(job.title),
                citation_keys=[evidence.citation_key],
            )
        )
        title = _display(job.title)
        facts = _job_fact_lines(job, locale, include_title=False)
        entries.append("\n".join([f"- {title}", *[f"  {line}" for line in facts]]))

    if entries:
        heading = "Việc làm phù hợp:" if locale == "vi" else "Matching jobs:"
        current = [heading]
        for entry in entries:
            candidate = "\n".join([*current, entry])
            if len(candidate) > 2_000 and len(current) > 1:
                blocks.append(
                    AnswerBlock(
                        kind="INFERENCE",
                        text="\n".join(current)[:_ANSWER_BLOCK_TEXT_MAX_LENGTH],
                    )
                )
                current = [entry]
            else:
                current.append(entry)
        blocks.append(
            AnswerBlock(
                kind="INFERENCE",
                text="\n".join(current)[:_ANSWER_BLOCK_TEXT_MAX_LENGTH],
            )
        )
    else:
        text = (
            "Không thể hiển thị an toàn bằng chứng việc làm đã truy hồi."
            if locale == "vi"
            else "Retrieved active-job evidence could not be rendered safely."
        )
        blocks = [AnswerBlock(kind="REFUSAL", text=text)]
    return blocks, claims, citations, job_ids


def _match_explanation_lines(evidence: MatchingEvidence, locale: OutputLocale) -> list[str]:
    score = f"{evidence.overall_score:.2f}"
    percentage = round(evidence.overall_score * 100)
    matched = [_display(skill, limit=100) for skill in evidence.matched_skills[:8]]
    missing = [_display(skill, limit=100) for skill in evidence.missing_required_skills[:8]]
    if locale == "vi":
        lines = [f"Mức độ phù hợp: {percentage}% ({score})"]
        lines.append(
            "Điểm mạnh: Kỹ năng phù hợp: " + ", ".join(matched) + "."
            if matched
            else "Điểm mạnh: Chưa ghi nhận kỹ năng bắt buộc phù hợp."
        )
        lines.append(
            "Khoảng thiếu: Kỹ năng bắt buộc còn thiếu: " + ", ".join(missing) + "."
            if missing
            else "Khoảng thiếu: Chưa ghi nhận kỹ năng bắt buộc còn thiếu."
        )
        if evidence.degraded:
            lines.append(
                "Lưu ý: một tín hiệu chấm điểm không khả dụng; các trọng số còn lại đã "
                "được chuẩn hóa."
            )
        return lines
    lines = [f"Match score: {percentage}% ({score})"]
    lines.append(
        "Strengths: Matched skills: " + ", ".join(matched) + "."
        if matched
        else "Strengths: No matched required skills were reported."
    )
    lines.append(
        "Gaps: Missing required skills: " + ", ".join(missing) + "."
        if missing
        else "Gaps: No missing required skills were reported."
    )
    if evidence.degraded:
        lines.append(
            "Note: one scoring signal was unavailable; the remaining weights were renormalized."
        )
    return lines


def _matching_claim(evidence: MatchingEvidence, citation: str) -> TypedClaim:
    return TypedClaim(
        claim_id=f"match-{evidence.job_id}",
        type="INFERENCE",
        subject_id=evidence.job_id,
        value={
            "overall_score": evidence.overall_score,
            "matched_skills": len(evidence.matched_skills),
            "missing_required_skills": len(evidence.missing_required_skills),
        },
        citation_keys=[citation],
    )


def _comparison_fallback(
    request: RagGenerateRequest,
) -> tuple[list[AnswerBlock], list[TypedClaim], list[str], list[UUID]]:
    evidence = request.matching_evidence
    assert evidence is not None
    citation = next(
        (
            item.citation_key
            for item in request.retrieval_evidence
            if item.job_id == evidence.job_id
        ),
        None,
    )
    job = next(
        (item for item in request.canonical_active_job_context if item.job_id == evidence.job_id),
        None,
    )
    if citation is None or job is None:
        return [], [], [], []
    locale = _effective_locale(request)
    heading = "Đối chiếu CV với công việc" if locale == "vi" else "CV-job comparison"
    lines = [heading, *_job_fact_lines(job, locale), ""]
    lines.extend(_match_explanation_lines(evidence, locale))
    match_claim = _matching_claim(evidence, citation)
    claims = [match_claim, *_canonical_job_claims(job, citation)]
    return (
        [
            AnswerBlock(
                kind="INFERENCE",
                text="\n".join(lines)[:_ANSWER_BLOCK_TEXT_MAX_LENGTH],
            )
        ],
        claims,
        [citation],
        [evidence.job_id],
    )
