from __future__ import annotations

import json
from collections.abc import Callable, Mapping, Sequence
from math import isfinite
from typing import Protocol, cast

from talentpulse_ai.core.exceptions import ProviderFailure


class _GenerationClient(Protocol):
    def converse(self, **kwargs: object) -> object: ...


class BedrockNovaGenerationAdapter:
    """Provider boundary for Amazon Nova Lite's Converse API."""

    def __init__(
        self,
        client: object,
        model: str,
        agent_client_factory: Callable[[float], object] | None = None,
    ) -> None:
        if not model:
            raise ValueError("generation model is required")
        self._client = client
        self._model = model
        self._agent_client_factory = agent_client_factory

    def generate(self, prompt: str) -> object:
        return self._generate_with_client(self._client, prompt)

    def generate_with_timeout(self, prompt: str, *, timeout: float) -> object:
        if not isfinite(timeout) or timeout <= 0 or self._agent_client_factory is None:
            raise ProviderFailure("generation provider failed")
        try:
            client = self._agent_client_factory(timeout)
        except Exception as exc:
            raise ProviderFailure("generation provider failed") from exc
        return self._generate_with_client(client, prompt)

    def _generate_with_client(self, client: object, prompt: str) -> object:
        try:
            response = cast(_GenerationClient, client).converse(
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
