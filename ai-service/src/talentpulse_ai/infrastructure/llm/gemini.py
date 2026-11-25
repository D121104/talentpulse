from __future__ import annotations

import json
import re
import time
from collections.abc import Mapping
from dataclasses import replace
from math import isfinite
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from talentpulse_ai.core.exceptions import ProviderFailure, provider_failure_details

_SAFE_PROVIDER_CODE = re.compile(r"[A-Za-z0-9_-]{1,64}\Z")
_GEMINI_SCHEMA_COMPLEXITY_KEYS = frozenset(
    {
        "default",
        "maxItems",
        "minItems",
        "maxLength",
        "minLength",
        "maximum",
        "minimum",
        "pattern",
        "uniqueItems",
    }
)


def _gemini_response_schema(schema: Mapping[str, object]) -> dict[str, object]:
    """Project an application schema to a smaller Gemini request grammar.

    The full schema is still enforced by Pydantic after generation. Array/numeric bounds,
    string validators, and defaults stay local because Gemini's grammar cost grows with
    bounded arrays and these constraints must not be delegated to the provider.
    """

    def project(value: object) -> object:
        if isinstance(value, list):
            return [project(item) for item in value]
        if not isinstance(value, Mapping):
            return value

        projected = {
            key: project(item)
            for key, item in value.items()
            if isinstance(key, str) and key not in _GEMINI_SCHEMA_COMPLEXITY_KEYS
        }
        alternatives = projected.get("anyOf")
        if isinstance(alternatives, list) and len(alternatives) == 2:
            non_null = [
                option
                for option in alternatives
                if not (isinstance(option, Mapping) and option.get("type") == "null")
            ]
            if len(non_null) == 1 and isinstance(non_null[0], Mapping):
                branch = dict(non_null[0])
                branch_type = branch.get("type")
                if isinstance(branch_type, str):
                    branch["type"] = [branch_type, "null"]
                    for key, item in projected.items():
                        if key != "anyOf" and key not in branch:
                            branch[key] = item
                    return branch
        return projected

    projected_schema = project(schema)
    if not isinstance(projected_schema, dict):
        raise ValueError("Gemini response schema must be an object")
    return projected_schema


def _safe_gemini_error_metadata(
    error: HTTPError,
) -> tuple[str | None, str | None, int | None]:
    """Extract bounded error metadata without retaining provider message text."""
    if error.code not in {400, 422, 429} and not 500 <= error.code <= 599:
        return None, None, None
    try:
        payload = json.loads(error.read(8192))
        provider_error = payload.get("error") if isinstance(payload, Mapping) else None
        if not isinstance(provider_error, Mapping):
            provider_error = {}
        provider_code = provider_error.get("status")
        if not isinstance(provider_code, str):
            provider_code = provider_error.get("code")
        message = provider_error.get("message")
    except (OSError, TypeError, ValueError):
        provider_code = None
        message = None

    safe_code = (
        provider_code
        if isinstance(provider_code, str) and _SAFE_PROVIDER_CODE.fullmatch(provider_code)
        else None
    )
    normalized_message = message.casefold() if isinstance(message, str) else ""
    normalized_code = safe_code.casefold() if safe_code is not None else ""
    if error.code == 429 or normalized_code in {
        "resource_exhausted",
        "quota_exceeded",
        "rate_limit_exceeded",
        "too_many_requests",
    }:
        safe_message = "rate_limited"
    elif error.code >= 500 or normalized_code in {"unavailable", "internal"}:
        safe_message = (
            "service_unavailable"
            if (
                normalized_code == "unavailable"
                or any(
                    phrase in normalized_message
                    for phrase in ("unavailable", "overloaded", "try again later")
                )
            )
            else "provider_server_error"
        )
    elif "responsejsonschema" in normalized_message:
        safe_message = "response_json_schema_rejected"
    elif "responseschema" in normalized_message:
        safe_message = "response_schema_rejected"
    elif "schema" in normalized_message:
        safe_message = "schema_rejected"
    elif "unknown name" in normalized_message or "cannot find field" in normalized_message:
        safe_message = "unknown_request_field"
    elif "model" in normalized_message and (
        "not found" in normalized_message or "unsupported" in normalized_message
    ):
        safe_message = "model_rejected"
    else:
        safe_message = "invalid_request"
    retry_after = None
    if error.headers is not None:
        raw_retry_after = error.headers.get("Retry-After")
        if isinstance(raw_retry_after, str) and raw_retry_after.isdecimal():
            seconds = int(raw_retry_after)
            if seconds <= 86_400:
                retry_after = seconds
    return safe_code, safe_message, retry_after


class GeminiGenerationAdapter:
    """JSON generation adapter for the Gemini generateContent API."""

    supports_structured_outputs = True

    def __init__(self, api_key: str, model: str, timeout: float = 25.0) -> None:
        if not api_key or not model or not isfinite(timeout) or timeout <= 0:
            raise ValueError("valid Gemini provider configuration is required")
        self._api_key = api_key
        self._model = model
        self.provider_name = "gemini"
        self.model_name = model
        self._timeout = timeout

    def generate(self, prompt: str) -> object:
        return self._generate(prompt, self._timeout)

    def generate_with_timeout(self, prompt: str, *, timeout: float) -> object:
        if not isfinite(timeout) or timeout <= 0:
            raise ProviderFailure("generation provider failed")
        return self._generate(prompt, timeout)

    def generate_structured(
        self,
        prompt: str,
        schema: Mapping[str, object],
        timeout: float | None = None,
        *,
        num_predict: int | None = None,
    ) -> object:
        request_timeout = self._timeout if timeout is None else timeout
        if not isfinite(request_timeout) or request_timeout <= 0:
            raise ProviderFailure("generation provider failed")
        generation_config: dict[str, object] = {
            "responseMimeType": "application/json",
            "responseJsonSchema": _gemini_response_schema(schema),
        }
        if num_predict is not None:
            if type(num_predict) is not int or num_predict <= 0:
                raise ValueError("num_predict must be a positive integer")
            generation_config["maxOutputTokens"] = num_predict
        return self._generate(prompt, request_timeout, generation_config)

    def _generate(
        self,
        prompt: str,
        timeout: float,
        generation_config: Mapping[str, object] | None = None,
    ) -> object:
        endpoint = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{quote(self._model, safe='')}:generateContent"
        )
        request = Request(
            endpoint,
            data=json.dumps(
                {
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": generation_config
                    or {"responseMimeType": "application/json"},
                }
            ).encode(),
            headers={"Content-Type": "application/json", "x-goog-api-key": self._api_key},
            method="POST",
        )
        started_at = time.perf_counter()
        try:
            with urlopen(request, timeout=timeout) as response:
                raw = response.read()
                provider_status = getattr(response, "status", None)
        except HTTPError as exc:
            details = provider_failure_details(
                exc,
                provider="gemini",
                model=self._model,
                duration_ms=round((time.perf_counter() - started_at) * 1000),
            )
            provider_code, provider_message, retry_after = _safe_gemini_error_metadata(exc)
            raise ProviderFailure(
                "generation provider failed",
                details=replace(
                    details,
                    provider_code=provider_code or details.provider_code,
                    provider_message=provider_message,
                    retry_after_seconds=retry_after,
                ),
            ) from exc
        except (URLError, TimeoutError, OSError) as exc:
            raise ProviderFailure(
                "generation provider failed",
                details=provider_failure_details(
                    exc,
                    provider="gemini",
                    model=self._model,
                    duration_ms=round((time.perf_counter() - started_at) * 1000),
                ),
            ) from exc

        try:
            payload = json.loads(raw)
            text = payload["candidates"][0]["content"]["parts"][0]["text"]
            if not isinstance(text, str):
                raise ValueError("Gemini response text is invalid")
            return json.loads(text)
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise ProviderFailure(
                "generation provider failed",
                details=provider_failure_details(
                    exc,
                    provider="gemini",
                    model=self._model,
                    duration_ms=round((time.perf_counter() - started_at) * 1000),
                    category="invalid_response",
                    provider_status=provider_status if isinstance(provider_status, int) else None,
                ),
            ) from exc
