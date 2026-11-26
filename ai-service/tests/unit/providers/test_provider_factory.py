from __future__ import annotations

import json
import logging
from io import BytesIO
from urllib.error import HTTPError

import pytest
from botocore.config import Config
from pydantic import SecretStr, ValidationError

from talentpulse_ai.agent_foundation.model import AgentModelAdapter
from talentpulse_ai.core.config import Settings
from talentpulse_ai.core.exceptions import ProviderFailure
from talentpulse_ai.core.logging import log_ai_provider_failure
from talentpulse_ai.infrastructure.embeddings.model import (
    CohereEmbeddingAdapter,
    OllamaEmbeddingAdapter,
)
from talentpulse_ai.infrastructure.llm.bedrock import BedrockNovaGenerationAdapter
from talentpulse_ai.infrastructure.llm.gemini import GeminiGenerationAdapter
from talentpulse_ai.infrastructure.llm.ollama import OllamaGenerationAdapter
from talentpulse_ai.infrastructure.provider_factory import create_provider_bundle
from talentpulse_ai.infrastructure.vectorstore.qdrant import QdrantVectorRetriever


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
        ollama_embedding_model="qwen3-embedding:4b",
        ollama_embedding_dimensions=2560,
        ollama_generation_model="qwen3:4b",
        ollama_timeout_seconds=2.5,
        qdrant_url="http://127.0.0.1:6333",
        qdrant_collection="jobs_ollama_qwen3_embedding_4b_2560_local_v2",
        qdrant_alias="jobs_current_local_qwen3_embedding_4b_2560",
        qdrant_index_version="local-ollama-qwen3-embedding-4b-2560-v2",
    )


def test_settings_accept_ollama_and_keep_deterministic_defaults() -> None:
    defaults = Settings(_env_file=None)
    local = local_ollama_settings()

    assert defaults.embedding_provider == "deterministic"
    assert defaults.vector_store_provider == "memory"
    assert defaults.generation_provider == "deterministic"
    assert defaults.ollama_embedding_model == "qwen3-embedding:4b"
    assert defaults.ollama_embedding_dimensions == 2560
    assert local.ollama_embedding_dimensions == 2560
    assert local.ollama_timeout_seconds == 2.5


def test_ollama_embedding_defaults_and_overrides_are_preserved(monkeypatch) -> None:
    monkeypatch.delenv("AI_OLLAMA_EMBEDDING_MODEL", raising=False)
    monkeypatch.delenv("AI_OLLAMA_EMBEDDING_DIMENSIONS", raising=False)
    defaults = Settings(_env_file=None)
    assert defaults.ollama_embedding_model == "qwen3-embedding:4b"
    assert defaults.ollama_embedding_dimensions == 2560

    monkeypatch.setenv("AI_OLLAMA_EMBEDDING_MODEL", "qwen3-embedding:0.6b")
    monkeypatch.setenv("AI_OLLAMA_EMBEDDING_DIMENSIONS", "1024")
    overridden = Settings(_env_file=None)
    assert overridden.ollama_embedding_model == "qwen3-embedding:0.6b"
    assert overridden.ollama_embedding_dimensions == 1024


def test_ollama_generation_model_defaults_to_natural_prose_model_and_is_overridable(
    monkeypatch,
) -> None:
    monkeypatch.delenv("AI_OLLAMA_GENERATION_MODEL", raising=False)
    defaults = Settings(_env_file=None)
    assert defaults.ollama_generation_model == "qwen3:4b"

    monkeypatch.setenv("AI_OLLAMA_GENERATION_MODEL", "qwen3:1.7b")
    overridden = Settings(_env_file=None)
    assert overridden.ollama_generation_model == "qwen3:1.7b"


def test_cv_generation_budget_defaults_overrides_and_bounds(monkeypatch) -> None:
    for name in (
        "AI_CV_GENERATION_TOTAL_TIMEOUT_SECONDS",
        "AI_CV_GENERATION_CORE_TIMEOUT_SECONDS",
        "AI_CV_GENERATION_CHUNK_TIMEOUT_SECONDS",
        "AI_CV_GENERATION_REPAIR_TIMEOUT_SECONDS",
    ):
        monkeypatch.delenv(name, raising=False)

    defaults = Settings(_env_file=None)
    assert defaults.cv_generation_total_timeout_seconds == 600.0
    assert defaults.cv_generation_core_timeout_seconds == 120.0
    assert defaults.cv_generation_chunk_timeout_seconds == 45.0
    assert defaults.cv_generation_repair_timeout_seconds == 45.0

    monkeypatch.setenv("AI_CV_GENERATION_TOTAL_TIMEOUT_SECONDS", "480")
    monkeypatch.setenv("AI_CV_GENERATION_CORE_TIMEOUT_SECONDS", "100")
    monkeypatch.setenv("AI_CV_GENERATION_CHUNK_TIMEOUT_SECONDS", "40")
    monkeypatch.setenv("AI_CV_GENERATION_REPAIR_TIMEOUT_SECONDS", "35")
    overridden = Settings(_env_file=None)
    assert overridden.cv_generation_total_timeout_seconds == 480.0
    assert overridden.cv_generation_core_timeout_seconds == 100.0
    assert overridden.cv_generation_chunk_timeout_seconds == 40.0
    assert overridden.cv_generation_repair_timeout_seconds == 35.0

    invalid_values = (
        ("cv_generation_total_timeout_seconds", 0),
        ("cv_generation_total_timeout_seconds", 901),
        ("cv_generation_core_timeout_seconds", 0),
        ("cv_generation_core_timeout_seconds", 121),
        ("cv_generation_chunk_timeout_seconds", 0),
        ("cv_generation_chunk_timeout_seconds", 121),
        ("cv_generation_repair_timeout_seconds", 0),
        ("cv_generation_repair_timeout_seconds", 121),
    )
    for field, value in invalid_values:
        with pytest.raises(ValidationError):
            Settings(_env_file=None, **{field: value})


def test_local_factory_builds_ollama_qdrant_tuple_without_provider_calls() -> None:
    qdrant = FakeQdrant()

    bundle = create_provider_bundle(local_ollama_settings(), qdrant_client=qdrant)

    assert isinstance(bundle.embedding, OllamaEmbeddingAdapter)
    assert isinstance(bundle.retriever, QdrantVectorRetriever)
    assert isinstance(bundle.generation, OllamaGenerationAdapter)
    assert bundle.embedding.provider_name == "ollama"
    assert bundle.embedding.model_name == "qwen3-embedding:4b"
    assert bundle.embedding.dimensions == 2560
    assert bundle.retriever.dimensions == 2560
    assert qdrant.calls == []


def test_local_factory_supports_gemini_generation_with_ollama_embeddings() -> None:
    settings = local_ollama_settings()
    settings.generation_provider = "gemini"
    settings.gemini_api_key = SecretStr("gemini-secret")
    qdrant = FakeQdrant()

    bundle = create_provider_bundle(settings, qdrant_client=qdrant)

    assert isinstance(bundle.embedding, OllamaEmbeddingAdapter)
    assert isinstance(bundle.retriever, QdrantVectorRetriever)
    assert isinstance(bundle.generation, GeminiGenerationAdapter)
    assert bundle.generation.supports_structured_outputs is True
    assert (
        AgentModelAdapter(bundle.generation, direct_output=True).supports_structured_outputs is True
    )
    assert bundle.retriever.dimensions == settings.ollama_embedding_dimensions
    assert qdrant.calls == []


def test_local_factory_supports_bedrock_generation_with_ollama_embeddings() -> None:
    settings = local_ollama_settings()
    settings.generation_provider = "bedrock"
    settings.bedrock_region = "ap-southeast-2"
    settings.bedrock_model = "global.moonshotai.kimi-k3.1"
    bedrock = FakeBedrock()
    qdrant = FakeQdrant()

    bundle = create_provider_bundle(settings, bedrock_client=bedrock, qdrant_client=qdrant)

    assert isinstance(bundle.embedding, OllamaEmbeddingAdapter)
    assert isinstance(bundle.retriever, QdrantVectorRetriever)
    assert isinstance(bundle.generation, BedrockNovaGenerationAdapter)
    assert bundle.generation.model_name == settings.bedrock_model
    assert bundle.generation.supports_structured_outputs is True
    assert bundle.retriever.dimensions == settings.ollama_embedding_dimensions
    assert bedrock.converse_calls == []
    assert qdrant.calls == []


def test_factory_builds_gemini_generation_with_cohere_embedding(monkeypatch) -> None:
    settings = production_settings()
    settings.generation_provider = "gemini"
    settings.gemini_api_key = SecretStr("gemini-secret")
    bedrock = FakeBedrock()
    qdrant = FakeQdrant()

    bundle = create_provider_bundle(settings, bedrock_client=bedrock, qdrant_client=qdrant)

    assert isinstance(bundle.generation, GeminiGenerationAdapter)
    assert isinstance(bundle.embedding, CohereEmbeddingAdapter)
    assert bundle.generation._model == settings.gemini_model
    assert bedrock.converse_calls == []


def test_gemini_adapter_sends_json_request_and_parses_response(monkeypatch) -> None:
    requests: list[tuple[object, float]] = []

    class Response:
        def __enter__(self) -> Response:
            return self

        def __exit__(self, *args: object) -> None:
            del args

        def read(self) -> bytes:
            return json.dumps(
                {"candidates": [{"content": {"parts": [{"text": '{"answer_blocks": []}'}]}}]}
            ).encode()

    def fake_urlopen(request: object, timeout: float) -> Response:
        requests.append((request, timeout))
        return Response()

    monkeypatch.setattr("talentpulse_ai.infrastructure.llm.gemini.urlopen", fake_urlopen)
    provider = GeminiGenerationAdapter("test-key", "gemini-2.5-flash")

    assert provider.generate_with_timeout("prompt", timeout=3.5) == {"answer_blocks": []}
    request, timeout = requests[0]
    assert timeout == 3.5
    assert request.get_header("X-goog-api-key") == "test-key"
    assert json.loads(request.data)["generationConfig"]["responseMimeType"] == "application/json"


def test_gemini_adapter_sends_json_schema_for_structured_generation(monkeypatch) -> None:
    requests: list[object] = []

    class Response:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, *args: object) -> None:
            del args

        def read(self) -> bytes:
            return json.dumps(
                {"candidates": [{"content": {"parts": [{"text": '{"answer_blocks": []}'}]}}]}
            ).encode()

    def fake_urlopen(request: object, timeout: float) -> Response:
        del timeout
        requests.append(request)
        return Response()

    monkeypatch.setattr("talentpulse_ai.infrastructure.llm.gemini.urlopen", fake_urlopen)
    provider = GeminiGenerationAdapter("test-key", "gemini-2.5-flash")
    schema = {
        "type": "object",
        "properties": {"answer_blocks": {"type": "array", "items": {"type": "object"}}},
        "required": ["answer_blocks"],
    }

    provider.generate_structured("prompt", schema, timeout=4.0)

    payload = json.loads(requests[0].data)
    assert payload["generationConfig"]["responseMimeType"] == "application/json"
    assert payload["generationConfig"]["responseJsonSchema"] == schema


def test_gemini_adapter_logs_only_sanitized_structured_request_error(monkeypatch) -> None:
    private = "PRIVATE_CV_CONTENT"
    body = json.dumps(
        {
            "error": {
                "code": 400,
                "status": "INVALID_ARGUMENT",
                "message": (
                    "Invalid responseJsonSchema at generationConfig.responseJsonSchema. "
                    f"Unexpected text {private}"
                ),
            }
        }
    ).encode()

    def failed_urlopen(request: object, timeout: float) -> object:
        del request, timeout
        raise HTTPError("https://example.invalid", 400, "Bad Request", None, BytesIO(body))

    monkeypatch.setattr("talentpulse_ai.infrastructure.llm.gemini.urlopen", failed_urlopen)
    provider = GeminiGenerationAdapter("test-key", "gemini-3.5-flash-lite")

    with pytest.raises(ProviderFailure) as caught:
        provider.generate_structured("prompt", {"type": "object"})

    assert caught.value.details is not None
    assert caught.value.details.provider_code == "INVALID_ARGUMENT"
    assert caught.value.details.provider_message == "response_json_schema_rejected"
    assert private not in repr(caught.value.details)


@pytest.mark.parametrize(
    ("http_status", "provider_status", "provider_message", "safe_message", "category"),
    [
        (
            503,
            "UNAVAILABLE",
            "backend temporarily unavailable PRIVATE_CV",
            "service_unavailable",
            "connectivity",
        ),
        (
            429,
            "RESOURCE_EXHAUSTED",
            "request quota exceeded PRIVATE_CV",
            "rate_limited",
            "rate_limited",
        ),
    ],
)
def test_gemini_adapter_extracts_safe_transient_error_metadata(
    monkeypatch,
    caplog: pytest.LogCaptureFixture,
    http_status: int,
    provider_status: str,
    provider_message: str,
    safe_message: str,
    category: str,
) -> None:
    body = json.dumps(
        {
            "error": {
                "code": http_status,
                "status": provider_status,
                "message": provider_message,
            }
        }
    ).encode()

    def failed_urlopen(request: object, timeout: float) -> object:
        del request, timeout
        raise HTTPError(
            "https://example.invalid",
            http_status,
            "provider failure",
            {"Retry-After": "30"},
            BytesIO(body),
        )

    monkeypatch.setattr("talentpulse_ai.infrastructure.llm.gemini.urlopen", failed_urlopen)
    provider = GeminiGenerationAdapter("test-key", "gemini-3.5-flash-lite")

    with pytest.raises(ProviderFailure) as caught:
        provider.generate_structured("prompt", {"type": "object"})

    assert caught.value.details is not None
    assert caught.value.details.provider_status == http_status
    assert caught.value.details.provider_code == provider_status
    assert caught.value.details.provider_message == safe_message
    assert caught.value.details.category == category
    assert caught.value.details.retry_after_seconds == 30
    assert "PRIVATE_CV" not in repr(caught.value.details)
    with caplog.at_level(logging.WARNING):
        log_ai_provider_failure(
            details=caught.value.details,
            capability="cv_generation",
            operation="agent_model",
            attempt="agent_model",
        )
    log = "\n".join(record.getMessage() for record in caplog.records)
    assert f"provider_code={provider_status}" in log
    assert "retry_after_seconds=30" in log
    assert "PRIVATE_CV" not in log


def test_gemini_adapter_sanitizes_provider_failures(monkeypatch) -> None:
    def failed_urlopen(request: object, timeout: float) -> object:
        del request, timeout
        raise TimeoutError("sensitive provider details")

    monkeypatch.setattr("talentpulse_ai.infrastructure.llm.gemini.urlopen", failed_urlopen)
    provider = GeminiGenerationAdapter("test-key", "gemini-2.5-flash")

    with pytest.raises(ProviderFailure, match="generation provider failed"):
        provider.generate("prompt")


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

    monkeypatch.setattr("talentpulse_ai.infrastructure.llm.client.urlopen", fake_urlopen)
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
    assert "$ref" not in json.dumps(format_schema)
    assert "$defs" not in json.dumps(format_schema)


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

    monkeypatch.setattr("talentpulse_ai.infrastructure.llm.client.urlopen", fake_urlopen)

    assert OllamaGenerationAdapter("http://ollama", "qwen3:1.7b", 3.0).generate("prompt")
    assert requests[0]["think"] is False


def test_qwen_structured_adapter_inlines_schema_refs_and_disables_thinking(monkeypatch) -> None:
    requests: list[dict[str, object]] = []

    def fake_urlopen(request: object, timeout: float) -> FakeOllamaResponse:
        del timeout
        requests.append(json.loads(request.data.decode()))
        return FakeOllamaResponse({"response": '{"answer_blocks": []}'})

    monkeypatch.setattr("talentpulse_ai.infrastructure.llm.client.urlopen", fake_urlopen)
    schema = {
        "$defs": {"Item": {"type": "object", "properties": {"name": {"type": "string"}}}},
        "type": "object",
        "properties": {"item": {"$ref": "#/$defs/Item"}},
    }

    OllamaGenerationAdapter("http://ollama", "qwen3:4b", 3.0).generate_structured("prompt", schema)

    payload_schema = requests[0]["format"]
    assert isinstance(payload_schema, dict)
    assert "$ref" not in json.dumps(payload_schema)
    assert "$defs" not in json.dumps(payload_schema)
    assert payload_schema["properties"]["item"]["properties"]["name"]["type"] == "string"
    assert requests[0]["think"] is False


def test_ollama_cv_call_forwards_timeout_and_num_predict(monkeypatch) -> None:
    requests: list[tuple[float, dict[str, object]]] = []

    def fake_urlopen(request: object, timeout: float) -> FakeOllamaResponse:
        requests.append((timeout, json.loads(request.data.decode())))
        return FakeOllamaResponse({"response": '{"items": []}'})

    monkeypatch.setattr("talentpulse_ai.infrastructure.llm.client.urlopen", fake_urlopen)
    schema = {"type": "object", "properties": {"items": {"type": "array"}}}

    result = OllamaGenerationAdapter("http://ollama", "qwen3:4b", 25.0).generate_structured(
        "cv localization", schema, timeout=45.0, num_predict=256
    )

    assert result == {"items": []}
    assert requests[0][0] == 45.0
    assert requests[0][1]["options"] == {"temperature": 0, "num_predict": 256}
    assert requests[0][1]["think"] is False


@pytest.mark.parametrize("num_predict", [0, 4_097])
def test_ollama_cv_call_rejects_unbounded_num_predict(num_predict: int) -> None:
    with pytest.raises(ValueError, match="num_predict must be between 1 and 4096"):
        OllamaGenerationAdapter("http://ollama", "qwen3:4b", 120.0).generate_structured(
            "cv localization", {"type": "object"}, num_predict=num_predict
        )


@pytest.mark.parametrize("body", [{"embeddings": [[0.1]]}, {"embeddings": [[float("nan"), 0.2]]}])
def test_ollama_embedding_adapter_rejects_invalid_vectors(monkeypatch, body) -> None:
    monkeypatch.setattr(
        "talentpulse_ai.infrastructure.llm.client.urlopen",
        lambda request, timeout: FakeOllamaResponse(body),
    )

    with pytest.raises(ProviderFailure, match="embedding provider failed"):
        OllamaEmbeddingAdapter("http://ollama", "embed-test", 2, 3.0).embed_query("query")


def test_ollama_adapters_sanitize_provider_failures(monkeypatch) -> None:
    def broken_urlopen(request: object, timeout: float) -> object:
        del request, timeout
        raise RuntimeError("private provider payload")

    monkeypatch.setattr("talentpulse_ai.infrastructure.llm.client.urlopen", broken_urlopen)

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


def test_factory_keeps_legacy_bedrock_client_configuration_and_shared_use(monkeypatch) -> None:
    constructions: list[tuple[str, dict[str, object]]] = []
    bedrock = FakeBedrock()

    def fake_client(service_name: str, **kwargs: object) -> FakeBedrock:
        constructions.append((service_name, kwargs))
        return bedrock

    monkeypatch.setattr("talentpulse_ai.infrastructure.provider_factory.boto3.client", fake_client)

    bundle = create_provider_bundle(production_settings(), qdrant_client=FakeQdrant())

    assert constructions == [("bedrock-runtime", {"region_name": "ap-southeast-2"})]
    assert bedrock.embedding_calls == []
    assert bedrock.converse_calls == []

    assert bundle.embedding.embed_query("synthetic query") == [0.1] * 1024
    assert bundle.generation.generate("synthetic legacy prompt") == {
        "answer_blocks": [],
        "claims": [],
        "citation_keys": [],
        "referenced_job_ids": [],
    }
    assert len(bedrock.embedding_calls) == 1
    assert len(bedrock.converse_calls) == 1
    assert len(constructions) == 1


@pytest.mark.parametrize("remaining_timeout", [0.25, 7.5, 24.0])
def test_factory_builds_agent_bedrock_clients_with_remaining_timeout_without_changing_legacy(
    monkeypatch, remaining_timeout: float
) -> None:
    constructions: list[tuple[str, dict[str, object]]] = []
    clients: list[FakeBedrock] = []

    def fake_client(service_name: str, **kwargs: object) -> FakeBedrock:
        constructions.append((service_name, kwargs))
        client = FakeBedrock()
        clients.append(client)
        return client

    monkeypatch.setattr("talentpulse_ai.infrastructure.provider_factory.boto3.client", fake_client)
    bundle = create_provider_bundle(production_settings(), qdrant_client=FakeQdrant())
    legacy = clients[0]
    assert constructions == [("bedrock-runtime", {"region_name": "ap-southeast-2"})]

    generate_with_timeout = getattr(bundle.generation, "generate_with_timeout", None)
    assert callable(generate_with_timeout), "Bedrock agent calls require a timeout-aware method"

    # A later model decision must use its smaller budget, not reuse the first call's timeout.
    for timeout in (remaining_timeout, remaining_timeout / 2):
        result = generate_with_timeout("synthetic agent prompt", timeout=timeout)

        assert result == {
            "answer_blocks": [],
            "claims": [],
            "citation_keys": [],
            "referenced_job_ids": [],
        }
        service_name, options = constructions[-1]
        assert service_name == "bedrock-runtime"
        assert options["region_name"] == "ap-southeast-2"
        config = options["config"]
        assert isinstance(config, Config)
        assert 0 < config.connect_timeout <= timeout
        assert 0 < config.read_timeout <= timeout
        assert config.retries["total_max_attempts"] == 1
        assert clients[-1] is not legacy
        assert clients[-1].embedding_calls == []
        assert len(clients[-1].converse_calls) == 1
        assert clients[-1].converse_calls[0]["modelId"] == "amazon.nova-lite-v1:0"

    assert len(constructions) == 3
    assert legacy.embedding_calls == []
    assert legacy.converse_calls == []
    bundle.generation.generate("synthetic legacy prompt")
    assert len(legacy.converse_calls) == 1
    assert bundle.embedding.embed_query("synthetic query") == [0.1] * 1024
    assert len(legacy.embedding_calls) == 1
    assert len(constructions) == 3
    assert constructions[0] == ("bedrock-runtime", {"region_name": "ap-southeast-2"})


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
