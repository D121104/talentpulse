from __future__ import annotations

from dataclasses import replace
from uuid import uuid4

import pytest
from pydantic import ValidationError

from talentpulse_ai.core import logging as app_logging
from talentpulse_ai.core.exceptions import ProviderFailureDetails


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
        "provider_code=ThrottlingException provider_message=none "
        "exception_type=ClientError duration_ms=250"
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
