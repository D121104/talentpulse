from __future__ import annotations

import hashlib
import json
import math
from collections.abc import Mapping, Sequence
from typing import Protocol, cast
from urllib.request import Request, urlopen
from uuid import UUID

from qdrant_client.models import PointIdsList, PointStruct

from app.domain.rag import ProviderGeneration, RetrievedChunk


class _EmbeddingClient(Protocol):
    def embed(self, **kwargs: object) -> object: ...

    def invoke_model(self, **kwargs: object) -> object: ...


class _QdrantClient(Protocol):
    def query_points(self, **kwargs: object) -> object: ...

    def search(self, **kwargs: object) -> object: ...

    def upsert(self, **kwargs: object) -> object: ...

    def delete(self, **kwargs: object) -> object: ...


class ProviderFailure(RuntimeError):
    """Internal marker for failures at embedding, vector, or generation boundaries."""


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


_MAX_OLLAMA_RESPONSE_BYTES = 10 * 1024 * 1024
_MAX_OLLAMA_TIMEOUT_SECONDS = 120.0


def _ollama_generation_schema() -> Mapping[str, object]:
    """Use the supported subset of JSON Schema for Ollama's grammar compiler."""

    def remove_max_lengths(value: object) -> object:
        if isinstance(value, Mapping):
            return {
                key: remove_max_lengths(item) for key, item in value.items() if key != "maxLength"
            }
        if isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
            return [remove_max_lengths(item) for item in value]
        return value

    schema = remove_max_lengths(ProviderGeneration.model_json_schema())
    if not isinstance(schema, Mapping):
        raise ValueError("generation schema is not an object")
    return schema


def _ollama_json_request(
    base_url: str, path: str, payload: Mapping[str, object], timeout: float
) -> object:
    request = Request(
        f"{base_url.rstrip('/')}{path}",
        data=json.dumps(payload, separators=(",", ":")).encode("utf-8"),
        headers={"Accept": "application/json", "Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=timeout) as response:
        body = response.read(_MAX_OLLAMA_RESPONSE_BYTES + 1)
    if len(body) > _MAX_OLLAMA_RESPONSE_BYTES:
        raise ValueError("provider response is too large")
    return json.loads(body.decode("utf-8"))


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


def _response_body(response: object) -> object:
    if isinstance(response, Mapping):
        response = response.get("body", response)
    reader = getattr(response, "read", None)
    if callable(reader):
        response = reader()
    if isinstance(response, bytes):
        response = response.decode("utf-8")
    if isinstance(response, str):
        return json.loads(response)
    return response


class _GenerationClient(Protocol):
    def converse(self, **kwargs: object) -> object: ...


class BedrockNovaGenerationAdapter:
    """Provider boundary for Amazon Nova Lite's Converse API."""

    def __init__(self, client: object, model: str) -> None:
        if not model:
            raise ValueError("generation model is required")
        self._client = client
        self._model = model

    def generate(self, prompt: str) -> object:
        try:
            response = cast(_GenerationClient, self._client).converse(
                modelId=self._model,
                messages=[{"role": "user", "content": [{"text": prompt}]}],
                inferenceConfig={"temperature": 0.0},
            )
            output = response.get("output") if isinstance(response, Mapping) else None
            message = output.get("message") if isinstance(output, Mapping) else None
            content = message.get("content") if isinstance(message, Mapping) else None
            if not isinstance(content, Sequence) or isinstance(content, (str, bytes)):
                raise ValueError("generation response has no content")
            text = next(
                (
                    item.get("text")
                    for item in content
                    if isinstance(item, Mapping) and isinstance(item.get("text"), str)
                ),
                None,
            )
            if text is None:
                raise ValueError("generation response has no text")
            return json.loads(text)
        except Exception as exc:
            raise ProviderFailure("generation provider failed") from exc


class OllamaGenerationAdapter:
    """Provider boundary for Ollama's non-streaming structured generation endpoint."""

    def __init__(self, base_url: str, model: str, timeout: float) -> None:
        if not base_url or not model or not 0 < timeout <= _MAX_OLLAMA_TIMEOUT_SECONDS:
            raise ValueError("Ollama generation configuration is invalid")
        self._base_url = base_url
        self._model = model
        self._timeout = timeout

    def generate(self, prompt: str) -> object:
        try:
            generation_payload: dict[str, object] = {
                "model": self._model,
                "prompt": prompt,
                "stream": False,
                "format": _ollama_generation_schema(),
                "options": {"temperature": 0},
            }
            if self._model.lower().startswith("qwen3"):
                generation_payload["think"] = False
            response = _ollama_json_request(
                self._base_url,
                "/api/generate",
                generation_payload,
                self._timeout,
            )
            if not isinstance(response, Mapping) or not isinstance(response.get("response"), str):
                raise ValueError("generation response has no JSON text")
            generated = json.loads(response["response"])
            if not isinstance(generated, Mapping):
                raise ValueError("generation response is not a JSON object")
            return generated
        except Exception as exc:
            raise ProviderFailure("generation provider failed") from exc


class InMemoryVectorRetriever:
    def __init__(self, chunks: list[RetrievedChunk] | None = None, dimensions: int = 32) -> None:
        self.chunks = chunks or []
        self.dimensions = dimensions
        self.provider_name = "memory"
        self.model_name = "memory-v1"
        self.points: dict[str, tuple[list[float], dict[str, object]]] = {}
        self.last_filter: dict[str, object] | None = None
        self.last_limit: int | None = None

    def search(
        self, vector: list[float], query_filter: dict[str, object], limit: int
    ) -> list[RetrievedChunk]:
        del vector
        self.last_filter = query_filter
        self.last_limit = limit
        return list(self.chunks[:limit])

    def upsert_point(
        self, point_id: str, vector: Sequence[float], payload: Mapping[str, object]
    ) -> None:
        if len(vector) != self.dimensions:
            raise ValueError("vector dimensions do not match configuration")
        self.points[point_id] = (list(vector), dict(payload))

    def delete_point(self, point_id: str) -> None:
        self.points.pop(point_id, None)


class QdrantVectorRetriever:
    """Qdrant adapter; application services only receive provider-neutral chunks."""

    _payload_allowlist = frozenset(
        {
            "job_id",
            "company_id",
            "title",
            "company_name",
            "location",
            "level",
            "work_mode",
            "employment_type",
            "salary",
            "salary_currency",
            "skills",
            "start_date",
            "end_date",
            "start_date_epoch_ms",
            "end_date_epoch_ms",
            "is_active",
            "is_deleted",
            "company_is_active",
            "company_is_deleted",
            "status",
            "index_version",
            "content_hash",
            "source_version",
            "representation_version",
            "normalization_version",
            "point_id",
        }
    )

    def __init__(
        self,
        client: object,
        collection_name: str,
        *,
        collection_alias: str | None = None,
        index_version: str | None = None,
        dimensions: int = 1_024,
    ) -> None:
        self._client = client
        self.collection_name = collection_name
        self.collection_alias = collection_alias or collection_name
        self.index_version = index_version
        self.dimensions = dimensions
        self.provider_name = "qdrant"
        self.model_name = "qdrant-v1"

    def search(
        self, vector: list[float], query_filter: dict[str, object], limit: int
    ) -> list[RetrievedChunk]:
        try:
            client = cast(_QdrantClient, self._client)
            search_filter = query_filter
            if self.index_version is not None:
                existing_must = query_filter.get("must", [])
                if not isinstance(existing_must, list):
                    raise ValueError("vector provider filter is invalid")
                search_filter = {
                    **query_filter,
                    "must": [
                        *existing_must,
                        {"key": "index_version", "match": {"value": self.index_version}},
                    ],
                }
            if hasattr(client, "query_points"):
                response = client.query_points(
                    collection_name=self.collection_alias,
                    query=vector,
                    query_filter=search_filter,
                    limit=limit,
                    with_payload=True,
                )
                points: object = (
                    response.get("points", response)
                    if isinstance(response, Mapping)
                    else getattr(response, "points", response)
                )
            else:
                points = client.search(
                    collection_name=self.collection_alias,
                    query_vector=vector,
                    query_filter=search_filter,
                    limit=limit,
                    with_payload=True,
                )
            if not isinstance(points, Sequence) or isinstance(points, (str, bytes)):
                raise ValueError("vector provider returned invalid points")
            results: list[RetrievedChunk] = []
            for point in points:
                payload_raw = (
                    point.get("payload", {})
                    if isinstance(point, Mapping)
                    else getattr(point, "payload", {})
                )
                payload = payload_raw if isinstance(payload_raw, Mapping) else {}
                job_value = payload.get("job_id")
                if not isinstance(job_value, str):
                    continue
                try:
                    job_id = UUID(job_value)
                except ValueError:
                    continue
                metadata: dict[str, str] = {}
                for key, value in payload.items():
                    if key not in self._payload_allowlist:
                        continue
                    if isinstance(value, (str, int, float, bool)):
                        metadata[key] = str(value)
                    elif isinstance(value, list) and all(isinstance(item, str) for item in value):
                        metadata[key] = ",".join(value)
                score_raw = (
                    point.get("score", 0.0)
                    if isinstance(point, Mapping)
                    else getattr(point, "score", 0.0)
                )
                score = float(score_raw)
                if not math.isfinite(score) or not -1 <= score <= 1:
                    raise ValueError("vector provider returned an invalid score")
                results.append(RetrievedChunk(job_id, score, metadata))
            return results
        except Exception as exc:
            raise ProviderFailure("vector provider failed") from exc

    def upsert_point(
        self, point_id: str, vector: Sequence[float], payload: Mapping[str, object]
    ) -> None:
        try:
            if len(vector) != self.dimensions:
                raise ValueError("vector dimensions do not match configuration")
            safe_payload = {
                key: value
                for key, value in payload.items()
                if key in self._payload_allowlist
                and (
                    value is None
                    or isinstance(value, (str, int, float, bool))
                    or (isinstance(value, list) and all(isinstance(item, str) for item in value))
                )
            }
            cast(_QdrantClient, self._client).upsert(
                collection_name=self.collection_alias,
                points=[PointStruct(id=point_id, vector=list(vector), payload=safe_payload)],
                wait=True,
            )
        except Exception as exc:
            raise ProviderFailure("vector provider failed") from exc

    def delete_point(self, point_id: str) -> None:
        try:
            cast(_QdrantClient, self._client).delete(
                collection_name=self.collection_alias,
                points_selector=PointIdsList(points=[point_id]),
                wait=True,
            )
        except Exception as exc:
            raise ProviderFailure("vector provider failed") from exc
