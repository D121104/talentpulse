from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

OcrLanguage = Literal["eng", "vie"]


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
    # Non-local callers must use the configured backend service subject.
    jwt_subject: str | None = None
    cv_parse_scope: Annotated[str, Field(min_length=1)] = "cv:parse"
    cv_match_scope: Annotated[str, Field(min_length=1)] = "cv:match"
    rag_retrieve_scope: Annotated[str, Field(min_length=1)] = "rag:retrieve"
    rag_generate_scope: Annotated[str, Field(min_length=1)] = "rag:generate"
    job_index_scope: Annotated[str, Field(min_length=1)] = "jobs:index"
    # Provider selection is explicit. Deterministic providers are intended for local/test only.
    embedding_provider: Literal["deterministic", "cohere", "ollama"] = "deterministic"
    vector_store_provider: Literal["memory", "qdrant"] = "memory"
    generation_provider: Literal["deterministic", "bedrock", "ollama"] = "deterministic"
    # Bedrock identifies Cohere Embed Multilingual v3 as cohere.embed-multilingual-v3.
    cohere_model: str = "cohere.embed-multilingual-v3"
    cohere_dimensions: int = Field(default=1024, ge=1, le=4096)
    # Ollama is supported only by the local/development/test provider tuple.
    ollama_url: str = "http://127.0.0.1:11435"
    ollama_embedding_model: str = "embeddinggemma:300m"
    ollama_embedding_dimensions: int = Field(default=768, ge=1, le=4096)
    ollama_generation_model: str = "qwen2.5:3b"
    ollama_timeout_seconds: float = Field(default=25.0, gt=0, le=120)
    qdrant_url: str | None = None
    qdrant_collection: str | None = None
    qdrant_alias: str | None = None
    qdrant_index_version: str | None = None
    qdrant_api_key: str | None = None
    # Qdrant administration is an explicit operator action, never startup work.
    qdrant_admin_enabled: bool = False
    bedrock_region: str | None = None
    bedrock_model: str | None = None

    max_upload_bytes: int = Field(default=5 * 1024 * 1024, ge=1, le=50 * 1024 * 1024)
    max_encoded_upload_chars: int = Field(default=7_000_000, ge=4, le=70_000_000)
    max_extracted_chars: int = Field(default=100_000, ge=1_000, le=1_000_000)
    max_pdf_pages: int = Field(default=50, ge=1, le=500)
    cv_ocr_enabled: bool = False
    cv_ocr_native_text_min_chars: int = Field(default=250, ge=50, le=2_000)
    cv_ocr_max_pages: int = Field(default=5, ge=1, le=10)
    cv_ocr_dpi: int = Field(default=200, ge=150, le=300)
    cv_ocr_max_render_pixels: int = Field(default=10_000_000, ge=1_000_000, le=12_000_000)
    cv_ocr_render_timeout_seconds: float = Field(default=10.0, gt=0, le=30.0)
    cv_ocr_recognize_timeout_seconds: float = Field(default=15.0, gt=0, le=30.0)
    cv_ocr_total_timeout_seconds: float = Field(default=60.0, ge=5.0, le=120.0)
    cv_ocr_max_stdout_bytes: int = Field(default=1_000_000, ge=1_024, le=4_000_000)
    cv_ocr_languages: tuple[OcrLanguage, ...] = Field(
        default=("eng", "vie"), min_length=1, max_length=2
    )

    @field_validator("cv_ocr_languages")
    @classmethod
    def unique_ocr_languages(cls, value: tuple[OcrLanguage, ...]) -> tuple[OcrLanguage, ...]:
        if len(set(value)) != len(value):
            raise ValueError("cv_ocr_languages must not contain duplicates")
        return value

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
