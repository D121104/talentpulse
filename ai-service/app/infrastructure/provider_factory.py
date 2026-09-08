from __future__ import annotations

from dataclasses import dataclass

import boto3  # type: ignore[import-untyped]
from qdrant_client import QdrantClient

from app.core.config import Settings
from app.domain.rag import EmbeddingProvider, GenerationProvider, VectorRetriever
from app.infrastructure.rag_providers import (
    BedrockNovaGenerationAdapter,
    CohereEmbeddingAdapter,
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


def create_provider_bundle(
    settings: Settings,
    *,
    bedrock_client: object | None = None,
    qdrant_client: object | None = None,
) -> ProviderBundle:
    """Construct cloud adapters without making calls during startup."""
    if settings.embedding_provider != "cohere":
        raise RuntimeError("Provider factory requires the Cohere embedding provider.")
    if settings.vector_store_provider != "qdrant":
        raise RuntimeError("Provider factory requires the Qdrant vector provider.")
    if settings.generation_provider != "bedrock":
        raise RuntimeError("Provider factory requires the Bedrock generation provider.")

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
