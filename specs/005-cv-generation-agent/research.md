# Research: Tác tử tạo CV TalentPulse

## Scope and Baseline

Reviewed the feature spec, project constitution, `docs/architecture/agent-foundation-integration.md`, AI CV generation source/schemas/tests, NestJS OnlineCV endpoints/worker/client, and current React editor behavior. No application code was changed for this plan. The generation architecture and source mappings are decided; provider processing/training/retention terms remain a release verification gate and must be known before routing CV facts.

## Decisions

### 1. Keep the current CV pipeline as the content-generation authority

**Decision**: Wrap `CvDraftGenerationService.generate()` with a Foundation capability tool; do not implement a second CV generator.

**Rationale**: The current service already composes candidate context preparation, optional selected-job skill prioritization, `generate_core`, `localize_fields`, `build_draft`, `ProviderRuntime` and CV validators. It has bounded chunking, provider calls, timeouts, one repair pass, source indices and fallback warnings. Its external product contract is already `CvDraftRequest → CvDraft`.

**Evidence**:
- `ai-service/src/talentpulse_ai/modules/cv_generator/service.py`: `CvDraftGenerationService.generate()` orchestrates core generation, localization and final assembly.
- `core_generation.py`, `localization.py`, `draft_builder.py`, `context_builder.py`, `validators.py`: existing factual boundaries and section transformations.
- `schemas.py`: strict `CvDraftRequest`, `ProviderCoreDraft`, `CvDraft`; `source_index`, ownership and size constraints.
- `prompts/generate_v1.txt`, `prompts/tailor_v1.txt`: existing generation/tailoring instructions.

**Alternatives considered**:
- Generate a full `CvDraft` directly from a new Agent prompt: rejected because it bypasses chunking, localized-field handling, source-index acceptance and existing fallback behavior.
- Rewrite the pipeline as Agent nodes: rejected because it duplicates working domain logic and increases migration scope.

### 2. Use the existing Foundation LangGraph execution/tool boundary

**Decision**: Register capability ID `cv_generation` and execute through existing `execute_agent()`/`build_agent_graph()`, `AgentDefinition`, `AgentRequest`, `AgentModelAdapter`, `ExecutionPolicy`, `ToolRegistry`, `ToolDispatcher` and `ToolAuthorizer`. Allow only `cv.generate_draft`.

**Rationale**: `langgraph==1.2.22` is already the approved orchestration dependency. Foundation generic execution already validates tool input/output, enforces allowlist/authorization/budget, and validates final output. The model does not need access to a new database/API tool.

**Evidence**:
- `agent_foundation/execution.py`, `contracts.py`, `model.py`, `selector.py`, `tools.py`.
- `main.py` currently registers the RAG capability only; CV router does not select an Agent yet.
- `core/config.py`: `agent_enabled_capabilities` defaults to `{"rag.generate"}`; CV remains disabled until explicitly enabled.

**Tool/result pattern**: The one tool invokes the existing generation service using a validated, authorized context snapshot. Its handler holds the full validated `CvDraft` in request-scoped memory and returns only a small receipt/hash to the Agent graph. The Agent final output must echo the tool receipt. The capability adapter checks `usage.tool_calls == 1`, receipt/hash equality and a populated invocation holder, then returns the stored `CvDraft`; it never trusts model-rewritten CV fields. A model that skips the tool, fabricates a final draft or changes the receipt is rejected.

**Alternatives considered**:
- Expose source lookup, arbitrary HTTP, database or write tools: rejected because NestJS already resolves authorized sources and owns persistence.
- Return the entire CV draft as tool output and feed it into a second model call: rejected because it needlessly re-exposes sensitive content and consumes extra context; the receipt is sufficient to prove the approved generation tool ran.
- Add a capability-specific orchestration framework: rejected; Foundation already owns this control flow.

### 3. Collect candidate and job context in NestJS before AI invocation

**Decision**: NestJS remains the only owner of identity, ownership, CV/profile, job, consent and version checks. The worker sends the existing strict `CvDraftRequest` snapshot to FastAPI; FastAPI/Agent performs no business database read.

**Rationale**: Existing request already has candidate, job, locale, template, source/content versions, consent version and request/trace/attempt IDs. Existing backend verifies candidate ownership, active canonical job, consent, plan eligibility, source version and expected content version before queue and again before completion.

**Evidence**:
- `backend/src/online-cvs/online-cvs.service.ts`
- `backend/src/ai-matching/ai-service.client.ts`
- `backend/src/ai-matching/ai-service.cv-draft.ts`
- `ai-service/src/talentpulse_ai/modules/cv_generator/router.py`

**Alternatives considered**:
- Let Agent tools fetch profile or job directly: rejected because it bypasses the owner boundary and duplicates authorization.
- Add a FastAPI-to-NestJS callback/tool: rejected because the existing hydrated request is sufficient and public/internal API contracts should remain stable.

### 4. Persist an unapproved pending draft separately from CV content

**Decision**: Keep operation metadata in the existing generation trace and stage the result under a typed `generationSnapshot.pendingDraft` JSONB child. Do not write generated content to the canonical CV columns, increment `contentVersion`, change `isPrimary`, or change `isSearchable` until explicit Save. The user reviews/edits in the existing editor. Explicit Save uses existing `PATCH /online-cvs/:id` and its expected-version/owner checks. Reject uses one additive owner-authorized discard endpoint; pending data expires after 7 days.

**Rationale**: The current worker writes generated fields into the same `OnlineCV` before the editor receives the result, and `CVEditorPage.applyGeneratedDraft()` calls `markDirty()` while autosave runs after 900 ms. Merely showing a confirmation would therefore not protect the source CV. The JSONB snapshot and existing status response provide a small additive staging boundary without a new table or Foundation checkpoint.

**Evidence**:
- `OnlineCV.generationSnapshot` and `revision.sourceTrace.generation` are existing JSONB storage.
- `operationResponse()` returns `current` and `draft`; it can keep `current` unchanged and return the staged draft.
- `CVEditorPage.tsx`: generated draft currently marks the editor dirty; explicit review mode must suppress autosave until user Save.

**Alternatives considered**:
- Persist directly to existing CV and rely on `EDITOR_ONLY`: rejected because the CV content fields are already overwritten before review.
- Add a new database table or LangGraph checkpoint: rejected because existing JSONB operation snapshot is sufficient; approval occurs after the Agent run and must not persist CV text in `agent_checkpoint`.
- Use Foundation `ApprovalManager`: rejected for this flow because the approval manager is currently initialized with no action executors and approvals disabled; the user's explicit editor Save is authorized and persisted by NestJS. Foundation approval remains for a future resumable action that truly pauses a live Agent.

### 5. Keep API contracts stable with additive review metadata

**Decision**: Keep all current endpoint paths and required request fields, the internal `/internal/v1/cv/draft` boundary, and the exact `CvDraft` shape. Add optional review metadata, an optional `regenerationTarget` on the existing async generation-job request, an optional `generationApproval` object on the existing update request (required only for a pending draft), and an additive `DELETE /online-cvs/:id/generation-jobs/:operationId/draft` route for rejection.

**Rationale**: Existing clients can continue to parse required fields; new editor behavior is activated only when the optional review state is present. NestJS can reject ordinary autosave while a pending draft exists and require the operation/hash proof on explicit Save. A separate discard action is needed because the existing cancel route only cancels active queued/running work.

**Evidence**: `online-cvs.controller.ts`, `async-cv-generation.types.ts`, `ai-service.cv-draft.ts`, `cvTypes.ts`, `CVEditorPage.tsx`.

### 6. Use existing bounded retries and no same-request legacy retry

**Decision**: Keep CV service's current provider-call cap, total timeout, one repair pass and non-retryable timeout/deadline behavior. Foundation calls are bounded separately. If Agent execution fails after selection, return controlled failure/degraded output; do not call legacy in the same request. User retry creates a new attempt/operation; same idempotency key returns the original operation.

**Rationale**: The generation pipeline already has explicit deadlines and failure policy; a second hidden full generation can duplicate provider cost and race persistence. Selector rollback applies to new operations only.

**Evidence**: `service.py`, `provider_runtime.py`, `async-cv-generation.types.ts`, `online-cvs.service.ts`, `selector.py`, Foundation integration guide.

### 7. No Foundation checkpoint for this draft/review lifecycle

**Decision**: Keep Agent run request-scoped and compile without checkpointer. Persist only the business operation, output draft pending review, source/consent/version references, receipt hash and review status in NestJS-owned state. Do not store raw prompts, provider output or CV text in Foundation checkpoint tables.

**Rationale**: Human review happens after generation has completed in a separate editor session; the workflow does not need to resume an LLM/tool execution. The owner service already supports async status/cancel/version fences.

**Alternatives considered**: Foundation approval graph/checkpointer was rejected because no active action executor/resume integration exists for CV writes, and checkpointing CV text would increase privacy scope.

### 8. Regenerate one selected pending-draft item without replacing the rest

**Decision**: Allow one selected user-visible content field/entry (`position`, `career_objective`, `education`, `work_experience`, `projects`, `skills`, `activities`, `certificates`, or `awards`); exclude name/contact, IDs and internal/display metadata. Reuse the existing async generation operation with a validated target path, pending review operation ID and expected draft hash. Persist only a non-content `sourceRefsByPath` map in the pending-draft envelope so NestJS can resolve one selected output item to its authorized source references. Re-run the existing per-section behavior: AI core generation for work experience/projects, current derived/localization for position/objective, current copy/localization for education/text collections, and current owned-skill grouping for skills. FastAPI keeps the existing `CvDraftRequest → CvDraft` contract and generator. NestJS copies only the target result into the pending draft using a hash compare-and-set.

**Rationale**: This satisfies the clarified review behavior without adding another Agent runtime, LLM adapter or public generation route. Binding the request to the pending draft hash prevents a delayed regeneration from overwriting user edits or another regeneration; canonical CV fields remain untouched until explicit Save.

**Privacy boundary**: Identity/contact fields, candidate/user/CV IDs and operational metadata are never target paths or provider-prompt content. Provider use is gated on verified processing/training/retention terms approved for CV facts; unresolved terms block routing.

**Alternatives considered**:
- Replace the entire pending draft after regeneration: rejected because it would discard unselected items and local review work.
- Add a separate generation service or provider path for item regeneration: rejected because the existing generator and internal schemas can be reused with a restricted authorized source snapshot.

### 9. Return field-origin and safe-partial review metadata outside `CvDraft`

**Decision**: Add optional, owner-checked `reviewMetadata` to existing sync/async review responses without changing `CvDraft`. NestJS opts in to an outer FastAPI review envelope with a trusted `X-Cv-Review-Metadata` header; callers without it keep the exact existing bare `CvDraft` response. The sidecar contains a field-path-to-origin enum map (`SOURCE`, `LOCALIZED`, `AI_SUGGESTED`, `FALLBACK`) and an omitted-field path/reason-code list. Stage a `DEGRADED` draft only when every retained field independently passes structural and factual validation; otherwise fail without staging.

**Rationale**: The editor needs field-level origin labels and precise omission explanations, while the strict CV schema and existing clients must remain compatible. Safe reason codes/paths expose no source content, PII or provider messages. This also makes the current broad partial-output behavior testable.

**Alternatives considered**:
- Add provenance or warning properties to `CvDraft`: rejected because it forks the existing schema.
- Show a draft-wide warning or allow any schema-valid partial output: rejected because the user cannot identify which field needs review and schema validity alone does not prove factual safety.

## Resolved Technical Questions

- **Orchestration**: LangGraph `StateGraph` via Agent Foundation, version `1.2.22`.
- **Persistence/checkpointing**: existing NestJS operation/CV JSONB state; no LangGraph checkpoint for the CV agent.
- **Public contracts**: exact CV draft schemas and existing routes remain; optional `reviewStatus`/`draftHash`/`reviewMetadata`, optional `regenerationTarget` and discard are additive.
- **Feature flag**: existing `agent_enabled_capabilities` with capability `cv_generation`; not enabled by default.
- **Fallback**: legacy is selected for a new request when the capability flag/registry is off; no second legacy call after an Agent-selected run fails.
- **Privacy**: CV/job text is untrusted input, model prompts exclude identity/contact and internal IDs, and each provider's data processing/training/retention terms must be verified before release.
- **SC-006 deadline**: benchmark a profile capped at 50 items in each input list; measure from NestJS request acceptance including queue wait. Return completion or an actionable status within 300 seconds. The existing 600-second provider ceiling remains a hard upper bound, subordinate to the 300-second operation deadline; timeout/cancellation fences any late result.
- **Review regeneration**: selected-item regeneration uses the existing async generation-job flow, validates owner/consent/pending operation/hash and target, and compare-and-sets only the selected item in the staged draft.
