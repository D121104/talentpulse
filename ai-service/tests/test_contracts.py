import base64
import time
from uuid import uuid4

import jwt
import pytest


def test_parse_contract_rejects_unknown_fields(client) -> None:
    payload = {
        "cv_id": str(uuid4()),
        "filename": "resume.pdf",
        "media_type": "application/pdf",
        "content_base64": base64.b64encode(b"x").decode(),
        "unexpected": True,
    }
    response = client.post("/internal/v1/cv/parse", json=payload)
    assert response.status_code == 422
    assert response.json() == {
        "code": "invalid_request",
        "message": "Request failed schema validation.",
    }


def test_match_contract_rejects_unknown_fields(client, valid_match_payload) -> None:
    payload = valid_match_payload.copy()
    payload["candidate"]["raw_cv"] = "must not be accepted"
    response = client.post("/internal/v1/cv/match", json=payload)
    assert response.status_code == 422


def service_token(settings, scope: str) -> str:
    return jwt.encode(
        {"sub": "test-client", "scope": scope, "exp": int(time.time()) + 60},
        settings.jwt_secret,
        algorithm="HS256",
    )


@pytest.mark.parametrize(
    ("path", "scope", "payload"),
    [
        (
            "/internal/v1/cv/parse",
            "cv:match",
            {
                "cv_id": str(uuid4()),
                "filename": "resume.pdf",
                "media_type": "application/pdf",
                "content_base64": base64.b64encode(b"%PDF-").decode(),
            },
        ),
        ("/internal/v1/cv/match", "cv:parse", {}),
        ("/internal/v1/rag/retrieve", "rag:generate", {}),
        ("/internal/v1/rag/generate", "rag:retrieve", {}),
    ],
)
def test_endpoint_rejects_token_with_scope_for_another_operation(
    client, settings, path, scope, payload
) -> None:
    settings.auth_required = True
    settings.jwt_algorithms = ("HS256",)
    settings.jwt_secret = "test-secret-key-that-is-at-least-32-bytes"
    response = client.post(
        path,
        json=payload,
        headers={"Authorization": f"Bearer {service_token(settings, scope)}"},
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "insufficient_scope"


def test_internal_endpoint_requires_bearer_token_when_enabled(
    client, settings, valid_match_payload
) -> None:
    settings.auth_required = True
    response = client.post("/internal/v1/cv/match", json=valid_match_payload)
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "missing_bearer_token"


def test_auth_disabled_fails_closed_outside_local_environments(settings) -> None:
    from app.main import create_app

    settings.environment = "production"
    settings.auth_required = False
    with pytest.raises(RuntimeError, match="Authentication cannot be disabled"):
        create_app(settings)


def test_parse_response_has_bounded_structured_fields_and_forbids_extras() -> None:
    from app.domain.contracts import CVParseResponse
    from pydantic import ValidationError

    response = CVParseResponse(
        cv_id=uuid4(),
        content_version=1,
        media_type="application/pdf",
        content_sha256="a" * 64,
        extracted_text="A parsed CV",
        text_char_count=11,
        skills=["Python"],
        education=["BSc Computer Science"],
        experience=["Backend Engineer"],
        certificates=["AWS Certified Developer"],
        warnings=["Some content was not classified."],
    )

    assert response.parser_version == "structured-parser-v1"
    assert response.model_dump()["skills"] == ["Python"]

    with pytest.raises(ValidationError):
        CVParseResponse(
            cv_id=uuid4(),
            content_version=1,
            media_type="application/pdf",
            content_sha256="a" * 64,
            extracted_text="A parsed CV",
            text_char_count=11,
            unexpected=True,
        )


def test_parse_response_rejects_unbounded_structured_items() -> None:
    from app.domain.contracts import CVParseResponse

    with pytest.raises(ValueError):
        CVParseResponse(
            cv_id=uuid4(),
            content_version=1,
            media_type="application/pdf",
            content_sha256="a" * 64,
            extracted_text="A parsed CV",
            text_char_count=11,
            skills=["x"] * 51,
        )
