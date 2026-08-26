from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

import jwt
from cryptography.hazmat.primitives.asymmetric import ec, rsa
from cryptography.hazmat.primitives.serialization import load_pem_public_key
from jwt import InvalidTokenError

from app.core.errors import ServiceError

SUPPORTED_ALGORITHMS = frozenset({"RS256", "ES256"})
KNOWN_SERVICE_SCOPES = frozenset({"rag:retrieve", "rag:generate", "jobs:index"})


@dataclass(frozen=True, slots=True)
class VerifiedServiceToken:
    subject: str
    issuer: str
    audience: str
    scopes: frozenset[str]
    request_id: UUID
    key_id: str


def normalize_pem(value: str) -> str:
    return value.replace("\\n", chr(10)).strip()


def load_public_key(inline_key: str | None, key_file: str | None) -> str | None:
    if inline_key and key_file:
        raise ValueError("configure one public key source")
    if inline_key:
        value = normalize_pem(inline_key)
    elif key_file:
        value = normalize_pem(Path(key_file).read_text(encoding="utf-8"))
    else:
        return None
    try:
        public_key = load_pem_public_key(value.encode("utf-8"))
    except (TypeError, ValueError) as exc:
        raise ValueError("service auth key must be a PEM public key") from exc
    if not isinstance(public_key, (rsa.RSAPublicKey, ec.EllipticCurvePublicKey)):
        raise ValueError("service auth key must be RSA or EC")
    return value


class JwtServiceTokenVerifier:
    def __init__(
        self,
        public_key: str,
        issuer: str,
        audience: str,
        required_scope: str | None = None,
        allowed_scopes: frozenset[str] = KNOWN_SERVICE_SCOPES,
        expected_key_id: str | None = None,
    ) -> None:
        if not public_key.strip() or not issuer.strip() or not audience.strip():
            raise ValueError("JWT verifier requires a key, issuer and audience")
        if required_scope is not None and required_scope not in allowed_scopes:
            raise ValueError("unknown service scope")
        if expected_key_id is not None and not expected_key_id.strip():
            raise ValueError("expected key id must not be empty")
        self._public_key = normalize_pem(public_key)
        self._issuer = issuer
        self._audience = audience
        self._required_scope = required_scope
        self._allowed_scopes = allowed_scopes
        self._expected_key_id = expected_key_id

    def verify(self, token: str, request_id: UUID) -> VerifiedServiceToken:
        try:
            header = jwt.get_unverified_header(token)
            algorithm = header.get("alg")
            key_id = header.get("kid")
            if (
                algorithm not in SUPPORTED_ALGORITHMS
                or not isinstance(key_id, str)
                or not key_id.strip()
            ):
                raise InvalidTokenError("invalid service JWT header")
            if self._expected_key_id is not None and key_id != self._expected_key_id:
                raise InvalidTokenError("unexpected service JWT key id")
            claims = jwt.decode(
                token,
                self._public_key,
                algorithms=[algorithm],
                issuer=self._issuer,
                audience=self._audience,
                options={"require": ["sub", "iss", "aud", "exp", "iat", "jti", "scope"]},
            )
        except (InvalidTokenError, TypeError, ValueError) as exc:
            raise ServiceError("AI_UNAUTHORIZED", "Invalid service credentials", 401) from exc
        if not isinstance(claims, Mapping):
            raise ServiceError("AI_UNAUTHORIZED", "Invalid service credentials", 401)
        raw_scope = claims.get("scope")
        scopes = frozenset(raw_scope.split()) if isinstance(raw_scope, str) else frozenset()
        if not scopes or not scopes.issubset(self._allowed_scopes):
            raise ServiceError("AI_UNAUTHORIZED", "Invalid service credentials", 401)
        if self._required_scope is not None and self._required_scope not in scopes:
            raise ServiceError("AI_FORBIDDEN", "Required service scope is missing", 403)
        subject = claims.get("sub")
        if not isinstance(subject, str) or not subject.strip():
            raise ServiceError("AI_UNAUTHORIZED", "Invalid service credentials", 401)
        return VerifiedServiceToken(
            subject, self._issuer, self._audience, scopes, request_id, key_id
        )
