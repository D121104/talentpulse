from __future__ import annotations

from enum import StrEnum
from functools import lru_cache

from pydantic import AliasChoices, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.index_representation import (
    CHUNKING_VERSION,
    INDEX_SCHEMA_VERSION,
    NORMALIZATION_VERSION,
    RepresentationManifest,
    validate_safe_identifier,
)

LOCAL_QDRANT_COLLECTION = "jobs_bge_m3_1024_local_v1"
LOCAL_QDRANT_ALIAS = "jobs_current_local"
FAKE_VECTOR_COLLECTION = "fake-collection"


class Environment(StrEnum):
    LOCAL = "local"
    STAGING = "staging"
    PRODUCTION = "production"


class ChatProvider(StrEnum):
    OLLAMA = "ollama"
    BEDROCK = "bedrock"
    FAKE = "fake"


class EmbeddingProvider(StrEnum):
    SENTENCE_TRANSFORMERS = "sentence_transformers"
    BEDROCK_COHERE = "bedrock_cohere"
    FAKE = "fake"


class VectorStoreProvider(StrEnum):
    QDRANT = "qdrant"
    FAKE = "fake"


class AuthMode(StrEnum):
    JWT = "jwt"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env.local", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_env: Environment = Environment.LOCAL
    app_name: str = "talentpulse-ai-service"
    host: str = "0.0.0.0"
    port: int = Field(default=8000, ge=1, le=65535)
    log_level: str = "INFO"

    chat_model_provider: ChatProvider = ChatProvider.OLLAMA
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = Field(default="qwen3:8b", min_length=1, max_length=128)
    bedrock_region: str = "us-east-1"
    bedrock_chat_model: str = "amazon.nova-lite-v1:0"

    embedding_provider: EmbeddingProvider = EmbeddingProvider.SENTENCE_TRANSFORMERS
    local_embedding_model: str = Field(default="BAAI/bge-m3", min_length=1, max_length=256)
    local_embedding_dimensions: int = Field(default=1024, ge=1, le=4096)
    local_embedding_device: str = "cpu"
    fake_embedding_dimensions: int = Field(default=4, ge=1, le=4096)
    bedrock_embedding_model: str = Field(
        default="cohere.embed-multilingual-v3", min_length=1, max_length=256
    )
    bedrock_embedding_dimensions: int = Field(default=1024, ge=1, le=4096)

    vector_store_provider: VectorStoreProvider = VectorStoreProvider.QDRANT
    qdrant_url: str = "http://127.0.0.1:6333"
    qdrant_api_key: SecretStr | None = None
    qdrant_collection: str = Field(default=LOCAL_QDRANT_COLLECTION, min_length=1, max_length=255)
    qdrant_alias: str = Field(default=LOCAL_QDRANT_ALIAS, min_length=1, max_length=255)
    qdrant_collection_version: str | None = Field(default=None, min_length=1, max_length=128)
    qdrant_auto_initialize: bool = True
    qdrant_timeout_seconds: float = Field(default=3.0, gt=0, le=60)

    ai_service_auth_mode: AuthMode = AuthMode.JWT
    ai_service_auth_issuer: str = Field(
        default="talentpulse-api",
        validation_alias=AliasChoices("AI_SERVICE_ISSUER", "AI_SERVICE_AUTH_ISSUER"),
    )
    ai_service_auth_audience: str = Field(
        default="talentpulse-ai",
        validation_alias=AliasChoices("AI_SERVICE_AUDIENCE", "AI_SERVICE_AUTH_AUDIENCE"),
    )
    ai_service_auth_key_id: str = Field(
        default="dev-key-1",
        validation_alias=AliasChoices("AI_SERVICE_JWT_KID", "AI_SERVICE_AUTH_KEY_ID"),
    )
    ai_service_auth_public_key: SecretStr | None = None
    ai_service_auth_public_key_file: str | None = None

    request_timeout_seconds: float = Field(default=30.0, gt=0, le=300)
    max_message_chars: int = Field(default=4000, ge=128, le=20000)
    max_history_items: int = Field(default=10, ge=0, le=50)
    max_context_chars: int = Field(default=24000, ge=1000, le=100000)

    @field_validator("ollama_base_url", "qdrant_url")
    @classmethod
    def require_http_url(cls, value: str) -> str:
        if not value.startswith(("http://", "https://")):
            raise ValueError("provider URLs must use http or https")
        return value.rstrip("/")

    @field_validator("bedrock_region")
    @classmethod
    def validate_region(cls, value: str) -> str:
        if not value or len(value) > 32 or any(char.isspace() for char in value):
            raise ValueError("bedrock_region is invalid")
        return value

    @field_validator("qdrant_api_key", mode="before")
    @classmethod
    def normalize_qdrant_api_key(cls, value: object) -> object:
        if value is None:
            return None
        if isinstance(value, SecretStr):
            return None if not value.get_secret_value().strip() else value
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("qdrant_collection")
    @classmethod
    def validate_collection_name(cls, value: str) -> str:
        return validate_safe_identifier(value, "QDRANT_COLLECTION", 255)

    @field_validator("qdrant_alias")
    @classmethod
    def validate_alias_name(cls, value: str) -> str:
        return validate_safe_identifier(value, "QDRANT_ALIAS", 255)

    @field_validator("qdrant_collection_version")
    @classmethod
    def validate_collection_version(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return validate_safe_identifier(value, "QDRANT_COLLECTION_VERSION", 128)

    @field_validator("ai_service_auth_public_key", mode="before")
    @classmethod
    def normalize_public_key(cls, value: object) -> object:
        if value is None:
            return None
        if isinstance(value, SecretStr):
            return None if not value.get_secret_value().strip() else value
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("ai_service_auth_public_key_file")
    @classmethod
    def validate_public_key_file(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("AI_SERVICE_AUTH_PUBLIC_KEY_FILE must not be empty")
        return value.strip() if value else value

    @field_validator("ai_service_auth_issuer", "ai_service_auth_audience", "ai_service_auth_key_id")
    @classmethod
    def validate_auth_identity(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("AI service JWT issuer, audience and key id must not be empty")
        return value.strip()

    @model_validator(mode="after")
    def validate_provider_dimensions(self) -> Settings:
        if (
            self.embedding_provider is EmbeddingProvider.BEDROCK_COHERE
            and self.bedrock_embedding_dimensions != 1024
        ):
            raise ValueError("Cohere multilingual v3 requires 1024 dimensions")
        if self.ai_service_auth_public_key and self.ai_service_auth_public_key_file:
            raise ValueError(
                "Configure exactly one of AI_SERVICE_AUTH_PUBLIC_KEY and "
                + "AI_SERVICE_AUTH_PUBLIC_KEY_FILE"
            )
        if self.app_env is Environment.LOCAL:
            return self

        if not (self.ai_service_auth_public_key or self.ai_service_auth_public_key_file):
            raise ValueError(
                "AI_SERVICE_AUTH_PUBLIC_KEY or AI_SERVICE_AUTH_PUBLIC_KEY_FILE "
                + "is required outside local configuration"
            )
        if self.embedding_provider is not EmbeddingProvider.BEDROCK_COHERE:
            raise ValueError(
                "embedding_provider must be BEDROCK_COHERE outside local configuration"
            )
        if self.qdrant_collection_version is None:
            raise ValueError("QDRANT_COLLECTION_VERSION is required outside local configuration")
        if self.qdrant_auto_initialize:
            raise ValueError("QDRANT_AUTO_INITIALIZE must be false outside local configuration")
        if self.qdrant_api_key is None or not self.qdrant_api_key.get_secret_value().strip():
            raise ValueError("QDRANT_API_KEY is required outside local configuration")
        if not self.qdrant_url.startswith("https://"):
            raise ValueError("QDRANT_URL must use HTTPS outside local configuration")
        if self.qdrant_collection == LOCAL_QDRANT_COLLECTION:
            raise ValueError(
                "QDRANT_COLLECTION must be explicitly configured outside local configuration"
            )
        if self.qdrant_alias == LOCAL_QDRANT_ALIAS:
            raise ValueError(
                "QDRANT_ALIAS must be explicitly configured outside local configuration"
            )
        return self

    @property
    def effective_embedding_dimensions(self) -> int:
        if self.embedding_provider is EmbeddingProvider.BEDROCK_COHERE:
            return self.bedrock_embedding_dimensions
        if self.embedding_provider is EmbeddingProvider.FAKE:
            return self.fake_embedding_dimensions
        return self.local_embedding_dimensions

    @property
    def effective_embedding_model(self) -> str:
        if self.embedding_provider is EmbeddingProvider.BEDROCK_COHERE:
            return self.bedrock_embedding_model
        if self.embedding_provider is EmbeddingProvider.FAKE:
            return "fake-embedding"
        return self.local_embedding_model

    # These aliases make the server-owned representation available without
    # exposing provider-specific configuration fields to callers.
    @property
    def embedding_model_version(self) -> str:
        return self.effective_embedding_model

    @property
    def embedding_dimensions(self) -> int:
        return self.effective_embedding_dimensions

    @property
    def normalization_version(self) -> str:
        return NORMALIZATION_VERSION

    @property
    def chunking_version(self) -> str:
        return CHUNKING_VERSION

    @property
    def index_schema_version(self) -> str:
        return INDEX_SCHEMA_VERSION

    @property
    def physical_collection(self) -> str:
        return self.representation.physical_collection

    @property
    def alias(self) -> str:
        return self.representation.alias

    @property
    def collection_version(self) -> str | None:
        return self.qdrant_collection_version

    @property
    def representation(self) -> RepresentationManifest:
        """Return the server-owned vector representation manifest."""

        physical_collection = self.qdrant_collection
        alias = self.qdrant_alias
        if self.vector_store_provider is VectorStoreProvider.FAKE:
            physical_collection = FAKE_VECTOR_COLLECTION
            alias = FAKE_VECTOR_COLLECTION
        return RepresentationManifest(
            provider=self.embedding_provider.value,
            model=self.effective_embedding_model,
            dimensions=self.effective_embedding_dimensions,
            normalization_version=NORMALIZATION_VERSION,
            chunking_version=CHUNKING_VERSION,
            index_schema_version=INDEX_SCHEMA_VERSION,
            physical_collection=physical_collection,
            alias=alias,
            collection_version=self.qdrant_collection_version,
        )

    @property
    def representation_manifest(self) -> RepresentationManifest:
        return self.representation

    @property
    def manifest(self) -> RepresentationManifest:
        return self.representation


@lru_cache
def get_settings() -> Settings:
    return Settings()
