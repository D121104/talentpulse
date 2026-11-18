# Tasks: API Model Prompt and Schema Cleanup

**Input**: Design documents from `specs/004-api-model-prompt-cleanup/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/ai-generation-and-consent.md`, `quickstart.md`

**Tests**: Required by FR-009. Add deterministic tests before implementation; routine tests use provider doubles. Live provider evaluation is opt-in.

**Organization**: Tasks are grouped by the three user stories in `spec.md`. `[P]` means the task edits a separate file and has no dependency on another incomplete task in its phase.

## Phase 1: Setup

**Purpose**: Add only the missing test support required for the consent UI.

- [ ] T001 Add Vitest, jsdom, and React Testing Library configuration plus a `test` script in `frontend/package.json`, `frontend/vitest.config.ts`, and `frontend/src/test/setup.ts`.

---

## Phase 2: Foundational

**Purpose**: Complete the audit and evaluation foundation before changing prompts, schemas, or provider dispatch.

- [ ] T002 Inventory each in-scope generation journey, current prompt/schema/provider settings, retries, bounds, validators, and fallback in `specs/004-api-model-prompt-cleanup/research.md`; classify each constraint as retain, simplify, or remove with evidence before editing implementation files.
- [ ] T003 Create `ai-service/evals/datasets/generation_quality_eval_v1.json` with at least 30 synthetic cases for each journey: RAG `JOB_SEARCH`, `ADVICE`, and `CV_JOB_COMPARISON`; Career Chat Agent; CV match analysis; CV generation; and CV localization. Include expected contract/evidence checks and case-specific reviewer criteria; do not include real CV data.
- [ ] T004 Write failing fixture-validation, PII/secret rejection, provider outcome classification, and report sanitization tests in `ai-service/tests/unit/evals/test_hosted_generation_eval.py` against the evaluation data and CLI contract in `specs/004-api-model-prompt-cleanup/quickstart.md`.
- [ ] T005 Implement the opt-in evaluation runner in `ai-service/src/talentpulse_ai/scripts/evaluation/hosted_generation_eval.py` to run every fixture against selected/all currently enabled providers, report contract/safety outcomes, and emit a sanitized human-review sheet; support the `--provider`, `--dataset`, and `--output` arguments documented in `specs/004-api-model-prompt-cleanup/quickstart.md`.

**Checkpoint**: The change inventory is complete, evaluation fixtures contain only synthetic data, and the opt-in runner passes deterministic tests before any prompt/schema cleanup begins.

---

## Phase 3: User Story 1 - Reliable hosted-model answers (Priority: P1) MVP

**Goal**: Hosted Bedrock/Gemini generation and CV match analysis preserve product contracts and answer quality; CV-derived facts are sent only after the applicant's existing `cv_matching` consent is verified and can be granted/revoked through the existing consent UI/API.

**Independent Test**: With deterministic provider doubles, exercise every P1 journey, verify provider-specific request construction and full application validation, then verify CV analysis dispatches only for the correct applicant with current consent. Verify the frontend can load, grant, and revoke the existing scope.

### Tests for User Story 1

> Write these tests first and confirm they fail for the missing behavior before implementation.

- [ ] T006 [P] [US1] Add Gemini supported-schema request/projection and Bedrock Nova Lite no-native-schema request tests in `ai-service/tests/unit/providers/test_hosted_generation_contract.py`.
- [ ] T007 [P] [US1] Add RAG advice, job-search, comparison, invalid-output, and repair contract tests in `ai-service/tests/unit/rag_chatbot/test_rag.py`.
- [ ] T008 [P] [US1] Add agent structured-output and bounded-repair regression tests in `ai-service/tests/unit/rag_chatbot/test_agent_generation.py`.
- [ ] T009 [P] [US1] Add hosted provider and invalid-evidence narrative tests in `ai-service/tests/unit/cv_analysis/test_analysis_hosted.py`; assert the full `MatchNarrative` validation remains active.
- [ ] T010 [P] [US1] Add CV generation/localization provider-contract and prompt-regression tests in `ai-service/tests/unit/cv_generator/test_cv_generation.py`.
- [ ] T011 [P] [US1] Add NestJS tests for valid, missing, revoked, stale-policy, and wrong-applicant `cv_matching` consent in `backend/tests/applications/applications.service.spec.ts`; assert no AI client call on denied cases.
- [ ] T012 [P] [US1] Add grant/revoke, loading/error, and policy-version/hash interaction tests for the matching consent control in `frontend/tests/consent/AiCvMatchingConsentCard.test.tsx`.
- [ ] T013 [P] [US1] Extend `ai-service/tests/integration/test_cv_match_api.py` to verify hosted analysis preserves the existing request/response contract and rejects malformed or semantically unsupported narratives.

### Implementation for User Story 1

- [ ] T014 [US1] Implement a Gemini-specific response-schema projection in `ai-service/src/talentpulse_ai/infrastructure/llm/gemini.py` that sends only the documented supported subset and bounds schema complexity while leaving the complete Pydantic/domain validation unchanged.
- [ ] T015 [US1] Update RAG provider dispatch and repair handling in `ai-service/src/talentpulse_ai/modules/rag_chatbot/generation/generator.py` and `ai-service/src/talentpulse_ai/modules/rag_chatbot/generation/prompt_builder.py` so Gemini receives its compatible schema, Bedrock Nova Lite stays on prompt-plus-parse, and invalid responses still use existing validation/fallback behavior; simplify only audited duplicate instructions in `ai-service/src/talentpulse_ai/modules/rag_chatbot/prompts/qa_v1.txt`.
- [ ] T016 [US1] Remove only proven duplicate or hosted-incompatible wording from the agent prompt in `ai-service/src/talentpulse_ai/modules/rag_chatbot/prompts/career_chat_agent_v1.txt` and keep the bounded tools, step count, call count, and repair behavior in `ai-service/src/talentpulse_ai/modules/rag_chatbot/agent.py` unchanged.
- [ ] T017 [US1] Replace the Ollama-only type gate in `ai-service/src/talentpulse_ai/modules/cv_analysis/analysis.py` with capability-aware hosted/local generation, use native structured output only when supported, and keep full `MatchNarrative` and evidence validation for every provider.
- [ ] T018 [US1] Inject the existing consent service into `backend/src/applications/applications.module.ts` and check the matched applicant's current `cv_matching` consent in `backend/src/applications/applications.service.ts` before entering the AI call/fallback block; missing, revoked, stale, or wrong-user consent must deny without dispatch and HR entitlement must not substitute for applicant consent.
- [ ] T019 [US1] Add typed `cv_matching` policy/current/grant/revoke calls in `frontend/src/lib/cvApi.ts` and `frontend/src/lib/cvTypes.ts`, implement `frontend/src/components/consent/AiCvMatchingConsentCard.tsx` using the current policy text/version, and mount it on `frontend/src/pages/cv/MyCVPage.tsx` without creating a new scope or changing policy metadata.
- [ ] T020 [US1] Simplify CV generation and localization instructions only where the audit and tests prove duplication, retaining Bedrock JSON guidance and all draft/user-review guarantees in `ai-service/src/talentpulse_ai/modules/cv_generator/prompt_builder.py`, `ai-service/src/talentpulse_ai/modules/cv_generator/core_generation.py`, and `ai-service/src/talentpulse_ai/modules/cv_generator/localization.py`.

**Checkpoint**: Hosted generation returns validated responses across supported journeys; CV match analysis is consent-gated before provider dispatch; users can grant/revoke `cv_matching` through the existing policy/API; public request/response schemas remain unchanged.

---

## Phase 4: User Story 2 - Preserve local-model workflows (Priority: P2)

**Goal**: Ollama remains supported with its required local schema and model-specific settings, without imposing those settings on hosted providers.

**Independent Test**: Run Ollama adapter and local CV-analysis/RAG/CV-generation tests; verify `format` schema delivery, Qwen-specific `think=False`, temperature and token/timeout bounds remain local and outputs still pass the same application contracts.

### Tests for User Story 2

> Write these tests before changing shared/provider settings.

- [ ] T021 [P] [US2] Add Ollama request tests for `format`, `stream=False`, `temperature=0`, Qwen `think=False`, and bounded `num_predict`/timeout in `ai-service/tests/unit/providers/test_ollama_provider.py`.
- [ ] T022 [P] [US2] Add a local CV-analysis narrative regression using the Ollama adapter and existing evidence rules in `ai-service/tests/unit/cv_analysis/test_analysis.py`.

### Implementation for User Story 2

- [ ] T023 [US2] Keep `_ollama_schema` normalization and Ollama-only request flags in `ai-service/src/talentpulse_ai/infrastructure/llm/ollama.py`; move any Ollama-only constraint found in the T002 inventory out of shared provider settings without changing local response behavior.
- [ ] T024 [US2] Run and record the Ollama RAG, agent, CV-analysis, and CV-generation regression suites in `ai-service/tests/unit/rag_chatbot/`, `ai-service/tests/unit/cv_analysis/`, and `ai-service/tests/unit/cv_generator/`; resolve any hosted-cleanup regression before marking US2 complete.

**Checkpoint**: Local Ollama continues to satisfy existing output contracts, while its special settings are not sent to Bedrock/Gemini.

---

## Phase 5: User Story 3 - Reviewable and reversible cleanup (Priority: P3)

**Goal**: Every removed/simplified constraint has evidence, the full provider evaluation meets the agreed quality thresholds, and the change can be rolled back without data migration.

**Independent Test**: Inspect the before/after constraint ledger, run the opt-in evaluation against each enabled hosted provider, review the required sample, and follow rollback instructions without changing persisted data.

### Implementation for User Story 3

- [ ] T025 [US3] Add a before/after constraint ledger to `specs/004-api-model-prompt-cleanup/research.md` with affected journey/provider, decision, evidence, retained safeguard, and test reference for every changed prompt/schema/setting.
- [ ] T026 [US3] Run `hosted_generation_eval.py` from `ai-service/src/talentpulse_ai/scripts/evaluation/hosted_generation_eval.py` against `ai-service/evals/datasets/generation_quality_eval_v1.json` and every enabled hosted profile; meet at least 95% first-pass contract-valid responses and at least 90% human-review passes for 10+ responses per journey/provider, recording sanitized aggregate results in `specs/004-api-model-prompt-cleanup/research.md`.
- [ ] T027 [US3] Obtain privacy-owner confirmation that the existing `cv_matching` policy is sufficient for hosted processing and record the release gate in `specs/004-api-model-prompt-cleanup/research.md`; do not modify the policy text/version without separate approval.
- [ ] T028 [P] [US3] Document rollback steps for restoring prior prompts/provider request behavior and disabling the hosted CV-analysis path in `specs/004-api-model-prompt-cleanup/quickstart.md`; verify rollback requires no migration or persisted-data repair.
- [ ] T029 [US3] Run the final validation commands and unaffected retrieval/indexing regression from `specs/004-api-model-prompt-cleanup/quickstart.md` and `ai-service/tests/unit/job_indexing/test_indexing.py`; record that no retrieval, embedding, ranking, or public schema changes were introduced in `specs/004-api-model-prompt-cleanup/research.md`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 adds the frontend test command/configuration; it is independent of AI-service work but must finish before frontend component tests run.
- **Foundational (Phase 2)**: T002 inventory precedes cleanup. T003 creates the synthetic set; T004 writes failing evaluation tests; T005 implements the runner. Complete Phase 2 before changing any prompt/schema constraint.
- **User Story 1 (Phase 3)**: Depends on Phase 2. Provider projection (T014) precedes RAG/agent/CV-generation integrations (T015, T016, T020). Consent tests (T011/T012) precede backend/UI work (T018/T019). CV API integration test (T013) is verified after T017/T018.
- **User Story 2 (Phase 4)**: Depends on Phase 2 and on the generic CV-analysis implementation T017 before local CV analysis is considered complete. Ollama adapter tests can run in parallel with hosted-provider tests because they cover separate adapters.
- **User Story 3 (Phase 5)**: Depends on US1 and US2 cleanup. T026 requires all journey/provider integrations and the T005 runner. T027 is a release gate; hosted CV analysis must not be enabled before confirmation.

### User Story Dependencies

- **US1 (P1)**: Starts after foundational inventory/evaluation. It can be delivered independently as the hosted-generation MVP, subject to the privacy-owner release gate for CV analysis.
- **US2 (P2)**: Can run in parallel with most US1 tasks after Phase 2; local CV-analysis verification waits for T017 because that path is being made provider-generic.
- **US3 (P3)**: Requires US1 and US2 results for an accurate ledger, rollback procedure, and provider-by-provider quality evaluation.

### Parallel Opportunities

- After T002, T003's fixture authoring can proceed independently from T001 frontend test setup.
- In US1, T006–T013 are test tasks in separate files and can be authored in parallel. After T014, RAG, agent, CV analysis, CV generation, NestJS consent, and frontend consent implementations can proceed in parallel where they touch separate files; T018 and T019 are independent after their tests.
- In US2, T021 and T022 touch separate provider/CV-analysis test files and can run in parallel. T023 can proceed alongside CV-generation prompt work if there are no shared-file edits.
- US3 is intentionally sequenced after both behavior stories; its evaluation and rollback tasks should not be parallelized with prompt/schema edits.

## Parallel Examples

### User Story 1

```text
Task: T006 provider capability tests in ai-service/tests/unit/providers/test_hosted_generation_contract.py
Task: T007 RAG tests in ai-service/tests/unit/rag_chatbot/test_rag.py
Task: T008 agent tests in ai-service/tests/unit/rag_chatbot/test_agent_generation.py
Task: T009 CV analysis tests in ai-service/tests/unit/cv_analysis/test_analysis_hosted.py
Task: T010 CV generation tests in ai-service/tests/unit/cv_generator/test_cv_generation.py
Task: T011 consent boundary tests in backend/tests/applications/applications.service.spec.ts
Task: T012 consent UI tests in frontend/tests/consent/AiCvMatchingConsentCard.test.tsx
Task: T013 AI-service CV match contract tests in ai-service/tests/integration/test_cv_match_api.py
```

### User Story 2

```text
Task: T021 Ollama adapter tests in ai-service/tests/unit/providers/test_ollama_provider.py
Task: T022 local CV analysis test in ai-service/tests/unit/cv_analysis/test_analysis.py
```

### User Story 3

```text
Task: T025 constraint change ledger in specs/004-api-model-prompt-cleanup/research.md
Task: T028 rollback guide in specs/004-api-model-prompt-cleanup/quickstart.md
```

## Implementation Strategy

### MVP First (User Story 1)

1. Complete setup and the shared inventory/evaluation foundation (T001–T005).
2. Write US1 provider, RAG, agent, CV, backend-consent, and frontend-consent tests first (T006–T013).
3. Implement provider-specific hosted behavior and consent flow (T014–T020).
4. Validate US1 independently with provider doubles and the CV no-consent/no-dispatch test.
5. Do not enable hosted CV analysis in a release until the privacy-owner gate (T027) passes.

### Incremental Delivery

1. Deliver hosted generation and consent-gated CV analysis as the P1 increment.
2. Verify Ollama local behavior as P2 without leaking its settings to hosted providers.
3. Complete the constraint ledger, provider-by-provider quality evaluation, and rollback release gate as P3.
4. Stop if any contract, safety, consent, or quality threshold regresses; restore the previous prompt/schema/provider behavior before rollout.
