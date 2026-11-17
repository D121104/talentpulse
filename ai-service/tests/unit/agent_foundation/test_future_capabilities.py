from datetime import UTC, datetime

from pydantic import BaseModel

from talentpulse_ai.agent_foundation.approval import create_approval_request
from talentpulse_ai.agent_foundation.contracts import (
    AgentDefinition,
    ExecutionPolicy,
    FinalDecision,
    parse_model_decision,
)
from talentpulse_ai.modules.cv_generator.schemas import CvDraft, CvDraftRequest
from talentpulse_ai.modules.rag_chatbot.schemas import RagGenerateRequest, RagGenerateResponse


def test_future_capabilities_keep_existing_input_and_output_contracts() -> None:
    capability_contracts = (
        ("rag.generate", RagGenerateRequest, RagGenerateResponse, frozenset({"rag.retrieve"})),
        ("cv.generate", CvDraftRequest, CvDraft, frozenset()),
    )

    definitions = [
        AgentDefinition(
            capability_id=capability_id,
            model_profile="future-capability-profile",
            output_model=response_model,
            tool_allowlist=tool_allowlist,
            execution_policy=ExecutionPolicy(),
        )
        for capability_id, request_model, response_model, tool_allowlist in capability_contracts
        if issubclass(request_model, BaseModel) and issubclass(response_model, BaseModel)
    ]

    assert [definition.capability_id for definition in definitions] == [
        "rag.generate",
        "cv.generate",
    ]
    assert definitions[0].output_model is RagGenerateResponse
    assert definitions[1].output_model is CvDraft
    assert "citation_keys" in RagGenerateResponse.model_fields
    assert CvDraft.model_fields["generation_mode"].default == "EDITOR_ONLY"


def test_future_capabilities_share_typed_model_and_reference_only_approval_contracts() -> None:
    decision = parse_model_decision({"kind": "final", "output": {"answer": "synthetic"}})
    request = create_approval_request(
        operation_ref="future-owner-operation",
        resource_ref="opaque-resource-reference",
        expected_version="version-1",
        action_code="APPROVE_PUBLISH",
        now=datetime(2026, 11, 17, tzinfo=UTC),
    )

    assert isinstance(decision, FinalDecision)
    assert request.resource_ref == "opaque-resource-reference"
    assert set(type(request).model_fields) == {
        "approval_id",
        "operation_ref",
        "resource_ref",
        "expected_version",
        "action_code",
        "created_at",
        "expires_at",
        "graph_schema_version",
    }
    assert not {"cv_text", "prompt", "model_output", "credential"}.intersection(
        type(request).model_fields
    )
