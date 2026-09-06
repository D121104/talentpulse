from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="AI_",
        env_file=".env",
        extra="ignore",
        case_sensitive=False,
    )

    service_name: str = "talentpulse-ai-service"
    environment: str = "development"
    # Authentication may be disabled only in local/development/test environments.
    auth_required: bool = True
    jwt_algorithms: tuple[str, ...] = ("RS256",)
    jwt_public_key: str | None = None
    jwt_secret: str | None = None
    jwt_issuer: str | None = None
    jwt_audience: str | None = None
    cv_parse_scope: Annotated[str, Field(min_length=1)] = "cv:parse"
    cv_match_scope: Annotated[str, Field(min_length=1)] = "cv:match"
    rag_retrieve_scope: Annotated[str, Field(min_length=1)] = "rag:retrieve"
    rag_generate_scope: Annotated[str, Field(min_length=1)] = "rag:generate"
    # Provider selection is explicit. Deterministic providers are intended for local/test only.
    embedding_provider: Literal["deterministic", "cohere"] = "deterministic"
    vector_store_provider: Literal["memory", "qdrant"] = "memory"
    generation_provider: Literal["deterministic", "bedrock"] = "deterministic"
    cohere_model: str = "embed-multilingual-v3.0"
    cohere_dimensions: int = Field(default=1024, ge=1, le=4096)
    qdrant_url: str | None = None
    qdrant_collection: str | None = None
    bedrock_region: str | None = None
    bedrock_model: str | None = None

    max_upload_bytes: int = Field(default=5 * 1024 * 1024, ge=1, le=50 * 1024 * 1024)
    max_encoded_upload_chars: int = Field(default=7_000_000, ge=4, le=70_000_000)
    max_extracted_chars: int = Field(default=100_000, ge=1_000, le=1_000_000)
    max_pdf_pages: int = Field(default=50, ge=1, le=500)
    max_docx_members: int = Field(default=1_000, ge=1, le=10_000)
    max_docx_member_uncompressed_bytes: int = Field(
        default=10 * 1024 * 1024, ge=1, le=100 * 1024 * 1024
    )
    max_docx_uncompressed_bytes: int = Field(
        default=20 * 1024 * 1024, ge=1_000_000, le=100 * 1024 * 1024
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
