from __future__ import annotations

from typing import cast
from urllib.parse import urlparse

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api.indexing_routes import router as indexing_router
from app.api.rag_routes import router as rag_router
from app.api.routes import router
from app.application.generation import DeterministicGenerationProvider, GenerationService
from app.application.indexing import JobIndexingService
from app.application.retrieval import RetrievalService
from app.core.config import Settings, get_settings
from app.core.errors import ServiceError
from app.domain.indexing import DocumentEmbeddingProvider, JobVectorWriter
from app.domain.matching import EmbeddingSemanticScorer, MatchService
from app.domain.rag import EmbeddingProvider, GenerationProvider, VectorRetriever
from app.infrastructure.provider_factory import create_provider_bundle
from app.infrastructure.rag_providers import (
    DeterministicEmbeddingProvider,
    InMemoryVectorRetriever,
)


def _local_environment(settings: Settings) -> bool:
    return settings.environment.casefold() in {"local", "development", "test"}


def _validate_non_local_auth(settings: Settings) -> None:
    if _local_environment(settings):
        return
    asymmetric_algorithms = {
        "RS256",
        "RS384",
        "RS512",
        "PS256",
        "PS384",
        "PS512",
        "ES256",
        "ES384",
        "ES512",
    }
    if (
        not settings.auth_required
        or not settings.jwt_public_key
        or settings.jwt_secret
        or not settings.jwt_issuer
        or not settings.jwt_audience
        or not settings.jwt_subject
        or not settings.jwt_algorithms
        or any(algorithm not in asymmetric_algorithms for algorithm in settings.jwt_algorithms)
    ):
        raise RuntimeError(
            "Non-local environments require asymmetric JWT configuration with issuer, audience, "
            "subject, and an asymmetric algorithm."
        )


def _provider_has_methods(provider: object, *methods: str) -> bool:
    return all(callable(getattr(provider, method, None)) for method in methods)


def _readiness_failure(settings: Settings, application: FastAPI) -> str | None:
    """Validate local wiring and configuration without contacting external providers."""
    embedding = getattr(application.state, "embedding_provider", None)
    vector = getattr(application.state, "vector_provider", None)
    generation = getattr(application.state, "generation_provider", None)
    if not _provider_has_methods(embedding, "embed_query", "embed_document"):
        return "embedding_provider"
    if not _provider_has_methods(vector, "search", "upsert_point", "delete_point"):
        return "vector_provider"
    if not _provider_has_methods(generation, "generate"):
        return "generation_provider"

    embedding_dimensions = getattr(embedding, "dimensions", None)
    vector_dimensions = getattr(vector, "dimensions", None)
    if not isinstance(embedding_dimensions, int) or embedding_dimensions != vector_dimensions:
        return "provider_dimensions"

    if _local_environment(settings):
        return None

    try:
        _validate_non_local_auth(settings)
    except Exception:
        return "service_auth"

    parsed_url = urlparse(settings.qdrant_url or "")
    if parsed_url.scheme != "https" or not parsed_url.hostname:
        return "qdrant_url"
    if not all(
        isinstance(value, str) and value.strip()
        for value in (
            settings.cohere_model,
            settings.bedrock_region,
            settings.bedrock_model,
            settings.qdrant_collection,
            settings.qdrant_alias,
            settings.qdrant_index_version,
        )
    ):
        return "provider_configuration"
    if getattr(embedding, "provider_name", None) != "cohere":
        return "embedding_provider"
    if getattr(embedding, "model_name", None) != settings.cohere_model:
        return "embedding_model"
    if embedding_dimensions != settings.cohere_dimensions:
        return "provider_dimensions"
    if getattr(vector, "provider_name", None) != "qdrant":
        return "vector_provider"
    if getattr(vector, "collection_name", None) != settings.qdrant_collection:
        return "qdrant_collection"
    if getattr(vector, "collection_alias", None) != settings.qdrant_alias:
        return "qdrant_alias"
    if getattr(vector, "index_version", None) != settings.qdrant_index_version:
        return "qdrant_index_version"
    return None


def _build_services(
    settings: Settings,
    embedding_provider: EmbeddingProvider | None,
    vector_retriever: VectorRetriever | None,
    generation_provider: GenerationProvider | None,
) -> tuple[RetrievalService, GenerationService, EmbeddingProvider, VectorRetriever]:
    """Build selected providers without silently replacing configured production dependencies."""
    local = _local_environment(settings)
    if not local and settings.embedding_provider != "cohere":
        raise RuntimeError("Production requires the Cohere embedding provider.")
    if not local and settings.vector_store_provider != "qdrant":
        raise RuntimeError("Production requires the Qdrant vector provider.")
    if not local and settings.generation_provider != "bedrock":
        raise RuntimeError("Production requires the Bedrock generation provider.")

    cloud_bundle = None
    if (
        (embedding_provider is None and settings.embedding_provider == "cohere")
        or (vector_retriever is None and settings.vector_store_provider == "qdrant")
        or (generation_provider is None and settings.generation_provider == "bedrock")
    ):
        cloud_bundle = create_provider_bundle(settings)

    if embedding_provider is None:
        if settings.embedding_provider == "cohere":
            assert cloud_bundle is not None
            embedding_provider = cloud_bundle.embedding
        else:
            if not local:
                raise RuntimeError(
                    "Deterministic embeddings are only allowed in local/development/test "
                    "environments."
                )
            embedding_provider = DeterministicEmbeddingProvider(settings.cohere_dimensions)

    if vector_retriever is None:
        if settings.vector_store_provider == "qdrant":
            assert cloud_bundle is not None
            vector_retriever = cloud_bundle.retriever
        else:
            if not local:
                raise RuntimeError(
                    "In-memory retrieval is only allowed in local/development/test environments."
                )
            vector_retriever = InMemoryVectorRetriever(dimensions=settings.cohere_dimensions)

    if generation_provider is None:
        if settings.generation_provider == "bedrock":
            assert cloud_bundle is not None
            generation_provider = cloud_bundle.generation
        else:
            if not local:
                raise RuntimeError(
                    "Deterministic generation is only allowed in local/development/test "
                    "environments."
                )
            generation_provider = DeterministicGenerationProvider()

    return (
        RetrievalService(embedding_provider, vector_retriever),
        GenerationService(generation_provider),
        embedding_provider,
        vector_retriever,
    )


def create_app(
    settings: Settings | None = None,
    *,
    embedding_provider: EmbeddingProvider | None = None,
    vector_retriever: VectorRetriever | None = None,
    generation_provider: GenerationProvider | None = None,
    matching_service: MatchService | None = None,
) -> FastAPI:
    active_settings = settings or get_settings()
    if not _local_environment(active_settings) and not active_settings.auth_required:
        raise RuntimeError("Authentication cannot be disabled outside local/development/test.")
    _validate_non_local_auth(active_settings)
    retrieval_service, generation_service, active_embedding, active_vector = _build_services(
        active_settings, embedding_provider, vector_retriever, generation_provider
    )
    application = FastAPI(title="TalentPulse AI Service", version="0.1.0")
    application.state.settings = active_settings
    application.state.retrieval_service = retrieval_service
    application.state.generation_service = generation_service
    application.state.embedding_provider = active_embedding
    application.state.vector_provider = active_vector
    application.state.generation_provider = generation_service.provider
    application.state.matching_service = matching_service or MatchService(
        EmbeddingSemanticScorer(
            active_embedding,
            version=getattr(active_embedding, "model_name", "embedding-semantic-v1"),
        )
    )
    application.state.job_indexing_service = JobIndexingService(
        cast(DocumentEmbeddingProvider, active_embedding),
        cast(JobVectorWriter, active_vector),
    )
    application.include_router(router)
    application.include_router(rag_router)
    application.include_router(indexing_router)

    @application.get("/health/live")
    def health_live() -> dict[str, str]:
        return {"status": "ok"}

    @application.get("/health/ready")
    def health_ready() -> JSONResponse:
        failure = _readiness_failure(active_settings, application)
        if failure is not None:
            return JSONResponse(
                status_code=503,
                content={
                    "status": "not_ready",
                    "code": "not_ready",
                    "message": "Service is not ready.",
                },
            )
        return JSONResponse(status_code=200, content={"status": "ok"})

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
