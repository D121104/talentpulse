from __future__ import annotations

import hashlib
import math
from collections.abc import Mapping, Sequence
from typing import Protocol, cast
from uuid import UUID

from app.domain.rag import RetrievedChunk


class _EmbeddingClient(Protocol):
    def embed(self, **kwargs: object) -> object: ...


class _QdrantClient(Protocol):
    def query_points(self, **kwargs: object) -> object: ...

    def search(self, **kwargs: object) -> object: ...


class ProviderFailure(RuntimeError):
    """Internal marker for failures at embedding, vector, or generation boundaries."""


class DeterministicEmbeddingProvider:
    def __init__(self, dimensions: int = 32) -> None:
        if not 4 <= dimensions <= 4_096:
            raise ValueError("embedding dimensions must be bounded")
        self.dimensions = dimensions

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


class CohereEmbeddingAdapter:
    """Provider boundary for Cohere or an equivalent Bedrock Cohere client."""

    def __init__(self, client: object, model: str, dimensions: int = 1_024) -> None:
        if not model or not 1 <= dimensions <= 4_096:
            raise ValueError("embedding model and dimensions are required")
        self._client = client
        self._model = model
        self.dimensions = dimensions

    def embed_query(self, text: str) -> list[float]:
        try:
            client = cast(_EmbeddingClient, self._client)
            response = client.embed(texts=[text], model=self._model, input_type="search_query")
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


class InMemoryVectorRetriever:
    def __init__(self, chunks: list[RetrievedChunk] | None = None) -> None:
        self.chunks = chunks or []
        self.last_filter: dict[str, object] | None = None
        self.last_limit: int | None = None

    def search(
        self, vector: list[float], query_filter: dict[str, object], limit: int
    ) -> list[RetrievedChunk]:
        del vector
        self.last_filter = query_filter
        self.last_limit = limit
        return list(self.chunks[:limit])


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
            "is_active",
            "is_deleted",
            "company_is_active",
            "company_is_deleted",
        }
    )

    def __init__(self, client: object, collection_name: str) -> None:
        self._client = client
        self._collection_name = collection_name

    def search(
        self, vector: list[float], query_filter: dict[str, object], limit: int
    ) -> list[RetrievedChunk]:
        try:
            client = cast(_QdrantClient, self._client)
            if hasattr(client, "query_points"):
                response = client.query_points(
                    collection_name=self._collection_name,
                    query=vector,
                    query_filter=query_filter,
                    limit=limit,
                    with_payload=True,
                )
                points: object = getattr(response, "points", response)
            else:
                points = client.search(
                    collection_name=self._collection_name,
                    query_vector=vector,
                    query_filter=query_filter,
                    limit=limit,
                    with_payload=True,
                )
            if not isinstance(points, Sequence) or isinstance(points, (str, bytes)):
                raise ValueError("vector provider returned invalid points")
            results: list[RetrievedChunk] = []
            for point in points:
                payload_raw = getattr(point, "payload", {})
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
                score = float(getattr(point, "score", 0.0))
                if not math.isfinite(score) or not -1 <= score <= 1:
                    raise ValueError("vector provider returned an invalid score")
                results.append(RetrievedChunk(job_id, score, metadata))
            return results
        except Exception as exc:
            raise ProviderFailure("vector provider failed") from exc
