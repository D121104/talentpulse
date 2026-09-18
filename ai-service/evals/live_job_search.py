"""Opt-in live retrieval evaluation against local Ollama and Qdrant.

The runner deliberately keeps the live provider boundary separate from the offline
fixture/evaluator.  It only creates a uniquely named temporary Qdrant collection and
uses the production normalization/indexing/filter contracts for that collection.
"""

from __future__ import annotations

import argparse
import hashlib
import ipaddress
import json
import math
import re
import sys
import time
from collections import defaultdict
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, cast
from urllib.parse import urlparse
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

from app.application.indexing import (
    NORMALIZATION_VERSION,
    JobIndexingService,
    build_job_document,
    compute_content_hash,
    normalize_job_text,
)
from app.application.retrieval import (
    FILTERABLE_PAYLOAD_SCHEMA,
    REPRESENTATION_MARKER_FIELD,
    REPRESENTATION_MARKER_VALUE,
    translate_filters,
)
from app.domain.indexing import CanonicalJobSnapshot, IndexIdentity, IndexJobUpsertRequest
from app.domain.rag import ExplicitFilters, RetrievedChunk, StructuredFilterState
from app.infrastructure.rag_providers import (
    OllamaEmbeddingAdapter,
    QdrantVectorRetriever,
)
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PayloadSchemaType, VectorParams

from .job_search import (
    DEFAULT_DATASET_PATH,
    SCHEMA_VERSION,
    hard_filter_match,
    lifecycle_match,
    load_dataset,
    ndcg_at_k,
    recall_at_k,
    reciprocal_rank,
    validate_dataset,
)

LIVE_SCHEMA_VERSION = "job-search-live-eval-v1"
PIPELINE_VERSION = "live-retrieval-pipeline-v1"
REQUIRED_OLLAMA_MODEL = "qwen3-embedding:0.6b"
REQUIRED_DIMENSIONS = 1_024
CURRENT_INDEX_VERSION = "local-ollama-v1"
RETRIEVAL_LIMIT = 20
EVALUATION_CUTOFFS = (1, 3, 5)
DEFAULT_OLLAMA_URL = "http://127.0.0.1:11435"
DEFAULT_QDRANT_URL = "http://127.0.0.1:6333"
DEFAULT_TIMEOUT_SECONDS = 120.0
TEMP_COLLECTION_PREFIX = "tp_eval_qwen3_embedding_v1_"
_TEMP_COLLECTION_RE = re.compile(rf"{re.escape(TEMP_COLLECTION_PREFIX)}[0-9a-f]{{32}}\Z")
_PROTECTED_COLLECTION_MARKERS = (
    "jobs_current",
    "jobs_ollama",
    "jobs_cohere",
    "production",
    "prod_",
    "primary",
)
_EVALUATION_NAMESPACE = UUID("f0d8f6ef-0cf7-4b33-ae19-4e1f42d6f54b")


@dataclass(frozen=True, slots=True)
class LiveEvaluationConfig:
    """Validated, local-only configuration for one live evaluation run."""

    dataset_path: Path = DEFAULT_DATASET_PATH
    ollama_url: str = DEFAULT_OLLAMA_URL
    qdrant_url: str = DEFAULT_QDRANT_URL
    model: str = REQUIRED_OLLAMA_MODEL
    dimensions: int = REQUIRED_DIMENSIONS
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS
    index_version: str = CURRENT_INDEX_VERSION
    allow_non_loopback: bool = False
    keep_collection: bool = False
    output: Path | None = None

    def validate(self) -> LiveEvaluationConfig:
        if self.model != REQUIRED_OLLAMA_MODEL:
            raise ValueError(f"live evaluation requires model {REQUIRED_OLLAMA_MODEL!r}")
        if self.dimensions != REQUIRED_DIMENSIONS:
            raise ValueError("live evaluation requires 1024-dimensional embeddings")
        if self.index_version != CURRENT_INDEX_VERSION:
            raise ValueError(f"live evaluation requires index version {CURRENT_INDEX_VERSION!r}")
        if not math.isfinite(self.timeout_seconds) or not 0 < self.timeout_seconds <= 120:
            raise ValueError("timeout_seconds must be greater than 0 and at most 120")
        validate_service_url(
            self.ollama_url,
            "Ollama URL",
            allow_non_loopback=self.allow_non_loopback,
        )
        validate_service_url(
            self.qdrant_url,
            "Qdrant URL",
            allow_non_loopback=self.allow_non_loopback,
        )
        if not isinstance(self.dataset_path, Path):
            raise ValueError("dataset_path must be a pathlib.Path")
        if self.output is not None and not isinstance(self.output, Path):
            raise ValueError("output must be a pathlib.Path")
        return self


def validate_service_url(url: str, label: str, *, allow_non_loopback: bool = False) -> None:
    """Reject unsafe provider URLs before constructing a client.

    Hostname allowlisting is intentional: resolving arbitrary hostnames would make a
    validation check perform network I/O and could still permit DNS rebinding.
    """

    if not isinstance(url, str) or not url.strip():
        raise ValueError(f"{label} is required")
    parsed = urlparse(url.strip())
    if parsed.scheme.casefold() not in {"http", "https"} or not parsed.hostname:
        raise ValueError(f"{label} must be an HTTP(S) URL")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError(f"{label} must not contain credentials")
    if parsed.query or parsed.fragment:
        raise ValueError(f"{label} must not contain a query or fragment")
    try:
        port = parsed.port
    except ValueError as exc:
        raise ValueError(f"{label} has an invalid port") from exc
    if port is not None and not 1 <= port <= 65_535:
        raise ValueError(f"{label} has an invalid port")
    if allow_non_loopback:
        return
    hostname = parsed.hostname.casefold().rstrip(".")
    if hostname == "localhost":
        return
    try:
        is_loopback = ipaddress.ip_address(hostname).is_loopback
    except ValueError:
        is_loopback = False
    if not is_loopback:
        raise ValueError(f"{label} must use a loopback host by default")


def generate_temporary_collection_name() -> str:
    """Generate a collection name that cannot be confused with a product index."""

    name = f"{TEMP_COLLECTION_PREFIX}{uuid4().hex}"
    assert_temporary_collection_name(name)
    return name


def assert_temporary_collection_name(name: str) -> None:
    """Guard every collection operation against primary/production-like names."""

    if not isinstance(name, str) or not _TEMP_COLLECTION_RE.fullmatch(name):
        raise ValueError("collection name is not a generated live-evaluation collection")
    normalized = name.casefold()
    if any(marker in normalized for marker in _PROTECTED_COLLECTION_MARKERS):
        raise ValueError("collection name is protected")


def lifecycle_only_filter() -> dict[str, object]:
    """Return the production lifecycle/marker filter without business constraints."""

    return {
        "must": [
            {"key": "is_active", "match": {"value": True}},
            {"key": "is_deleted", "match": {"value": False}},
            {"key": "company_is_active", "match": {"value": True}},
            {"key": "company_is_deleted", "match": {"value": False}},
        ],
        "must_not": [
            {"key": REPRESENTATION_MARKER_FIELD, "match": {"value": REPRESENTATION_MARKER_VALUE}}
        ],
        "should": [],
    }


def _percentile(values: Sequence[float], quantile: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(float(value) for value in values)
    position = (len(ordered) - 1) * quantile
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    fraction = position - lower
    return ordered[lower] + (ordered[upper] - ordered[lower]) * fraction


def _macro(rows: Sequence[Mapping[str, float]]) -> dict[str, float]:
    if not rows:
        return {}
    keys = sorted({key for row in rows for key in row})
    return {key: sum(row.get(key, 0.0) for row in rows) / len(rows) for key in keys}


def _query_has_structured_filters(query: Mapping[str, Any]) -> bool:
    return bool(query.get("filter_state")) or bool(query.get("explicit_filters"))


def _metric_row(
    ranked: Sequence[str],
    query: Mapping[str, Any],
    by_id: Mapping[str, Mapping[str, Any]],
    k: int,
) -> dict[str, float]:
    relevant = {str(item) for item in query["relevant_job_ids"]}
    top = list(ranked[:k])
    known_top = [job_id for job_id in top if job_id in by_id]
    filter_violations = sum(
        not hard_filter_match(by_id[job_id], query, include_lifecycle=False) for job_id in known_top
    )
    lifecycle_violations = sum(not lifecycle_match(by_id[job_id]) for job_id in known_top)
    duplicate_count = len(top) - len(set(top))
    denominator = len(top)
    return {
        f"recall_at_{k}": recall_at_k(ranked, relevant, k),
        f"ndcg_at_{k}": ndcg_at_k(ranked, query["graded_relevance"], k),
        "mrr": reciprocal_rank(ranked, relevant),
        f"filter_violation_count_at_{k}": float(filter_violations),
        f"filter_violation_rate_at_{k}": filter_violations / denominator if denominator else 0.0,
        f"lifecycle_exclusion_violations_at_{k}": float(lifecycle_violations),
        f"lifecycle_violation_rate_at_{k}": lifecycle_violations / denominator
        if denominator
        else 0.0,
        f"duplicate_count_at_{k}": float(duplicate_count),
        f"duplicate_rate_at_{k}": duplicate_count / denominator if denominator else 0.0,
    }


def _latency_report(latencies: Mapping[str, Sequence[float]]) -> dict[str, dict[str, float]]:
    return {
        stage: {
            "p50_ms": _percentile(values, 0.50),
            "p95_ms": _percentile(values, 0.95),
            "sample_count": float(len(values)),
        }
        for stage, values in sorted(latencies.items())
    }


def aggregate_pipeline_metrics(
    dataset: Mapping[str, Any],
    rankings: Mapping[str, Sequence[str]],
    *,
    latencies: Mapping[str, Mapping[str, float]] | None = None,
    failures: Sequence[Mapping[str, object]] = (),
) -> dict[str, Any]:
    """Aggregate deterministic retrieval metrics from fixture labels and ranked IDs.

    This function never inspects provider/model output other than the returned canonical
    IDs. Labels are read only from the checked-in evaluation dataset.
    """

    validate_dataset(dataset)
    jobs = cast(list[Mapping[str, Any]], dataset["jobs"])
    queries = cast(list[Mapping[str, Any]], dataset["queries"])
    by_id = {str(job["job_id"]): job for job in jobs}
    rows: list[dict[str, float]] = []
    grouped: dict[str, list[dict[str, float]]] = defaultdict(list)
    query_metrics: dict[str, dict[str, float]] = {}
    for query in queries:
        query_id = str(query["query_id"])
        ranked = list(rankings.get(query_id, ()))
        metrics: dict[str, float] = {"result_count": float(len(ranked))}
        for cutoff in EVALUATION_CUTOFFS:
            metrics.update(_metric_row(ranked, query, by_id, cutoff))
        query_metrics[query_id] = metrics
        rows.append(metrics)
        grouped[f"locale:{query['locale']}"].append(metrics)
        grouped[
            "filter:structured" if _query_has_structured_filters(query) else "filter:none"
        ].append(metrics)

    macro = _macro(rows)
    # Keep the offline evaluator's unsuffixed violation names while also preserving every
    # requested cutoff for the live report.
    for key in (
        "filter_violation_count",
        "filter_violation_rate",
        "lifecycle_exclusion_violations",
        "duplicate_count",
        "duplicate_rate",
    ):
        macro[key] = macro.get(f"{key}_at_5", 0.0)
    failure_rows = [dict(failure) for failure in failures]
    latency_values: dict[str, list[float]] = defaultdict(list)
    for values in (latencies or {}).values():
        for stage, value in values.items():
            latency_values[stage].append(float(value))
    return {
        "macro": macro,
        "subgroups": {key: _macro(value) for key, value in sorted(grouped.items())},
        "query_metrics": query_metrics,
        "latency_ms": _latency_report(latency_values),
        "violations": {
            "filter": {
                "count_at_1": macro.get("filter_violation_count_at_1", 0.0),
                "count_at_3": macro.get("filter_violation_count_at_3", 0.0),
                "count_at_5": macro.get("filter_violation_count_at_5", 0.0),
            },
            "lifecycle": {
                "count_at_1": macro.get("lifecycle_exclusion_violations_at_1", 0.0),
                "count_at_3": macro.get("lifecycle_exclusion_violations_at_3", 0.0),
                "count_at_5": macro.get("lifecycle_exclusion_violations_at_5", 0.0),
            },
            "duplicate": {
                "count_at_1": macro.get("duplicate_count_at_1", 0.0),
                "count_at_3": macro.get("duplicate_count_at_3", 0.0),
                "count_at_5": macro.get("duplicate_count_at_5", 0.0),
            },
        },
        "failure_count": len(failure_rows),
        "failed_query_ids": [
            str(failure["item_id"])
            for failure in failure_rows
            if failure.get("stage") in {"embed_query", "qdrant_search"}
            and isinstance(failure.get("item_id"), str)
        ],
        "failures": failure_rows,
    }


def _safe_failure(stage: str, item_id: str | None = None) -> dict[str, object]:
    failure: dict[str, object] = {"stage": stage, "code": "operation_failed"}
    if item_id is not None:
        failure["item_id"] = item_id
    return failure


def _normalized_optional(value: object) -> str | None:
    if value is None:
        return None
    normalized = normalize_job_text(str(value))
    return normalized or None


def _fixture_company_id(company_name: str) -> UUID:
    return uuid5(NAMESPACE_URL, f"talentpulse-live-eval:company:{company_name}")


def fixture_job_snapshot(job: Mapping[str, Any]) -> CanonicalJobSnapshot:
    """Adapt the offline fixture to the strict production snapshot contract."""

    raw_skills = job.get("skills", [])
    skills = (
        sorted(
            normalized
            for normalized in (normalize_job_text(str(item)) for item in raw_skills)
            if normalized
        )
        if isinstance(raw_skills, list)
        else []
    )
    payload: dict[str, object] = {
        "job_id": str(job["job_id"]),
        "title": normalize_job_text(str(job.get("title", ""))),
        "description": normalize_job_text(str(job.get("description", ""))),
        "skills": skills,
        "company_id": str(_fixture_company_id(str(job.get("company_name", "")))),
        "company_name": normalize_job_text(str(job.get("company_name", ""))),
        "location": _normalized_optional(job.get("location")),
        "level": _normalized_optional(job.get("level")),
        "work_mode": _normalized_optional(job.get("work_mode")),
        "employment_type": _normalized_optional(job.get("employment_type")),
        "salary": job.get("salary"),
        "salary_currency": _normalized_optional(job.get("salary_currency")),
        "start_date": None,
        "end_date": None,
        "is_active": bool(job.get("is_active")),
        "is_deleted": bool(job.get("is_deleted")),
        "company_is_active": bool(job.get("company_is_active")),
        "company_is_deleted": bool(job.get("company_is_deleted")),
    }
    return CanonicalJobSnapshot.model_validate(payload)


def _fixture_source_version(snapshot: CanonicalJobSnapshot) -> str:
    encoded = json.dumps(snapshot.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _identity(job_id: UUID) -> IndexIdentity:
    return IndexIdentity(
        request_id=uuid5(_EVALUATION_NAMESPACE, f"request:{job_id}"),
        trace_id=uuid5(_EVALUATION_NAMESPACE, f"trace:{job_id}"),
        operation_attempt_id=uuid5(_EVALUATION_NAMESPACE, f"attempt:{job_id}"),
    )


def _read_count(value: object) -> int:
    raw = value.get("count") if isinstance(value, Mapping) else getattr(value, "count", None)
    if not isinstance(raw, int) or isinstance(raw, bool) or raw < 0:
        raise RuntimeError("Qdrant point count could not be verified")
    return raw


def _create_collection(client: object, collection_name: str, dimensions: int) -> None:
    assert_temporary_collection_name(collection_name)
    cast(Any, client).create_collection(
        collection_name=collection_name,
        vectors_config=VectorParams(size=dimensions, distance=Distance.COSINE),
    )
    for field_name, field_type in FILTERABLE_PAYLOAD_SCHEMA.items():
        cast(Any, client).create_payload_index(
            collection_name=collection_name,
            field_name=field_name,
            field_schema=PayloadSchemaType(field_type),
            wait=True,
        )


def _index_fixture_jobs(
    client: object,
    collection_name: str,
    embedding: object,
    jobs: Sequence[Mapping[str, Any]],
    config: LiveEvaluationConfig,
) -> QdrantVectorRetriever:
    assert_temporary_collection_name(collection_name)
    vector = QdrantVectorRetriever(
        client,
        collection_name,
        collection_alias=collection_name,
        index_version=config.index_version,
        dimensions=config.dimensions,
    )
    indexer = JobIndexingService(cast(Any, embedding), vector)
    indexed_jobs = 0
    for job in jobs:
        snapshot = fixture_job_snapshot(job)
        document = build_job_document(snapshot)
        request = IndexJobUpsertRequest(
            identity=_identity(snapshot.job_id),
            job=snapshot,
            idempotency_key=f"live-eval-v1:{snapshot.job_id}",
            source_version=_fixture_source_version(snapshot),
            representation_version=config.index_version,
            content_hash=compute_content_hash(document),
        )
        response = indexer.upsert(request)
        if response.status == "INDEXED":
            indexed_jobs += 1
    point_count = _read_count(cast(Any, client).count(collection_name=collection_name, exact=True))
    if point_count != indexed_jobs:
        raise RuntimeError(
            "temporary collection point count does not match indexed fixture cardinality"
        )
    return vector


def _warm_embedding(embedding: object, dimensions: int) -> float:
    started = time.perf_counter()
    vector = cast(Any, embedding).embed_query("talentpulse live retrieval evaluation warmup")
    if not isinstance(vector, list) or len(vector) != dimensions:
        raise RuntimeError("embedding warmup returned an invalid vector")
    if not all(isinstance(item, (int, float)) and not isinstance(item, bool) for item in vector):
        raise RuntimeError("embedding warmup returned an invalid vector")
    return (time.perf_counter() - started) * 1_000


def _chunk_is_safe(chunk: RetrievedChunk, index_version: str) -> bool:
    metadata = chunk.metadata
    return (
        metadata.get("index_version") == index_version
        and metadata.get("is_active", "").casefold() in {"true", "1", "yes"}
        and metadata.get("is_deleted", "").casefold() in {"false", "0", "no"}
        and metadata.get("company_is_active", "").casefold() in {"true", "1", "yes"}
        and metadata.get("company_is_deleted", "").casefold() in {"false", "0", "no"}
    )


def _query_filter(query: Mapping[str, Any], *, hard_filters: bool) -> dict[str, object]:
    if not hard_filters:
        return lifecycle_only_filter()
    state = StructuredFilterState.model_validate(query.get("filter_state", {}))
    explicit = ExplicitFilters.model_validate(query.get("explicit_filters", {}))
    return translate_filters(state, explicit)


def _evaluate_dense(
    retriever: QdrantVectorRetriever,
    embedding: object,
    queries: Sequence[Mapping[str, Any]],
    config: LiveEvaluationConfig,
    *,
    hard_filters: bool,
) -> tuple[dict[str, list[str]], dict[str, dict[str, float]], list[dict[str, object]]]:
    rankings: dict[str, list[str]] = {}
    latencies: dict[str, dict[str, float]] = {}
    failures: list[dict[str, object]] = []
    for query in queries:
        query_id = str(query["query_id"])
        started_total = time.perf_counter()
        embedding_ms = 0.0
        search_ms = 0.0
        try:
            started = time.perf_counter()
            vector = cast(Any, embedding).embed_query(str(query["text"]))
            embedding_ms = (time.perf_counter() - started) * 1_000
            started = time.perf_counter()
            chunks = retriever.search(
                vector, _query_filter(query, hard_filters=hard_filters), RETRIEVAL_LIMIT
            )
            search_ms = (time.perf_counter() - started) * 1_000
            rankings[query_id] = [
                str(chunk.job_id) for chunk in chunks if _chunk_is_safe(chunk, config.index_version)
            ]
        except Exception:
            rankings[query_id] = []
            failures.append(
                _safe_failure("qdrant_search" if embedding_ms else "embed_query", query_id)
            )
        latencies[query_id] = {
            "embedding": embedding_ms,
            "search": search_ms,
            "total": (time.perf_counter() - started_total) * 1_000,
        }
    return rankings, latencies, failures


def _evaluate_lexical(
    jobs: Sequence[Mapping[str, Any]],
    queries: Sequence[Mapping[str, Any]],
    *,
    hard_filters: bool,
) -> tuple[dict[str, list[str]], dict[str, dict[str, float]]]:
    from .job_search import lexical_hard_filter_rank, lexical_overlap_rank

    ranker = lexical_hard_filter_rank if hard_filters else lexical_overlap_rank
    rankings: dict[str, list[str]] = {}
    latencies: dict[str, dict[str, float]] = {}
    for query in queries:
        started = time.perf_counter()
        ranked = ranker(jobs, query)
        elapsed = (time.perf_counter() - started) * 1_000
        query_id = str(query["query_id"])
        rankings[query_id] = list(ranked)
        latencies[query_id] = {"embedding": 0.0, "search": elapsed, "total": elapsed}
    return rankings, latencies


def _pipeline_report(
    dataset: Mapping[str, Any],
    rankings: Mapping[str, Sequence[str]],
    *,
    latencies: Mapping[str, Mapping[str, float]] | None = None,
    failures: Sequence[Mapping[str, object]] = (),
) -> dict[str, Any]:
    report = aggregate_pipeline_metrics(
        dataset,
        rankings,
        latencies=latencies,
        failures=failures,
    )
    report["pipeline_version"] = PIPELINE_VERSION
    report["retrieval_limit"] = RETRIEVAL_LIMIT
    return report


def _new_report(config: LiveEvaluationConfig, collection_name: str) -> dict[str, Any]:
    return {
        "schema_version": LIVE_SCHEMA_VERSION,
        "status": "running",
        "versions": {
            "dataset": SCHEMA_VERSION,
            "model": config.model,
            "index": config.index_version,
            "normalization": NORMALIZATION_VERSION,
            "pipeline": PIPELINE_VERSION,
        },
        "dataset": {
            "schema_version": SCHEMA_VERSION,
            "path": str(config.dataset_path),
            "job_count": 0,
            "query_count": 0,
        },
        "model": {
            "provider": "ollama",
            "name": config.model,
            "dimensions": config.dimensions,
            "warmup_latency_ms": 0.0,
        },
        "index": {
            "collection_name": collection_name,
            "index_version": config.index_version,
            "representation_version": config.index_version,
            "normalization_version": NORMALIZATION_VERSION,
            "dimensions": config.dimensions,
            "distance": "Cosine",
            "point_count": 0,
        },
        "pipelines": {},
        "collection_name": collection_name,
        "failures": [],
        "cleanup": {
            "requested": not config.keep_collection,
            "performed": False,
            "verified_deleted": False,
        },
    }


def run_live_evaluation(
    config: LiveEvaluationConfig,
    *,
    dataset: Mapping[str, Any] | None = None,
    qdrant_client: object | None = None,
    embedding: object | None = None,
    collection_name: str | None = None,
    qdrant_factory: Callable[[LiveEvaluationConfig], object] | None = None,
) -> dict[str, Any]:
    """Run all offline baselines and dense Qwen pipelines on one temporary index."""

    config.validate()
    active_collection = collection_name or generate_temporary_collection_name()
    assert_temporary_collection_name(active_collection)
    report = _new_report(config, active_collection)
    client = qdrant_client
    collection_created = False
    try:
        active_dataset = load_dataset(config.dataset_path) if dataset is None else dict(dataset)
        validate_dataset(active_dataset)
        jobs = cast(list[Mapping[str, Any]], active_dataset["jobs"])
        queries = cast(list[Mapping[str, Any]], active_dataset["queries"])
        report["dataset"].update({"job_count": len(jobs), "query_count": len(queries)})

        active_embedding = embedding or OllamaEmbeddingAdapter(
            config.ollama_url,
            config.model,
            config.dimensions,
            config.timeout_seconds,
        )
        warmup_ms = _warm_embedding(active_embedding, config.dimensions)
        report["model"]["warmup_latency_ms"] = warmup_ms
        if client is None:
            factory = qdrant_factory or _default_qdrant_factory
            client = factory(config)
        _create_collection(client, active_collection, config.dimensions)
        collection_created = True
        retriever = _index_fixture_jobs(client, active_collection, active_embedding, jobs, config)
        point_count = _read_count(
            cast(Any, client).count(collection_name=active_collection, exact=True)
        )
        report["index"]["point_count"] = point_count

        lexical_rankings, lexical_latency = _evaluate_lexical(jobs, queries, hard_filters=False)
        report["pipelines"]["lexical_overlap"] = _pipeline_report(
            active_dataset, lexical_rankings, latencies=lexical_latency
        )
        filtered_rankings, filtered_latency = _evaluate_lexical(jobs, queries, hard_filters=True)
        report["pipelines"]["lexical_hard_filters"] = _pipeline_report(
            active_dataset, filtered_rankings, latencies=filtered_latency
        )
        dense_rankings, dense_latency, dense_failures = _evaluate_dense(
            retriever, active_embedding, queries, config, hard_filters=False
        )
        report["pipelines"]["dense_qwen"] = _pipeline_report(
            active_dataset,
            dense_rankings,
            latencies=dense_latency,
            failures=dense_failures,
        )
        dense_filtered_rankings, dense_filtered_latency, dense_filtered_failures = _evaluate_dense(
            retriever, active_embedding, queries, config, hard_filters=True
        )
        report["pipelines"]["dense_qwen_hard_filters"] = _pipeline_report(
            active_dataset,
            dense_filtered_rankings,
            latencies=dense_filtered_latency,
            failures=dense_filtered_failures,
        )
        report["failures"].extend(dense_failures)
        report["failures"].extend(dense_filtered_failures)
    except Exception:
        report["failures"].append(_safe_failure("evaluation"))
    finally:
        if client is not None and collection_created and not config.keep_collection:
            try:
                assert_temporary_collection_name(active_collection)
                cast(Any, client).delete_collection(collection_name=active_collection)
                report["cleanup"]["performed"] = True
                collection_exists = getattr(client, "collection_exists", None)
                if callable(collection_exists):
                    report["cleanup"]["verified_deleted"] = not bool(
                        collection_exists(active_collection)
                    )
                else:
                    report["cleanup"]["verified_deleted"] = None
            except Exception:
                report["failures"].append(_safe_failure("cleanup"))
        elif config.keep_collection:
            report["cleanup"]["verified_deleted"] = None

    report["status"] = "completed" if not report["failures"] else "failed"
    return report


def _default_qdrant_factory(config: LiveEvaluationConfig) -> object:
    return QdrantClient(
        url=config.qdrant_url,
        timeout=int(config.timeout_seconds),
        check_compatibility=False,
    )


def parse_cli(argv: Sequence[str] | None = None) -> LiveEvaluationConfig:
    parser = argparse.ArgumentParser(
        description=(
            "Opt-in live Qwen embedding retrieval evaluation using temporary local Qdrant state."
        )
    )
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET_PATH)
    parser.add_argument("--ollama-url", default=DEFAULT_OLLAMA_URL)
    parser.add_argument("--qdrant-url", default=DEFAULT_QDRANT_URL)
    parser.add_argument("--model", default=REQUIRED_OLLAMA_MODEL)
    parser.add_argument("--dimensions", type=int, default=REQUIRED_DIMENSIONS)
    parser.add_argument("--timeout-seconds", type=float, default=DEFAULT_TIMEOUT_SECONDS)
    parser.add_argument(
        "--allow-non-loopback",
        action="store_true",
        help="Explicitly permit non-loopback provider URLs (unsafe; disabled by default).",
    )
    parser.add_argument(
        "--keep-collection",
        action="store_true",
        help="Keep the generated temporary collection instead of deleting it in finally.",
    )
    parser.add_argument("--output", type=Path, default=None, help="Optional JSON report path.")
    args = parser.parse_args(argv)
    return LiveEvaluationConfig(
        dataset_path=args.dataset,
        ollama_url=args.ollama_url,
        qdrant_url=args.qdrant_url,
        model=args.model,
        dimensions=args.dimensions,
        timeout_seconds=args.timeout_seconds,
        allow_non_loopback=args.allow_non_loopback,
        keep_collection=args.keep_collection,
        output=args.output,
    ).validate()


def _write_report(report: Mapping[str, Any], output: Path) -> None:
    output.write_text(json.dumps(report, sort_keys=True, indent=2) + "\n", encoding="utf-8")


def main(argv: Sequence[str] | None = None) -> int:
    try:
        config = parse_cli(argv)
    except ValueError as exc:
        print(
            json.dumps(
                {
                    "schema_version": LIVE_SCHEMA_VERSION,
                    "status": "failed",
                    "failures": [
                        {"stage": "configuration", "code": "invalid_config", "message": str(exc)}
                    ],
                },
                sort_keys=True,
                separators=(",", ":"),
            )
        )
        return 2
    report: dict[str, Any]
    try:
        report = run_live_evaluation(config)
    except Exception:
        report = {
            "schema_version": LIVE_SCHEMA_VERSION,
            "status": "failed",
            "failures": [_safe_failure("configuration_or_startup")],
        }
    if config.output is not None:
        try:
            _write_report(report, config.output)
        except OSError:
            report.setdefault("failures", []).append(_safe_failure("write_report"))
            report["status"] = "failed"
    print(json.dumps(report, sort_keys=True, separators=(",", ":")))
    return 0 if report.get("status") == "completed" else 1


if __name__ == "__main__":
    sys.exit(main())
