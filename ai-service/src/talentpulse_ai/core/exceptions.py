from __future__ import annotations

import re
import socket
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Literal
from urllib.error import HTTPError, URLError

ProviderName = Literal["gemini", "bedrock", "ollama", "cohere", "qdrant"]
ProviderFailureCategory = Literal[
    "authentication",
    "rate_limited",
    "invalid_request",
    "timeout",
    "connectivity",
    "provider_rejected",
    "invalid_response",
    "invalid_output",
    "provider_error",
]

_PROVIDERS = frozenset({"gemini", "bedrock", "ollama", "cohere", "qdrant"})
_CATEGORIES = frozenset(
    {
        "authentication",
        "rate_limited",
        "invalid_request",
        "timeout",
        "connectivity",
        "provider_rejected",
        "invalid_response",
        "invalid_output",
        "provider_error",
    }
)
_SAFE_MODEL = re.compile(r"[A-Za-z0-9._:/-]{1,128}\Z")
_SAFE_PROVIDER_CODE = re.compile(r"[A-Za-z0-9_-]{1,64}\Z")
_SAFE_PROVIDER_MESSAGE = re.compile(r"[A-Za-z0-9_.:-]{1,256}\Z")
_SAFE_EXCEPTION_TYPE = re.compile(r"[A-Za-z_][A-Za-z0-9_.]{0,79}\Z")
_PROVIDER_EMAIL = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
_PROVIDER_UUID = re.compile(
    r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b"
)
_PROVIDER_AWS_KEY = re.compile(r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b")
_PROVIDER_BEARER = re.compile(r"\bBearer\s+\S+", re.IGNORECASE)
_RATE_LIMIT_CODES = frozenset(
    {
        "throttlingexception",
        "resourceexhausted",
        "resource_exhausted",
        "quotaexceeded",
        "quota_exceeded",
        "ratelimitexceeded",
        "ratelimitexceededexception",
        "toomanyrequests",
        "too_many_requests",
    }
)
_AUTHENTICATION_CODES = frozenset(
    {
        "unauthorized",
        "unauthenticated",
        "permission_denied",
        "accessdeniedexception",
        "unauthorizedexception",
    }
)
_INVALID_REQUEST_CODES = frozenset(
    {
        "validationexception",
        "invalidargument",
        "badrequest",
        "modelnotfound",
        "modelnotfoundexception",
        "resourcenotfoundexception",
    }
)


@dataclass(frozen=True, slots=True)
class ProviderFailureDetails:
    provider: ProviderName
    model: str | None
    category: ProviderFailureCategory
    provider_status: int | None = None
    provider_code: str | None = None
    provider_message: str | None = None
    exception_type: str | None = None
    duration_ms: int | None = None

    def __post_init__(self) -> None:
        if self.provider not in _PROVIDERS:
            raise ValueError("provider is not allowlisted")
        if self.category not in _CATEGORIES:
            raise ValueError("provider failure category is invalid")
        if self.model is not None and not _SAFE_MODEL.fullmatch(self.model):
            raise ValueError("provider model identifier is invalid")
        if self.provider_status is not None and (
            type(self.provider_status) is not int or not 100 <= self.provider_status <= 599
        ):
            raise ValueError("provider status must be between 100 and 599")
        if self.provider_code is not None and not _SAFE_PROVIDER_CODE.fullmatch(self.provider_code):
            raise ValueError("provider code is invalid")
        if self.provider_message is not None and not _SAFE_PROVIDER_MESSAGE.fullmatch(
            self.provider_message
        ):
            raise ValueError("provider message is invalid")
        if self.exception_type is not None and not _SAFE_EXCEPTION_TYPE.fullmatch(
            self.exception_type
        ):
            raise ValueError("exception type is invalid")
        if self.duration_ms is not None and (
            type(self.duration_ms) is not int or not 0 <= self.duration_ms <= 600_000
        ):
            raise ValueError("provider duration is invalid")


def provider_failure_details(
    exc: BaseException,
    *,
    provider: ProviderName,
    model: str | None,
    duration_ms: int,
    category: ProviderFailureCategory | None = None,
    provider_status: int | None = None,
    include_provider_message: bool = False,
) -> ProviderFailureDetails:
    status = provider_status if provider_status is not None else _provider_status(exc)
    code = _provider_code(exc)
    safe_model = model if isinstance(model, str) and _SAFE_MODEL.fullmatch(model) else None
    safe_code = code if code is not None and _SAFE_PROVIDER_CODE.fullmatch(code) else None
    exception_type = type(exc).__name__
    safe_exception_type = exception_type if _SAFE_EXCEPTION_TYPE.fullmatch(exception_type) else None

    return ProviderFailureDetails(
        provider=provider,
        model=safe_model,
        category=category or classify_provider_exception(exc),
        provider_status=status,
        provider_code=safe_code,
        provider_message=(
            _safe_bedrock_validation_message(exc)
            if include_provider_message and provider == "bedrock" and code == "ValidationException"
            else None
        ),
        exception_type=safe_exception_type,
        duration_ms=max(0, min(duration_ms, 600_000)),
    )


def _safe_bedrock_validation_message(exc: BaseException) -> str | None:
    response = getattr(exc, "response", None)
    error = response.get("Error") if isinstance(response, Mapping) else None
    message = error.get("Message") if isinstance(error, Mapping) else None
    if not isinstance(message, str):
        return None

    safe_message = " ".join(message.split())
    safe_message = _PROVIDER_BEARER.sub("REDACTED", safe_message)
    safe_message = _PROVIDER_EMAIL.sub("REDACTED", safe_message)
    safe_message = _PROVIDER_UUID.sub("REDACTED", safe_message)
    safe_message = _PROVIDER_AWS_KEY.sub("REDACTED", safe_message)
    safe_message = re.sub(r"[^A-Za-z0-9_.:-]+", "_", safe_message).strip("_")
    safe_message = safe_message[:256]
    return safe_message if _SAFE_PROVIDER_MESSAGE.fullmatch(safe_message) else None


def _provider_status(exc: BaseException) -> int | None:
    if isinstance(exc, HTTPError):
        return exc.code if 100 <= exc.code <= 599 else None
    response = getattr(exc, "response", None)
    metadata = response.get("ResponseMetadata") if isinstance(response, Mapping) else None
    status = metadata.get("HTTPStatusCode") if isinstance(metadata, Mapping) else None
    if type(status) is int and 100 <= status <= 599:
        return status
    status = getattr(exc, "status_code", None)
    return status if type(status) is int and 100 <= status <= 599 else None


def _provider_code(exc: BaseException) -> str | None:
    response = getattr(exc, "response", None)
    error = response.get("Error") if isinstance(response, Mapping) else None
    code = error.get("Code") if isinstance(error, Mapping) else None
    return code if isinstance(code, str) else None


def classify_provider_exception(exc: BaseException) -> ProviderFailureCategory:
    return _classify_provider_exception(exc, _provider_status(exc), _provider_code(exc))


def provider_response_failure_category(exc: BaseException) -> ProviderFailureCategory:
    """Retain transport/provider classes while marking undecodable responses explicitly."""
    category = classify_provider_exception(exc)
    return "invalid_response" if category == "provider_error" else category


def _classify_provider_exception(
    exc: BaseException, status: int | None, code: str | None
) -> ProviderFailureCategory:
    normalized_code = code.lower() if code is not None else ""
    if status in {401, 403} or normalized_code in _AUTHENTICATION_CODES:
        return "authentication"
    if status == 429 or normalized_code in _RATE_LIMIT_CODES:
        return "rate_limited"
    if status in {408, 504}:
        return "timeout"
    if status in {400, 404} or normalized_code in _INVALID_REQUEST_CODES:
        return "invalid_request"

    current: BaseException | None = exc
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        if isinstance(current, (TimeoutError, socket.timeout)) or type(current).__name__ in {
            "ReadTimeoutError",
            "ConnectTimeoutError",
        }:
            return "timeout"
        if type(current).__name__ in {"NoCredentialsError", "PartialCredentialsError"}:
            return "authentication"
        if isinstance(current, (ConnectionError, socket.gaierror)):
            return "connectivity"
        if type(current).__name__ in {
            "EndpointConnectionError",
            "ConnectionClosedError",
            "ProxyConnectionError",
            "SSLError",
            "NewConnectionError",
            "MaxRetryError",
        }:
            return "connectivity"
        if isinstance(current, URLError):
            reason = current.reason
            if isinstance(reason, (TimeoutError, socket.timeout)):
                return "timeout"
            if isinstance(reason, BaseException):
                current = reason
                continue
            return "connectivity"
        current = current.__cause__ or current.__context__

    return "provider_rejected" if status is not None or code is not None else "provider_error"


@dataclass(slots=True)
class ServiceError(Exception):
    code: str
    message: str
    status_code: int = 400

    def __str__(self) -> str:
        return self.message


class ProviderFailure(RuntimeError):
    """Internal marker for failures at embedding, vector, or generation boundaries."""

    def __init__(
        self,
        message: str,
        *,
        details: ProviderFailureDetails | None = None,
        attempt_index: int | None = None,
    ) -> None:
        super().__init__(message)
        if attempt_index is not None and (
            type(attempt_index) is not int or not 1 <= attempt_index <= 12
        ):
            raise ValueError("provider attempt index is invalid")
        self.details = details
        self.attempt_index = attempt_index
