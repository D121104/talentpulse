from __future__ import annotations

from collections.abc import Callable

from talentpulse_ai.core.exceptions import ServiceError
from talentpulse_ai.modules.rag_chatbot.retrieval.filters import (
    MAX_CANDIDATES,
    _utc_now_ms,
    translate_filters,
)
from talentpulse_ai.modules.rag_chatbot.retrieval.retriever import retrieve_candidates
from talentpulse_ai.modules.rag_chatbot.schemas import (
    EmbeddingProvider,
    RagRetrieveRequest,
    RagRetrieveResponse,
    VectorRetriever,
)


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

        results = retrieve_candidates(chunks, now_ms)
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
