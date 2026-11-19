from __future__ import annotations

import json

import pytest

from talentpulse_ai.core.exceptions import ProviderFailure
from talentpulse_ai.infrastructure.llm.ollama import OllamaGenerationAdapter


@pytest.mark.parametrize("model,thinking", [("llama3.1:8b", False), ("qwen3:8b", True)])
def test_ollama_structured_request_keeps_local_settings(monkeypatch, model, thinking) -> None:
    calls: list[tuple[str, str, dict[str, object], float]] = []

    def request(base_url: str, path: str, payload: dict[str, object], timeout: float):
        calls.append((base_url, path, payload, timeout))
        return {"response": "{}"}

    monkeypatch.setattr("talentpulse_ai.infrastructure.llm.ollama._ollama_json_request", request)
    schema = {
        "type": "object",
        "properties": {"answer": {"type": "string", "minLength": 1}},
    }

    OllamaGenerationAdapter("http://ollama", model, 30).generate_structured(
        "synthetic prompt", schema, timeout=25, num_predict=2048
    )

    base_url, path, payload, timeout = calls[0]
    assert base_url == "http://ollama"
    assert path == "/api/generate"
    assert payload["stream"] is False
    assert payload["options"] == {"temperature": 0, "num_predict": 2048}
    assert payload["format"]["properties"]["answer"]["type"] == "string"
    assert "minLength" not in json.dumps(payload["format"])
    assert timeout == 25
    assert ("think" in payload) is thinking
    if thinking:
        assert payload["think"] is False


def test_ollama_rejects_unbounded_output_and_timeout() -> None:
    provider = OllamaGenerationAdapter("http://ollama", "qwen3:8b", 30)

    with pytest.raises(ValueError, match="num_predict"):
        provider.generate_structured("prompt", {"type": "object"}, num_predict=4097)
    with pytest.raises(ValueError, match="timeout"):
        provider.generate_structured("prompt", {"type": "object"}, timeout=121)


def test_ollama_provider_failure_does_not_expose_response_body(monkeypatch) -> None:
    def fail(*args, **kwargs):
        raise RuntimeError("synthetic private response")

    monkeypatch.setattr("talentpulse_ai.infrastructure.llm.ollama._ollama_json_request", fail)

    with pytest.raises(ProviderFailure) as error:
        OllamaGenerationAdapter("http://ollama", "qwen3:8b", 30).generate("prompt")

    assert "synthetic private response" not in str(error.value)
