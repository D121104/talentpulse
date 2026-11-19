from __future__ import annotations

import logging
from typing import cast

from fastapi import APIRouter, Depends, Request

from talentpulse_ai.agent_foundation.selector import CapabilityImplementationSelector
from talentpulse_ai.core.security import require_scope
from talentpulse_ai.modules.rag_chatbot.agent import CareerChatAgent
from talentpulse_ai.modules.rag_chatbot.generation.generator import GenerationService
from talentpulse_ai.modules.rag_chatbot.schemas import (
    RagGenerateRequest,
    RagGenerateResponse,
    RagRetrieveRequest,
    RagRetrieveResponse,
)
from talentpulse_ai.modules.rag_chatbot.service import RetrievalService

router = APIRouter(prefix="/internal/v1/rag", tags=["rag"])
logger = logging.getLogger("uvicorn.error")


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
    selector = cast(CapabilityImplementationSelector, request.app.state.capability_selector)
    service = cast(
        GenerationService | CareerChatAgent,
        selector.select(
            "rag.generate",
            legacy=cast(GenerationService, request.app.state.generation_service),
            agent=cast(CareerChatAgent, request.app.state.agent_generation_service),
        ),
    )
    response = service.generate(payload)
    logger.info(
        "rag_generation_completed request_id=%s trace_id=%s intent=%s source=%s "
        "answer_status=%s degraded=%s fallback_reason=%s",
        response.request_id,
        response.trace_id,
        payload.intent,
        response.source,
        response.answer_status,
        response.degraded,
        response.fallbackReason or "none",
    )
    return response
