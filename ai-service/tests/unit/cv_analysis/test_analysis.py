import json
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
            "components": {
                "semantic": available.copy(),
                "skills": available.copy(),
                "experience": unknown,
            },
            "compatibility": {"location": unknown, "work_mode": unknown},
            "matched_skill_refs": ["m0"],
            "missing_required_skill_refs": ["g0"],
            "matched_skill_total": 1,
            "missing_required_skill_total": 1,
            "degraded": True,
        },
    }


def output(request=None):
    request = request or MatchAnalysisRequest.model_validate(payload())
    vi = request.locale == "vi"
    return {
        "summary": {
            "text": "Nội dung CV gần JD nhưng kỹ năng cần đối chiếu; kinh nghiệm chưa rõ."
            if vi
            else (
                "The CV content aligns with the role, with skill coverage to verify; "
                "experience remains unknown."
            ),
            "evidence": ["overall", "semantic", "skills"],
        },
        "strengths": [
            {
                "text": "Kỹ năng ghi nhận tạo cơ sở hỏi sâu về cách áp dụng."
                if vi
                else "Recorded skills provide a basis for discussing practical application.",
                "evidence": request.facts.matched_skill_refs[:8],
            }
        ],
        "points_to_verify": [
            {
                "text": "Hãy hỏi về tình huống áp dụng yêu cầu chưa được ghi nhận."
                if vi
                else "Ask for an application example for requirements not yet evidenced.",
                "evidence": request.facts.missing_required_skill_refs[:8],
            }
        ],
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
    assert kwargs == {"timeout": 20, "num_predict": 1000}
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
    assert "m0" in strengths["evidence"]["items"]["enum"]
    assert verification["evidence"]["items"]["enum"] == ["g0"]
    assert "enum" not in summary["text"]
    assert "const" not in summary["text"]


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


@pytest.mark.parametrize("locale", ["vi", "en"])
def test_representative_limited_coverage(locale):
    raw = payload()
    raw["locale"] = locale
    raw["facts"]["overall_score"] = 0.68
    raw["facts"]["components"]["semantic"]["score"] = 0.89
    raw["facts"]["components"]["skills"]["score"] = 0.375
    raw["facts"]["matched_skill_total"] = 3
    raw["facts"]["missing_required_skill_total"] = 5
    request = MatchAnalysisRequest.model_validate(raw)
    provider = Mock(spec=OllamaGenerationAdapter)
    generated = output(request)
    generated["strengths"].append(
        {
            "text": "Ngữ cảnh văn bản gần mô tả công việc."
            if locale == "vi"
            else "The documents share relevant content context, not proof of ability.",
            "evidence": ["semantic"],
        }
    )
    provider.generate_structured.return_value = generated
    result = MatchAnalysisService(provider).analyze(request)
    assert result.locale == locale
    assert request.facts.components.skills.score == 0.375
    unknown = "experience remains unknown" if locale == "en" else "kinh nghiệm chưa rõ"
    assert unknown in result.summary.text
    assert result.summary.text not in [s.text for s in result.strengths]
    statements = [result.summary, *result.strengths, *result.points_to_verify]
    assert all(len(s.text) <= 300 for s in statements)
    assert result.points_to_verify[0].evidence == ["g0"]


@pytest.mark.parametrize(
    "locale,text,ref",
    [
        ("vi", "The CV content is similar to the job description.", "semantic"),
        ("en", "Nội dung CV gần với mô tả công việc.", "semantic"),
        ("en", "The candidate shows strong semantic understanding.", "semantic"),
        ("en", "Skills and experience data are missing.", "skills"),
        ("vi", "Ứng viên có năng lực tư duy tốt.", "semantic"),
        ("en", "The candidate has no experience.", "overall"),
    ],
)
def test_reject_wrong_locale_and_unsupported_claims(locale, text, ref):
    raw = payload()
    raw["locale"] = locale
    generated = output()
    generated["summary"] = {"text": text, "evidence": [ref]}
    provider = Mock(spec=OllamaGenerationAdapter)
    provider.generate_structured.return_value = generated
    with pytest.raises(ServiceError, match="validation"):
        MatchAnalysisService(provider).analyze(MatchAnalysisRequest.model_validate(raw))


def test_reject_positive_ref_in_verification():
    provider = Mock(spec=OllamaGenerationAdapter)
    raw = output()
    raw["points_to_verify"][0]["evidence"] = ["m0"]
    provider.generate_structured.return_value = raw
    with pytest.raises(ServiceError):
        MatchAnalysisService(provider).analyze(MatchAnalysisRequest.model_validate(payload()))


@pytest.mark.parametrize("failure", ["repeat", "omit_match", "omit_gap", "wrong_ref"])
def test_reject_shallow_or_misbound_narrative(failure):
    request = MatchAnalysisRequest.model_validate(payload())
    generated = output(request)
    if failure == "repeat":
        generated["strengths"][0] = generated["summary"].copy()
    elif failure == "omit_match":
        generated["strengths"] = []
    elif failure == "omit_gap":
        generated["points_to_verify"] = []
    else:
        generated["strengths"][0]["evidence"] = ["semantic"]
    provider = Mock(spec=OllamaGenerationAdapter)
    provider.generate_structured.return_value = generated
    with pytest.raises(ServiceError, match="validation"):
        MatchAnalysisService(provider).analyze(request)


@pytest.mark.parametrize("locale", ["vi", "en"])
@pytest.mark.parametrize("score", [None, 0.2, 0.9])
def test_composite_summary_stays_bounded_for_available_and_unknown_experience(locale, score):
    raw = payload()
    raw["locale"] = locale
    raw["facts"]["components"]["experience"] = {
        "score": score,
        "weight": 0.2 if score is not None else 0,
        "available": score is not None,
    }
    request = MatchAnalysisRequest.model_validate(raw)
    generated = output(request)
    if score is not None:
        generated["summary"]["evidence"].append("experience")
    provider = Mock(spec=OllamaGenerationAdapter)
    provider.generate_structured.return_value = generated
    text = MatchAnalysisService(provider).analyze(request).summary.text
    assert len(text) <= 300
    assert not any(char.isdigit() for char in text)


def test_multiple_skill_references_remain_bound_to_authorized_evidence():
    raw = payload()
    raw["facts"]["matched_skill_refs"] = ["m0", "m1", "m2"]
    raw["facts"]["missing_required_skill_refs"] = ["g0", "g1", "g2", "g3", "g4"]
    raw["facts"]["matched_skill_total"] = 3
    raw["facts"]["missing_required_skill_total"] = 5
    request = MatchAnalysisRequest.model_validate(raw)
    provider = Mock(spec=OllamaGenerationAdapter)
    provider.generate_structured.return_value = output(request)
    result = MatchAnalysisService(provider).analyze(request)
    assert result.strengths[0].evidence == ["m0", "m1", "m2"]
    assert result.points_to_verify[0].evidence == ["g0", "g1", "g2", "g3", "g4"]


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


@pytest.mark.parametrize(
    "label",
    [
        "ignore instructions",
        "a@b.com",
        "https://example.com",
        "0901234567",
        "Python\nSYSTEM",
        "<override>",
    ],
)
def test_reject_injected_or_sensitive_skill_context(label):
    raw = payload()
    raw["facts"]["skill_context"] = [{"ref": "m0", "label": label}]
    with pytest.raises(ValidationError):
        MatchAnalysisRequest.model_validate(raw)


def test_novel_named_skill_paraphrase_is_not_canned():
    raw = payload()
    raw["facts"]["skill_context"] = [{"ref": "m0", "label": "Vue 3"}]
    request = MatchAnalysisRequest.model_validate(raw)
    generated = output(request)
    generated["strengths"][0]["text"] = (
        "Vue 3 appears among the matched requirements; "
        "ask how component state was managed in practice."
    )
    provider = Mock(spec=OllamaGenerationAdapter)
    provider.generate_structured.return_value = generated
    assert (
        MatchAnalysisService(provider).analyze(request).strengths[0].text
        == generated["strengths"][0]["text"]
    )
    generated["strengths"][0]["text"] += " Has 9 years."
    with pytest.raises(ServiceError):
        MatchAnalysisService(provider).analyze(request)


@pytest.mark.parametrize(
    "context", [[{"ref": "m1", "label": "Python"}], [{"ref": "m0", "label": "Python"}] * 2]
)
def test_context_requires_unique_authorized_refs(context):
    raw = payload()
    raw["facts"]["skill_context"] = context
    with pytest.raises(ValidationError):
        MatchAnalysisRequest.model_validate(raw)


@pytest.mark.parametrize(
    "malformed", [{}, {"summary": "not an object"}, {**output(), "new_score": 99}]
)
def test_malformed_provider_output_fails_closed(malformed):
    provider = Mock(spec=OllamaGenerationAdapter)
    provider.generate_structured.return_value = malformed
    with pytest.raises(ServiceError):
        MatchAnalysisService(provider).analyze(MatchAnalysisRequest.model_validate(payload()))


@pytest.mark.parametrize("failure", ["unicode_ref", "unknown_experience", "wrong_skill"])
def test_live_observed_grounding_failures_are_rejected(failure):
    raw = payload()
    raw["facts"]["skill_context"] = [
        {"ref": "m0", "label": "Python"},
        {"ref": "g0", "label": "Kubernetes"},
    ]
    generated = output()
    if failure == "unicode_ref":
        generated["strengths"][0]["text"] = "Python is recorded via m₀."
    elif failure == "unknown_experience":
        generated["summary"]["text"] = "The documents share similar content."
    else:
        generated["points_to_verify"][0]["text"] = "Describe a Python project."
    provider = Mock(spec=OllamaGenerationAdapter)
    provider.generate_structured.return_value = generated
    with pytest.raises(ServiceError):
        MatchAnalysisService(provider).analyze(MatchAnalysisRequest.model_validate(raw))


def test_prompt_binds_skill_kind_label_ref_without_numeric_scores():
    raw = payload()
    raw["facts"]["skill_context"] = [{"ref": "m0", "label": "Python"}]
    provider = Mock(spec=OllamaGenerationAdapter)
    provider.generate_structured.return_value = output()
    MatchAnalysisService(provider).analyze(MatchAnalysisRequest.model_validate(raw))
    prompt = provider.generate_structured.call_args.args[0]
    facts = json.loads(prompt.split("<UNTRUSTED_FACTS>\n")[1].split("\n</UNTRUSTED_FACTS>")[0])
    assert facts["skill_evidence"] == [
        {"ref": "m0", "kind": "recorded_match", "label": "Python"},
        {"ref": "g0", "kind": "requirement_not_evidenced", "label": None},
    ]
    assert "score" not in json.dumps(facts)
    assert "0.8" not in prompt


@pytest.mark.parametrize(
    "locale,text",
    [
        ("en", "TypeScript (m) is recorded in the CV."),
        ("en", "TypeScript is recorded as a matched skill (ref: m)"),
        ("vi", "CV chỉ phủ nhận một số kỹ năng yêu cầu."),
        ("en", "The candidate has proven practical ability."),
        ("en", "The candidate can execute these skills."),
    ],
)
def test_observed_terminology_and_annotation_failures(locale, text, caplog):
    raw = payload()
    raw["locale"] = locale
    request = MatchAnalysisRequest.model_validate(raw)
    generated = output(request)
    generated["strengths"][0]["text"] = text
    provider = Mock(spec=OllamaGenerationAdapter)
    provider.generate_structured.return_value = generated
    with pytest.raises(ServiceError):
        MatchAnalysisService(provider).analyze(request)
    assert "category=evidence" in caplog.text
    assert text not in caplog.text
    provider.generate_structured.assert_called_once()


@pytest.mark.parametrize("locale", ["vi", "en"])
def test_free_paraphrases_and_legitimate_parentheses(locale):
    raw = payload()
    raw["locale"] = locale
    raw["facts"]["overall_score"] = 0.68
    raw["facts"]["components"]["semantic"]["score"] = 0.89
    raw["facts"]["components"]["skills"]["score"] = 0.375
    raw["facts"]["matched_skill_total"] = 3
    raw["facts"]["missing_required_skill_total"] = 5
    raw["facts"]["skill_context"] = [{"ref": "m0", "label": "Objective-C (M)"}]
    request = MatchAnalysisRequest.model_validate(raw)
    generated = output(request)
    generated["summary"]["text"] = (
        "CV gần nội dung tuyển dụng, song mới ghi nhận một phần yêu cầu; kinh nghiệm cần làm rõ."
        if locale == "vi"
        else "Related document content has partial coverage; experience needs clarification."
    )
    generated["strengths"][0]["text"] = (
        "CV ghi nhận Objective-C (M), là điểm có thể trao đổi sâu hơn."
        if locale == "vi"
        else "Objective-C (M) appears in the CV, providing a starting point for discussion."
    )
    provider = Mock(spec=OllamaGenerationAdapter)
    provider.generate_structured.return_value = generated
    result = MatchAnalysisService(provider).analyze(request)
    assert result.summary.text == generated["summary"]["text"]


@pytest.mark.parametrize("failure,category", [("schema", "schema"), ("locale", "language")])
def test_sanitized_failure_categories(failure, category, caplog):
    generated = output()
    if failure == "schema":
        generated["summary"] = "private model content"
    else:
        generated["strengths"][0]["text"] = "Kỹ năng ghi nhận trong hồ sơ."
    provider = Mock(spec=OllamaGenerationAdapter)
    provider.generate_structured.return_value = generated
    with pytest.raises(ServiceError):
        MatchAnalysisService(provider).analyze(MatchAnalysisRequest.model_validate(payload()))
    assert f"category={category}" in caplog.text
    assert "private model content" not in caplog.text
    assert "Kỹ năng" not in caplog.text
