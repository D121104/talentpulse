from __future__ import annotations

import hashlib
import json
import math
from collections.abc import Mapping, Sequence
from typing import Protocol, cast

from talentpulse_ai.core.exceptions import ProviderFailure
from talentpulse_ai.infrastructure.llm.client import (
    _MAX_OLLAMA_TIMEOUT_SECONDS,
    _ollama_json_request,
    _response_body,
)


class _EmbeddingClient(Protocol):
    def embed(self, **kwargs: object) -> object: ...

    def invoke_model(self, **kwargs: object) -> object: ...


class DeterministicEmbeddingProvider:
    def __init__(self, dimensions: int = 32) -> None:
        if not 4 <= dimensions <= 4_096:
            raise ValueError("embedding dimensions must be bounded")
        self.dimensions = dimensions
        self.provider_name = "deterministic"
        self.model_name = "deterministic-v1"

    def embed_query(self, text: str) -> list[float]:
        values: list[float] = []
        counter = 0
        while len(values) < self.dimensions:
            digest = hashlib.sha256(f"{counter}:{text}".encode()).digest()
            values.extend((byte / 127.5) - 1.0 for byte in digest)
            counter += 1
        selected = values[: self.dimensions]
        norm = math.sqrt(sum(value * value for value in selected)) or 1.0
        return [value / norm for value in selected]

    def embed_document(self, text: str) -> list[float]:
        return self.embed_query(text)


class CohereEmbeddingAdapter:
    """Provider boundary for direct Cohere or Bedrock-hosted Cohere embeddings."""

    def __init__(self, client: object, model: str, dimensions: int = 1_024) -> None:
        if not model or not 1 <= dimensions <= 4_096:
            raise ValueError("embedding model and dimensions are required")
        self._client = client
        self._model = model
        self.dimensions = dimensions
        self.provider_name = "cohere"
        self.model_name = model

    def embed_query(self, text: str) -> list[float]:
        return self._embed(text, "search_query")

    def embed_document(self, text: str) -> list[float]:
        return self._embed(text, "search_document")

    def _embed(self, text: str, input_type: str) -> list[float]:
        try:
            client = cast(_EmbeddingClient, self._client)
            if hasattr(client, "invoke_model"):
                response = client.invoke_model(
                    modelId=self._model,
                    contentType="application/json",
                    accept="application/json",
                    body=json.dumps(
                        {
                            "texts": [text],
                            "input_type": input_type,
                            "truncate": "END",
                        }
                    ),
                )
                response = _response_body(response)
            else:
                response = client.embed(
                    texts=[text],
                    model=self._model,
                    input_type=input_type,
                    embedding_types=["float"],
                )
            raw: object = getattr(response, "embeddings", response)
            if isinstance(raw, Mapping):
                raw = raw.get("float", raw.get("embeddings"))
            if not isinstance(raw, Sequence) or isinstance(raw, (str, bytes)) or not raw:
                raise ValueError("embedding response is not a vector list")
            first = raw[0]
            vector_raw: object = (
                first
                if isinstance(first, Sequence) and not isinstance(first, (str, bytes))
                else raw
            )
            if not isinstance(vector_raw, Sequence) or isinstance(vector_raw, (str, bytes)):
                raise ValueError("embedding response is not a vector")
            vector = list(vector_raw)
            if len(vector) != self.dimensions or not all(
                isinstance(item, (int, float))
                and not isinstance(item, bool)
                and math.isfinite(float(item))
                for item in vector
            ):
                raise ValueError("embedding response has invalid dimensions")
            return [float(item) for item in vector]
        except Exception as exc:
            raise ProviderFailure("embedding provider failed") from exc


class OllamaEmbeddingAdapter:
    """Provider boundary for Ollama's native embedding endpoint."""

    def __init__(self, base_url: str, model: str, dimensions: int, timeout: float) -> None:
        if (
            not base_url
            or not model
            or not 1 <= dimensions <= 4_096
            or not 0 < timeout <= _MAX_OLLAMA_TIMEOUT_SECONDS
        ):
            raise ValueError("Ollama embedding configuration is invalid")
        self._base_url = base_url
        self._model = model
        self._timeout = timeout
        self.dimensions = dimensions
        self.provider_name = "ollama"
        self.model_name = model

    def embed_query(self, text: str) -> list[float]:
        return self._embed(text)

    def embed_document(self, text: str) -> list[float]:
        return self._embed(text)

    def _embed(self, text: str) -> list[float]:
        try:
            response = _ollama_json_request(
                self._base_url,
                "/api/embed",
                {
                    "model": self._model,
                    "input": [text],
                    "dimensions": self.dimensions,
                    "truncate": True,
                },
                self._timeout,
            )
            if not isinstance(response, Mapping):
                raise ValueError("embedding response is not an object")
            raw = response.get("embeddings")
            if not isinstance(raw, Sequence) or isinstance(raw, (str, bytes)) or len(raw) != 1:
                raise ValueError("embedding response must contain one vector")
            vector_raw = raw[0]
            if not isinstance(vector_raw, Sequence) or isinstance(vector_raw, (str, bytes)):
                raise ValueError("embedding response is not a vector")
            vector = list(vector_raw)
            if len(vector) != self.dimensions or not all(
                isinstance(item, (int, float))
                and not isinstance(item, bool)
                and math.isfinite(float(item))
                for item in vector
            ):
                raise ValueError("embedding response has invalid dimensions")
            return [float(item) for item in vector]
        except Exception as exc:
            raise ProviderFailure("embedding provider failed") from exc
