import logging
from unittest.mock import Mock
from uuid import uuid4

import pytest

from talentpulse_ai.agent_foundation.contracts import (
    AgentErrorCode,
    FinalDecision,
    ToolCallDecision,
)
from talentpulse_ai.agent_foundation.model import AgentModelAdapter
from talentpulse_ai.agent_foundation.tools import ToolDispatchError
from talentpulse_ai.core.exceptions import ProviderFailure, ProviderFailureDetails, ServiceError
from talentpulse_ai.modules.rag_chatbot.agent import CareerChatAgent
from talentpulse_ai.modules.rag_chatbot.schemas import (
    ExplicitFilters,
    IdentityFields,
    RagGenerateRequest,
    ServicePolicy,
    StructuredFilterState,
)

PRIVATE = "SYNTHETIC_PRIVATE_AGENT_PROMPT"


@pytest.fixture
def request_data():
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
        normalized_user_message=PRIVATE,
        intent="ADVICE",
        locale="en",
        filter_state=StructuredFilterState(),
        explicit_filters=ExplicitFilters(),
        policy=ServicePolicy(data_scope="PUBLIC_ACTIVE_JOBS", max_candidates=20),
    )


@pytest.mark.parametrize("repair", [False, True], ids=["initial", "repair"])
def test_agent_logs_safe_provider_metadata_before_foundation_sanitizes_error(
    caplog, request_data, repair
):
    details = ProviderFailureDetails(
        provider="gemini",
        model="synthetic-model",
        category="rate_limited",
        provider_status=429,
        provider_code="QuotaExceeded",
        exception_type="HTTPError",
        duration_ms=9,
    )
    failure = ProviderFailure(PRIVATE, details=details)
    provider = Mock()
    provider.provider_name = "gemini"
    provider.model_name = "synthetic-model"
    provider.generate_structured.side_effect = (
        [FinalDecision(output={}), failure] if repair else [failure]
    )
    model = AgentModelAdapter(provider)
    with caplog.at_level(logging.WARNING):
        response = CareerChatAgent(model).generate(request_data)

    assert response.answer_status == "DEGRADED"
    assert response.source == "deterministic_fallback"
    assert response.fallbackReason == "provider_error"
    assert response.degraded is True
    assert provider.generate_structured.call_count == (2 if repair else 1)
    assert PRIVATE in provider.generate_structured.call_args.args[0]
    assert PRIVATE not in caplog.text
    events = [
        r.getMessage() for r in caplog.records if r.getMessage().startswith("ai_provider_failure ")
    ]
    assert len(events) == 1
    fields = dict(item.split("=", 1) for item in events[0].split()[1:])
    assert (
        fields.items()
        >= {
            "capability": "rag_chat",
            "provider": "gemini",
            "model": "synthetic-model",
            "operation": "agent_model",
            "attempt": "agent_model",
            "category": "rate_limited",
            "provider_status": "429",
            "provider_code": "QuotaExceeded",
            "exception_type": "HTTPError",
            "duration_ms": "9",
            "request_id": str(request_data.identity.request_id),
            "trace_id": str(request_data.identity.trace_id),
        }.items()
    )
    assert fields["attempt_index"] == str(2 if repair else 1)


@pytest.mark.parametrize(
    ("code", "public_code", "status"),
    [
        (AgentErrorCode.PERMISSION_DENIED, "generation_not_authorized", 403),
        (AgentErrorCode.TOOL_ERROR, "generation_unavailable", 503),
        (AgentErrorCode.TOOL_NOT_ALLOWED, "generation_unavailable", 503),
        (AgentErrorCode.INVALID_INPUT, "generation_invalid_request", 400),
        (AgentErrorCode.EXECUTION_LIMIT_EXCEEDED, "generation_timeout", 504),
    ],
)
def test_agent_non_provider_failures_are_not_mislabeled(
    caplog, monkeypatch, request_data, code, public_code, status
):
    provider = Mock()
    provider.provider_name = "gemini"
    provider.model_name = "synthetic-model"
    provider.generate_structured.return_value = ToolCallDecision(
        tool_call_id="synthetic-call", tool_id="rag.retrieve_context", input={}
    )
    agent = CareerChatAgent(AgentModelAdapter(provider))
    dispatcher = Mock()
    dispatcher.dispatch.side_effect = ToolDispatchError(code, "Synthetic safe failure.")
    monkeypatch.setattr(agent, "_tool_dispatcher", dispatcher)

    with caplog.at_level(logging.WARNING), pytest.raises(ServiceError) as caught:
        agent.generate(request_data)

    assert (caught.value.code, caught.value.status_code) == (public_code, status)
    provider.generate_structured.assert_called_once()
    dispatcher.dispatch.assert_called_once()
    assert PRIVATE not in str(caught.value)
    assert PRIVATE not in caplog.text
    assert not any(r.getMessage().startswith("ai_provider_failure ") for r in caplog.records)
