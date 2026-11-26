from __future__ import annotations

import pytest
from tests.unit.cv_analysis.test_analysis import output, payload

from talentpulse_ai.core.exceptions import ServiceError
from talentpulse_ai.modules.cv_analysis.analysis import MatchAnalysisService
from talentpulse_ai.modules.cv_analysis.schemas import MatchAnalysisRequest


class HostedStructuredProvider:
    provider_name = "gemini"
    model_name = "synthetic-gemini"

    def __init__(self, value: object) -> None:
        self.value = value
        self.schema: dict[str, object] | None = None

    def generate_structured(self, prompt, schema, timeout=None, *, num_predict=None):
        self.schema = schema
        return self.value


class HostedTextProvider:
    provider_name = "bedrock"
    model_name = "amazon.nova-lite-v1:0"

    def __init__(self, value: object) -> None:
        self.value = value
        self.prompt: str | None = None

    def generate(self, prompt: str) -> object:
        self.prompt = prompt
        return self.value


def test_hosted_structured_provider_keeps_full_narrative_validation() -> None:
    request = MatchAnalysisRequest.model_validate(payload())
    provider = HostedStructuredProvider(output(request))

    response = MatchAnalysisService(provider).analyze(request)

    assert response.source == "llm"
    assert provider.schema is not None
    assert (
        "g0"
        in provider.schema["properties"]["points_to_verify"]["items"]["properties"]["evidence"][
            "items"
        ]["enum"]
    )


def test_hosted_text_provider_receives_schema_guidance_and_validates_output() -> None:
    request = MatchAnalysisRequest.model_validate(payload())
    provider = HostedTextProvider(output(request))

    response = MatchAnalysisService(provider).analyze(request)

    assert response.source == "llm"
    assert provider.prompt is not None
    assert "Required JSON schema:" in provider.prompt
    assert '"points_to_verify"' in provider.prompt


def test_hosted_provider_invalid_evidence_is_rejected_after_generation() -> None:
    request = MatchAnalysisRequest.model_validate(payload())
    candidate = output(request)
    candidate["strengths"][0]["evidence"] = ["g0"]
    provider = HostedStructuredProvider(candidate)

    with pytest.raises(ServiceError, match="validation"):
        MatchAnalysisService(provider).analyze(request)


def test_hosted_provider_malformed_schema_output_is_rejected() -> None:
    request = MatchAnalysisRequest.model_validate(payload())
    provider = HostedStructuredProvider({"summary": "not an object"})

    with pytest.raises(ServiceError, match="validation"):
        MatchAnalysisService(provider).analyze(request)
