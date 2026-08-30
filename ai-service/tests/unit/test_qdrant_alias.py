from __future__ import annotations

from types import SimpleNamespace

import pytest
from app.adapters.qdrant import (
    AliasCutoverResult,
    QdrantAliasManager,
    QdrantAliasOperationError,
    representation_manifest_digest,
)
from app.adapters.qdrant.store import PAYLOAD_INDEX_SCHEMAS
from app.core.index_representation import (
    CHUNKING_VERSION,
    INDEX_SCHEMA_VERSION,
    NORMALIZATION_VERSION,
    REPRESENTATION_METADATA_POINT_ID,
    RepresentationManifest,
)

ALIAS = "jobs_current"
OLD_COLLECTION = "jobs_old_v1"
NEW_COLLECTION = "jobs_new_v2"
OTHER_COLLECTION = "jobs_other_v1"


def manifest(collection: str, version: str) -> RepresentationManifest:
    return RepresentationManifest(
        provider="fake",
        model="fake-embedding",
        dimensions=4,
        normalization_version=NORMALIZATION_VERSION,
        chunking_version=CHUNKING_VERSION,
        index_schema_version=INDEX_SCHEMA_VERSION,
        physical_collection=collection,
        alias=ALIAS,
        collection_version=version,
    )


def collection_info(target: RepresentationManifest, *, marker: object | None = None) -> object:
    payload_schema = {
        field: SimpleNamespace(data_type=field_type)
        for field, field_type in PAYLOAD_INDEX_SCHEMAS.items()
    }
    return SimpleNamespace(
        config=SimpleNamespace(
            params=SimpleNamespace(
                vectors=SimpleNamespace(size=target.dimensions, distance="Cosine")
            ),
        ),
        payload_schema=payload_schema,
        marker=marker
        if marker is not None
        else SimpleNamespace(
            id=str(REPRESENTATION_METADATA_POINT_ID),
            payload=target.to_marker_payload(),
        ),
    )


class AliasClientDouble:
    def __init__(
        self,
        infos: dict[str, object],
        *,
        aliases: list[object],
        apply_update: bool = True,
        update_result: object = True,
        readback_aliases: list[object] | None = None,
    ) -> None:
        self.infos = infos
        self.aliases = aliases
        self.apply_update = apply_update
        self.update_result = update_result
        self.readback_aliases = readback_aliases
        self.update_calls: list[list[object]] = []
        self.alias_reads = 0
        self.retrieve_collections: list[str] = []

    def get_collections(self) -> object:
        return SimpleNamespace(
            collections=[SimpleNamespace(name=name) for name in sorted(self.infos)]
        )

    def get_collection(self, collection_name: str) -> object:
        return self.infos[collection_name]

    def retrieve(
        self,
        *,
        collection_name: str,
        ids: list[str],
        with_payload: bool,
        with_vectors: bool,
    ) -> list[object]:
        assert with_payload is True
        assert with_vectors is False
        self.retrieve_collections.append(collection_name)
        marker = getattr(self.infos[collection_name], "marker", None)
        return [marker] if marker is not None and str(marker.id) in ids else []

    def get_aliases(self) -> object:
        if self.readback_aliases is not None and self.alias_reads > 0:
            aliases = self.readback_aliases
        else:
            aliases = self.aliases
        self.alias_reads += 1
        return SimpleNamespace(aliases=aliases)

    def update_collection_aliases(self, *, change_aliases_operations: list[object]) -> object:
        self.update_calls.append(change_aliases_operations)
        if self.apply_update and self.update_result is True:
            for operation in change_aliases_operations:
                delete_alias = getattr(operation, "delete_alias", None)
                create_alias = getattr(operation, "create_alias", None)
                if delete_alias is not None:
                    self.aliases = [
                        alias
                        for alias in self.aliases
                        if getattr(alias, "alias_name", None) != delete_alias.alias_name
                    ]
                if create_alias is not None:
                    self.aliases.append(
                        SimpleNamespace(
                            alias_name=create_alias.alias_name,
                            collection_name=create_alias.collection_name,
                        )
                    )
        return self.update_result


def manager_for(
    target: RepresentationManifest,
    *,
    current: str | None = OLD_COLLECTION,
    **client_options: object,
) -> tuple[QdrantAliasManager, AliasClientDouble]:
    old = manifest(OLD_COLLECTION, "old-v1")
    infos = {
        OLD_COLLECTION: collection_info(old),
        target.physical_collection: collection_info(target),
    }
    aliases = (
        [] if current is None else [SimpleNamespace(alias_name=ALIAS, collection_name=current)]
    )
    client = AliasClientDouble(infos, aliases=aliases, **client_options)
    return QdrantAliasManager(client), client


def test_switch_rejects_missing_expected_current_alias_without_mutating() -> None:
    manager, client = manager_for(manifest(NEW_COLLECTION, "new-v2"), current=None)

    with pytest.raises(QdrantAliasOperationError) as error:
        manager.switch_alias(
            alias_name=ALIAS,
            target_collection=NEW_COLLECTION,
            expected_current_collection=OLD_COLLECTION,
            expected_manifest=manifest(NEW_COLLECTION, "new-v2"),
        )

    assert error.value.code == "QDRANT_ALIAS_CURRENT_MAPPING_MISMATCH"
    assert client.update_calls == []


def test_switch_rejects_wrong_current_alias_target_without_guessing() -> None:
    manager, client = manager_for(
        manifest(NEW_COLLECTION, "new-v2"),
        current=OTHER_COLLECTION,
    )
    client.infos[OTHER_COLLECTION] = collection_info(manifest(OTHER_COLLECTION, "other-v1"))

    with pytest.raises(QdrantAliasOperationError) as error:
        manager.switch_alias(
            alias_name=ALIAS,
            target_collection=NEW_COLLECTION,
            expected_current_collection=OLD_COLLECTION,
            expected_manifest=manifest(NEW_COLLECTION, "new-v2"),
        )

    assert error.value.code == "QDRANT_ALIAS_CURRENT_MAPPING_MISMATCH"
    assert client.update_calls == []


def test_switch_rejects_target_marker_mismatch_before_alias_update() -> None:
    target = manifest(NEW_COLLECTION, "new-v2")
    wrong_marker = {**target.to_marker_payload(), "embedding_model_version": "wrong-model"}
    manager, client = manager_for(target)
    client.infos[NEW_COLLECTION] = collection_info(
        target,
        marker=SimpleNamespace(id=str(REPRESENTATION_METADATA_POINT_ID), payload=wrong_marker),
    )

    with pytest.raises(QdrantAliasOperationError) as error:
        manager.switch_alias(
            alias_name=ALIAS,
            target_collection=NEW_COLLECTION,
            expected_current_collection=OLD_COLLECTION,
            expected_manifest=target,
        )

    assert error.value.code == "QDRANT_ALIAS_TARGET_MARKER_MISMATCH"
    assert client.update_calls == []


def test_switch_rejects_missing_target_payload_index_before_alias_update() -> None:
    target = manifest(NEW_COLLECTION, "new-v2")
    manager, client = manager_for(target)
    info = collection_info(target)
    info.payload_schema.pop("job_id")
    client.infos[NEW_COLLECTION] = info

    with pytest.raises(QdrantAliasOperationError) as error:
        manager.switch_alias(
            alias_name=ALIAS,
            target_collection=NEW_COLLECTION,
            expected_current_collection=OLD_COLLECTION,
            expected_manifest=target,
        )

    assert error.value.code == "QDRANT_ALIAS_TARGET_PAYLOAD_INDEX_MISMATCH"
    assert client.update_calls == []


def test_switch_uses_one_atomic_delete_then_create_and_requires_exact_readback() -> None:
    target = manifest(NEW_COLLECTION, "new-v2")
    manager, client = manager_for(target)

    result = manager.switch_alias(
        alias_name=ALIAS,
        target_collection=NEW_COLLECTION,
        expected_current_collection=OLD_COLLECTION,
        expected_manifest=target,
    )

    assert len(client.update_calls) == 1
    operations = client.update_calls[0]
    assert len(operations) == 2
    assert operations[0].delete_alias.alias_name == ALIAS
    assert operations[1].create_alias.alias_name == ALIAS
    assert operations[1].create_alias.collection_name == NEW_COLLECTION
    assert result.previous_collection == OLD_COLLECTION
    assert result.readback_collection == NEW_COLLECTION
    assert result.preflight.current_collection == OLD_COLLECTION
    assert result.target_manifest == target


def test_initial_alias_create_requires_no_current_mapping_and_is_single_atomic_request() -> None:
    target = manifest(NEW_COLLECTION, "new-v2")
    manager, client = manager_for(target, current=None)

    result = manager.switch_alias(
        alias_name=ALIAS,
        target_collection=NEW_COLLECTION,
        expected_current_collection=None,
        expected_manifest=target,
    )

    assert len(client.update_calls) == 1
    assert len(client.update_calls[0]) == 1
    assert client.update_calls[0][0].create_alias.collection_name == NEW_COLLECTION
    assert result.previous_collection is None


def test_readback_failure_is_an_error_and_never_claims_success() -> None:
    target = manifest(NEW_COLLECTION, "new-v2")
    manager, client = manager_for(
        target,
        readback_aliases=[],
    )

    with pytest.raises(QdrantAliasOperationError) as error:
        manager.switch_alias(
            alias_name=ALIAS,
            target_collection=NEW_COLLECTION,
            expected_current_collection=OLD_COLLECTION,
            expected_manifest=target,
        )

    assert error.value.code == "QDRANT_ALIAS_READBACK_FAILED"
    assert len(client.update_calls) == 1


def test_rollback_requires_explicit_current_target_and_verifies_previous_manifest() -> None:
    old = manifest(OLD_COLLECTION, "old-v1")
    new = manifest(NEW_COLLECTION, "new-v2")
    manager, client = manager_for(old, current=NEW_COLLECTION)
    client.infos[NEW_COLLECTION] = collection_info(new)

    result = manager.rollback_alias(
        alias_name=ALIAS,
        previous_collection=OLD_COLLECTION,
        expected_current_collection=NEW_COLLECTION,
        expected_manifest=old,
    )

    assert len(client.update_calls) == 1
    assert client.update_calls[0][0].delete_alias.alias_name == ALIAS
    assert client.update_calls[0][1].create_alias.collection_name == OLD_COLLECTION
    assert result.operation == "ROLLBACK"
    assert result.previous_collection == NEW_COLLECTION
    assert result.readback_collection == OLD_COLLECTION


def test_same_collection_does_not_bypass_manifest_verification() -> None:
    target = manifest(OLD_COLLECTION, "old-v1")
    manager, client = manager_for(target, current=OLD_COLLECTION)
    wrong_marker = {**target.to_marker_payload(), "collection_version": "wrong-v1"}
    client.infos[OLD_COLLECTION] = collection_info(
        target,
        marker=SimpleNamespace(id=str(REPRESENTATION_METADATA_POINT_ID), payload=wrong_marker),
    )

    with pytest.raises(QdrantAliasOperationError) as error:
        manager.switch_alias(
            alias_name=ALIAS,
            target_collection=OLD_COLLECTION,
            expected_current_collection=OLD_COLLECTION,
            expected_manifest=target,
        )

    assert error.value.code == "QDRANT_ALIAS_TARGET_MARKER_MISMATCH"
    assert client.update_calls == []


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("provider", "unsafe/provider"),
        ("model", " model"),
        ("dimensions", True),
        ("normalization_version", "unsafe/version"),
        ("chunking_version", "unsafe/version"),
        ("index_schema_version", "unsafe/version"),
        ("physical_collection", "unsafe/collection"),
        ("alias", "unsafe/alias"),
        ("collection_version", "unsafe/version"),
    ],
)
def test_switch_rejects_invalid_manifest_fields_without_alias_reads_or_updates(
    field: str, value: object
) -> None:
    target = manifest(NEW_COLLECTION, "new-v2")
    invalid_values = {
        name: getattr(target, name)
        for name in (
            "provider",
            "model",
            "dimensions",
            "normalization_version",
            "chunking_version",
            "index_schema_version",
            "physical_collection",
            "alias",
            "collection_version",
        )
    }
    invalid_values[field] = value
    with pytest.raises(ValueError):
        RepresentationManifest(**invalid_values)

    client = manager_for(target)[1]
    assert client.update_calls == []


def test_switch_rejects_missing_target_collection_before_alias_update() -> None:
    target = manifest(NEW_COLLECTION, "new-v2")
    manager, client = manager_for(target)
    del client.infos[NEW_COLLECTION]

    with pytest.raises(QdrantAliasOperationError) as error:
        manager.switch_alias(
            alias_name=ALIAS,
            target_collection=NEW_COLLECTION,
            expected_current_collection=OLD_COLLECTION,
            expected_manifest=target,
        )

    assert error.value.code == "QDRANT_ALIAS_TARGET_NOT_FOUND"
    assert client.update_calls == []


@pytest.mark.parametrize(
    ("size", "distance"),
    [(8, "Cosine"), (4, "Dot")],
)
def test_switch_rejects_wrong_vector_dimensions_or_distance_before_alias_update(
    size: int, distance: str
) -> None:
    target = manifest(NEW_COLLECTION, "new-v2")
    manager, client = manager_for(target)
    info = collection_info(target)
    info.config.params.vectors.size = size
    info.config.params.vectors.distance = distance
    client.infos[NEW_COLLECTION] = info

    with pytest.raises(QdrantAliasOperationError) as error:
        manager.switch_alias(
            alias_name=ALIAS,
            target_collection=NEW_COLLECTION,
            expected_current_collection=OLD_COLLECTION,
            expected_manifest=target,
        )

    assert error.value.code == "QDRANT_ALIAS_TARGET_VECTOR_CONFIG_MISMATCH"
    assert client.update_calls == []


@pytest.mark.parametrize(
    ("marker_update", "expected_code"),
    [
        (
            {
                "foundation_version": "phase1",
                "embedding_model": "fake-embedding",
                "embedding_dimensions": 4,
            },
            "QDRANT_ALIAS_TARGET_MARKER_MISMATCH",
        ),
        ({"embedding_provider": "other-provider"}, "QDRANT_ALIAS_TARGET_MARKER_MISMATCH"),
        ({"embedding_model_version": "other-model"}, "QDRANT_ALIAS_TARGET_MARKER_MISMATCH"),
        ({"embedding_dimensions": 8}, "QDRANT_ALIAS_TARGET_MARKER_MISMATCH"),
        ({"collection_version": "other-v1"}, "QDRANT_ALIAS_TARGET_MARKER_MISMATCH"),
    ],
)
def test_switch_rejects_legacy_or_mismatched_manifest_marker_before_alias_update(
    marker_update: dict[str, object], expected_code: str
) -> None:
    target = manifest(NEW_COLLECTION, "new-v2")
    manager, client = manager_for(target)
    wrong_marker = (
        marker_update
        if "foundation_version" in marker_update
        else {**target.to_marker_payload(), **marker_update}
    )
    client.infos[NEW_COLLECTION] = collection_info(
        target,
        marker=SimpleNamespace(id=str(REPRESENTATION_METADATA_POINT_ID), payload=wrong_marker),
    )

    with pytest.raises(QdrantAliasOperationError) as error:
        manager.switch_alias(
            alias_name=ALIAS,
            target_collection=NEW_COLLECTION,
            expected_current_collection=OLD_COLLECTION,
            expected_manifest=target,
        )

    assert error.value.code == expected_code
    assert client.update_calls == []


def test_switch_accepts_rest_alias_and_collection_shapes_and_reports_digest() -> None:
    target = manifest(NEW_COLLECTION, "new-v2")
    manager, client = manager_for(target)
    client.aliases = [{"alias_name": ALIAS, "collection_name": OLD_COLLECTION}]
    client.readback_aliases = [{"alias_name": ALIAS, "collection_name": NEW_COLLECTION}]
    info = collection_info(target)
    client.infos[NEW_COLLECTION] = {
        "config": {"params": {"vectors": {"size": target.dimensions, "distance": "Cosine"}}},
        "payload_schema": info.payload_schema,
        "marker": {
            "id": str(REPRESENTATION_METADATA_POINT_ID),
            "payload": target.to_marker_payload(),
        },
    }

    result = manager.switch_alias(
        alias_name=ALIAS,
        target_collection=NEW_COLLECTION,
        expected_current_collection=OLD_COLLECTION,
        expected_manifest=target,
    )

    assert isinstance(result, AliasCutoverResult)
    assert result.manifest_digest == representation_manifest_digest(target)


def test_switch_rejects_alias_mapping_with_target_collection_name_collision() -> None:
    target = manifest(NEW_COLLECTION, "new-v2")
    manager, client = manager_for(target)
    client.aliases.append(
        SimpleNamespace(alias_name=NEW_COLLECTION, collection_name=OLD_COLLECTION)
    )

    with pytest.raises(QdrantAliasOperationError) as error:
        manager.switch_alias(
            alias_name=ALIAS,
            target_collection=NEW_COLLECTION,
            expected_current_collection=OLD_COLLECTION,
            expected_manifest=target,
        )

    assert error.value.code == "QDRANT_ALIAS_NAME_AMBIGUOUS"
    assert client.update_calls == []


def test_update_false_or_exception_is_not_success() -> None:
    target = manifest(NEW_COLLECTION, "new-v2")
    for update_result in (False, None):
        manager, client = manager_for(target, update_result=update_result)
        with pytest.raises(QdrantAliasOperationError) as error:
            manager.switch_alias(
                alias_name=ALIAS,
                target_collection=NEW_COLLECTION,
                expected_current_collection=OLD_COLLECTION,
                expected_manifest=target,
            )
        assert error.value.code == "QDRANT_ALIAS_UPDATE_FAILED"
        assert len(client.update_calls) == 1


def test_readback_exception_is_not_success_and_is_not_automatically_rolled_back() -> None:
    target = manifest(NEW_COLLECTION, "new-v2")
    manager, client = manager_for(target)
    client.readback_aliases = RuntimeError("readback unavailable")

    def get_aliases() -> object:
        if client.alias_reads > 0:
            raise client.readback_aliases
        client.alias_reads += 1
        return SimpleNamespace(
            aliases=[SimpleNamespace(alias_name=ALIAS, collection_name=OLD_COLLECTION)]
        )

    client.get_aliases = get_aliases  # type: ignore[method-assign]
    with pytest.raises(QdrantAliasOperationError) as error:
        manager.switch_alias(
            alias_name=ALIAS,
            target_collection=NEW_COLLECTION,
            expected_current_collection=OLD_COLLECTION,
            expected_manifest=target,
        )

    assert error.value.code == "QDRANT_ALIAS_READBACK_FAILED"
    assert len(client.update_calls) == 1


def test_rollback_rejects_missing_current_expectation() -> None:
    target = manifest(NEW_COLLECTION, "new-v2")
    manager, client = manager_for(target, current=None)

    with pytest.raises(QdrantAliasOperationError) as error:
        manager.rollback_alias(
            alias_name=ALIAS,
            previous_collection=NEW_COLLECTION,
            expected_current_collection=None,  # type: ignore[arg-type]
            expected_manifest=target,
        )

    assert error.value.code == "QDRANT_ALIAS_INVALID_REQUEST"
    assert client.update_calls == []
