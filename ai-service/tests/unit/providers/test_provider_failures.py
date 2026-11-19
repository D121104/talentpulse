from __future__ import annotations

import json
from urllib.error import HTTPError

import pytest
from botocore.exceptions import ClientError

from talentpulse_ai.core.exceptions import ProviderFailure
from talentpulse_ai.infrastructure.embeddings.model import (
    CohereEmbeddingAdapter,
    OllamaEmbeddingAdapter,
)
from talentpulse_ai.infrastructure.llm import gemini, ollama
from talentpulse_ai.infrastructure.llm.bedrock import BedrockNovaGenerationAdapter
from talentpulse_ai.infrastructure.llm.gemini import GeminiGenerationAdapter
from talentpulse_ai.infrastructure.llm.ollama import OllamaGenerationAdapter
from talentpulse_ai.infrastructure.vectorstore.qdrant import QdrantVectorRetriever


class _Response:
    status = 200

    def __enter__(self) -> _Response:
        return self

    def __exit__(self, *args: object) -> None:
        del args

    def read(self, limit: int = -1) -> bytes:
        del limit
        return json.dumps(
            {"candidates": [{"content": {"parts": [{"text": '{"ok": true}'}]}}]}
        ).encode()


def _client_error(status: int, code: str = "ProviderRejected") -> ClientError:
    return ClientError(
        {
            "Error": {"Code": code, "Message": "secret provider response body"},
            "ResponseMetadata": {"HTTPStatusCode": status},
        },
        "InvokeModel",
    )


@pytest.mark.parametrize(
    ("status", "code", "category"),
    [
        (401, "Unauthorized", "authentication"),
        (429, "ThrottlingException", "rate_limited"),
        (400, "ValidationException", "invalid_request"),
        (503, "ServiceUnavailable", "provider_rejected"),
    ],
)
def test_bedrock_failure_preserves_only_safe_classification(
    status: int, code: str, category: str
) -> None:
    class Client:
        def converse(self, **kwargs: object) -> object:
            del kwargs
            raise _client_error(status, code)

    adapter = BedrockNovaGenerationAdapter(Client(), "amazon.nova-lite-v1:0")

    with pytest.raises(ProviderFailure, match="generation provider failed") as failure:
        adapter.generate("private prompt")

    assert failure.value.details is not None
    assert failure.value.details.provider == "bedrock"
    assert failure.value.details.category == category
    assert failure.value.details.provider_status == status
    assert failure.value.details.provider_code == code
    assert failure.value.details.model == "amazon.nova-lite-v1:0"
    assert "secret provider response body" not in str(failure.value)


def test_bedrock_timeout_is_classified_without_exception_message() -> None:
    class Client:
        def converse(self, **kwargs: object) -> object:
            del kwargs
            raise TimeoutError("secret provider timeout details")

    adapter = BedrockNovaGenerationAdapter(Client(), "amazon.nova-lite-v1:0")

    with pytest.raises(ProviderFailure) as failure:
        adapter.generate("private prompt")

    assert failure.value.details is not None
    assert failure.value.details.category == "timeout"
    assert failure.value.details.exception_type == "TimeoutError"
    assert "secret provider timeout details" not in str(failure.value)


def test_gemini_http_error_records_status_without_reading_body(monkeypatch) -> None:
    body = b"sensitive provider response"
    error = HTTPError("https://example.invalid", 403, "forbidden", {}, None)
    error.read = lambda *args, **kwargs: pytest.fail("error body must not be read")  # type: ignore[method-assign]
    monkeypatch.setattr(gemini, "urlopen", lambda *args, **kwargs: (_ for _ in ()).throw(error))

    adapter = GeminiGenerationAdapter("secret-key", "gemini-2.5-flash")

    with pytest.raises(ProviderFailure, match="generation provider failed") as failure:
        adapter.generate("private prompt")

    assert failure.value.details is not None
    assert failure.value.details.category == "authentication"
    assert failure.value.details.provider_status == 403
    assert failure.value.details.provider_code is None
    assert body.decode() not in str(failure.value)


def test_gemini_malformed_success_response_is_invalid_response(monkeypatch) -> None:
    class MalformedResponse(_Response):
        def read(self, limit: int = -1) -> bytes:
            del limit
            return b"not json"

    monkeypatch.setattr(gemini, "urlopen", lambda *args, **kwargs: MalformedResponse())
    adapter = GeminiGenerationAdapter("secret-key", "gemini-2.5-flash")

    with pytest.raises(ProviderFailure) as failure:
        adapter.generate("private prompt")

    assert failure.value.details is not None
    assert failure.value.details.category == "invalid_response"
    assert failure.value.details.provider_status == 200


def test_ollama_generation_timeout_is_classified(monkeypatch) -> None:
    def fail(*args: object, **kwargs: object) -> object:
        del args, kwargs
        raise TimeoutError("provider timeout with private text")

    monkeypatch.setattr(ollama, "_ollama_json_request", fail)
    adapter = OllamaGenerationAdapter("http://localhost:11434", "qwen3:8b", 20)

    with pytest.raises(ProviderFailure) as failure:
        adapter.generate("private prompt")

    assert failure.value.details is not None
    assert failure.value.details.provider == "ollama"
    assert failure.value.details.category == "timeout"
    assert "private text" not in str(failure.value)


def test_cohere_embedding_provider_error_has_bedrock_boundary() -> None:
    class Client:
        def invoke_model(self, **kwargs: object) -> object:
            del kwargs
            raise _client_error(429, "ThrottlingException")

    adapter = CohereEmbeddingAdapter(Client(), "cohere.embed-multilingual-v3", dimensions=2)

    with pytest.raises(ProviderFailure) as failure:
        adapter.embed_document("private job text")

    assert failure.value.details is not None
    assert failure.value.details.provider == "bedrock"
    assert failure.value.details.category == "rate_limited"
    assert failure.value.details.provider_status == 429


def test_cohere_embedding_response_stream_timeout_is_not_malformed_output() -> None:
    class Body:
        def read(self) -> bytes:
            raise TimeoutError("private response stream detail")

    class Client:
        def invoke_model(self, **kwargs: object) -> object:
            del kwargs
            return {"body": Body()}

    adapter = CohereEmbeddingAdapter(Client(), "cohere.embed-multilingual-v3", dimensions=2)

    with pytest.raises(ProviderFailure) as failure:
        adapter.embed_document("private job text")

    assert failure.value.details is not None
    assert failure.value.details.category == "timeout"
    assert failure.value.details.exception_type == "TimeoutError"
    assert "private response stream detail" not in str(failure.value)


def test_ollama_malformed_embedding_is_invalid_response(monkeypatch) -> None:
    monkeypatch.setattr(
        "talentpulse_ai.infrastructure.embeddings.model._ollama_json_request",
        lambda *args, **kwargs: {"embeddings": [[1.0]]},
    )
    adapter = OllamaEmbeddingAdapter("http://localhost:11434", "bge-m3", 2, 10)

    with pytest.raises(ProviderFailure) as failure:
        adapter.embed_query("private CV text")

    assert failure.value.details is not None
    assert failure.value.details.category == "invalid_response"
    assert failure.value.details.provider == "ollama"


def test_qdrant_timeout_is_classified_and_invalid_local_filter_is_not_provider_failure() -> None:
    class TimeoutClient:
        def query_points(self, **kwargs: object) -> object:
            del kwargs
            raise TimeoutError("private transport detail")

    adapter = QdrantVectorRetriever(TimeoutClient(), "jobs", dimensions=2)
    with pytest.raises(ProviderFailure) as failure:
        adapter.search([0.1, 0.2], {}, 5)
    assert failure.value.details is not None
    assert failure.value.details.provider == "qdrant"
    assert failure.value.details.category == "timeout"

    class Client:
        def query_points(self, **kwargs: object) -> object:
            del kwargs
            return {"points": []}

    malformed = QdrantVectorRetriever(Client(), "jobs", index_version="v1", dimensions=2)
    with pytest.raises(ValueError, match="filter is invalid"):
        malformed.search([0.1, 0.2], {"must": "invalid"}, 5)
