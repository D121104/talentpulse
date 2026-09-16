from __future__ import annotations

import json
import re
from pathlib import Path
from uuid import UUID

import pytest
from evals.job_search import (
    evaluate_baselines,
    filter_only_rank,
    generate_baseline_report,
    lexical_hard_filter_rank,
    lexical_overlap_rank,
    load_dataset,
    ndcg_at_k,
    recall_at_k,
    reciprocal_rank,
    validate_dataset,
)

DATASET = Path(__file__).parents[1] / "evals" / "datasets" / "job_search_eval_v1.json"


def test_fixture_has_exact_cardinality_and_valid_references() -> None:
    dataset = load_dataset(DATASET)
    jobs = dataset["jobs"]
    job_ids = {job["job_id"] for job in jobs}
    assert len(jobs) == 60
    assert len(job_ids) == 60
    assert all(str(UUID(job_id)) == job_id for job_id in job_ids)
    assert len(dataset["queries"]) == 40
    for query in dataset["queries"]:
        assert set(query["relevant_job_ids"]) <= job_ids
        assert set(query["expected_excluded_job_ids"]) <= job_ids
        assert set(query["graded_relevance"]) == set(query["relevant_job_ids"])


def test_fixture_covers_languages_roles_hard_negatives_and_lifecycle_distractors() -> None:
    dataset = load_dataset(DATASET)
    queries = dataset["queries"]
    assert {query["locale"] for query in queries} == {"en", "vi", "mixed"}
    assert sum(bool(query["relevant_job_ids"]) for query in queries) >= 35
    assert sum(len(query["relevant_job_ids"]) >= 2 for query in queries) >= 10
    assert sum(bool(query["expected_excluded_job_ids"]) for query in queries) >= 20
    assert any(not job["is_active"] or job["is_deleted"] for job in dataset["jobs"])
    assert any(query["filter_state"] for query in queries)
    assert any("salary_min" in query["filter_state"] for query in queries)


def test_fixture_contains_no_pii_placeholders_or_secrets() -> None:
    raw = DATASET.read_text(encoding="utf-8")
    assert not re.search(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", raw)
    assert not re.search(r"(?:password|secret|token|api[_-]?key)\s*[:=]", raw, re.I)
    assert "lorem ipsum" not in raw.lower()
    validate_dataset(json.loads(raw))


def test_baselines_are_deterministic_and_hard_filter_lifecycle_safe() -> None:
    dataset = load_dataset(DATASET)
    query = next(query for query in dataset["queries"] if query["query_id"] == "q11")
    first = filter_only_rank(dataset["jobs"], query)
    assert first == filter_only_rank(dataset["jobs"], query)
    assert first
    assert not set(lexical_hard_filter_rank(dataset["jobs"], query)) & set(
        query["expected_excluded_job_ids"]
    )
    assert not set(first) & set(query["expected_excluded_job_ids"])
    assert lexical_overlap_rank(dataset["jobs"], query) == lexical_overlap_rank(
        dataset["jobs"], query
    )


def test_metrics_are_deterministic_and_handle_no_result_query() -> None:
    assert recall_at_k(["a", "b"], {"b"}, 1) == 0.0
    assert reciprocal_rank(["a", "b"], {"b"}) == 0.5
    assert ndcg_at_k(["b", "a"], {"a": 3, "b": 1}, 2) < 1.0
    assert recall_at_k([], set(), 5) == 1.0
    assert reciprocal_rank([], set()) == 1.0
    assert ndcg_at_k([], {}, 5) == 1.0


def test_baseline_report_has_required_metrics_and_subgroups() -> None:
    dataset = load_dataset(DATASET)
    report = evaluate_baselines(dataset)
    assert report == evaluate_baselines(dataset)
    assert report["schema_version"] == "job-search-eval-v1"
    assert set(report["baselines"]) == {"filter_only", "lexical_overlap", "lexical_hard_filters"}
    for baseline in report["baselines"].values():
        assert "macro" in baseline and "query_metrics" in baseline
        assert "locale:en" in baseline["subgroups"]
        assert "filter:structured" in baseline["subgroups"]
        assert len(baseline["query_metrics"]) == 40
        assert any(key.startswith("recall_at_") for key in baseline["macro"])
        assert any(key.startswith("ndcg_at_") for key in baseline["macro"])
        assert "mrr" in baseline["macro"]
        assert "lifecycle_exclusion_violations" in baseline["macro"]


def test_report_generation_accepts_fixture_path() -> None:
    report = generate_baseline_report(DATASET)
    assert report["baselines"]["filter_only"]["query_metrics"]["q40"]["mrr"] == 1.0


def test_invalid_cardinality_is_rejected() -> None:
    dataset = load_dataset(DATASET)
    dataset["jobs"] = dataset["jobs"][:-1]
    with pytest.raises(ValueError, match="exactly 60"):
        validate_dataset(dataset)
