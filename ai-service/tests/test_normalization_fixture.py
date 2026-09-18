from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.application.indexing import build_job_document, compute_content_hash
from app.domain.indexing import CanonicalJobSnapshot

FIXTURE_PATH = (
    Path(__file__).resolve().parents[2] / "contracts" / "job-indexing-normalization-v2.json"
)


def load_fixture() -> dict[str, Any]:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def test_cross_language_job_normalization_golden_fixture() -> None:
    fixture = load_fixture()

    assert fixture["fixture_version"] == "job-indexing-normalization-v2"
    assert fixture["normalization_version"] == "job-normalization-v2"
    assert len(fixture["cases"]) == 2

    for case in fixture["cases"]:
        snapshot = CanonicalJobSnapshot.model_validate(case["snapshot"])
        document = build_job_document(snapshot)

        assert document == case["expected"]["document"]
        assert compute_content_hash(document) == case["expected"]["content_hash"]
