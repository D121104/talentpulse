import json
from pathlib import Path
from uuid import uuid4

import pytest
from app.schemas import RagGenerateRequest, RagRetrieveRequest
from pydantic import ValidationError


def identity() -> dict[str, str]:
    return {
        field: str(uuid4())
        for field in (
            "request_id",
            "trace_id",
            "operation_attempt_id",
            "client_message_id",
            "user_id",
            "session_id",
        )
    }


def cv_snapshot(consent_version: str = "phase0-v1") -> dict[str, object]:
    return {
        "cv_id": str(uuid4()),
        "content_hash": "a" * 64,
        "title": "Resume",
        "target": "Backend",
        "skills": ["Python"],
        "education": ["BSc"],
        "experience": ["Backend engineer"],
        "certificates": [],
        "sanitized_text": "Python backend engineer",
    }


def test_backend_nested_snake_case_fixtures_validate_as_fastapi_contracts() -> None:
    fixture_path = Path(__file__).parent / "fixtures" / "nest_rag_requests.json"
    payloads = json.loads(fixture_path.read_text(encoding="utf-8"))

    retrieve = RagRetrieveRequest.model_validate(payloads["retrieve"])
    generate = RagGenerateRequest.model_validate(payloads["generate"])

    assert str(retrieve.identity.request_id) == "11111111-1111-4111-8111-111111111111"
    assert str(generate.identity.user_id) == "55555555-5555-4555-8555-555555555555"
    assert str(generate.canonical_active_job_context[0].job_id) == (
        "77777777-7777-4777-8777-777777777777"
    )


def test_current_nest_retrieve_payload_validates() -> None:
    payload = {
        "identity": identity(),
        "normalized_user_message": "find Python jobs",
        "locale": "en-US",
        "recent_history": ["backend"],
        "filter_state": {"skills": ["Python"]},
        "filter_provenance": {},
        "explicit_filters": {},
        "policy": {"data_scope": "PUBLIC_ACTIVE_JOBS", "max_candidates": 20},
    }
    assert RagRetrieveRequest.model_validate(payload).normalized_user_message == "find Python jobs"


def test_current_nest_generate_cv_payload_validates() -> None:
    payload = {
        "identity": identity(),
        "normalized_user_message": "compare my skills",
        "intent": "CV_JOB_COMPARISON",
        "locale": "en-US",
        "filter_state": {"skills": []},
        "authorized_cv_snapshot": cv_snapshot(),
        "consent_version": "phase0-v1",
        "canonical_active_job_context": [],
        "retrieval_evidence": [],
        "explicit_filters": {},
        "policy": {"data_scope": "PUBLIC_ACTIVE_JOBS", "max_candidates": 20, "max_context_jobs": 8},
    }
    assert RagGenerateRequest.model_validate(payload).authorized_cv_snapshot is not None


def test_contract_rejects_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        RagRetrieveRequest.model_validate(
            {**identity(), "normalized_user_message": "hello", "secret": "nope"}
        )


def test_cv_is_forbidden_for_job_only_intents() -> None:
    with pytest.raises(ValidationError):
        RagGenerateRequest.model_validate(
            {
                "identity": identity(),
                "normalized_user_message": "find jobs",
                "intent": "JOB_SEARCH",
                "locale": "en",
                "filter_state": {"skills": []},
                "explicit_filters": {},
                "canonical_active_job_context": [],
                "retrieval_evidence": [],
                "authorized_cv_snapshot": cv_snapshot(),
                "policy": {"data_scope": "PUBLIC_ACTIVE_JOBS", "max_candidates": 20},
            }
        )


def test_cv_is_required_for_cv_intents() -> None:
    with pytest.raises(ValidationError):
        RagGenerateRequest.model_validate(
            {
                "identity": identity(),
                "normalized_user_message": "analyze CV",
                "intent": "CV_ANALYSIS",
                "locale": "en",
                "filter_state": {"skills": []},
                "explicit_filters": {},
                "canonical_active_job_context": [],
                "retrieval_evidence": [],
                "policy": {"data_scope": "PUBLIC_ACTIVE_JOBS", "max_candidates": 20},
            }
        )


def test_cv_snapshot_is_typed_and_bounded() -> None:
    with pytest.raises(ValidationError):
        RagGenerateRequest.model_validate(
            {
                "identity": identity(),
                "normalized_user_message": "analyze CV",
                "intent": "CV_ANALYSIS",
                "locale": "en",
                "filter_state": {"skills": []},
                "explicit_filters": {},
                "canonical_active_job_context": [],
                "retrieval_evidence": [],
                "authorized_cv_snapshot": {**cv_snapshot(), "arbitrary": {}},
                "consent_version": "phase0-v1",
                "policy": {"data_scope": "PUBLIC_ACTIVE_JOBS", "max_candidates": 20},
            }
        )
