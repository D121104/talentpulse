from __future__ import annotations

import logging
from typing import Any, cast

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.adapters import build_chat_model, build_embedding_model, build_vector_store
from app.application.index_job_service import IndexJobService
from app.core.errors import ServiceError, error_response
from app.core.logging import RequestIdMiddleware, configure_logging
from app.core.settings import EmbeddingProvider, Settings, get_settings
from app.ports import VectorPointMetadata, VectorStore
from app.schemas import (
    IndexJobDeleteRequest,
    IndexJobResponse,
    IndexJobUpsertRequest,
    IndexMetadataScanRequest,
    IndexMetadataScanResponse,
    IndexPointMetadata,
    RagGenerateRequest,
    RagRetrieveRequest,
)
from app.security.dependencies import (
    require_generate_auth,
    require_index_auth,
    require_retrieve_auth,
)
from app.security.service_auth import load_public_key

logger = logging.getLogger("ai-service")


def _to_index_point_metadata(point: VectorPointMetadata) -> IndexPointMetadata:
    return IndexPointMetadata(
        point_id=point.point_id,
        job_id=point.job_id,
        company_id=point.company_id,
        source_version=point.source_version,
        content_hash=point.content_hash,
        metadata_hash=point.metadata_hash,
        embedding_provider=point.embedding_provider,
        embedding_model_version=point.embedding_model_version,
        embedding_dimensions=point.embedding_dimensions,
        normalization_version=point.normalization_version,
        chunking_version=point.chunking_version,
        index_schema_version=point.index_schema_version,
        collection_name=point.collection_name,
        collection_version=point.collection_version,
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    active_settings = settings or get_settings()
    configure_logging(active_settings.log_level)
    app = FastAPI(title=active_settings.app_name, version="0.1.0")
    app.add_middleware(RequestIdMiddleware)
    app.state.settings = active_settings
    app.state.chat_model = build_chat_model(active_settings)
    app.state.embedding_model = build_embedding_model(active_settings)
    app.state.vector_store = build_vector_store(active_settings)
    app.state.index_job_service = IndexJobService(
        app.state.embedding_model,
        app.state.vector_store,
    )

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
        embedding_model = request.app.state.embedding_model
        if settings.embedding_provider is EmbeddingProvider.BEDROCK_COHERE:
            provider_access = (
                "verified" if getattr(embedding_model, "access_verified", False) else "unverified"
            )
        else:
            provider_access = "not_required"
        checks = {
            "config": "ok",
            "qdrant": "ok" if qdrant_ready else "unavailable",
            "serviceAuth": "ok" if auth_ready else "misconfigured",
            "providerAccess": provider_access,
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
        response_model=IndexJobResponse,
    )
    async def index_upsert(
        payload: IndexJobUpsertRequest,
        http_request: Request,
    ) -> IndexJobResponse:
        index_job_service = cast(IndexJobService, http_request.app.state.index_job_service)
        return await index_job_service.upsert(payload, request_id=http_request.state.request_id)

    @app.post(
        "/internal/v1/index/jobs/delete",
        dependencies=[Depends(require_index_auth)],
        response_model=IndexJobResponse,
    )
    async def index_delete(
        payload: IndexJobDeleteRequest,
        http_request: Request,
    ) -> IndexJobResponse:
        index_job_service = cast(IndexJobService, http_request.app.state.index_job_service)
        return await index_job_service.delete(payload, request_id=http_request.state.request_id)

    @app.post(
        "/internal/v1/index/points/scan",
        dependencies=[Depends(require_index_auth)],
        response_model=IndexMetadataScanResponse,
    )
    async def index_points_scan(
        payload: IndexMetadataScanRequest,
        http_request: Request,
    ) -> IndexMetadataScanResponse:
        try:
            vector_store = cast(VectorStore, http_request.app.state.vector_store)
            page = await vector_store.scan_metadata(payload.cursor, payload.limit)
            response = IndexMetadataScanResponse(
                points=[_to_index_point_metadata(point) for point in page.points],
                next_cursor=page.next_cursor,
                request_id=http_request.state.request_id,
            )
            return response
        except ValueError as exc:
            raise ServiceError(
                "AI_INVALID_INDEX_METADATA", "Vector index metadata is invalid", 502
            ) from exc

    return app


app = create_app()
