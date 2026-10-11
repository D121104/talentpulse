from uuid import uuid4

import pytest


def test_parse_response_has_bounded_structured_fields_and_forbids_extras() -> None:
    from pydantic import ValidationError

    from talentpulse_ai.modules.cv_analysis.schemas import CVParseResponse

    response = CVParseResponse(
        cv_id=uuid4(),
        content_version=1,
        media_type="application/pdf",
        content_sha256="a" * 64,
        extracted_text="A parsed CV",
        text_char_count=11,
        skills=["Python"],
        education=["BSc Computer Science"],
        experience=["Backend Engineer"],
        certificates=["AWS Certified Developer"],
        warnings=["Some content was not classified."],
    )

    assert response.parser_version == "structured-parser-v1"
    assert response.model_dump()["skills"] == ["Python"]

    with pytest.raises(ValidationError):
        CVParseResponse(
            cv_id=uuid4(),
            content_version=1,
            media_type="application/pdf",
            content_sha256="a" * 64,
            extracted_text="A parsed CV",
            text_char_count=11,
            unexpected=True,
        )


def test_parse_response_rejects_unbounded_structured_items() -> None:
    from talentpulse_ai.modules.cv_analysis.schemas import CVParseResponse

    with pytest.raises(ValueError):
        CVParseResponse(
            cv_id=uuid4(),
            content_version=1,
            media_type="application/pdf",
            content_sha256="a" * 64,
            extracted_text="A parsed CV",
            text_char_count=11,
            skills=["x"] * 51,
        )


def test_cv_match_golden_fixture_validates() -> None:
    import json
    from pathlib import Path

    from talentpulse_ai.modules.cv_analysis.schemas import MatchRequest, MatchResponse

    fixture = json.loads(
        Path(__file__).resolve().parents[4].joinpath("contracts/cv-match-v1.json").read_text()
    )
    request = MatchRequest.model_validate(fixture["request"])
    response = MatchResponse.model_validate(fixture["response"])
    assert request.identity.request_id == response.request_id
    assert request.content_hash == response.content_hash
    assert request.job_source_version == response.job_source_version
