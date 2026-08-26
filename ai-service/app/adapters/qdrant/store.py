from __future__ import annotations

import asyncio
import math
from collections.abc import Sequence
from typing import Any

from app.core.errors import ProviderError
from app.ports import VectorMatch, VectorRecord, VectorStore, validate_vector


class QdrantVectorStore(VectorStore):
    def __init__(
        self,
        url: str,
        collection_name: str,
        alias_name: str | None = None,
        api_key: str | None = None,
        timeout_seconds: float = 3.0,
        dimensions: int = 1024,
        embedding_model: str = "",
        auto_initialize: bool = False,
    ) -> None:
        from qdrant_client import QdrantClient

        if dimensions < 1 or not collection_name.strip():
            raise ValueError("Qdrant collection and dimensions are required")
        self.collection_name = collection_name
        self.alias_name = alias_name or collection_name
        self.dimensions = dimensions
        self.embedding_model = embedding_model
        self.auto_initialize = auto_initialize
        self._client = QdrantClient(
            url=url, api_key=api_key, timeout=max(1, math.ceil(timeout_seconds))
        )

    def _collection_vector_config(self, info: Any) -> Any | None:
        vectors = info.config.params.vectors
        if isinstance(vectors, dict) or vectors is None:
            return None
        return vectors

    def _collection_vector_size(self, info: Any) -> int | None:
        vectors = self._collection_vector_config(info)
        return int(vectors.size) if vectors is not None else None

    def _collection_distance(self, info: Any) -> str | None:
        vectors = self._collection_vector_config(info)
        if vectors is None:
            return None
        distance = vectors.distance
        return getattr(distance, "value", str(distance))

    def _ensure_foundation_sync(self) -> bool:
        self._client.get_collections()
        exists = self._client.collection_exists(self.collection_name)
        if not exists:
            if not self.auto_initialize:
                return False
            from qdrant_client import models

            self._client.create_collection(
                collection_name=self.collection_name,
                vectors_config=models.VectorParams(
                    size=self.dimensions, distance=models.Distance.COSINE
                ),
                metadata={
                    "embedding_model": self.embedding_model,
                    "embedding_dimensions": self.dimensions,
                    "foundation_version": "phase1",
                },
            )
        info = self._client.get_collection(self.collection_name)
        # A collection with the right dimension is not sufficient: vectors from
        # another model can share the same dimensionality.  The initializer owns
        # an explicit metadata contract so a stale or manually-created collection
        # is reported as not ready instead of being used silently.
        if self._collection_vector_size(info) != self.dimensions:
            return False
        if self._collection_distance(info) != "Cosine":
            return False
        metadata = info.config.metadata or {}
        if metadata.get("foundation_version") != "phase1":
            return False
        if metadata.get("embedding_dimensions") != self.dimensions:
            return False
        if metadata.get("embedding_model") != self.embedding_model:
            return False
        aliases = self._client.get_aliases().aliases
        matching = [alias for alias in aliases if alias.alias_name == self.alias_name]
        if len(matching) > 1 or (matching and matching[0].collection_name != self.collection_name):
            return False
        if not matching and self.alias_name != self.collection_name:
            if not self.auto_initialize:
                return False
            from qdrant_client import models

            self._client.update_collection_aliases(
                [
                    models.CreateAliasOperation(
                        create_alias=models.CreateAlias(
                            collection_name=self.collection_name, alias_name=self.alias_name
                        )
                    )
                ]
            )
        return True

    async def health(self) -> bool:
        try:
            return await asyncio.to_thread(self._ensure_foundation_sync)
        except Exception:
            return False

    async def search(
        self, vector: Sequence[float], limit: int, filters: dict[str, Any] | None = None
    ) -> list[VectorMatch]:
        try:
            query_vector = validate_vector(vector, self.dimensions)
        except ValueError as exc:
            raise ProviderError("Query vector dimensions or values are invalid") from exc
        from qdrant_client import models

        query_filter = None
        if filters:
            query_filter = models.Filter(
                must=[
                    models.FieldCondition(key=key, match=models.MatchValue(value=value))
                    for key, value in filters.items()
                ]
            )
        try:
            points_response = await asyncio.to_thread(
                self._client.query_points,
                collection_name=self.alias_name,
                query=query_vector,
                query_filter=query_filter,
                limit=max(1, min(limit, 50)),
                with_payload=True,
            )
            points = points_response.points
        except Exception as exc:
            raise ProviderError() from exc
        return [
            VectorMatch(str(point.id), float(point.score), point.payload or {}) for point in points
        ]

    async def upsert(self, records: Sequence[VectorRecord]) -> None:
        from qdrant_client import models

        try:
            points = [
                models.PointStruct(
                    id=record.point_id,
                    vector=validate_vector(record.vector, self.dimensions),
                    payload=record.payload,
                )
                for record in records
            ]
        except ValueError as exc:
            raise ProviderError("Vector dimensions or values are invalid") from exc
        if points:
            try:
                await asyncio.to_thread(
                    self._client.upsert,
                    collection_name=self.alias_name,
                    points=points,
                    wait=True,
                )
            except Exception as exc:
                raise ProviderError() from exc

    async def delete(self, point_ids: Sequence[str]) -> None:
        from qdrant_client import models

        if point_ids:
            try:
                await asyncio.to_thread(
                    self._client.delete,
                    collection_name=self.alias_name,
                    points_selector=models.PointIdsList(points=list(point_ids)),
                    wait=True,
                )
            except Exception as exc:
                raise ProviderError() from exc
