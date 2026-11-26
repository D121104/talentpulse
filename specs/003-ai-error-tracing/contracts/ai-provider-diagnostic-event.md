# AI Provider Diagnostic Event Contract

## Purpose

Internal AI-service log event for provider failures and invalid provider/model output across RAG/chat, CV analysis, CV generation, and job indexing. This is not a public API or UI contract.

## Event Shape

Use the existing AI-service `key=value` logging convention with stable event and field names:

```text
ai_provider_failure capability=<capability> provider=<provider> model=<model|none> operation=<operation> attempt=<attempt> attempt_index=<bounded-integer|none> category=<category> request_id=<uuid|none> trace_id=<uuid|none> provider_status=<100-599|none> provider_code=<safe-token|none> exception_type=<class|none> duration_ms=<integer|none>
```

Unavailable optional values may be omitted or set to `none` consistently. No field may contain a multiline value, raw provider message, or user content.

## Allowed Values

- `capability`: `rag_chat`, `cv_analysis`, `cv_generation`, or `job_indexing`.
- `provider`: actual outbound service `gemini`, `bedrock`, `ollama`, `cohere`, or `qdrant`. When Cohere is hosted through Bedrock, use `bedrock` and put the configured Cohere model identifier in `model`.
- `operation`: `retrieve`, `generate`, `analyze`, `embed_query`, `embed_document`, `index_upsert`, `index_delete`, `localize`, or `agent_model`.
- `attempt`: `initial`, `repair`, `single`, or `agent_model`.
- `attempt_index`: positive integer no greater than the existing execution bound for that capability, including agent/CV generation calls and the two CV semantic-match embeddings; omit if no bounded multi-call index is available.
- `category`: `authentication`, `rate_limited`, `invalid_request`, `timeout`, `connectivity`, `provider_rejected`, `invalid_response`, `invalid_output`, or `provider_error`.
- `provider_status`: integer 100-599 only; no reason phrase.
- `provider_code`: bounded machine token matching a conservative alphanumeric/underscore/hyphen pattern; omit if unsafe.
- `duration_ms`: non-negative bounded integer.

## Classification

- Provider authentication, quota/rate limits, invalid request/model, known timeout, known connectivity, and other provider rejection are classified from typed exceptions, numeric status, or allowlisted machine code.
- Malformed provider response envelopes are `invalid_response`; decoded output rejected by application schema/grounding validation is `invalid_output`.
- Local validation, parsing/OCR, business-rule, dimension/score checks, and programming errors are not reported as provider outages.
- Do not classify by parsing arbitrary exception strings.

## Privacy and Compatibility

- Do not log exception messages, stack traces, request bodies, provider response bodies, API keys, authorization values, prompts/history, CV/profile/job descriptions, retrieved content, embedding vectors, idempotency keys, or candidate/user/session identifiers.
- Request and trace IDs are included only when they pass the existing request schema's UUID validation.
- Events are emitted only to the AI-service logging destination. Do not add fields to AI-service responses, NestJS DTOs, persisted chat/CV/index state, or frontend rendering.
- Existing HTTP status, safe error messages, fallbacks, CV-analysis degradation, CV draft behavior, indexing idempotency, and indexing response semantics must remain unchanged.

## Failure Handling

Emit one diagnostic event at the capability boundary per failed provider attempt, not duplicate events in both adapter and service layers. Failure to construct or emit the event must not prevent the existing controlled outcome.
