from __future__ import annotations

import logging
from typing import Any

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.adapters import build_chat_model, build_embedding_model, build_vector_store
from app.core.errors import ServiceError, error_response
from app.core.logging import RequestIdMiddleware, configure_logging
from app.core.settings import Settings, get_settings
from app.schemas import RagGenerateRequest, RagRetrieveRequest
from app.security.dependencies import (
    require_generate_auth,
    require_index_auth,
    require_retrieve_auth,
)
from app.security.service_auth import load_public_key

logger = logging.getLogger("ai-service")


def create_app(settings: Settings | None = None) -> FastAPI:
    active_settings = settings or get_settings()
    configure_logging(active_settings.log_level)
    app = FastAPI(title=active_settings.app_name, version="0.1.0")
    app.add_middleware(RequestIdMiddleware)
    app.state.settings = active_settings
    app.state.chat_model = build_chat_model(active_settings)
    app.state.embedding_model = build_embedding_model(active_settings)
    app.state.vector_store = build_vector_store(active_settings)

    @app.exception_handler(ServiceError)
    async def handle_service_error(request: Request, exc: ServiceError) -> JSONResponse:
        return error_response(request, exc)

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        del exc
        return error_response(
            request, ServiceError("AI_INVALID_REQUEST", "Request validation failed", 422)
        )

    @app.get("/health/live")
    async def live() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/health/ready", response_model=None)
    async def ready(request: Request) -> JSONResponse | dict[str, Any]:
        settings: Settings = request.app.state.settings
        qdrant_ready = await request.app.state.vector_store.health()
        try:
            public_key = load_public_key(
                settings.ai_service_auth_public_key.get_secret_value()
                if settings.ai_service_auth_public_key
                else None,
                settings.ai_service_auth_public_key_file,
            )
            auth_ready = public_key is not None
        except (OSError, ValueError):
            auth_ready = False
        checks = {
            "config": "ok",
            "qdrant": "ok" if qdrant_ready else "unavailable",
            "serviceAuth": "ok" if auth_ready else "misconfigured",
        }
        if not qdrant_ready or not auth_ready:
            return JSONResponse(
                status_code=503,
                content={"status": "not_ready", "checks": checks},
            )
        return {
            "status": "ready",
            "checks": {
                **checks,
                "chatProvider": settings.chat_model_provider.value,
                "embeddingProvider": settings.embedding_provider.value,
            },
        }

    @app.post(
        "/internal/v1/rag/retrieve",
        dependencies=[Depends(require_retrieve_auth)],
        response_model=None,
    )
    async def retrieve(request: RagRetrieveRequest) -> dict[str, Any]:
        del request
        raise ServiceError(
            "AI_FEATURE_NOT_IMPLEMENTED", "RAG retrieval is not available in Phase 1", 501
        )

    @app.post(
        "/internal/v1/rag/generate",
        dependencies=[Depends(require_generate_auth)],
        response_model=None,
    )
    async def generate(request: RagGenerateRequest) -> dict[str, Any]:
        del request
        raise ServiceError(
            "AI_FEATURE_NOT_IMPLEMENTED", "RAG generation is not available in Phase 1", 501
        )

    @app.post(
        "/internal/v1/index/jobs/upsert",
        dependencies=[Depends(require_index_auth)],
        response_model=None,
    )
    async def index_upsert() -> dict[str, str]:
        raise ServiceError(
            "AI_FEATURE_NOT_IMPLEMENTED", "Job indexing is not available in Phase 1", 501
        )

    @app.post(
        "/internal/v1/index/jobs/delete",
        dependencies=[Depends(require_index_auth)],
        response_model=None,
    )
    async def index_delete() -> dict[str, str]:
        raise ServiceError(
            "AI_FEATURE_NOT_IMPLEMENTED", "Job indexing is not available in Phase 1", 501
        )

    return app


app = create_app()
