from __future__ import annotations

import json
from types import SimpleNamespace
from uuid import uuid4

from app.adapters import build_chat_model, build_embedding_model, build_vector_store
from app.adapters.fakes import FakeChatModel, FakeEmbeddingModel, InMemoryVectorStore
from app.adapters.qdrant.store import QdrantVectorStore
from app.core.settings import ChatProvider, EmbeddingProvider, Settings, VectorStoreProvider
from app.main import create_app
from app.ports import ChatRequest, EmbeddingInputType, VectorRecord
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient


def test_live_does_not_require_external_dependencies() -> None:
    app = create_app(Settings(qdrant_url="http://127.0.0.1:1"))
    response = TestClient(app).get("/health/live")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers["x-request-id"]


def test_ready_reports_qdrant_failure_without_provider_call() -> None:
    app = create_app(Settings(qdrant_url="http://127.0.0.1:1"))
    response = TestClient(app).get("/health/ready")
    assert response.status_code == 503
    assert response.json()["checks"]["qdrant"] == "unavailable"


def test_ready_reports_auth_and_qdrant_without_provider_health_calls() -> None:
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public = (
        private.public_key()
        .public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode()
    )
    settings = Settings(
        chat_model_provider=ChatProvider.FAKE,
        embedding_provider=EmbeddingProvider.FAKE,
        vector_store_provider=VectorStoreProvider.FAKE,
        ai_service_auth_public_key=public,
    )
    app = create_app(settings)

    class ProviderMustNotBeProbed:
        async def health(self) -> bool:
            raise AssertionError("provider readiness must not call model health")

    app.state.chat_model = ProviderMustNotBeProbed()
    app.state.embedding_model = ProviderMustNotBeProbed()
    response = TestClient(app).get("/health/ready")

    assert response.status_code == 200
    assert response.json()["status"] == "ready"
    assert response.json()["checks"]["qdrant"] == "ok"
    assert response.json()["checks"]["serviceAuth"] == "ok"


def test_retrieve_history_total_limit_matches_nest_contract() -> None:
    from app.schemas import RagRetrieveRequest

    with __import__("pytest").raises(ValueError):
        RagRetrieveRequest.model_validate(
            {
                "identity": {
                    field: str(uuid4())
                    for field in (
                        "request_id",
                        "trace_id",
                        "operation_attempt_id",
                        "client_message_id",
                        "user_id",
                        "session_id",
                    )
                },
                "normalized_user_message": "find jobs",
                "locale": "en",
                "recent_history": ["a" * 3001, "b" * 3000],
                "filter_state": {"skills": []},
                "explicit_filters": {},
                "filter_provenance": {},
                "policy": {"data_scope": "PUBLIC_ACTIVE_JOBS", "max_candidates": 20},
            }
        )


def test_internal_routes_require_service_auth() -> None:
    app = create_app(Settings(qdrant_url="http://127.0.0.1:1"))
    payload = {
        "identity": {
            "request_id": str(uuid4()),
            "trace_id": str(uuid4()),
            "operation_attempt_id": str(uuid4()),
            "client_message_id": str(uuid4()),
            "user_id": str(uuid4()),
            "session_id": str(uuid4()),
        },
        "normalized_user_message": "find Python jobs",
    }
    response = TestClient(app).post("/internal/v1/rag/retrieve", json=payload)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AI_UNAUTHORIZED"


def test_fake_provider_factory_uses_application_ports_without_provider_imports() -> None:
    settings = Settings(
        chat_model_provider=ChatProvider.FAKE,
        embedding_provider=EmbeddingProvider.FAKE,
        vector_store_provider=VectorStoreProvider.FAKE,
    )
    assert isinstance(build_chat_model(settings), FakeChatModel)
    assert isinstance(build_embedding_model(settings), FakeEmbeddingModel)
    assert isinstance(build_vector_store(settings), InMemoryVectorStore)


def test_fake_providers_are_deterministic_and_port_compatible() -> None:
    import asyncio

    async def run() -> None:
        chat = FakeChatModel()
        embeddings = FakeEmbeddingModel()
        vectors = InMemoryVectorStore()
        answer = await chat.complete(ChatRequest("system", "user"))
        embedded = await embeddings.embed(["hello"], EmbeddingInputType.QUERY)
        await vectors.upsert([VectorRecord("job-1", embedded.vectors[0], {"job_id": "job-1"})])
        matches = await vectors.search(embedded.vectors[0], 1)
        assert json.loads(answer.text)["answer_blocks"][0]["kind"] == "ADVICE"
        assert embedded.dimensions == 4
        assert matches[0].point_id == "job-1"

    asyncio.run(run())


def test_qdrant_foundation_rejects_mismatched_model_space() -> None:
    store = QdrantVectorStore.__new__(QdrantVectorStore)
    store.collection_name = "jobs_bge_m3_1024_local_v1"
    store.alias_name = "jobs_current_local"
    store.dimensions = 1024
    store.embedding_model = "BAAI/bge-m3"
    store.auto_initialize = False
    store._client = SimpleNamespace(
        get_collections=lambda: None,
        collection_exists=lambda collection_name: True,
        get_collection=lambda collection_name: SimpleNamespace(
            config=SimpleNamespace(
                params=SimpleNamespace(vectors=SimpleNamespace(size=1024, distance="Cosine")),
                metadata={
                    "foundation_version": "phase1",
                    "embedding_dimensions": 1024,
                    "embedding_model": "another-model",
                },
            )
        ),
        get_aliases=lambda: SimpleNamespace(aliases=[]),
    )

    assert store._ensure_foundation_sync() is False


def test_qdrant_fresh_volume_initializes_collection_and_alias() -> None:
    from unittest.mock import patch

    created: dict[str, object] = {}
    aliases: list[object] = []

    def get_collection(collection_name: str) -> SimpleNamespace:
        return SimpleNamespace(
            config=SimpleNamespace(
                params=SimpleNamespace(vectors=SimpleNamespace(size=1024, distance="Cosine")),
                metadata={
                    "foundation_version": "phase1",
                    "embedding_dimensions": 1024,
                    "embedding_model": "BAAI/bge-m3",
                },
            )
        )

    client = SimpleNamespace(
        get_collections=lambda: None,
        collection_exists=lambda collection_name: collection_name in created,
        create_collection=lambda **kwargs: created.update({kwargs["collection_name"]: kwargs}),
        get_collection=get_collection,
        get_aliases=lambda: SimpleNamespace(aliases=aliases),
        update_collection_aliases=lambda operations: aliases.extend(
            operation.create_alias for operation in operations
        ),
    )
    store = QdrantVectorStore.__new__(QdrantVectorStore)
    store.collection_name = "jobs_bge_m3_1024_local_v1"
    store.alias_name = "jobs_current_local"
    store.dimensions = 1024
    store.embedding_model = "BAAI/bge-m3"
    store.auto_initialize = True
    store._client = client

    with patch("qdrant_client.models.VectorParams") as vector_params:
        assert store._ensure_foundation_sync() is True
        vector_params.assert_called_once_with(size=1024, distance="Cosine")
    assert created[store.collection_name]["metadata"] == {
        "embedding_model": "BAAI/bge-m3",
        "embedding_dimensions": 1024,
        "foundation_version": "phase1",
    }
    assert aliases[0].collection_name == store.collection_name
    assert aliases[0].alias_name == store.alias_name
