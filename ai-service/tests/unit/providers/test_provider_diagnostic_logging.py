from __future__ import annotations

from dataclasses import replace
from uuid import uuid4

import pytest
from pydantic import ValidationError

from talentpulse_ai.core import logging as app_logging
from talentpulse_ai.core.exceptions import ProviderFailureDetails
from talentpulse_ai.modules.cv_generator.schemas import CvGenerationContent


def _details() -> ProviderFailureDetails:
    return ProviderFailureDetails(
        provider="bedrock",
        model="cohere.embed-multilingual-v3",
        category="rate_limited",
        provider_status=429,
        provider_code="ThrottlingException",
        exception_type="ClientError",
        duration_ms=250,
    )


def test_event_includes_fixed_fields_and_valid_correlation(
    caplog: pytest.LogCaptureFixture,
) -> None:
    request_id = uuid4()
    trace_id = uuid4()

    app_logging.log_ai_provider_failure(
        details=_details(),
        capability="job_indexing",
        operation="embed_document",
        attempt="single",
        request_id=request_id,
        trace_id=trace_id,
    )

    assert (
        "ai_provider_failure capability=job_indexing provider=bedrock "
        "model=cohere.embed-multilingual-v3 operation=embed_document attempt=single "
        "attempt_index=none category=rate_limited request_id="
        f"{request_id} trace_id={trace_id} provider_status=429 "
        "provider_code=ThrottlingException provider_message=none retry_after_seconds=none "
        "failure_location=none exception_type=ClientError duration_ms=250 validation_errors=none"
    ) in caplog.text


def test_event_includes_sanitized_provider_message(caplog: pytest.LogCaptureFixture) -> None:
    app_logging.log_ai_provider_failure(
        details=replace(_details(), provider_message="response_json_schema_rejected"),
        capability="rag_chat",
        operation="generate",
        attempt="initial",
    )

    assert "provider_message=response_json_schema_rejected" in caplog.text


def test_event_omits_invalid_ids_and_rejects_control_characters(
    caplog: pytest.LogCaptureFixture,
) -> None:
    app_logging.log_ai_provider_failure(
        details=_details(),
        capability="job_indexing",
        operation="embed_document",
        attempt="single",
        request_id="not-a-uuid\nforged=true",
        trace_id=None,
    )

    assert "request_id=none trace_id=none" in caplog.text
    assert "forged=true" not in caplog.text

    app_logging.log_ai_provider_failure(
        details=_details(),
        capability="job_indexing\nforged=true",
        operation="embed_document",
        attempt="single",
    )

    assert caplog.text.count("ai_provider_failure") == 1


def test_event_failure_does_not_escape_into_caller(monkeypatch: pytest.MonkeyPatch) -> None:
    def fail_emit(*args: object, **kwargs: object) -> None:
        del args, kwargs
        raise RuntimeError("provider body and secret must not leak")

    monkeypatch.setattr(app_logging._AI_PROVIDER_LOGGER, "warning", fail_emit)

    app_logging.log_ai_provider_failure(
        details=_details(),
        capability="job_indexing",
        operation="index_upsert",
        attempt="single",
    )


def test_validation_summary_logs_locations_and_types_without_values(
    caplog: pytest.LogCaptureFixture,
) -> None:
    try:
        from talentpulse_ai.modules.rag_chatbot.generation.prompt_builder import (
            JobSearchExplanation,
        )

        JobSearchExplanation.model_validate(
            {
                "answer_blocks": [{"kind": "PRIVATE_VALUE", "text": "PRIVATE_RESPONSE"}],
                "selected_job_ids": ["not-a-uuid"],
            }
        )
    except ValidationError as error:
        summary = app_logging.validation_error_summary(error)
    else:
        raise AssertionError("invalid job search output unexpectedly passed validation")

    assert "answer_blocks.0.kind:literal_error" in summary
    assert "selected_job_ids.0:value_error" in summary
    assert "PRIVATE_VALUE" not in summary
    assert "PRIVATE_RESPONSE" not in summary
    assert "not-a-uuid" not in summary

    app_logging.log_ai_provider_failure(
        details=_details(),
        capability="rag_chat",
        operation="generate",
        attempt="initial",
        validation_errors=summary,
    )

    assert (
        "validation_errors=answer_blocks.0.kind:literal_error,selected_job_ids.0:value_error"
        in caplog.text
    )
    assert "PRIVATE_VALUE" not in caplog.text
    assert "PRIVATE_RESPONSE" not in caplog.text


@pytest.mark.parametrize(
    ("value", "expected_type"),
    [
        (None, "null"),
        ("private response", "string"),
        ([], "array"),
        (12, "number"),
        (False, "boolean"),
    ],
)
def test_agent_response_shape_identifies_exact_json_output_type(
    value: object,
    expected_type: str,
) -> None:
    shape = app_logging.agent_response_shape({"kind": "final", "output": value})

    assert shape.endswith(f"output={expected_type}")
    assert "private response" not in shape


def test_agent_response_shape_identifies_opaque_type_without_value() -> None:
    class ProviderOutput:
        def __repr__(self) -> str:
            return "private CV response"

    shape = app_logging.agent_response_shape({"kind": "final", "output": ProviderOutput()})

    assert shape.endswith("output=instance:ProviderOutput")
    assert "private CV response" not in shape


def test_cv_response_shape_reports_known_field_types_without_values() -> None:
    shape = app_logging.agent_response_shape(
        {
            "kind": "final",
            "output": {"education": "private education text", "skills": []},
        }
    )

    assert "output_fields=education:string-skills:array" in shape
    assert "private education text" not in shape


def test_cv_validation_summary_keeps_static_schema_paths_without_values() -> None:
    try:
        CvGenerationContent.model_validate(
            {"title": "Engineer", "education": "private education text"}
        )
    except ValidationError as error:
        summary = app_logging.validation_error_summary(error)
    else:
        raise AssertionError("invalid CV output unexpectedly passed validation")

    assert "education:list_type" in summary
    assert "private education text" not in summary
