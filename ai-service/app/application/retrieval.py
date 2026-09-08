from __future__ import annotations

from collections.abc import Mapping
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


def translate_filters(state: StructuredFilterState, explicit: ExplicitFilters) -> dict[str, object]:
    """Build a Qdrant-compatible filter from structured, allowlisted constraints."""
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
    return {"must": must, "must_not": [], "should": []}


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


class RetrievalService:
    def __init__(self, embedding: EmbeddingProvider, vector_store: VectorRetriever) -> None:
        self._embedding = embedding
        self._vector_store = vector_store

    def retrieve(self, request: RagRetrieveRequest) -> RagRetrieveResponse:
        if request.policy.data_scope != "PUBLIC_ACTIVE_JOBS":
            raise ServiceError("invalid_policy", "Only public active jobs are supported.", 422)
        query_filter = translate_filters(request.filter_state, request.explicit_filters)
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
            if not _passes_lifecycle(metadata):
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
