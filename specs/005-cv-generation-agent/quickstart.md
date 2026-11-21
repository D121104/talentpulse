# Quickstart: CV Generation Agent Validation

This guide validates the planned behavior using synthetic data and deterministic provider doubles. It is not a live-provider or production rollout procedure.

## Prerequisites

- PostgreSQL and Valkey/Redis test instances for NestJS async-flow integration tests.
- Python dependencies installed through `uv` in `ai-service`.
- Node.js version supported by the repository; use Node 24 for NestJS tests where the runtime's global `File` API is required.
- Backend, FastAPI and frontend configured using existing local setup; do not copy or print secret values.
- Synthetic candidate profile/CV and canonical job fixtures; no real CV, contact detail or production account.
- For the SC-006 staging workload, cap each profile input list at 50 items and measure elapsed time from request acceptance, including queue wait.

## Automated Validation

Run focused service tests from the repository root:

```bash
cd ai-service
AI_EMBEDDING_PROVIDER=deterministic AI_VECTOR_STORE_PROVIDER=memory AI_GENERATION_PROVIDER=deterministic uv run pytest tests/unit/cv_generator tests/unit/agent_foundation tests/integration/test_cv_api.py -q
```

```bash
cd backend
npm test -- --runInBand tests/online-cvs/async-generation.service.spec.ts tests/online-cvs/online-cvs.service.spec.ts tests/online-cvs/generate-from-career-profile.service.spec.ts
```

```bash
cd frontend
node --test src/pages/cv/CVEditorPage.test.mjs src/pages/cv/CareerProfilePage.test.mjs
```

Add the existing PostgreSQL tests when a disposable migrated test database is available:

```bash
cd backend
npm test -- --runInBand tests/online-cvs/async-generation.postgres.integration.spec.ts
```

Static gates remain the repository commands: `uv run ruff check`, `uv run mypy` in `ai-service`, and backend/frontend lint, typecheck and build scripts from their package manifests. Do not substitute live LLM requests for provider doubles in the normal gate.

## End-to-End Scenarios

1. Create a synthetic candidate fixture with facts for position/objective, education, experience, projects, skills, activities, certificates and awards; include conflicting/unsupported values for negative tests. Grant the exact current `CV_GENERATION` consent policy. Create one synthetic active canonical job and one no-job request.
2. With `cv_generation` absent from `agent_enabled_capabilities`, send the existing synchronous and async generation requests. Confirm the registered selector chooses legacy and current consumers retain their existing response shape.
3. Enable `cv_generation` only in the isolated test service. Submit async existing-CV and career-profile requests. Confirm the operation returns accepted and the worker sends the unchanged, strict `CvDraftRequest` under `cv_generate_scope`.
4. In the fake-provider run, assert Foundation permits one `cv.generate_draft` call; the handler returns only a receipt to the Agent model; final receipt/hash and `tool_calls == 1` are required; the exact held draft is returned. Confirm requests without `X-Cv-Review-Metadata` still receive bare `CvDraft` and the trusted review request opts into the additive envelope.
5. Poll status to `COMPLETE` or safe `DEGRADED`. Confirm `current` fields and `contentVersion` are unchanged, while `draft` is present with `reviewStatus=PENDING` and schema-valid `CvDraft` fields. Confirm optional `reviewMetadata.fieldOriginsByPath` labels each visible field as source, localized, AI-suggested or fallback and `omissionsByPath` identifies each omitted field/reason without exposing source text/IDs.
6. Open the draft in the current editor, edit a field, wait beyond the autosave debounce and reload status. Confirm no save occurred while approval was pending. Send an ordinary PATCH without approval proof and confirm it is rejected; explicitly save with the matching operation ID/hash and verify one conditional write, one content-version increment and `APPROVED` state.
7. Request regeneration using the pending review operation ID/hash for one target from each processing class: an experience/project entry (AI-generated), an education entry (copy/localization), and a skill group or activity/certificate/award entry (existing grouping/copy/localization). Confirm only the selected item and its origin label change, `sourceRefsByPath` contains references but no source text, the original review operation ID remains and the draft hash advances. Reject identity/contact/ID/`section_order` paths, missing or ambiguous source mappings, stale hashes, missing output and concurrent edits; confirm every rejected attempt leaves the pending draft and metadata unchanged.
8. Repeat and reject. Confirm pending text is removed, `REJECTED` is recorded, and the source CV/profile, primary state and searchable permission remain unchanged. Advance the fake clock beyond seven days and verify the existing scheduler expires and clears an abandoned pending draft.
9. Exercise duplicate idempotency key, same key/different request/target, stale profile/CV/job version, changed consent, non-owner access, cancellation before/after provider response, timeout, invalid schema, missing tool, altered receipt, conflicting source facts, prompt-injection text in CV/job fields, and concurrent editor save. Verify no late or invalid output is staged or applied and source text cannot alter instructions/tools.
10. Force a mixed result with one valid retained field and one invalid field; expect `DEGRADED`, a schema-valid draft containing only individually valid fields, and an omission path/reason for the removed field. Force a result where the safe retained set cannot be determined; expect `FAILED` with no pending draft. Confirm every Agent/legacy ordinary internal client without the opt-in still gets the bare `CvDraft` body.
11. In the authorized staging performance run, measure both synchronous and asynchronous requests from API acceptance through completion or actionable status, including queue delay for async. Confirm the 300-second operation deadline, the 95% SC-006 target and late-result fencing; the 600-second provider cap remains only an upper safety ceiling.
12. Disable the capability while another request is queued/active. Confirm selection is fixed for the active internal CV request, new generation and pending-item regeneration requests use the legacy generator, and old operation/pending-review state remains resolvable.

## Flag-Off and Code Rollback

1. Stop admitting Agent work by removing `cv_generation` from the configured `agent_enabled_capabilities` set. Keep the configuration stable while already admitted queue work drains; do not retry an Agent-selected operation through the legacy selector.
2. Let queued/in-flight operations reach a terminal state, or cancel them and retain their safe failure status. Use a new idempotency key and operation for any user-requested retry; new requests while the capability is disabled select legacy.
3. Keep the NestJS review endpoints, pending-draft metadata, explicit Save/Reject handling and expiry scheduler active while any pending drafts exist. Users must still be able to read, approve, reject or expire drafts created before flag-off.
4. Do not remove pending snapshots or restore old code paths until outstanding drafts have been explicitly resolved or expired and queue workers have drained. Code rollback must preserve the owner-scoped approval/hash checks and discard/expiry behavior; do not alter canonical CV/profile data to clear staged drafts.
5. Verify flag-off behavior with the deterministic selector/API tests and the existing pending-draft save, reject, selected-regeneration and expiry tests before deploying the rollback. Keep the capability disabled if those review paths are unavailable.

## Expected Outcomes

- All provider/network calls are doubles; generated facts are traceable to fixture source indices and owned skill lists.
- Existing public generation requests and `CvDraft` schema compatibility tests pass.
- No generated content is written into canonical CV fields before user Save; the pending draft remains isolated/owner-scoped and no source profile data is changed.
- Selected-item regeneration replaces only the requested item in the pending draft and fails safely when its expected hash or target is stale/invalid.
- Regeneration reruns the existing per-section behavior; it does not create new AI generation for sections currently copied/grouped/localized, and never targets identity/contact or operational metadata.
- Every retained editable field has one correct origin label; every omitted field in a `DEGRADED` draft has a safe path/reason code, and an unsafe partial result is never staged.
- Source references used to resolve a target contain only field/index references; no profile, CV or job text is stored in the queue or target map.
- SC-006 measurement uses the workload cap of 50 items in each input list and a 300-second request-to-actionable-status deadline including queue wait.
- SC-007/SC-008 use the spec's scripted 30-person review task and fixed 1–5 usefulness question; provider data-use and retention terms are verified before staging release.
- Duplicate, stale, cancelled, unauthorized or receipt-invalid runs produce no pending draft.
- Review and operation records contain only the required owner/version/hash/state metadata; logs contain no CV/prompt/provider output.
