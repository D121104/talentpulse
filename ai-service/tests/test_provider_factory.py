from __future__ import annotations

import json

import pytest
from app.core.config import Settings
from app.infrastructure.provider_factory import create_provider_bundle
from app.infrastructure.rag_providers import (
    BedrockNovaGenerationAdapter,
    CohereEmbeddingAdapter,
    OllamaEmbeddingAdapter,
    OllamaGenerationAdapter,
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


class FakeOllamaResponse:
    def __init__(self, body: object) -> None:
        self._body = json.dumps(body).encode()

    def __enter__(self) -> FakeOllamaResponse:
        return self

    def __exit__(self, *args: object) -> None:
        del args

    def read(self, limit: int = -1) -> bytes:
        return self._body[:limit] if limit >= 0 else self._body


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


def local_ollama_settings() -> Settings:
    return Settings(
        environment="local",
        embedding_provider="ollama",
        vector_store_provider="qdrant",
        generation_provider="ollama",
        ollama_url="http://127.0.0.1:11435",
        ollama_embedding_model="embeddinggemma:300m",
        ollama_embedding_dimensions=768,
        ollama_generation_model="qwen2.5:3b",
        ollama_timeout_seconds=2.5,
        qdrant_url="http://127.0.0.1:6333",
        qdrant_collection="jobs_ollama_local",
        qdrant_alias="jobs_ollama_current",
        qdrant_index_version="local-ollama-v1",
    )


def test_settings_accept_ollama_and_keep_deterministic_defaults() -> None:
    defaults = Settings()
    local = local_ollama_settings()

    assert defaults.embedding_provider == "deterministic"
    assert defaults.vector_store_provider == "memory"
    assert defaults.generation_provider == "deterministic"
    assert local.ollama_embedding_dimensions == 768
    assert local.ollama_timeout_seconds == 2.5


def test_local_factory_builds_ollama_qdrant_tuple_without_provider_calls() -> None:
    qdrant = FakeQdrant()

    bundle = create_provider_bundle(local_ollama_settings(), qdrant_client=qdrant)

    assert isinstance(bundle.embedding, OllamaEmbeddingAdapter)
    assert isinstance(bundle.retriever, QdrantVectorRetriever)
    assert isinstance(bundle.generation, OllamaGenerationAdapter)
    assert bundle.embedding.provider_name == "ollama"
    assert bundle.embedding.model_name == "embeddinggemma:300m"
    assert bundle.embedding.dimensions == 768
    assert bundle.retriever.dimensions == 768
    assert qdrant.calls == []


def test_factory_rejects_ollama_outside_local_environments() -> None:
    settings = local_ollama_settings()
    settings.environment = "production"

    with pytest.raises(RuntimeError, match="Ollama providers are only allowed"):
        create_provider_bundle(settings, qdrant_client=FakeQdrant())


def test_ollama_adapters_use_bounded_native_json_requests(monkeypatch) -> None:
    requests: list[tuple[str, float, dict[str, object]]] = []

    def fake_urlopen(request: object, timeout: float) -> FakeOllamaResponse:
        url = request.full_url
        payload = json.loads(request.data.decode())
        requests.append((url, timeout, payload))
        if url.endswith("/api/embed"):
            return FakeOllamaResponse({"embeddings": [[0.1, 0.2]]})
        return FakeOllamaResponse(
            {
                "response": json.dumps(
                    {
                        "answer_blocks": [],
                        "claims": [],
                        "citation_keys": [],
                        "referenced_job_ids": [],
                    }
                )
            }
        )

    monkeypatch.setattr("app.infrastructure.rag_providers.urlopen", fake_urlopen)
    embedding = OllamaEmbeddingAdapter("http://ollama", "embed-test", 2, 3.0)
    generation = OllamaGenerationAdapter("http://ollama", "generate-test", 3.0)

    assert embedding.embed_query("query") == [0.1, 0.2]
    assert generation.generate("prompt") == {
        "answer_blocks": [],
        "claims": [],
        "citation_keys": [],
        "referenced_job_ids": [],
    }
    assert requests[0][0] == "http://ollama/api/embed"
    assert requests[0][1] == 3.0
    assert requests[0][2] == {
        "model": "embed-test",
        "input": ["query"],
        "dimensions": 2,
        "truncate": True,
    }
    assert requests[1][2]["stream"] is False
    assert requests[1][2]["options"] == {"temperature": 0}
    format_schema = requests[1][2]["format"]
    assert isinstance(format_schema, dict)
    assert "maxLength" not in json.dumps(format_schema)
    assert format_schema["properties"]["answer_blocks"]["maxItems"] == 20


def test_ollama_qwen3_generation_disables_thinking(monkeypatch) -> None:
    requests: list[dict[str, object]] = []

    def fake_urlopen(request: object, timeout: float) -> FakeOllamaResponse:
        del timeout
        requests.append(json.loads(request.data.decode()))
        return FakeOllamaResponse(
            {
                "response": json.dumps(
                    {
                        "answer_blocks": [{"kind": "ADVICE", "text": "Synthetic"}],
                        "claims": [],
                        "citation_keys": [],
                        "referenced_job_ids": [],
                    }
                )
            }
        )

    monkeypatch.setattr("app.infrastructure.rag_providers.urlopen", fake_urlopen)

    assert OllamaGenerationAdapter("http://ollama", "qwen3:1.7b", 3.0).generate("prompt")
    assert requests[0]["think"] is False


@pytest.mark.parametrize("body", [{"embeddings": [[0.1]]}, {"embeddings": [[float("nan"), 0.2]]}])
def test_ollama_embedding_adapter_rejects_invalid_vectors(monkeypatch, body) -> None:
    monkeypatch.setattr(
        "app.infrastructure.rag_providers.urlopen",
        lambda request, timeout: FakeOllamaResponse(body),
    )

    with pytest.raises(ProviderFailure, match="embedding provider failed"):
        OllamaEmbeddingAdapter("http://ollama", "embed-test", 2, 3.0).embed_query("query")


def test_ollama_adapters_sanitize_provider_failures(monkeypatch) -> None:
    def broken_urlopen(request: object, timeout: float) -> object:
        del request, timeout
        raise RuntimeError("private provider payload")

    monkeypatch.setattr("app.infrastructure.rag_providers.urlopen", broken_urlopen)

    with pytest.raises(ProviderFailure, match="generation provider failed"):
        OllamaGenerationAdapter("http://ollama", "generate-test", 3.0).generate("prompt")


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
