# Quickstart: Validate AI Provider Error Tracing

## Prerequisites

- Python 3.12 or 3.13 environment managed by `uv`.
- AI-service dependencies installed from `ai-service/pyproject.toml` and `ai-service/uv.lock`.
- No live Gemini, Bedrock, Cohere, Ollama, or Qdrant credentials are needed; tests use deterministic provider doubles.

## Run AI-Service Tests and Quality Checks

From the repository root:

```bash
uv run --project ai-service pytest ai-service/tests -q
uv run --project ai-service ruff check ai-service/src/talentpulse_ai ai-service/tests
uv run --project ai-service mypy ai-service/src/talentpulse_ai
```

Expected result: all unit and integration tests pass without live provider calls; lint and type checks complete without errors.

## Validate Provider Failure Cases

Use provider doubles to trigger these cases independently in each applicable capability:

1. Authentication (401/403), quota/rate limit (429), invalid provider/model request (400/404), generic provider rejection, timeout, and connectivity failure.
2. Valid transport with malformed provider response, invalid embedding dimensions/values, or invalid model schema/grounding output; assert response/output failures do not masquerade as transport outages.
3. Chat/RAG retrieval and generation/repair, agent model call, CV matching embedding and narrative generation, CV draft core/localization/repair, indexing embedding/upsert/delete, and Qdrant retrieval.
4. Local CV parsing/OCR, request/schema validation, indexing content-hash/dimension validation, and other local errors; assert they do not produce provider-failure events.
5. Idempotent indexing replay; assert no provider event is emitted when the cached operation makes no provider call.

Capture logs with pytest `caplog`. Assert capability/provider/operation/attempt, available model/status/code, duration, and validated request/trace IDs. Use distinct marker values for credentials, exception messages, prompts/history, CV text, job descriptions, embedding vectors, idempotency keys, response bodies, and newline/control-character injection; assert no marker appears in logs or client responses.

## Validate Existing Behavior

For each capability, verify its existing outcome is unchanged after the diagnostic event:

- Chat/RAG and agent retain their safe fallback or controlled error.
- CV semantic matching still degrades safely when embedding is unavailable; CV analysis returns its existing sanitized error on generation failure.
- CV draft generation retains existing fallback, call cap, timeout budget, and editable draft response.
- Index upsert/delete retain current HTTP/service status, identity fields, and idempotency behavior.
- No provider category/status/code or internal log detail is added to any API response or UI.

## References

- Event fields and privacy rules: [contracts/ai-provider-diagnostic-event.md](contracts/ai-provider-diagnostic-event.md)
- Capability, operation, and lifecycle definitions: [data-model.md](data-model.md)
- Provider error mapping and current integration boundaries: [research.md](research.md)
