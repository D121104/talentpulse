from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from urllib.parse import urlparse

import boto3  # type: ignore[import-untyped]
from botocore.config import Config  # type: ignore[import-untyped]
from qdrant_client import QdrantClient

from talentpulse_ai.core.config import Settings
from talentpulse_ai.infrastructure.embeddings.model import (
    CohereEmbeddingAdapter,
    OllamaEmbeddingAdapter,
)
from talentpulse_ai.infrastructure.llm.bedrock import BedrockNovaGenerationAdapter
from talentpulse_ai.infrastructure.llm.gemini import GeminiGenerationAdapter
from talentpulse_ai.infrastructure.llm.ollama import OllamaGenerationAdapter
from talentpulse_ai.infrastructure.vectorstore.qdrant import QdrantVectorRetriever
from talentpulse_ai.modules.rag_chatbot.schemas import (
    EmbeddingProvider,
    GenerationProvider,
    VectorRetriever,
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


def _create_bedrock_agent_client(region: str, timeout: float) -> object:
    if not isfinite(timeout) or timeout <= 0:
        raise ValueError("agent provider timeout must be positive and finite")
    connect_timeout = min(1.0, timeout / 4)
    return boto3.client(
        "bedrock-runtime",
        region_name=region,
        config=Config(
            connect_timeout=connect_timeout,
            read_timeout=timeout - connect_timeout,
            retries={"total_max_attempts": 1},
        ),
    )


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

    if providers in {
        ("ollama", "qdrant", "ollama"),
        ("ollama", "qdrant", "gemini"),
        ("ollama", "qdrant", "bedrock"),
    }:
        ollama_url = _required(settings, "ollama_url", "Ollama URL")
        embedding_model = _required(settings, "ollama_embedding_model", "Ollama embedding model")
        generation_model = _required(settings, "ollama_generation_model", "Ollama generation model")
        gemini_api_key = ""
        bedrock_region = ""
        bedrock_model = ""
        if settings.generation_provider == "gemini":
            if settings.gemini_api_key is None:
                raise RuntimeError("Gemini API key is required.")
            gemini_api_key = settings.gemini_api_key.get_secret_value()
        elif settings.generation_provider == "bedrock":
            bedrock_region = _required(settings, "bedrock_region", "Bedrock region")
            bedrock_model = _required(settings, "bedrock_model", "Bedrock model")
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
            generation=(
                OllamaGenerationAdapter(
                    ollama_url, generation_model, settings.ollama_timeout_seconds
                )
                if settings.generation_provider == "ollama"
                else GeminiGenerationAdapter(
                    gemini_api_key,
                    settings.gemini_model,
                    settings.gemini_timeout_seconds,
                )
                if settings.generation_provider == "gemini"
                else BedrockNovaGenerationAdapter(
                    bedrock_client
                    if bedrock_client is not None
                    else boto3.client("bedrock-runtime", region_name=bedrock_region),
                    bedrock_model,
                    agent_client_factory=lambda timeout: _create_bedrock_agent_client(
                        bedrock_region, timeout
                    ),
                )
            ),
        )

    if providers not in {
        ("cohere", "qdrant", "bedrock"),
        ("cohere", "qdrant", "gemini"),
    }:
        raise RuntimeError("Provider factory requires an explicit supported provider tuple.")

    model = _required(settings, "cohere_model", "Cohere embedding model")
    region = _required(settings, "bedrock_region", "Bedrock region")
    generation = settings.generation_provider
    gemini_api_key = ""
    if generation == "bedrock":
        bedrock_model = _required(settings, "bedrock_model", "Bedrock model")
    else:
        if settings.gemini_api_key is None:
            raise RuntimeError("Gemini API key is required.")
        gemini_api_key = settings.gemini_api_key.get_secret_value()
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
        generation=(
            BedrockNovaGenerationAdapter(
                active_bedrock,
                bedrock_model,
                agent_client_factory=lambda timeout: _create_bedrock_agent_client(region, timeout),
            )
            if generation == "bedrock"
            else GeminiGenerationAdapter(
                gemini_api_key,
                settings.gemini_model,
                settings.gemini_timeout_seconds,
            )
        ),
    )
