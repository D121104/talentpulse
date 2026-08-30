from __future__ import annotations

import asyncio
import json
from typing import Any

from app.lambda_handler import handler
from app.main import app


def test_lambda_handler_wraps_existing_global_app() -> None:
    assert handler.app is app


def test_lambda_handler_serves_liveness_without_aws() -> None:
    event: dict[str, Any] = {
        "version": "2.0",
        "routeKey": "GET /health/live",
        "rawPath": "/health/live",
        "rawQueryString": "",
        "headers": {"host": "example.com"},
        "requestContext": {
            "http": {
                "method": "GET",
                "path": "/health/live",
                "protocol": "HTTP/1.1",
                "sourceIp": "127.0.0.1",
                "userAgent": "pytest",
            }
        },
        "isBase64Encoded": False,
    }

    asyncio.set_event_loop(asyncio.new_event_loop())
    try:
        response = handler(event, None)
    finally:
        loop = asyncio.get_event_loop()
        loop.close()
        asyncio.set_event_loop(None)

    assert response["statusCode"] == 200
    assert json.loads(response["body"]) == {"status": "ok"}
