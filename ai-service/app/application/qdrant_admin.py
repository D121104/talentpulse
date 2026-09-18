from __future__ import annotations

from app.core.config import Settings
from app.infrastructure.qdrant_admin import QdrantAdminAdapter, QdrantAdminError


def initialize_qdrant_demo(adapter: QdrantAdminAdapter, settings: Settings) -> dict[str, object]:
    if not settings.qdrant_admin_enabled:
        raise QdrantAdminError(
            "Qdrant administration is disabled; set AI_QDRANT_ADMIN_ENABLED=true "
            "for the operator command."
        )
    return adapter.initialize_and_verify()
