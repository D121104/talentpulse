import json
from collections.abc import Mapping

import pytest

from talentpulse_ai.agent_foundation.contracts import (
    AgentErrorCode,
    FinalDecision,
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

    def generate(self, prompt: str) -> object:
        return self.response


def test_adapter_uses_structured_provider_and_normalizes_typed_decision() -> None:
    provider = StructuredFakeProvider(
        {"kind": "final", "output": {"answer": "ok"}}
    )
    adapter = AgentModelAdapter(provider)

    decision = adapter.decide("capability prompt", timeout=2.5)

    assert isinstance(decision, FinalDecision)
    assert decision.output == {"answer": "ok"}
    assert provider.received_schema is not None
    assert provider.received_timeout == 2.5


def test_adapter_parses_typed_envelope_from_existing_generation_provider() -> None:
    payload = {"kind": "final", "output": {"answer": "ok"}}
    adapter = AgentModelAdapter(TextFakeProvider(json.dumps(payload)))

    decision = adapter.decide("capability prompt")

    assert isinstance(decision, FinalDecision)
    assert decision.output == payload["output"]


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
