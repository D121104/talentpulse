from typing import Any
from uuid import uuid4


def draft_payload(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "identity": {
            "request_id": str(uuid4()),
            "trace_id": str(uuid4()),
            "operation_attempt_id": str(uuid4()),
        },
        "candidate": {
            "candidate_id": str(uuid4()),
            "full_name": "Nguyen An",
            "email": "an@example.com",
            "headline": "Backend Engineer",
            "skills": ["Python", "FastAPI", "PostgreSQL"],
            "experience": [
                {
                    "company_name": "Acme",
                    "position": "Backend Engineer",
                    "start_date": "2022-01",
                    "end_date": "2024-01",
                    "description": "Built FastAPI services with Python and PostgreSQL.",
                }
            ],
            "education": [{"school_name": "Hanoi University", "degree": "Computer Science"}],
            "projects": [
                {
                    "project_name": "Talent API",
                    "role": "Developer",
                    "description": "Built hiring API",
                    "technologies": ["Python", "FastAPI"],
                }
            ],
        },
        "job": {
            "job_id": str(uuid4()),
            "title": "Senior Backend Engineer",
            "company_name": "Example Corp",
            "required_skills": ["Python", "FastAPI"],
            "preferred_skills": ["Docker"],
        },
        "template_type": "template1",
        "locale": "en",
        "source_version": "profile-v1",
        "content_version": 1,
    }
    payload.update(overrides)
    return payload
