from __future__ import annotations

from typing import Any
from uuid import uuid4

import pytest
from tests.cv_payload import draft_payload

from talentpulse_ai.modules.cv_generator.schemas import CvDraftRequest
from talentpulse_ai.scripts.evaluation.hosted_generation_eval import (
    evaluate_application_journeys,
)


class StructuredCvProvider:
    provider_name = "gemini"
    supports_structured_outputs = True

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    def generate_structured(
        self, prompt: str, schema: dict[str, Any], timeout: float
    ) -> dict[str, Any]:
        self.calls.append({"prompt": prompt, "schema": schema, "timeout": timeout})
        return {
            "title": "Synthetic CV",
            "position": "Backend Engineer",
            "career_objective": "Build reliable backend services.",
            "education": [],
            "projects": [],
            "work_experience": [
                {
                    "source_index": 0,
                    "position": "Backend Engineer",
                    "description": "Built an API.",
                    "bullets": ["Built an API."],
                }
            ],
            "skills": [
                {
                    "group_name": "Backend & APIs",
                    "source_indices": [0, 1],
                    "job_skill_indices": [0, 1],
                }
            ],
            "activities": [],
            "certificates": [],
            "awards": [],
            "section_order": ["experience", "skills"],
        }


def cv_case(journey: str, locale: str = "en-US") -> dict[str, Any]:
    payload = draft_payload(locale=locale, consent_version="synthetic-consent-v1")
    payload["candidate"].update(
        candidate_id=str(uuid4()),
        full_name="Synthetic Candidate",
        email=None,
        phone=None,
        link=None,
        address=None,
    )
    request = CvDraftRequest.model_validate(payload).model_dump(mode="json")
    return {
        "id": f"synthetic-{journey.lower()}",
        "journey": journey,
        "synthetic": True,
        "prompt": f"Synthetic {journey} fixture for locale {locale}.",
        "rubric": "Check source association and requested output locale.",
        "request": request,
    }


def test_cv_journeys_use_one_structured_response_with_prompt_locale() -> None:
    provider = StructuredCvProvider()
    cases = [cv_case("CV_GENERATION", "en-US"), cv_case("CV_LOCALIZATION", "vi-VN")]

    report = evaluate_application_journeys(
        cases,
        lambda: provider,
        provider_name="gemini",
        journeys=("CV_GENERATION", "CV_LOCALIZATION"),
    )

    assert [row["outcome"] for row in report["results"]] == [
        "application_completed",
        "application_completed",
    ]
    assert [row["cv_generation_metrics"]["provider_call_count"] for row in report["results"]] == [
        1,
        1,
    ]
    assert [row["cv_generation_metrics"]["tool_call_count"] for row in report["results"]] == [
        0,
        0,
    ]
    assert len(provider.calls) == 2
    assert all(call["schema"]["properties"]["work_experience"] for call in provider.calls)
    assert "English (en-US)" in provider.calls[0]["prompt"]
    assert "Vietnamese (vi-VN)" in provider.calls[1]["prompt"]
    assert report["release_ready"] is False


def test_application_evaluation_filters_out_unselected_journeys() -> None:
    provider = StructuredCvProvider()
    report = evaluate_application_journeys(
        [cv_case("CV_GENERATION"), cv_case("CV_LOCALIZATION", "vi-VN")],
        lambda: provider,
        provider_name="gemini",
        journeys=("CV_GENERATION",),
    )

    assert [row["journey"] for row in report["results"]] == ["CV_GENERATION"]
    assert [group["journey"] for group in report["groups"]] == ["CV_GENERATION"]
    assert len(provider.calls) == 1


def test_application_evaluation_rejects_unknown_journey_selection() -> None:
    with pytest.raises(ValueError, match="invalid_journey_selection"):
        evaluate_application_journeys([], lambda: object(), journeys=("UNKNOWN",))
