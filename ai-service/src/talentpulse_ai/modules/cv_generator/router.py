from __future__ import annotations

from typing import cast

from fastapi import APIRouter, Depends, Header, Request
from fastapi.responses import JSONResponse

from talentpulse_ai.agent_foundation.selector import CapabilityImplementationSelector
from talentpulse_ai.core.security import require_scope
from talentpulse_ai.modules.cv_generator.agent import (
    CV_GENERATION_CAPABILITY_ID,
    CvGenerationAgent,
)
from talentpulse_ai.modules.cv_generator.schemas import (
    CvDraft,
    CvDraftRequest,
    CvDraftReviewEnvelope,
    CvDraftReviewMetadata,
)
from talentpulse_ai.modules.cv_generator.service import CvDraftGenerationService

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
    service = cast(CvDraftGenerationService, request.app.state.cv_draft_service)
    agent = cast(CvGenerationAgent, request.app.state.cv_generation_agent)
    selector = cast(CapabilityImplementationSelector, request.app.state.capability_selector)
    selected = selector.select(CV_GENERATION_CAPABILITY_ID, legacy=service, agent=agent)
    include_review = review_opt_in == "true"
    timeout_seconds = timeout_ms / 1000 if timeout_ms is not None else None

    if selected is agent:
        result = agent.generate_with_review(payload, timeout_seconds=timeout_seconds)
    elif include_review or timeout_seconds is not None:
        result = service.generate_with_review(payload, timeout_seconds=timeout_seconds)
    else:
        result = None
    if include_review:
        assert result is not None
        envelope = CvDraftReviewEnvelope(
            implementation=("agent" if selected is agent else "legacy"),
            draft=result.draft,
            review_metadata=CvDraftReviewMetadata.model_validate(result.review_metadata),
        )
        return JSONResponse(content=envelope.model_dump(mode="json"))
    if selected is agent or timeout_seconds is not None:
        assert result is not None
        return result.draft
    return service.generate(payload)
