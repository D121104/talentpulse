from unittest.mock import Mock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from talentpulse_ai.core.config import Settings, get_settings
from talentpulse_ai.core.exceptions import ProviderFailure, ServiceError
from talentpulse_ai.infrastructure.llm.ollama import OllamaGenerationAdapter
from talentpulse_ai.main import create_app
from talentpulse_ai.modules.cv_analysis.analysis import MatchAnalysisService
from talentpulse_ai.modules.cv_analysis.schemas import MatchAnalysisRequest


def payload():
    available = {"score": 0.8, "weight": 0.5, "available": True}
    unknown = {"score": None, "weight": 0.0, "available": False}
    return {
        "identity": {
            name: str(uuid4()) for name in ("request_id", "trace_id", "operation_attempt_id")
        },
        "analysis_version_key": "a" * 64,
        "locale": "en",
        "narrative_version": "match-narrative-v1",
        "facts": {
            "overall_score": 0.8,
            "components": {"semantic": available, "skills": available, "experience": unknown},
            "compatibility": {"location": unknown, "work_mode": unknown},
            "matched_skill_refs": ["m0"],
            "missing_required_skill_refs": ["g0"],
            "matched_skill_total": 1,
            "missing_required_skill_total": 1,
            "degraded": True,
        },
    }


def output():
    return {
        "summary": {"text": "Evidence indicates a promising match.", "evidence": ["overall"]},
        "strengths": [{"text": "Some required skills are evidenced.", "evidence": ["m0"]}],
        "points_to_verify": [{"text": "Verify skills not evidenced.", "evidence": ["g0"]}],
    }


def test_valid_generation_and_private_prompt():
    provider = Mock(spec=OllamaGenerationAdapter)
    provider.generate_structured.return_value = output()
    request = MatchAnalysisRequest.model_validate(payload())
    response = MatchAnalysisService(provider).analyze(request)
    assert response.source == "llm"
    assert response.identity == request.identity
    args, kwargs = provider.generate_structured.call_args
    assert str(request.identity.trace_id) not in args[0]
    assert request.analysis_version_key not in args[0]
    assert kwargs == {"timeout": 20, "num_predict": 450}
    provider.generate_structured.assert_called_once()


def test_generation_schema_constrains_refs_before_decoding():
    request = MatchAnalysisRequest.model_validate(payload())
    schema = MatchAnalysisService._generation_schema(request)
    properties = schema["properties"]
    summary = properties["summary"]["properties"]
    strengths = properties["strengths"]["items"]["properties"]
    verification = properties["points_to_verify"]["items"]["properties"]
    assert set(summary["evidence"]["items"]["enum"]) == {
        "overall",
        "semantic",
        "skills",
        "m0",
        "g0",
    }
    assert set(strengths["evidence"]["items"]["enum"]) == {"overall", "semantic", "skills", "m0"}
    assert verification["evidence"]["items"]["enum"] == ["g0"]
    assert "pattern" in summary["text"]


def test_generation_schema_disables_unfounded_verification():
    raw = payload()
    raw["facts"]["missing_required_skill_refs"] = []
    raw["facts"]["missing_required_skill_total"] = 0
    schema = MatchAnalysisService._generation_schema(MatchAnalysisRequest.model_validate(raw))
    assert schema["properties"]["points_to_verify"]["maxItems"] == 0


@pytest.mark.parametrize("reference", ["experience", "location", "m1", "g0", "unknown"])
def test_reject_invalid_strength_evidence(reference):
    provider = Mock(spec=OllamaGenerationAdapter)
    raw = output()
    raw["strengths"][0]["evidence"] = [reference]
    provider.generate_structured.return_value = raw
    with pytest.raises(ServiceError, match="validation"):
        MatchAnalysisService(provider).analyze(MatchAnalysisRequest.model_validate(payload()))


@pytest.mark.parametrize("text", ["Match is 95%", "Contact a@b.com", " ", "Has 8 years"])
def test_reject_unsupported_text(text):
    provider = Mock(spec=OllamaGenerationAdapter)
    raw = output()
    raw["summary"]["text"] = text
    provider.generate_structured.return_value = raw
    with pytest.raises(ServiceError):
        MatchAnalysisService(provider).analyze(MatchAnalysisRequest.model_validate(payload()))


def test_provider_failure_no_retry():
    provider = Mock(spec=OllamaGenerationAdapter)
    provider.generate_structured.side_effect = ProviderFailure("private details")
    with pytest.raises(ServiceError) as exc:
        MatchAnalysisService(provider).analyze(MatchAnalysisRequest.model_validate(payload()))
    assert exc.value.code == "analysis_provider_failed"
    assert "private" not in str(exc.value)
    provider.generate_structured.assert_called_once()


def test_reject_positive_ref_in_verification():
    provider = Mock(spec=OllamaGenerationAdapter)
    raw = output()
    raw["points_to_verify"][0]["evidence"] = ["m0"]
    provider.generate_structured.return_value = raw
    with pytest.raises(ServiceError):
        MatchAnalysisService(provider).analyze(MatchAnalysisRequest.model_validate(payload()))


def test_route_valid_generation():
    settings = Settings(auth_required=False)
    provider = Mock(spec=OllamaGenerationAdapter)
    provider.generate_structured.return_value = output()
    app = create_app(settings, generation_provider=provider)
    app.dependency_overrides[get_settings] = lambda: settings
    raw = payload()
    with TestClient(app) as client:
        response = client.post("/internal/v1/cv/match-analysis", json=raw)
    assert response.status_code == 200
    assert response.json()["identity"] == raw["identity"]
    assert response.json()["analysis_version_key"] == raw["analysis_version_key"]


def test_schema_rejects_untrusted_fields_and_availability():
    raw = payload()
    raw["raw_cv"] = "untrusted"
    with pytest.raises(ValidationError):
        MatchAnalysisRequest.model_validate(raw)
    raw = payload()
    raw["facts"]["components"]["experience"]["score"] = 0.5
    with pytest.raises(ValidationError):
        MatchAnalysisRequest.model_validate(raw)


def test_route_auth_and_provider_unavailable():
    settings = Settings(auth_required=False)
    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings
    with TestClient(app) as client:
        response = client.post("/internal/v1/cv/match-analysis", json=payload())
        assert response.status_code == 503
        assert response.json()["code"] == "analysis_provider_unavailable"
    settings = Settings(auth_required=True)
    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings
    with TestClient(app) as client:
        assert client.post("/internal/v1/cv/match-analysis", json=payload()).status_code == 401
