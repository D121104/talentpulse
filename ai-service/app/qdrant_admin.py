from __future__ import annotations

import argparse
import json
import sys

from qdrant_client import QdrantClient

from app.application.qdrant_admin import initialize_qdrant_demo
from app.core.config import get_settings
from app.infrastructure.qdrant_admin import QdrantAdminAdapter, QdrantAdminError


def main() -> int:
    parser = argparse.ArgumentParser(description="Operator-only Qdrant demo index administration.")
    parser.add_argument(
        "command", choices=("initialize",), help="Initialize and verify the demo collection."
    )
    parser.parse_args()
    settings = get_settings()
    try:
        if not settings.qdrant_admin_enabled:
            raise QdrantAdminError(
                "Qdrant administration is disabled; set AI_QDRANT_ADMIN_ENABLED=true."
            )
        if not settings.qdrant_url:
            raise QdrantAdminError("Qdrant URL is not configured.")
        client = QdrantClient(
            url=settings.qdrant_url,
            api_key=settings.qdrant_api_key,
            timeout=30,
            check_compatibility=False,
        )
        report = initialize_qdrant_demo(QdrantAdminAdapter(client, settings), settings)
    except QdrantAdminError as exc:
        print(json.dumps({"status": "error", "code": "qdrant_admin_failed", "message": str(exc)}))
        return 1
    except Exception:
        print(
            json.dumps(
                {
                    "status": "error",
                    "code": "qdrant_admin_failed",
                    "message": "Qdrant administration operation failed.",
                }
            )
        )
        return 1
    print(json.dumps(report, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
