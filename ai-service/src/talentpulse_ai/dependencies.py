from __future__ import annotations

from talentpulse_ai.core.config import Settings
from talentpulse_ai.infrastructure.embeddings.model import DeterministicEmbeddingProvider
from talentpulse_ai.infrastructure.llm.deterministic import DeterministicGenerationProvider
from talentpulse_ai.infrastructure.provider_factory import create_provider_bundle
from talentpulse_ai.infrastructure.vectorstore.memory import InMemoryVectorRetriever
from talentpulse_ai.modules.rag_chatbot.generation.generator import GenerationService
from talentpulse_ai.modules.rag_chatbot.schemas import (
    EmbeddingProvider,
    GenerationProvider,
    VectorRetriever,
)
from talentpulse_ai.modules.rag_chatbot.service import RetrievalService


def _local_environment(settings: Settings) -> bool:
    return settings.environment.casefold() in {"local", "development", "test"}


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

    provider_bundle = None
    if (
        (embedding_provider is None and settings.embedding_provider == "cohere")
        or (embedding_provider is None and settings.embedding_provider == "ollama")
        or (vector_retriever is None and settings.vector_store_provider == "qdrant")
        or (generation_provider is None and settings.generation_provider == "bedrock")
        or (generation_provider is None and settings.generation_provider == "ollama")
    ):
        provider_bundle = create_provider_bundle(settings)

    if embedding_provider is None:
        if settings.embedding_provider in {"cohere", "ollama"}:
            assert provider_bundle is not None
            embedding_provider = provider_bundle.embedding
        else:
            if not local:
                raise RuntimeError(
                    "Deterministic embeddings are only allowed in local/development/test "
                    "environments."
                )
            embedding_provider = DeterministicEmbeddingProvider(settings.cohere_dimensions)

    if vector_retriever is None:
        if settings.vector_store_provider == "qdrant":
            assert provider_bundle is not None
            vector_retriever = provider_bundle.retriever
        else:
            if not local:
                raise RuntimeError(
                    "In-memory retrieval is only allowed in local/development/test environments."
                )
            vector_retriever = InMemoryVectorRetriever(dimensions=settings.cohere_dimensions)

    if generation_provider is None:
        if settings.generation_provider in {"bedrock", "ollama"}:
            assert provider_bundle is not None
            generation_provider = provider_bundle.generation
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
