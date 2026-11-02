import base64
import time
from uuid import uuid4

import jwt
import pytest
from tests.cv_payload import draft_payload


def test_openapi_preserves_public_job_profile_components_and_refs(client) -> None:
    response = client.get("/openapi.json")
    assert response.status_code == 200
    document = response.json()
    schemas = document["components"]["schemas"]
    match_job = "app__domain__contracts__JobProfile"
    draft_job = "app__domain__cv_generation__JobProfile"
    assert {match_job, draft_job} <= schemas.keys()
    assert not any(name.startswith("talentpulse_ai__") for name in schemas)
    for path, request_model, job_model in (
        ("/internal/v1/cv/match", "MatchRequest", match_job),
        ("/internal/v1/cv/draft", "CvDraftRequest", draft_job),
    ):
        request_schema = document["paths"][path]["post"]["requestBody"]["content"][
            "application/json"
        ]["schema"]
        assert request_schema == {"$ref": f"#/components/schemas/{request_model}"}
        assert schemas[request_model]["properties"]["job"] == {
            "$ref": f"#/components/schemas/{job_model}"
        }


def test_draft_route_requires_dedicated_scope(client, settings) -> None:
    settings.auth_required = True
    settings.jwt_algorithms = ("HS256",)
    settings.jwt_secret = "test-secret-key-that-is-at-least-32-bytes"
    token = jwt.encode(
        {"sub": "test-client", "scope": "cv:match", "exp": 4_102_444_800},
        settings.jwt_secret,
        algorithm="HS256",
    )

    response = client.post(
        "/internal/v1/cv/draft",
        json=draft_payload(),
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "insufficient_scope"


def test_draft_route_returns_editable_draft_with_local_auth_disabled(client) -> None:
    response = client.post("/internal/v1/cv/draft", json=draft_payload())

    assert response.status_code == 200
    body = response.json()
    assert body["generation_mode"] == "EDITOR_ONLY"
    assert body["work_experience"][0]["company_name"] == "Acme"


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


@pytest.mark.parametrize(
    ("subject", "scope", "status_code", "error_code"),
    [
        ("untrusted-service", "cv:match", 401, "invalid_bearer_token"),
        (None, "cv:match", 401, "invalid_bearer_token"),
        ("talentpulse-backend", "cv:parse", 403, "insufficient_scope"),
        ("talentpulse-backend", None, 403, "insufficient_scope"),
    ],
)
def test_non_local_cv_auth_requires_exact_subject_and_endpoint_scope(
    client, non_local_auth, valid_match_payload, subject, scope, status_code, error_code
) -> None:
    _, token = non_local_auth
    response = client.post(
        "/internal/v1/cv/match",
        json=valid_match_payload,
        headers={"Authorization": f"Bearer {token(subject=subject, scope=scope)}"},
    )

    assert response.status_code == status_code
    assert response.json()["detail"]["code"] == error_code


def test_non_local_cv_auth_accepts_valid_claims(
    client, non_local_auth, valid_match_payload
) -> None:
    _, token = non_local_auth
    response = client.post(
        "/internal/v1/cv/match",
        json=valid_match_payload,
        headers={"Authorization": f"Bearer {token(scope='cv:match')}"},
    )

    assert response.status_code == 200


def test_auth_disabled_fails_closed_outside_local_environments(settings) -> None:
    from talentpulse_ai.main import create_app

    settings.environment = "production"
    settings.auth_required = False
    with pytest.raises(RuntimeError, match="Authentication cannot be disabled"):
        create_app(settings)
