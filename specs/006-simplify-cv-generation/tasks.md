---
description: "Task list for simplifying CV generation"
---

# Tasks: Rút gọn quy trình tạo CV

**Input**: Design documents from `specs/006-simplify-cv-generation/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/cv-generation-compatibility.md`

**Tests**: Included because the specification and implementation plan require deterministic regressions before behavior changes.

**Organization**: Tasks are grouped by user story, with a shared evidence/setup phase and final cross-story verification.

## Phase 1: Setup and Evidence Baseline

**Purpose**: Establish an auditable before-change record without accessing secrets or contacting hosted providers.

- [ ] T001 [P] Record the current AI-service revision, enabled non-secret model profiles, and existing CV-generation processing stages in `specs/006-simplify-cv-generation/research.md`; do not read `.env` or credentials
- [ ] T002 [P] Inspect the fixed synthetic evaluation dataset and record its version, CV-generation/localization case count, and existing baseline availability in `specs/006-simplify-cv-generation/research.md`

---

## Phase 2: Foundational Contracts and Test Coverage

**Purpose**: Establish deterministic coverage and unchanged contracts before simplifying any processing behavior.

- [ ] T003 [P] Add deterministic regression cases for draft/review response contracts, source identity, locale, grounding, partial-safe output, and no-safe-output behavior in `ai-service/tests/unit/cv_generator/test_cv_generation.py`
- [ ] T004 [P] Add deterministic provider adapter construction tests for bounded Bedrock clients and Ollama-specific request settings in `ai-service/tests/unit/providers/test_provider_factory.py`
- [ ] T005 Add tests for finite provider-call caps, per-call/total deadlines, cancellation, and late-result rejection in `ai-service/tests/unit/cv_generator/test_operation_deadline.py`

**Checkpoint**: Baseline regressions pass using provider doubles only; no live provider call is made.

---

## Phase 3: User Story 1 - Nhận bản nháp CV tốt hơn trong ít bước hơn (Priority: P1)

**Goal**: Reduce only evidenced hosted-profile compensation while preserving the existing editable draft and selection behavior.

**Independent Test**: Run fixed synthetic cases against deterministic hosted-profile doubles and verify first-pass contract validity, selected template/locale/job behavior, and unchanged draft/review contracts. Hosted quality comparison remains opt-in.

### Tests for User Story 1

- [ ] T006 [P] [US1] Add deterministic tests that identify provider call kinds/counts and verify first-pass valid output for supported hosted profiles in `ai-service/tests/unit/cv_generator/test_cv_generation.py`
- [ ] T007 [P] [US1] Add regression tests that selected template, locale, and optional target job remain reflected in generated drafts in `ai-service/tests/integration/test_cv_api.py`

### Implementation for User Story 1

- [ ] T008 [US1] Inventory each generation/localization/repair/fallback stage and record KEEP, SIMPLIFY, REMOVE, or PROVIDER-SPECIFIC decisions with evidence and linked tests in `specs/006-simplify-cv-generation/research.md`
- [ ] T009 [US1] Implement only the smallest evidence-supported hosted-profile policy selection in `ai-service/src/talentpulse_ai/modules/cv_generator/service.py`, reusing existing localization and provider-limit policies
- [ ] T010 [US1] Apply any evidenced hosted-only core-generation or repair reduction while retaining local Qwen behavior and existing stage validation in `ai-service/src/talentpulse_ai/modules/cv_generator/core_generation.py`
- [ ] T011 [US1] Apply any evidenced hosted-only localization adjustment while retaining input bounds, locale checks, safe omission behavior, and local behavior in `ai-service/src/talentpulse_ai/modules/cv_generator/localization.py`
- [ ] T012 [US1] Keep Ollama `num_predict` configuration scoped to its adapter and verify hosted adapters do not receive local-only settings in `ai-service/src/talentpulse_ai/modules/cv_generator/provider_runtime.py`
- [ ] T013 [US1] Verify the internal bare-draft and optional review-envelope API responses remain unchanged for normal and reduced-stage generation in `ai-service/tests/integration/test_cv_api.py`

**Checkpoint**: The supported CV request returns an editable draft under the unchanged contracts; no unsupported simplification is accepted without recorded evidence.

---

## Phase 4: User Story 2 - Giữ nội dung đáng tin cậy khi quy trình được rút gọn (Priority: P1)

**Goal**: Preserve source grounding, privacy, safe partial output, explicit human approval, and canonical CV data boundaries.

**Independent Test**: Run synthetic adversarial and incomplete-input tests; confirm unsupported/wrong-source/wrong-locale claims are rejected or omitted with safe reasons, empty safe sets fail actionably, and NestJS/editor persistence remains explicit-save-only.

### Tests for User Story 2

- [ ] T014 [P] [US2] Add regressions for unsupported facts, wrong source indices, job-fact borrowing, prompt injection, and incorrect locale in `ai-service/tests/unit/cv_generator/test_cv_generation.py`
- [ ] T015 [US2] Add regressions for safe partial omissions, omission provenance, provider failure, and actionable failure when no safe content remains in `ai-service/tests/unit/cv_generator/test_cv_generation.py`
- [ ] T016 [P] [US2] Verify existing pending-draft Save, Reject, Expire, stale-approval, and no-auto-persistence behavior in `backend/tests/online-cvs/async-generation.service.spec.ts` and `frontend/src/pages/cv/CVEditorPage.test.mjs`

### Implementation for User Story 2

- [ ] T017 [US2] Preserve application-owned structure, factual grounding, source identity, locale, relevance, and safe-partial validation after provider output in `ai-service/src/talentpulse_ai/modules/cv_generator/validators.py`
- [ ] T018 [US2] Preserve per-field origin and omission-path/reason metadata when assembling reduced-stage drafts in `ai-service/src/talentpulse_ai/modules/cv_generator/draft_builder.py`
- [ ] T019 [US2] Ensure operational generation logs contain only sanitized status, error code, duration, and bounded counts in `ai-service/src/talentpulse_ai/modules/cv_generator/service.py`
- [ ] T020 [US2] Confirm the unchanged request, draft, review-envelope, and canonical persistence invariants are documented against implementation in `specs/006-simplify-cv-generation/contracts/cv-generation-compatibility.md`

**Checkpoint**: No reduced-stage result bypasses application validation or explicit applicant approval.

---

## Phase 5: User Story 3 - Chuyển đổi có kiểm soát giữa mô hình dịch vụ và môi trường local (Priority: P2)

**Goal**: Make changes measurable, provider-scoped, bounded, locally compatible, and reversible.

**Independent Test**: Run deterministic AI tests for hosted and local adapter profiles, verify evaluator filtering/metrics using synthetic fixtures, and verify rollback requires no migration or saved-CV repair. Do not run hosted evaluation without explicit authorization.

### Tests for User Story 3

- [ ] T021 [P] [US3] Add evaluator unit tests for CV-generation/localization journey filtering and safe call-kind, repair, latency, and omission metrics in `ai-service/tests/unit/evals/test_hosted_generation_eval.py`
- [ ] T022 [P] [US3] Add scripted Bedrock adapter tests proving timeout-bounded client construction matches production construction in `ai-service/tests/unit/providers/test_provider_factory.py`
- [ ] T023 [P] [US3] Add local-profile regressions for Ollama request settings, output contract, and bounded failure behavior in `ai-service/tests/unit/cv_generator/test_cv_generation.py`

### Implementation for User Story 3

- [ ] T024 [US3] Add repeatable selection of `CV_GENERATION` and `CV_LOCALIZATION` journeys while keeping the evaluator's existing all-journey default in `ai-service/src/talentpulse_ai/scripts/evaluation/hosted_generation_eval.py`
- [ ] T025 [US3] Emit bounded non-PII per-profile call-kind/count, repair, latency, omission, and contract metrics in `ai-service/src/talentpulse_ai/scripts/evaluation/hosted_generation_eval.py`
- [ ] T026 [US3] Reuse production-equivalent bounded Bedrock client construction when the evaluator supplies a provider timeout in `ai-service/src/talentpulse_ai/scripts/evaluation/hosted_generation_eval.py`
- [ ] T027 [US3] Document synthetic baseline/candidate comparison steps, required hosted authorization, quality thresholds, and code-policy rollback without migration in `specs/006-simplify-cv-generation/quickstart.md`
- [ ] T028 [US3] Update the disposition ledger with implementation references and deterministic evidence; leave hosted quality outcomes explicitly pending unless authorized in `specs/006-simplify-cv-generation/research.md`

**Checkpoint**: Provider/local behavior is testable and rollbackable; hosted evaluation has not run absent approval.

---

## Phase 6: Polish and Cross-Cutting Verification

**Purpose**: Verify all supported contracts and record measurable outcomes without exceeding authorization.

- [ ] T029 [P] Run AI-service CV generator, provider factory, CV API tests, Ruff, and mypy; record exact results and any unrelated failures in `specs/006-simplify-cv-generation/quickstart.md`
- [ ] T030 [P] Run the existing NestJS CV lifecycle and frontend editor tests using the documented Node version; record results in `specs/006-simplify-cv-generation/quickstart.md`
- [ ] T031 Compare fixed synthetic baseline and candidate with the opt-in evaluator only after explicit approval for provider cost/data processing; record first-pass validity, retries, human quality review, safety outcomes, and latency against SC-002 through SC-006 in `specs/006-simplify-cv-generation/research.md`
- [ ] T032 Review the final diff against the unchanged compatibility contract and confirm no schema, migration, public API, persisted-data, or automatic-save change in `specs/006-simplify-cv-generation/contracts/cv-generation-compatibility.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup and Evidence Baseline (Phase 1)**: No code dependencies; complete before selecting any behavior change.
- **Foundational (Phase 2)**: Depends on Phase 1; deterministic tests and bounds coverage block behavior simplification.
- **User Stories (Phases 3-5)**: Depend on Phase 2. US1 is the MVP; US2 preserves product safety; US3 completes measurement and rollback support.
- **Polish (Phase 6)**: Depends on implementation and deterministic verification. T031 additionally requires explicit provider-cost/data authorization and human-review approval.

### User Story Dependencies

- **US1 (P1)**: Starts after Phase 2. It delivers the reduced-but-compatible generation behavior.
- **US2 (P1)**: Starts after Phase 2 and can be developed independently, but must be verified against any US1 behavior changes before acceptance.
- **US3 (P2)**: Starts after Phase 2; evaluator changes can be implemented independently of provider behavior, while final comparison depends on an approved candidate and authorization.

### Parallel Opportunities

- T001 and T002 can run in parallel because they update separate evidence sections.
- T003 and T004 can run in parallel because they cover separate test files/areas; T005 follows the test location conventions and can proceed independently if placed in a distinct test module.
- In US1, T006 and T007 are parallel test work; T010 and T011 are separate module changes, but both depend on T008's evidence and T009's policy decision.
- In US2, T014, T015, and T016 can proceed in parallel; T017 and T018 can proceed in parallel after their regressions exist.
- In US3, T021-T023 can proceed in parallel. T024-T026 touch the same evaluator file and should be combined or sequenced to avoid conflicts.
- T029 and T030 can run in parallel after relevant changes are complete. T031 is optional and authorization-gated.

## Parallel Example: User Story 1

```text
After T008 records evidence and T009 defines the per-request policy:
Work A: T010 hosted/local core-generation behavior in ai-service/src/talentpulse_ai/modules/cv_generator/core_generation.py
Work B: T011 hosted/local localization behavior in ai-service/src/talentpulse_ai/modules/cv_generator/localization.py
Work C: T013 API contract regression in ai-service/tests/integration/test_cv_api.py
```

## Implementation Strategy

### MVP First (US1)

1. Complete Phase 1 and Phase 2.
2. Complete US1 using only evidence-supported, provider-scoped reductions.
3. Run deterministic AI-service tests and verify unchanged draft/review contracts.
4. Do not claim hosted quality improvement until an authorized fixed-case comparison and required human review pass.

### Incremental Delivery

1. Deliver US1 as a reversible generation-policy change.
2. Complete US2 safety and explicit-save regressions before accepting the candidate.
3. Complete US3 evaluator instrumentation and local-profile compatibility checks.
4. Run compatibility suites and, only with approval, hosted evaluation; restore the previous policy if thresholds regress.

## Notes

- Every task is a checklist item with a sequential ID; `[P]` is used only for independent work; story-phase tasks carry `[US1]`, `[US2]`, or `[US3]`.
- Hosted evaluation and human review are opt-in and require explicit authorization; do not use real CVs or read secrets.
- No database migration, public contract change, or automatic persistence is in scope.
