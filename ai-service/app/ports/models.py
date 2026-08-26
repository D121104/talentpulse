from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any, Protocol


def validate_vector(vector: Sequence[float], dimensions: int) -> list[float]:
    if len(vector) != dimensions or any(
        not isinstance(value, (int, float)) or not math.isfinite(value) for value in vector
    ):
        raise ValueError("vector has invalid dimensions or non-finite values")
    return [float(value) for value in vector]


def validate_vectors(
    vectors: Sequence[Sequence[float]], dimensions: int, expected_count: int
) -> list[list[float]]:
    if len(vectors) != expected_count:
        raise ValueError("embedding count does not match input count")
    return [validate_vector(vector, dimensions) for vector in vectors]


class EmbeddingInputType(StrEnum):
    DOCUMENT = "document"
    QUERY = "query"


@dataclass(frozen=True, slots=True)
class ChatRequest:
    system_instruction: str
    user_content: str
    max_output_tokens: int = 1024
    temperature: float = 0.0


@dataclass(frozen=True, slots=True)
class ChatResponse:
    text: str
    model: str
    provider: str
    finish_reason: str | None = None
    usage: dict[str, int] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class EmbeddingResponse:
    vectors: list[list[float]]
    model: str
    provider: str
    dimensions: int


@dataclass(frozen=True, slots=True)
class VectorRecord:
    point_id: str
    vector: list[float]
    payload: dict[str, Any]


@dataclass(frozen=True, slots=True)
class VectorMatch:
    point_id: str
    score: float
    payload: dict[str, Any]


class ChatModel(Protocol):
    provider_name: str
    model_name: str

    async def complete(self, request: ChatRequest) -> ChatResponse: ...

    async def health(self) -> bool: ...


class EmbeddingModel(Protocol):
    provider_name: str
    model_name: str
    dimensions: int

    async def embed(
        self, texts: Sequence[str], input_type: EmbeddingInputType
    ) -> EmbeddingResponse: ...

    async def health(self) -> bool: ...


class VectorStore(Protocol):
    collection_name: str

    async def health(self) -> bool: ...

    async def search(
        self, vector: Sequence[float], limit: int, filters: dict[str, Any] | None = None
    ) -> list[VectorMatch]: ...

    async def upsert(self, records: Sequence[VectorRecord]) -> None: ...

    async def delete(self, point_ids: Sequence[str]) -> None: ...
