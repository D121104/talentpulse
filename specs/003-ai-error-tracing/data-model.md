# Data Model: AI Provider Error Tracing

This feature adds an ephemeral diagnostic event to the existing AI-service log stream. It adds no database, queue, persisted diagnostic record, or response field.

## AI Provider Diagnostic Event

| Field | Type / bounds | Required | Meaning |
|---|---|---:|---|
| `event` | Fixed string: `ai_provider_failure` | Yes | Stable event name for operator filtering. |
| `capability` | Fixed enum: `rag_chat`, `cv_analysis`, `cv_generation`, `job_indexing` | Yes | AI-service capability in which the call occurred. |
| `provider` | Allowlisted outbound service: `gemini`, `bedrock`, `ollama`, `cohere`, `qdrant` | Yes | Actual external service called; for Cohere hosted through Bedrock use `bedrock`, and identify the Cohere model in `model`. Never use capability labels such as `embedding` as a provider name. |
| `model` | Configured model identifier, bounded and sanitized | When applicable | Generation/embedding model for model calls; `none` for operations such as Qdrant-only calls. |
| `operation` | Fixed enum: `retrieve`, `generate`, `analyze`, `embed_query`, `embed_document`, `index_upsert`, `index_delete`, `localize`, `agent_model` | Yes | Specific operation performed within the capability. |
| `attempt` | Fixed enum: `initial`, `repair`, `single`, `agent_model` | Yes | Phase of the failed call, not a free-form retry description. |
| `attempt_index` | Integer 1 through the existing capability execution bound | When applicable | Identifies a call within bounded multi-call agent/CV generation/CV semantic-match operations; do not create additional retries. |
| `request_id` | Validated UUID | When supplied | Correlates the event with the incoming AI request. |
| `trace_id` | Validated UUID | When supplied | Correlates events across one AI-service trace. |
| `category` | Fixed enum: `authentication`, `rate_limited`, `invalid_request`, `timeout`, `connectivity`, `provider_rejected`, `invalid_response`, `invalid_output`, `provider_error` | Yes | Stable actionable failure class. |
| `provider_status` | Integer 100-599 | When available | Numeric HTTP/provider status only. |
| `provider_code` | Bounded allowlisted token | When safely available | Stable machine code; excludes free-form provider message/detail. |
| `exception_type` | Bounded class name | When useful | Exception class only; no message or traceback. |
| `duration_ms` | Non-negative bounded integer | When available | Time spent in the failed provider attempt. |

## Capability and Operation Mapping

| Capability | Example operations | Provider examples |
|---|---|---|
| `rag_chat` | `retrieve`, `generate`, `agent_model` | Gemini/Bedrock/Ollama, Cohere/Ollama embeddings, Qdrant |
| `cv_analysis` | `embed_query`, `analyze` | Cohere/Ollama embeddings, Ollama/Bedrock generation |
| `cv_generation` | `generate`, `localize` | Configured generation provider |
| `job_indexing` | `embed_document`, `index_upsert`, `index_delete` | Cohere/Ollama embeddings, Qdrant |

CV file parsing and local OCR do not call an external AI provider and are not represented as provider failures.

## Lifecycle

1. An adapter classifies an external call rejection/transport issue or malformed provider response and attaches only safe typed metadata; application-owned schema, grounding, dimension, and other local validation failures remain distinct.
2. The capability owner adds capability, operation, attempt phase/index, and available validated request/trace IDs, then emits one bounded event per failed provider attempt.
3. Existing fallback, degradation, controlled error, quota, indexing idempotency, and persistence behavior continues without depending on successful event emission.
4. The event is written only to the existing AI-service log destination, never stored in PostgreSQL/Qdrant or returned to NestJS/frontend.

## Privacy and Validation Rules

- Never include API keys, authorization headers, full URLs with query credentials, prompts, chat history, CV/profile/job text, retrieved content, embedding vectors, idempotency keys, provider request/response bodies, or exception messages/stack traces.
- Request/trace IDs are included only after existing request-schema UUID validation; omit absent identifiers.
- Capability, provider, operation, attempt, and category values come from fixed enums. `attempt_index` is limited by the existing bounded execution policy.
- Provider codes and model names are length-limited and sanitized; include provider codes only when they match the safe token allowlist.
- Numeric status and duration are range-checked. No free-form value may contain a newline or control character.
- Logging is best-effort and cannot replace or mask the original fallback/error result.
