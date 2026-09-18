from __future__ import annotations

from types import SimpleNamespace

import pytest
from app.application.qdrant_admin import initialize_qdrant_demo
from app.application.retrieval import FILTERABLE_PAYLOAD_SCHEMA
from app.core.config import Settings
from app.infrastructure.qdrant_admin import QdrantAdminAdapter, QdrantAdminError
from qdrant_client.models import Distance


def _info(
    *,
    dimensions: int = 1024,
    distance: Distance = Distance.COSINE,
    schema: dict[str, str] | None = None,
) -> SimpleNamespace:
    payload_schema = {
        key: SimpleNamespace(data_type=value)
        for key, value in (schema if schema is not None else FILTERABLE_PAYLOAD_SCHEMA).items()
    }
    return SimpleNamespace(
        config=SimpleNamespace(
            params=SimpleNamespace(vectors=SimpleNamespace(size=dimensions, distance=distance))
        ),
        payload_schema=payload_schema,
    )


class FakeAdminClient:
    def __init__(
        self,
        *,
        collection_exists: bool = True,
        info: SimpleNamespace | None = None,
        aliases: list[tuple[str, str]] | None = None,
        marker_payload: dict[str, object] | None = None,
        points_count: int = 0,
    ) -> None:
        self.exists = collection_exists
        self.info = info or _info(schema={})
        self.aliases = list(aliases or [])
        self.created_collections: list[dict[str, object]] = []
        self.created_indexes: list[dict[str, object]] = []
        self.alias_updates: list[dict[str, object]] = []
        self.marker_payload = marker_payload
        self.marker_upserts: list[dict[str, object]] = []
        self.points_count = points_count
        self.count_calls: list[dict[str, object]] = []

    def collection_exists(self, collection_name: str) -> bool:
        del collection_name
        return self.exists

    def get_collection(self, collection_name: str) -> object:
        del collection_name
        return self.info

    def get_aliases(self) -> object:
        return SimpleNamespace(
            aliases=[
                SimpleNamespace(alias_name=name, collection_name=collection)
                for name, collection in self.aliases
            ]
        )

    def create_collection(self, **kwargs: object) -> object:
        self.created_collections.append(kwargs)
        self.exists = True
        vector = kwargs["vectors_config"]
        self.info = _info(
            dimensions=vector.size,
            distance=vector.distance,
            schema={key: value.data_type for key, value in self.info.payload_schema.items()},
        )
        return True

    def create_payload_index(self, **kwargs: object) -> object:
        self.created_indexes.append(kwargs)
        self.info.payload_schema[kwargs["field_name"]] = SimpleNamespace(
            data_type=kwargs["field_schema"].value
        )
        return True

    def retrieve(self, **kwargs: object) -> object:
        del kwargs
        if self.marker_payload is None:
            return []
        return [SimpleNamespace(payload=self.marker_payload)]

    def count(self, **kwargs: object) -> object:
        self.count_calls.append(kwargs)
        return SimpleNamespace(count=self.points_count)

    def upsert(self, **kwargs: object) -> object:
        self.marker_upserts.append(kwargs)
        point = kwargs["points"][0]
        self.marker_payload = dict(point.payload or {})
        return True

    def update_collection_aliases(self, **kwargs: object) -> object:
        self.alias_updates.append(kwargs)
        for operation in kwargs["change_aliases_operations"]:
            alias = operation.create_alias
            self.aliases.append((alias.alias_name, alias.collection_name))
        return True


def _settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "qdrant_collection": "jobs_demo",
        "qdrant_alias": "jobs_current_demo",
        "cohere_dimensions": 1024,
        "qdrant_index_version": "demo-v1",
        "qdrant_admin_enabled": True,
    }
    values.update(overrides)
    return Settings(**values)


def test_missing_collection_is_created_with_indexes_and_alias() -> None:
    client = FakeAdminClient(collection_exists=False, info=_info(schema={}))

    report = initialize_qdrant_demo(QdrantAdminAdapter(client, _settings()), _settings())

    assert report["status"] == "ready"
    assert report["created_collection"] is True
    assert report["created_alias"] is True
    assert len(client.created_collections) == 1
    assert {call["field_name"] for call in client.created_indexes} == set(FILTERABLE_PAYLOAD_SCHEMA)
    assert client.aliases == [("jobs_current_demo", "jobs_demo")]


def test_missing_marker_is_created_with_inactive_payload() -> None:
    client = FakeAdminClient(aliases=[("jobs_current_demo", "jobs_demo")])

    report = QdrantAdminAdapter(client, _settings()).initialize_and_verify()

    assert report["created_representation_marker"] is True
    assert len(client.marker_upserts) == 1
    payload = client.marker_payload
    assert payload is not None
    assert payload["representation_marker"] == "talentpulse-demo-representation-v1"
    assert payload["is_active"] is False
    assert payload["is_deleted"] is True


def test_ollama_marker_uses_local_embedding_metadata() -> None:
    settings = _settings(
        embedding_provider="ollama",
        ollama_embedding_model="embeddinggemma:300m",
        ollama_embedding_dimensions=768,
    )
    client = FakeAdminClient(
        collection_exists=False,
        info=_info(dimensions=768, schema={}),
    )

    QdrantAdminAdapter(client, settings).initialize_and_verify()

    assert client.marker_payload is not None
    assert client.marker_payload["embedding_provider"] == "ollama"
    assert client.marker_payload["embedding_model"] == "embeddinggemma:300m"
    assert client.marker_payload["embedding_dimensions"] == 768


def test_compatible_marker_is_idempotent() -> None:
    first = FakeAdminClient(aliases=[("jobs_current_demo", "jobs_demo")])
    QdrantAdminAdapter(first, _settings()).initialize_and_verify()

    second = FakeAdminClient(
        aliases=[("jobs_current_demo", "jobs_demo")], marker_payload=first.marker_payload
    )
    report = QdrantAdminAdapter(second, _settings()).initialize_and_verify()

    assert report["created_representation_marker"] is False
    assert second.marker_upserts == []


def test_marker_without_payload_is_refused_as_incompatible() -> None:
    class MissingPayloadClient(FakeAdminClient):
        def retrieve(self, **kwargs: object) -> object:
            del kwargs
            return [SimpleNamespace(payload=None)]

    client = MissingPayloadClient(aliases=[("jobs_current_demo", "jobs_demo")])

    with pytest.raises(QdrantAdminError, match="representation marker is incompatible"):
        QdrantAdminAdapter(client, _settings()).initialize_and_verify()

    assert client.marker_upserts == []


def test_incompatible_marker_fails_without_recreating_collection_or_alias() -> None:
    client = FakeAdminClient(
        aliases=[("jobs_current_demo", "jobs_demo")],
        marker_payload={"representation_marker": "wrong", "embedding_dimensions": 1024},
    )

    with pytest.raises(QdrantAdminError, match="representation marker is incompatible"):
        QdrantAdminAdapter(client, _settings()).initialize_and_verify()

    assert client.created_collections == []
    assert client.alias_updates == []
    assert client.marker_upserts == []


def test_incompatible_marker_fails_before_missing_indexes_or_alias_are_created() -> None:
    client = FakeAdminClient(
        aliases=[],
        info=_info(schema={}),
        marker_payload={"representation_marker": "wrong"},
    )

    with pytest.raises(QdrantAdminError, match="representation marker is incompatible"):
        QdrantAdminAdapter(client, _settings()).initialize_and_verify()

    assert client.created_indexes == []
    assert client.alias_updates == []
    assert client.marker_upserts == []


def test_non_empty_unmarked_collection_is_refused_before_mutation() -> None:
    client = FakeAdminClient(aliases=[], info=_info(schema={}), points_count=1)

    with pytest.raises(QdrantAdminError, match="non-empty collection has no representation marker"):
        QdrantAdminAdapter(client, _settings()).initialize_and_verify()

    assert client.count_calls == [{"collection_name": "jobs_demo", "exact": True}]
    assert client.created_indexes == []
    assert client.alias_updates == []
    assert client.marker_upserts == []


def test_compatible_collection_adds_only_missing_indexes_and_retains_alias() -> None:
    schema = {"location": "keyword", "salary": "float"}
    client = FakeAdminClient(
        aliases=[("jobs_current_demo", "jobs_demo")], info=_info(schema=schema)
    )

    report = initialize_qdrant_demo(QdrantAdminAdapter(client, _settings()), _settings())

    assert report["created_collection"] is False
    assert report["created_alias"] is False
    assert {call["field_name"] for call in client.created_indexes} == (
        set(FILTERABLE_PAYLOAD_SCHEMA) - set(schema)
    )
    assert client.alias_updates == []


@pytest.mark.parametrize(
    "info",
    [_info(dimensions=768), _info(distance=Distance.DOT)],
)
def test_incompatible_vector_configuration_fails_closed(info: SimpleNamespace) -> None:
    client = FakeAdminClient(info=info, aliases=[])

    with pytest.raises(QdrantAdminError, match="incompatible vector configuration"):
        QdrantAdminAdapter(client, _settings()).initialize_and_verify()

    assert client.created_indexes == []
    assert client.alias_updates == []


def test_wrong_alias_target_fails_without_repointing() -> None:
    client = FakeAdminClient(aliases=[("jobs_current_demo", "other_collection")])

    with pytest.raises(QdrantAdminError, match="another collection"):
        QdrantAdminAdapter(client, _settings()).initialize_and_verify()

    assert client.created_collections == []
    assert client.created_indexes == []
    assert client.alias_updates == []


def test_incompatible_payload_index_type_fails_closed() -> None:
    client = FakeAdminClient(info=_info(schema={"salary": "keyword"}))

    with pytest.raises(QdrantAdminError, match="incompatible type: salary"):
        QdrantAdminAdapter(client, _settings()).initialize_and_verify()

    assert client.created_indexes == []


def test_repeated_initialization_is_idempotent() -> None:
    client = FakeAdminClient(collection_exists=False, info=_info(schema={}), aliases=[])
    adapter = QdrantAdminAdapter(client, _settings())

    adapter.initialize_and_verify()
    adapter.initialize_and_verify()

    assert len(client.created_collections) == 1
    assert len(client.created_indexes) == len(FILTERABLE_PAYLOAD_SCHEMA)
    assert len(client.alias_updates) == 1


def test_disabled_setting_refuses_operator_operation() -> None:
    settings = _settings(qdrant_admin_enabled=False)

    with pytest.raises(QdrantAdminError, match="disabled"):
        initialize_qdrant_demo(QdrantAdminAdapter(FakeAdminClient(), settings), settings)


def test_provider_failure_is_sanitized() -> None:
    class BrokenClient(FakeAdminClient):
        def get_aliases(self) -> object:
            raise RuntimeError("api-key=private-qdrant-key provider payload")

    with pytest.raises(QdrantAdminError, match="administration operation failed") as failure:
        QdrantAdminAdapter(BrokenClient(), _settings()).initialize_and_verify()

    assert "private-qdrant-key" not in str(failure.value)


def test_marker_provider_failure_is_sanitized() -> None:
    class BrokenMarkerClient(FakeAdminClient):
        def retrieve(self, **kwargs: object) -> object:
            del kwargs
            raise RuntimeError("token=private-marker-token provider payload")

    with pytest.raises(QdrantAdminError, match="administration operation failed") as failure:
        QdrantAdminAdapter(
            BrokenMarkerClient(aliases=[("jobs_current_demo", "jobs_demo")]), _settings()
        ).initialize_and_verify()

    assert "private-marker-token" not in str(failure.value)


def test_date_epoch_payload_indexes_are_integer() -> None:
    assert FILTERABLE_PAYLOAD_SCHEMA["start_date_epoch_ms"] == "integer"
    assert FILTERABLE_PAYLOAD_SCHEMA["end_date_epoch_ms"] == "integer"
    client = FakeAdminClient(info=_info(schema={}), aliases=[("jobs_current_demo", "jobs_demo")])

    QdrantAdminAdapter(client, _settings()).initialize_and_verify()

    created = {call["field_name"]: call["field_schema"].value for call in client.created_indexes}
    assert created["start_date_epoch_ms"] == "integer"
    assert created["end_date_epoch_ms"] == "integer"
