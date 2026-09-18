"""Stdlib-only deterministic evaluation for synthetic job retrieval."""

from __future__ import annotations

import json
import math
import re
import unicodedata
from collections import defaultdict
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any, cast
from uuid import UUID

DEFAULT_DATASET_PATH = Path(__file__).parent / "datasets" / "job_search_eval_v1.json"
SCHEMA_VERSION = "job-search-eval-v1"
_TOKEN_RE = re.compile(r"[a-z0-9]+")
_PII_RE = re.compile(
    r"(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|"
    r"(?:\+?\d[\d .-]{7,}\d)|"
    r"(?:sk|token|secret|password)[_-]?[a-z0-9]{8,})",
    re.I,
)
_STOP_WORDS = frozenset(
    "a an and are at by for from in into is of on or the to with "
    "tìm việc kỹ sư làm tại ở và cho từ một là remote engineer role job".split()
)


def load_dataset(path: str | Path = DEFAULT_DATASET_PATH) -> dict[str, Any]:
    """Load the checked-in JSON fixture without invoking application providers."""
    with Path(path).open(encoding="utf-8") as handle:
        dataset = json.load(handle)
    validate_dataset(dataset)
    return cast(dict[str, Any], dataset)


def _canonical_uuid(value: object) -> str:
    if not isinstance(value, str):
        raise ValueError("job IDs must be UUID strings")
    try:
        parsed = UUID(value)
    except ValueError as exc:
        raise ValueError(f"invalid UUID: {value!r}") from exc
    canonical = str(parsed)
    if canonical != value.lower():
        raise ValueError(f"UUID is not canonical: {value!r}")
    return canonical


def _strings(value: object) -> list[str]:
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise ValueError("expected a list of strings")
    return value


def validate_dataset(dataset: Mapping[str, Any]) -> None:
    """Validate fixture cardinality, referential labels, UUIDs, and synthetic-only text."""
    if dataset.get("schema_version") != SCHEMA_VERSION:
        raise ValueError("unsupported evaluation schema version")
    jobs = dataset.get("jobs")
    queries = dataset.get("queries")
    if not isinstance(jobs, list) or len(jobs) != 60:
        raise ValueError("evaluation corpus must contain exactly 60 jobs")
    if not isinstance(queries, list) or len(queries) != 40:
        raise ValueError("evaluation corpus must contain exactly 40 queries")
    job_ids: set[str] = set()
    for job in jobs:
        if not isinstance(job, dict):
            raise ValueError("each job must be an object")
        job_id = _canonical_uuid(job.get("job_id"))
        if job_id in job_ids:
            raise ValueError("job IDs must be unique")
        job_ids.add(job_id)
        for key, value in job.items():
            if key == "job_id":
                continue
            if isinstance(value, str) and _PII_RE.search(value):
                raise ValueError("fixture contains PII or secret-like text")
    query_ids: set[str] = set()
    for query in queries:
        if not isinstance(query, dict):
            raise ValueError("each query must be an object")
        query_id = query.get("query_id")
        if not isinstance(query_id, str) or not query_id or query_id in query_ids:
            raise ValueError("query IDs must be unique non-empty strings")
        query_ids.add(query_id)
        if not isinstance(query.get("text"), str) or not query["text"].strip():
            raise ValueError("every query needs text")
        if query.get("locale") not in {"en", "vi", "mixed"}:
            raise ValueError("query locale must be en, vi, or mixed")
        evaluate_at = query.get("evaluate_at")
        if (
            not isinstance(evaluate_at, list)
            or not evaluate_at
            or not all(isinstance(k, int) and k > 0 for k in evaluate_at)
        ):
            raise ValueError("evaluate_at must contain positive integer cutoffs")
        relevant = {_canonical_uuid(item) for item in _strings(query.get("relevant_job_ids"))}
        expected = {
            _canonical_uuid(item) for item in _strings(query.get("expected_excluded_job_ids"))
        }
        graded = query.get("graded_relevance")
        if not isinstance(graded, dict) or set(graded) != relevant:
            raise ValueError("graded_relevance must label every relevant job exactly")
        if any(
            not isinstance(score, (int, float)) or not 0 <= score <= 3 for score in graded.values()
        ):
            raise ValueError("graded relevance must be between 0 and 3")
        if relevant & expected:
            raise ValueError("a job cannot be both relevant and excluded")
        if not relevant and not expected:
            raise ValueError("no-result queries still need exclusion labels")
        if not relevant and any(float(score) > 0 for score in graded.values()):
            raise ValueError("empty relevant labels cannot have positive grades")
        if not relevant <= job_ids or not expected <= job_ids:
            raise ValueError("query labels must refer to corpus jobs")
        _validate_filter_shape(query.get("filter_state"), query.get("explicit_filters"))
        for key, value in query.items():
            if key in {"query_id", "relevant_job_ids", "expected_excluded_job_ids"}:
                continue
            if isinstance(value, str) and _PII_RE.search(value):
                raise ValueError("fixture contains PII or secret-like text")


def _validate_filter_shape(state: object, explicit: object) -> None:
    if not isinstance(state, dict) or not isinstance(explicit, dict):
        raise ValueError("filter states must be objects")
    allowed_state = {"company", "location", "level", "salary_min", "salary_max", "skills"}
    allowed_explicit = {
        "company_ids",
        "locations",
        "levels",
        "skills_any",
        "skills_all",
        "salary_gte",
        "salary_lte",
    }
    if set(state) - allowed_state or set(explicit) - allowed_explicit:
        raise ValueError("fixture uses an unsupported retrieval filter")
    if "skills" in state:
        _strings(state["skills"])


def _normalize(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text.casefold())
    return "".join(char for char in decomposed if not unicodedata.combining(char))


def _tokens(text: str) -> set[str]:
    return {token for token in _TOKEN_RE.findall(_normalize(text)) if token not in _STOP_WORDS}


def _job_text(job: Mapping[str, Any]) -> str:
    values = [job.get("title", ""), job.get("location", ""), job.get("description", "")]
    values.extend(job.get("skills", []))
    return " ".join(str(value) for value in values)


def lifecycle_match(job: Mapping[str, Any]) -> bool:
    return (
        bool(job.get("is_active"))
        and not bool(job.get("is_deleted"))
        and bool(job.get("company_is_active"))
        and not bool(job.get("company_is_deleted"))
    )


def hard_filter_match(
    job: Mapping[str, Any], query: Mapping[str, Any], *, include_lifecycle: bool = True
) -> bool:
    """Mirror translate_filters: equality, OR lists, all/any skills, and salary bounds."""
    if include_lifecycle and not lifecycle_match(job):
        return False
    state = query.get("filter_state", {})
    explicit = query.get("explicit_filters", {})
    if state.get("company") is not None and job.get("company_name") != state["company"]:
        return False
    if state.get("location") is not None and job.get("location") != state["location"]:
        return False
    if state.get("level") is not None and job.get("level") != state["level"]:
        return False
    if explicit.get("locations") and job.get("location") not in explicit["locations"]:
        return False
    if explicit.get("levels") and job.get("level") not in explicit["levels"]:
        return False
    if explicit.get("company_ids") and job.get("company_id") not in {
        str(x) for x in explicit["company_ids"]
    }:
        return False
    skills = set(job.get("skills", []))
    required = list(dict.fromkeys([*state.get("skills", []), *explicit.get("skills_all", [])]))
    if any(skill not in skills for skill in required):
        return False
    if explicit.get("skills_any") and not any(
        skill in skills for skill in dict.fromkeys(explicit["skills_any"])
    ):
        return False
    lower = explicit.get("salary_gte", state.get("salary_min"))
    upper = explicit.get("salary_lte", state.get("salary_max"))
    salary = job.get("salary")
    return (
        isinstance(salary, (int, float))
        and (lower is None or salary >= lower)
        and (upper is None or salary <= upper)
    )


def filter_only_rank(jobs: Sequence[Mapping[str, Any]], query: Mapping[str, Any]) -> list[str]:
    """Return matching canonical IDs in fixture order (the stable non-semantic baseline)."""
    return [str(job["job_id"]) for job in jobs if hard_filter_match(job, query)]


def lexical_overlap_rank(jobs: Sequence[Mapping[str, Any]], query: Mapping[str, Any]) -> list[str]:
    """Rank by normalized token overlap; lifecycle is intentionally not filtered."""
    query_tokens = _tokens(str(query["text"]))
    scored = [
        (len(query_tokens & _tokens(_job_text(job))), index, str(job["job_id"]))
        for index, job in enumerate(jobs)
    ]
    return [job_id for _, _, job_id in sorted(scored, key=lambda item: (-item[0], item[1]))]


def lexical_hard_filter_rank(
    jobs: Sequence[Mapping[str, Any]], query: Mapping[str, Any]
) -> list[str]:
    candidates = [job for job in jobs if hard_filter_match(job, query)]
    return lexical_overlap_rank(candidates, query)


def recall_at_k(ranked_ids: Sequence[str], relevant_ids: set[str], k: int) -> float:
    if not relevant_ids:
        return 1.0
    return len(set(ranked_ids[:k]) & relevant_ids) / len(relevant_ids)


def reciprocal_rank(ranked_ids: Sequence[str], relevant_ids: set[str]) -> float:
    if not relevant_ids:
        return 1.0
    for rank, job_id in enumerate(ranked_ids, 1):
        if job_id in relevant_ids:
            return 1.0 / rank
    return 0.0


def ndcg_at_k(ranked_ids: Sequence[str], graded_relevance: Mapping[str, Any], k: int) -> float:
    gains = [float(graded_relevance.get(job_id, 0)) for job_id in ranked_ids[:k]]
    ideal = sorted((float(value) for value in graded_relevance.values()), reverse=True)[:k]
    if not ideal or not any(ideal):
        return 1.0
    dcg = sum(gain / math.log2(rank + 1) for rank, gain in enumerate(gains, 1))
    idcg = sum(gain / math.log2(rank + 1) for rank, gain in enumerate(ideal, 1))
    return dcg / idcg if idcg else 1.0


def duplicate_rate(ranked_ids: Sequence[str]) -> float:
    return (len(ranked_ids) - len(set(ranked_ids))) / len(ranked_ids) if ranked_ids else 0.0


def _metric_row(
    ranked: Sequence[str], query: Mapping[str, Any], by_id: Mapping[str, Mapping[str, Any]], k: int
) -> dict[str, float]:
    relevant = set(query["relevant_job_ids"])
    top = list(ranked[:k])
    structured_violations = sum(
        not hard_filter_match(by_id[job_id], query, include_lifecycle=False)
        for job_id in top
        if job_id in by_id
    )
    lifecycle_violations = sum(
        not lifecycle_match(by_id[job_id]) for job_id in top if job_id in by_id
    )
    denominator = len(top)
    return {
        f"recall_at_{k}": recall_at_k(ranked, relevant, k),
        f"ndcg_at_{k}": ndcg_at_k(ranked, query["graded_relevance"], k),
        "mrr": reciprocal_rank(ranked, relevant),
        "filter_violation_count": float(structured_violations),
        "filter_violation_rate": structured_violations / denominator if denominator else 0.0,
        "lifecycle_exclusion_violations": float(lifecycle_violations),
        "duplicate_rate": duplicate_rate(top),
    }


def evaluate_baselines(dataset: Mapping[str, Any] | str | Path) -> dict[str, Any]:
    if not isinstance(dataset, Mapping):
        dataset = load_dataset(dataset)
    validate_dataset(dataset)
    jobs = dataset["jobs"]
    queries = dataset["queries"]
    by_id = {str(job["job_id"]): job for job in jobs}
    rankers = {
        "filter_only": filter_only_rank,
        "lexical_overlap": lexical_overlap_rank,
        "lexical_hard_filters": lexical_hard_filter_rank,
    }
    report: dict[str, Any] = {"schema_version": SCHEMA_VERSION, "baselines": {}}
    for name, ranker in rankers.items():
        rows: list[dict[str, float]] = []
        grouped: dict[str, list[dict[str, float]]] = defaultdict(list)
        query_metrics: dict[str, dict[str, float]] = {}
        for query in queries:
            ranked = ranker(jobs, query)
            cutoffs = query["evaluate_at"]
            metrics: dict[str, float] = {}
            for k in cutoffs:
                metrics.update(_metric_row(ranked, query, by_id, k))
            query_metrics[query["query_id"]] = metrics
            rows.append(metrics)
            grouped[f"locale:{query['locale']}"].append(metrics)
            grouped[
                "filter:structured"
                if query.get("filter_state") or query.get("explicit_filters")
                else "filter:none"
            ].append(metrics)
        report["baselines"][name] = {
            "macro": _macro(rows),
            "subgroups": {key: _macro(value) for key, value in sorted(grouped.items())},
            "query_metrics": query_metrics,
        }
    return report


def _macro(rows: Sequence[Mapping[str, float]]) -> dict[str, float]:
    if not rows:
        return {}
    keys = sorted({key for row in rows for key in row})
    return {key: sum(row.get(key, 0.0) for row in rows) / len(rows) for key in keys}


def generate_baseline_report(
    dataset: Mapping[str, Any] | str | Path = DEFAULT_DATASET_PATH,
) -> dict[str, Any]:
    """Generate a reproducible report; no provider, network, or runtime data is touched."""
    return evaluate_baselines(dataset)
