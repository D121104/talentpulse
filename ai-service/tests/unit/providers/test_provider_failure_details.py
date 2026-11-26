from __future__ import annotations

import pytest
from botocore.exceptions import ClientError

from talentpulse_ai.core.exceptions import (
    ProviderFailure,
    ProviderFailureDetails,
    provider_failure_details,
)


def test_provider_failure_keeps_generic_message_and_safe_details() -> None:
    details = ProviderFailureDetails(
        provider="gemini",
        model="gemini-2.5-flash",
        category="authentication",
        provider_status=403,
        provider_code="PERMISSION_DENIED",
        provider_message="request_rejected",
        exception_type="HTTPError",
        duration_ms=120,
    )

    failure = ProviderFailure("generation provider failed", details=details)

    assert str(failure) == "generation provider failed"
    assert failure.details == details


def test_bedrock_validation_message_is_bounded_and_redacted() -> None:
    error = ClientError(
        {
            "Error": {
                "Code": "ValidationException",
                "Message": (
                    "Invalid schema: unsupported keyword maxLength for candidate@example.com; "
                    "trace 123e4567-e89b-12d3-a456-426614174000"
                ),
            },
            "ResponseMetadata": {"HTTPStatusCode": 400},
        },
        "Converse",
    )

    details = provider_failure_details(
        error,
        provider="bedrock",
        model="global.moonshotai.kimi-k3.1",
        duration_ms=42,
        include_provider_message=True,
    )

    assert details.provider_message == (
        "Invalid_schema:_unsupported_keyword_maxLength_for_REDACTED_trace_REDACTED"
    )
    assert "candidate@example.com" not in repr(details)
    assert "123e4567-e89b-12d3-a456-426614174000" not in repr(details)


def test_provider_message_is_not_included_without_explicit_opt_in() -> None:
    error = ClientError(
        {"Error": {"Code": "ValidationException", "Message": "unsupported keyword maxLength"}},
        "Converse",
    )

    details = provider_failure_details(
        error,
        provider="bedrock",
        model="global.moonshotai.kimi-k3.1",
        duration_ms=42,
    )

    assert details.provider_message is None


@pytest.mark.parametrize(
    "kwargs",
    [
        {"provider": "embedding", "model": None, "category": "provider_error"},
        {"provider": "gemini", "model": None, "category": "unknown"},
        {"provider": "gemini", "model": None, "category": "timeout", "provider_status": 99},
        {
            "provider": "gemini",
            "model": None,
            "category": "timeout",
            "provider_status": True,
        },
        {
            "provider": "gemini",
            "model": None,
            "category": "timeout",
            "provider_code": "bad\ncode",
        },
        {
            "provider": "gemini",
            "model": None,
            "category": "timeout",
            "provider_message": "unsafe provider message with spaces",
        },
        {
            "provider": "gemini",
            "model": "model\nforged=true",
            "category": "timeout",
        },
        {
            "provider": "gemini",
            "model": None,
            "category": "timeout",
            "exception_type": "HTTPError\nforged=true",
        },
        {
            "provider": "gemini",
            "model": None,
            "category": "timeout",
            "duration_ms": -1,
        },
    ],
)
def test_provider_failure_details_reject_invalid_or_unsafe_fields(
    kwargs: dict[str, object],
) -> None:
    with pytest.raises(ValueError):
        ProviderFailureDetails(**kwargs)  # type: ignore[arg-type]
