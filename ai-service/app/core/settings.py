from __future__ import annotations

from enum import StrEnum
from functools import lru_cache

from pydantic import AliasChoices, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


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
    bedrock_embedding_model: str = "cohere.embed-multilingual-v3"
    bedrock_embedding_dimensions: int = Field(default=1024, ge=1, le=4096)

    vector_store_provider: VectorStoreProvider = VectorStoreProvider.QDRANT
    qdrant_url: str = "http://127.0.0.1:6333"
    qdrant_api_key: SecretStr | None = None
    qdrant_collection: str = Field(
        default="jobs_bge_m3_1024_local_v1", min_length=1, max_length=255
    )
    qdrant_alias: str = Field(default="jobs_current_local", min_length=1, max_length=255)
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
        if self.app_env is not Environment.LOCAL and not (
            self.ai_service_auth_public_key or self.ai_service_auth_public_key_file
        ):
            raise ValueError(
                "AI_SERVICE_AUTH_PUBLIC_KEY or AI_SERVICE_AUTH_PUBLIC_KEY_FILE "
                + "is required outside local configuration"
            )
        if self.ai_service_auth_public_key and self.ai_service_auth_public_key_file:
            raise ValueError(
                "Configure exactly one of AI_SERVICE_AUTH_PUBLIC_KEY and "
                + "AI_SERVICE_AUTH_PUBLIC_KEY_FILE"
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


@lru_cache
def get_settings() -> Settings:
    return Settings()
