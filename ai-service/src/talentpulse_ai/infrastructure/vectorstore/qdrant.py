from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from typing import Protocol, cast
from uuid import UUID

from qdrant_client.models import PointIdsList, PointStruct

from talentpulse_ai.core.exceptions import ProviderFailure
from talentpulse_ai.modules.rag_chatbot.schemas import RetrievedChunk


class _QdrantClient(Protocol):
    def query_points(self, **kwargs: object) -> object: ...

    def search(self, **kwargs: object) -> object: ...

    def upsert(self, **kwargs: object) -> object: ...

    def delete(self, **kwargs: object) -> object: ...


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
