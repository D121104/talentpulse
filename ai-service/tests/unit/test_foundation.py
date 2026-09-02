from __future__ import annotations

import json
import sys
from types import SimpleNamespace
from uuid import uuid4

import pytest
from app.adapters import build_chat_model, build_embedding_model, build_vector_store
from app.adapters.bedrock.cohere import BedrockCohereEmbeddingModel
from app.adapters.fakes import FakeChatModel, FakeEmbeddingModel, InMemoryVectorStore
from app.adapters.qdrant.store import QdrantVectorStore
from app.core.errors import ProviderError
from app.core.index_representation import (
    REPRESENTATION_METADATA_POINT_ID,
    RESERVED_POINT_PAYLOAD_KEY,
    RESERVED_POINT_PAYLOAD_VALUE,
)
from app.core.settings import ChatProvider, EmbeddingProvider, Settings, VectorStoreProvider
from app.main import create_app
from app.ports import (
    SCAN_METADATA_PAYLOAD_FIELDS,
    ChatRequest,
    EmbeddingInputType,
    VectorRecord,
)
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


def test_fake_factory_propagates_server_owned_representation() -> None:
    settings = Settings(
        chat_model_provider=ChatProvider.FAKE,
        embedding_provider=EmbeddingProvider.FAKE,
        vector_store_provider=VectorStoreProvider.FAKE,
        fake_embedding_dimensions=7,
        qdrant_collection_version="fake-v1",
    )

    store = build_vector_store(settings)

    assert isinstance(store, InMemoryVectorStore)
    assert store.collection_name == "fake-collection"
    assert store.embedding_provider == "fake"
    assert store.embedding_model == "fake-embedding"
    assert store.dimensions == 7
    assert store.collection_version == "fake-v1"


def test_qdrant_factory_propagates_provider_and_collection_version() -> None:
    from unittest.mock import patch

    settings = Settings(
        embedding_provider=EmbeddingProvider.FAKE,
        qdrant_collection="jobs_fake_v1",
        qdrant_alias="jobs_current_fake",
        qdrant_collection_version="fake-v1",
        qdrant_auto_initialize=False,
    )

    with patch("app.adapters.factory.QdrantVectorStore") as qdrant_store:
        result = build_vector_store(settings)

    assert result is qdrant_store.return_value
    qdrant_store.assert_called_once_with(
        url="http://127.0.0.1:6333",
        collection_name="jobs_fake_v1",
        alias_name="jobs_current_fake",
        api_key=None,
        timeout_seconds=3.0,
        dimensions=4,
        embedding_model="fake-embedding",
        embedding_provider="fake",
        auto_initialize=False,
        collection_version="fake-v1",
        allow_legacy_metadata=True,
    )


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


def _foundation_store(
    *,
    aliases_responses: list[object],
    auto_initialize: bool = False,
    alias_name: str = "jobs_current",
    collection_name: str = "jobs_v1",
    update_result: object = True,
) -> tuple[QdrantVectorStore, list[object]]:
    if not aliases_responses:
        raise ValueError("at least one alias response is required")

    store = QdrantVectorStore.__new__(QdrantVectorStore)
    store.collection_name = collection_name
    store.alias_name = alias_name
    store.dimensions = 4
    store.embedding_model = "fake-embedding"
    store.embedding_provider = "fake"
    store.collection_version = "collection-v1"
    store.allow_legacy_metadata = False
    store.auto_initialize = auto_initialize
    info = SimpleNamespace(
        config=SimpleNamespace(
            params=SimpleNamespace(vectors=SimpleNamespace(size=4, distance="Cosine")),
            metadata=store._expected_collection_metadata(),
        ),
        payload_schema={},
    )
    alias_updates: list[object] = []
    alias_reads = 0

    def get_aliases() -> object:
        nonlocal alias_reads
        response = aliases_responses[min(alias_reads, len(aliases_responses) - 1)]
        alias_reads += 1
        return response

    def update_collection_aliases(operations: object) -> object:
        alias_updates.append(operations)
        return update_result

    store._client = SimpleNamespace(
        get_collections=lambda: None,
        collection_exists=lambda collection_name: collection_name == store.collection_name,
        get_collection=lambda collection_name: info,
        get_aliases=get_aliases,
        update_collection_aliases=update_collection_aliases,
    )
    return store, alias_updates


def test_qdrant_foundation_accepts_alias_after_successful_readback() -> None:
    store, alias_updates = _foundation_store(
        aliases_responses=[
            {"result": {"aliases": []}},
            SimpleNamespace(
                aliases=[SimpleNamespace(alias_name="jobs_current", collection_name="jobs_v1")]
            ),
        ],
        auto_initialize=True,
    )

    assert store._ensure_foundation_sync() is True
    assert len(alias_updates) == 1


def test_qdrant_alias_acknowledgement_without_readback_is_not_ready() -> None:
    store, alias_updates = _foundation_store(
        aliases_responses=[SimpleNamespace(aliases=[]), {"aliases": []}],
        auto_initialize=True,
        update_result=True,
    )

    assert store._ensure_foundation_sync() is False
    assert len(alias_updates) == 1


@pytest.mark.parametrize(
    "aliases",
    [
        {"aliases": [{"alias_name": "jobs_current", "collection_name": "jobs_other"}]},
        SimpleNamespace(
            aliases=[
                SimpleNamespace(alias_name="jobs_current", collection_name="jobs_v1"),
                SimpleNamespace(alias_name="jobs_current", collection_name="jobs_v1"),
            ]
        ),
    ],
)
def test_qdrant_existing_alias_mismatch_or_duplicate_is_not_ready(aliases: object) -> None:
    store, alias_updates = _foundation_store(
        aliases_responses=[aliases],
        auto_initialize=True,
    )

    assert store._ensure_foundation_sync() is False
    assert alias_updates == []


def test_qdrant_physical_collection_does_not_require_an_alias() -> None:
    store, alias_updates = _foundation_store(
        aliases_responses=[SimpleNamespace(aliases=[])],
        alias_name="jobs_v1",
        collection_name="jobs_v1",
    )

    def unexpected_alias_read() -> object:
        raise AssertionError("physical collection mode must not read aliases")

    store._client.get_aliases = unexpected_alias_read

    assert store._ensure_foundation_sync() is True
    assert alias_updates == []


@pytest.mark.asyncio
async def test_qdrant_point_operations_always_use_configured_alias() -> None:
    calls: list[str] = []

    def query_points(**kwargs: object) -> SimpleNamespace:
        calls.append(str(kwargs["collection_name"]))
        return SimpleNamespace(points=[])

    def upsert(**kwargs: object) -> None:
        calls.append(str(kwargs["collection_name"]))

    def delete(**kwargs: object) -> None:
        calls.append(str(kwargs["collection_name"]))

    def scroll(**kwargs: object) -> tuple[list[object], None]:
        calls.append(str(kwargs["collection_name"]))
        return [], None

    store = QdrantVectorStore.__new__(QdrantVectorStore)
    store.collection_name = "jobs_v1"
    store.alias_name = "jobs_current"
    store.dimensions = 4
    store.embedding_model = "fake-embedding"
    store.embedding_provider = "fake"
    store.collection_version = "collection-v1"
    store._client = SimpleNamespace(
        query_points=query_points,
        upsert=upsert,
        delete=delete,
        scroll=scroll,
    )

    await store.search([1.0, 0.0, 0.0, 0.0], 1)
    await store.upsert([VectorRecord(str(uuid4()), [1.0, 0.0, 0.0, 0.0], {})])
    await store.delete([str(uuid4())])
    await store.get_by_job_id(str(uuid4()))
    await store.scan_metadata(None, 1)

    assert calls == [store.alias_name] * 5


def test_qdrant_foundation_rejects_mismatched_model_space() -> None:
    store = QdrantVectorStore.__new__(QdrantVectorStore)
    store.collection_name = "jobs_bge_m3_1024_local_v1"
    store.alias_name = "jobs_current_local"
    store.dimensions = 1024
    store.embedding_model = "BAAI/bge-m3"
    store.embedding_provider = "sentence_transformers"
    store.collection_version = None
    store.allow_legacy_metadata = True
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


def test_qdrant_phase1_metadata_is_compatible_legacy() -> None:
    store = QdrantVectorStore.__new__(QdrantVectorStore)
    store.collection_name = "jobs_bge_m3_1024_local_v1"
    store.alias_name = store.collection_name
    store.dimensions = 1024
    store.embedding_model = "BAAI/bge-m3"
    store.embedding_provider = "sentence_transformers"
    store.collection_version = None
    store.allow_legacy_metadata = True
    store.auto_initialize = False
    info = SimpleNamespace(
        config=SimpleNamespace(
            params=SimpleNamespace(vectors=SimpleNamespace(size=1024, distance="Cosine")),
            metadata={
                "foundation_version": "phase1",
                "embedding_dimensions": 1024,
                "embedding_model": "BAAI/bge-m3",
            },
        )
    )

    assert store._metadata_state(info) == "legacy"


def test_qdrant_phase2_markers_reject_provider_or_collection_version_mismatch() -> None:
    for field, value in (
        ("embedding_provider", "sentence_transformers"),
        ("collection_version", "other-v1"),
    ):
        store = QdrantVectorStore.__new__(QdrantVectorStore)
        store.collection_name = "jobs_cohere_v1"
        store.alias_name = store.collection_name
        store.dimensions = 1024
        store.embedding_model = "cohere.embed-multilingual-v3"
        store.embedding_provider = "bedrock_cohere"
        store.collection_version = "cohere-v1"
        store.allow_legacy_metadata = False
        metadata = store._expected_collection_metadata()
        assert metadata["embedding_provider"] == "bedrock_cohere"
        assert metadata["collection_version"] == "cohere-v1"
        metadata[field] = value

        assert store._metadata_state(metadata) == "mismatch"


def test_qdrant_phase2_markers_reject_a_different_model_space() -> None:
    store = QdrantVectorStore.__new__(QdrantVectorStore)
    store.collection_name = "jobs_bge_m3_1024_local_v1"
    store.alias_name = store.collection_name
    store.dimensions = 1024
    store.embedding_model = "BAAI/bge-m3"
    store.embedding_provider = "sentence_transformers"
    store.collection_version = None
    store.allow_legacy_metadata = True
    store.auto_initialize = False
    info = SimpleNamespace(
        config=SimpleNamespace(
            params=SimpleNamespace(vectors=SimpleNamespace(size=1024, distance="Cosine")),
            metadata={
                "foundation_version": "phase1",
                "embedding_model": "BAAI/bge-m3",
                "embedding_dimensions": 1024,
                "embedding_model_version": "another-model",
                "normalization_version": "nfkc-html-whitespace-v1",
                "chunking_version": "section-greedy-v1",
                "index_schema_version": "job-index-v1",
            },
        ),
        payload_schema={},
    )

    assert store._metadata_state(info) == "mismatch"


def test_qdrant_foundation_rejects_incompatible_vector_configuration() -> None:
    for info in (
        SimpleNamespace(
            config=SimpleNamespace(
                params=SimpleNamespace(vectors=SimpleNamespace(size=512, distance="Cosine")),
                metadata={
                    "foundation_version": "phase1",
                    "embedding_dimensions": 1024,
                    "embedding_model": "BAAI/bge-m3",
                },
            )
        ),
        SimpleNamespace(
            config=SimpleNamespace(
                params=SimpleNamespace(vectors=SimpleNamespace(size=1024, distance="Dot")),
                metadata={
                    "foundation_version": "phase1",
                    "embedding_dimensions": 1024,
                    "embedding_model": "BAAI/bge-m3",
                },
            )
        ),
    ):
        store = QdrantVectorStore.__new__(QdrantVectorStore)
        store.collection_name = "jobs_bge_m3_1024_local_v1"
        store.alias_name = "jobs_current_local"
        store.dimensions = 1024
        store.embedding_model = "BAAI/bge-m3"
        store.embedding_provider = "sentence_transformers"
        store.collection_version = None
        store.allow_legacy_metadata = True
        store.auto_initialize = False
        store._client = SimpleNamespace(
            get_collections=lambda: None,
            collection_exists=lambda collection_name: True,
            get_collection=lambda collection_name, info=info: info,
        )

        assert store._ensure_foundation_sync() is False


def test_qdrant_collection_vector_config_accepts_only_one_unnamed_vector() -> None:
    store = QdrantVectorStore.__new__(QdrantVectorStore)
    valid_config = {
        "size": 4,
        "distance": "Cosine",
        "on_disk": True,
    }
    valid_info = SimpleNamespace(
        config=SimpleNamespace(
            params=SimpleNamespace(vectors={"": valid_config}),
        )
    )

    assert store._collection_vector_config(valid_info) == valid_config
    assert store._collection_vector_size(valid_info) == 4
    assert store._collection_distance(valid_info) == "Cosine"

    for vectors in (
        {},
        {"named": valid_config},
        {"": valid_config, "named": valid_config},
        {"": {"size": 4}},
        {"": None},
        {"": []},
        {"size": 4, "distance": "Cosine"},
    ):
        info = SimpleNamespace(
            config=SimpleNamespace(
                params=SimpleNamespace(vectors=vectors),
            )
        )
        assert store._collection_vector_config(info) is None


def test_in_memory_store_hides_reserved_marker_from_search_and_scan() -> None:
    import asyncio

    async def run() -> None:
        store = InMemoryVectorStore(dimensions=4)
        store.records[str(REPRESENTATION_METADATA_POINT_ID)] = VectorRecord(
            str(REPRESENTATION_METADATA_POINT_ID),
            [1.0, 0.0, 0.0, 0.0],
            {
                RESERVED_POINT_PAYLOAD_KEY: RESERVED_POINT_PAYLOAD_VALUE,
                "_talentpulse_metadata_schema_version": 1,
            },
        )

        assert await store.search([1.0, 0.0, 0.0, 0.0], 10) == []
        assert (await store.scan_metadata(None, 10)).points == []

    asyncio.run(run())


def test_qdrant_fresh_volume_initializes_collection_marker_and_alias() -> None:
    from unittest.mock import patch

    created: dict[str, object] = {}
    aliases: list[object] = []
    marker_points: dict[str, SimpleNamespace] = {}
    marker_upserts = 0

    def get_collection(collection_name: str) -> SimpleNamespace:
        del collection_name
        return SimpleNamespace(
            config=SimpleNamespace(
                params=SimpleNamespace(vectors=SimpleNamespace(size=1024, distance="Cosine")),
                # Qdrant 1.13 does not expose collection metadata after a write.
                metadata=None,
            ),
            points_count=0,
            payload_schema={},
        )

    def retrieve(
        *, collection_name: str, ids: list[str], with_payload: bool, with_vectors: bool
    ) -> list[SimpleNamespace]:
        assert collection_name == store.collection_name
        assert with_payload is True
        assert with_vectors is False
        return [marker_points[point_id] for point_id in ids if point_id in marker_points]

    def upsert(*, collection_name: str, points: list[object], wait: bool) -> None:
        nonlocal marker_upserts
        assert collection_name == store.collection_name
        assert wait is True
        marker_upserts += 1
        point = points[0]
        marker_points[str(point.id)] = SimpleNamespace(id=point.id, payload=point.payload)

    def update_collection_aliases(operations: list[object]) -> bool:
        aliases.extend(operation.create_alias for operation in operations)
        return True

    client = SimpleNamespace(
        get_collections=lambda: None,
        collection_exists=lambda collection_name: collection_name in created,
        create_collection=lambda **kwargs: created.update({kwargs["collection_name"]: kwargs}),
        get_collection=get_collection,
        get_aliases=lambda: SimpleNamespace(aliases=aliases),
        retrieve=retrieve,
        upsert=upsert,
        update_collection=lambda **_: (_ for _ in ()).throw(
            AssertionError("collection metadata update is not supported by this server")
        ),
        update_collection_aliases=update_collection_aliases,
    )
    store = QdrantVectorStore.__new__(QdrantVectorStore)
    store.collection_name = "jobs_bge_m3_1024_local_v1"
    store.alias_name = "jobs_current_local"
    store.dimensions = 1024
    store.embedding_model = "BAAI/bge-m3"
    store.embedding_provider = "fake"
    store.collection_version = "collection-v1"
    store.auto_initialize = True
    store._client = client

    with patch("qdrant_client.models.VectorParams") as vector_params:
        assert store._ensure_foundation_sync() is True
        assert store._ensure_foundation_sync() is True
        vector_params.assert_called_once_with(size=1024, distance="Cosine")

    assert created[store.collection_name]["metadata"] == {
        "embedding_model": "BAAI/bge-m3",
        "embedding_dimensions": 1024,
        "foundation_version": "phase1",
    }
    assert marker_upserts == 1
    marker = marker_points[str(REPRESENTATION_METADATA_POINT_ID)]
    assert marker.payload[RESERVED_POINT_PAYLOAD_KEY] == RESERVED_POINT_PAYLOAD_VALUE
    assert marker.payload == store._expected_marker_payload()
    assert aliases[0].collection_name == store.collection_name
    assert aliases[0].alias_name == store.alias_name


def test_qdrant_older_create_client_shape_does_not_receive_metadata_kwarg() -> None:
    created: dict[str, object] = {}
    marker_points: dict[str, SimpleNamespace] = {}

    def create_collection(collection_name: str, vectors_config: object) -> None:
        created["collection_name"] = collection_name
        created["vectors_config"] = vectors_config

    def get_collection(collection_name: str) -> SimpleNamespace:
        del collection_name
        return SimpleNamespace(
            config=SimpleNamespace(
                params=SimpleNamespace(vectors=SimpleNamespace(size=4, distance="Cosine")),
                metadata=None,
            ),
            points_count=0,
            payload_schema={},
        )

    def retrieve(**kwargs: object) -> list[SimpleNamespace]:
        return [marker_points[kwargs["ids"][0]]] if kwargs["ids"][0] in marker_points else []

    def upsert(*, points: list[object], **kwargs: object) -> None:
        point = points[0]
        marker_points[str(point.id)] = SimpleNamespace(id=point.id, payload=point.payload)

    client = SimpleNamespace(
        get_collections=lambda: None,
        collection_exists=lambda collection_name: False,
        create_collection=create_collection,
        get_collection=get_collection,
        get_aliases=lambda: SimpleNamespace(aliases=[]),
        retrieve=retrieve,
        upsert=upsert,
    )
    store = QdrantVectorStore.__new__(QdrantVectorStore)
    store.collection_name = "jobs_fake_v1"
    store.alias_name = store.collection_name
    store.dimensions = 4
    store.embedding_model = "fake-embedding"
    store.embedding_provider = "fake"
    store.collection_version = "collection-v1"
    store.allow_legacy_metadata = False
    store.auto_initialize = True
    store._client = client

    assert store._ensure_foundation_sync() is True
    assert "metadata" not in created


def test_qdrant_marker_write_must_be_read_back_before_ready() -> None:
    marker_upserts = 0

    info = SimpleNamespace(
        config=SimpleNamespace(
            params=SimpleNamespace(vectors=SimpleNamespace(size=4, distance="Cosine")),
            metadata=None,
        ),
        points_count=0,
        payload_schema={},
    )

    def upsert(*, collection_name: str, points: list[object], wait: bool) -> None:
        nonlocal marker_upserts
        del collection_name, points
        assert wait is True
        marker_upserts += 1

    store = QdrantVectorStore.__new__(QdrantVectorStore)
    store.collection_name = "jobs_fake_v1"
    store.alias_name = store.collection_name
    store.dimensions = 4
    store.embedding_model = "fake-embedding"
    store.embedding_provider = "fake"
    store.collection_version = "collection-v1"
    store.allow_legacy_metadata = False
    store.auto_initialize = True
    store._client = SimpleNamespace(
        get_collections=lambda: None,
        collection_exists=lambda collection_name: True,
        get_collection=lambda collection_name: info,
        get_aliases=lambda: SimpleNamespace(aliases=[]),
        retrieve=lambda **kwargs: [],
        upsert=upsert,
    )

    assert store._ensure_foundation_sync() is False
    assert marker_upserts == 1


def test_qdrant_missing_marker_on_nonempty_unverified_collection_is_not_ready() -> None:
    info = SimpleNamespace(
        config=SimpleNamespace(
            params=SimpleNamespace(vectors=SimpleNamespace(size=4, distance="Cosine")),
            metadata=None,
        ),
        points_count=1,
        payload_schema={},
    )
    store = QdrantVectorStore.__new__(QdrantVectorStore)
    store.collection_name = "jobs_fake_v1"
    store.alias_name = store.collection_name
    store.dimensions = 4
    store.embedding_model = "fake-embedding"
    store.embedding_provider = "fake"
    store.collection_version = "collection-v1"
    store.allow_legacy_metadata = False
    store.auto_initialize = True
    store._client = SimpleNamespace(
        get_collections=lambda: None,
        collection_exists=lambda collection_name: True,
        get_collection=lambda collection_name: info,
        get_aliases=lambda: SimpleNamespace(aliases=[]),
        retrieve=lambda **kwargs: [],
        upsert=lambda **kwargs: (_ for _ in ()).throw(
            AssertionError("must not write a marker into an unverified collection")
        ),
    )

    assert store._ensure_foundation_sync() is False


def test_qdrant_marker_with_incompatible_representation_is_not_ready() -> None:
    store = QdrantVectorStore.__new__(QdrantVectorStore)
    store.collection_name = "jobs_fake_v1"
    store.alias_name = store.collection_name
    store.dimensions = 4
    store.embedding_model = "fake-embedding"
    store.embedding_provider = "fake"
    store.collection_version = "collection-v1"
    store.allow_legacy_metadata = False
    store.auto_initialize = False
    marker_payload = {**store._expected_collection_metadata()}
    marker_payload["embedding_model_version"] = "another-model"
    info = SimpleNamespace(
        config=SimpleNamespace(
            params=SimpleNamespace(vectors=SimpleNamespace(size=4, distance="Cosine")),
            metadata=None,
        ),
        points_count=1,
        payload_schema={},
    )
    marker_point = SimpleNamespace(
        id=str(REPRESENTATION_METADATA_POINT_ID),
        payload={
            RESERVED_POINT_PAYLOAD_KEY: RESERVED_POINT_PAYLOAD_VALUE,
            "_talentpulse_metadata_schema_version": 1,
            **marker_payload,
        },
    )
    store._client = SimpleNamespace(
        get_collections=lambda: None,
        collection_exists=lambda collection_name: True,
        get_collection=lambda collection_name: info,
        get_aliases=lambda: SimpleNamespace(aliases=[]),
        retrieve=lambda **kwargs: [marker_point],
    )

    assert store._ensure_foundation_sync() is False


def test_qdrant_legacy_phase1_collection_is_ready() -> None:
    store = QdrantVectorStore.__new__(QdrantVectorStore)
    store.collection_name = "jobs_bge_m3_1024_local_v1"
    store.alias_name = "jobs_current_local"
    store.dimensions = 1024
    store.embedding_model = "BAAI/bge-m3"
    store.embedding_provider = "sentence_transformers"
    store.collection_version = None
    store.allow_legacy_metadata = True
    store.auto_initialize = False
    info = SimpleNamespace(
        config=SimpleNamespace(
            params=SimpleNamespace(vectors=SimpleNamespace(size=1024, distance="Cosine")),
            metadata={
                "foundation_version": "phase1",
                "embedding_model": "BAAI/bge-m3",
                "embedding_dimensions": 1024,
            },
        ),
        payload_schema={},
    )
    store._client = SimpleNamespace(
        get_collections=lambda: None,
        collection_exists=lambda collection_name: True,
        get_collection=lambda collection_name: info,
        get_aliases=lambda: SimpleNamespace(
            aliases=[
                SimpleNamespace(alias_name=store.alias_name, collection_name=store.collection_name)
            ]
        ),
    )

    assert store._ensure_foundation_sync() is True


def test_qdrant_rejects_boolean_phase1_dimension_metadata() -> None:
    store = QdrantVectorStore.__new__(QdrantVectorStore)
    store.collection_name = "jobs_one_dimensional_v1"
    store.alias_name = store.collection_name
    store.dimensions = 1
    store.embedding_model = "one-dimensional-model"
    store.embedding_provider = "fake"
    store.collection_version = None
    store.allow_legacy_metadata = True
    store.auto_initialize = False
    info = SimpleNamespace(
        config=SimpleNamespace(
            params=SimpleNamespace(vectors=SimpleNamespace(size=1, distance="Cosine")),
            metadata={
                "foundation_version": "phase1",
                "embedding_model": "one-dimensional-model",
                "embedding_dimensions": True,
            },
        ),
        payload_schema={},
    )
    store._client = SimpleNamespace(
        get_collections=lambda: None,
        collection_exists=lambda collection_name: True,
        get_collection=lambda collection_name: info,
        get_aliases=lambda: SimpleNamespace(aliases=[]),
    )

    assert store._ensure_foundation_sync() is False


@pytest.mark.asyncio
async def test_qdrant_search_excludes_reserved_marker_and_requests_safe_payload() -> None:
    calls: dict[str, object] = {}
    job_point_id = uuid4()

    def query_points(**kwargs: object) -> SimpleNamespace:
        calls.update(kwargs)
        return SimpleNamespace(
            points=[
                SimpleNamespace(
                    id=REPRESENTATION_METADATA_POINT_ID,
                    score=1.0,
                    payload={RESERVED_POINT_PAYLOAD_KEY: RESERVED_POINT_PAYLOAD_VALUE},
                ),
                SimpleNamespace(id=job_point_id, score=0.9, payload={"job_id": str(uuid4())}),
            ]
        )

    store = QdrantVectorStore.__new__(QdrantVectorStore)
    store.collection_name = "jobs_fake_v1"
    store.alias_name = store.collection_name
    store.dimensions = 4
    store.embedding_model = "fake-embedding"
    store.embedding_provider = "fake"
    store.collection_version = "collection-v1"
    store._client = SimpleNamespace(query_points=query_points)

    matches = await store.search([1.0, 0.0, 0.0, 0.0], 10)

    assert [match.point_id for match in matches] == [str(job_point_id)]
    assert calls["with_payload"] == [
        "job_id",
        "company_id",
        "title",
        "company_name",
        "skills",
        "location",
        "level",
        "work_mode",
        "employment_type",
        "salary",
        "salary_currency",
        "start_date",
        "end_date",
        "updated_at",
        "is_active",
        "is_deleted",
        "deleted_at",
        "company_is_active",
        "company_is_deleted",
        "company_deleted_at",
        "chunk_index",
        "chunk_count",
        "is_chunked",
        "content_hash",
        "metadata_hash",
        "source_version",
        "embedding_provider",
        "collection_name",
        "collection_version",
        "embedding_model_version",
        "embedding_dimensions",
        "normalization_version",
        "chunking_version",
        "index_schema_version",
    ]
    assert calls["query_filter"].must_not[0].has_id == [str(REPRESENTATION_METADATA_POINT_ID)]


@pytest.mark.asyncio
async def test_qdrant_get_by_job_id_excludes_reserved_marker_and_requests_vectors() -> None:
    calls: dict[str, object] = {}
    job_point_id = uuid4()
    job_id = uuid4()

    def scroll(**kwargs: object) -> tuple[list[SimpleNamespace], None]:
        calls.update(kwargs)
        return [
            SimpleNamespace(
                id=REPRESENTATION_METADATA_POINT_ID,
                vector=[1.0, 0.0, 0.0, 0.0],
                payload={RESERVED_POINT_PAYLOAD_KEY: RESERVED_POINT_PAYLOAD_VALUE},
            ),
            SimpleNamespace(
                id=job_point_id,
                vector=[0.0, 1.0, 0.0, 0.0],
                payload={"job_id": str(job_id)},
            ),
        ], None

    store = QdrantVectorStore.__new__(QdrantVectorStore)
    store.collection_name = "jobs_fake_v1"
    store.alias_name = store.collection_name
    store.dimensions = 4
    store.embedding_model = "fake-embedding"
    store.embedding_provider = "fake"
    store.collection_version = "collection-v1"
    store._client = SimpleNamespace(scroll=scroll)

    records = await store.get_by_job_id(str(job_id))

    assert [record.point_id for record in records] == [str(job_point_id)]
    assert calls["with_vectors"] is True


@pytest.mark.asyncio
async def test_qdrant_scan_maps_safe_metadata_and_cursor() -> None:
    point_id = uuid4()
    next_point_id = uuid4()
    payload = {
        "job_id": str(uuid4()),
        "company_id": str(uuid4()),
        "source_version": 7,
        "content_hash": "a" * 64,
        "metadata_hash": "b" * 64,
        "embedding_provider": "fake",
        "embedding_model_version": "fake-embedding",
        "embedding_dimensions": 4,
        "normalization_version": "normalization-v1",
        "chunking_version": "chunking-v1",
        "index_schema_version": "schema-v1",
        "collection_name": "jobs_fake_v1",
        "collection_version": "collection-v1",
        "description": "must not cross the metadata boundary",
    }
    calls: dict[str, object] = {}

    def scroll(**kwargs: object) -> tuple[list[SimpleNamespace], dict[str, str]]:
        calls.update(kwargs)
        return [
            SimpleNamespace(
                id=str(REPRESENTATION_METADATA_POINT_ID),
                payload={
                    RESERVED_POINT_PAYLOAD_KEY: RESERVED_POINT_PAYLOAD_VALUE,
                    "_talentpulse_metadata_schema_version": 1,
                },
            ),
            SimpleNamespace(id=point_id, payload=payload),
        ], {"uuid": str(next_point_id)}

    store = QdrantVectorStore.__new__(QdrantVectorStore)
    store.collection_name = "jobs_fake_v1"
    store.alias_name = "jobs_current"
    store.dimensions = 4
    store.embedding_model = "fake-embedding"
    store.embedding_provider = "fake"
    store.collection_version = "collection-v1"
    store.allow_legacy_metadata = False
    store.auto_initialize = False
    store._client = SimpleNamespace(scroll=scroll)

    page = await store.scan_metadata("7", 999)

    assert calls["collection_name"] == "jobs_current"
    assert calls["offset"] == 7
    assert calls["limit"] == 256
    assert calls["with_payload"] == list(SCAN_METADATA_PAYLOAD_FIELDS)
    assert calls["with_vectors"] is False
    assert calls["scroll_filter"].must_not[0].has_id == [str(REPRESENTATION_METADATA_POINT_ID)]
    assert page.next_cursor == str(next_point_id)
    assert [point.point_id for point in page.points] == [point_id]
    assert page.points[0].collection_name == "jobs_fake_v1"
    assert page.points[0].collection_version == "collection-v1"
    assert "description" not in SCAN_METADATA_PAYLOAD_FIELDS
    assert not hasattr(page.points[0], "description")


@pytest.mark.asyncio
async def test_qdrant_scan_filters_by_job_id_and_keeps_safe_read_options() -> None:
    point_id = uuid4()
    target_job_id = uuid4()
    payload = {
        "job_id": str(target_job_id),
        "company_id": str(uuid4()),
        "source_version": 7,
        "content_hash": "a" * 64,
        "metadata_hash": "b" * 64,
        "embedding_provider": "fake",
        "embedding_model_version": "fake-embedding",
        "embedding_dimensions": 4,
        "normalization_version": "normalization-v1",
        "chunking_version": "chunking-v1",
        "index_schema_version": "schema-v1",
        "title": "must not cross the metadata boundary",
        "description": "must not cross the metadata boundary",
        "skills": ["must not cross the metadata boundary"],
    }
    calls: dict[str, object] = {}

    def scroll(**kwargs: object) -> tuple[list[SimpleNamespace], None]:
        calls.update(kwargs)
        return [SimpleNamespace(id=point_id, payload=payload)], None

    store = QdrantVectorStore.__new__(QdrantVectorStore)
    store.collection_name = "jobs_fake_v1"
    store.alias_name = "jobs_current"
    store.dimensions = 4
    store.embedding_model = "fake-embedding"
    store.embedding_provider = "fake"
    store.collection_version = "collection-v1"
    store.allow_legacy_metadata = False
    store.auto_initialize = False
    store._client = SimpleNamespace(scroll=scroll)

    page = await store.scan_metadata(None, 1, str(target_job_id))

    query_filter = calls["scroll_filter"]
    assert query_filter.must is not None
    assert query_filter.must[0].key == "job_id"
    assert query_filter.must[0].match.value == str(target_job_id)
    assert query_filter.must_not[0].has_id == [str(REPRESENTATION_METADATA_POINT_ID)]
    assert calls["with_vectors"] is False
    assert calls["with_payload"] == list(SCAN_METADATA_PAYLOAD_FIELDS)
    assert page.points[0].job_id == target_job_id
    assert not hasattr(page.points[0], "title")


@pytest.mark.asyncio
async def test_qdrant_scan_accepts_a_terminal_page_with_no_cursor() -> None:
    point_id = uuid4()
    payload = {
        "job_id": str(uuid4()),
        "company_id": str(uuid4()),
        "source_version": 1,
        "content_hash": "a" * 64,
        "embedding_model_version": "fake-embedding",
        "embedding_dimensions": 4,
        "normalization_version": "normalization-v1",
        "chunking_version": "chunking-v1",
        "index_schema_version": "schema-v1",
    }

    store = QdrantVectorStore.__new__(QdrantVectorStore)
    store.collection_name = "jobs_fake_v1"
    store.alias_name = store.collection_name
    store.dimensions = 4
    store.embedding_model = "fake-embedding"
    store.embedding_provider = "fake"
    store.collection_version = "collection-v1"
    store.allow_legacy_metadata = False
    store.auto_initialize = False
    store._client = SimpleNamespace(
        scroll=lambda **kwargs: ([SimpleNamespace(id=point_id, payload=payload)], None)
    )

    page = await store.scan_metadata(None, 1)

    assert page.next_cursor is None
    assert [point.point_id for point in page.points] == [point_id]


@pytest.mark.asyncio
async def test_cohere_health_is_unverified_without_explicit_probe() -> None:
    model = BedrockCohereEmbeddingModel("us-east-1", "cohere.embed-multilingual-v3")

    assert await model.health() is False


@pytest.mark.asyncio
async def test_cohere_check_access_uses_injected_probe_without_aws_call() -> None:
    calls = 0

    def probe() -> bool:
        nonlocal calls
        calls += 1
        return True

    model = BedrockCohereEmbeddingModel(
        "us-east-1", "cohere.embed-multilingual-v3", access_probe=probe
    )

    assert await model.check_access() is True
    assert await model.health() is True
    assert calls == 1


def test_ready_reports_cohere_access_as_unverified_without_probe() -> None:
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
        embedding_provider=EmbeddingProvider.BEDROCK_COHERE,
        vector_store_provider=VectorStoreProvider.FAKE,
        ai_service_auth_public_key=public,
    )
    app = create_app(settings)
    response = TestClient(app).get("/health/ready")

    assert response.status_code == 200
    assert response.json()["checks"]["providerAccess"] == "unverified"


@pytest.mark.asyncio
async def test_cohere_request_uses_input_type_and_no_truncation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: dict[str, object] = {}

    class Body:
        def read(self) -> bytes:
            return json.dumps({"embeddings": [[0.0] * 4]}).encode()

    class Client:
        def invoke_model(self, **kwargs: object) -> dict[str, Body]:
            calls.update(kwargs)
            return {"body": Body()}

    monkeypatch.setitem(
        sys.modules,
        "boto3",
        SimpleNamespace(client=lambda *_args, **_kwargs: Client()),
    )
    model = BedrockCohereEmbeddingModel("us-east-1", "cohere.embed-multilingual-v3", 4)

    vectors = model._embed_sync(["query text"], EmbeddingInputType.QUERY)
    request_body = json.loads(str(calls["body"]))

    assert vectors == [[0.0] * 4]
    assert calls["modelId"] == "cohere.embed-multilingual-v3"
    assert request_body == {
        "texts": ["query text"],
        "input_type": "search_query",
        "truncate": "NONE",
    }


def test_cohere_rejects_batch_and_text_limits_before_provider_call() -> None:
    model = BedrockCohereEmbeddingModel("us-east-1", "cohere.embed-multilingual-v3")

    with pytest.raises(ProviderError, match="safety limit"):
        model._embed_sync(["x"] * (model.MAX_BATCH_SIZE + 1), EmbeddingInputType.DOCUMENT)
    with pytest.raises(ProviderError, match="safety limit"):
        model._embed_sync(["x" * (model.MAX_TEXT_CHARS + 1)], EmbeddingInputType.DOCUMENT)


def test_qdrant_non_local_legacy_metadata_is_not_ready() -> None:
    store = QdrantVectorStore.__new__(QdrantVectorStore)
    store.collection_name = "jobs_cohere_v1"
    store.alias_name = store.collection_name
    store.dimensions = 1024
    store.embedding_model = "cohere.embed-multilingual-v3"
    store.embedding_provider = "bedrock_cohere"
    store.collection_version = "cohere-v1"
    store.allow_legacy_metadata = False
    store.auto_initialize = False
    info = SimpleNamespace(
        config=SimpleNamespace(
            params=SimpleNamespace(vectors=SimpleNamespace(size=1024, distance="Cosine")),
            metadata={
                "foundation_version": "phase1",
                "embedding_model": "cohere.embed-multilingual-v3",
                "embedding_dimensions": 1024,
            },
        ),
        points_count=1,
        payload_schema={},
    )
    store._client = SimpleNamespace(
        get_collections=lambda: None,
        collection_exists=lambda collection_name: True,
        get_collection=lambda collection_name: info,
        get_aliases=lambda: SimpleNamespace(aliases=[]),
        retrieve=lambda **kwargs: [],
    )

    assert store._ensure_foundation_sync() is False


def test_qdrant_phase1_metadata_stays_compatible_without_phase2_marker_api() -> None:
    store = QdrantVectorStore.__new__(QdrantVectorStore)
    store.collection_name = "jobs_bge_m3_1024_local_v1"
    store.alias_name = "jobs_current_local"
    store.dimensions = 1024
    store.embedding_model = "BAAI/bge-m3"
    store.embedding_provider = "sentence_transformers"
    store.collection_version = None
    store.allow_legacy_metadata = True
    store.auto_initialize = True
    info = SimpleNamespace(
        config=SimpleNamespace(
            params=SimpleNamespace(vectors=SimpleNamespace(size=1024, distance="Cosine")),
            metadata={
                "foundation_version": "phase1",
                "embedding_model": "BAAI/bge-m3",
                "embedding_dimensions": 1024,
            },
        ),
        payload_schema={},
    )
    store._client = SimpleNamespace(
        get_collections=lambda: None,
        collection_exists=lambda collection_name: True,
        get_collection=lambda collection_name: info,
        get_aliases=lambda: SimpleNamespace(
            aliases=[
                SimpleNamespace(alias_name=store.alias_name, collection_name=store.collection_name)
            ]
        ),
    )

    assert store._ensure_foundation_sync() is True


def test_qdrant_non_local_legacy_metadata_is_not_auto_initialized() -> None:
    store = QdrantVectorStore.__new__(QdrantVectorStore)
    store.collection_name = "jobs_cohere_v1"
    store.alias_name = store.collection_name
    store.dimensions = 1024
    store.embedding_model = "cohere.embed-multilingual-v3"
    store.embedding_provider = "bedrock_cohere"
    store.collection_version = "cohere-v1"
    store.allow_legacy_metadata = False
    store.auto_initialize = True
    info = SimpleNamespace(
        config=SimpleNamespace(
            params=SimpleNamespace(vectors=SimpleNamespace(size=1024, distance="Cosine")),
            metadata={
                "foundation_version": "phase1",
                "embedding_model": "cohere.embed-multilingual-v3",
                "embedding_dimensions": 1024,
            },
        ),
        points_count=0,
        payload_schema={},
    )
    marker_upserts = 0

    def unexpected_marker_write(**kwargs: object) -> None:
        nonlocal marker_upserts
        del kwargs
        marker_upserts += 1

    store._client = SimpleNamespace(
        get_collections=lambda: None,
        collection_exists=lambda collection_name: True,
        get_collection=lambda collection_name: info,
        get_aliases=lambda: SimpleNamespace(aliases=[]),
        retrieve=lambda **kwargs: [],
        upsert=unexpected_marker_write,
    )

    assert store._ensure_foundation_sync() is False
    assert marker_upserts == 0
