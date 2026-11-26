from __future__ import annotations

from typing import cast

from fastapi import APIRouter, Depends, Header, Request
from fastapi.responses import JSONResponse

from talentpulse_ai.core.security import require_scope
from talentpulse_ai.modules.cv_generator.agent import CvGenerationAgent
from talentpulse_ai.modules.cv_generator.schemas import (
    CvDraft,
    CvDraftRequest,
    CvDraftReviewEnvelope,
    CvDraftReviewMetadata,
)

router = APIRouter(prefix="/internal/v1/cv", tags=["cv-generation"])


@router.post(
    "/draft",
    response_model=CvDraft,
    dependencies=[Depends(require_scope("cv_generate_scope"))],
)
def generate_draft(
    payload: CvDraftRequest,
    request: Request,
    review_opt_in: str | None = Header(default=None, alias="X-Cv-Review-Metadata"),
    timeout_ms: int | None = Header(
        default=None, alias="X-Cv-Generation-Timeout-Ms", ge=1, le=300000
    ),
) -> CvDraft | JSONResponse:
    agent = cast(CvGenerationAgent, request.app.state.cv_generation_agent)
    include_review = review_opt_in == "true"
    timeout_seconds = timeout_ms / 1000 if timeout_ms is not None else None
    result = agent.generate_with_review(payload, timeout_seconds=timeout_seconds)
    if include_review:
        envelope = CvDraftReviewEnvelope(
            implementation="agent",
            draft=result.draft,
            review_metadata=CvDraftReviewMetadata.model_validate(result.review_metadata),
        )
        return JSONResponse(content=envelope.model_dump(mode="json"))
    return result.draft
