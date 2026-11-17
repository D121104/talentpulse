---
description: "Incremental implementation tasks for Agent Foundation"
---

# Tasks: TalentPulse Agent Foundation

**Input**: Design documents from `specs/001-agent-foundation/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/agent-execution.md`, `quickstart.md`

**Scope**: Shared Agent Foundation only. Do not implement complete Career Chat Agent or CV Generation Agent, business tool catalog, public approval UX/API, or change public request/response contracts.

**Execution model**: One developer, incremental and sequential across phases. `[P]` marks work that is independently verifiable and could be parallelized, though parallel contributors are not assumed.

## Phase 1: Setup and Baseline

**Purpose**: Record the existing compatibility baseline and confirm dependency/project conventions before changing runtime code.

- [X] T001 Run the existing AI and NestJS regression baselines in `ai-service/tests/integration/test_chat_api.py`, `ai-service/tests/integration/test_cv_api.py`, `backend/tests/candidate-assistant/` and `backend/tests/online-cvs/`
  - Dependencies: none.
  - Completion: run the existing AI Chat/CV API tests and the relevant NestJS Chat/CV loopback/lifecycle tests using repository scripts; capture baseline pass/fail in the implementation review without changing product behavior.
  - Baseline: AI service 24 passed; NestJS 2 suites and 9 tests passed under Node 24.14.1.
- [X] T002 Confirm the AI service dependency and package-lock conventions in `ai-service/pyproject.toml` and `ai-service/uv.lock`
  - Dependencies: T001.
  - Completion: determine the compatible LangGraph and approval-checkpointer package versions; no LangChain dependency is introduced; `uv lock --check` or the repository-equivalent lock validation passes.
  - Compatibility check: PyPI `langgraph` 1.2.22 and `langgraph-checkpoint-postgres` 3.2.1 both support Python >=3.10, compatible with this service's Python >=3.12,<3.14; their checkpoint dependency ranges overlap. No dependencies were added in this phase.
  - Lock validation: `uv 0.12.6`, `uv lock --check` passed.

**Checkpoint**: Existing API and lifecycle behavior is recorded; dependency choices are known before runtime implementation.

**Commit boundary**: Baseline/dependency preparation only; do not combine it with runtime behavior changes.
**Tests after phase**: Run the baseline commands from T001 and lock validation from T002.
**Manual review**: Recommended. Confirm the dependency does not introduce `LangChain create_agent` or a new service.

---

## Phase 2: Foundational Prerequisites

**Purpose**: Install the required orchestration dependency and establish the package/test locations that block all story implementation.

- [X] T003 Add pinned `langgraph`, `langgraph-checkpoint-postgres` and `psycopg[binary,pool]` dependencies to `ai-service/pyproject.toml` and update `ai-service/uv.lock`
  - Dependencies: T002.
  - Completion: `uv sync --locked` resolves successfully; `StateGraph` and PostgresSaver dependencies are importable; no `create_agent`, LangSmith, or unrelated framework dependency is added.
- [X] T004 Create the Agent Foundation package and test package in `ai-service/src/talentpulse_ai/agent_foundation/__init__.py` and `ai-service/tests/unit/agent_foundation/__init__.py`
  - Dependencies: T003.
  - Completion: both packages are importable/discoverable by the configured test and lint tools; existing package layout remains unchanged.

**Checkpoint**: Required framework and package skeleton are ready. No capability routing or approval persistence is active.

**Commit boundary**: Dependency and package skeleton.
**Tests after phase**: Run dependency lock validation, Ruff on the new package, and confirm pytest discovers the new test package.
**Manual review**: Recommended before beginning user-story work.

---

## Phase 3: User Story 1 - Shared Agent Execution (Priority: P1, MVP)

**Goal**: A capability can execute a typed LangGraph workflow using the shared provider contract, return a structured result/error, and coexist with legacy implementations.

**Independent Test**: With a deterministic fake provider, run a synthetic capability through `StateGraph`; assert typed final output or classified safe error and prove no existing capability is required to migrate.

### Tests for User Story 1

- [X] T005 [P] [US1] Add StateGraph topology and typed state contract tests in `ai-service/tests/unit/agent_foundation/test_execution.py`
  - Dependencies: T004.
  - Completion: tests assert prepare → model decision → validate/finalize topology, typed state/result fields, final route, and invalid/unknown decision rejection; tests fail before the implementation tasks below.
- [X] T006 [P] [US1] Add fake-provider normalization tests in `ai-service/tests/unit/agent_foundation/test_model.py`
  - Dependencies: T004.
  - Completion: tests cover structured provider output, typed decision-envelope parsing, invalid output and provider failure without live model calls.

### Implementation for User Story 1

- [X] T007 [US1] Define execution request, typed graph state, result, usage and safe error contracts in `ai-service/src/talentpulse_ai/agent_foundation/contracts.py`
  - Dependencies: T005.
  - Completion: contracts represent server-created run/correlation/capability IDs, request-scoped state, the documented statuses/error codes, and typed outputs; no business persistence or raw credentials are included.
- [X] T008 [US1] Implement the shared StateGraph builder and request-scoped executor in `ai-service/src/talentpulse_ai/agent_foundation/execution.py`
  - Dependencies: T007.
  - Completion: uses `StateGraph` directly with prepare, model decision and finalize nodes plus conditional routing; normal executions compile without a checkpointer and return a typed result.
- [X] T009 [US1] Implement the shared model adapter over existing provider protocols in `ai-service/src/talentpulse_ai/agent_foundation/model.py`
  - Dependencies: T006, T007.
  - Completion: reuses existing provider factory/protocols, supports structured output where available and validated typed-envelope parsing otherwise; normalizes usage and provider errors without raw payload leakage.
- [X] T010 [US1] Verify shared execution and provider adapter with unit tests in `ai-service/tests/unit/agent_foundation/test_execution.py` and `ai-service/tests/unit/agent_foundation/test_model.py`
  - Dependencies: T008, T009.
  - Completion: all T005/T006 cases pass with deterministic fakes; two synthetic capability definitions can use the same model contract without sharing business prompts or schemas; an ordinary execution retry after simulated process interruption starts with a distinct `run_id` and does not resume prior state.

**Checkpoint**: A synthetic capability can run independently through StateGraph and return the common result contract.

**Commit boundary**: Contracts, executor, model adapter and their tests; keep approval persistence out of this commit.
**Tests after phase**: Run `uv run pytest tests/unit/agent_foundation` and `uv run ruff check src/talentpulse_ai/agent_foundation tests/unit/agent_foundation` from `ai-service/`.
**Manual review**: Required before continuing; inspect graph topology, provider-boundary reuse, and absence of regular-run checkpointing.

---

## Phase 4: User Story 2 - Contracted and Authorized Tools (Priority: P1)

**Goal**: Tool calls are reusable but constrained by schemas, capability allowlists, authorization context and execution budgets before handlers run.

**Independent Test**: Register a synthetic handler, then exercise valid invocation, malformed input, missing permission and cross-capability denial; denied cases must not call the handler.

### Tests for User Story 2

- [X] T011 [P] [US2] Add tool contract and dispatcher security tests in `ai-service/tests/unit/agent_foundation/test_tools.py`
  - Dependencies: T007.
  - Completion: tests cover valid input/output, invalid input/output, unknown tool, capability allowlist mismatch, denied operation and proof that rejected calls do not invoke the handler.
- [X] T012 [P] [US2] Add a fake-provider/tool boundary integration test in `ai-service/tests/integration/test_agent_foundation.py`
  - Dependencies: T007.
  - Completion: the test drives the expected model-decision → synthetic tool → final-result path through the service integration boundary using fakes; invalid/denied calls assert no handler invocation; the test is in place before dispatcher implementation and makes no live provider call.

### Implementation for User Story 2

- [X] T013 [US2] Define reusable tool, invocation and execution-context contracts in `ai-service/src/talentpulse_ai/agent_foundation/tools.py`
  - Dependencies: T011.
  - Completion: definitions include stable ID, purpose, input/output schemas, allowed capabilities, required operation, timeout and side-effect class; trusted authorization context is not model-editable.
- [X] T014 [US2] Implement the validated tool registry/dispatcher and connect the bounded tool route in `ai-service/src/talentpulse_ai/agent_foundation/tools.py` and `ai-service/src/talentpulse_ai/agent_foundation/execution.py`
  - Dependencies: T008, T012, T013.
  - Completion: dispatcher checks registration, capability allowlist, operation authorization, input schema and budget before handler; validates output and emits safe classified errors; no generic SQL/HTTP/shell or arbitrary write handler exists.
  - Integration verification: T012 passes against the real StateGraph dispatcher; no business tool catalog or live provider call is added.

**Checkpoint**: The tool boundary is demonstrably secure using synthetic handlers only.

**Commit boundary**: Tool contracts, dispatcher, graph integration and unit tests.
**Tests after phase**: Run Agent Foundation unit tests and `tests/integration/test_agent_foundation.py`, then Ruff and mypy for `agent_foundation`.
**Manual review**: Required; confirm permission is application-enforced and retrieved/CV text cannot expand the allowlist.

---

## Phase 5: User Story 3 - Bounded, Diagnosable Execution (Priority: P2)

**Goal**: Each run has bounded steps/model/tool calls/deadline, stable terminal outcomes and useful redacted operational metadata.

**Independent Test**: Use fake provider/tool implementations to exercise completion, failure, cancellation and each budget boundary; assert no calls occur after the limit and telemetry contains no sensitive content.

### Tests for User Story 3

- [X] T015 [P] [US3] Add execution-policy, cancellation and redaction tests in `ai-service/tests/unit/agent_foundation/test_policy.py` and `ai-service/tests/unit/agent_foundation/test_observability.py`
  - Dependencies: T007, T013.
  - Completion: tests cover step/model/tool/deadline caps, cancellation and late provider result, safe errors, and synthetic CV/PII/prompt/credential markers absent from emitted metadata.

### Implementation for User Story 3

- [X] T016 [US3] Implement trusted per-capability execution policy and budget enforcement in `ai-service/src/talentpulse_ai/agent_foundation/policy.py`
  - Dependencies: T015.
  - Completion: configured limits cover graph steps, model calls, tool calls and elapsed deadline; model/client output cannot increase limits; exhausted or cancelled runs do not dispatch another model/tool call.
- [X] T017 [US3] Integrate policy and stable terminal/error mapping into `ai-service/src/talentpulse_ai/agent_foundation/execution.py`
  - Dependencies: T016.
  - Completion: success, provider/tool error, denial, limit, cancellation and observed interruption produce documented statuses and safe error codes; no automatic same-request legacy retry occurs.
- [X] T018 [US3] Add redacted execution/model/tool metadata instrumentation in `ai-service/src/talentpulse_ai/agent_foundation/observability.py`
  - Dependencies: T007, T015.
  - Completion: run/correlation/capability/status/duration/call counts/error category are available; prompt, CV, PII, credentials, raw tool payloads and provider output are excluded.
- [X] T019 [US3] Verify policy, terminal states and redaction in `ai-service/tests/unit/agent_foundation/test_policy.py` and `ai-service/tests/unit/agent_foundation/test_observability.py`
  - Dependencies: T017, T018.
  - Completion: all T015 cases pass; in a deterministic synthetic run set, at least 95% of executions contain capability, terminal status, duration and error type when applicable; test data includes no live provider or sensitive fixture.

**Checkpoint**: Normal runs terminate within configured policy, and safe diagnostics are test-proven.

**Commit boundary**: Policy, runtime integration and redacted observability.
**Tests after phase**: Run Agent Foundation unit tests, Ruff and mypy; run tests without provider credentials.
**Manual review**: Required for budget exhaustion, cancellation races and redaction paths.

---

## Phase 6: User Story 4 - Legacy Coexistence, Feature Selection and Rollback (Priority: P1)

**Goal**: Existing Chat/CV routes and behavior remain unchanged; each capability stays on legacy by default and can be explicitly routed/rolled back without a second execution in the same request.

**Independent Test**: With flags disabled, existing AI routes use legacy and their existing contract tests pass; with a synthetic capability enabled, only that capability selects the agent; disabling it sends subsequent requests to legacy.

### Tests for User Story 4

- [X] T020 [P] [US4] Add selector, default-legacy and no-same-request-fallback tests in `ai-service/tests/unit/agent_foundation/test_selector.py`
  - Dependencies: T008, T017.
  - Completion: tests prove disabled/unregistered capabilities select legacy, explicit opt-in only affects its capability, a dispatched request does not switch implementation, and the next request after disable selects legacy.
- [X] T021 [P] [US4] Capture Chat/CV API compatibility regression expectations in `ai-service/tests/integration/test_chat_api.py` and `ai-service/tests/integration/test_cv_api.py`
  - Dependencies: T001.
  - Completion: existing public/internal schemas, status/error behavior, Chat response/citation behavior and CV `EDITOR_ONLY` draft semantics remain asserted without requiring full agent implementations.

### Implementation for User Story 4

- [X] T022 [US4] Add server-side capability implementation selection in `ai-service/src/talentpulse_ai/agent_foundation/selector.py`
  - Dependencies: T020.
  - Completion: trusted per-capability configuration chooses legacy or agent exactly once per request; default is legacy; no request field or model output can enable an agent.
- [X] T023 [US4] Wire the selector through existing FastAPI composition and dependency wiring in `ai-service/src/talentpulse_ai/dependencies.py` and `ai-service/src/talentpulse_ai/main.py`
  - Dependencies: T022.
  - Completion: Foundation services are composed without changing public routers/DTOs or migrating Chat/CV business workflows; legacy remains the default for all existing capabilities.
- [X] T024 [US4] Add selector configuration and rollback-safe defaults in `ai-service/src/talentpulse_ai/core/config.py`
  - Dependencies: T022.
  - Completion: capability selection is server-controlled and off by default; disabling an agent routes only subsequent requests to legacy; pending approval resume handling is not disabled by this selector.
- [X] T025 [US4] Run AI and NestJS compatibility regressions in `ai-service/tests/integration/test_chat_api.py`, `ai-service/tests/integration/test_cv_api.py`, `backend/tests/candidate-assistant/candidate-assistant-ai.loopback.integration.spec.ts` and `backend/tests/online-cvs/async-generation.service.spec.ts`
  - Dependencies: T021, T023, T024.
  - Completion: existing request/response contracts, Chat session/citation behavior, CV queue/cancel/version fences and `EDITOR_ONLY` persistence pass; no same-request fallback is observed.

**Checkpoint**: Legacy-first selection, opt-in isolation and rollback semantics are verified before approval persistence is introduced.

**Commit boundary**: Selector/config/composition in one reviewable change; regression assertions may be committed separately beforehand.
**Tests after phase**: Run AI API tests and the listed NestJS loopback/lifecycle tests.
**Manual review**: Required; verify no public API change, no implicit agent rollout and clear rollback behavior.

---

## Phase 7: User Story 5 - Approval-Only Checkpoint and Future Capability Readiness (Priority: P3)

**Goal**: Provide an internal approval pause/resume seam with minimal durable state, 24-hour expiry and restricted persistence, without implementing CV Agent or approval UX.

**Independent Test**: With synthetic references and a PostgreSQL test database, interrupt an approval graph, create a new graph/process instance, resume the same thread with an authorized decision, and prove stale/rejected/expired cases never reach a write handler and terminal checkpoints are deleted.

### Tests for User Story 5

- [X] T026 [P] [US5] Add approval contract and state-privacy unit tests in `ai-service/tests/unit/agent_foundation/test_approval.py`
  - Dependencies: T007.
  - Completion: tests cover reference/version/action-only state, decision schema/status, duplicate/stale/expired decisions and proof that serialized state excludes CV text, prompts, messages, model output and credentials.
- [X] T027 [P] [US5] Add PostgreSQL approval checkpoint recovery tests in `ai-service/tests/integration/test_agent_checkpoint.py`
  - Dependencies: T026.
  - Completion: test fixture requires a dedicated migrated PostgreSQL test database and asserts pending interrupt, process/graph recreation, same-thread resume, cleanup and no write on reject/stale/expiry; no production database or business data is used.

### Implementation for User Story 5

- [X] T028 [US5] Define minimal approval request, decision and checkpoint graph contracts in `ai-service/src/talentpulse_ai/agent_foundation/approval.py`
  - Dependencies: T026.
  - Completion: fields are limited to opaque approval/operation/resource references, expected version, allowlisted action, expiry and graph schema version; decision is trusted input and cannot contain CV content.
- [X] T029 [US5] Implement the separate approval StateGraph with interrupt and authorized resume routing in `ai-service/src/talentpulse_ai/agent_foundation/approval.py`
  - Dependencies: T028.
  - Completion: graph pauses before any material write; only validated NestJS decision resumes it; write/action execution is delegated to an owner boundary and is idempotency-keyed; regular execution graph remains uncheckpointed.
- [X] T030 [US5] Add the restricted PostgresSaver adapter and lifecycle wiring in `ai-service/src/talentpulse_ai/infrastructure/agent_checkpointer.py` and `ai-service/src/talentpulse_ai/main.py`
  - Dependencies: T003, T027, T029.
  - Completion: only approval graph uses PostgresSaver; setup/DDL is not run on a request path; runtime credentials are restricted to checkpoint tables and do not grant business-table access; pool closes with service lifecycle.
- [X] T031 [US5] Add checkpoint schema migration and rollback using the repository's established migration mechanism
  - Dependencies: T030.
  - Completion: migration provisions only PostgresSaver checkpoint tables/required privileges, supports rollback without touching business tables, and documents the dedicated runtime-role grants; exact migration location follows the repository migration convention confirmed during implementation.
- [X] T032 [US5] Implement 24-hour approval expiry, cleanup and resume validation in `ai-service/src/talentpulse_ai/agent_foundation/approval.py` and `ai-service/src/talentpulse_ai/infrastructure/agent_checkpointer.py`
  - Dependencies: T028, T030, T031.
  - Completion: expiry is fixed at approval creation; decisions at/after expiry, duplicate decisions, non-pending IDs and stale versions are rejected before continuation; terminal/expired checkpoint threads are deleted; pending threads remain resumable during rollback.
- [X] T033 [US5] Add the service-scoped internal resume boundary in `ai-service/src/talentpulse_ai/modules/agent_foundation/router.py` and `ai-service/src/talentpulse_ai/core/security.py`
  - Dependencies: T032.
  - Completion: only trusted NestJS service identity with `agent:resume` is accepted; the handler uses server-held approval ID/thread mapping, validates decision/version/expiry and returns safe status only; no public approval endpoint or frontend flow is added.
- [X] T034 [US5] Verify approval integration, restart, expiry, rollback and privacy cases in `ai-service/tests/integration/test_agent_checkpoint.py` and `ai-service/tests/unit/agent_foundation/test_approval.py`
  - Dependencies: T031, T032, T033.
  - Completion: PostgreSQL recovery and all unit cases pass; inspection of persisted checkpoint data confirms reference-only content; rollback stops new approval graph starts but allows pending threads to resolve/cancel/expire.
- [X] T035 [US5] Verify future Career Chat/CV capability contracts using `ai-service/tests/unit/agent_foundation/test_future_capabilities.py`
  - Dependencies: T010, T014, T019, T025, T034.
  - Completion: tests map the documented Career Chat and CV Generation input/output seams, model contract, tool policy and approval boundary to Foundation contracts; any unsupported requirement is an explicit failing assertion or documented gap; neither agent workflow nor business tool is implemented.

**Checkpoint**: Approval-only graph recovery is verified against a dedicated PostgreSQL test database; public APIs and business tables remain unchanged.

**Commit boundary**: Approval contract/graph, PostgresSaver/migration, resume security/expiry, and integration tests should be separate reviewable commits in that order.
**Tests after phase**: Run approval unit tests, PostgreSQL checkpoint integration tests, AI Chat/CV API regressions, Ruff and mypy.
**Manual review**: Required before any deployment. Review database grants/migration rollback, serialized state contents, authorization and pending-thread behavior during rollback.

---

## Phase 8: Polish and Cross-Cutting Verification

**Purpose**: Run the complete deterministic quality gate, inspect scope and confirm implementation remains reversible.

- [X] T036 [P] Run the Agent Foundation and existing AI regression quality gates from `specs/001-agent-foundation/quickstart.md`
  - Dependencies: T035.
  - Completion: relevant `pytest`, Ruff format/check and mypy commands pass; provider tests use fakes; PostgreSQL-only approval tests run only against the dedicated test instance.
  - Verification: 472 passed and 4 PostgreSQL tests skipped because no dedicated test URL was configured in this run; the checkpoint/migration cases were previously exercised against a disposable PostgreSQL instance. Ruff check, scoped format check and mypy passed.
- [X] T037 [P] Run NestJS Chat/CV compatibility regression tests in `backend/tests/candidate-assistant/` and `backend/tests/online-cvs/`
  - Dependencies: T035.
  - Completion: relevant contract, loopback, queue, cancellation, stale/version and `EDITOR_ONLY` tests pass without public contract changes.
  - Verification: 2 Jest suites passed, 9 tests passed on Node 24. The migration integration test skipped because no dedicated migration DB URL was configured in this run; it previously passed against the disposable test database.
- [X] T038 Review final implementation scope and rollback path in `specs/001-agent-foundation/plan.md`, `specs/001-agent-foundation/spec.md` and the changed Agent Foundation modules
  - Dependencies: T036, T037.
  - Completion: confirm no full Chat/CV Agent, business tool catalog, public approval UI/API, raw sensitive checkpoint state, or same-request agent-to-legacy fallback was introduced; capability rollback and pending approval drain/expiry behavior are documented and tested.
  - Review: current capabilities remain legacy by default; disabling selects legacy for later requests without retrying within a dispatched request. Approval rollback denies new starts while compatible pending actions can still resume and expire. No full Chat/CV Agent, business tool, public approval API/UI or sensitive checkpoint fields were added.

**Commit boundary**: Keep quality-only fixes separate from functional changes; do not combine unrelated cleanup.
**Tests after phase**: Run all commands in `specs/001-agent-foundation/quickstart.md` and applicable repository quality gates.
**Manual review**: Required as the final pre-merge review.

---

## Dependencies and Recommended Execution Order

### Strict sequence for one developer

`T001 → T002 → T003 → T004 → T005–T010 → T011–T014 → T015–T019 → T020–T025 → T026–T035 → T036–T038`.

Complete each phase checkpoint and review before starting the next. Within a phase, tests are written before implementation and should fail for the missing behavior first. Tasks marked `[P]` touch separable files or verification surfaces but do not imply parallel staffing.

### Story dependency graph

```text
Setup (T001-T002)
  -> Foundation (T003-T004)
    -> US1 shared execution/model contract (T005-T010)
      -> US2 tool contracts/dispatch (T011-T014)
  -> US3 policy/observability (T015-T019)
          -> US4 selector, compatibility and rollback (T020-T025)
            -> US5 approval-only graph/checkpoint (T026-T035)
              -> Polish (T036-T038)
```

US1 is the MVP runtime slice, but do not enable a production capability at that point. Production opt-in depends on tool safety, bounded execution, compatibility/rollback and privacy gates. US5 intentionally adds only the approval seam, not a complete CV Agent or user-facing approval flow.

### Parallel opportunities

- T005 and T006 can be authored independently after T004.
- T015 policy tests and observability tests can be authored independently after their contracts exist.
- T020 selector tests and T021 compatibility assertions can be prepared independently after the baseline/runtime is available.
- T026 and T027 test design can proceed independently after the approval contract is agreed, though PostgreSQL integration execution waits for the adapter/migration.
- T036 and T037 verification can run independently after implementation is complete.

## Implementation Strategy

### MVP First

1. Complete Setup and Foundational phases.
2. Complete US1 and prove synthetic StateGraph execution with fake providers.
3. Stop at the US1 checkpoint for review; this is an internal MVP only and is not production capability rollout.
4. Add US2 and US3 safety gates before any capability can be opted in.
5. Add US4 selector and rollback, preserving all current routes and legacy defaults.
6. Add US5 only after its restricted PostgreSQL migration and recovery tests are ready.

### Safe review checkpoints

- After T004: inspect dependencies and package discovery.
- After T010: inspect graph topology and provider boundary.
- After T014: inspect dispatcher authorization and prove no real business tools were added.
- After T019: inspect all budget/cancellation/redaction paths.
- After T025: inspect API compatibility, legacy defaults and rollback behavior.
- After T034: inspect actual checkpoint contents, DB role grants and pending-approval recovery.
- After T038: perform final scope/security review before merge or deployment.

## Notes

- Every task line uses the required checklist form `- [ ] Tnnn [P?] [USn?] action with file path`.
- Dependency and verifiable completion details are attached to each task.
- The plan describes proposed paths; the approval migration location must follow the migration mechanism confirmed in the repository during implementation.
- Tests use synthetic data and fake providers; do not use production credentials or real CV content.
- No Chat Agent, CV Agent, business tool catalog, public approval endpoint/UI, or frontend implementation is included.
