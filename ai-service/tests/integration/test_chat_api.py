import logging
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from talentpulse_ai.agent_foundation.selector import CapabilityImplementationSelector
from talentpulse_ai.core.config import Settings, get_settings
from talentpulse_ai.core.exceptions import ServiceError
from talentpulse_ai.infrastructure.embeddings.model import (
    CohereEmbeddingAdapter,
    DeterministicEmbeddingProvider,
)
from talentpulse_ai.infrastructure.vectorstore.memory import InMemoryVectorRetriever
from talentpulse_ai.infrastructure.vectorstore.qdrant import QdrantVectorRetriever
from talentpulse_ai.main import create_app
from talentpulse_ai.modules.rag_chatbot.schemas import RagGenerateResponse


@pytest.mark.parametrize("boundary", ["embedding", "vector"])
def test_retrieval_provider_failure_preserves_controlled_response(
    client, valid_rag_retrieve_payload, monkeypatch, boundary
) -> None:
    from talentpulse_ai.core.exceptions import ProviderFailure, ProviderFailureDetails

    def fail(*args, **kwargs):
        raise ProviderFailure(
            "SYNTHETIC_PRIVATE_PROVIDER_MESSAGE",
            details=ProviderFailureDetails(
                provider="cohere" if boundary == "embedding" else "qdrant",
                model="synthetic-model",
                category="rate_limited",
                provider_status=429,
                provider_code="SyntheticQuotaExceeded",
            ),
        )

    service = client.app.state.retrieval_service
    target, method = (
        (service._embedding, "embed_query")
        if boundary == "embedding"
        else (service._vector_store, "search")
    )
    monkeypatch.setattr(target, method, fail)
    response = client.post("/internal/v1/rag/retrieve", json=valid_rag_retrieve_payload)

    assert response.status_code == 503
    assert response.json() == {
        "code": "retrieval_unavailable",
        "message": "Job retrieval is temporarily unavailable.",
    }


def test_generation_provider_failure_preserves_fallback_response(
    client, monkeypatch, caplog
) -> None:
    from tests.unit.rag_chatbot.test_rag import generate_request

    from talentpulse_ai.core.exceptions import ProviderFailure, ProviderFailureDetails

    calls = []

    def fail(*args, **kwargs):
        calls.append(True)
        raise ProviderFailure(
            "SYNTHETIC_PRIVATE_PROVIDER_MESSAGE",
            details=ProviderFailureDetails(
                provider="gemini",
                model="synthetic-model",
                category="rate_limited",
                provider_status=429,
                provider_code="SyntheticQuotaExceeded",
            ),
        )

    caplog.set_level(logging.INFO)
    monkeypatch.setattr(client.app.state.generation_service._provider, "generate", fail)
    request = generate_request("ADVICE", locale="en")
    response = client.post("/internal/v1/rag/generate", json=request.model_dump(mode="json"))

    assert response.status_code == 200
    body = response.json()
    assert calls
    assert body["request_id"] == str(request.identity.request_id)
    assert body["trace_id"] == str(request.identity.trace_id)
    assert body["source"] == "deterministic_fallback"
    assert body["fallbackReason"] == "provider_error"
    assert body["degraded"] is True
    assert body["claims"] == []
    assert body["citation_keys"] == []
    assert body["referenced_job_ids"] == []
    completion_logs = [
        record.getMessage()
        for record in caplog.records
        if record.getMessage().startswith("rag_generation_completed ")
    ]
    assert completion_logs == [
        "rag_generation_completed "
        f"request_id={request.identity.request_id} trace_id={request.identity.trace_id} "
        "intent=ADVICE source=deterministic_fallback answer_status=DEGRADED "
        "degraded=True fallback_reason=provider_error"
    ]
    for internal in (
        "ai_provider_failure",
        "SYNTHETIC_PRIVATE_PROVIDER_MESSAGE",
        "category",
        "provider_status",
        "provider_code",
        "provider_message",
        "SyntheticQuotaExceeded",
        "synthetic-model",
    ):
        assert internal not in response.text


class NullProvider:
    def generate(self, prompt: str) -> object:
        del prompt
        return None


class TimeoutAwareStructuredProvider:
    def generate(self, prompt: str) -> object:
        del prompt
        return None

    def generate_structured(self, prompt: str, schema, timeout=None) -> object:
        del prompt, schema
        assert timeout is not None and timeout > 0
        return {
            "kind": "final",
            "output": {
                "answer_blocks": [{"kind": "REFUSAL", "text": "No evidence."}],
                "claims": [],
                "citation_keys": [],
                "referenced_job_ids": [],
            },
        }


class SelectedLegacyGeneration:
    def __init__(self) -> None:
        self.calls = 0

    def generate(self, request):
        self.calls += 1
        return RagGenerateResponse(
            request_id=request.identity.request_id,
            trace_id=request.identity.trace_id,
            client_message_id=request.identity.client_message_id,
            answer_status="NO_EVIDENCE",
            answer_blocks=[],
            claims=[],
            citation_keys=[],
            referenced_job_ids=[],
            filters=request.filter_state,
            state_delta={},
            degraded=False,
            source="deterministic_fallback",
            fallbackReason="insufficient_evidence",
        )


class FailingSelectedAgent:
    def __init__(self, switch_selector) -> None:
        self.calls = 0
        self.switch_selector = switch_selector

    def generate(self, _request):
        self.calls += 1
        self.switch_selector()
        raise ServiceError("generation_unavailable", "Unavailable.", 503)


def test_enabled_unregistered_agent_flag_preserves_rag_generate_contract() -> None:
    settings = Settings(
        environment="test",
        auth_required=False,
        agent_enabled_capabilities=frozenset({"rag.generate"}),
    )
    application = create_app(
        settings,
        embedding_provider=DeterministicEmbeddingProvider(settings.cohere_dimensions),
        vector_retriever=InMemoryVectorRetriever(dimensions=settings.cohere_dimensions),
        generation_provider=NullProvider(),
    )
    application.dependency_overrides[get_settings] = lambda: settings
    payload = {
        "identity": {
            "request_id": str(uuid4()),
            "trace_id": str(uuid4()),
            "operation_attempt_id": str(uuid4()),
            "client_message_id": str(uuid4()),
            "user_id": str(uuid4()),
            "session_id": str(uuid4()),
        },
        "normalized_user_message": "Find a suitable role.",
        "intent": "JOB_SEARCH",
        "locale": "en",
        "recent_history": [],
        "filter_state": {},
        "canonical_active_job_context": [],
        "retrieval_evidence": [],
        "explicit_filters": {},
        "policy": {"data_scope": "PUBLIC_ACTIVE_JOBS", "max_candidates": 20},
    }

    with TestClient(application) as client:
        response = client.post("/internal/v1/rag/generate", json=payload)
        openapi = client.get("/openapi.json").json()

    assert response.status_code == 200
    body = response.json()
    assert body["answer_status"] == "NO_EVIDENCE"
    assert body["citation_keys"] == []
    assert body["referenced_job_ids"] == []
    assert body["source"] == "deterministic_fallback"
    assert body["fallbackReason"] == "validation_error"
    assert body["answer_blocks"]
    assert body["claims"] == []
    assert body["filters"] == {
        "company": None,
        "location": None,
        "level": None,
        "salary_min": None,
        "salary_max": None,
        "skills": [],
    }
    assert body["state_delta"] == {}
    assert body["degraded"] is True
    generation_operation = openapi["paths"]["/internal/v1/rag/generate"]["post"]
    assert generation_operation["requestBody"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/RagGenerateRequest"
    }
    assert generation_operation["responses"]["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/RagGenerateResponse"
    }
    legacy = object()
    agent = object()
    assert (
        application.state.capability_selector.select("rag.generate", legacy=legacy, agent=agent)
        is legacy
    )
    application.dependency_overrides.clear()


def test_agent_failure_does_not_retry_legacy_and_next_request_uses_legacy() -> None:
    settings = Settings(
        environment="test",
        auth_required=False,
        agent_enabled_capabilities=frozenset({"rag.generate"}),
    )
    application = create_app(
        settings,
        embedding_provider=DeterministicEmbeddingProvider(settings.cohere_dimensions),
        vector_retriever=InMemoryVectorRetriever(dimensions=settings.cohere_dimensions),
        generation_provider=NullProvider(),
    )
    legacy = SelectedLegacyGeneration()

    def disable_agent_for_next_request() -> None:
        application.state.capability_selector = CapabilityImplementationSelector(
            settings.model_copy(update={"agent_enabled_capabilities": frozenset()}),
            frozenset({"rag.generate"}),
        )

    agent = FailingSelectedAgent(disable_agent_for_next_request)
    application.state.generation_service = legacy
    application.dependency_overrides[get_settings] = lambda: settings
    application.state.capability_selector = CapabilityImplementationSelector(
        settings, frozenset({"rag.generate"})
    )
    application.state.agent_generation_service = agent
    payload = {
        "identity": {
            key: str(uuid4())
            for key in (
                "request_id",
                "trace_id",
                "operation_attempt_id",
                "client_message_id",
                "user_id",
                "session_id",
            )
        },
        "normalized_user_message": "Find a role.",
        "intent": "JOB_SEARCH",
        "locale": "en",
        "recent_history": [],
        "filter_state": {},
        "canonical_active_job_context": [],
        "retrieval_evidence": [],
        "explicit_filters": {},
        "policy": {"data_scope": "PUBLIC_ACTIVE_JOBS", "max_candidates": 20},
    }

    with TestClient(application) as client:
        failed = client.post("/internal/v1/rag/generate", json=payload)
        next_request = client.post("/internal/v1/rag/generate", json=payload)

    assert failed.status_code == 503
    assert agent.calls == 1
    assert legacy.calls == 1
    assert next_request.status_code == 200
    assert next_request.json()["source"] == "deterministic_fallback"
    application.dependency_overrides.clear()


def test_registered_agent_capability_is_selected_only_by_server_flag() -> None:
    settings = Settings(
        environment="test",
        auth_required=False,
        agent_enabled_capabilities=frozenset({"rag.generate"}),
    )
    application = create_app(
        settings,
        embedding_provider=DeterministicEmbeddingProvider(settings.cohere_dimensions),
        vector_retriever=InMemoryVectorRetriever(dimensions=settings.cohere_dimensions),
        generation_provider=TimeoutAwareStructuredProvider(),
    )
    agent = application.state.agent_generation_service
    selected_agent = agent.generate
    calls = []

    def record_agent_call(request):
        calls.append(request)
        return selected_agent(request)

    agent.generate = record_agent_call
    application.dependency_overrides[get_settings] = lambda: settings
    payload = {
        "identity": {
            key: str(uuid4())
            for key in (
                "request_id",
                "trace_id",
                "operation_attempt_id",
                "client_message_id",
                "user_id",
                "session_id",
            )
        },
        "normalized_user_message": "Find a role.",
        "intent": "JOB_SEARCH",
        "locale": "en",
        "recent_history": [],
        "filter_state": {},
        "canonical_active_job_context": [],
        "retrieval_evidence": [],
        "explicit_filters": {},
        "policy": {"data_scope": "PUBLIC_ACTIVE_JOBS", "max_candidates": 20},
    }

    with TestClient(application) as client:
        response = client.post("/internal/v1/rag/generate", json=payload)

    assert response.status_code == 200
    assert response.json()["answer_status"] == "NO_EVIDENCE"
    assert len(calls) == 1
    application.dependency_overrides.clear()


def test_health_endpoints_keep_compatibility_and_are_local_only() -> None:
    settings = Settings(auth_required=False)
    application = create_app(
        settings,
        embedding_provider=DeterministicEmbeddingProvider(settings.cohere_dimensions),
        vector_retriever=InMemoryVectorRetriever(dimensions=settings.cohere_dimensions),
    )
    with TestClient(application) as client:
        assert client.get("/health/live").status_code == 200
        assert client.get("/health").json() == {"status": "ok"}
        assert client.get("/health/ready").json() == {"status": "ok"}


def test_readiness_failure_is_sanitized_and_returns_503() -> None:
    settings = Settings(auth_required=False)
    application = create_app(
        settings,
        embedding_provider=DeterministicEmbeddingProvider(settings.cohere_dimensions),
        vector_retriever=InMemoryVectorRetriever(dimensions=settings.cohere_dimensions),
    )
    application.state.vector_provider = object()

    with TestClient(application) as client:
        response = client.get("/health/ready")

    assert response.status_code == 503
    assert response.json() == {
        "status": "not_ready",
        "code": "not_ready",
        "message": "Service is not ready.",
    }


def test_non_local_readiness_checks_configuration_without_provider_calls() -> None:
    settings = Settings(
        environment="demo",
        auth_required=True,
        jwt_algorithms=("RS256",),
        jwt_public_key="configured-public-key",
        jwt_issuer="https://issuer.example",
        jwt_audience="talentpulse-ai",
        jwt_subject="talentpulse-backend",
        embedding_provider="cohere",
        vector_store_provider="qdrant",
        generation_provider="bedrock",
        qdrant_url="https://qdrant.example",
        qdrant_collection="jobs_v1",
        qdrant_alias="jobs_current",
        qdrant_index_version="demo-v1",
        bedrock_region="ap-southeast-2",
        bedrock_model="amazon.nova-lite-v1:0",
    )
    embedding = CohereEmbeddingAdapter(object(), settings.cohere_model, settings.cohere_dimensions)
    vector = QdrantVectorRetriever(
        object(),
        settings.qdrant_collection,
        collection_alias=settings.qdrant_alias,
        index_version=settings.qdrant_index_version,
        dimensions=settings.cohere_dimensions,
    )
    application = create_app(
        settings,
        embedding_provider=embedding,
        vector_retriever=vector,
        generation_provider=NullProvider(),
    )

    with TestClient(application) as client:
        response = client.get("/health/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.parametrize(
    ("subject", "scope", "status_code", "error_code"),
    [
        ("untrusted-service", "rag:retrieve", 401, "invalid_bearer_token"),
        (None, "rag:retrieve", 401, "invalid_bearer_token"),
        ("talentpulse-backend", "rag:generate", 403, "insufficient_scope"),
        ("talentpulse-backend", None, 403, "insufficient_scope"),
    ],
)
def test_non_local_rag_auth_requires_exact_subject_and_endpoint_scope(
    client,
    non_local_auth,
    valid_rag_retrieve_payload,
    subject,
    scope,
    status_code,
    error_code,
) -> None:
    _, token = non_local_auth
    response = client.post(
        "/internal/v1/rag/retrieve",
        json=valid_rag_retrieve_payload,
        headers={"Authorization": f"Bearer {token(subject=subject, scope=scope)}"},
    )

    assert response.status_code == status_code
    assert response.json()["detail"]["code"] == error_code


def test_non_local_rag_auth_accepts_valid_claims(
    client, non_local_auth, valid_rag_retrieve_payload
) -> None:
    _, token = non_local_auth
    response = client.post(
        "/internal/v1/rag/retrieve",
        json=valid_rag_retrieve_payload,
        headers={"Authorization": f"Bearer {token(scope='rag:retrieve')}"},
    )

    assert response.status_code == 200
