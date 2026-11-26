from __future__ import annotations

import json

import pytest
from botocore.exceptions import ClientError
from botocore.session import get_session
from botocore.validate import validate_parameters

from talentpulse_ai.agent_foundation.contracts import UnstructuredTextResponse
from talentpulse_ai.agent_foundation.model import _bedrock_decision_schema
from talentpulse_ai.core.exceptions import ProviderFailure
from talentpulse_ai.infrastructure.llm.bedrock import (
    BedrockNovaGenerationAdapter,
    _bedrock_response_schema,
)
from talentpulse_ai.infrastructure.llm.gemini import (
    GeminiGenerationAdapter,
    _gemini_response_schema,
)
from talentpulse_ai.modules.cv_generator.schemas import CvGenerationContent


def test_bedrock_decision_schema_requires_final_payload_without_tools() -> None:
    output_schema = {
        "type": "object",
        "properties": {"title": {"type": "string"}},
        "required": ["title"],
        "additionalProperties": False,
    }

    decision_schema = _bedrock_decision_schema(output_schema, None)

    assert decision_schema["properties"]["output"] == output_schema
    assert decision_schema["required"] == ["kind", "output"]


def test_bedrock_decision_schema_keeps_null_output_for_tool_calls() -> None:
    output_schema = {
        "type": "object",
        "properties": {"title": {"type": "string"}},
        "required": ["title"],
        "additionalProperties": False,
    }
    tool_schema = {
        "lookup": {
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
            "additionalProperties": False,
        }
    }

    decision_schema = _bedrock_decision_schema(output_schema, tool_schema)

    assert decision_schema["properties"]["output"] == {"anyOf": [output_schema, {"type": "null"}]}


def test_gemini_projection_removes_complexity_bounds_but_preserves_contract() -> None:
    schema = {
        "$defs": {"Block": {"type": "object", "properties": {"text": {"type": "string"}}}},
        "type": "object",
        "properties": {
            "answer_blocks": {
                "type": "array",
                "minItems": 1,
                "maxItems": 20,
                "items": {"$ref": "#/$defs/Block"},
            },
            "claims": {
                "type": "array",
                "maxItems": 50,
                "items": {
                    "type": "object",
                    "properties": {
                        "kind": {"type": "string", "enum": ["ADVICE", "INFERENCE"]},
                        "value": {
                            "anyOf": [
                                {"type": "string", "minLength": 1, "maxLength": 2000},
                                {"type": "null"},
                            ]
                        },
                    },
                    "required": ["kind", "value"],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["answer_blocks", "claims"],
        "additionalProperties": False,
    }
    original = json.loads(json.dumps(schema))

    projected = _gemini_response_schema(schema)

    assert schema == original
    assert projected["required"] == ["answer_blocks", "claims"]
    assert projected["additionalProperties"] is False
    assert projected["$defs"] == schema["$defs"]
    properties = projected["properties"]
    answer_blocks = properties["answer_blocks"]
    claims = properties["claims"]
    assert "minItems" not in answer_blocks and "maxItems" not in answer_blocks
    assert "maxItems" not in claims
    claim_properties = claims["items"]["properties"]
    assert claim_properties["kind"]["enum"] == ["ADVICE", "INFERENCE"]
    assert claim_properties["value"]["type"] == ["string", "null"]
    assert "anyOf" not in claim_properties["value"]
    assert "minLength" not in claim_properties["value"]
    assert "maxLength" not in claim_properties["value"]


def test_gemini_structured_request_uses_projected_schema(monkeypatch) -> None:
    requests: list[object] = []

    class Response:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, *args: object) -> None:
            del args

        def read(self) -> bytes:
            return json.dumps(
                {"candidates": [{"content": {"parts": [{"text": '{"answer_blocks": []}'}]}}]}
            ).encode()

    def fake_urlopen(request: object, timeout: float) -> Response:
        del timeout
        requests.append(request)
        return Response()

    monkeypatch.setattr("talentpulse_ai.infrastructure.llm.gemini.urlopen", fake_urlopen)
    provider = GeminiGenerationAdapter("test-key", "gemini-2.5-flash")
    schema = {
        "type": "object",
        "properties": {"items": {"type": "array", "maxItems": 50, "items": {"type": "string"}}},
        "required": ["items"],
    }

    provider.generate_structured("prompt", schema, timeout=4.0)

    request_schema = json.loads(requests[0].data)["generationConfig"]["responseJsonSchema"]
    assert "maxItems" not in request_schema["properties"]["items"]
    assert "maxItems" in schema["properties"]["items"]


def test_bedrock_nova_lite_keeps_prompt_json_path_without_native_schema() -> None:
    class ConverseClient:
        def __init__(self) -> None:
            self.calls: list[dict[str, object]] = []

        def converse(self, **kwargs: object) -> object:
            self.calls.append(kwargs)
            return {
                "output": {
                    "message": {"content": [{"text": '{"answer_blocks": [], "claims": []}'}]}
                }
            }

    client = ConverseClient()
    provider = BedrockNovaGenerationAdapter(client, "amazon.nova-lite-v1:0")

    result = provider.generate("Return the existing JSON contract.")

    assert result == {"answer_blocks": [], "claims": []}
    assert client.calls[0]["inferenceConfig"] == {"temperature": 0.0}
    assert "outputConfig" not in client.calls[0]


def test_bedrock_structured_generation_uses_converse_json_schema() -> None:
    class ConverseClient:
        def __init__(self) -> None:
            self.calls: list[dict[str, object]] = []

        def converse(self, **kwargs: object) -> object:
            self.calls.append(kwargs)
            return {
                "output": {
                    "message": {
                        "content": [
                            {"reasoningContent": {"reasoningText": {"text": "private"}}},
                            {"text": '{"kind":"final","output":{},"tool_id":null,"input":null}'},
                        ]
                    }
                }
            }

    client = ConverseClient()
    client_factory_calls: list[float] = []
    provider = BedrockNovaGenerationAdapter(
        client,
        "global.moonshotai.kimi-k3.1",
        agent_client_factory=lambda timeout: client_factory_calls.append(timeout) or client,
    )
    schema = {
        "type": "object",
        "properties": {"kind": {"type": "string", "enum": ["final", "tool_call"]}},
        "required": ["kind"],
        "additionalProperties": False,
    }

    result = provider.generate_structured("Return a decision.", schema, timeout=4.0)

    assert result == {"kind": "final", "output": {}, "tool_id": None, "input": None}
    request = client.calls[0]
    assert request["modelId"] == "global.moonshotai.kimi-k3.1"
    assert request["inferenceConfig"] == {"maxTokens": 65536}
    assert client_factory_calls == [4.0]
    assert request["outputConfig"]["textFormat"]["type"] == "json_schema"
    assert (
        json.loads(request["outputConfig"]["textFormat"]["structure"]["jsonSchema"]["schema"])
        == schema
    )
    converse = get_session().get_service_model("bedrock-runtime").operation_model("Converse")
    validate_parameters(request, converse.input_shape)


def test_bedrock_structured_generation_marks_non_json_text_without_logging_it() -> None:
    class ConverseClient:
        def converse(self, **kwargs: object) -> object:
            del kwargs
            return {"output": {"message": {"content": [{"text": "Private CV analysis text."}]}}}

    client = ConverseClient()
    provider = BedrockNovaGenerationAdapter(
        client,
        "global.moonshotai.kimi-k3.1",
        agent_client_factory=lambda _timeout: client,
    )

    result = provider.generate_structured(
        "safe prompt",
        {"type": "object", "properties": {}, "additionalProperties": False},
        timeout=3.0,
    )

    assert isinstance(result, UnstructuredTextResponse)
    assert result.text == "Private CV analysis text."
    assert "Private CV analysis text." not in repr(result)


def test_bedrock_structured_validation_failure_keeps_sanitized_aws_message() -> None:
    class RejectingClient:
        def converse(self, **kwargs: object) -> object:
            del kwargs
            raise ClientError(
                {
                    "Error": {
                        "Code": "ValidationException",
                        "Message": "Unsupported schema keyword maxLength for user@example.com",
                    },
                    "ResponseMetadata": {"HTTPStatusCode": 400},
                },
                "Converse",
            )

    client = RejectingClient()
    provider = BedrockNovaGenerationAdapter(
        client,
        "global.moonshotai.kimi-k3.1",
        agent_client_factory=lambda _timeout: client,
    )
    schema = {
        "type": "object",
        "properties": {"kind": {"type": "string", "enum": ["final"]}},
        "required": ["kind"],
        "additionalProperties": False,
    }

    with pytest.raises(ProviderFailure) as caught:
        provider.generate_structured("safe prompt", schema, timeout=5.0)

    assert caught.value.details is not None
    assert caught.value.details.provider_message == (
        "Unsupported_schema_keyword_maxLength_for_REDACTED"
    )


def test_agent_contracts_project_to_bedrock_structured_schema_subset() -> None:
    from talentpulse_ai.modules.rag_chatbot.agent_tools import (
        build_matching_evidence_tool,
        build_retrieval_context_tool,
        build_skill_framework_tool,
    )
    from talentpulse_ai.modules.rag_chatbot.generation.prompt_builder import (
        ComparisonExplanation,
    )
    from talentpulse_ai.modules.rag_chatbot.schemas import AgentAnswer, AgentCvAnswer

    tools = (
        build_retrieval_context_tool(),
        build_skill_framework_tool(),
        build_matching_evidence_tool(),
    )
    tool_schemas = {tool.tool_id: tool.input_model.model_json_schema() for tool in tools}

    schemas_to_build = (
        (AgentAnswer, ("rag.retrieve_context",)),
        (AgentAnswer, ("rag.retrieve_context", "career.lookup_skill_framework")),
        (AgentCvAnswer, ("rag.retrieve_context",)),
        (ComparisonExplanation, ("rag.retrieve_context", "career.read_matching_evidence")),
    )
    for output_model, tool_ids in schemas_to_build:
        selected_tool_schemas = {tool_id: tool_schemas[tool_id] for tool_id in tool_ids}
        schema = _bedrock_response_schema(
            _bedrock_decision_schema(output_model.model_json_schema(), selected_tool_schemas)
        )
        schema_text = json.dumps(schema)
        assert '"$ref"' not in schema_text
        assert '"$defs"' not in schema_text
        assert '"oneOf"' not in schema_text
        assert '"maxItems"' not in schema_text
        assert '"maxLength"' not in schema_text
        assert '"minLength"' not in schema_text
        assert '"pattern"' not in schema_text

        def assert_closed_objects(value: object) -> None:
            if isinstance(value, dict):
                schema_type = value.get("type")
                if schema_type == "object" or (
                    isinstance(schema_type, list) and "object" in schema_type
                ):
                    assert value["additionalProperties"] is False
                for child in value.values():
                    assert_closed_objects(child)
            elif isinstance(value, list):
                for child in value:
                    assert_closed_objects(child)

        assert_closed_objects(schema)

        def count_constraints(value: object) -> tuple[int, int]:
            if isinstance(value, dict):
                properties = value.get("properties", {})
                required = value.get("required", [])
                optional = len(properties) - len(required) if isinstance(properties, dict) else 0
                unions = (
                    sum(
                        1
                        for property_schema in properties.values()
                        if isinstance(property_schema, dict)
                        and (
                            isinstance(property_schema.get("type"), list)
                            or "anyOf" in property_schema
                        )
                    )
                    if isinstance(properties, dict)
                    else 0
                )
                for child in value.values():
                    child_optional, child_unions = count_constraints(child)
                    optional += child_optional
                    unions += child_unions
                return optional, unions
            if isinstance(value, list):
                totals = [count_constraints(child) for child in value]
                return sum(item[0] for item in totals), sum(item[1] for item in totals)
            return 0, 0

        optional_properties, union_properties = count_constraints(schema)
        assert optional_properties <= 12
        assert union_properties <= 16


def test_cv_generation_schema_fits_bedrock_structured_output_limits() -> None:
    decision_schema = _bedrock_decision_schema(
        CvGenerationContent.model_json_schema(),
        None,
    )
    schema = _bedrock_response_schema(decision_schema)

    generated_content = decision_schema["properties"]["output"]
    assert isinstance(generated_content, dict)
    assert set(generated_content["required"]) == {
        "title",
        "education",
        "projects",
        "work_experience",
        "skills",
        "activities",
        "certificates",
        "awards",
        "section_order",
    }

    def count_constraints(value: object) -> tuple[int, int]:
        if isinstance(value, dict):
            properties = value.get("properties", {})
            required = value.get("required", [])
            optional = len(properties) - len(required) if isinstance(properties, dict) else 0
            unions = (
                sum(
                    1
                    for property_schema in properties.values()
                    if isinstance(property_schema, dict)
                    and (
                        isinstance(property_schema.get("type"), list) or "anyOf" in property_schema
                    )
                )
                if isinstance(properties, dict)
                else 0
            )
            for child in value.values():
                child_optional, child_unions = count_constraints(child)
                optional += child_optional
                unions += child_unions
            return optional, unions
        if isinstance(value, list):
            totals = [count_constraints(child) for child in value]
            return sum(item[0] for item in totals), sum(item[1] for item in totals)
        return 0, 0

    assert count_constraints(schema) == (10, 9)
