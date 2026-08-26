from __future__ import annotations

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
