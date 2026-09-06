from collections.abc import Iterator
from typing import Any
from uuid import uuid4

import pytest
from app.core.config import Settings, get_settings
from app.main import app
from fastapi.testclient import TestClient


@pytest.fixture
def settings() -> Settings:
    return Settings(
        auth_required=False, max_upload_bytes=1024, max_extracted_chars=1_000, max_pdf_pages=1
    )


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    app.dependency_overrides[get_settings] = lambda: settings
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def match_payload(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "cv_id": str(uuid4()),
        "job_id": str(uuid4()),
        "candidate": {
            "skills": ["Python", "PostgreSQL"],
            "years_experience": 4,
            "level": "mid",
            "location": "Hanoi",
            "work_modes": ["hybrid"],
        },
        "job": {
            "required_skills": ["python", "Docker"],
            "preferred_skills": ["PostgreSQL"],
            "min_years_experience": 3,
            "level": "mid",
            "location": "Hanoi",
            "work_modes": ["hybrid"],
        },
    }
    payload.update(overrides)
    return payload


@pytest.fixture
def valid_match_payload() -> dict[str, Any]:
    return match_payload()
