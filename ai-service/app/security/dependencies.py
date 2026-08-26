from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.errors import ServiceError
from app.core.settings import Settings
from app.security.service_auth import JwtServiceTokenVerifier, load_public_key

_bearer = HTTPBearer(auto_error=False)


def _require_service_auth(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    required_scope: str | None,
) -> None:
    settings: Settings = request.app.state.settings
    if credentials is None:
        raise ServiceError("AI_UNAUTHORIZED", "Service credentials are required", 401)
    try:
        public_key = load_public_key(
            settings.ai_service_auth_public_key.get_secret_value()
            if settings.ai_service_auth_public_key
            else None,
            settings.ai_service_auth_public_key_file,
        )
    except (OSError, ValueError) as exc:
        raise ServiceError(
            "AI_AUTH_NOT_CONFIGURED", "Service authentication is not configured", 503
        ) from exc
    if public_key is None:
        raise ServiceError(
            "AI_AUTH_NOT_CONFIGURED", "Service authentication is not configured", 503
        )
    verifier = JwtServiceTokenVerifier(
        public_key,
        settings.ai_service_auth_issuer,
        settings.ai_service_auth_audience,
        required_scope,
        expected_key_id=settings.ai_service_auth_key_id,
    )
    verifier.verify(credentials.credentials, UUID(request.state.request_id))


def require_service_auth(
    request: Request, credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]
) -> None:
    _require_service_auth(request, credentials, None)


def require_retrieve_auth(
    request: Request, credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]
) -> None:
    _require_service_auth(request, credentials, "rag:retrieve")


def require_generate_auth(
    request: Request, credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]
) -> None:
    _require_service_auth(request, credentials, "rag:generate")


def require_index_auth(
    request: Request, credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]
) -> None:
    _require_service_auth(request, credentials, "jobs:index")
