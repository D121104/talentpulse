from __future__ import annotations

from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse


class ServiceError(Exception):
    def __init__(
        self, code: str, message: str, status_code: int = 500, details: dict[str, Any] | None = None
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details


def error_response(request: Request, error: ServiceError) -> JSONResponse:
    request_id = getattr(request.state, "request_id", "unknown")
    return JSONResponse(
        status_code=error.status_code,
        content={
            "error": {
                "code": error.code,
                "message": error.message,
                "requestId": request_id,
                **({"details": error.details} if error.details else {}),
            }
        },
        headers={"X-Request-ID": request_id},
    )


class ProviderError(ServiceError):
    def __init__(self, message: str = "AI provider unavailable") -> None:
        super().__init__("AI_PROVIDER_UNAVAILABLE", message, 503)


class InvalidModelOutputError(ServiceError):
    def __init__(self) -> None:
        super().__init__(
            "AI_INVALID_MODEL_OUTPUT", "The AI provider returned an invalid response", 502
        )


class NotImplementedServiceError(ServiceError):
    def __init__(self, operation: str) -> None:
        super().__init__(
            "AI_FEATURE_NOT_IMPLEMENTED", f"{operation} is not available in Phase 1", 501
        )
