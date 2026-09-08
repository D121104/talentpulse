from __future__ import annotations

import json

import pytest
from app.core.config import Settings
from app.infrastructure.provider_factory import create_provider_bundle
from app.infrastructure.rag_providers import (
    BedrockNovaGenerationAdapter,
    CohereEmbeddingAdapter,
    ProviderFailure,
    QdrantVectorRetriever,
)


class FakeBedrock:
    def __init__(self) -> None:
        self.embedding_calls: list[dict[str, object]] = []
        self.converse_calls: list[dict[str, object]] = []

    def invoke_model(self, **kwargs: object) -> object:
        self.embedding_calls.append(kwargs)
        return {"body": FakeBody(json.dumps({"embeddings": [[0.1] * 1024]}))}

    def converse(self, **kwargs: object) -> object:
        self.converse_calls.append(kwargs)
        return {
            "output": {
                "message": {
                    "content": [
                        {
                            "text": (
                                '{"answer_blocks": [], "claims": [], "citation_keys": [], '
                                '"referenced_job_ids": []}'
                            )
                        }
                    ]
                }
            }
        }


class FakeBody:
    def __init__(self, value: str) -> None:
        self.value = value

    def read(self) -> bytes:
        return self.value.encode()


class FakeQdrant:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    def query_points(self, **kwargs: object) -> object:
        self.calls.append(kwargs)
        return {"points": []}


def production_settings() -> Settings:
    return Settings(
        environment="production",
        embedding_provider="cohere",
        vector_store_provider="qdrant",
        generation_provider="bedrock",
        cohere_model="cohere.embed-multilingual-v3",
        cohere_dimensions=1024,
        qdrant_url="https://qdrant.example",
        qdrant_collection="jobs_cohere_multilingual_v3_1024_demo_v1",
        qdrant_alias="jobs_current_demo",
        qdrant_index_version="demo-v1",
        qdrant_api_key="qdrant-secret",
        bedrock_region="ap-southeast-2",
        bedrock_model="amazon.nova-lite-v1:0",
    )


def test_production_factory_builds_explicit_real_provider_adapters() -> None:
    bedrock = FakeBedrock()
    qdrant = FakeQdrant()

    bundle = create_provider_bundle(
        production_settings(), bedrock_client=bedrock, qdrant_client=qdrant
    )

    assert isinstance(bundle.embedding, CohereEmbeddingAdapter)
    assert isinstance(bundle.retriever, QdrantVectorRetriever)
    assert isinstance(bundle.generation, BedrockNovaGenerationAdapter)
    assert bundle.embedding.dimensions == 1024
    assert bundle.retriever.collection_alias == "jobs_current_demo"
    assert bundle.retriever.index_version == "demo-v1"

    assert bundle.embedding.embed_query("hello") == [0.1] * 1024
    assert bedrock.embedding_calls[0]["modelId"] == "cohere.embed-multilingual-v3"
    assert bundle.generation.generate("bounded prompt") == {
        "answer_blocks": [],
        "claims": [],
        "citation_keys": [],
        "referenced_job_ids": [],
    }
    assert bedrock.converse_calls[0]["modelId"] == "amazon.nova-lite-v1:0"

    bundle.retriever.search([0.1] * 1024, {"must": []}, 4)
    assert qdrant.calls[0]["collection_name"] == "jobs_current_demo"
    assert qdrant.calls[0]["limit"] == 4


def test_factory_builds_clients_without_calling_paid_operations() -> None:
    bedrock = FakeBedrock()
    qdrant = FakeQdrant()

    create_provider_bundle(production_settings(), bedrock_client=bedrock, qdrant_client=qdrant)

    assert bedrock.embedding_calls == []
    assert bedrock.converse_calls == []


def test_factory_rejects_missing_qdrant_endpoint_before_client_construction() -> None:
    settings = production_settings()
    settings.qdrant_url = None

    with pytest.raises(RuntimeError, match="Qdrant URL"):
        create_provider_bundle(settings)


def test_production_factory_rejects_incomplete_cloud_configuration() -> None:
    settings = production_settings()
    settings.qdrant_alias = None

    with pytest.raises(RuntimeError, match="Qdrant alias"):
        create_provider_bundle(settings, bedrock_client=FakeBedrock(), qdrant_client=FakeQdrant())


def test_bedrock_embedding_adapter_sanitizes_provider_failures() -> None:
    class Broken:
        def invoke_model(self, **kwargs: object) -> object:
            del kwargs
            raise RuntimeError("private provider payload")

    with pytest.raises(ProviderFailure, match="embedding provider failed"):
        CohereEmbeddingAdapter(Broken(), "cohere.embed-multilingual-v3", dimensions=2).embed_query(
            "text"
        )


def test_bedrock_generation_adapter_sanitizes_provider_failures() -> None:
    class Broken:
        def converse(self, **kwargs: object) -> object:
            del kwargs
            raise RuntimeError("private provider payload")

    with pytest.raises(ProviderFailure, match="generation provider failed"):
        BedrockNovaGenerationAdapter(Broken(), "amazon.nova-lite-v1:0").generate("text")


def test_bedrock_generation_adapter_returns_structured_json() -> None:
    class Client:
        def converse(self, **kwargs: object) -> object:
            assert kwargs["modelId"] == "amazon.nova-lite-v1:0"
            return {
                "output": {
                    "message": {
                        "content": [
                            {
                                "text": (
                                    '{"answer_blocks": [], "claims": [], "citation_keys": [], '
                                    '"referenced_job_ids": []}'
                                )
                            }
                        ]
                    }
                }
            }

    assert BedrockNovaGenerationAdapter(Client(), "amazon.nova-lite-v1:0").generate("text") == {
        "answer_blocks": [],
        "claims": [],
        "citation_keys": [],
        "referenced_job_ids": [],
    }
