from __future__ import annotations

import json
from collections.abc import Mapping
from urllib.request import Request, urlopen

_MAX_OLLAMA_RESPONSE_BYTES = 10 * 1024 * 1024
_MAX_OLLAMA_TIMEOUT_SECONDS = 120.0


def _ollama_json_request(
    base_url: str, path: str, payload: Mapping[str, object], timeout: float
) -> object:
    request = Request(
        f"{base_url.rstrip('/')}{path}",
        data=json.dumps(payload, separators=(",", ":")).encode("utf-8"),
        headers={"Accept": "application/json", "Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=timeout) as response:
        body = response.read(_MAX_OLLAMA_RESPONSE_BYTES + 1)
    if len(body) > _MAX_OLLAMA_RESPONSE_BYTES:
        raise ValueError("provider response is too large")
    return json.loads(body.decode("utf-8"))


def _response_body(response: object) -> object:
    if isinstance(response, Mapping):
        response = response.get("body", response)
    reader = getattr(response, "read", None)
    if callable(reader):
        response = reader()
    if isinstance(response, bytes):
        response = response.decode("utf-8")
    if isinstance(response, str):
        return json.loads(response)
    return response
