from __future__ import annotations

import uuid

import pytest
from app.adapters.qdrant.alias_manager import QdrantAliasManager
from app.adapters.qdrant.store import PAYLOAD_INDEX_SCHEMAS
from app.core.index_representation import (
    CHUNKING_VERSION,
    INDEX_SCHEMA_VERSION,
    NORMALIZATION_VERSION,
    REPRESENTATION_METADATA_POINT_ID,
    RepresentationManifest,
)
from qdrant_client import QdrantClient, models


def _local_client() -> QdrantClient:
    return QdrantClient(url="http://127.0.0.1:6333", check_compatibility=False)


def _build_collection(
    client: QdrantClient, collection_name: str, alias_name: str, version: str
) -> RepresentationManifest:
    manifest = RepresentationManifest(
        provider="fake",
        model="fake-embedding",
        dimensions=4,
        normalization_version=NORMALIZATION_VERSION,
        chunking_version=CHUNKING_VERSION,
        index_schema_version=INDEX_SCHEMA_VERSION,
        physical_collection=collection_name,
        alias=alias_name,
        collection_version=version,
    )
    client.create_collection(
        collection_name=collection_name,
        vectors_config=models.VectorParams(size=4, distance=models.Distance.COSINE),
    )
    client.upsert(
        collection_name=collection_name,
        points=[
            models.PointStruct(
                id=str(REPRESENTATION_METADATA_POINT_ID),
                vector=[1.0, 0.0, 0.0, 0.0],
                payload=manifest.to_marker_payload(),
            )
        ],
        wait=True,
    )
    for field_name, field_type in PAYLOAD_INDEX_SCHEMAS.items():
        client.create_payload_index(
            collection_name=collection_name,
            field_name=field_name,
            field_schema=getattr(models.PayloadSchemaType, field_type.upper()),
            wait=True,
        )
    return manifest


def test_local_qdrant_v1136_switches_and_rolls_back_unique_collections() -> None:
    client = _local_client()
    prefix = f"alias_probe_{uuid.uuid4().hex[:12]}"
    old_collection = f"{prefix}_old"
    new_collection = f"{prefix}_new"
    alias_name = f"{prefix}_current"
    try:
        old_manifest = _build_collection(client, old_collection, alias_name, "old-v1")
        new_manifest = _build_collection(client, new_collection, alias_name, "new-v2")
        client.update_collection_aliases(
            change_aliases_operations=[
                models.CreateAliasOperation(
                    create_alias=models.CreateAlias(
                        collection_name=old_collection, alias_name=alias_name
                    )
                )
            ]
        )

        manager = QdrantAliasManager(client)
        switched = manager.switch_alias(new_collection, alias_name, old_collection, new_manifest)
        rolled_back = manager.rollback_alias(
            alias_name, old_collection, new_collection, old_manifest
        )

        assert switched.current_collection == new_collection
        assert rolled_back.current_collection == old_collection
    except Exception as exc:
        if "Connection refused" in str(exc) or "Failed to establish a new connection" in str(exc):
            pytest.skip("local Qdrant v1.13.6 is not running")
        raise
    finally:
        try:
            client.update_collection_aliases(
                change_aliases_operations=[
                    models.DeleteAliasOperation(
                        delete_alias=models.DeleteAlias(alias_name=alias_name)
                    )
                ]
            )
        except Exception:
            pass
        for collection_name in (old_collection, new_collection):
            try:
                client.delete_collection(collection_name)
            except Exception:
                pass
