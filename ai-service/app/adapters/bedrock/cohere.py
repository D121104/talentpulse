from __future__ import annotations

import asyncio
import json
import math
from collections.abc import Sequence

from app.core.errors import ProviderError
from app.ports import EmbeddingInputType, EmbeddingModel, EmbeddingResponse


class BedrockCohereEmbeddingModel(EmbeddingModel):
    provider_name = "bedrock_cohere"
    MAX_BATCH_SIZE = 96
    MAX_TEXT_CHARS = 1900

    def __init__(self, region: str, model_name: str, dimensions: int = 1024) -> None:
        self.region = region
        self.model_name = model_name
        self.dimensions = dimensions

    def _embed_sync(
        self, texts: Sequence[str], input_type: EmbeddingInputType
    ) -> list[list[float]]:
        if len(texts) > self.MAX_BATCH_SIZE or any(
            not isinstance(text, str) or not text or len(text) > self.MAX_TEXT_CHARS
            for text in texts
        ):
            raise ProviderError("Embedding input exceeds the provider safety limit")
        try:
            import boto3

            client = boto3.client("bedrock-runtime", region_name=self.region)
            response = client.invoke_model(
                modelId=self.model_name,
                body=json.dumps(
                    {
                        "texts": list(texts),
                        "input_type": "search_query"
                        if input_type is EmbeddingInputType.QUERY
                        else "search_document",
                        "truncate": "NONE",
                    }
                ),
                contentType="application/json",
                accept="application/json",
            )
            body = response["body"].read()
            vectors = json.loads(body).get("embeddings")
        except ProviderError:
            raise
        except Exception as exc:
            raise ProviderError() from exc
        if not isinstance(vectors, list) or len(vectors) != len(texts):
            raise ProviderError("Embedding provider returned an invalid response")
        if any(
            not isinstance(vector, list)
            or len(vector) != self.dimensions
            or any(
                not isinstance(value, (int, float)) or not math.isfinite(value) for value in vector
            )
            for vector in vectors
        ):
            raise ProviderError("Embedding provider returned invalid vectors")
        return [[float(value) for value in vector] for vector in vectors]

    async def embed(
        self, texts: Sequence[str], input_type: EmbeddingInputType
    ) -> EmbeddingResponse:
        if not texts:
            return EmbeddingResponse([], self.model_name, self.provider_name, self.dimensions)
        vectors = await asyncio.to_thread(self._embed_sync, texts, input_type)
        return EmbeddingResponse(vectors, self.model_name, self.provider_name, self.dimensions)

    async def health(self) -> bool:
        return True  # Model access is verified by an explicit staging smoke test.
