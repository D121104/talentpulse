from __future__ import annotations

from collections.abc import Mapping, Sequence

from talentpulse_ai.modules.rag_chatbot.schemas import RetrievedChunk


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
