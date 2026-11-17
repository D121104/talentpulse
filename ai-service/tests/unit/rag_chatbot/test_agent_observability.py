"""T022: request-scoped, redacted Foundation observations for career chat."""

import logging
from importlib import import_module
from unittest.mock import Mock
from uuid import uuid4

import pytest

from talentpulse_ai.agent_foundation import observability
from talentpulse_ai.agent_foundation.contracts import (
    AgentError,
    AgentErrorCode,
    AgentResult,
    AgentStatus,
    AgentUsage,
)
from talentpulse_ai.core.exceptions import ServiceError
from talentpulse_ai.modules.rag_chatbot.schemas import (
    AuthorizedCvSnapshot,
    ExplicitFilters,
    IdentityFields,
    RagGenerateRequest,
    ServicePolicy,
    StructuredFilterState,
)

PRIVATE_MARKERS = (
    "SYNTHETIC_PRIVATE_PROMPT",
    "SYNTHETIC_PRIVATE_HISTORY",
    "SYNTHETIC_PRIVATE_CV_TEXT",
    "SYNTHETIC_RAW_PROVIDER_PAYLOAD",
    "SYNTHETIC_RAW_TOOL_PAYLOAD",
    "SYNTHETIC_PRIVATE_ERROR_DETAIL",
)


@pytest.mark.parametrize(
    ("status", "error_code", "counts"),
    [
        (AgentStatus.COMPLETE, None, (4, 2, 1)),
        (AgentStatus.FAILED, AgentErrorCode.PROVIDER_ERROR, (3, 2, 1)),
        (AgentStatus.CANCELLED, AgentErrorCode.CANCELLED, (2, 1, 1)),
    ],
    ids=["success", "provider-failure", "cancellation"],
)
def test_adapter_records_correlated_redacted_terminal_observation(
    monkeypatch, caplog, status, error_code, counts
) -> None:
    agent_module = import_module("talentpulse_ai.modules.rag_chatbot.agent")
    request = RagGenerateRequest(
        identity=IdentityFields(
            request_id=uuid4(),
            trace_id=uuid4(),
            operation_attempt_id=uuid4(),
            client_message_id=uuid4(),
            user_id=uuid4(),
            session_id=uuid4(),
        ),
        normalized_user_message=PRIVATE_MARKERS[0],
        recent_history=[PRIVATE_MARKERS[1]],
        intent="CV_ANALYSIS",
        locale="en",
        authorized_cv_snapshot=AuthorizedCvSnapshot(
            cv_id=uuid4(),
            content_hash="a" * 64,
            sanitized_text=PRIVATE_MARKERS[2],
            consent_version="synthetic-v1",
        ),
        consent_version="synthetic-v1",
        filter_state=StructuredFilterState(),
        explicit_filters=ExplicitFilters(),
        policy=ServicePolicy(data_scope="PUBLIC_ACTIVE_JOBS", max_candidates=20),
    )
    results: list[AgentResult] = []
    foundation_requests = []

    def execute(foundation_request, definition, model, **kwargs):
        # Isolate capability telemetry from Foundation's own executor logging.
        # Raw execution output is deliberately not a generation response.
        foundation_requests.append(foundation_request)
        result = AgentResult(
            run_id=foundation_request.run_id,
            correlation_id=foundation_request.correlation_id,
            capability_id=foundation_request.capability_id,
            status=status,
            output={
                "raw_provider_payload": PRIVATE_MARKERS[3],
                "raw_tool_payload": PRIVATE_MARKERS[4],
            },
            error=(
                AgentError(code=error_code, safe_message=PRIVATE_MARKERS[5])
                if error_code is not None
                else None
            ),
            usage=AgentUsage(
                steps=counts[0], model_calls=counts[1], tool_calls=counts[2], elapsed_ms=17
            ),
        )
        results.append(result)
        return result

    observations: list[observability.AgentExecutionObservation] = []
    real_record = observability.record_execution_observation

    def record(result):
        observation = real_record(result)
        observations.append(observation)
        return observation

    recorder = Mock(side_effect=record)
    monkeypatch.setattr(observability, "record_execution_observation", recorder)
    # Support both a module-qualified call and the existing Foundation import style.
    monkeypatch.setattr(agent_module, "record_execution_observation", recorder, raising=False)
    executor = Mock(side_effect=execute)
    monkeypatch.setattr(agent_module, "execute_agent", executor)
    finalized_response = object()
    finalizer = Mock(return_value=finalized_response)
    monkeypatch.setattr(agent_module.GenerationService, "finalize_agent_output", finalizer)
    model = Mock()

    with caplog.at_level(logging.INFO):
        if status is AgentStatus.COMPLETE:
            assert agent_module.CareerChatAgent(model=model).generate(request) is finalized_response
        else:
            with pytest.raises(ServiceError):
                agent_module.CareerChatAgent(model=model).generate(request)

    executor.assert_called_once()
    model.decide.assert_not_called()
    if status is not AgentStatus.COMPLETE:
        finalizer.assert_not_called()
    recorder.assert_called_once_with(results[0])
    assert len(observations) == 1
    observation = observations[0]
    assert observation.model_dump(mode="json") == {
        "run_id": str(foundation_requests[0].run_id),
        "correlation_id": str(request.identity.trace_id),
        "capability_id": "rag.generate",
        "implementation": "agent",
        "status": status.value,
        "duration_ms": 17,
        "steps": counts[0],
        "model_calls": counts[1],
        "tool_calls": counts[2],
        "error_type": error_code.value if error_code is not None else None,
    }
    assert PRIVATE_MARKERS[0] in foundation_requests[0].prompt
    assert PRIVATE_MARKERS[1] in foundation_requests[0].prompt
    assert foundation_requests[0].authorized_context["rag_request"] is request
    serialized = observation.model_dump_json() + caplog.text
    for marker in PRIVATE_MARKERS:
        assert marker not in serialized
    telemetry = [
        record for record in caplog.records if record.message.startswith("agent_execution ")
    ]
    assert len(telemetry) == 1
