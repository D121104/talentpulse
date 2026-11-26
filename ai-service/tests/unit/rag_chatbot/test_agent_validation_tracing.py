import logging
from uuid import uuid4

import pytest

from talentpulse_ai.agent_foundation.contracts import (
    AgentDefinition,
    AgentRequest,
    AgentStatus,
    FinalDecision,
)
from talentpulse_ai.agent_foundation.execution import execute_agent
from talentpulse_ai.agent_foundation.model import AgentModelAdapter
from talentpulse_ai.core.exceptions import ServiceError
from talentpulse_ai.core.logging import agent_response_shape
from talentpulse_ai.modules.rag_chatbot.agent import CareerChatAgent
from talentpulse_ai.modules.rag_chatbot.generation.generator import GenerationService
from talentpulse_ai.modules.rag_chatbot.schemas import (
    AgentAnswer,
    ExplicitFilters,
    IdentityFields,
    RagGenerateRequest,
    ServicePolicy,
    StructuredFilterState,
)

PRIVATE = "SYNTHETIC_PRIVATE_AGENT_OUTPUT"


class InvalidFinalModel:
    def decide(self, prompt, **kwargs):
        return FinalDecision(output={"private_note": PRIVATE})


class StructuredProvider:
    provider_name = "gemini"
    model_name = "synthetic-model"

    def __init__(self, responses: list[object]) -> None:
        self.responses = iter(responses)

    def generate_structured(self, prompt, schema, timeout=None, *, num_predict=None) -> object:
        return next(self.responses)


def make_request() -> RagGenerateRequest:
    return RagGenerateRequest(
        identity=IdentityFields(
            **{
                key: uuid4()
                for key in (
                    "request_id",
                    "trace_id",
                    "operation_attempt_id",
                    "client_message_id",
                    "user_id",
                    "session_id",
                )
            }
        ),
        normalized_user_message="Give general career advice.",
        intent="ADVICE",
        locale="en",
        filter_state=StructuredFilterState(),
        explicit_filters=ExplicitFilters(),
        policy=ServicePolicy(data_scope="PUBLIC_ACTIVE_JOBS", max_candidates=20),
    )


def test_agent_response_shape_reports_schema_keys_without_values() -> None:
    response = {
        "kind": "unexpected-private-tag",
        "private_note": PRIVATE,
        "output": {
            "answer_blocks": [{"kind": "ADVICE", "text": PRIVATE}],
            "private_claim": PRIVATE,
        },
    }

    shape = agent_response_shape(response)

    assert shape == (
        "object.kind=unsupported.keys=kind-output.extra=1.output=object."
        "output_fields=answer_blocks:array.output_extra=1"
    )
    assert PRIVATE not in shape
    assert "private_note" not in shape
    assert "private_claim" not in shape


def test_final_output_and_repair_validation_log_safe_field_paths(caplog) -> None:
    invalid = {"private_note": PRIVATE}
    provider = StructuredProvider(
        [
            {"kind": "final", "output": invalid},
            {"kind": "final", "output": invalid},
        ]
    )

    with caplog.at_level(logging.WARNING), pytest.raises(ServiceError) as error:
        CareerChatAgent(AgentModelAdapter(provider)).generate(make_request())

    assert error.value.status_code == 503
    events = [
        record.getMessage()
        for record in caplog.records
        if record.getMessage().startswith("ai_agent_validation_failure ")
    ]
    assert len(events) == 2
    assert "stage=final_output" in events[0]
    assert "stage=repair_output" in events[1]
    assert "answer_blocks:missing" in events[0]
    assert (
        "response_shape=object.kind=final.keys=kind-output.output=object.output_extra=1"
        in events[0]
    )
    assert all(PRIVATE not in event and "private_note" not in event for event in events)


def test_invalid_model_decision_logs_sanitized_pydantic_errors(caplog) -> None:
    valid_output = {
        "answer_blocks": [{"kind": "ADVICE", "text": "General guidance."}],
        "claims": [],
        "citation_keys": [],
        "referenced_job_ids": [],
    }
    provider = StructuredProvider(
        [
            {"kind": "unknown", "private_note": PRIVATE},
            {"kind": "final", "output": valid_output},
        ]
    )

    with caplog.at_level(logging.WARNING):
        response = CareerChatAgent(AgentModelAdapter(provider)).generate(make_request())

    assert response.answer_status == "COMPLETE"
    events = [
        record.getMessage()
        for record in caplog.records
        if record.getMessage().startswith("ai_provider_failure ")
    ]
    assert len(events) == 1
    assert "category=invalid_output" in events[0]
    assert "validation_errors=" in events[0]
    assert "validation_errors=decision:invalid_schema" in events[0]
    assert "response_shape=object.kind=unsupported.keys=kind.extra=1" in events[0]
    assert PRIVATE not in events[0]
    assert "private_note" not in events[0]


def test_finalizer_logs_safe_schema_paths_before_using_fallback(caplog) -> None:
    with caplog.at_level(logging.WARNING):
        response = GenerationService.finalize_agent_output(
            make_request(), {"private_note": PRIVATE}
        )

    assert response.degraded is True
    events = [
        record.getMessage()
        for record in caplog.records
        if record.getMessage().startswith("ai_agent_validation_failure ")
    ]
    assert len(events) == 1
    assert "stage=final_output" in events[0]
    assert "answer_blocks:missing" in events[0]
    assert PRIVATE not in events[0]
    assert "private_note" not in events[0]


def test_executor_logs_safe_path_when_capability_output_validation_fails(caplog) -> None:
    rag_request = make_request()
    request = AgentRequest(
        run_id=uuid4(),
        correlation_id=str(rag_request.identity.trace_id),
        capability_id="rag.generate",
        prompt="Synthetic prompt",
        authorized_context={"rag_request": rag_request},
    )
    definition = AgentDefinition(
        capability_id="rag.generate",
        model_profile="test",
        output_model=AgentAnswer,
    )

    with caplog.at_level(logging.WARNING):
        result = execute_agent(request, definition, InvalidFinalModel())

    assert result.status is AgentStatus.FAILED
    events = [
        record.getMessage()
        for record in caplog.records
        if record.getMessage().startswith("ai_agent_validation_failure ")
    ]
    assert len(events) == 1
    assert "stage=capability_output" in events[0]
    assert f"request_id={rag_request.identity.request_id}" in events[0]
    assert f"trace_id={rag_request.identity.trace_id}" in events[0]
    assert "answer_blocks:missing" in events[0]
    assert PRIVATE not in events[0]
    assert "private_note" not in events[0]
