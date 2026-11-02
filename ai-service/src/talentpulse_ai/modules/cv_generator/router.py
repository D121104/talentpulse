from __future__ import annotations

from typing import cast

from fastapi import APIRouter, Depends, Request

from talentpulse_ai.core.security import require_scope
from talentpulse_ai.modules.cv_generator.schemas import CvDraft, CvDraftRequest
from talentpulse_ai.modules.cv_generator.service import CvDraftGenerationService

router = APIRouter(prefix="/internal/v1/cv", tags=["cv-generation"])


@router.post(
    "/draft",
    response_model=CvDraft,
    dependencies=[Depends(require_scope("cv_generate_scope"))],
)
def generate_draft(payload: CvDraftRequest, request: Request) -> CvDraft:
    service = cast(CvDraftGenerationService, request.app.state.cv_draft_service)
    return service.generate(payload)
