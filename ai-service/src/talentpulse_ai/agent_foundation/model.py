from __future__ import annotations

import json
import time
from collections.abc import Mapping
from typing import cast
from uuid import uuid4

import logging
from datetime import datetime, timezone
from pathlib import Path

from pydantic import BaseModel, TypeAdapter, ValidationError

from talentpulse_ai.agent_foundation.contracts import (
    AgentErrorCode,
    ModelDecision,
    UnstructuredTextResponse,
    parse_model_decision,
)
from talentpulse_ai.core.exceptions import (
    ProviderFailure,
    ProviderFailureCategory,
    ProviderFailureDetails,
    ProviderName,
    provider_failure_details,
)
from talentpulse_ai.core.logging import agent_response_shape, validation_error_summary
from talentpulse_ai.modules.rag_chatbot.schemas import GenerationProvider

_GEMINI_DECISION_SCHEMA: dict[str, object] = {
    "type": "object",
    "properties": {
        "kind": {"type": "string", "enum": ["final", "tool_call"]},
        "output": {"type": "object", "additionalProperties": True},
        "tool_id": {"type": "string"},
        "input": {"type": "object", "additionalProperties": True},
    },
    "required": ["kind"],
    "additionalProperties": False,
}

def _log_raw_response(
    raw: object,
    provider: str | None,
    model: str | None,
) -> None:
    try:
        log_dir = Path("logs")
        log_dir.mkdir(parents=True, exist_ok=True)

        # Serialize raw response
        if isinstance(raw, UnstructuredTextResponse):
            raw_data = raw.text

        elif isinstance(raw, BaseModel):
            raw_data = raw.model_dump(mode="json")

        elif isinstance(raw, (dict, list, str)):
            raw_data = raw

        else:
            raw_data = str(raw)

        record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "provider": provider,
            "model": model,
            "raw_type": type(raw).__name__,
            "raw": raw_data,
        }

        with open(
            log_dir / "raw_responses.jsonl",
            "a",
            encoding="utf-8",
        ) as f:
            f.write(
                json.dumps(
                    record,
                    ensure_ascii=False,
                    default=str,
                ) + "\n"
            )

    except Exception:
        logging.getLogger(__name__).exception(
            "Failed to write raw response log"
        )

def _normalize_gemini_decision(value: object) -> object:
    if not isinstance(value, Mapping):
        return value

    keys = set(value)
    kind = value.get("kind")
    if (
        "tool_id" in keys
        and "input" in keys
        and "output" not in keys
        and keys.issubset({"kind", "tool_call_id", "tool_id", "input"})
        and kind != "final"
    ):
        normalized = dict(value)
        normalized["kind"] = "tool_call"
        if not normalized.get("tool_call_id"):
            normalized["tool_call_id"] = str(uuid4())
        return normalized
    if (
        "output" in keys
        and not keys.intersection({"tool_call_id", "tool_id", "input"})
        and keys.issubset({"kind", "output"})
        and kind != "final"
        and kind != "tool_call"
    ):
        normalized = dict(value)
        normalized["kind"] = "final"
        return normalized
    return value


def _normalize_unstructured_decision(value: object) -> object:
    if not isinstance(value, Mapping) or "kind" in value:
        return value

    keys = set(value)
    if (
        "tool_id" in keys
        and "input" in keys
        and "output" not in keys
        and keys.issubset({"tool_id", "input", "tool_call_id"})
    ):
        normalized = dict(value)
        normalized["kind"] = "tool_call"
        if not normalized.get("tool_call_id"):
            normalized["tool_call_id"] = str(uuid4())
        return normalized

    if keys.issubset({"answer_blocks", "claims", "explanation"}) and keys.intersection(
        {"answer_blocks", "explanation"}
    ):
        return {"kind": "final", "output": dict(value)}
    return value


def _bedrock_decision_schema(
    final_output_schema: Mapping[str, object] | None,
    tool_input_schemas: Mapping[str, Mapping[str, object]] | None,
) -> dict[str, object]:
    tools = dict(tool_input_schemas or {})
    output_schema = dict(
        final_output_schema or {"type": "object", "properties": {}, "additionalProperties": False}
    )
    input_schemas = [
        schema
        for schema in tools.values()
        if isinstance(schema.get("properties"), Mapping) and schema["properties"]
    ]
    properties: dict[str, object] = {
        "kind": {
            "type": "string",
            "enum": ["final", "tool_call"] if tools else ["final"],
        },
        "output": ({"anyOf": [output_schema, {"type": "null"}]} if tools else output_schema),
    }
    required = ["kind", "output"]
    if tools:
        tool_id_schema: dict[str, object] = {"type": ["string", "null"]}
        tool_id_schema["enum"] = [*sorted(tools), None]
        properties["tool_id"] = tool_id_schema
        required.append("tool_id")
    if input_schemas:
        properties["input"] = {"anyOf": [*input_schemas, {"type": "null"}]}
        required.append("input")
    return {
        "type": "object",
        "properties": properties,
        "required": required,
        "additionalProperties": False,
    }


def _normalize_bedrock_decision(
    value: object,
    tool_input_schemas: Mapping[str, Mapping[str, object]] | None,
) -> object:
    if not isinstance(value, Mapping):
        return value

    keys = set(value)
    tool_id = value.get("tool_id")
    input_value = value.get("input")
    allowed_tools = tool_input_schemas or {}
    has_input_schemas = any(
        isinstance(schema.get("properties"), Mapping) and schema["properties"]
        for schema in allowed_tools.values()
    )
    expected_keys = {"kind", "output"}
    if allowed_tools:
        expected_keys.add("tool_id")
    if has_input_schemas:
        expected_keys.add("input")
    tool_schema = allowed_tools.get(tool_id) if isinstance(tool_id, str) else None
    empty_tool_input = (
        isinstance(tool_schema, Mapping)
        and isinstance(tool_schema.get("properties"), Mapping)
        and not tool_schema["properties"]
    )
    if (
        value.get("kind") == "final"
        and isinstance(value.get("output"), Mapping)
        and (not allowed_tools or tool_id is None)
        and (not has_input_schemas or input_value is None)
        and keys == expected_keys
    ):
        return {"kind": "final", "output": dict(value["output"])}
    if (
        value.get("kind") == "tool_call"
        and isinstance(tool_id, str)
        and tool_id in allowed_tools
        and (
            isinstance(input_value, Mapping)
            or (input_value is None and (empty_tool_input or not has_input_schemas))
            or ("input" not in expected_keys and empty_tool_input)
        )
        and value.get("output") is None
        and keys == expected_keys
    ):
        return {
            "kind": "tool_call",
            "tool_call_id": str(uuid4()),
            "tool_id": tool_id,
            "input": dict(input_value) if isinstance(input_value, Mapping) else {},
        }
    return value


def _recover_cv_plain_text(
    response: UnstructuredTextResponse,
    final_output_schema: Mapping[str, object] | None,
    tool_input_schemas: Mapping[str, Mapping[str, object]] | None,
) -> object | None:
    properties = final_output_schema.get("properties") if final_output_schema else None
    if not isinstance(properties, Mapping) or not {"answer_blocks", "claims"}.issubset(properties):
        return None

    text = response.text.strip()
    if not text or len(text) > 2_000 or text.startswith(("{", "[", "```")):
        return None

    allowed_tools = tool_input_schemas or {}
    decision: dict[str, object] = {
        "kind": "final",
        "output": {
            "answer_blocks": [{"kind": "ADVICE", "text": text}],
            "claims": [],
        },
    }
    if allowed_tools:
        decision["tool_id"] = None
    if any(
        isinstance(schema.get("properties"), Mapping) and schema["properties"]
        for schema in allowed_tools.values()
    ):
        decision["input"] = None
    return _normalize_bedrock_decision(decision, tool_input_schemas)


class AgentModelError(RuntimeError):
    def __init__(
        self,
        code: AgentErrorCode,
        safe_message: str,
        *,
        details: ProviderFailureDetails | None = None,
        attempt_index: int | None = None,
        validation_errors: str | None = None,
        response_shape: str | None = None,
    ) -> None:
        super().__init__(safe_message)
        self.code = code
        self.safe_message = safe_message
        self.details = details
        self.attempt_index = attempt_index
        self.validation_errors = validation_errors
        self.response_shape = response_shape


class AgentModelAdapter:
    """Normalize existing generation providers into validated agent decisions."""

    def __init__(self, provider: GenerationProvider, *, direct_output: bool = False) -> None:
        self._provider = provider
        self._direct_output = direct_output
        self._decision_adapter: TypeAdapter[ModelDecision] = TypeAdapter(ModelDecision)

    @property
    def supports_structured_outputs(self) -> bool:
        return getattr(self._provider, "supports_structured_outputs", False) is True

    @property
    def provider_name(self) -> str | None:
        provider_name = getattr(self._provider, "provider_name", None)
        return provider_name if isinstance(provider_name, str) else None

    def _provider_details(
        self,
        exc: BaseException,
        *,
        duration_ms: int,
        category: ProviderFailureCategory | None = None,
    ) -> ProviderFailureDetails | None:
        provider_name = getattr(self._provider, "provider_name", None)
        if not isinstance(provider_name, str) or provider_name not in {
            "gemini",
            "bedrock",
            "ollama",
            "cohere",
            "qdrant",
        }:
            return None
        model_name = getattr(self._provider, "model_name", None)
        return provider_failure_details(
            exc,
            provider=cast(ProviderName, provider_name),
            model=model_name if isinstance(model_name, str) else None,
            duration_ms=duration_ms,
            category=category,
        )

    def decide(
        self,
        prompt: str,
        *,
        timeout: float | None = None,
        final_output_schema: Mapping[str, object] | None = None,
        tool_input_schemas: Mapping[str, Mapping[str, object]] | None = None,
        allow_text_recovery: bool = False,
    ) -> ModelDecision:
        generate_structured = getattr(self._provider, "generate_structured", None)
        provider_name = getattr(self._provider, "provider_name", None)
        use_structured_output = callable(generate_structured) and (
            provider_name != "bedrock" or self.supports_structured_outputs
        )
        started_at = time.perf_counter()
        try:
            if use_structured_output:
                if not callable(generate_structured):
                    raise AgentModelError(
                        AgentErrorCode.PROVIDER_ERROR,
                        "Model provider does not support structured outputs.",
                    )
                schema: Mapping[str, object]
                if self._direct_output:
                    if tool_input_schemas or final_output_schema is None:
                        raise AgentModelError(
                            AgentErrorCode.PROVIDER_ERROR,
                            "Direct structured output requires one final schema and no tools.",
                        )
                    schema = final_output_schema
                    prompt += (
                        "\nReturn the final output directly, matching the supplied schema. "
                        "Do not wrap it in a decision envelope and do not call tools."
                    )
                elif provider_name == "gemini":
                    schema = _GEMINI_DECISION_SCHEMA
                    prompt += (
                        '\nReturn a decision object. Use {"kind":"final",'
                        '"output":...} for a final answer, or {"kind":"tool_call",'
                        '"tool_id":...,"input":...} to call a listed tool. '
                        "Do not return tool_call_id; the application assigns it."
                    )
                elif provider_name == "bedrock":
                    schema = _bedrock_decision_schema(final_output_schema, tool_input_schemas)
                    has_tool_inputs = any(
                        isinstance(tool_schema.get("properties"), Mapping)
                        and tool_schema["properties"]
                        for tool_schema in (tool_input_schemas or {}).values()
                    )
                    if has_tool_inputs:
                        prompt += (
                            "\nReturn the schema-constrained decision. Set output to the final "
                            "payload only when kind is final; otherwise set output to null. For "
                            "tool_call, use only a listed tool_id and provide its schema-valid "
                            "input. Set tool_id and input to null for final decisions."
                        )
                    elif tool_input_schemas:
                        prompt += (
                            "\nReturn the schema-constrained decision. Set output to the final "
                            "payload only when kind is final; otherwise set output to null. For "
                            "tool_call, use only a listed tool_id; these tools take no input. "
                            "Set tool_id to null for final decisions."
                        )
                    else:
                        prompt += (
                            "\nReturn a final decision using the schema-constrained output. "
                            "No tools are available for this request."
                        )
                else:
                    schema = cast(Mapping[str, object], self._decision_adapter.json_schema())
                raw = generate_structured(prompt, schema, timeout)

            elif timeout is not None:
                generate_with_timeout = getattr(self._provider, "generate_with_timeout", None)
                if not callable(generate_with_timeout):
                    raise AgentModelError(
                        AgentErrorCode.PROVIDER_ERROR,
                        "Model provider does not support bounded requests.",
                    )
                prompt += (
                    "\nReturn exactly one JSON decision envelope: "
                    '{"kind":"final","output":{...}} for a final answer, or '
                    '{"kind":"tool_call","tool_id":"...","input":{...}} '
                    "to call a listed tool. The final output schema above applies only to "
                    "the value inside output. Do not return tool_call_id; the application "
                    "assigns it."
                )
                raw = generate_with_timeout(prompt, timeout=timeout)
            else:
                raw = self._provider.generate(prompt)
        except AgentModelError:
            raise
        except Exception as exc:
            details = (
                exc.details
                if isinstance(exc, ProviderFailure) and exc.details is not None
                else self._provider_details(
                    exc, duration_ms=round((time.perf_counter() - started_at) * 1000)
                )
            )
            raise AgentModelError(
                AgentErrorCode.PROVIDER_ERROR,
                "Model provider request failed.",
                details=details,
            ) from None

        _log_raw_response(
            raw=raw,
            provider=provider_name,
            model=getattr(self._provider, "model_name", None),
        )

        try:
            if isinstance(raw, str):
                raw = json.loads(raw)
            elif isinstance(raw, BaseModel):
                raw = raw.model_dump(mode="python")
            if self._direct_output:
                raw = {"kind": "final", "output": raw}
            if isinstance(raw, UnstructuredTextResponse):
                raw = (
                    _recover_cv_plain_text(raw, final_output_schema, tool_input_schemas)
                    if allow_text_recovery
                    else None
                )
                if raw is None:
                    raise AgentModelError(
                        AgentErrorCode.OUTPUT_INVALID,
                        "Model returned text outside the permitted CV recovery path.",
                    )
            if getattr(self._provider, "provider_name", None) == "gemini":
                raw = _normalize_gemini_decision(raw)
            elif provider_name == "bedrock" and use_structured_output:
                raw = _normalize_bedrock_decision(raw, tool_input_schemas)
            elif not use_structured_output:
                raw = _normalize_unstructured_decision(raw)
            return parse_model_decision(raw)
        except ValidationError as exc:
            validation_errors = validation_error_summary(exc)
            if validation_errors == "none":
                validation_errors = "decision:invalid_schema"
        except json.JSONDecodeError:
            validation_errors = "decision:invalid_json"
        except (TypeError, ValueError):
            validation_errors = "decision:invalid"

        details = self._provider_details(
            ValueError("invalid model decision"),
            duration_ms=round((time.perf_counter() - started_at) * 1000),
            category="invalid_output",
        )
        response_shape = agent_response_shape(raw)
        raise AgentModelError(
            AgentErrorCode.OUTPUT_INVALID,
            "Model returned an invalid decision.",
            details=details,
            validation_errors=validation_errors,
            response_shape=response_shape,
        ) from None
