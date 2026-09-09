from collections.abc import Callable, Iterator
from typing import Any
from uuid import uuid4

import jwt
import pytest
from app.core.config import Settings, get_settings
from app.main import app
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient


@pytest.fixture
def settings() -> Settings:
    return Settings(
        auth_required=False, max_upload_bytes=1024, max_extracted_chars=1_000, max_pdf_pages=1
    )


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    app.dependency_overrides[get_settings] = lambda: settings
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def match_payload(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "identity": {
            "request_id": str(uuid4()),
            "trace_id": str(uuid4()),
            "operation_attempt_id": str(uuid4()),
        },
        "cv_id": str(uuid4()),
        "job_id": str(uuid4()),
        "content_hash": "a" * 64,
        "content_version": "cv-content-v1",
        "job_source_version": "job-source-v1",
        "idempotency_key": "cv-match:test:cv-content-v1:job-source-v1",
        "locale": "en",
        "candidate": {
            "skills": ["Python", "PostgreSQL"],
            "years_experience": 4.0,
            "level": "mid",
            "location": "Hanoi",
            "work_modes": ["hybrid"],
        },
        "job": {
            "required_skills": ["python", "Docker"],
            "preferred_skills": ["PostgreSQL"],
            "min_years_experience": 3.0,
            "level": "mid",
            "location": "Hanoi",
        },
    }
    payload.update(overrides)
    return payload


@pytest.fixture
def valid_match_payload() -> dict[str, Any]:
    return match_payload()


@pytest.fixture
def non_local_auth(
    settings: Settings,
) -> tuple[Settings, Callable[..., str]]:
    """Provide deterministic non-local JWT verification with an ephemeral RSA key."""
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    settings.environment = "demo"
    settings.auth_required = True
    settings.jwt_algorithms = ("RS256",)
    settings.jwt_public_key = (
        private_key.public_key()
        .public_bytes(
            serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode()
    )
    settings.jwt_issuer = "https://issuer.example"
    settings.jwt_audience = "talentpulse-ai"
    settings.jwt_subject = "talentpulse-backend"

    def token(
        *,
        scope: str | None = "cv:match",
        subject: str | None = "talentpulse-backend",
    ) -> str:
        payload: dict[str, Any] = {
            "iss": settings.jwt_issuer,
            "aud": settings.jwt_audience,
            "exp": 4_102_444_800,
        }
        if subject is not None:
            payload["sub"] = subject
        if scope is not None:
            payload["scope"] = scope
        return jwt.encode(payload, private_key, algorithm="RS256")

    return settings, token


@pytest.fixture
def valid_rag_retrieve_payload() -> dict[str, Any]:
    return {
        "identity": {
            "request_id": str(uuid4()),
            "trace_id": str(uuid4()),
            "operation_attempt_id": str(uuid4()),
            "client_message_id": str(uuid4()),
            "user_id": str(uuid4()),
            "session_id": str(uuid4()),
        },
        "normalized_user_message": "python remote",
        "locale": "en",
        "recent_history": [],
        "filter_state": {},
        "explicit_filters": {},
        "policy": {"data_scope": "PUBLIC_ACTIVE_JOBS", "max_candidates": 20},
    }
