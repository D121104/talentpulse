# Research: Rút gọn quy trình tạo CV

**Feature**: [Rút gọn quy trình tạo CV](./spec.md)  
**Date**: 2026-11-21

## Decisions

### 1. Simplify only measured local-model compensation

**Decision**: Select a small immutable CV-generation processing policy once per request inside the existing `CvDraftGenerationService`, reusing existing localization/provider-limit policies. A step may be removed or reduced for a hosted profile only when deterministic contract tests and comparable quality evaluation show it is redundant for that profile. Keep local behavior unless separately approved; do not introduce a general policy framework.

**Rationale**:

- `service.py` contains explicit Qwen3 4B CPU latency rationale for core generation, localization batches, per-entry core repair and numeric settings. The current local launcher defaults to Qwen3 8B, so the 4B comments are historical tuning evidence, not proof of the deployed local model.
- A stronger hosted model does not itself prove that repair, localization, fallback, or output validation is unnecessary.
- Checked-in hosted defaults include Bedrock `global.moonshotai.kimi-k3.1` and Gemini `gemini-2.5-flash`; actual deployed/enabled profiles may differ. Enumerate enabled non-secret profiles without reading or logging credentials.
- The CV Agent capability is disabled by default in checked-in settings. Agent and legacy selection use the same generation service; disabling Agent is not an algorithm rollback.

**Alternatives considered**:

- Delete all repair, localization and fallback code in one pass: rejected because it can increase missing/incorrect draft content and removes profile compatibility before evidence exists.
- Leave all Qwen-tuned controls in shared provider behavior: rejected because some controls are explicitly described as local-model workarounds and may be irrelevant to hosted requests.
- Add a new general policy framework or user-facing toggle: rejected unless the audit proves the existing provider capability/profile selection cannot express the minimum required difference.

### 2. Keep application-owned factual and product validation

**Decision**: Retain strict `CvDraft` validation, request/source index identity, locale checks, job relevance, grounding checks, safe partial-result validation, warnings/omission provenance, and the explicit review/save lifecycle. Provider-side structured output is guidance and does not replace application checks.

**Rationale**: These rules protect the applicant from unsupported facts, wrong-source borrowing, wrong-language output and accidental canonical writes. They are product/safety contracts, not evidence of weak-model compensation.

**Alternatives considered**:

- Trust a provider's schema-constrained output and delete downstream checks: rejected because structure does not establish truth, source identity, consent, or locale correctness.
- Remove deterministic fallback entirely: rejected until evaluation proves the replacement has equal safe behavior on incomplete inputs and provider failures.

### 3. Keep hard resource and late-result bounds

**Decision**: Retain a finite total deadline, per-call deadline, finite call/repair ceiling and rejection of results that arrive after the deadline. Revisit phase budgets only where baseline measurements show an unnecessary hosted-only wait; do not make retries unbounded.

**Rationale**: Deadlines and call caps bound provider cost and protect the worker/API from hung calls. Existing local timing may justify different provider-specific budgets, not deletion of the global safety bound.

### 4. Reuse current deterministic evaluation and make hosted calls opt-in

**Decision**: Reuse `ai-service/evals/datasets/generation_quality_eval_v1.json` and `hosted_generation_eval.py` for `CV_GENERATION` and `CV_LOCALIZATION`; use the same fixed synthetic cases for baseline and candidate and add focused deterministic fixtures only for uncovered behavior. Routine tests use fake providers. Hosted evaluation and human ratings remain opt-in and require explicit cost/data authorization.

**Rationale**:

- The existing dataset contains 30 application-valid CV-generation requests and is designed for sanitized quality review.
- The runner reports first-pass contract validity separately from service completion/repair/fallback and does not claim release readiness.
- The runner currently requires all seven journey groups, although this feature needs only CV generation/localization; add an opt-in journey filter while keeping the all-journey default.
- The report currently omits the generator's call-kind/count, repair, latency and omission metrics; add bounded non-PII metrics for baseline/candidate comparison.
- The Bedrock evaluation setup omits the bounded `agent_client_factory` required when `ProviderRuntime` supplies a timeout. Reuse production bounded-client construction and cover it with scripted adapter tests before any hosted run.
- Previous project research records that live evaluation was not authorized because of its provider-call cost. This plan does not override that decision.

### 5. Preserve existing service boundaries and rollback without migration

**Decision**: Keep the implementation inside `ai-service/modules/cv_generator`, existing settings/provider selection and evaluation runner. Keep the internal `CvDraftRequest`, bare `CvDraft`, opt-in review envelope, public NestJS routes, frontend flow and persisted data unchanged. Roll back by restoring the previous AI-generation code/policy or AI-service release, with no data repair or migration. Do not use the Agent capability selector as an algorithm rollback switch.

**Rationale**: The simplification concerns how the AI service composes a draft; NestJS owns authorization/canonical writes and the existing approval lifecycle is already a product guarantee.

## Constraint Inventory

| Current stage/control | Evidence in current code | Disposition | Required proof before change |
|---|---|---|---|
| Separate structured core call for experience/project bullets | `core_generation.py` comments identify Qwen3 4B quality/attention rationale; call produces only bullet narratives. | Candidate to reduce for hosted profiles; retain unless the complete hosted request can satisfy grounding and source-index contracts. | Same-case hosted baseline/candidate first-pass rate, factual review, source-index tests and local regression. |
| Per-entry core repair | `core_generation.py` forms repair entries for missing/focus bullets; one bounded repair is applied per entry. | Candidate to reduce/skip only for hosted profiles shown not to need it. | Provider-call count and missing-bullet/grounding outcomes on fixed synthetic cases. |
| Localization chunks and source-character cap | `service.py` sets chunk size 6 and 1,500 source characters; `localization.py` batches by both dimensions. | Keep input/context bounds initially; candidate to increase or simplify on hosted profiles if first-pass locale quality and bounds remain valid. | Locale accuracy, omission rate, latency and request-size comparison. |
| Localization repair batch | `localization.py` retries unresolved/rejected items with one repair pass and records safe omissions. | Candidate to remove/reduce only for a hosted profile if omission/locale quality does not regress; retain safe omission behavior. | Per-field locale checks, safe partial/no-safe-output tests, same-case quality results. |
| Ollama `num_predict` settings for core/localization/repair | `provider_runtime.py` forwards `num_predict` only when the selected adapter accepts it; the AI service has a Qwen/local budget rationale. | Keep local-only. Remove hosted-path wiring only if tests show it is ignored/unneeded and no adapter receives a behavior change. | Adapter request assertions for each enabled profile and unchanged local request tests. |
| Total timeout, phase timeout and provider-call cap | `service.py` defines 120/45/45-second phases, 600-second AI total, and a 12-call cap; `ProviderRuntime` enforces deadlines and late-result rejection. | Retain enforceable ceilings; tune per provider only from measurements. NestJS retains the user-facing operation limit. | Timeout/late-result/call-cap tests and confirmation of user-facing SC-006. |
| Source-index and job-relevance selection | `context_builder.py` selects experience/projects and preserves application targeting; `core_generation.py` validates indices. | Retain as product selection/source integrity, not a local-model workaround. | Existing relevance, ID/index, and non-borrowing tests. |
| Grounding and locale validators | `core_generation.py`, `localization.py`, and `validators.py` reject generic/unsupported/wrong-locale content. | Retain. Do not relax because a model is stronger. | Existing and added unsupported-fact, locale and injection regression tests. |
| Deterministic fallback, omissions and provenance | `context_builder.py`/`draft_builder.py` preserve candidate facts or omit unsafe content with reasons and origins. | Retain safe output behavior; simplify duplicate text shaping only if output remains individually validated and traceable. | Partial/no-safe-set, source-origin and provider-failure tests. |
| Prompt/schema output-shape guidance | `prompt_builder.py` plus `schemas.py` and provider capability paths; hosted structured-output support varies. | Remove only proven repeated shape wording for a capability that enforces the same contract; retain semantic, factual and safety instructions. | Provider request construction tests and unchanged full application validation. |
| CV review and persistence | NestJS stages pending content; editor requires explicit matching approval; source CV changes only after owner save. | Retain unchanged and outside simplification scope. | Existing NestJS/PostgreSQL/editor save, reject, expiry and stale-hash tests. |
| Agent-vs-legacy selector | CV Agent is disabled by default in checked-in settings; both selectors share the generation service and NestJS review-envelope discriminator. | Do not use this selector as an algorithm rollback or change the `implementation` response behavior. | Selector tests and existing owner Save/Reject/Expire lifecycle tests. |

## Evaluation Plan

- Freeze the current AI service version, exact non-secret enabled model profiles, evaluation dataset version, and per-profile test parameters before behavior edits. Never read or print `.env` or credentials.
- Run deterministic unit/API tests on every change. Compare baseline and candidate using the same 30+ synthetic `CV_GENERATION` and `CV_LOCALIZATION` requests for each hosted profile; record first-pass validity, repair/re-request rate, latency, omissions, warning rates and contract failures separately.
- Meet SC-002, SC-003, SC-005 and SC-006. Human reviewers score at least 10 representative drafts per hosted profile for relevance, factual accuracy, usefulness and grounding.
- Interpret SC-005 as a candidate repair/re-request rate at most 70% of baseline; if baseline is zero, maintain zero rather than inventing a positive baseline. Report median/p95 latency separately against SC-006.
- Do not run hosted evaluation during routine tests. Existing project research records no current authorization for provider calls; obtain explicit approval before executing the opt-in runner or sharing draft outputs with reviewers.
- Re-run the local-model regression suite if local support remains enabled. No candidate is accepted if it weakens local contracts.

## Open Runtime Facts to Capture During Implementation

- Confirm which checked-in hosted defaults are enabled in each target environment from non-secret deployment configuration; never read or print `.env` or credentials. Checked-in defaults do not prove deployed model selection.
- Confirm provider data-processing terms and owner approval before any hosted evaluation.
- Record the current baseline call/repair/fallback counts and elapsed-time distribution for the fixed CV-generation cases before removing any step.
- If the live profile list or baseline cannot be captured safely, stop before enabling a behavior change and report the missing evidence rather than guessing.
