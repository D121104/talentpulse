from __future__ import annotations

import base64
import time
from uuid import uuid4

import jwt
from fastapi.testclient import TestClient
from tests.cv_payload import draft_payload

from talentpulse_ai.core.config import Settings, get_settings
from talentpulse_ai.core.exceptions import ServiceError
from talentpulse_ai.infrastructure.embeddings.model import DeterministicEmbeddingProvider
from talentpulse_ai.infrastructure.llm.deterministic import DeterministicGenerationProvider
from talentpulse_ai.infrastructure.vectorstore.memory import InMemoryVectorRetriever
from talentpulse_ai.main import create_app
from talentpulse_ai.modules.cv_generator.agent import CvGenerationReviewResult
from talentpulse_ai.modules.cv_generator.schemas import (
    CvDraft,
    CvDraftRequest,
    CvDraftReviewMetadata,
    DraftExperience,
)


def review_result(payload: dict[str, object] | CvDraftRequest) -> CvGenerationReviewResult:
    request = (
        payload if isinstance(payload, CvDraftRequest) else CvDraftRequest.model_validate(payload)
    )
    experience = request.candidate.experience[0]
    draft = CvDraft(
        request_id=request.identity.request_id,
        trace_id=request.identity.trace_id,
        operation_attempt_id=request.identity.operation_attempt_id,
        candidate_id=request.candidate.candidate_id,
        target_job_id=request.job.job_id,
        template_type=request.template_type,
        full_name=request.candidate.full_name,
        email=request.candidate.email,
        title="Synthetic CV",
        position=request.job.title,
        career_objective=request.candidate.career_objective,
        work_experience=[
            DraftExperience(
                **experience.model_dump(mode="python"),
                source_index=0,
                bullets=["Built a service from synthetic source facts."],
            )
        ],
        source_version=request.source_version,
        content_version=request.content_version,
    )
    metadata = CvDraftReviewMetadata(
        source_refs_by_path={
            "/position": ["/job/title"],
            "/work_experience/0/bullets/0": ["/candidate/experience/0/description"],
        },
        field_origins_by_path={
            "/position": "AI_SUGGESTED",
            "/work_experience/0/bullets/0": "AI_SUGGESTED",
        },
    )
    return CvGenerationReviewResult(
        draft=draft,
        review_metadata=metadata,
        model_calls=1,
        tool_calls=0,
        elapsed_ms=3,
    )


class FakeCvGenerationAgent:
    def __init__(self, *, fail: bool = False) -> None:
        self.fail = fail
        self.calls = 0
        self.timeouts: list[float | None] = []

    def generate_with_review(
        self, request: CvDraftRequest, *, timeout_seconds: float | None = None
    ) -> CvGenerationReviewResult:
        self.calls += 1
        self.timeouts.append(timeout_seconds)
        if self.fail:
            raise ServiceError(
                "cv_generation_provider_failed",
                "The CV generation provider is temporarily unavailable.",
                502,
            )
        return review_result(request)


def test_openapi_keeps_the_cv_draft_request_contract(client) -> None:
    response = client.get("/openapi.json")
    assert response.status_code == 200
    document = response.json()
    schemas = document["components"]["schemas"]
    request_schema = document["paths"]["/internal/v1/cv/draft"]["post"]["requestBody"]["content"][
        "application/json"
    ]["schema"]

    assert request_schema == {"$ref": "#/components/schemas/CvDraftRequest"}
    assert "consent_version" in schemas["CvDraftRequest"]["properties"]


def test_cv_draft_route_always_uses_the_agent_without_a_review_header(client, monkeypatch) -> None:
    agent = FakeCvGenerationAgent()
    monkeypatch.setattr(client.app.state, "cv_generation_agent", agent)

    payload = draft_payload()
    response = client.post("/internal/v1/cv/draft", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert body["generation_mode"] == "EDITOR_ONLY"
    assert body["candidate_id"] == payload["candidate"]["candidate_id"]
    assert body["work_experience"][0]["company_name"] == "Acme"
    assert agent.calls == 1


def test_review_header_returns_agent_envelope_only(client, monkeypatch) -> None:
    agent = FakeCvGenerationAgent()
    monkeypatch.setattr(client.app.state, "cv_generation_agent", agent)

    response = client.post(
        "/internal/v1/cv/draft",
        json=draft_payload(),
        headers={"X-Cv-Review-Metadata": "true"},
    )

    assert response.status_code == 200
    assert response.json()["implementation"] == "agent"
    assert response.json()["review_metadata"]["field_origins_by_path"]["/position"] == (
        "AI_SUGGESTED"
    )
    assert agent.calls == 1


def test_generation_timeout_is_passed_to_agent_and_still_bounded(client, monkeypatch) -> None:
    agent = FakeCvGenerationAgent()
    monkeypatch.setattr(client.app.state, "cv_generation_agent", agent)

    response = client.post(
        "/internal/v1/cv/draft",
        json=draft_payload(),
        headers={"X-Cv-Generation-Timeout-Ms": "45000"},
    )
    rejected = client.post(
        "/internal/v1/cv/draft",
        json=draft_payload(),
        headers={"X-Cv-Generation-Timeout-Ms": "300001"},
    )

    assert response.status_code == 200
    assert agent.timeouts == [45.0]
    assert rejected.status_code == 422


def test_provider_failure_never_returns_a_legacy_draft(client, monkeypatch) -> None:
    agent = FakeCvGenerationAgent(fail=True)
    monkeypatch.setattr(client.app.state, "cv_generation_agent", agent)

    response = client.post(
        "/internal/v1/cv/draft",
        json=draft_payload(),
        headers={"X-Cv-Review-Metadata": "true"},
    )

    assert response.status_code == 502
    assert response.json() == {
        "code": "cv_generation_provider_failed",
        "message": "The CV generation provider is temporarily unavailable.",
    }
    assert agent.calls == 1


def test_configured_local_provider_cannot_fall_back_to_legacy_generation() -> None:
    settings = Settings(environment="test", auth_required=False)
    application = create_app(
        settings,
        embedding_provider=DeterministicEmbeddingProvider(settings.cohere_dimensions),
        vector_retriever=InMemoryVectorRetriever(dimensions=settings.cohere_dimensions),
        generation_provider=DeterministicGenerationProvider(),
    )
    application.dependency_overrides[get_settings] = lambda: settings

    with TestClient(application) as client:
        response = client.post("/internal/v1/cv/draft", json=draft_payload())
    application.dependency_overrides.clear()

    assert response.status_code == 503
    assert response.json()["code"] == "cv_generation_provider_not_supported"
    assert not hasattr(application.state, "cv_draft_service")


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


def test_match_contract_rejects_unknown_fields(client, valid_match_payload) -> None:
    payload = valid_match_payload.copy()
    payload["candidate"]["raw_cv"] = "must not be accepted"
    response = client.post("/internal/v1/cv/match", json=payload)
    assert response.status_code == 422


def test_endpoint_rejects_token_with_scope_for_another_operation(client, settings) -> None:
    settings.auth_required = True
    settings.jwt_algorithms = ("HS256",)
    settings.jwt_secret = "test-secret-key-that-is-at-least-32-bytes"
    token = jwt.encode(
        {"sub": "test-client", "scope": "cv:match", "exp": int(time.time()) + 60},
        settings.jwt_secret,
        algorithm="HS256",
    )
    response = client.post(
        "/internal/v1/cv/parse",
        json={
            "cv_id": str(uuid4()),
            "filename": "resume.pdf",
            "media_type": "application/pdf",
            "content_base64": base64.b64encode(b"%PDF-").decode(),
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403
