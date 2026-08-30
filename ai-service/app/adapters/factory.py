from __future__ import annotations

from app.adapters.bedrock import BedrockCohereEmbeddingModel, BedrockNovaLiteChatModel
from app.adapters.local_embedding import LocalMultilingualEmbeddingModel
from app.adapters.ollama import OllamaChatModel
from app.adapters.qdrant import QdrantVectorStore
from app.core.settings import ChatProvider, EmbeddingProvider, Settings, VectorStoreProvider
from app.ports import ChatModel, EmbeddingModel, VectorStore


def build_chat_model(settings: Settings) -> ChatModel:
    if settings.chat_model_provider is ChatProvider.FAKE:
        from app.adapters.fakes import FakeChatModel

        return FakeChatModel()
    if settings.chat_model_provider is ChatProvider.OLLAMA:
        return OllamaChatModel(
            settings.ollama_base_url, settings.ollama_model, settings.request_timeout_seconds
        )
    return BedrockNovaLiteChatModel(
        settings.bedrock_region, settings.bedrock_chat_model, settings.request_timeout_seconds
    )


def build_embedding_model(settings: Settings) -> EmbeddingModel:
    if settings.embedding_provider is EmbeddingProvider.FAKE:
        from app.adapters.fakes import FakeEmbeddingModel

        return FakeEmbeddingModel(dimensions=settings.fake_embedding_dimensions)
    if settings.embedding_provider is EmbeddingProvider.SENTENCE_TRANSFORMERS:
        return LocalMultilingualEmbeddingModel(
            settings.local_embedding_model,
            settings.local_embedding_dimensions,
            settings.local_embedding_device,
        )
    return BedrockCohereEmbeddingModel(
        settings.bedrock_region,
        settings.bedrock_embedding_model,
        settings.bedrock_embedding_dimensions,
    )


def build_vector_store(settings: Settings) -> VectorStore:
    representation = settings.representation
    if settings.vector_store_provider is VectorStoreProvider.FAKE:
        from app.adapters.fakes import InMemoryVectorStore

        return InMemoryVectorStore(
            collection_name=representation.physical_collection,
            dimensions=representation.dimensions,
            embedding_model=representation.model,
            embedding_provider=representation.provider,
            collection_version=representation.collection_version,
        )
    return QdrantVectorStore(
        url=settings.qdrant_url,
        collection_name=representation.physical_collection,
        alias_name=representation.alias,
        api_key=settings.qdrant_api_key.get_secret_value() if settings.qdrant_api_key else None,
        timeout_seconds=settings.qdrant_timeout_seconds,
        dimensions=representation.dimensions,
        embedding_model=representation.model,
        embedding_provider=representation.provider,
        auto_initialize=settings.qdrant_auto_initialize,
        collection_version=representation.collection_version,
        allow_legacy_metadata=settings.app_env.value == "local",
    )
