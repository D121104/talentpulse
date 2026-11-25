# Implementation Plan: Rút gọn quy trình tạo CV

**Branch**: `[006-simplify-cv-generation]` | **Date**: 2026-11-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/006-simplify-cv-generation/spec.md`

## Summary

Replace the legacy CV-generation pipeline with one `CvGenerationAgent` call that returns a strict structured content response from Gemini or Bedrock. Put the requested locale in the prompt; remove separate locale/lexical/skill-rule/localization/bullet-shaping/repair/fallback stages and the legacy selector. Keep app-owned identity/contact/source fields, source-index validation, consent, prompt-injection separation, review metadata, bounded execution and explicit pending-draft Save. The public NestJS route and saved CV schema stay unchanged. Rollback restores the prior source release; the new runtime does not retain a legacy branch.

## Technical Context

**Language/Version**: Python 3.12-3.13 for the owning AI service; existing NestJS/React consumers remain contract-test boundaries only.

**Primary Dependencies**: Existing FastAPI service, Pydantic v2 schemas, Agent Foundation, Gemini/Bedrock structured-output adapters, `uv`, pytest, Ruff, and mypy. No new runtime dependency is planned. Ollama is not a supported CV-generation provider. The configured generation profile must be Gemini or Bedrock; do not read or print credentials.

**Storage**: No new storage or migration. PostgreSQL remains canonical for saved CV/profile data; this change only alters how the existing AI service produces the existing draft/review result.

**Testing**: Deterministic pytest provider doubles for unit/orchestration tests; FastAPI integration tests for the unchanged bare-draft and review-envelope contracts; existing NestJS/PostgreSQL and frontend lifecycle suites for persistence/review regression; the existing hosted-generation evaluation is opt-in and must not run without explicit cost/data authorization.

**Target Platform**: Linux AI-service container and the existing NestJS/React product path.

**Project Type**: Multi-service web product; this feature is owned by the Python AI CV-generation module.

**Performance Goals**: Each CV request makes one structured model call and zero tool calls, under the existing finite timeout. Hosted quality thresholds remain independently measured; deterministic fixtures do not count as hosted evidence.

**Constraints**: Validate the structured response schema and source indices; preserve app-owned identity/contact data, ownership, consent, prompt-injection separation, privacy, provenance, explicit human approval and late-result fences. Do not add retries or tool calls. No public NestJS API or database changes. Never include real CVs in routine fixtures or logs. No live hosted evaluation without explicit approval.

**Scale/Scope**: One CV-generation path with Gemini or Bedrock structured output. Other AI features and Ollama embedding/RAG usage are outside scope. No CV matching, job search, retrieval, embeddings, or ranking.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

No `.specify/memory/constitution.md` exists. Apply the repository contract and `.kilo/rules` as the governing principles:

| Gate | Plan decision | Status |
|---|---|---|
| Service ownership | Keep generation changes in `ai-service/modules/cv_generator`; NestJS remains authorization/canonical persistence owner and React remains presentation owner. | PASS |
| Data integrity and human approval | Return the existing editable draft; do not write canonical CV/profile fields or bypass the user's explicit approval. | PASS |
| Privacy/security | Minimize candidate facts sent to external providers; retain consent/authorization checks and prompt-injection defenses; do not log CVs/prompts/provider payloads. | PASS |
| Testability | Add deterministic unit and integration regressions before changing behavior; keep live model calls out of routine tests. | PASS |
| Reversibility | Remove the runtime legacy path as requested; the previous release remains restorable through source control. No data migration. | PASS |
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
├── agent.py
├── router.py
└── schemas.py

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

**Structure Decision**: Keep the Agent in the existing AI-service CV module, use the configured Gemini/Bedrock provider directly with the final response schema, and update the current evaluator. Do not retain a CV legacy selector or fallback. No new service, storage layer, or public API is added. Backend/frontend suites verify pending-draft compatibility.

## Execution Strategy

1. Record the prior revision, existing processing stages, and fixed synthetic data without reading secrets.
2. Test the direct structured response, prompt locale, source indices, app-owned identity fields, provider failure and one-call execution with deterministic doubles.
3. Remove the legacy service/tool path and local-only CV stages; retain consent, review metadata and explicit Save boundaries.
4. Update the evaluator so both CV journeys use the same full-draft Agent with different locales and report bounded non-PII metrics.
5. Run AI-service, NestJS and frontend checks. Keep live Gemini/Bedrock evaluation and human scoring pending explicit authorization.
6. Verify the compatibility contract and record the source-control rollback point; do not alter existing pending drafts.

## Phase 0/1 Design Outputs

- `research.md`: current stage/constraint inventory, keep/simplify/remove candidates, evidence and evaluation limits.
- `data-model.md`: existing request/draft/review data and state lifecycle; explicitly no new persisted entity or migration.
- `contracts/cv-generation-compatibility.md`: existing request/response contracts and invariants that remain unchanged.
- `quickstart.md`: deterministic validation commands, optional authorized hosted evaluation procedure and rollback steps.

### Post-Design Constitution Check

**Status: PASS.** The implementation removes the old runtime path and adds one structured Agent path inside the existing AI service. Routine tests remain provider-free; consent, pending review, and explicit Save stay intact. Hosted evaluation is still authorization-gated; rollback restores the prior source release without a migration.

## Complexity Tracking

No constitution violations or additional architectural complexity are planned.
