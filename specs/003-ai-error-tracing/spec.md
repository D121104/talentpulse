# Feature Specification: AI Provider Error Tracing

**Feature Branch**: `refactor/ai-gen-cv`

**Created**: 2026-11-17

**Status**: Draft

**Input**: User description: "thêm phần code bắt lỗi rõ ràng lỗi của AI và log để có thể trace được ko, ghi log vào ai-service luôn, ko hiển thị UI"

## Clarifications

### Session 2026-11-18

- Q: Bạn muốn ghi log lỗi provider chỉ trong luồng chat/RAG (bao gồm retrieval, generation, repair và agent), hay mở rộng sang mọi tính năng AI-service như phân tích/tạo CV và indexing? → A: Mở rộng sang toàn bộ AI-service, gồm chat/RAG, phân tích và tạo CV, embeddings, và indexing.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Diagnose AI provider failures (Priority: P1)

When an AI provider request fails in any AI-service capability, an operator can use AI-service logs to determine the failure category and trace the failed operation without seeing sensitive user content or credentials.

**Why this priority**: Provider failures currently can be converted into a normal fallback response, leaving operators unable to distinguish authentication, quota, timeout, connectivity, model/configuration, and invalid-response problems.

**Independent Test**: Trigger representative provider failures with controlled provider doubles across chat/RAG, CV analysis and generation, embeddings, and indexing; verify each produces a categorized, sanitized AI-service diagnostic event while existing client responses remain unchanged.

**Acceptance Scenarios**:

1. **Given** a provider rejects a request because of authentication, quota, request/model configuration, timeout, or connectivity, **When** AI-service handles the failure, **Then** its log identifies the failure category and provider response status when available, without recording provider response bodies or credentials.
2. **Given** a provider returns a response that cannot be parsed or validated, **When** AI-service rejects that response, **Then** its log distinguishes response-format/validation failure from transport or provider rejection.
3. **Given** any AI-service capability returns its existing safe fallback or controlled error, **When** a user receives the response, **Then** no provider-specific diagnostic detail or internal log content is exposed through the UI or API response.

---

### User Story 2 - Trace a failed request across AI processing (Priority: P2)

An operator can correlate a provider failure from any AI-service capability with the operation and request/trace identifiers supplied by the caller, and can distinguish repeated or repair attempts when that capability makes them.

**Why this priority**: Correlation and attempt context help locate the point of failure without logging full prompts, CVs, or job content.

**Independent Test**: Exercise representative failures in retrieval, chat generation/repair, CV analysis/generation, embeddings, and indexing; verify events contain available safe correlation identifiers and correctly identify the capability, operation, and attempt.

**Acceptance Scenarios**:

1. **Given** a request has request and trace identifiers, **When** a failure is recorded, **Then** the diagnostic event contains those identifiers and a bounded operation/attempt label.
2. **Given** a provider fails on a repair attempt after an initial generation problem, **When** logs are reviewed, **Then** the failed attempt is distinguishable from the initial attempt without duplicating prompt or response content.

### Edge Cases

- A provider failure has no HTTP status or provider-specific error code; the event still records a stable generic category and exception type.
- A provider response contains sensitive or arbitrarily large error text; none of that text is copied into logs or client responses.
- The provider request is cancelled or times out while the service is shutting down; the event remains bounded and does not expose a stack trace or request payload.
- A request falls back successfully after a provider failure; logging the failure must not change the fallback response, status, or persistence behavior.
- Correlation identifiers are missing or malformed; the event uses only validated identifiers and does not fail the user request because of logging.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: AI-service MUST classify provider failures into distinguishable categories covering authentication/authorization, rate limit or quota, invalid provider request/model configuration, timeout, connectivity, provider rejection, and malformed or invalid model output.
- **FR-002**: AI-service MUST record a diagnostic log event for provider failures and invalid provider responses, including the provider, configured model identifier, AI operation, stable error category, and provider status/error code when safely available.
- **FR-003**: AI-service MUST include validated request and trace identifiers in diagnostic events when supplied, and MUST identify whether an event belongs to an initial, repair, or bounded agent-model attempt when applicable.
- **FR-004**: Diagnostic events MUST be written by AI-service and MUST NOT require forwarding provider error details to the frontend or business API response.
- **FR-005**: Existing safe fallback and controlled-error behavior MUST remain compatible; diagnostic logging MUST NOT expose internal provider details through user-visible responses.
- **FR-006**: AI-service MUST NOT log API keys, authorization headers, full prompts, CV text or snapshots, retrieved job content, or unrestricted provider request/response bodies.
- **FR-007**: Logged fields and provider error values MUST be bounded and sanitized so control characters, untrusted text, and oversized values cannot inject log lines or create unbounded log records.
- **FR-008**: Logging failure MUST NOT change the outcome of the AI request or prevent the existing fallback/error handling from completing.
- **FR-009**: Automated tests MUST verify error classification, correlation fields, privacy exclusions, and preservation of existing fallback/client contracts without live provider calls.
- **FR-010**: AI-service MUST apply provider failure diagnostics to all provider-backed capabilities, including chat/RAG retrieval and generation, agent model calls, CV analysis, CV generation, embeddings, and indexing; failures in unrelated business logic or local validation MUST NOT be mislabeled as provider failures.

### Key Entities *(include if data involved)*

- **AI Provider Diagnostic Event**: An operational record of a failed AI operation, containing safe provider/model, operation/attempt, correlation, category, status/code, and timing metadata without user content or secrets.
- **AI Request Correlation**: Validated request and trace identifiers used to relate diagnostic events to one AI-service operation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of controlled provider-failure cases across the covered AI-service capabilities in the maintained test fixtures emit an AI-service diagnostic event with a stable, correct failure category.
- **SC-002**: Operators can distinguish authentication/authorization, quota/rate-limit, invalid model/request, timeout/connectivity, and invalid-output cases from the recorded fields without access to provider response bodies.
- **SC-003**: 100% of applicable diagnostic test events include their validated request and trace identifiers and attempt classification.
- **SC-004**: Privacy tests confirm that API keys, authorization values, prompts, CV content, retrieved job content, and raw provider response bodies do not appear in diagnostic events.
- **SC-005**: Existing client-visible fallback and controlled-error behavior remains unchanged in provider-failure regression tests across the covered AI-service capabilities; no provider diagnostic details are rendered in the UI or API responses.

## Assumptions

- The feature covers provider and model-output failures across all provider-backed AI-service capabilities. It does not add diagnostics for unrelated business logic or local input validation, or introduce a new UI, dashboard, external telemetry service, or change to the public API contract.
- Existing request and trace identifiers are reused where available; generating or persisting new business identifiers is out of scope.
- Logs are consumed through the project's existing AI-service runtime logging destination and follow its operational retention and access controls.
- Provider diagnostics use stable categories and safe metadata rather than raw provider error messages, because provider messages may contain untrusted or sensitive content.
