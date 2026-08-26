from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field

from app.ports import (
    ChatModel,
    ChatRequest,
    ChatResponse,
    EmbeddingInputType,
    EmbeddingModel,
    EmbeddingResponse,
    VectorMatch,
    VectorRecord,
    VectorStore,
    validate_vector,
    validate_vectors,
)


@dataclass(slots=True)
class FakeChatModel(ChatModel):
    text: str = '{"answer_blocks": [{"kind": "ADVICE", "text": "Use measurable outcomes."}]}'
    provider_name: str = "fake"
    model_name: str = "fake-chat"

    async def complete(self, request: ChatRequest) -> ChatResponse:
        del request
        return ChatResponse(self.text, self.model_name, self.provider_name)

    async def health(self) -> bool:
        return True


@dataclass(slots=True)
class FakeEmbeddingModel(EmbeddingModel):
    dimensions: int = 4
    provider_name: str = "fake"
    model_name: str = "fake-embedding"

    async def embed(
        self, texts: Sequence[str], input_type: EmbeddingInputType
    ) -> EmbeddingResponse:
        del input_type
        vectors = []
        for text in texts:
            vector = [0.0] * self.dimensions
            for index, byte in enumerate(text.encode("utf-8")):
                vector[index % self.dimensions] += float(byte)
            vectors.append(vector)
        return EmbeddingResponse(
            validate_vectors(vectors, self.dimensions, len(texts)),
            self.model_name,
            self.provider_name,
            self.dimensions,
        )

    async def health(self) -> bool:
        return True


@dataclass(slots=True)
class InMemoryVectorStore(VectorStore):
    collection_name: str = "fake-collection"
    records: dict[str, VectorRecord] = field(default_factory=dict)
    dimensions: int = 4

    def __post_init__(self) -> None:
        self.records = {} if self.records is None else self.records
        if self.dimensions < 1:
            raise ValueError("fake vector store dimensions must be positive")

    async def health(self) -> bool:
        return True

    async def search(
        self, vector: Sequence[float], limit: int, filters: dict[str, object] | None = None
    ) -> list[VectorMatch]:
        del filters
        query_vector = validate_vector(vector, self.dimensions)
        scored = []
        for record in self.records.values():
            record_vector = validate_vector(record.vector, self.dimensions)
            score = sum(
                left * right for left, right in zip(query_vector, record_vector, strict=False)
            )
            scored.append(VectorMatch(record.point_id, score, record.payload))
        return sorted(scored, key=lambda item: item.score, reverse=True)[:limit]

    async def upsert(self, records: Sequence[VectorRecord]) -> None:
        for record in records:
            validate_vector(record.vector, self.dimensions)
        self.records.update({record.point_id: record for record in records})

    async def delete(self, point_ids: Sequence[str]) -> None:
        for point_id in point_ids:
            self.records.pop(point_id, None)
