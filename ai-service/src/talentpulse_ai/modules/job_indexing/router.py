from __future__ import annotations

from typing import cast

from fastapi import APIRouter, Depends, Request

from talentpulse_ai.core.security import require_scope
from talentpulse_ai.modules.job_indexing.schemas import (
    IndexJobDeleteRequest,
    IndexJobResponse,
    IndexJobUpsertRequest,
)
from talentpulse_ai.modules.rag_chatbot.ingestion.indexer import JobIndexingService

router = APIRouter(prefix="/internal/v1/index/jobs", tags=["indexing"])


@router.post(
    "/upsert",
    response_model=IndexJobResponse,
    dependencies=[Depends(require_scope("job_index_scope"))],
)
def upsert(payload: IndexJobUpsertRequest, request: Request) -> IndexJobResponse:
    service = cast(JobIndexingService, request.app.state.job_indexing_service)
    return service.upsert(payload)


@router.post(
    "/delete",
    response_model=IndexJobResponse,
    dependencies=[Depends(require_scope("job_index_scope"))],
)
def delete(payload: IndexJobDeleteRequest, request: Request) -> IndexJobResponse:
    service = cast(JobIndexingService, request.app.state.job_indexing_service)
    return service.delete(payload)
