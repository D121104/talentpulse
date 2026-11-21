# Implementation Plan: Rút gọn quy trình tạo CV

**Branch**: `[006-simplify-cv-generation]` | **Date**: 2026-11-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/006-simplify-cv-generation/spec.md`

## Summary

Audit the current CV-generation stages and reduce only the retries, split-generation work, or provider settings shown by evidence to be unnecessary for supported hosted profiles. Select one small immutable processing policy per CV request inside the existing generation service, reusing existing localization/provider-limit policies rather than adding a general framework. Keep the strict `CvDraft` contract, source-index mapping, factual and locale checks, safe partial-result behavior, hard execution bounds, consent/authorization boundaries, and the explicit review/save lifecycle. Keep public contracts and persisted data unchanged. The Agent selector is not an algorithm rollback because Agent and legacy paths share this generator; rollback means restoring the prior AI-service policy/release while preserving pending-review handling.

## Technical Context

**Language/Version**: Python 3.12-3.13 for the owning AI service; existing NestJS/React consumers remain contract-test boundaries only.

**Primary Dependencies**: Existing FastAPI service, Pydantic v2 schemas, provider adapters/factory, `LocalizationPolicy`, `ProviderLimits`, `uv`, pytest, Ruff, and mypy. No new runtime dependency is planned. Checked-in defaults include local Qwen3 8B, Bedrock Kimi K3.1 and Gemini 2.5 Flash; deployed enabled profiles remain environment-specific and must be confirmed without reading secrets. CV Agent is disabled by default in checked-in settings.

**Storage**: No new storage or migration. PostgreSQL remains canonical for saved CV/profile data; this change only alters how the existing AI service produces the existing draft/review result.

**Testing**: Deterministic pytest provider doubles for unit/orchestration tests; FastAPI integration tests for the unchanged bare-draft and review-envelope contracts; existing NestJS/PostgreSQL and frontend lifecycle suites for persistence/review regression; the existing hosted-generation evaluation is opt-in and must not run without explicit cost/data authorization.

**Target Platform**: Linux AI-service container and the existing NestJS/React product path.

**Project Type**: Multi-service web product; this feature is owned by the Python AI CV-generation module.

**Performance Goals**: On identical hosted-profile cases, reduce the repair/re-request rate to at most 70% of its recorded baseline (if baseline is zero, keep it at zero), while meeting 95% first-pass contract validity and 90% reviewed quality. At least 95% of valid requests must complete or return an actionable error within 300 seconds.

**Constraints**: Preserve application validation after provider output; do not weaken source evidence, locale, ownership, consent, prompt-injection, privacy, provenance, explicit human approval, or late-result fences. Keep per-call/total deadlines and finite retries/call bounds. No public API/schema or database changes. Never include real CVs in routine fixtures or logs. No live hosted evaluation without explicit approval. Do not use the Agent on/off selector as an algorithm rollback switch.

**Scale/Scope**: One existing CV-generation journey across currently enabled hosted model profiles, plus regression verification of the supported local profile. No CV matching, job search, retrieval, embeddings, ranking, or unrelated prompt cleanup.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

No `.specify/memory/constitution.md` exists. Apply the repository contract and `.kilo/rules` as the governing principles:

| Gate | Plan decision | Status |
|---|---|---|
| Service ownership | Keep generation changes in `ai-service/modules/cv_generator`; NestJS remains authorization/canonical persistence owner and React remains presentation owner. | PASS |
| Data integrity and human approval | Return the existing editable draft; do not write canonical CV/profile fields or bypass the user's explicit approval. | PASS |
| Privacy/security | Minimize candidate facts sent to external providers; retain consent/authorization checks and prompt-injection defenses; do not log CVs/prompts/provider payloads. | PASS |
| Testability | Add deterministic unit and integration regressions before changing behavior; keep live model calls out of routine tests. | PASS |
| Reversibility | Limit changes to the AI generation path/provider policy and preserve a code rollback path; no data migration. | PASS |
| Architecture and scope | No new service, API, persistence model, dependency, or runtime configuration unless audit evidence proves it necessary. | PASS |

No gate requires an exception or a new architecture layer.

## Project Structure

### Documentation (this feature)

```text
specs/006-simplify-cv-generation/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)
```text
ai-service/src/talentpulse_ai/modules/cv_generator/
├── service.py
├── core_generation.py
├── localization.py
├── provider_runtime.py
├── context_builder.py
├── draft_builder.py
├── validators.py
└── prompt_builder.py

ai-service/tests/unit/cv_generator/
ai-service/tests/integration/test_cv_api.py
ai-service/evals/datasets/generation_quality_eval_v1.json
ai-service/src/talentpulse_ai/scripts/evaluation/hosted_generation_eval.py
ai-service/tests/unit/evals/test_hosted_generation_eval.py
ai-service/src/talentpulse_ai/core/config.py

backend/src/online-cvs/                 # compatibility regression only
frontend/src/pages/cv/                  # lifecycle regression only
specs/006-simplify-cv-generation/
├── research.md
├── data-model.md
├── contracts/cv-generation-compatibility.md
└── quickstart.md
```

**Structure Decision**: Reuse the existing AI-service CV generation module, current provider selection/configuration and evaluator. No new service, service boundary, storage layer, or frontend/backend feature is planned. Backend/frontend suites serve as compatibility regression checks only.

## Execution Strategy

1. Complete the before-change inventory and record provider-specific evidence, existing quality checks, and the exact baseline for the synthetic CV-generation evaluation.
2. Add/update deterministic tests for any hosted-profile simplification before changing the pipeline. Tests must cover first-pass valid output, partial/unsafe output, factual grounding, locale, source identity, provider failures, deadlines and local-profile compatibility.
3. Make the smallest reversible change to an evidenced local-model compensation, reusing existing per-provider policy seams. Keep application-owned validators, safe fallback/omission behavior and hard resource bounds; do not remove multiple stages in one unmeasured change.
4. Extend the existing evaluator to select only CV_GENERATION/CV_LOCALIZATION journeys and emit safe call-kind/count, repair, latency and omission metrics. Fix the Bedrock bounded-client factory setup with production-equivalent construction and deterministic tests.
5. Compare baseline and candidate with the same synthetic inputs. Run live hosted evaluation and human scoring only after explicit authorization; the routine test run must remain provider-free.
6. Run AI-service static/tests and affected internal/API compatibility suites, then update the disposition ledger. If quality or safety thresholds regress, restore the prior behavior/release before rollout.

## Phase 0/1 Design Outputs

- `research.md`: current stage/constraint inventory, keep/simplify/remove candidates, evidence and evaluation limits.
- `data-model.md`: existing request/draft/review data and state lifecycle; explicitly no new persisted entity or migration.
- `contracts/cv-generation-compatibility.md`: existing request/response contracts and invariants that remain unchanged.
- `quickstart.md`: deterministic validation commands, optional authorized hosted evaluation procedure and rollback steps.

### Post-Design Constitution Check

**Status: PASS.** Phase 1 adds only design artifacts and an opt-in evaluator extension within the existing AI service. The design creates no canonical data fields, API changes, external provider call in routine tests, new dependency, or automatic-save path. Any hosted evaluation remains explicitly authorized; rollback restores code/policy while preserving current pending-draft review routes.

## Complexity Tracking

No constitution violations or additional architectural complexity are planned.
