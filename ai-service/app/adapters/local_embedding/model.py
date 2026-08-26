from __future__ import annotations

import asyncio
from collections.abc import Sequence
from typing import Any

from app.core.errors import ProviderError
from app.ports import (
    EmbeddingInputType,
    EmbeddingModel,
    EmbeddingResponse,
    validate_vectors,
)


class LocalMultilingualEmbeddingModel(EmbeddingModel):
    provider_name = "sentence_transformers"

    def __init__(self, model_name: str, dimensions: int, device: str = "cpu") -> None:
        self.model_name = model_name
        self.dimensions = dimensions
        self.device = device
        self._model = None

    def _load_model(self) -> Any:
        if self._model is None:
            try:
                from sentence_transformers import SentenceTransformer

                self._model = SentenceTransformer(self.model_name, device=self.device)
            except Exception as exc:
                raise ProviderError("Local embedding model could not be loaded") from exc
        return self._model

    def _embed_sync(self, texts: Sequence[str]) -> list[list[float]]:
        model = self._load_model()
        vectors = model.encode(list(texts), normalize_embeddings=True, convert_to_numpy=True)
        return [vector.astype(float).tolist() for vector in vectors]

    async def embed(
        self, texts: Sequence[str], input_type: EmbeddingInputType
    ) -> EmbeddingResponse:
        del input_type  # SentenceTransformers uses the same interface for documents and queries.
        if not texts:
            return EmbeddingResponse([], self.model_name, self.provider_name, self.dimensions)
        vectors = await asyncio.to_thread(self._embed_sync, texts)
        try:
            validated = validate_vectors(vectors, self.dimensions, len(texts))
        except ValueError as exc:
            raise ProviderError("Embedding provider returned invalid vectors") from exc
        return EmbeddingResponse(validated, self.model_name, self.provider_name, self.dimensions)

    async def health(self) -> bool:
        try:
            await asyncio.to_thread(self._load_model)
            return True
        except ProviderError:
            return False
