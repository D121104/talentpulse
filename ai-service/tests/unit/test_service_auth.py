from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import jwt
import pytest
from app.core.errors import ServiceError
from app.security.service_auth import JwtServiceTokenVerifier, load_public_key, normalize_pem
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa


@pytest.fixture
def key_pair() -> tuple[str, str]:
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    public_pem = (
        private.public_key()
        .public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode()
    )
    return private_pem, public_pem


def token(private_key: str, kid: str = "dev-key-1", **overrides: object) -> str:
    now = datetime.now(UTC)
    claims: dict[str, object] = {
        "sub": "talentpulse-api",
        "iss": "talentpulse-api",
        "aud": "talentpulse-ai",
        "scope": "rag:retrieve",
        "iat": now,
        "exp": now + timedelta(minutes=1),
        "jti": str(uuid4()),
    }
    claims.update(overrides)
    return jwt.encode(claims, private_key, algorithm="RS256", headers={"kid": kid})


def test_load_public_key_supports_inline_and_file_sources(
    key_pair: tuple[str, str], tmp_path: Path
) -> None:
    _, public = key_pair
    assert load_public_key(public.replace("\n", "\\n"), None) == public.strip()

    key_file = tmp_path / "service-public.pem"
    key_file.write_text(public, encoding="utf-8")
    assert load_public_key(None, str(key_file)) == public.strip()

    with pytest.raises(ValueError):
        load_public_key("not-a-public-key", None)


def test_verifier_accepts_backend_service_token_with_kid_and_scope(
    key_pair: tuple[str, str],
) -> None:
    private, public = key_pair
    verified = JwtServiceTokenVerifier(
        public, "talentpulse-api", "talentpulse-ai", "rag:retrieve", expected_key_id="dev-key-1"
    ).verify(token(private), uuid4())
    assert verified.key_id == "dev-key-1"
    assert verified.scopes == frozenset({"rag:retrieve"})


def test_verifier_accepts_escaped_pem(key_pair: tuple[str, str]) -> None:
    private, public = key_pair
    assert normalize_pem(public.replace("\n", "\\n")) == public.strip()
    assert JwtServiceTokenVerifier(
        public.replace("\n", "\\n"), "talentpulse-api", "talentpulse-ai"
    ).verify(token(private), uuid4())


@pytest.mark.parametrize(
    "overrides",
    [
        {"aud": "wrong-audience"},
        {"iss": "wrong-issuer"},
        {"scope": "jobs:index"},
        {"scope": "rag:retrieve admin"},
        {"scope": "unknown-scope"},
    ],
)
def test_verifier_rejects_invalid_backend_token(
    overrides: dict[str, object], key_pair: tuple[str, str]
) -> None:
    private, public = key_pair
    with pytest.raises(ServiceError) as error:
        JwtServiceTokenVerifier(public, "talentpulse-api", "talentpulse-ai", "rag:retrieve").verify(
            token(private, **overrides), uuid4()
        )
    assert error.value.status_code in {401, 403}


def test_verifier_rejects_missing_kid(key_pair: tuple[str, str]) -> None:
    private, public = key_pair
    raw = jwt.encode(
        {
            "sub": "x",
            "iss": "talentpulse-api",
            "aud": "talentpulse-ai",
            "scope": "rag:retrieve",
            "iat": 1,
            "exp": 2,
            "jti": "x",
        },
        private,
        algorithm="RS256",
    )
    with pytest.raises(ServiceError):
        JwtServiceTokenVerifier(
            public, "talentpulse-api", "talentpulse-ai", expected_key_id="dev-key-1"
        ).verify(raw, uuid4())


def test_verifier_rejects_wrong_kid(key_pair: tuple[str, str]) -> None:
    private, public = key_pair
    with pytest.raises(ServiceError):
        JwtServiceTokenVerifier(
            public, "talentpulse-api", "talentpulse-ai", expected_key_id="dev-key-1"
        ).verify(token(private, kid="rotated-key"), uuid4())


def test_verifier_rejects_expired_token(key_pair: tuple[str, str]) -> None:
    private, public = key_pair
    now = datetime.now(UTC)
    with pytest.raises(ServiceError):
        JwtServiceTokenVerifier(public, "talentpulse-api", "talentpulse-ai").verify(
            token(private, iat=now - timedelta(minutes=2), exp=now - timedelta(minutes=1)), uuid4()
        )


@pytest.mark.parametrize("scope", ["rag:retrieve", "rag:generate", "jobs:index"])
def test_verifier_accepts_each_configured_operation_scope(
    scope: str, key_pair: tuple[str, str]
) -> None:
    private, public = key_pair
    verified = JwtServiceTokenVerifier(
        public, "talentpulse-api", "talentpulse-ai", scope, expected_key_id="dev-key-1"
    ).verify(token(private, scope=scope), uuid4())
    assert scope in verified.scopes
