from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlparse

import boto3  # type: ignore[import-untyped]
from qdrant_client import QdrantClient

from app.core.config import Settings
from app.domain.rag import EmbeddingProvider, GenerationProvider, VectorRetriever
from app.infrastructure.rag_providers import (
    BedrockNovaGenerationAdapter,
    CohereEmbeddingAdapter,
    OllamaEmbeddingAdapter,
    OllamaGenerationAdapter,
    QdrantVectorRetriever,
)


@dataclass(frozen=True)
class ProviderBundle:
    embedding: EmbeddingProvider
    retriever: VectorRetriever
    generation: GenerationProvider


def _required(settings: Settings, field: str, label: str) -> str:
    value = getattr(settings, field)
    if not isinstance(value, str) or not value.strip():
        raise RuntimeError(
            "Cohere embedding, Qdrant, and Bedrock provider configuration is invalid: "
            f"{label} is required."
        )
    return value.strip()


def _validate_http_url(value: str, label: str) -> None:
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise RuntimeError(f"{label} must be a valid HTTP(S) URL.")


def create_provider_bundle(
    settings: Settings,
    *,
    bedrock_client: object | None = None,
    qdrant_client: object | None = None,
) -> ProviderBundle:
    """Construct configured adapters without making provider calls during startup."""
    local = settings.environment.casefold() in {"local", "development", "test"}
    providers = (
        settings.embedding_provider,
        settings.vector_store_provider,
        settings.generation_provider,
    )
    if "ollama" in providers and not local:
        raise RuntimeError(
            "Ollama providers are only allowed in local/development/test environments."
        )

    if providers == ("ollama", "qdrant", "ollama"):
        ollama_url = _required(settings, "ollama_url", "Ollama URL")
        embedding_model = _required(settings, "ollama_embedding_model", "Ollama embedding model")
        generation_model = _required(settings, "ollama_generation_model", "Ollama generation model")
        qdrant_url = _required(settings, "qdrant_url", "Qdrant URL")
        collection = _required(settings, "qdrant_collection", "Qdrant collection")
        alias = _required(settings, "qdrant_alias", "Qdrant alias")
        index_version = _required(settings, "qdrant_index_version", "Qdrant index version")
        _validate_http_url(ollama_url, "Ollama URL")
        _validate_http_url(qdrant_url, "Qdrant URL")
        active_qdrant = (
            qdrant_client
            if qdrant_client is not None
            else QdrantClient(
                url=qdrant_url,
                api_key=settings.qdrant_api_key,
                timeout=30,
                check_compatibility=False,
            )
        )
        return ProviderBundle(
            embedding=OllamaEmbeddingAdapter(
                ollama_url,
                embedding_model,
                settings.ollama_embedding_dimensions,
                settings.ollama_timeout_seconds,
            ),
            retriever=QdrantVectorRetriever(
                active_qdrant,
                collection,
                collection_alias=alias,
                index_version=index_version,
                dimensions=settings.ollama_embedding_dimensions,
            ),
            generation=OllamaGenerationAdapter(
                ollama_url, generation_model, settings.ollama_timeout_seconds
            ),
        )

    if providers != ("cohere", "qdrant", "bedrock"):
        raise RuntimeError("Provider factory requires an explicit supported provider tuple.")

    model = _required(settings, "cohere_model", "Cohere embedding model")
    region = _required(settings, "bedrock_region", "Bedrock region")
    bedrock_model = _required(settings, "bedrock_model", "Bedrock model")
    qdrant_url = _required(settings, "qdrant_url", "Qdrant URL")
    collection = _required(settings, "qdrant_collection", "Qdrant collection")
    alias = _required(settings, "qdrant_alias", "Qdrant alias")
    index_version = _required(settings, "qdrant_index_version", "Qdrant index version")
    if not qdrant_url.startswith("https://"):
        raise RuntimeError("Qdrant URL must use HTTPS for the configured cloud provider.")

    active_bedrock = (
        bedrock_client
        if bedrock_client is not None
        else boto3.client("bedrock-runtime", region_name=region)
    )
    active_qdrant = (
        qdrant_client
        if qdrant_client is not None
        else QdrantClient(
            url=qdrant_url,
            api_key=settings.qdrant_api_key,
            timeout=30,
            check_compatibility=False,
        )
    )
    return ProviderBundle(
        embedding=CohereEmbeddingAdapter(active_bedrock, model, settings.cohere_dimensions),
        retriever=QdrantVectorRetriever(
            active_qdrant,
            collection,
            collection_alias=alias,
            index_version=index_version,
            dimensions=settings.cohere_dimensions,
        ),
        generation=BedrockNovaGenerationAdapter(active_bedrock, bedrock_model),
    )
