from __future__ import annotations

import json
import time
from collections.abc import Callable, Mapping, Sequence
from math import isfinite
from typing import Protocol, cast

from talentpulse_ai.agent_foundation.contracts import UnstructuredTextResponse
from talentpulse_ai.core.exceptions import ProviderFailure, provider_failure_details

_BEDROCK_SCHEMA_UNSUPPORTED_KEYS = frozenset(
    {
        "$schema",
        "default",
        "discriminator",
        "examples",
        "maximum",
        "maxItems",
        "maxLength",
        "maxProperties",
        "minimum",
        "minLength",
        "minProperties",
        "multipleOf",
        "pattern",
        "title",
        "uniqueItems",
    }
)
_KIMI_STRUCTURED_MODELS = frozenset(
    {
        "global.moonshotai.kimi-k3",
        "global.moonshotai.kimi-k3.1",
        "in.moonshotai.kimi-k3",
        "in.moonshotai.kimi-k3.1",
        "moonshotai.kimi-k3",
        "moonshotai.kimi-k3.1",
        "us.moonshotai.kimi-k3",
        "us.moonshotai.kimi-k3.1",
    }
)


def _bedrock_response_schema(schema: Mapping[str, object]) -> dict[str, object]:
    root_definitions = schema.get("$defs", {})

    def project(
        value: object,
        resolving: frozenset[str] = frozenset(),
        definitions: object = root_definitions,
    ) -> object:
        if isinstance(value, list):
            return [project(item, resolving, definitions) for item in value]
        if not isinstance(value, Mapping):
            return value

        local_definitions = value.get("$defs", definitions)
        reference = value.get("$ref")
        if isinstance(reference, str):
            prefix = "#/$defs/"
            if not reference.startswith(prefix) or not isinstance(local_definitions, Mapping):
                raise ValueError("Bedrock structured schema contains an unsupported reference")
            name = reference.removeprefix(prefix)
            if name in resolving:
                raise ValueError("Bedrock structured schema contains a recursive reference")
            if name not in local_definitions:
                raise ValueError("Bedrock structured schema reference is unresolved")
            resolved = project(local_definitions[name], resolving | {name}, local_definitions)
            if not isinstance(resolved, Mapping):
                raise ValueError("Bedrock structured schema reference is invalid")
            result = dict(resolved)
            result.update(
                {
                    key: project(item, resolving, local_definitions)
                    for key, item in value.items()
                    if key not in _BEDROCK_SCHEMA_UNSUPPORTED_KEYS and key != "$ref"
                }
            )
            return result

        projected_value: dict[str, object] = {}
        for key, item in value.items():
            if not isinstance(key, str) or key in _BEDROCK_SCHEMA_UNSUPPORTED_KEYS:
                continue
            target_key = "anyOf" if key == "oneOf" else key
            if key == "$defs" or key == "additionalProperties":
                continue
            if key == "minItems" and item not in {0, 1}:
                continue
            projected_value[target_key] = project(item, resolving, local_definitions)

        schema_type = projected_value.get("type")
        if schema_type == "object" or (isinstance(schema_type, list) and "object" in schema_type):
            projected_value["additionalProperties"] = False
        return projected_value

    projected = project(schema)
    if not isinstance(projected, dict) or projected.get("type") != "object":
        raise ValueError("Bedrock structured output schema must have an object root")
    optional_properties, union_properties = _bedrock_schema_complexity(projected)
    if optional_properties > 12 or union_properties > 16:
        raise ValueError("Bedrock structured output schema exceeds provider limits")
    return projected


def _bedrock_schema_complexity(schema: object) -> tuple[int, int]:
    if isinstance(schema, Mapping):
        properties = schema.get("properties", {})
        required = schema.get("required", [])
        optional = len(properties) - len(required) if isinstance(properties, Mapping) else 0
        unions = (
            sum(
                1
                for property_schema in properties.values()
                if isinstance(property_schema, Mapping)
                and (isinstance(property_schema.get("type"), list) or "anyOf" in property_schema)
            )
            if isinstance(properties, Mapping)
            else 0
        )
        for child in schema.values():
            child_optional, child_unions = _bedrock_schema_complexity(child)
            optional += child_optional
            unions += child_unions
        return optional, unions
    if isinstance(schema, list):
        children = [_bedrock_schema_complexity(child) for child in schema]
        return sum(item[0] for item in children), sum(item[1] for item in children)
    return 0, 0


class _GenerationClient(Protocol):
    def converse(self, **kwargs: object) -> object: ...


class BedrockNovaGenerationAdapter:
    """Provider boundary for Amazon Bedrock Converse generation."""

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
        self.provider_name = "bedrock"
        self.model_name = model
        self.supports_structured_outputs = model in _KIMI_STRUCTURED_MODELS
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

    def generate_structured(
        self,
        prompt: str,
        schema: Mapping[str, object],
        timeout: float | None = None,
        *,
        num_predict: int | None = None,
    ) -> object:
        if not self.supports_structured_outputs:
            raise ProviderFailure("generation provider failed")
        if num_predict is not None and (type(num_predict) is not int or num_predict <= 0):
            raise ValueError("num_predict must be a positive integer")
        client = self._client
        if timeout is not None:
            if not isfinite(timeout) or timeout <= 0 or self._agent_client_factory is None:
                raise ProviderFailure("generation provider failed")
            try:
                client = self._agent_client_factory(timeout)
            except Exception as exc:
                raise ProviderFailure("generation provider failed") from exc
        return self._generate_with_client(
            client,
            prompt,
            schema=_bedrock_response_schema(schema),
            max_tokens=num_predict or 4096,
        )

    def _generate_with_client(
        self,
        client: object,
        prompt: str,
        *,
        schema: Mapping[str, object] | None = None,
        max_tokens: int | None = None,
    ) -> object:
        started_at = time.perf_counter()
        request: dict[str, object] = {
            "modelId": self._model,
            "messages": [{"role": "user", "content": [{"text": prompt}]}],
        }
        inference_config: dict[str, object] = {}
        if self._model not in _KIMI_STRUCTURED_MODELS:
            inference_config["temperature"] = 0.0
        if max_tokens is not None:
            inference_config["maxTokens"] = max_tokens
        if inference_config:
            request["inferenceConfig"] = inference_config
        if schema is not None:
            request["outputConfig"] = {
                "textFormat": {
                    "type": "json_schema",
                    "structure": {
                        "jsonSchema": {
                            "name": "agent_decision",
                            "description": "A final agent response or an allowlisted tool call.",
                            "schema": json.dumps(schema, separators=(",", ":"), sort_keys=True),
                        }
                    },
                }
            }
        try:
            response = cast(_GenerationClient, client).converse(**request)
        except Exception as exc:
            raise ProviderFailure(
                "generation provider failed",
                details=provider_failure_details(
                    exc,
                    provider="bedrock",
                    model=self._model,
                    duration_ms=round((time.perf_counter() - started_at) * 1000),
                    include_provider_message=schema is not None,
                ),
            ) from exc

        try:
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
            try:
                return json.loads(text)
            except json.JSONDecodeError:
                if schema is not None:
                    return UnstructuredTextResponse(text)
                raise
        except Exception as exc:
            raise ProviderFailure(
                "generation provider failed",
                details=provider_failure_details(
                    exc,
                    provider="bedrock",
                    model=self._model,
                    duration_ms=round((time.perf_counter() - started_at) * 1000),
                    category="invalid_response",
                ),
            ) from exc
