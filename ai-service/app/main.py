from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api.rag_routes import router as rag_router
from app.api.routes import router
from app.application.generation import DeterministicGenerationProvider, GenerationService
from app.application.retrieval import RetrievalService
from app.core.config import Settings, get_settings
from app.core.errors import ServiceError
from app.domain.rag import EmbeddingProvider, GenerationProvider, VectorRetriever
from app.infrastructure.rag_providers import (
    DeterministicEmbeddingProvider,
    InMemoryVectorRetriever,
)


def _local_environment(settings: Settings) -> bool:
    return settings.environment.casefold() in {"local", "development", "test"}


def _build_services(
    settings: Settings,
    embedding_provider: EmbeddingProvider | None,
    vector_retriever: VectorRetriever | None,
    generation_provider: GenerationProvider | None,
) -> tuple[RetrievalService, GenerationService]:
    """Build selected providers without silently replacing configured production dependencies."""
    local = _local_environment(settings)
    if not local and settings.embedding_provider != "cohere":
        raise RuntimeError("Production requires the Cohere embedding provider.")
    if not local and settings.vector_store_provider != "qdrant":
        raise RuntimeError("Production requires the Qdrant vector provider.")
    if not local and settings.generation_provider != "bedrock":
        raise RuntimeError("Production requires the Bedrock generation provider.")

    if embedding_provider is None:
        if settings.embedding_provider == "cohere":
            raise RuntimeError(
                "Configured Cohere embedding requires an injected Cohere adapter client."
            )
        if not local:
            raise RuntimeError(
                "Deterministic embeddings are only allowed in local/development/test environments."
            )
        embedding_provider = DeterministicEmbeddingProvider(settings.cohere_dimensions)

    if vector_retriever is None:
        if settings.vector_store_provider == "qdrant":
            raise RuntimeError("Configured Qdrant requires an injected vector retriever adapter.")
        if not local:
            raise RuntimeError(
                "In-memory retrieval is only allowed in local/development/test environments."
            )
        vector_retriever = InMemoryVectorRetriever()

    if generation_provider is None:
        if settings.generation_provider == "bedrock":
            raise RuntimeError("Configured Bedrock generation requires an injected chat adapter.")
        if not local:
            raise RuntimeError(
                "Deterministic generation is only allowed in local/development/test environments."
            )
        generation_provider = DeterministicGenerationProvider()

    return (
        RetrievalService(embedding_provider, vector_retriever),
        GenerationService(generation_provider),
    )


def create_app(
    settings: Settings | None = None,
    *,
    embedding_provider: EmbeddingProvider | None = None,
    vector_retriever: VectorRetriever | None = None,
    generation_provider: GenerationProvider | None = None,
) -> FastAPI:
    active_settings = settings or get_settings()
    if not _local_environment(active_settings) and not active_settings.auth_required:
        raise RuntimeError("Authentication cannot be disabled outside local/development/test.")
    retrieval_service, generation_service = _build_services(
        active_settings, embedding_provider, vector_retriever, generation_provider
    )
    application = FastAPI(title="TalentPulse AI Service", version="0.1.0")
    application.state.settings = active_settings
    application.state.retrieval_service = retrieval_service
    application.state.generation_service = generation_service
    application.include_router(router)
    application.include_router(rag_router)

    @application.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @application.exception_handler(ServiceError)
    async def service_error_handler(request: Request, exc: ServiceError) -> JSONResponse:
        del request
        return JSONResponse(
            status_code=exc.status_code, content={"code": exc.code, "message": exc.message}
        )

    @application.exception_handler(RequestValidationError)
    async def validation_error_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        del request, exc
        return JSONResponse(
            status_code=422,
            content={"code": "invalid_request", "message": "Request failed schema validation."},
        )

    return application


app = create_app()
