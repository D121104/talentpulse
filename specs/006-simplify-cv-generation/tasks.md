---
description: "Task list for the single Agent CV-generation flow"
---

# Tasks: Rút gọn quy trình tạo CV

**Input**: `specs/006-simplify-cv-generation/`

**Tests**: Deterministic provider doubles cover schema, prompt locale, source indices, provider rejection, review metadata and persistence lifecycle. Live hosted evaluation remains authorization-gated.

## Phase 1: Setup and Baseline Record

**Purpose**: Record the previous implementation and fixed synthetic dataset without reading secrets or making provider calls.

- [X] T001 Record the pre-change revision and checked-in non-secret provider defaults in `specs/006-simplify-cv-generation/research.md`
- [X] T002 Record the fixed synthetic dataset size and absence of a hosted baseline report in `specs/006-simplify-cv-generation/research.md`

## Phase 2: Structured Agent Contract

**Purpose**: Establish deterministic tests for a single final-schema provider response and bounded execution.

- [X] T003 [P] Test the complete CV structured response schema, locale prompt and app-owned identity fields in `ai-service/tests/unit/cv_generator/test_structured_agent.py`
- [X] T004 [P] Test direct final-schema structured output and timeout-aware provider construction in `ai-service/tests/unit/agent_foundation/test_model.py` and `ai-service/tests/unit/providers/test_provider_factory.py`
- [X] T005 Test one model call, zero tool calls, finite timeout and late-result handling in `ai-service/tests/unit/agent_foundation/test_execution.py`

**Checkpoint**: Routine tests use only synthetic inputs and provider doubles.

## Phase 3: User Story 1 - Draft CV bằng Gemini/Bedrock trong một lần gọi (Priority: P1)

**Goal**: Remove the local-model-oriented generation stages and create the complete CV in one locale-specific structured response.

**Independent Test**: Verify one structured model call with the exact output schema, locale instruction, valid source indices, and unchanged bare-draft/review-envelope API responses.

### Tests for User Story 1

- [X] T006 [P] [US1] Verify one-call locale-specific CV generation and provider metrics in `ai-service/tests/unit/evals/test_application_journeys.py`
- [X] T007 [P] [US1] Verify the CV API always dispatches to Agent and returns the same editable-draft contract in `ai-service/tests/integration/test_cv_api.py`

### Implementation for User Story 1

- [X] T008 [US1] Record the user-directed stage removals and retained safety boundaries in `specs/006-simplify-cv-generation/research.md`
- [X] T009 [US1] Remove legacy CV service/agent selection and route directly to the structured Agent in `ai-service/src/talentpulse_ai/main.py` and `ai-service/src/talentpulse_ai/modules/cv_generator/router.py`
- [X] T010 [US1] Remove core generation, localization, lexical/skill rules, bullet shaping, repair and fallback modules in `ai-service/src/talentpulse_ai/modules/cv_generator/`
- [X] T011 [US1] Put the requested locale in the single generation prompt and remove the separate localization path in `ai-service/src/talentpulse_ai/modules/cv_generator/agent.py`
- [X] T012 [US1] Reject non-Gemini/Bedrock CV providers without Ollama or legacy fallback in `ai-service/src/talentpulse_ai/modules/cv_generator/agent.py`
- [X] T013 [US1] Keep bare draft and safe Agent review-envelope responses in `ai-service/src/talentpulse_ai/modules/cv_generator/router.py`

**Checkpoint**: All new CV requests use Agent and no request can select the removed legacy generation path.

## Phase 4: User Story 2 - Giữ quyền kiểm soát dữ liệu CV (Priority: P1)

**Goal**: Preserve consent, app-owned identity, source-index association, pending review and explicit Save while removing lexical/skill/localization passes.

**Independent Test**: Verify invalid source indices fail safely, provider output cannot replace identity/contact fields, no-reviewable-output fails, and NestJS/editor never persists before explicit approval.

### Tests for User Story 2

- [X] T014 [P] [US2] Add deterministic regressions for prompt-injection separation and duplicate/unknown source indices in `ai-service/tests/unit/cv_generator/test_structured_agent.py`
- [X] T015 [US2] Add a regression that schema-valid output with no reviewable CV sections fails without staging content in `ai-service/tests/unit/cv_generator/test_structured_agent.py`
- [X] T016 [P] [US2] Verify pending-draft Save, Reject, Expire, stale-approval and no-auto-persistence behavior in `backend/tests/online-cvs/async-generation.service.spec.ts` and `frontend/src/pages/cv/CVEditorPage.test.mjs`

### Implementation for User Story 2

- [X] T017 [US2] Keep app-owned identity/contact copying and source-index validation in `ai-service/src/talentpulse_ai/modules/cv_generator/agent.py`
- [X] T018 [US2] Build review source references and field origins alongside the structured draft in `ai-service/src/talentpulse_ai/modules/cv_generator/agent.py`
- [X] T019 [US2] Keep safe status/latency/count observations without CV text, prompts or provider payloads in `ai-service/src/talentpulse_ai/modules/cv_generator/agent.py`
- [X] T020 [US2] Update the compatibility contract for Agent-only generation while retaining review/persistence guarantees in `specs/006-simplify-cv-generation/contracts/cv-generation-compatibility.md`

**Checkpoint**: Every accepted draft remains pending review; canonical CV/profile content changes only after explicit Save.

## Phase 5: User Story 3 - Đo lường và cấu hình provider có kiểm soát (Priority: P2)

**Goal**: Measure one-call structured generation and keep Gemini/Bedrock adapter execution bounded.

**Independent Test**: Use synthetic evaluator cases for both supported locales; verify filtering, call count, tool count, latency, omissions and non-release-ready output.

### Tests for User Story 3

- [X] T021 [P] [US3] Test CV journey selection and sanitized one-call metrics in `ai-service/tests/unit/evals/test_application_journeys.py` and `ai-service/tests/unit/evals/test_hosted_generation_eval.py`
- [X] T022 [P] [US3] Verify direct structured schema and timeout-bounded Bedrock construction in `ai-service/tests/unit/agent_foundation/test_model.py` and `ai-service/tests/unit/providers/test_provider_factory.py`
- [X] T023 [P] [US3] Verify Ollama is rejected as a CV generation provider in `ai-service/tests/unit/cv_generator/test_structured_agent.py`

### Implementation for User Story 3

- [X] T024 [US3] Keep repeatable `CV_GENERATION`/`CV_LOCALIZATION` evaluation filters with all-journey default in `ai-service/src/talentpulse_ai/scripts/evaluation/hosted_generation_eval.py`
- [X] T025 [US3] Report bounded call, repair, tool, latency and omission metrics for each structured draft in `ai-service/src/talentpulse_ai/scripts/evaluation/hosted_generation_eval.py`
- [X] T026 [US3] Use production-equivalent bounded Bedrock client construction for evaluator calls in `ai-service/src/talentpulse_ai/scripts/evaluation/hosted_generation_eval.py`
- [X] T027 [US3] Document Gemini/Bedrock startup, deterministic tests, hosted authorization and rollback in `specs/006-simplify-cv-generation/quickstart.md`
- [X] T028 [US3] Record the new single-call architecture and removal decisions in `specs/006-simplify-cv-generation/research.md`

**Checkpoint**: Deterministic evaluation is runnable; hosted comparison remains opt-in and is not represented as complete.

## Phase 6: Polish and Cross-Cutting Verification

**Purpose**: Verify AI, backend and frontend integration without making unauthorized live provider calls.

- [X] T029 [P] Run relevant AI-service tests, Ruff and mypy; record results in `specs/006-simplify-cv-generation/quickstart.md`
- [X] T030 [P] Run backend lifecycle/build and frontend editor tests on Node 24; record results in `specs/006-simplify-cv-generation/quickstart.md`
- [ ] T031 Run the hosted baseline/candidate comparison and human review only after explicit provider cost/data authorization in `specs/006-simplify-cv-generation/research.md`
- [X] T032 Review the final diff against API, consent and explicit-save compatibility requirements in `specs/006-simplify-cv-generation/contracts/cv-generation-compatibility.md`

## Dependencies and Execution Order

- Phase 1 precedes structured-contract tests; Phase 2 precedes implementation.
- US1 creates the single Agent response. US2 verifies source/consent/review boundaries independently. US3 evaluates provider behavior and remains compatible with the supported profiles.
- T031 is authorization-gated; deterministic tests do not substitute for hosted quality results.
- Parallel work: T003/T004; T006/T007; T014/T016; T021/T022/T023; T029/T030. Tasks changing the same file remain sequential.

## MVP

Complete T001-T013 for the single structured Agent path, then T016-T020 for consent and review safety. Do not enable a production rollout based only on deterministic fixtures; complete T031 after authorization and human review.
