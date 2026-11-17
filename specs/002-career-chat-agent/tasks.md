---

description: "Implementation tasks for TalentPulse Career Chat Agent"
---

# Tasks: TalentPulse Career Chat Agent

**Input**: Design documents from `specs/002-career-chat-agent/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/career-chat.md`, `quickstart.md`

**Tests**: Unit, integration, and regression tests are explicitly required by the feature specification and user request. Use synthetic job/CV fixtures and controlled providers.

**Execution model**: One developer, sequential phases, test-first within each story. `[P]` marks only separate-file tasks that can be prepared independently; it does not assume multiple contributors.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Tasks can proceed independently in different files without waiting on each other.
- **[Story]**: Maps task to a user story in `spec.md`.
- Every task states its dependencies and completion criteria.

## Phase 1: Setup - Preserve the Existing Baseline

**Purpose**: Capture the current internal RAG and candidate-chat contracts before adding the agent path.

- [X] T001 [P] Extend `ai-service/tests/integration/test_chat_api.py` with baseline assertions for current `RagGenerateRequest`/`RagGenerateResponse`, HTTP status, legacy generation, citation and filter fields; Depends: none; Done when the existing route contract is explicitly covered and the test passes against the current implementation.
- [X] T002 [P] Extend `backend/tests/candidate-assistant/candidate-assistant-ai.loopback.integration.spec.ts` with baseline assertions for retrieve→canonical-context→generate, signed service scopes, message persistence and quota behavior; Depends: none; Done when the current NestJS-to-FastAPI flow is covered without changing production code or DTOs.

**Checkpoint**: Both existing-path baselines pass; no agent flag or route selection is enabled.

---

## Phase 2: Foundational - Bounded Model Provider and Safe Selection Prerequisites

**Purpose**: Resolve the Foundation timeout gap before any agent request can use the production Bedrock provider.

**Blocking rule**: Complete this phase before implementing Career Chat Agent execution.

- [X] T003 [P] Add timeout propagation and unsupported-provider fail-closed cases to `ai-service/tests/unit/agent_foundation/test_model.py`; Depends: Phase 1; Done when tests specify that every agent model call receives remaining time and a provider without a timeout-aware method is rejected.
- [X] T004 Implement timeout-aware dispatch and fail-closed behavior in `ai-service/src/talentpulse_ai/agent_foundation/model.py`; Depends: T003; Done when structured and timeout-aware providers receive the remaining deadline, while plain `generate(prompt)` is never called silently for an agent run.
- [X] T005 [P] Add bounded agent-client construction cases to `ai-service/tests/unit/providers/test_provider_factory.py`; Depends: Phase 1; Done when tests distinguish the agent Bedrock client timeout from the unchanged legacy provider/client.
- [X] T006 Add an agent-specific timeout-bounded Bedrock call and compose it in `ai-service/src/talentpulse_ai/infrastructure/llm/bedrock.py` and `ai-service/src/talentpulse_ai/infrastructure/provider_factory.py`; Depends: T004, T005; Done when agent calls use the remaining request deadline, missing timeout support fails closed, and the legacy Bedrock path retains its existing timeout behavior.

**Checkpoint**: Foundation/provider unit tests pass; agent selection remains disabled and existing chatbot behavior remains unchanged.

---

## Phase 3: User Story 1 - Tiếp tục hội thoại hiện có (Priority: P1)

**Goal**: Build one request-scoped agent execution that consumes the existing bounded conversation context without creating new session or history persistence.

**Independent Test**: Invoke the capability with synthetic multi-turn `RagGenerateRequest` fixtures and a fake provider; confirm history ordering/bounds and a valid current response, with no state retained between requests.

### Tests for User Story 1

- [X] T007 [P] [US1] Add history ordering, locale, mode-change isolation, and bounded-context cases in `ai-service/tests/unit/rag_chatbot/test_agent_context.py`; Depends: Phase 2; Done when tests cover the eight-entry/6000-character history contract, require a new session on mode change, ensure no history crosses sessions, and build prompt context only from the current request.
- [X] T008 [P] [US1] Add single-agent, request-scoped execution cases in `ai-service/tests/unit/rag_chatbot/test_agent_execution.py`; Depends: Phase 2; Done when tests prove one `rag.generate` Agent Foundation execution per request, no subagent delegation, and no persisted agent state.

### Implementation for User Story 1

- [X] T009 [US1] Implement the Career Chat capability definition, request/prompt construction, bounded execution policy and `AgentResult` adapter in `ai-service/src/talentpulse_ai/modules/rag_chatbot/agent.py`; Depends: T007, T008; Done when the capability uses existing Foundation types/provider, includes bounded current-session history, excludes new persistence, and maps output to the existing RAG domain boundary.
- [X] T010 [US1] Add a fake-provider execution integration test in `ai-service/tests/integration/test_agent_chat.py` for two consecutive request-scoped turns; Depends: T009; Done when the second request uses only its supplied history and neither turn depends on an Agent Foundation checkpoint.

**Checkpoint**: The capability can be invoked independently with a fake provider; production routing remains legacy-only.

---

## Phase 4: User Story 2 - Tìm việc và nhận tư vấn có căn cứ (Priority: P1)

**Goal**: Expose prepared RAG evidence through a read-only tool and reuse existing prompt, grounding, citation and no-evidence behavior.

**Independent Test**: With synthetic active-job fixtures, exercise JOB_SEARCH and ADVICE through the capability; verify canonical evidence/citations, filters, and no-evidence output without a live provider.

### Tests for User Story 2

- [X] T011 [P] [US2] Add prepared retrieval-context tool cases in `ai-service/tests/unit/rag_chatbot/test_agent_tools.py`; Depends: T009; Done when the contract requires an empty/closed input, returns only current-request prepared evidence, and rejects unpaired or out-of-context job IDs.
- [X] T012 [P] [US2] Add job-answer validation cases in `ai-service/tests/unit/rag_chatbot/test_agent_generation.py`; Depends: T009; Done when fixtures distinguish empty/filtered evidence (`NO_EVIDENCE`/safe fallback) from retrieval/canonical-hydration failure (`DEGRADED`/controlled error), deduplicate exact repeated citation keys, reject malformed/unknown/unpaired/cross-job citations and cover supported claims, filter state, and at most one repair followed by fallback/error when repair fails or budget is exhausted.
- [X] T030 [P] [US2] Add adversarial retrieved-content cases in `ai-service/tests/unit/rag_chatbot/test_agent_security.py`; Depends: T009; Done when synthetic job/CV content attempting to override system instructions, authorization or tool policy is treated only as untrusted data and no unauthorized handler is invoked.

### Implementation for User Story 2

- [X] T013 [P] [US2] Implement the read-only `rag.retrieve_context` handler and strict tool definition in `ai-service/src/talentpulse_ai/modules/rag_chatbot/agent_tools.py`; Depends: T011; Done when it reads only the authorized request snapshot through Foundation tool context, performs no Qdrant/SQL/network access, and returns validated tool output.
- [X] T014 [P] [US2] Extract/reuse existing job claim, citation and fallback validation for agent output in `ai-service/src/talentpulse_ai/modules/rag_chatbot/generation/generator.py`; Depends: T012; Done when final output passes existing canonical-job/evidence checks, exact duplicate citation keys are deduplicated, malformed/unknown/unpaired/cross-job citations invalidate their claims, and invalid output cannot fabricate a job or citation.
- [X] T031 [US2] Implement bounded single repair for invalid agent output in `ai-service/src/talentpulse_ai/modules/rag_chatbot/generation/generator.py`; Depends: T012, T014; Done when at most one repair is attempted only with remaining execution budget, unsupported claims/citations are never returned, and failure/exhaustion yields a safe DEGRADED/NO_EVIDENCE fallback or controlled error without legacy retry.
- [X] T015 [US2] Extend `ai-service/tests/integration/test_agent_chat.py` for JOB_SEARCH, ADVICE, structured filters, empty/unreliable retrieval, missing canonical context, citation normalization and the one-repair-then-fallback path; Depends: T013, T014, T031; Done when fake-provider tests distinguish empty evidence from retrieval/hydration failure, deduplicate exact citation keys, never return malformed/unpaired/cross-job citations with invalid claims, preserve locale/blocks/filter semantics, and use the specified safe outcome after failed/no-budget repair.

**Checkpoint**: JOB_SEARCH and ADVICE are independently validated; CV modes remain on legacy routing until their story is complete.

---

## Phase 5: User Story 3 - Phân tích và so sánh CV có ủy quyền (Priority: P1)

**Goal**: Expose only the currently authorized CV snapshot and precomputed deterministic match evidence; never recalculate or persist CV/job data in the agent.

**Independent Test**: Use synthetic CV/job fixtures and the existing authorized request boundary; verify CV_ANALYSIS and CV_JOB_COMPARISON outputs are tied to the supplied snapshot/match result and reject missing or mismatched authorization/evidence.

### Tests for User Story 3

- [X] T016 [P] [US3] Add mode-gated `career.read_matching_evidence` cases in `ai-service/tests/unit/rag_chatbot/test_agent_tools.py`; Depends: Phase 4; Done when matching evidence is readable only for CV_JOB_COMPARISON and the handler rejects absent or mismatched CV/job references without invoking the matcher.
- [X] T017 [P] [US3] Extend CV owner/consent/version regressions in `backend/tests/candidate-assistant/candidate-assistant-ai.loopback.integration.spec.ts`; Depends: Phase 4; Done when unauthorized, revoked-consent and stale-version cases stop before history is loaded or the AI request is made, non-CV mode receives no CV context/history from CV sessions, and existing authorized flow remains unchanged.

### Implementation for User Story 3

- [X] T018 [P] [US3] Implement `career.read_matching_evidence` in `ai-service/src/talentpulse_ai/modules/rag_chatbot/agent_tools.py`; Depends: T016; Done when it is read-only, mode-authorized, returns only request-provided deterministic evidence, and cannot call the matcher or business store.
- [X] T019 [P] [US3] Extend agent finalization in `ai-service/src/talentpulse_ai/modules/rag_chatbot/generation/generator.py` for CV_ANALYSIS and CV_JOB_COMPARISON; Depends: T014, T016; Done when CV snapshots require valid mode/consent/version context and generated prose cannot change deterministic score/signals or cite another CV/job.
- [X] T020 [US3] Extend `ai-service/tests/integration/test_agent_chat.py` with synthetic CV_ANALYSIS and CV_JOB_COMPARISON cases; Depends: T017, T018, T019; Done when authorized fixtures pass, invalid references are rejected, and no CV text appears in error/observation output.

**Checkpoint**: All four existing chatbot modes have independent synthetic coverage; no CV write or approval workflow is introduced.

---

## Phase 6: User Story 4 - Agent sử dụng công cụ an toàn và chịu lỗi (Priority: P2)

**Goal**: Enforce the two-tool allowlist, bounded execution, controlled errors and redacted Foundation observability.

**Independent Test**: Inject unknown/denied tools, malformed input/output, provider failure, timeout, cancellation and budget exhaustion; confirm safe termination, no unauthorized call, no same-request legacy retry and no sensitive telemetry.

### Tests for User Story 4

- [X] T021 [P] [US4] Add tool denial, malformed result, timeout and execution-budget cases in `ai-service/tests/unit/rag_chatbot/test_agent_failures.py`; Depends: Phase 5; Done when every negative fixture asserts the handler/next model step is not called after rejection or exhaustion.
- [X] T022 [P] [US4] Add redaction and correlation cases in `ai-service/tests/unit/rag_chatbot/test_agent_observability.py`; Depends: Phase 5; Done when observations assert correlation/capability/status/counts/error category while excluding prompt, history, CV and raw provider/tool payloads.

### Implementation for User Story 4

- [X] T023 [US4] Map Foundation `AgentError` and cancellation/budget failures to existing RAG safe error/degraded outcomes in `ai-service/src/talentpulse_ai/modules/rag_chatbot/agent.py`; Depends: T021; Done when failures stop safely, preserve the `RagGenerateResponse`/error boundary, and never invoke legacy generation in the same request.
- [X] T024 [US4] Record request-scoped Foundation execution observations through the existing observability contract in `ai-service/src/talentpulse_ai/modules/rag_chatbot/agent.py`; Depends: T022, T023; Done when success/failure/cancellation events are correlated and contain no prohibited user/provider content.

**Checkpoint**: Security/failure/telemetry unit tests pass; no tool performs writes, external I/O or nested model calls.

---

## Phase 7: User Story 5 - Chuyển đổi theo từng capability mà không đổi client (Priority: P2)

**Goal**: Wire server-side selection behind the existing RAG generation route, retain legacy default and prove compatibility/rollback.

**Independent Test**: Exercise the existing NestJS-to-FastAPI flow with capability unregistered/flag off, registered/flag on, agent failure and flag rollback; existing request/response and frontend contracts remain unchanged.

### Tests for User Story 5

- [X] T025 [P] [US5] Add selector matrix cases in `ai-service/tests/unit/rag_chatbot/test_agent_selection.py`; Depends: Phase 6; Done when unregistered or disabled selects legacy, only server-side registration plus flag selects one agent, and a client field cannot override selection.
- [X] T026 [P] [US5] Extend `backend/tests/candidate-assistant/candidate-assistant-ai.loopback.integration.spec.ts` for response/status/error compatibility, client-disconnect cancellation, process-interruption recovery and rollback; Depends: Phase 6; Done when public response fields, citation/block/filter metadata and idempotency remain compatible; disconnect/interruption leaves user message COMPLETED, marks assistant response FAILED, releases quota exactly once, attempts outbound abort where applicable and discards late results; active execution renews its lease, periodic recovery does not reconcile an unexpired/in-grace lease, reconciles an expired lease atomically once, and rollback selects legacy.
- [X] T034 [P] [US5] Add cancellation/recovery guard unit cases in `backend/tests/candidate-assistant/candidate-assistant.service.spec.ts`; Depends: Phase 6; Done when a canceled or recovered interrupted request cannot persist a late assistant response or commit quota, terminal assistant failure is preserved, quota release is idempotent, the accepted user message remains COMPLETED without auto-resume, and lease renewal/expiry grace plus conditional transition prevent reconciling a live or already-finalized execution.
- [X] T027 [P] [US5] Add internal route failure/rollback assertions in `ai-service/tests/integration/test_chat_api.py`; Depends: Phase 6; Done when tests specify no same-request legacy retry, no mid-request implementation switch, and legacy selection for the next request after flag-off.

### Implementation for User Story 5

- [X] T033 [US5] Propagate client-disconnect cancellation, lease renewal, periodic process-interruption reconciliation and late-result guards across `backend/src/candidate-assistant/candidate-assistant.controller.ts`, `backend/src/candidate-assistant/candidate-assistant.service.ts`, `backend/src/candidate-assistant/candidate-assistant-ai.client.ts`, `backend/src/ai-matching/ai-service.client.ts` and `backend/src/ai-matching/ai-service.transport.ts`; Depends: T026, T034; Done when each execution has a durable owner/expiry lease, renews every 10 seconds, expires after 30 seconds plus 5-second grace, and a 15-second reconciler terminalizes an orphan within 50 seconds under healthy DB/runtime; the reconciler uses an atomic conditional update. Prefer existing request/quota persistence; if it cannot hold lease fields, implement a minimal backward-compatible migration with compatibility tests and a documented rollback before rollout. No active execution in another instance is falsely reconciled; interrupted turns are not resumed/replayed; outbound abort is attempted when supported; late results cannot save/overwrite an assistant response or commit quota; user message remains COMPLETED, assistant response is FAILED and reservation is released exactly once. Provider inference cancellation is best-effort, not guaranteed.
- [X] T028 [US5] Register the completed `rag.generate` implementation and wire selector selection at `ai-service/src/talentpulse_ai/main.py`, `ai-service/src/talentpulse_ai/dependencies.py` and `ai-service/src/talentpulse_ai/modules/rag_chatbot/router.py`; Depends: T025, T026, T027, T033; Done when the existing route chooses exactly one implementation server-side, the flag defaults off, and internal/public schemas remain unchanged.

**Checkpoint**: Existing clients remain unchanged; capability can be disabled immediately. If lease persistence requires a schema migration, it is backward-compatible and has a tested rollback before rollout.

---

## Phase 8: Polish & Cross-Cutting Validation

**Purpose**: Run the complete documented gate and prepare a small, reviewable rollout change.

- [X] T029 Run the complete feature validation commands in `specs/002-career-chat-agent/quickstart.md`, `npm --prefix backend test -- --runInBand tests/candidate-assistant/`, `npm --prefix frontend run build` and `npm --prefix frontend run lint`; Depends: T001-T028, T030-T031, T033-T034; Done when Foundation/RAG tests, Ruff, mypy, NestJS unit/loopback/lifecycle tests, frontend type/build/lint checks and all four mode scenarios pass, with no public/internal API schema or unrelated frontend changes; any lease persistence migration is covered by compatibility and rollback tests.
- [X] T032 From `ai-service/`, run `uv run pytest tests/unit/agent_foundation tests/unit/rag_chatbot tests/integration/test_agent_chat.py tests/integration/test_chat_api.py`, and from repository root run `npm --prefix backend test -- --runInBand tests/candidate-assistant/`; repeat both deterministic suites ten consecutive times. Depends: T029; Done when response/status, citations, authorization/quota outcomes and fallback/error categories are stable across all ten runs without a live provider or byte-for-byte comparison of free-form text.

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**: T001 and T002 have no code dependencies and touch separate test files.
- **Phase 2 Foundational**: Depends on Phase 1; T003→T004 and T005→T006, with the two test tracks independent. Blocks all user-story implementation.
- **User Stories**: Follow spec priority and solo-developer order: US1 → US2 → US3 → US4 → US5. Each story starts with its tests and ends at its checkpoint.
- **Phase 8 Polish**: Depends on all desired stories and rollout tests.

### User Story Dependencies

- **US1 (P1)**: Depends on the bounded Foundation/provider path in Phase 2; provides request-scoped agent execution and conversation context.
- **US2 (P1)**: Depends on US1; adds prepared retrieval context and grounded job/advice output.
- **US3 (P1)**: Depends on US2 validation; adds authorized CV and precomputed matching evidence.
- **US4 (P2)**: Depends on US2/US3 tool contracts; adds failure, limits and redacted observations across both tools.
- **US5 (P2)**: Depends on all supported modes and safe failures; only then wires server-side capability routing.

### Parallel Opportunities

The developer should execute story phases sequentially. Within a phase, only tasks marked `[P]` are safe to prepare independently:

- **US1**: T007 and T008 are separate test files; complete both before T009.
- **US2**: T011 and T012 are separate test files; after both pass, T013 and T014 touch separate modules and may be implemented independently.
- **US3**: T016 and T017 use separate AI/backend test files; T018 and T019 touch separate AI modules after their tests pass.
- **US4**: T021 and T022 are separate test files; implementations remain sequential because error mapping and observation recording share `agent.py`.
- **US5**: T025-T027 and T034 are separate selector-unit, backend-loopback, service-unit and internal-API tests; complete them before T033 and selector wiring. T033 depends on T026 and T034; T028 depends on T033.

## MVP and Incremental Strategy

- **Internal MVP**: Phase 1 + Phase 2 + US1. This proves the request-scoped single-agent conversation path but remains disabled for real traffic; it is not a shippable chatbot replacement because retrieval/CV modes are not complete.
- **First rollout candidate**: Complete US1-US5, especially all four mode regressions and US5 selector/rollback tests, before enabling `rag.generate` for any production request.
- **Safe checkpoints**: After each phase, run that phase’s focused tests and keep the capability flag off. Prepare a small reviewable change per phase; do not bundle unrelated refactoring or alter frontend/API contracts.
- **Rollback**: Disable the existing server-side capability flag; requests not yet dispatched use legacy. Never retry an already-dispatched agent request through legacy.

## Notes

- Every task is unchecked and includes an ID, a repository path, an explicit dependency and a completion criterion.
- T030-T032 explicitly cover adversarial retrieved-content handling, the single bounded repair policy, and deterministic ten-run SC-009 verification across AI and backend fixtures. T017/T026/T033-T034 cover CV-history privacy and cancellation/late-result integration, unit-test and implementation outcomes.
- No separate execution store, session store, public endpoint, frontend change or external integration is planned. Prefer existing request/quota persistence for the durable lease; if it cannot hold the lease, implement and test a minimal backward-compatible migration with rollback before rollout.
- Tasks T003-T006 address the documented Bedrock timeout gap before allowing an agent request to use that provider.
