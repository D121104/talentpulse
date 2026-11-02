from __future__ import annotations

from talentpulse_ai.modules.rag_chatbot.retrieval.filters import (
    MAX_CANDIDATES,
    _passes_date_window,
    _passes_lifecycle,
    _safe_metadata,
)
from talentpulse_ai.modules.rag_chatbot.schemas import RetrievalItem, RetrievedChunk


def retrieve_candidates(chunks: list[RetrievedChunk], now_ms: int) -> list[RetrievalItem]:
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

    return [
        RetrievalItem(job_id=chunk.job_id, rank=rank, score=chunk.score, metadata=chunk.metadata)
        for rank, chunk in enumerate(jobs.values(), start=1)
    ]
