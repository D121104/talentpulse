from __future__ import annotations

from typing import cast

from app.domain.matching import EmbeddingProvider, EmbeddingSemanticScorer, MatchService


def resolve_match_service(state: object) -> MatchService:
    """Resolve matching dependencies from the application-state integration port.

    The preferred composition-root contract is ``matching_service`` or
    ``matching_embedding_provider`` on ``app.state``. The existing application also
    keeps its configured embedding provider inside ``retrieval_service``; that
    compatibility path lets the route use the configured provider without changing
    the composition root owned by another agent.
    """
    configured_service = getattr(state, "matching_service", None)
    if configured_service is None:
        configured_service = getattr(state, "match_service", None)
    if callable(getattr(configured_service, "match", None)):
        return cast(MatchService, configured_service)

    provider = getattr(state, "matching_embedding_provider", None)
    if provider is None:
        provider = getattr(state, "embedding_provider", None)
    if provider is None:
        retrieval_service = getattr(state, "retrieval_service", None)
        provider = getattr(retrieval_service, "_embedding", None)
    if callable(getattr(provider, "embed_query", None)):
        version = getattr(provider, "version", "configured-embedding-v1")
        if not isinstance(version, str) or not version:
            version = "configured-embedding-v1"
        scorer = EmbeddingSemanticScorer(cast(EmbeddingProvider, provider), version=version)
        return MatchService(scorer)

    return MatchService()
