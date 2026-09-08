from __future__ import annotations

from typing import cast

from fastapi import APIRouter, Depends, Request

from app.api.auth import require_scope
from app.application.indexing import JobIndexingService
from app.domain.indexing import IndexJobDeleteRequest, IndexJobResponse, IndexJobUpsertRequest

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
