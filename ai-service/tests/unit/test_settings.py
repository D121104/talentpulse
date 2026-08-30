from __future__ import annotations

import pytest
from app.core.index_representation import (
    CHUNKING_VERSION,
    INDEX_SCHEMA_VERSION,
    NORMALIZATION_VERSION,
    RepresentationManifest,
)
from app.core.settings import Settings


def test_production_requires_service_public_key() -> None:
    try:
        Settings(app_env="production")
    except ValueError as error:
        assert "AI_SERVICE_AUTH_PUBLIC_KEY or AI_SERVICE_AUTH_PUBLIC_KEY_FILE" in str(error)
    else:
        raise AssertionError("production settings must require service auth key")


def test_auth_identity_defaults_match_backend_example() -> None:
    settings = Settings()
    assert settings.ai_service_auth_issuer == "talentpulse-api"
    assert settings.ai_service_auth_audience == "talentpulse-ai"
    assert settings.ai_service_auth_key_id == "dev-key-1"


def test_blank_public_key_does_not_conflict_with_mounted_key_file() -> None:
    settings = Settings(
        ai_service_auth_public_key="",
        ai_service_auth_public_key_file="/run/secrets/ai-service-public-key",
    )
    assert settings.ai_service_auth_public_key is None
    assert settings.ai_service_auth_public_key_file == "/run/secrets/ai-service-public-key"


def test_local_defaults_keep_phase1_representation_compatible() -> None:
    settings = Settings()

    assert settings.qdrant_collection_version is None
    assert settings.representation.provider == "sentence_transformers"
    assert settings.representation.model == "BAAI/bge-m3"
    assert settings.representation.dimensions == 1024
    assert settings.representation.physical_collection == "jobs_bge_m3_1024_local_v1"
    assert settings.representation.alias == "jobs_current_local"


def test_local_fake_representation_is_deterministic() -> None:
    settings = Settings(
        embedding_provider="fake",
        vector_store_provider="fake",
        fake_embedding_dimensions=7,
        qdrant_collection_version="fake-v1",
    )

    assert settings.representation.as_dict()["provider"] == "fake"
    assert settings.representation.as_dict()["model"] == "fake-embedding"
    assert settings.representation.as_dict()["dimensions"] == 7
    assert settings.representation.collection_version == "fake-v1"


def test_staging_rejects_local_embedding_defaults() -> None:
    with pytest.raises(ValueError, match="BEDROCK_COHERE"):
        Settings(
            app_env="staging",
            ai_service_auth_public_key="test-public-key",
            qdrant_api_key="test-qdrant-key",
            qdrant_collection_version="staging-v1",
            qdrant_collection="jobs_cohere_staging_v1",
            qdrant_alias="jobs_current",
            qdrant_url="https://qdrant.example.test",
            qdrant_auto_initialize=False,
        )


def test_staging_requires_explicit_collection_security_settings() -> None:
    with pytest.raises(ValueError, match="QDRANT_COLLECTION_VERSION"):
        Settings(
            app_env="staging",
            embedding_provider="bedrock_cohere",
            ai_service_auth_public_key="test-public-key",
            qdrant_api_key="test-qdrant-key",
            qdrant_collection="jobs_cohere_staging_v1",
            qdrant_alias="jobs_current",
            qdrant_url="https://qdrant.example.test",
            qdrant_auto_initialize=False,
        )

    with pytest.raises(ValueError, match="HTTPS"):
        Settings(
            app_env="staging",
            embedding_provider="bedrock_cohere",
            ai_service_auth_public_key="test-public-key",
            qdrant_api_key="test-qdrant-key",
            qdrant_collection_version="staging-v1",
            qdrant_collection="jobs_cohere_staging_v1",
            qdrant_alias="jobs_current",
            qdrant_url="http://qdrant.example.test",
            qdrant_auto_initialize=False,
        )


def test_staging_accepts_explicit_cohere_representation_with_inline_test_key() -> None:
    settings = Settings(
        app_env="staging",
        embedding_provider="bedrock_cohere",
        ai_service_auth_public_key="test-public-key",
        qdrant_api_key="test-qdrant-key",
        qdrant_collection_version="cohere-v1",
        qdrant_collection="jobs_cohere_multilingual_v3_1024_v1",
        qdrant_alias="jobs_current",
        qdrant_url="https://qdrant.example.test",
        qdrant_auto_initialize=False,
    )

    assert settings.representation.provider == "bedrock_cohere"
    assert settings.representation.model == "cohere.embed-multilingual-v3"
    assert settings.representation.dimensions == 1024
    assert settings.representation.collection_version == "cohere-v1"


def test_staging_accepts_public_key_file_path_without_reading_it() -> None:
    settings = Settings(
        app_env="production",
        embedding_provider="bedrock_cohere",
        ai_service_auth_public_key_file="/run/secrets/test-public-key.pem",
        qdrant_api_key="test-qdrant-key",
        qdrant_collection_version="cohere-prod-v1",
        qdrant_collection="jobs_cohere_prod_v1",
        qdrant_alias="jobs_current",
        qdrant_url="https://qdrant.example.test",
        qdrant_auto_initialize=False,
    )

    assert settings.ai_service_auth_public_key_file == "/run/secrets/test-public-key.pem"


def test_manifest_serializes_server_owned_representation_without_secrets() -> None:
    settings = Settings(
        embedding_provider="fake",
        vector_store_provider="fake",
        fake_embedding_dimensions=7,
        qdrant_collection_version="fake-v1",
        qdrant_api_key="must-not-appear",
    )

    assert settings.embedding_provider == "fake"
    assert settings.embedding_model_version == "fake-embedding"
    assert settings.embedding_dimensions == 7
    assert settings.normalization_version == NORMALIZATION_VERSION
    assert settings.chunking_version == CHUNKING_VERSION
    assert settings.index_schema_version == INDEX_SCHEMA_VERSION
    assert settings.physical_collection == "fake-collection"
    assert settings.alias == "fake-collection"
    assert settings.collection_version == "fake-v1"

    manifest = settings.representation.model_dump()

    assert manifest["embedding_provider"] == "fake"
    assert manifest["embedding_model_version"] == "fake-embedding"
    assert manifest["embedding_dimensions"] == 7
    assert manifest["normalization_version"] == "nfkc-html-whitespace-v1"
    assert manifest["chunking_version"] == "section-greedy-v1"
    assert manifest["index_schema_version"] == "job-index-v1"
    assert manifest["physical_collection"] == "fake-collection"
    assert manifest["alias"] == "fake-collection"
    assert manifest["collection_version"] == "fake-v1"
    assert "qdrant_api_key" not in manifest
    assert "ai_service_auth_public_key" not in manifest


@pytest.mark.parametrize(
    "field_name",
    ["qdrant_collection", "qdrant_alias", "qdrant_collection_version"],
)
def test_qdrant_representation_identifiers_reject_unsafe_values(field_name: str) -> None:
    with pytest.raises(ValueError):
        Settings(**{field_name: "unsafe/name"})

    with pytest.raises(ValueError):
        Settings(**{field_name: " unsafe-name"})


def test_manifest_rejects_unsafe_collection_identity() -> None:
    with pytest.raises(ValueError):
        RepresentationManifest(
            provider="fake",
            model="fake-embedding",
            dimensions=4,
            normalization_version=NORMALIZATION_VERSION,
            chunking_version=CHUNKING_VERSION,
            index_schema_version=INDEX_SCHEMA_VERSION,
            physical_collection="jobs/fake",
            alias="jobs_current_fake",
            collection_version="fake-v1",
        )
