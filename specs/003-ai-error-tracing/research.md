# Research: AI Provider Error Tracing

## Existing Provider-Backed Capabilities

### RAG, Chat, Retrieval, and Agent

- `GeminiGenerationAdapter`, `BedrockNovaGenerationAdapter`, and `OllamaGenerationAdapter` currently wrap transport, provider rejection, and some response parsing failures as generic `ProviderFailure`. These adapters preserve a chained cause but expose no safe category/status metadata.
- `GenerationService` already logs initial/repair stages with request and trace IDs, but provider exceptions are reduced to a generic `provider_error` code. It is the right correlated logging boundary for legacy generation and repair.
- `RetrievalService.retrieve` wraps embedding and vector-store errors together as a controlled service error without logging which boundary failed. The request identity is available there.
- `AgentModelAdapter` converts provider failures into `AgentModelError`. The agent has trace/request identity and bounded model calls, but its normal observation currently records only a generic provider error. A direct provider failure can be converted to a controlled error before normal observation, so diagnostics need to be emitted/preserved on that path.

### CV Analysis and Matching

- `MatchAnalysisService.analyze` already logs sanitized provider and output-validation failures, then returns controlled `ServiceError`s. The `MatchAnalysisRequest` carries request, trace, and operation-attempt IDs, but current logs omit them and provider/model identity.
- `EmbeddingSemanticScorer.score` invokes the configured embedding provider twice and broadly catches all exceptions, returning `None`. It therefore silently degrades both real `ProviderFailure`s and unrelated local/programming errors. The enclosing match service has request identity; the scorer itself does not.
- CV PDF/DOCX parsing and optional OCR are local processing, not provider calls. Parser/schema/OCR errors must remain outside provider-failure diagnostics.

### CV Draft Generation

- `CvDraftGenerationService.generate` creates a per-request `ProviderRuntime` and has access to request identity. `ProviderRuntime.invoke` is shared by core generation, localization, and repair and already tracks call kind, call count, duration, timeout kinds, total deadline, and provider-call cap.
- Core generation already logs some provider/schema errors with request/trace ID and model identity. Repair/localization failures have additional diagnostic/fallback paths, so the same provider attempt can otherwise be inconsistently logged or omitted.
- The shared runtime is the best provider-attempt boundary for this capability once request identity and capability context are passed into it. It must distinguish provider failure from local schema/grounding rejection, and must preserve current draft fallback and call/time bounds.

### Embeddings, Vector Store, and Job Indexing

- `CohereEmbeddingAdapter` and `OllamaEmbeddingAdapter` wrap both external call failures and response shape/dimension validation failures as generic `ProviderFailure`. Cohere may be called directly or hosted through Bedrock; the diagnostic `provider` value must identify the actual outbound service (`cohere` for direct calls, `bedrock` for `invoke_model`) while `model` retains the configured model identifier.
- `QdrantVectorRetriever` and writer methods wrap external Qdrant errors and local vector/payload/score parsing or validation errors together. These categories must be separated before they are reported as a Qdrant outage.
- `JobIndexingService` lives in `modules/rag_chatbot/ingestion/indexer.py`. It receives request, trace, and operation-attempt IDs. Upsert currently wraps embedding and vector write in one catch; delete has a separate vector catch. The service can distinguish provider boundaries and preserve generic 503 responses. Idempotent cached replays do not invoke providers and should not emit provider failure events.
- Index schemas validate UUIDs, text lengths, content hashes, and idempotency inputs before provider calls. Local validation and inactive-job handling are not provider failures.
- The indexing payload intentionally excludes job description. Diagnostics must not include the source document, job snapshot, vector, filters, payload, or idempotency key.

## Decisions

### Decision: Use one shared safe failure detail type and capability-specific event context

**Rationale**: Provider adapters are the only layers that can reliably inspect provider-specific status and error types. Capability owners have request identity and know the operation. A shared typed value can carry only allowlisted provider metadata from adapters to orchestration; each orchestration boundary adds capability, operation, attempt, and correlation.

**Alternatives considered**: Logging inside adapters as the only mechanism was rejected because adapters lack request context and operation/attempt. A single global catch-all log was rejected because it cannot separate RAG, CV, embedding, and indexing operations or distinguish local errors.

### Decision: Emit one diagnostic event at the capability boundary per failed provider attempt

**Rationale**: Correlation IDs and fallback behavior are known at the orchestration/runtime boundary. Emit there, not in both adapter and service, to avoid duplicate failure records. The CV generation per-request runtime provides bounded call kind/index/duration; RAG, CV analysis, and indexing owners provide their respective identities.

**Alternatives considered**: Duplicating logs in the adapter and service was rejected because it causes duplicate events and risks provider payload leakage. Logging only at HTTP middleware was rejected because the middleware cannot identify which provider operation failed and the service may convert failures into successful fallbacks.

### Decision: Separate provider faults from invalid provider output and local faults

**Rationale**: Current broad catches in embedding and Qdrant adapters misclassify local response parsing/dimension/score validation as provider outages. Explicitly classify transport/provider rejection, malformed provider response, invalid model output, and local application validation separately. Preserve capability-specific fallback behavior for valid-but-degraded results.

**Alternatives considered**: Parsing exception messages for categories was rejected as unstable and unsafe. Treating all exceptions from a provider-adjacent block as provider errors was rejected because programming and local validation failures must not be mislabeled.

### Decision: Use a capability field separate from provider and operation

**Rationale**: `generate` can refer to chat generation, CV narrative analysis, or CV draft generation; similarly `embed` can be a CV match query or an indexing document. A fixed `capability` label distinguishes the product flow, `provider` identifies the actual outbound service, and `operation` identifies the call within that capability. For Cohere hosted via Bedrock, label the outbound service as Bedrock and keep the Cohere model name separately.

**Alternatives considered**: Combining capability/provider/operation into one free-form name was rejected because it weakens filtering and bounded-value validation. Calling Qdrant an AI model provider was rejected; it is represented as the external provider for a vector-store operation. Adding an extra `transport` field was rejected because the adapter can provide the actual outbound service name and the model field already identifies the selected model.

### Decision: Keep details internal and avoid provider message/body logging

**Rationale**: Existing endpoints already return sanitized errors or fallback results. Stable categories, numeric status, bounded provider codes, exception class, elapsed time, and validated IDs are sufficient for diagnosis without propagating sensitive provider text.

**Alternatives considered**: Returning provider codes in API/UI responses or recording exception messages/stack traces was rejected by user scope and the constitution's privacy/security requirements.

## Classification Rules

- HTTP 401/403 or an explicit authentication exception -> `authentication`.
- HTTP 429 or an allowlisted quota/rate-limit provider code -> `rate_limited`.
- HTTP 400/404 or an allowlisted invalid-request/model code -> `invalid_request`.
- Known timeout exceptions -> `timeout`.
- Known DNS, connection, or TLS exceptions -> `connectivity`.
- Other provider/SDK rejections -> `provider_rejected`.
- Provider returned data that is malformed or violates the provider response envelope -> `invalid_response`.
- Successfully decoded model output that fails application schema/grounding validation -> `invalid_output`.
- Unknown exception at an external call boundary -> `provider_error` with safe exception type only; unknown exceptions outside that boundary are not automatically called provider failures.
- Local request, dimension, score, parser, OCR, business-rule, and programming errors retain their existing local error classification and must not be logged as provider outages.

Provider codes are included only if they match the data-model allowlist. Never inspect or log free-form messages to infer a category. Read only numeric status and narrowly selected machine-code fields; do not copy provider error bodies into the event. Provider IDs must identify the outbound service, including `bedrock` when Bedrock hosts the Cohere model.

## Correlation and Attempts

- Use existing validated `request_id` and `trace_id` in RAG, CV match/analysis, CV draft generation, and indexing. Do not create new business identifiers.
- CV parse/OCR has no provider call and remains out of scope; it does not need provider correlation.
- `attempt` identifies the phase (`initial`, `repair`, or `single`). For multi-call agent/CV generation, add an optional bounded `attempt_index` only where the existing execution/runtime cap provides a finite maximum. Do not invent a retry loop or alter existing retry policies.
- Cached indexing replays do not invoke a provider and therefore do not emit provider failure events.

## Open Questions

None. The clarified scope, current provider boundaries, existing identities, and execution limits are sufficient for design.
