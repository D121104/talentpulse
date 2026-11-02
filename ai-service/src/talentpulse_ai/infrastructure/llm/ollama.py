from __future__ import annotations

import json
from collections.abc import Mapping, Sequence

from talentpulse_ai.core.exceptions import ProviderFailure
from talentpulse_ai.infrastructure.llm.client import (
    _MAX_OLLAMA_TIMEOUT_SECONDS,
    _ollama_json_request,
)
from talentpulse_ai.modules.rag_chatbot.schemas import ProviderGeneration


def _ollama_generation_schema() -> Mapping[str, object]:
    """Use the supported subset of JSON Schema for Ollama's grammar compiler."""

    schema = _ollama_schema(ProviderGeneration.model_json_schema())
    if not isinstance(schema, Mapping):
        raise ValueError("generation schema is not an object")
    return schema


def _ollama_schema(value: object, *, definitions: Mapping[str, object] | None = None) -> object:
    """Normalize Pydantic JSON Schema for Ollama's grammar endpoint.

    Pydantic emits local ``$ref``/``$defs`` and descriptive validation metadata.
    Ollama's constrained decoder needs the actual nested object schema, so refs
    are inlined while preserving constraints that affect the generated shape.
    """
    if isinstance(value, Mapping):
        local_definitions = value.get("$defs")
        defs = local_definitions if isinstance(local_definitions, Mapping) else definitions
        ref = value.get("$ref")
        if isinstance(ref, str) and ref.startswith("#/$defs/") and isinstance(defs, Mapping):
            target = defs.get(ref.removeprefix("#/$defs/"))
            if target is not None:
                return _ollama_schema(target, definitions=defs)
        result: dict[str, object] = {}
        for key, item in value.items():
            if key in {
                "$defs",
                "$ref",
                "title",
                "description",
                "default",
                "maxLength",
                "minLength",
            }:
                continue
            result[key] = _ollama_schema(item, definitions=defs)
        return result
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
        return [_ollama_schema(item, definitions=definitions) for item in value]
    return value


def _parse_ollama_json_object(text: str) -> Mapping[str, object]:
    """Parse native JSON while tolerating an unwanted Qwen reasoning wrapper."""
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start < 0 or end <= start:
            raise
        parsed = json.loads(text[start : end + 1])
    if not isinstance(parsed, Mapping):
        raise ValueError("generation response is not a JSON object")
    return parsed


class OllamaGenerationAdapter:
    """Provider boundary for Ollama's non-streaming structured generation endpoint."""

    def __init__(self, base_url: str, model: str, timeout: float) -> None:
        if not base_url or not model or not 0 < timeout <= _MAX_OLLAMA_TIMEOUT_SECONDS:
            raise ValueError("Ollama generation configuration is invalid")
        self._base_url = base_url
        self._model = model
        self._timeout = timeout
        self.provider_name = "ollama"
        self.model_name = model

    def generate(self, prompt: str) -> object:
        return self.generate_structured(prompt, _ollama_generation_schema())

    def generate_structured(
        self,
        prompt: str,
        schema: Mapping[str, object],
        timeout: float | None = None,
        *,
        num_predict: int | None = None,
    ) -> object:
        if num_predict is not None and not 1 <= num_predict <= 4_096:
            raise ValueError("num_predict must be between 1 and 4096")
        try:
            options: dict[str, object] = {"temperature": 0}
            if num_predict is not None:
                options["num_predict"] = num_predict
            generation_payload: dict[str, object] = {
                "model": self._model,
                "prompt": prompt,
                "stream": False,
                "format": _ollama_schema(schema),
                "options": options,
            }
            if self._model.lower().startswith("qwen3"):
                generation_payload["think"] = False
            request_timeout = self._timeout
            if timeout is not None:
                if not 0 < timeout <= _MAX_OLLAMA_TIMEOUT_SECONDS:
                    raise ValueError("generation timeout must be between 0 and 120 seconds")
                # CV worker calls supply an explicit bounded timeout that may be longer
                # than the default used by synchronous generation callers.
                request_timeout = timeout
            response = _ollama_json_request(
                self._base_url,
                "/api/generate",
                generation_payload,
                request_timeout,
            )
            if not isinstance(response, Mapping) or not isinstance(response.get("response"), str):
                raise ValueError("generation response has no JSON text")
            return _parse_ollama_json_object(response["response"])
        except Exception as exc:
            raise ProviderFailure("generation provider failed") from exc
