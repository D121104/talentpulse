from collections.abc import Callable
from typing import Annotated, Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import Settings, get_settings

_bearer = HTTPBearer(auto_error=False)


def _local_environment(settings: Settings) -> bool:
    return settings.environment.casefold() in {"local", "development", "test"}


def _validate_non_local_jwt(settings: Settings) -> None:
    if _local_environment(settings):
        return
    asymmetric_algorithms = {
        "RS256",
        "RS384",
        "RS512",
        "PS256",
        "PS384",
        "PS512",
        "ES256",
        "ES384",
        "ES512",
    }
    if not settings.jwt_public_key or settings.jwt_secret:
        raise HTTPException(
            status_code=500,
            detail={
                "code": "auth_not_configured",
                "message": "Asymmetric JWT verification is not configured.",
            },
        )
    if not settings.jwt_issuer or not settings.jwt_audience or not settings.jwt_subject:
        raise HTTPException(
            status_code=500,
            detail={
                "code": "auth_not_configured",
                "message": "JWT issuer, audience, and subject are required.",
            },
        )
    if not settings.jwt_algorithms or any(
        algorithm not in asymmetric_algorithms for algorithm in settings.jwt_algorithms
    ):
        raise HTTPException(
            status_code=500,
            detail={
                "code": "auth_not_configured",
                "message": "Only asymmetric JWT algorithms are allowed.",
            },
        )


def _scopes(payload: dict[str, Any]) -> set[str]:
    values: set[str] = set()
    scope = payload.get("scope")
    if isinstance(scope, str):
        values.update(scope.split())
    scopes = payload.get("scopes")
    if isinstance(scopes, list) and all(isinstance(item, str) for item in scopes):
        values.update(scopes)
    return values


def require_scope(scope_setting: str) -> Callable[..., dict[str, Any]]:
    """Create an endpoint dependency requiring a configured service scope."""

    def dependency(
        credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
        settings: Annotated[Settings, Depends(get_settings)],
    ) -> dict[str, Any]:
        required_scope = getattr(settings, scope_setting)
        if not settings.auth_required:
            if not _local_environment(settings):
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail={
                        "code": "auth_not_configured",
                        "message": "Service authentication is required in this environment.",
                    },
                )
            return {"sub": "local-development", "scope": required_scope}
        if credentials is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "missing_bearer_token", "message": "Bearer token required."},
            )
        _validate_non_local_jwt(settings)
        key = settings.jwt_public_key if settings.jwt_public_key else settings.jwt_secret
        if not key:
            raise HTTPException(
                status_code=500,
                detail={
                    "code": "auth_not_configured",
                    "message": "JWT verification is not configured.",
                },
            )
        required_claims = ["sub", "exp"]
        if not _local_environment(settings):
            required_claims.extend(["iss", "aud"])
        try:
            payload = jwt.decode(
                credentials.credentials,
                key,
                algorithms=list(settings.jwt_algorithms),
                issuer=settings.jwt_issuer,
                audience=settings.jwt_audience,
                options={"require": required_claims},
            )
        except jwt.PyJWTError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "invalid_bearer_token", "message": "Bearer token is invalid."},
            ) from exc
        if not _local_environment(settings) and payload.get("sub") != settings.jwt_subject:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "invalid_bearer_token", "message": "Bearer token is invalid."},
            )
        if required_scope not in _scopes(payload):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "insufficient_scope",
                    "message": "Required service scope is missing.",
                },
            )
        return payload

    return dependency
