---
description: "Implementation tasks for the TalentPulse CV Generation Agent"
---

# Tasks: TalentPulse CV Generation Agent

**Input**: Design documents in `specs/005-cv-generation-agent/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, and `contracts/`

**Organization**: Setup and shared blocking work first, followed by user stories in priority order. Tests are included because the specification and request explicitly require unit, integration, and regression coverage.

**Solo execution**: Execute tasks in listed order and use the checkpoints before moving to the next phase. `[P]` only marks independent baseline/test tasks; it does not assume parallel contributors or branches.

## Phase 1: Setup and Contract Baseline

**Purpose**: Freeze existing behavior before introducing the Agent path.

**Recommended order**: T001 and T002 are independent. A solo developer should complete one, review its result, then complete the other.

- [x] T001 [P] Add AI CV contract characterization cases in `ai-service/tests/unit/cv_generator/test_cv_generation.py`; Depends: none. Done when: existing `CvDraftRequest`/`CvDraft` fields, `template1`/`template2`, supported locales, `source_index`, and the current provider-double pipeline are asserted without live provider calls.
- [x] T002 [P] Add NestJS generation API characterization cases in `backend/tests/online-cvs/async-generation.service.spec.ts` and `backend/tests/online-cvs/legacy-generation-privacy.spec.ts`; Depends: none. Done when: existing sync/async routes, status/cancel behavior, response fields, owner checks, and legacy persistence behavior are captured before the Agent flag is enabled.

**Expected deliverables**: Passing tests that describe the current CV generator and API/editor boundary.

**Required tests**: `uv run pytest tests/unit/cv_generator -q` from `ai-service`; focused Jest tests for the two named files from `backend`.

**Suggested commit boundary**: `test(cv): characterize existing generation contracts`.

**Proceed when**: Both baseline suites pass on the unchanged implementation and test fixtures contain no real CV or credentials.

---

## Phase 2: Foundational Agent and Pending-Draft Boundaries

**Purpose**: Establish the shared, bounded Agent invocation and safe persistence envelope required by both P1 stories. No new service, database table, provider client, or orchestration framework.

**⚠️ Blocking**: Complete this phase before either user story. Do not enable `cv_generation` in a deployed environment yet.

**Recommended order**: Write schema/tool and staging contract tests first; add models and handlers next; register the selector only after the Agent path passes isolated tests.

- [x] T003 Add strict receipt and tool-input tests in `ai-service/tests/unit/cv_generator/test_cv_generation_agent.py`; Depends: T001. Done when: tests require `status="GENERATED"`, UUID `operation_attempt_id` and `receipt_id`, bounded `source_version`, positive `content_version`, a 64-character SHA-256 `draft_hash`, safe warning codes, and rejection of missing/extra fields and non-empty tool input.
- [x] T004 Add `CvGenerationReceipt` and strict empty `GenerateDraftToolInput` models in `ai-service/src/talentpulse_ai/modules/cv_generator/schemas.py`; Depends: T003. Done when: the models enforce the constraints quoted in T003 and do not alter `CvDraftRequest` or `CvDraft`.
- [x] T005 Add tool-dispatch safety tests in `ai-service/tests/unit/cv_generator/test_cv_generation_agent.py`; Depends: T004. Done when: tests cover unauthorized `cv.generate`, a direct final without a tool call, a second tool call, malformed receipt/hash, request isolation under concurrent runs, and no CV body in the tool receipt.
- [x] T006 Implement request-scoped review-result generation and the `cv.generate_draft` Agent adapter in `ai-service/src/talentpulse_ai/modules/cv_generator/agent.py`, `service.py`, `core_generation.py`, `localization.py`, `draft_builder.py` and `schemas.py`; Depends: T005. Done when: the existing `CvDraftGenerationService.generate()` and `CvDraft` schema remain unchanged for ordinary callers; a review-only service result type carries the unchanged draft plus strict origin/omission metadata derived from existing core/localization/fallback outcomes; the Agent tool still returns only the receipt and holds both results per run; metadata never enters model input/output; and Foundation execution remains bounded without checkpointer or raw-CV state.
- [x] T007 Add capability-selection and review-envelope tests in `ai-service/tests/integration/test_cv_api.py`; Depends: T006. Done when: `cv_generation` disabled selects legacy, enabled selects the Agent, an Agent failure never calls legacy again in that same request, review opt-in returns unchanged `CvDraft` plus validated sidecar from either implementation, and requests without opt-in retain the bare `CvDraft` response.
- [x] T008 Register `cv_generation` and wire the existing CV route through `CapabilityImplementationSelector` in `ai-service/src/talentpulse_ai/main.py` and `ai-service/src/talentpulse_ai/modules/cv_generator/router.py`; Depends: T007. Done when: the default capability set leaves CV on legacy, existing requests without the trusted review-metadata opt-in retain the exact response, and opted-in NestJS review requests receive `{draft: unchanged CvDraft, review_metadata}` from both Agent and legacy paths without changing `cv_generate_scope` or the `CvDraftRequest`/`CvDraft` models.
- [x] T009 Add NestJS pending-draft and approval-boundary tests in `backend/tests/online-cvs/async-generation.service.spec.ts` and `backend/tests/online-cvs/online-cvs.service.spec.ts`; Depends: T002. Done when: tests assert a staged result does not change canonical CV fields, `contentVersion`, `isPrimary`, or `isSearchable`; approval requires matching `operationId`/`draftHash`; and stale/cancelled/late results cannot stage.
- [x] T010 Add typed pending-review metadata and optional `generationApproval` request validation in `backend/src/online-cvs/async-cv-generation.types.ts`, `backend/src/online-cvs/entities/online-cv.entity.ts`, and `backend/src/online-cvs/dto/update-online-cv.dto.ts`; Depends: T009. Done when: the JSONB subdocument supports `pendingDraft`, `sourceRefsByPath`, `fieldOriginsByPath`, `omissionsByPath`, `reviewStatus` values `PENDING | APPROVED | REJECTED | EXPIRED`, `draftHash`, `sourceVersion`, `expectedContentVersion`, `consentVersion`, `consentPolicyHash`, `createdAt`, and `expiresAt`, with no new SQL table or migration.
- [x] T011 Stage Agent output and expose only owner-checked review metadata in `backend/src/online-cvs/online-cvs.service.ts` and `backend/src/online-cvs/online-cvs.controller.ts`; Depends: T010. Done when: staging uses operation/status/source/consent/version compare-and-set, writes the `CvDraft` plus internal `sourceRefsByPath`, `fieldOriginsByPath` and `omissionsByPath` under `generationSnapshot.pendingDraft`, leaves canonical CV content and `contentVersion` unchanged, exposes only allowlisted review metadata to the owner, and never serializes raw `generationSnapshot` to clients.
- [x] T012 Enforce explicit approval on the existing CV update path in `backend/src/online-cvs/online-cvs.service.ts` and `backend/src/online-cvs/dto/update-online-cv.dto.ts`; Depends: T011. Done when: while `reviewStatus=PENDING`, PATCH/autosave without matching `generationApproval.operationId` and `generationApproval.draftHash` is rejected; matching owner/consent/version saves exactly once, increments `contentVersion` once, clears pending content, and records `APPROVED`.

**Expected deliverables**: A disabled-by-default `cv_generation` capability, strict receipt/tool boundaries, unchanged AI CV schemas, and a pending-draft persistence path that cannot overwrite canonical CV fields before approval.

**Required tests**: AI CV/Foundation unit and internal API integration tests; NestJS unit tests for staging, CAS, approval proof, and unchanged source data.

**Suggested commit boundary**: Commit the AI capability slice after T008 (`feat(ai): add CV generation Agent capability`); commit the backend staging/approval slice after T012 (`feat(cv): stage generated drafts for explicit approval`).

**Proceed when**: Flag-off regression passes; flag-on produces only a schema-valid held draft; unauthorized/malformed tool paths stop safely; pending output is owner-scoped; ordinary PATCH cannot apply a pending draft.

---

## Phase 3: User Story 1 - Create a Draft from Career Profile (Priority: P1, MVP)

**Goal**: Generate a reviewable CV from the applicant’s authorized profile and optionally an eligible canonical job, then open it in the existing editor without changing an existing CV.

**Independent test**: With synthetic profile fixtures, run profile generation with and without a selected active job. The editor receives a schema-valid pending draft; existing CVs and profile fields remain unchanged until the explicit Save path is used.

**Recommended order**: Write AI and backend request/context tests first; wire authorized context; connect the current profile page to the existing editor; run the cross-service flow.

- [x] T013 [P] [US1] Add AI integration cases in `ai-service/tests/integration/test_cv_api.py` for profile-originated requests with no job and an authorized active job; Depends: T008. Done when: each case uses the existing `CvDraftRequest`, the job only changes prioritization, the response passes the existing `CvDraft` schema and identity/version validators, and no unsupported experience, education, certificate, quantified achievement, or skill is returned as a verified fact.
- [x] T014 [P] [US1] Add profile-source authorization and context tests in `backend/tests/online-cvs/generate-from-career-profile.service.spec.ts`; Depends: T008, T011. Done when: tests cover owner, absent/revoked consent before enqueue and completion, profile version, eligible/removed job behavior, no-job context, and queue payloads containing IDs/versions/hashes rather than raw CV or job text.
- [x] T015 [US1] Connect profile generation to the Agent-capable CV request builder in `backend/src/online-cvs/online-cvs.service.ts` and `backend/src/ai-matching/ai-service.cv-draft.ts`; Depends: T014. Done when: NestJS supplies only its already-authorized candidate/job snapshot, preserves operation/source/consent versions, does not add direct FastAPI data-fetch access, and never writes to the source career profile during generation.
- [x] T016 [US1] Enforce the 300-second operation deadline from API acceptance through generation for both synchronous and asynchronous requests in `backend/src/online-cvs/online-cvs.service.ts`, `backend/src/online-cvs/online-cv-generation.processor.ts`, `ai-service/src/talentpulse_ai/modules/cv_generator/service.py`, and `ai-service/src/talentpulse_ai/modules/cv_generator/provider_runtime.py`; Depends: T006, T013. Done when: asynchronous queue wait and Agent/tool/provider time count against the same deadline, a safe actionable timeout is returned by 5 minutes, late output is fenced, and existing provider caps (12 calls, 600-second hard ceiling, one repair pass) remain upper bounds subordinate to the operation deadline.
- [x] T017 [US1] Open profile-generated `reviewStatus=PENDING` drafts in the current editor from `frontend/src/pages/cv/CareerProfilePage.tsx` and `frontend/src/pages/cv/CVEditorPage.tsx`; Depends: T012, T015. Done when: the existing editor receives the generated fields/warnings and no profile or canonical CV is modified by opening the draft.
- [x] T018 [US1] Add the profile-to-editor regression journey in `frontend/src/pages/cv/CareerProfilePage.test.mjs` and `frontend/src/pages/cv/CVEditorPage.test.mjs`; Depends: T017. Done when: the test covers both job-context variants, a visible pending draft, editor-compatible fields, unchanged profile/source CV, and successful explicit save through T012.

**Expected deliverables**: A working P1 profile-generation journey on the existing API/editor, optionally tailored using only an authorized canonical job.

**Required tests**: AI `test_cv_api.py`; NestJS `generate-from-career-profile.service.spec.ts`; frontend CareerProfilePage/CVEditorPage tests with provider doubles.

**Suggested commit boundary**: `feat(cv): generate reviewable drafts from career profiles`.

**Proceed when**: The complete profile journey passes with the feature enabled; no-job and job-selected output both preserve the `CvDraft` contract; source profile and existing CVs remain unchanged before approval.

---

## Phase 4: User Story 2 - Regenerate from an Existing CV Without Overwrite (Priority: P1)

**Goal**: Generate a separate review draft from an applicant-owned CV while leaving the source version intact.

**Independent test**: Snapshot an existing CV’s content, version, primary/searchable flags, and profile. Generate with and without an eligible job. Before approval, every source value remains unchanged; after matching approval, only the selected destination changes once.

**Recommended order**: Add backend regression tests first, then stage output for an existing source, connect the editor action, and run sync/async compatibility checks.

- [x] T019 [US2] Add source-preservation tests in `backend/tests/online-cvs/async-generation.service.spec.ts` and `backend/tests/online-cvs/async-generation.postgres.integration.spec.ts`; Depends: T012. Done when: an Agent result stages a draft while the source CV’s structured fields, `contentVersion`, profile, primary flag, and searchable flag remain byte-for-byte/value-for-value unchanged.
- [x] T020 [US2] Route existing-CV generation results into `generationSnapshot.pendingDraft` in `backend/src/online-cvs/online-cvs.service.ts` and `backend/src/online-cvs/online-cv-generation.processor.ts`; Depends: T019. Done when: worker completion rechecks `operationId`, status, owner, consent, source version, expected content version, job snapshot and cancellation state before staging; stale output is rejected.
- [x] T021 [US2] Add editor regression cases for regenerating from an existing CV in `frontend/src/pages/cv/CVEditorPage.test.mjs`; Depends: T020. Done when: the test asserts the canonical current CV and pending generated draft are presented separately and source content is not treated as the new saved content.
- [x] T022 [US2] Connect the existing-CV regenerate action to the pending `draft` response in `frontend/src/pages/cv/CVEditorPage.tsx` and `frontend/src/lib/cvTypes.ts`; Depends: T021. Done when: sync/async responses keep existing required fields and the editor targets the existing CV only after T012 approval proof.
- [x] T023 [US2] Add request/response compatibility regression cases in `backend/tests/online-cvs/legacy-generation-privacy.spec.ts` and `backend/tests/online-cvs/online-cvs.service.spec.ts`; Depends: T022. Done when: existing sync/async route paths, required fields, status values, errors, and legacy behavior remain unchanged when `cv_generation` is disabled; Agent review fields are additive only.

**Expected deliverables**: Non-destructive existing-CV regeneration through the current public API and editor.

**Required tests**: NestJS service and PostgreSQL CAS tests, frontend editor tests, and existing sync/async compatibility tests.

**Suggested commit boundary**: `feat(cv): regenerate existing CVs as pending drafts`.

**Proceed when**: Both generation entry points use the same pending-draft contract; stale/concurrent source changes cannot overwrite data; explicit save is the only path applying Agent output to canonical CV fields.

---

## Phase 5: User Story 3 - Review, Edit, Regenerate, or Reject (Priority: P2)

**Goal**: Complete the human review lifecycle in the existing editor, including explicit approval, safe rejection, source/AI wording cues, and expiry.

**Independent test**: For either profile-originated or existing-CV draft, edit locally, wait past autosave debounce, regenerate one selected draft item, reload pending status, and explicitly save or reject. Confirm regeneration changes only the selected item in the pending draft and canonical CV data changes only after explicit Save.

**Recommended order**: Add UI/backend contract tests, implement discard and retention, then finish editor actions and cross-service conflict handling.

- [x] T024 [P] [US3] Add reject/discard API tests in `backend/tests/online-cvs/async-generation.service.spec.ts`; Depends: T020. Done when: only the owner can discard the matching `PENDING` operation, discard is idempotent, and source CV/profile/other operations remain unchanged.
- [x] T025 [US3] Implement `DELETE /online-cvs/:id/generation-jobs/:operationId/draft` in `backend/src/online-cvs/online-cvs.controller.ts` and `backend/src/online-cvs/online-cvs.service.ts`; Depends: T024. Done when: the route returns 204 for a valid discard, records `REJECTED`, removes staged text, and returns non-disclosing not-found behavior for non-owners.
- [x] T026 [P] [US3] Add pending-draft expiration tests in `backend/tests/online-cvs/online-cvs.service.spec.ts`; Depends: T011. Done when: a pending result older than seven days expires, loses draft text, keeps safe operation metadata, and cannot be applied.
- [x] T027 [US3] Add hourly expiry cleanup using the existing scheduler in `backend/src/online-cvs/online-cvs.service.ts` and `backend/tests/online-cvs/online-cvs.service.spec.ts`; Depends: T026. Done when: only expired pending payloads are cleared and no new worker/service or database table is introduced.
- [x] T028 [P] [US3] Add frontend tests for local edits, field-level origin labels, omission messages, explicit Save, reject, selected-item regeneration, partial output and stale conflicts in `frontend/src/pages/cv/CVEditorPage.test.mjs`; Depends: T022, T025. Done when: each visible field renders the matching origin enum, each omitted item displays localized path/reason metadata, only individually valid partial content is shown, autosave is suppressed while pending, and stale or failed regeneration leaves the pending draft and metadata intact.
- [x] T029 [P] [US3] Add NestJS tests for selected-item regeneration and review metadata in `backend/tests/online-cvs/async-generation.service.spec.ts` and `backend/tests/online-cvs/async-generation.postgres.integration.spec.ts`; Depends: T020, T011. Done when: every allowlisted target resolves exactly one authorized source reference, its origin metadata updates with the selected item, identity/contact/ID/metadata targets and missing/ambiguous source mappings are rejected, idempotency distinguishes different targets, both Agent and legacy modes preserve the same behavior, and stale hashes, concurrent regeneration, cancellation or late results cannot replace the pending draft or metadata.
- [x] T030 [US3] Add selected-item regeneration and partial-review metadata to the existing async generation-job flow in `backend/src/online-cvs/dto/generate-online-cv.dto.ts`, `backend/src/online-cvs/async-cv-generation.types.ts`, `backend/src/online-cvs/online-cvs.controller.ts`, `backend/src/online-cvs/online-cvs.service.ts`, and `backend/src/online-cvs/online-cv-generation.processor.ts`; Depends: T029. Done when: the trusted NestJS client opts into and validates the FastAPI review envelope while ordinary internal clients keep the `CvDraft` body; initial staging builds `sourceRefsByPath`, `fieldOriginsByPath` and `omissionsByPath` from validated transformations; the optional target uses the allowlist and internal references; NestJS returns safe review metadata outside `CvDraft`, accepts the same inner `CvDraft` from Agent or legacy selection, stages `DEGRADED` only for individually valid retained fields, and compare-and-sets the target without changing canonical CV/profile fields.
- [x] T031 [US3] Implement pending-review editor actions in `frontend/src/pages/cv/CVEditorPage.tsx` and `frontend/src/lib/cvTypes.ts`; Depends: T028, T030. Done when: pending draft edits stay local, field-level origin labels and localized omission reasons are rendered from optional review metadata, explicit Save sends matching `generationApproval`, Reject calls discard, selected-item regeneration preserves every unselected item, and legacy responses without review metadata keep existing behavior.
- [x] T032 [US3] Add cross-service review/conflict tests in `backend/tests/online-cvs/async-generation.postgres.integration.spec.ts` and `frontend/src/pages/cv/CVEditorPage.test.mjs`; Depends: T027, T031. Done when: tests cover AI-generated and copy/localization targets, correct per-field provenance, safe partial staging with path/reason omissions, failure with no staging when no safe subset exists, rejection of identity/metadata targets, preservation of unselected items and original review operation ID, conflict without force-apply, and Save/Reject/Expire semantics.

**Expected deliverables**: A review lifecycle that is explicit, non-destructive, owner-scoped, and compatible with the current CV editor.

**Required tests**: NestJS route/service and selected-item hash compare-and-set tests, PostgreSQL concurrency/expiry, and frontend autosave/review tests.

**Suggested commit boundary**: `feat(cv): add explicit review and discard flow`.

**Proceed when**: Pending drafts cannot be silently autosaved; only matching approval proof applies content; reject/expiry clear staged text; legacy editor tests still pass.

---

## Phase 6: User Story 4 - Controlled Failure, Retry, and Rollback (Priority: P2)

**Goal**: Keep failures safe, observable without candidate content, and recoverable through legacy selection for new requests.

**Independent test**: Force authorization denial, tool omission, malformed receipt, invalid CV output, provider timeout, cancellation, duplicate request, and flag rollback; confirm no invalid draft is persisted and existing generation remains available.

**Recommended order**: Add failure/rollback tests first, implement safe mappings and fencing, then validate logs and feature-flag rollback.

- [x] T033 [P] [US4] Add Agent-failure, prompt-injection and selector-rollback cases in `ai-service/tests/unit/cv_generator/test_cv_generation_agent.py` and `ai-service/tests/integration/test_cv_api.py`; Depends: T008. Done when: missing tool, receipt mismatch, timeout, provider failure, untrusted CV/job instructions and disabled capability produce the specified safe behavior/legacy selection without unauthorized tool actions or a second legacy call in an Agent-selected request.
- [x] T034 [US4] Map Foundation/CV errors and partial validation outcomes to safe internal errors in `ai-service/src/talentpulse_ai/modules/cv_generator/agent.py` and `ai-service/src/talentpulse_ai/modules/cv_generator/router.py`; Depends: T033. Done when: no stack trace, prompt, CV text, provider payload, or credentials reach client errors or logs; every retained partial field passes independent structure/factual checks with safe omission path/reason metadata; and an unknown safe set returns failure without a draft.
- [x] T035 [P] [US4] Add idempotency, cancel, and late-result fence tests in `backend/tests/online-cvs/async-generation.service.spec.ts` and `backend/tests/online-cvs/async-generation.postgres.integration.spec.ts`; Depends: T020. Done when: same key/same request replays one operation, same key/different input conflicts, and cancelled/stale/late completions cannot stage or apply output.
- [x] T036 [US4] Enforce retry identity and completion fencing in `backend/src/online-cvs/online-cvs.service.ts` and `backend/src/online-cvs/online-cv-generation.processor.ts`; Depends: T035. Done when: terminal retry requires a new attempt/idempotency key, active operations are not silently switched between Agent/legacy, and late worker results are ignored.
- [x] T037 [P] [US4] Add privacy-safe observation assertions in `ai-service/tests/unit/cv_generator/test_cv_generation_agent.py` and `backend/tests/online-cvs/legacy-generation-privacy.spec.ts`; Depends: T034. Done when: tests reject logs containing CV text, generated draft, prompts, identity/contact data, candidate/user/CV IDs, provider output, or access tokens while requiring operation/correlation ID, capability, status, duration, counts and safe error code.
- [x] T038 [US4] Emit bounded CV Agent observations through `ai-service/src/talentpulse_ai/modules/cv_generator/agent.py` and `backend/src/online-cvs/online-cvs.service.ts`; Depends: T037. Done when: operation/correlation IDs, implementation choice, counts, duration, review state and sanitized error code are available without raw candidate/provider content.
- [x] T039 [US4] Add rollback regression cases in `ai-service/tests/integration/test_cv_api.py` and `backend/tests/online-cvs/async-generation.service.spec.ts`; Depends: T036. Done when: removing `cv_generation` selects legacy for new requests, an already-selected request is not switched mid-run, and existing pending drafts remain owner-readable/saveable/rejectable with selected-item regeneration still available through the legacy generator.
- [x] T040 [US4] Document flag-off and code rollback recovery in `specs/005-cv-generation-agent/quickstart.md`; Depends: T039. Done when: the guide states how to disable the capability, preserve/drain in-flight operations, retain pending-review handling until drafts are resolved/expired, and restore the legacy selection.

**Expected deliverables**: Safe error mapping, bounded retry semantics, sanitized observations, and a tested capability rollback path.

**Required tests**: AI tool/selector failure tests, NestJS idempotency/cancellation/CAS tests, privacy-log regression tests.

**Suggested commit boundary**: `fix(cv): harden Agent failures and rollback`.

**Proceed when**: All failure classes stop before invalid persistence, same-request legacy retry is absent, logs are privacy-safe, and disabling the feature restores legacy selection for new requests.

---

## Phase 7: Polish and Release Checkpoint

**Purpose**: Run cross-service evidence, static checks, and the quickstart without expanding feature scope.

**Recommended order**: Run targeted suites after each story, then the PostgreSQL flow, then all static/full relevant suites and rollout checklist.

- [x] T041 Run the end-to-end synthetic journey from `specs/005-cv-generation-agent/quickstart.md` using deterministic provider doubles and the disposable PostgreSQL test database; Depends: T018, T023, T032, T040. Done when: profile and existing-CV flows pass through review/save/reject/expiry, field-origin labels, safe partial with omission reasons, unsafe-partial failure, and selected-item regeneration for generated and copy/localized content; unsupported/ambiguous targets fail without changing pending state, and the legacy-flag-off journey passes.
- [x] T042 Run affected AI, backend, and frontend test/lint/type/build commands from `specs/005-cv-generation-agent/quickstart.md`; Depends: T041. Done when: all relevant checks pass or any pre-existing/environmental failures are isolated and documented without weakening requirements.
- [ ] T043 Measure SC-006 latency for both synchronous and asynchronous requests using synthetic profiles capped at 50 items per input list in the authorized staging environment; record request-to-actionable-status p95 plus timeout counts in `specs/005-cv-generation-agent/quickstart.md`; Depends: T042. Done when: at least 95% complete or return actionable status within 300 seconds measured from API acceptance (including queue delay for asynchronous requests), and late results are fenced; misses block release and are escalated without weakening SC-006.
- [ ] T044 Run the SC-007/SC-008 review pilot with at least 30 explicitly consented participants using the scripted task and fixed 1–5 usefulness question defined in `spec.md`; record only aggregate task-completion, response count and average rating in `specs/005-cv-generation-agent/quickstart.md`; Depends: T041, T042. Done when: the ≥90% self-directed completion target and ≥4/5 average usefulness target are reported; if either misses, rollout remains blocked pending requirements/product review.
- [ ] T045 Review release and privacy gates in `specs/005-cv-generation-agent/plan.md`, `specs/005-cv-generation-agent/data-model.md`, and `specs/005-cv-generation-agent/quickstart.md`; Depends: T043, T044. Done when: SC-006–SC-008 meet their targets or the feature remains disabled with gaps escalated, no schema migration is required, pending-draft cleanup/rollback is actionable, and provider processing/training/retention terms are verified and recorded.

**Expected deliverables**: Verified quickstart, all relevant tests/static checks, and a staged-release/rollback decision supported by evidence.

**Required tests**: Full focused test suites for AI, NestJS, PostgreSQL, and frontend; no live LLM required for default gates.

**Suggested commit boundary**: `test(cv): complete Agent generation release checks`.

**Proceed when**: The quickstart is reproducible with synthetic fixtures, existing contracts remain compatible, and all human-approval/privacy/rollback gates pass.

---

## Dependencies and Execution Order

### Phase Dependencies

- **Phase 1 Setup**: T001 and T002 have no dependencies; they may be run in parallel, but the solo recommendation is sequential execution.
- **Phase 2 Foundational**: Requires Phase 1. Completes T003–T012 and blocks every user story.
- **Phase 3 US1 (P1)**: Requires Phase 2. Recommended first vertical slice for profile-to-editor generation.
- **Phase 4 US2 (P1)**: Requires Phase 2 and is recommended after US1 to reuse the same staged-draft/editor path.
- **Phase 5 US3 (P2)**: Requires US1 and US2 so approval/rejection works for both source modes.
- **Phase 6 US4 (P2)**: Requires the Agent selector and review lifecycle; implement after the main user paths so rollback preserves pending drafts.
- **Phase 7 Polish**: Requires all desired stories and rollback tests; release approval also requires the performance and consented-pilot evidence in T043–T044 and the gate in T045.

### User Story Dependencies

- **US1 (P1)**: Independent after Phase 2; creates a profile-originated review draft and explicit-save path.
- **US2 (P1)**: Technically depends only on Phase 2; sequentially follows US1 to reuse pending-draft behavior and editor integration.
- **US3 (P2)**: Depends on US1 and US2; adds edit, selected-item regeneration, reject and expiry behavior for both paths.
- **US4 (P2)**: Depends on Phase 2 and the review lifecycle; validates safe failure/rollback across the completed paths.

### Task-Level Parallel Opportunities

- T001/T002 are independent baseline characterization tasks in AI and backend test files.
- T013/T014, T024/T026, T028/T029, and T033/T035 are independent test-first tasks in different service files after their stated prerequisites.
- No implementation tasks require parallel branches. A solo developer should normally complete each test and its implementation before switching service context.

## Parallel Examples Per Story

Parallel work is optional and same-branch only; the solo recommendation is to run tasks sequentially.

- **US1**: T013 (AI contract integration) and T014 (NestJS authorized-context tests) can be authored independently after T008/T011.
- **US2**: No intra-story parallel pair is recommended; T020 depends on the source-preservation test T019, then the editor test T021 follows the backend contract.
- **US3**: T024 (discard tests) and T026 (expiry tests) are independent; T028 (editor tests) and T029 (backend selected-item regeneration tests) can be authored independently after their declared prerequisites.
- **US4**: T033 (AI failure tests) and T035 (backend idempotency tests) can be authored independently after their listed prerequisites; T037 follows T034 and can then run alongside remaining backend tests.

## Implementation Strategy

### MVP First

1. Complete Phase 1 characterization and Phase 2 Agent/pending-draft boundaries.
2. Complete US1 profile-to-editor flow, including the minimal explicit-save path already required by T012.
3. **Stop and validate**: run the US1 independent test and verify the source CV/profile remain unchanged before Save.
4. Do not enable production until US2, US3, and US4 gates covering existing-CV preservation, selected-item regeneration, rejection, privacy, and rollback also pass.

### Incremental Solo Delivery

1. Commit the baseline tests and shared Agent/receipt slice.
2. Commit pending-draft persistence and explicit approval proof.
3. Deliver profile-generated review drafts, then existing-CV regeneration.
4. Complete review, selected-item regeneration, discard/expiry and failure/rollback behavior before rollout.
5. Run quickstart and all cross-service checks; keep `cv_generation` disabled until staging evidence is recorded.

## Notes

- Every task includes a path, dependency, and verifiable completion criterion.
- Tests are written before the behavior they constrain and use deterministic provider doubles.
- No SQL migration is planned; pending review metadata uses validated JSONB fields already present.
- Keep the existing CV generator and Agent Foundation as the source of truth; do not create a second provider client, CV service, microservice, or parallel branch.
- Commit at the stated phase boundary after its required tests pass; never combine unrelated changes.
