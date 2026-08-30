from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.adapters.fakes import FakeEmbeddingModel, InMemoryVectorStore
from app.application.index_job_service import IndexJobService
from app.application.indexing import (
    CHUNKING_VERSION,
    INDEX_SCHEMA_VERSION,
    NORMALIZATION_VERSION,
    normalize_text,
    normalized_job_metadata,
)
from app.core.errors import ServiceError
from app.ports import EmbeddingInputType
from app.schemas import CanonicalJobSnapshot, IndexJobResponse, IndexJobUpsertRequest

FIXTURE_PATH = Path(__file__).resolve().parents[1] / "fixtures" / "local_retrieval_gold.json"
REQUIRED_SCENARIOS = frozenset(
    {
        "exact-title",
        "adjacent-platform-role",
        "skills-acronym-bilingual",
        "location-salary-level",
        "no-result",
        "malicious-content-isolation",
    }
)


@dataclass(frozen=True, slots=True)
class GoldJob:
    name: str
    job: CanonicalJobSnapshot
    expected_eligible: bool

    @property
    def job_id(self) -> str:
        return str(self.job.job_id)


@dataclass(frozen=True, slots=True)
class GoldQuery:
    name: str
    text: str
    hard_constraints: dict[str, Any]
    expected_job_ids: tuple[str, ...]
    expected_filtered_job_ids: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class GoldFixture:
    evaluation_now: datetime
    jobs: tuple[GoldJob, ...]
    queries: tuple[GoldQuery, ...]


@dataclass(frozen=True, slots=True)
class RetrievalResult:
    job_ids: tuple[str, ...]
    raw_job_ids: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class ConsistencyReport:
    missing_job_ids: tuple[str, ...]
    orphan_job_ids: tuple[str, ...]
    stale_job_ids: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class EvaluationReport:
    query_count: int
    recall_at_10: float
    filter_correctness: float
    duplicate_job_cards: int
    raw_chunk_duplicate_matches: int
    lifecycle_leakage: int
    payload_safety_violations: int
    injection_safety_violations: int
    no_result_failures: int
    consistency_missing: int
    consistency_orphan: int
    consistency_stale: int
    query_result_ids: dict[str, tuple[str, ...]]

    def as_dict(self) -> dict[str, object]:
        """Return an aggregate-only report suitable for CI logs."""

        return {
            "query_count": self.query_count,
            "recall_at_10": self.recall_at_10,
            "filter_correctness": self.filter_correctness,
            "duplicate_job_cards": self.duplicate_job_cards,
            "raw_chunk_duplicate_matches": self.raw_chunk_duplicate_matches,
            "lifecycle_leakage": self.lifecycle_leakage,
            "payload_safety_violations": self.payload_safety_violations,
            "injection_safety_violations": self.injection_safety_violations,
            "no_result_failures": self.no_result_failures,
            "consistency_missing": self.consistency_missing,
            "consistency_orphan": self.consistency_orphan,
            "consistency_stale": self.consistency_stale,
            "query_result_ids": {
                name: list(job_ids) for name, job_ids in self.query_result_ids.items()
            },
        }


@dataclass(slots=True)
class LocalIndex:
    fixture: GoldFixture
    embedding: FakeEmbeddingModel
    store: InMemoryVectorStore
    indexer: IndexJobService
    responses: dict[str, IndexJobResponse]
    rejected_job_ids: tuple[str, ...]

    @property
    def indexed_job_ids(self) -> frozenset[str]:
        return frozenset(
            str(record.payload["job_id"])
            for record in self.store.records.values()
            if isinstance(record.payload.get("job_id"), str)
        )


def _parse_utc(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def load_gold_fixture(path: Path = FIXTURE_PATH) -> GoldFixture:
    """Load only synthetic, versioned test data; this never reads environment data."""

    raw = json.loads(path.read_text(encoding="utf-8"))
    jobs = tuple(
        GoldJob(
            name=item["name"],
            job=CanonicalJobSnapshot.model_validate(item["job"]),
            expected_eligible=item["expected_eligible"],
        )
        for item in raw["jobs"]
    )
    queries = tuple(
        GoldQuery(
            name=item["name"],
            text=item["text"],
            hard_constraints=dict(item["hard_constraints"]),
            expected_job_ids=tuple(item["expected_job_ids"]),
            expected_filtered_job_ids=tuple(item["expected_filtered_job_ids"]),
        )
        for item in raw["queries"]
    )
    return GoldFixture(_parse_utc(raw["evaluation_now"]), jobs, queries)


def make_upsert_request(
    job: CanonicalJobSnapshot, *, source_version: int, idempotency_key: str
) -> IndexJobUpsertRequest:
    return IndexJobUpsertRequest(
        job=job,
        source_version=source_version,
        idempotency_key=idempotency_key,
    )


def _is_eligible(job: CanonicalJobSnapshot, now: datetime) -> bool:
    if not job.is_active or job.is_deleted or job.deleted_at is not None:
        return False
    if not job.company_is_active or job.company_is_deleted or job.company_deleted_at is not None:
        return False
    if job.start_date is None or job.end_date is None or job.start_date >= job.end_date:
        return False
    return job.start_date <= now < job.end_date


def canonical_eligible_job_ids(fixture: GoldFixture) -> frozenset[str]:
    """Calculate the canonical active projection independently of vector search."""

    return frozenset(
        gold_job.job_id
        for gold_job in fixture.jobs
        if _is_eligible(gold_job.job, fixture.evaluation_now)
    )


def _normalized_constraint_values(value: object) -> set[str]:
    if not isinstance(value, list):
        return set()
    return {
        normalize_text(item) for item in value if isinstance(item, str) and normalize_text(item)
    }


def _matches_hard_constraints(job: CanonicalJobSnapshot, constraints: dict[str, Any]) -> bool:
    metadata = normalized_job_metadata(job)
    locations = _normalized_constraint_values(constraints.get("locations"))
    if locations and metadata["location"] not in locations:
        return False

    levels = _normalized_constraint_values(constraints.get("levels"))
    if levels and metadata["level"] not in levels:
        return False

    company_ids = {str(value) for value in constraints.get("company_ids", [])}
    if company_ids and metadata["company_id"] not in company_ids:
        return False

    skills = set(metadata["skills"])
    skills_any = _normalized_constraint_values(constraints.get("skills_any"))
    if skills_any and not skills.intersection(skills_any):
        return False

    skills_all = _normalized_constraint_values(constraints.get("skills_all"))
    if not skills_all.issubset(skills):
        return False

    salary = metadata["salary"]
    salary_gte = constraints.get("salary_gte")
    salary_lte = constraints.get("salary_lte")
    if salary_gte is not None and (salary is None or salary < salary_gte):
        return False
    if salary_lte is not None and (salary is None or salary > salary_lte):
        return False
    return True


def canonical_filtered_job_ids(fixture: GoldFixture, query: GoldQuery) -> tuple[str, ...]:
    eligible_ids = canonical_eligible_job_ids(fixture)
    return tuple(
        gold_job.job_id
        for gold_job in fixture.jobs
        if gold_job.job_id in eligible_ids
        and _matches_hard_constraints(gold_job.job, query.hard_constraints)
    )


async def build_local_index(fixture: GoldFixture | None = None) -> LocalIndex:
    fixture = fixture or load_gold_fixture()
    embedding = FakeEmbeddingModel(dimensions=4)
    store = InMemoryVectorStore(
        collection_name="jobs_fake_local_v1",
        dimensions=embedding.dimensions,
        embedding_model=embedding.model_name,
        collection_version="local-eval-v1",
    )
    indexer = IndexJobService(
        embedding,
        store,
        clock=lambda: fixture.evaluation_now,
        max_chunk_chars=300,
    )
    responses: dict[str, IndexJobResponse] = {}
    rejected: list[str] = []
    for gold_job in fixture.jobs:
        try:
            response = await indexer.upsert(
                make_upsert_request(
                    gold_job.job,
                    source_version=1,
                    idempotency_key=f"gold-backfill-{gold_job.name}",
                )
            )
        except ServiceError:
            if gold_job.expected_eligible:
                raise
            rejected.append(gold_job.job_id)
        else:
            if not gold_job.expected_eligible:
                raise AssertionError(f"ineligible fixture job was indexed: {gold_job.name}")
            responses[gold_job.job_id] = response
    return LocalIndex(fixture, embedding, store, indexer, responses, tuple(rejected))


def reconcile_local_index(index: LocalIndex) -> ConsistencyReport:
    canonical_ids = canonical_eligible_job_ids(index.fixture)
    indexed_ids = index.indexed_job_ids
    missing = canonical_ids - indexed_ids
    orphan = indexed_ids - canonical_ids
    stale: set[str] = set()

    for gold_job in index.fixture.jobs:
        if gold_job.job_id not in canonical_ids:
            continue
        response = index.responses.get(gold_job.job_id)
        records = [
            record
            for record in index.store.records.values()
            if record.payload.get("job_id") == gold_job.job_id
        ]
        if response is None or {record.point_id for record in records} != {
            str(point_id) for point_id in response.point_ids
        }:
            stale.add(gold_job.job_id)
            continue
        for record in records:
            if (
                record.payload.get("source_version") != response.source_version
                or record.payload.get("content_hash") != response.content_hash
                or record.payload.get("metadata_hash") != response.metadata_hash
                or record.payload.get("embedding_model_version") != response.embedding_model_version
                or record.payload.get("embedding_dimensions") != response.embedding_dimensions
                or record.payload.get("normalization_version") != NORMALIZATION_VERSION
                or record.payload.get("chunking_version") != CHUNKING_VERSION
                or record.payload.get("index_schema_version") != INDEX_SCHEMA_VERSION
            ):
                stale.add(gold_job.job_id)
                break

    return ConsistencyReport(tuple(sorted(missing)), tuple(sorted(orphan)), tuple(sorted(stale)))


async def _retrieve(index: LocalIndex, query: GoldQuery) -> RetrievalResult:
    query_text = normalize_text(query.text)
    embedding_response = await index.embedding.embed([query_text], EmbeddingInputType.QUERY)
    matches = await index.store.search(
        embedding_response.vectors[0],
        limit=max(1, len(index.store.records)),
    )
    allowed_ids = set(canonical_filtered_job_ids(index.fixture, query))
    filtered_matches = [match for match in matches if match.payload.get("job_id") in allowed_ids]

    raw_job_ids = tuple(
        str(match.payload["job_id"])
        for match in filtered_matches
        if isinstance(match.payload.get("job_id"), str)
    )
    unique_job_ids: list[str] = []
    seen: set[str] = set()
    for job_id in raw_job_ids:
        if job_id not in seen:
            seen.add(job_id)
            unique_job_ids.append(job_id)
    return RetrievalResult(tuple(unique_job_ids[:10]), raw_job_ids)


def _payload_safety_violations(index: LocalIndex) -> tuple[int, int]:
    forbidden_keys = {
        "description",
        "cv",
        "resume",
        "user",
        "user_id",
        "application",
        "application_id",
        "email",
        "phone",
        "address",
        "prompt",
        "response",
    }
    injection_markers = ("ignore previous instructions", "candidate@example.test")
    payload_violations = 0
    injection_violations = 0
    for record in index.store.records.values():
        if any(key.casefold() in forbidden_keys for key in record.payload):
            payload_violations += 1
        serialized = json.dumps(record.payload, ensure_ascii=False).casefold()
        if any(marker in serialized for marker in injection_markers):
            injection_violations += 1
    return payload_violations, injection_violations


async def run_local_evaluation(
    fixture: GoldFixture | None = None,
) -> EvaluationResult:
    fixture = fixture or load_gold_fixture()
    index = await build_local_index(fixture)
    results = {query.name: await _retrieve(index, query) for query in fixture.queries}
    consistency = reconcile_local_index(index)

    recalls: list[float] = []
    filter_correct = 0
    duplicate_job_cards = 0
    raw_chunk_duplicate_matches = 0
    lifecycle_leakage = 0
    no_result_failures = 0
    eligible_ids = canonical_eligible_job_ids(fixture)
    for query in fixture.queries:
        result = results[query.name]
        expected = set(query.expected_job_ids)
        returned = set(result.job_ids)
        recalls.append(len(expected.intersection(returned)) / len(expected) if expected else 1.0)
        if canonical_filtered_job_ids(fixture, query) == query.expected_filtered_job_ids:
            filter_correct += 1
        duplicate_job_cards += len(result.job_ids) - len(set(result.job_ids))
        raw_chunk_duplicate_matches += len(result.raw_job_ids) - len(set(result.raw_job_ids))
        lifecycle_leakage += sum(job_id not in eligible_ids for job_id in result.raw_job_ids)
        if (not expected) != (not returned):
            no_result_failures += 1

    payload_violations, injection_violations = _payload_safety_violations(index)
    report = EvaluationReport(
        query_count=len(fixture.queries),
        recall_at_10=sum(recalls) / len(recalls) if recalls else 1.0,
        filter_correctness=filter_correct / len(fixture.queries) if fixture.queries else 1.0,
        duplicate_job_cards=duplicate_job_cards,
        raw_chunk_duplicate_matches=raw_chunk_duplicate_matches,
        lifecycle_leakage=lifecycle_leakage,
        payload_safety_violations=payload_violations,
        injection_safety_violations=injection_violations,
        no_result_failures=no_result_failures,
        consistency_missing=len(consistency.missing_job_ids),
        consistency_orphan=len(consistency.orphan_job_ids),
        consistency_stale=len(consistency.stale_job_ids),
        query_result_ids={name: result.job_ids for name, result in results.items()},
    )
    return EvaluationResult(fixture, index, results, report)


@dataclass(frozen=True, slots=True)
class EvaluationResult:
    fixture: GoldFixture
    index: LocalIndex
    results: dict[str, RetrievalResult]
    report: EvaluationReport

    @property
    def store(self) -> InMemoryVectorStore:
        return self.index.store


__all__ = [
    "REQUIRED_SCENARIOS",
    "ConsistencyReport",
    "EvaluationReport",
    "GoldFixture",
    "GoldJob",
    "GoldQuery",
    "LocalIndex",
    "build_local_index",
    "canonical_eligible_job_ids",
    "canonical_filtered_job_ids",
    "load_gold_fixture",
    "make_upsert_request",
    "normalize_text",
    "reconcile_local_index",
    "run_local_evaluation",
]
