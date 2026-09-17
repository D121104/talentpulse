from __future__ import annotations

import re
from collections.abc import Callable, Mapping
from datetime import UTC, datetime
from typing import Final

from app.core.errors import ServiceError
from app.domain.rag import (
    EmbeddingProvider,
    ExplicitFilters,
    RagRetrieveRequest,
    RagRetrieveResponse,
    RetrievalItem,
    RetrievedChunk,
    StructuredFilterState,
    VectorRetriever,
)

MAX_CANDIDATES: Final = 20
REPRESENTATION_MARKER_FIELD: Final = "representation_marker"
REPRESENTATION_MARKER_VALUE: Final = "talentpulse-demo-representation-v1"
# This is deliberately derived from the fields used by translate_filters. It excludes
# descriptive/raw text and payload fields that are not hard-filtered by retrieval.
FILTERABLE_PAYLOAD_SCHEMA: Final[dict[str, str]] = {
    "company_name": "keyword",
    "location": "keyword",
    "level": "keyword",
    "company_id": "uuid",
    "skills": "keyword",
    "salary": "float",
    "is_active": "bool",
    "is_deleted": "bool",
    "company_is_active": "bool",
    "company_is_deleted": "bool",
    "start_date_epoch_ms": "integer",
    "end_date_epoch_ms": "integer",
    REPRESENTATION_MARKER_FIELD: "keyword",
}
ALLOWED_METADATA: Final = frozenset(
    {
        "job_id",
        "company_id",
        "title",
        "company_name",
        "location",
        "level",
        "work_mode",
        "employment_type",
        "salary",
        "salary_currency",
        "skills",
        "start_date",
        "end_date",
        "start_date_epoch_ms",
        "end_date_epoch_ms",
        "is_active",
        "is_deleted",
        "company_is_active",
        "company_is_deleted",
    }
)


def _match(key: str, value: object) -> dict[str, object]:
    return {"key": key, "match": {"value": value}}


def _any(key: str, values: list[object]) -> dict[str, object]:
    return {"should": [_match(key, value) for value in values], "min_should": 1}


def translate_filters(
    state: StructuredFilterState, explicit: ExplicitFilters, *, now_ms: int | None = None
) -> dict[str, object]:
    """Build a Qdrant-compatible filter from structured, allowlisted constraints."""
    if now_ms is None:
        now_ms = _utc_now_ms()
    if isinstance(now_ms, bool) or not isinstance(now_ms, int):
        raise ValueError("now_ms must be an integer")
    must: list[dict[str, object]] = [
        _match("is_active", True),
        _match("is_deleted", False),
        _match("company_is_active", True),
        _match("company_is_deleted", False),
    ]
    if state.company:
        must.append(_match("company_name", state.company))
    if state.location:
        must.append(_match("location", state.location))
    if state.level:
        must.append(_match("level", state.level))
    if explicit.company_ids:
        must.append(_any("company_id", [str(item) for item in explicit.company_ids]))
    if explicit.locations:
        must.append(_any("location", list(explicit.locations)))
    if explicit.levels:
        must.append(_any("level", list(explicit.levels)))

    skills_all = list(dict.fromkeys([*state.skills, *explicit.skills_all]))
    must.extend(_match("skills", skill) for skill in skills_all)
    if explicit.skills_any:
        must.append(_any("skills", list(dict.fromkeys(explicit.skills_any))))
    must.extend(
        [
            {"key": "start_date_epoch_ms", "range": {"lte": now_ms}},
            {"key": "end_date_epoch_ms", "range": {"gt": now_ms}},
        ]
    )

    salary_gte = explicit.salary_gte
    if salary_gte is None:
        salary_gte = state.salary_min
    salary_lte = explicit.salary_lte
    if salary_lte is None:
        salary_lte = state.salary_max
    if salary_gte is not None:
        must.append({"key": "salary", "range": {"gte": salary_gte}})
    if salary_lte is not None:
        must.append({"key": "salary", "range": {"lte": salary_lte}})
    return {
        "must": must,
        "must_not": [_match(REPRESENTATION_MARKER_FIELD, REPRESENTATION_MARKER_VALUE)],
        "should": [],
    }


def _safe_metadata(metadata: Mapping[str, object]) -> dict[str, str]:
    """Expose only retrieval metadata, never arbitrary Qdrant payload fields."""
    result: dict[str, str] = {}
    for key, value in metadata.items():
        if key in ALLOWED_METADATA and isinstance(value, (str, int, float, bool)):
            result[key] = str(value)
    return result


def _is_false(value: str | None) -> bool:
    return value is not None and value.casefold() in {"false", "0", "no"}


def _is_true(value: str | None) -> bool:
    return value is not None and value.casefold() in {"true", "1", "yes"}


def _passes_lifecycle(metadata: Mapping[str, str]) -> bool:
    """Keep the defense in depth when a fake/provider returns unfiltered points."""
    return (
        _is_true(metadata.get("is_active"))
        and _is_true(metadata.get("company_is_active"))
        and _is_false(metadata.get("is_deleted"))
        and _is_false(metadata.get("company_is_deleted"))
    )


_SAFE_EPOCH_RE = re.compile(r"^(?:0|-[1-9]\d*|[1-9]\d*)$")
_SAFE_EPOCH_MAX = 2**53 - 1


def _parse_epoch(value: str | None) -> int | None:
    if value is None or not _SAFE_EPOCH_RE.fullmatch(value):
        return None
    parsed = int(value)
    return parsed if -_SAFE_EPOCH_MAX <= parsed <= _SAFE_EPOCH_MAX else None


def _passes_date_window(metadata: Mapping[str, str], now_ms: int) -> bool:
    start = _parse_epoch(metadata.get("start_date_epoch_ms"))
    end = _parse_epoch(metadata.get("end_date_epoch_ms"))
    return start is not None and end is not None and start <= now_ms < end


class RetrievalService:
    def __init__(
        self,
        embedding: EmbeddingProvider,
        vector_store: VectorRetriever,
        *,
        clock: Callable[[], int] | None = None,
    ) -> None:
        self._embedding = embedding
        self._vector_store = vector_store
        self._clock = clock or _utc_now_ms

    def retrieve(self, request: RagRetrieveRequest) -> RagRetrieveResponse:
        if request.policy.data_scope != "PUBLIC_ACTIVE_JOBS":
            raise ServiceError("invalid_policy", "Only public active jobs are supported.", 422)
        now_ms = self._clock()
        if isinstance(now_ms, bool) or not isinstance(now_ms, int):
            raise ServiceError("invalid_clock", "Retrieval clock returned an invalid value.", 500)
        query_filter = translate_filters(
            request.filter_state, request.explicit_filters, now_ms=now_ms
        )
        try:
            vector = self._embedding.embed_query(request.normalized_user_message)
            chunks = self._vector_store.search(vector, query_filter, MAX_CANDIDATES)
        except Exception as exc:
            raise ServiceError(
                "retrieval_unavailable", "Job retrieval is temporarily unavailable.", 503
            ) from exc

        # Chunks are ranked by the vector store. Keeping the first occurrence retains the
        # strongest chunk while ensuring one result per canonical job.
        jobs: dict[object, RetrievedChunk] = {}
        for chunk in sorted(chunks, key=lambda item: item.score, reverse=True):
            if len(jobs) == MAX_CANDIDATES:
                break
            metadata = _safe_metadata(chunk.metadata)
            if not _passes_lifecycle(metadata) or not _passes_date_window(metadata, now_ms):
                continue
            jobs.setdefault(chunk.job_id, RetrievedChunk(chunk.job_id, chunk.score, metadata))

        results = [
            RetrievalItem(
                job_id=chunk.job_id, rank=rank, score=chunk.score, metadata=chunk.metadata
            )
            for rank, chunk in enumerate(jobs.values(), start=1)
        ]
        return RagRetrieveResponse(
            request_id=request.identity.request_id,
            trace_id=request.identity.trace_id,
            job_ids=[item.job_id for item in results],
            results=results,
            applied_filters=self._applied_filters(request),
        )

    @staticmethod
    def _applied_filters(request: RagRetrieveRequest) -> dict[str, str]:
        state = request.filter_state
        explicit = request.explicit_filters
        values = {"lifecycle": "active_non_deleted"}
        for key, value in (
            ("company", state.company),
            ("location", state.location),
            ("level", state.level),
        ):
            if value is not None:
                values[key] = value
        salary_gte = explicit.salary_gte if explicit.salary_gte is not None else state.salary_min
        salary_lte = explicit.salary_lte if explicit.salary_lte is not None else state.salary_max
        if salary_gte is not None:
            values["salary_gte"] = str(salary_gte)
        if salary_lte is not None:
            values["salary_lte"] = str(salary_lte)
        skills = list(dict.fromkeys([*state.skills, *explicit.skills_any, *explicit.skills_all]))
        if skills:
            values["skills"] = ",".join(skills)
        return values


def _utc_now_ms() -> int:
    current = datetime.now(UTC)
    epoch = datetime(1970, 1, 1, tzinfo=UTC)
    delta = current - epoch
    return delta.days * 86_400_000 + delta.seconds * 1_000 + delta.microseconds // 1_000
