# Tasks: AI Provider Error Tracing

**Input**: Design documents from `/specs/003-ai-error-tracing/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/ai-provider-diagnostic-event.md](contracts/ai-provider-diagnostic-event.md), [quickstart.md](quickstart.md)

**Tests**: Required by FR-009 and the constitution. Use deterministic provider doubles and pytest `caplog`; never require live provider calls.

**Organization**: Tasks are grouped by the two prioritized user stories. User Story 1 implements and verifies a basic diagnostic event across every provider-backed capability. User Story 2 adds precise bounded call indexing for multi-call flows and verifies cross-operation correlation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because the task uses different files and has no incomplete dependency.
- **[Story]**: User story served by the task; setup, foundational, and polish tasks do not carry this label.
- Every task names the exact source, test, or validation-guide path to edit or execute.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Reuse the existing AI-service Python, logging, provider, and test setup. No dependency, environment-variable, UI, or storage setup is needed.

No setup tasks are required; the existing project configuration is reused.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Define the validated failure metadata and best-effort event emitter used by all capabilities.

- [X] T001 Add unit tests for the diagnostic detail model in `ai-service/tests/unit/providers/test_provider_failure_details.py`; assert `event` is `Fixed string: ai_provider_failure`, `capability` is `Fixed enum: rag_chat, cv_analysis, cv_generation, job_indexing`, `provider` is `Allowlisted outbound service: gemini, bedrock, ollama, cohere, qdrant`, `model` is `Configured model identifier, bounded and sanitized`, `operation` is `Fixed enum: retrieve, generate, analyze, embed_query, embed_document, index_upsert, index_delete, localize, agent_model`, `attempt` is `Fixed enum: initial, repair, single, agent_model`, `attempt_index` is `Integer 1 through the existing capability execution bound`, request/trace IDs are `Validated UUID`, `category` is `Fixed enum: authentication, rate_limited, invalid_request, timeout, connectivity, provider_rejected, invalid_response, invalid_output, provider_error`, `provider_status` is `Integer 100-599`, `provider_code` is a `Bounded allowlisted token` matching the contract's alphanumeric/underscore/hyphen pattern, `exception_type` is a `Bounded class name`, and `duration_ms` is a `Non-negative bounded integer`.
- [X] T002 Implement typed provider failure details in `ai-service/src/talentpulse_ai/core/exceptions.py`; enforce the capability and operation enums listed in `specs/003-ai-error-tracing/data-model.md`, `provider` as `Allowlisted outbound service: gemini, bedrock, ollama, cohere, qdrant`, `model` as `Configured model identifier, bounded and sanitized`, `attempt` as `Fixed enum: initial, repair, single, agent_model`, `attempt_index` as `Integer 1 through the existing capability execution bound`, IDs as `Validated UUID`, `category` as `Fixed enum: authentication, rate_limited, invalid_request, timeout, connectivity, provider_rejected, invalid_response, invalid_output, provider_error`, `provider_status` as `Integer 100-599`, `provider_code` as `Bounded allowlisted token` matching the alphanumeric/underscore/hyphen pattern, `exception_type` as a `Bounded class name`, and `duration_ms` as a `Non-negative bounded integer`; preserve generic `ProviderFailure` text.
- [X] T003 [P] Add event-rendering, control-character, and logger-failure tests in `ai-service/tests/unit/providers/test_provider_diagnostic_logging.py`; assert the exact event/field names from `specs/003-ai-error-tracing/contracts/ai-provider-diagnostic-event.md`, bounded single-line output, no unsafe marker values, and that an emitter failure cannot mask the caller's outcome.
- [X] T004 Implement a safe best-effort `ai_provider_failure` event emitter in `ai-service/src/talentpulse_ai/core/logging.py`; validate fixed fields, sanitize/bound allowed values, emit no exception messages or payloads, and swallow handler failures without changing AI operation behavior.

**Checkpoint**: Capability owners can construct and emit a validated internal event without changing API behavior.

---

## Phase 3: User Story 1 - Diagnose AI Provider Failures (Priority: P1) - MVP

**Goal**: Classify and log provider failures across all provider-backed AI-service capabilities while preserving existing fallback, degradation, and API behavior.

**Independent Test**: Trigger controlled provider failures in RAG/chat, agent, CV analysis, CV generation, embeddings, and indexing. Verify a categorized sanitized event identifies capability/provider/operation and available correlation, while each capability keeps its existing user-facing outcome.

### Tests for User Story 1

> Write these tests first and verify they fail for the missing diagnostics before implementation.

- [X] T005 [P] [US1] Add adapter classification tests in `ai-service/tests/unit/providers/test_provider_failures.py`; cover Gemini/Bedrock/Ollama generation, Cohere/Ollama embeddings, and Qdrant calls for authentication, rate limit, invalid request, provider rejection, timeout/connectivity, malformed response, plus local validation that must not be labeled as an outage.
- [X] T006 [P] [US1] Add RAG retrieve/generate failure `caplog` tests in `ai-service/tests/unit/rag_chatbot/test_rag.py`; assert `capability=rag_chat`, actual provider, operation, category, request/trace IDs, initial/repair phase, sanitized status/code, and unchanged fallback when provider or log emission fails.
- [X] T007 [P] [US1] Add CV analysis provider-failure tests in `ai-service/tests/unit/cv_analysis/test_analysis.py` and `ai-service/tests/unit/cv_analysis/test_matching.py`; assert correlated analysis/embedding events, preservation of degraded semantic matching, and that local grounding/scorer errors are not classified as provider outages.
- [X] T008 [P] [US1] Add CV draft provider-failure and fallback `caplog` tests in `ai-service/tests/unit/cv_generator/test_cv_generation.py`; cover core generation, localization, and repair using provider doubles, with request/trace IDs and unchanged draft response/fallback behavior.
- [X] T009 [P] [US1] Add indexing embed/upsert/delete diagnostic tests in `ai-service/tests/unit/job_indexing/test_indexing.py`; assert embedding versus Qdrant provider/operation labels, available validated request/trace UUIDs, and unchanged 503/idempotency behavior.
- [X] T010 [P] [US1] Add agent provider-failure classification and redaction tests in `ai-service/tests/unit/rag_chatbot/test_agent_error_tracing.py`; assert safe provider category/status is retained and permission, tool, invalid-input, and execution-budget failures are not labeled as provider failures.
- [X] T011 [P] [US1] Add RAG API response compatibility tests in `ai-service/tests/integration/test_chat_api.py`; verify provider diagnostic fields remain in AI-service logs and the current fallback/controlled response contains no provider details.
- [X] T012 [P] [US1] Add agent API response compatibility tests in `ai-service/tests/integration/test_agent_chat.py`; verify a provider failure preserves the controlled agent response and does not expose event fields or provider details.
- [X] T013 [P] [US1] Add CV analysis and CV draft response compatibility assertions in `ai-service/tests/integration/test_cv_match_api.py` and `ai-service/tests/integration/test_cv_api.py`; verify existing degraded/error/draft response contracts remain unchanged and contain no provider status/code/message.
- [X] T014 [P] [US1] Add indexing response compatibility assertions in `ai-service/tests/integration/test_indexing_api.py`; verify provider details stay out of the response and existing status, identity, and idempotency fields remain unchanged.

### Implementation for User Story 1

- [X] T015 [P] [US1] Update generation adapters in `ai-service/src/talentpulse_ai/infrastructure/llm/gemini.py`, `ai-service/src/talentpulse_ai/infrastructure/llm/bedrock.py`, and `ai-service/src/talentpulse_ai/infrastructure/llm/ollama.py` to attach safe provider/model identity, category, numeric status, normalized machine code, exception type, and elapsed time; distinguish external rejection/transport from malformed response and never read/log raw error bodies.
- [X] T016 [P] [US1] Update Cohere and Ollama embedding adapters in `ai-service/src/talentpulse_ai/infrastructure/embeddings/model.py` to attach safe failure details and identify the actual outbound provider (`bedrock` when Bedrock hosts Cohere); classify malformed provider vectors as `invalid_response` and leave constructor/configuration errors local.
- [X] T017 [P] [US1] Update Qdrant search/upsert/delete boundaries in `ai-service/src/talentpulse_ai/infrastructure/vectorstore/qdrant.py` to distinguish Qdrant call failures from malformed Qdrant responses and local vector/payload/score validation; attach only safe provider status/code/type/duration.
- [X] T018 [US1] Emit correlated events for RAG retrieval and legacy generation/repair in `ai-service/src/talentpulse_ai/modules/rag_chatbot/service.py` and `ai-service/src/talentpulse_ai/modules/rag_chatbot/generation/generator.py`; include fixed capability/provider/operation/attempt fields and available validated request/trace UUIDs, and preserve current fallback and controlled errors.
- [X] T019 [US1] Emit correlated agent provider-failure events in `ai-service/src/talentpulse_ai/agent_foundation/model.py` and `ai-service/src/talentpulse_ai/modules/rag_chatbot/agent.py`; carry only safe provider details to the catch boundary before controlled conversion, and preserve current agent permissions, bounds, and response behavior.
- [X] T020 [US1] Enrich provider-failure events in `ai-service/src/talentpulse_ai/modules/cv_analysis/analysis.py` and `ai-service/src/talentpulse_ai/modules/cv_analysis/matching.py`; add capability/provider/model/operation and available request/trace IDs, catch `ProviderFailure` separately at matching orchestration, preserve `None` degraded scoring, and do not log local scorer, schema, grounding, or CV parser/OCR errors as provider failures.
- [X] T021 [US1] Pass CV request identity into `ProviderRuntime` and emit per-provider-call events in `ai-service/src/talentpulse_ai/modules/cv_generator/provider_runtime.py` and `ai-service/src/talentpulse_ai/modules/cv_generator/service.py`; cover core/localization/repair provider failures, preserve fallback/deadlines/call caps/metrics, and do not log internal call-cap/deadline checks that occur before a provider call as provider outages.
- [X] T022 [US1] Split embedding and Qdrant failure handling in `ai-service/src/talentpulse_ai/modules/rag_chatbot/ingestion/indexer.py`; emit distinct `job_indexing` events for `embed_document`, `index_upsert`, and `index_delete` with available validated request/trace UUIDs, while preserving 503, validation, inactive-job, and idempotent replay behavior.

**Checkpoint**: Every provider-backed capability emits a safe categorized failure event and preserves its existing API/fallback semantics.

---

## Phase 4: User Story 2 - Trace Attempts Across AI Processing (Priority: P2)

**Goal**: Distinguish bounded individual model calls in agent, CV generation, and semantic matching, while correlating failures with the existing request/trace context.

**Independent Test**: Trigger failures on a later bounded call in each multi-call flow. Verify `attempt_index` is within the existing call bound, phase/operation labels identify the failed call, request/trace IDs remain stable, and no additional retry is introduced.

### Tests for User Story 2

- [X] T023 [P] [US2] Add bounded agent call-index and trace-correlation tests in `ai-service/tests/unit/rag_chatbot/test_agent_error_tracing.py`; fail a later model call, assert the correct `attempt_index` and `attempt=agent_model`, and verify tool/prompt contents are absent.
- [X] T024 [P] [US2] Add CV generation attempt-index tests in `ai-service/tests/unit/cv_generator/test_cv_generation.py`; fail distinct core/localization/repair provider calls and assert `attempt_index` does not exceed the existing `ProviderRuntime` provider-call cap or change retry/deadline behavior.
- [X] T025 [P] [US2] Add CV semantic-match embedding call-index tests in `ai-service/tests/unit/cv_analysis/test_matching.py`; fail the first or second embedding call and assert `attempt_index` is 1 or 2, `attempt=single`, validated request/trace IDs are retained, and the scorer still degrades safely.
- [X] T026 [P] [US2] Add indexing trace and replay tests in `ai-service/tests/unit/job_indexing/test_indexing.py`; verify available request/trace UUIDs on upsert/delete failure and assert an idempotent cached replay emits no provider event because it performs no provider call.

### Implementation for User Story 2

- [X] T027 [US2] Preserve bounded model-call attempt context through `AgentModelError` and emit the indexed agent event in `ai-service/src/talentpulse_ai/agent_foundation/model.py` and `ai-service/src/talentpulse_ai/modules/rag_chatbot/agent.py`; use the existing agent execution bound without adding retries or exposing prompts/tool inputs.
- [X] T028 [US2] Add the existing provider call index to CV-generation diagnostic events in `ai-service/src/talentpulse_ai/modules/cv_generator/provider_runtime.py`; use `ProviderRuntime.provider_call_count` and existing max-call policy for core/localization/repair attempts, with no change to call budgets.
- [X] T029 [US2] Track the fixed two-call semantic embedding position in `ai-service/src/talentpulse_ai/modules/cv_analysis/matching.py` and include it in the matching diagnostic event; do not change the two-call scoring algorithm or degraded result.

**Checkpoint**: Multi-call failures can be located to a bounded call position without new retries or altered API behavior.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Verify the complete event contract, privacy constraints, compatibility, and implementation quality.

- [X] T030 Review emitted fields against `specs/003-ai-error-tracing/contracts/ai-provider-diagnostic-event.md` and update `specs/003-ai-error-tracing/quickstart.md` only if validated commands/scenarios changed; confirm all capability/provider/operation/attempt values are allowlisted and no unsafe content is logged.
- [X] T031 Run all commands in `specs/003-ai-error-tracing/quickstart.md`; verify the complete AI-service test suite, Ruff, and mypy pass without live provider calls.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No setup work is needed; the existing AI-service environment is reused.
- **Foundational (Phase 2)**: T001 and T003 define failing tests. T002 depends on T001. T004 depends on T002 and T003. Both T002 and T004 block user stories.
- **User Stories**: US1 starts after Phase 2 and delivers base diagnostics across all provider-backed capabilities. US2 starts after US1 because it adds call indices to events emitted by US1; it must not change any existing response or retry policy.
- **Polish (Phase 5)**: Starts after both user stories; T031 depends on T030 and all implementation/test tasks.

### User Story Dependencies

- **US1 (P1)**: Depends only on Phase 2; independently validates categorized failure events and current outcomes across the full clarified scope.
- **US2 (P2)**: Depends on the diagnostic event and capability context from US1; independently validates attempt indexing for existing bounded multi-call flows.

### Within Each User Story

- Write each story's tests first and confirm expected failures before implementing its behavior.
- US1 tests T005-T014 can run in parallel across separate test files.
- US1 adapter changes T015-T017 can run in parallel after Phase 2 and T005; they target separate source files.
- US1 orchestration changes T018-T022 can run in parallel after their tests and required adapter changes; they target separate capability files.
- US2 tests T023-T026 can run in parallel across separate test files after US1.
- US2 attempt-index changes T027-T029 can run in parallel after their tests; they target separate capability files.
- Keep local validation, parser/OCR, grounding, business rules, and unrelated programming errors out of provider-failure events.

### Parallel Opportunities

- **Foundation**: T001 and T003 can be authored in parallel; T002 and T004 follow their respective tests, with T004 also depending on T002's event metadata.
- **US1 tests**: T005, T006, T007, T008, T009, T010, T011, T012, T013, and T014 target distinct test files and can run in parallel.
- **US1 adapters**: T015, T016, and T017 can run in parallel after the shared diagnostic model exists.
- **US1 capabilities**: T018, T019, T020, T021, and T022 can run in parallel after their own tests and the adapter work they consume.
- **US2 tests**: T023-T026 can run in parallel after US1.
- **US2 implementation**: T027-T029 can run in parallel after their tests because they modify agent, CV generation, and CV analysis files respectively.

## Parallel Example: User Story 1

```text
Run tests in parallel:
T005 provider adapters: tests/unit/providers/test_provider_failures.py
T006 RAG: tests/unit/rag_chatbot/test_rag.py
T007 CV analysis: tests/unit/cv_analysis/test_analysis.py and test_matching.py
T008 CV generation: tests/unit/cv_generator/test_cv_generation.py
T009 job indexing: tests/unit/job_indexing/test_indexing.py
T010 agent: tests/unit/rag_chatbot/test_agent_error_tracing.py

After the shared foundation, implement adapters in parallel:
T015 LLM adapters: infrastructure/llm/*.py
T016 embedding adapters: infrastructure/embeddings/model.py
T017 Qdrant: infrastructure/vectorstore/qdrant.py
```

## Implementation Strategy

### MVP First (User Story 1)

1. Complete T001-T004 to establish validated safe failure metadata and best-effort log emission.
2. Write and run T005-T014; confirm adapter and all capability/API tests fail only for missing diagnostics.
3. Complete T015-T022 and re-run the US1 test set.
4. **Stop and validate**: every provider-backed capability records a safe category in AI-service logs, while all existing response, fallback, degradation, and indexing semantics remain unchanged.

### Incremental Delivery

1. Deliver US1 as the first usable increment across all capabilities in the clarified scope.
2. Add US2 bounded call indices for agent, CV-generation, and CV semantic-match multi-call paths.
3. Complete T030-T031 for privacy contract review, full tests, Ruff, and mypy.

## Notes

- [P] means a task edits a distinct file and has no incomplete dependency.
- Story tasks map to the spec's US1/US2; foundational and polish tasks have no story label.
- FR-001/FR-002/FR-007 are covered by T001-T005 and T015-T022. FR-003 is covered by T006-T014 and T018-T029. FR-004/FR-005 are covered by T011-T014 and each capability's behavior regression tests. FR-006 is covered by T003/T005-T014/T030. FR-008 is covered by T003/T004/T006-T009 and T018-T022. FR-009 is covered by all test and validation tasks. FR-010 is covered by T005-T010 and T015-T022.
- SC-001/SC-002 are covered by T005-T010/T015-T022; SC-003 by T006-T014/T023-T029; SC-004 by T003/T005-T010/T023-T030; SC-005 by T006-T014/T018-T022/T031.
- No frontend, NestJS, persistence, or dependency changes are part of this task list.
