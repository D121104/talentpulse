from __future__ import annotations

import json
import logging
import time
import uuid
from contextvars import ContextVar
from typing import Any

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

request_id_context: ContextVar[str] = ContextVar("request_id", default="unknown")


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "requestId": request_id_context.get(),
        }
        if hasattr(record, "event_data"):
            payload.update(record.event_data)
        return json.dumps(payload, separators=(",", ":"), ensure_ascii=True)


def configure_logging(level: str) -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level.upper())


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        incoming = request.headers.get("X-Request-ID", "")
        try:
            request_id = str(uuid.UUID(incoming))
        except (ValueError, AttributeError):
            request_id = str(uuid.uuid4())
        request.state.request_id = request_id
        token = request_id_context.set(request_id)
        started = time.perf_counter()
        try:
            response = await call_next(request)
            response.headers["X-Request-ID"] = request_id
            logging.getLogger("ai-service.http").info(
                "request completed",
                extra={
                    "event_data": {
                        "method": request.method,
                        "path": request.url.path,
                        "status": response.status_code,
                        "durationMs": round((time.perf_counter() - started) * 1000, 2),
                    }
                },
            )
            return response
        finally:
            request_id_context.reset(token)
