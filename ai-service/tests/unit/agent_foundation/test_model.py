import json
from collections.abc import Mapping

import pytest

from talentpulse_ai.agent_foundation.contracts import (
    AgentErrorCode,
    FinalDecision,
    ToolCallDecision,
    UnstructuredTextResponse,
)
from talentpulse_ai.agent_foundation.model import AgentModelAdapter, AgentModelError


class StructuredFakeProvider:
    def __init__(self, response: object) -> None:
        self.response = response
        self.received_schema: Mapping[str, object] | None = None
        self.received_timeout: float | None = None

    def generate_structured(
        self,
        prompt: str,
        schema: Mapping[str, object],
        timeout: float | None = None,
        *,
        num_predict: int | None = None,
    ) -> object:
        self.received_schema = schema
        self.received_timeout = timeout
        return self.response


class TextFakeProvider:
    def __init__(self, response: object) -> None:
        self.response = response
        self.received_prompt: str | None = None

    def generate(self, prompt: str) -> object:
        self.received_prompt = prompt
        return self.response

    def generate_with_timeout(self, prompt: str, *, timeout: float) -> object:
        self.received_prompt = prompt
        return self.response


def test_adapter_uses_structured_provider_and_normalizes_typed_decision() -> None:
    provider = StructuredFakeProvider({"kind": "final", "output": {"answer": "ok"}})
    adapter = AgentModelAdapter(provider)

    decision = adapter.decide("capability prompt", timeout=2.5)

    assert isinstance(decision, FinalDecision)
    assert decision.output == {"answer": "ok"}
    assert provider.received_schema is not None
    assert provider.received_timeout == 2.5


@pytest.mark.parametrize("kind", [None, "function_call", "tool_call"])
def test_gemini_normalizes_tool_decision_with_missing_or_unsupported_kind(kind) -> None:
    class GeminiFakeProvider(StructuredFakeProvider):
        provider_name = "gemini"

    response = {
        "tool_id": "rag.retrieve_context",
        "input": {},
    }
    if kind is not None:
        response["kind"] = kind
    provider = GeminiFakeProvider(response)

    decision = AgentModelAdapter(provider).decide("capability prompt", timeout=2.5)

    assert isinstance(decision, ToolCallDecision)
    assert decision.kind == "tool_call"
    assert decision.tool_call_id
    assert decision.tool_id == "rag.retrieve_context"
    assert provider.received_schema is not None
    assert "oneOf" not in provider.received_schema
    assert "discriminator" not in provider.received_schema
    kind_schema = provider.received_schema["properties"]["kind"]
    assert kind_schema["enum"] == ["final", "tool_call"]
    assert "kind" in provider.received_schema["required"]


def test_adapter_parses_typed_envelope_from_existing_generation_provider() -> None:
    payload = {"kind": "final", "output": {"answer": "ok"}}
    adapter = AgentModelAdapter(TextFakeProvider(json.dumps(payload)))

    decision = adapter.decide("capability prompt")

    assert isinstance(decision, FinalDecision)
    assert decision.output == payload["output"]


def test_unstructured_bedrock_final_payload_is_wrapped_as_a_final_decision() -> None:
    class BedrockFakeProvider(TextFakeProvider):
        provider_name = "bedrock"

    payload = {"answer_blocks": [{"kind": "ADVICE", "text": "Grounded answer"}]}
    provider = BedrockFakeProvider(payload)

    decision = AgentModelAdapter(provider).decide("career prompt", timeout=3.0)

    assert isinstance(decision, FinalDecision)
    assert decision.output == payload
    assert provider.received_prompt is not None
    assert '"kind":"final","output":{...}' in provider.received_prompt


def test_unstructured_bedrock_tool_payload_gets_kind_and_application_call_id() -> None:
    class BedrockFakeProvider(TextFakeProvider):
        provider_name = "bedrock"

    payload = {"tool_id": "rag.retrieve_context", "input": {"query": "role"}}

    decision = AgentModelAdapter(BedrockFakeProvider(payload)).decide("career prompt", timeout=3.0)

    assert isinstance(decision, ToolCallDecision)
    assert decision.kind == "tool_call"
    assert decision.tool_call_id
    assert decision.tool_id == "rag.retrieve_context"
    assert decision.input == {"query": "role"}


def test_bedrock_uses_structured_decision_schema_for_final_and_allowed_tools() -> None:
    class StructuredBedrockProvider(TextFakeProvider):
        provider_name = "bedrock"
        supports_structured_outputs = True

        def generate_structured(self, prompt, schema, timeout=None):
            self.structured_prompt = prompt
            self.structured_schema = schema
            return {
                "kind": "final",
                "output": {"answer_blocks": []},
                "tool_id": None,
                "input": None,
            }

    provider = StructuredBedrockProvider({})
    decision = AgentModelAdapter(provider).decide(
        "career prompt",
        timeout=3.0,
        final_output_schema={
            "type": "object",
            "properties": {"answer_blocks": {"type": "array", "items": {"type": "string"}}},
            "required": ["answer_blocks"],
            "additionalProperties": False,
        },
        tool_input_schemas={
            "rag.retrieve_context": {
                "type": "object",
                "properties": {"query": {"type": "string"}},
                "required": ["query"],
                "additionalProperties": False,
            }
        },
    )

    assert isinstance(decision, FinalDecision)
    assert decision.output == {"answer_blocks": []}
    assert "oneOf" not in provider.structured_schema
    assert provider.structured_schema["required"] == ["kind", "output", "tool_id", "input"]
    assert provider.structured_schema["properties"]["kind"]["enum"] == ["final", "tool_call"]
    assert provider.structured_schema["properties"]["output"]["anyOf"][0]["properties"] == {
        "answer_blocks": {"type": "array", "items": {"type": "string"}}
    }
    assert provider.structured_schema["properties"]["tool_id"]["enum"] == [
        "rag.retrieve_context",
        None,
    ]
    assert provider.structured_schema["properties"]["input"]["anyOf"][0]["properties"] == {
        "query": {"type": "string"}
    }


def test_bedrock_empty_tool_input_is_omitted_and_normalized_to_empty_object() -> None:
    class StructuredBedrockProvider(TextFakeProvider):
        provider_name = "bedrock"
        supports_structured_outputs = True

        def generate_structured(self, prompt, schema, timeout=None):
            self.structured_prompt = prompt
            self.structured_schema = schema
            return {
                "kind": "tool_call",
                "output": None,
                "tool_id": "rag.retrieve_context",
            }

    provider = StructuredBedrockProvider({})
    decision = AgentModelAdapter(provider).decide(
        "career prompt",
        timeout=3.0,
        final_output_schema={"type": "object", "properties": {}, "additionalProperties": False},
        tool_input_schemas={
            "rag.retrieve_context": {
                "type": "object",
                "properties": {},
                "required": [],
                "additionalProperties": False,
            }
        },
    )

    assert isinstance(decision, ToolCallDecision)
    assert decision.tool_id == "rag.retrieve_context"
    assert decision.input == {}
    assert "input" not in provider.structured_schema["properties"]
    assert "input" not in provider.structured_schema["required"]
    assert "these tools take no input" in provider.structured_prompt


def test_bedrock_plain_text_is_recovered_only_for_cv_analysis() -> None:
    class StructuredBedrockProvider(TextFakeProvider):
        provider_name = "bedrock"
        supports_structured_outputs = True

        def generate_structured(self, prompt, schema, timeout=None):
            return UnstructuredTextResponse("Review the CV's strongest skills and next steps.")

    provider = StructuredBedrockProvider({})
    decision = AgentModelAdapter(provider).decide(
        "career prompt",
        timeout=3.0,
        final_output_schema={
            "type": "object",
            "properties": {"answer_blocks": {}, "claims": {}},
            "required": ["answer_blocks"],
            "additionalProperties": False,
        },
        tool_input_schemas={
            "rag.retrieve_context": {
                "type": "object",
                "properties": {},
                "required": [],
                "additionalProperties": False,
            }
        },
        allow_text_recovery=True,
    )

    assert isinstance(decision, FinalDecision)
    assert decision.output == {
        "answer_blocks": [
            {
                "kind": "ADVICE",
                "text": "Review the CV's strongest skills and next steps.",
            }
        ],
        "claims": [],
    }


@pytest.mark.parametrize(
    ("text", "schema"),
    [
        (
            '{"answer_blocks": broken}',
            {"type": "object", "properties": {"answer_blocks": {}, "claims": {}}},
        ),
        (
            "A plain CV answer before the CV retrieval tool ran.",
            {"type": "object", "properties": {"answer_blocks": {}, "claims": {}}},
        ),
        (
            "A plain answer",
            {"type": "object", "properties": {"answer_blocks": {}}},
        ),
    ],
    ids=["malformed-json", "cv-before-retrieval", "non-cv-schema"],
)
def test_bedrock_plain_text_is_not_recovered_for_invalid_outputs(text, schema) -> None:
    class StructuredBedrockProvider(TextFakeProvider):
        provider_name = "bedrock"
        supports_structured_outputs = True

        def generate_structured(self, prompt, decision_schema, timeout=None):
            return UnstructuredTextResponse(text)

    provider = StructuredBedrockProvider({})

    with pytest.raises(AgentModelError) as caught:
        AgentModelAdapter(provider).decide("career prompt", timeout=3.0, final_output_schema=schema)

    assert caught.value.code is AgentErrorCode.OUTPUT_INVALID


def test_adapter_rejects_invalid_decision_without_leaking_raw_output() -> None:
    adapter = AgentModelAdapter(TextFakeProvider('{"kind":"unknown","secret":"private"}'))

    with pytest.raises(AgentModelError) as error:
        adapter.decide("capability prompt")

    assert error.value.code is AgentErrorCode.OUTPUT_INVALID
    assert "private" not in str(error.value)


def test_adapter_normalizes_provider_failure_without_exposing_provider_detail() -> None:
    class FailingProvider:
        def generate(self, prompt: str) -> object:
            raise RuntimeError("provider-secret-payload")

    adapter = AgentModelAdapter(FailingProvider())

    with pytest.raises(AgentModelError) as error:
        adapter.decide("capability prompt")

    assert error.value.code is AgentErrorCode.PROVIDER_ERROR
    assert "provider-secret-payload" not in str(error.value)


def test_adapter_passes_remaining_timeout_to_every_structured_call() -> None:
    provider = StructuredFakeProvider({"kind": "final", "output": {"answer": "ok"}})
    adapter = AgentModelAdapter(provider)

    for remaining_timeout in (2.5, 1.25, 0.125):
        provider.received_timeout = None

        decision = adapter.decide("capability prompt", timeout=remaining_timeout)

        assert isinstance(decision, FinalDecision)
        assert provider.received_timeout == remaining_timeout


def test_adapter_passes_remaining_timeout_to_every_timeout_aware_text_call() -> None:
    class TimeoutAwareProvider:
        def __init__(self) -> None:
            self.received_timeouts: list[float] = []
            self.unbounded_calls = 0

        def generate_with_timeout(self, prompt: str, *, timeout: float) -> object:
            self.received_timeouts.append(timeout)
            return json.dumps({"kind": "final", "output": {"answer": "ok"}})

        def generate(self, prompt: str) -> object:
            self.unbounded_calls += 1
            return json.dumps({"kind": "final", "output": {"answer": "ok"}})

    provider = TimeoutAwareProvider()
    adapter = AgentModelAdapter(provider)
    remaining_timeouts = (2.5, 1.25, 0.125)

    for remaining_timeout in remaining_timeouts:
        decision = adapter.decide("capability prompt", timeout=remaining_timeout)
        assert isinstance(decision, FinalDecision)

    assert provider.unbounded_calls == 0
    assert provider.received_timeouts == list(remaining_timeouts)


def test_adapter_rejects_plain_generation_provider_without_calling_it() -> None:
    class UnboundedProvider:
        def __init__(self) -> None:
            self.calls = 0

        def generate(self, prompt: str) -> object:
            self.calls += 1
            return json.dumps({"kind": "final", "output": {"answer": "ok"}})

    provider = UnboundedProvider()
    adapter = AgentModelAdapter(provider)

    with pytest.raises(AgentModelError) as error:
        adapter.decide("capability prompt", timeout=0.125)

    assert error.value.code is AgentErrorCode.PROVIDER_ERROR
    assert provider.calls == 0
