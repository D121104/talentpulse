from __future__ import annotations

from typing import Any, cast
from urllib.parse import urlparse

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from talentpulse_ai.core.config import Settings, get_settings
from talentpulse_ai.core.exceptions import ServiceError
from talentpulse_ai.dependencies import _build_services, _local_environment
from talentpulse_ai.modules.cv_analysis.matching import EmbeddingSemanticScorer, MatchService
from talentpulse_ai.modules.cv_analysis.router import router
from talentpulse_ai.modules.cv_generator.router import router as cv_generation_router
from talentpulse_ai.modules.cv_generator.service import CvDraftGenerationService
from talentpulse_ai.modules.job_indexing.router import router as indexing_router
from talentpulse_ai.modules.job_indexing.schemas import DocumentEmbeddingProvider, JobVectorWriter
from talentpulse_ai.modules.rag_chatbot.ingestion.indexer import JobIndexingService
from talentpulse_ai.modules.rag_chatbot.router import router as rag_router
from talentpulse_ai.modules.rag_chatbot.schemas import (
    EmbeddingProvider,
    GenerationProvider,
    VectorRetriever,
)


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
    application.state.cv_draft_service = CvDraftGenerationService(
        generation_service.provider, active_settings
    )
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
    application.include_router(cv_generation_router)
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

    default_openapi = application.openapi

    def public_openapi() -> dict[str, Any]:
        schema = default_openapi()
        # These public component IDs predate the package migration; model provenance stays real.
        aliases = {
            "talentpulse_ai__modules__cv_analysis__schemas__JobProfile": (
                "app__domain__contracts__JobProfile"
            ),
            "talentpulse_ai__modules__cv_generator__schemas__JobProfile": (
                "app__domain__cv_generation__JobProfile"
            ),
        }
        components = schema.get("components", {}).get("schemas", {})
        for internal, public in aliases.items():
            if internal in components:
                components[public] = components.pop(internal)
        references = {
            f"#/components/schemas/{internal}": f"#/components/schemas/{public}"
            for internal, public in aliases.items()
        }

        def preserve_references(value: object) -> None:
            if isinstance(value, dict):
                reference = value.get("$ref")
                if isinstance(reference, str) and reference in references:
                    value["$ref"] = references[reference]
                for child in value.values():
                    preserve_references(child)
            elif isinstance(value, list):
                for child in value:
                    preserve_references(child)

        preserve_references(schema)
        return schema

    application.openapi = public_openapi  # type: ignore[method-assign]
    return application


app = create_app()
