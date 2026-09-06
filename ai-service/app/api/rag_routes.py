from __future__ import annotations

from typing import cast

from fastapi import APIRouter, Depends, Request

from app.api.auth import require_scope
from app.application.generation import GenerationService
from app.application.retrieval import RetrievalService
from app.domain.rag import (
    RagGenerateRequest,
    RagGenerateResponse,
    RagRetrieveRequest,
    RagRetrieveResponse,
)

router = APIRouter(prefix="/internal/v1/rag", tags=["rag"])


@router.post(
    "/retrieve",
    response_model=RagRetrieveResponse,
    dependencies=[Depends(require_scope("rag_retrieve_scope"))],
)
def retrieve(payload: RagRetrieveRequest, request: Request) -> RagRetrieveResponse:
    service = cast(RetrievalService, request.app.state.retrieval_service)
    return service.retrieve(payload)


@router.post(
    "/generate",
    response_model=RagGenerateResponse,
    dependencies=[Depends(require_scope("rag_generate_scope"))],
)
def generate(payload: RagGenerateRequest, request: Request) -> RagGenerateResponse:
    service = cast(GenerationService, request.app.state.generation_service)
    return service.generate(payload)
