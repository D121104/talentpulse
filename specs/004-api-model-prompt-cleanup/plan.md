# Implementation Plan: API Model Prompt and Schema Cleanup

**Branch**: `refactor/ai-gen-cv` | **Date**: 2026-11-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/004-api-model-prompt-cleanup/spec.md`

## Summary

Audit every in-scope text-generation path, then remove only constraints proven redundant or incompatible while preserving product response contracts and application validation. Keep one product-level contract with provider-specific request construction: simplify Gemini's response schema to its documented supported subset, retain prompt-plus-parse validation for the configured Bedrock Nova Lite model (native structured output is not supported), and keep Ollama's `format` schema handling local to that adapter. Expand CV match analysis to the currently enabled hosted providers, using the existing `cv_matching` consent scope and verifying consent in NestJS before any CV-derived facts are sent; add grant/revoke UI using the existing consent policy and API. Simplify duplicate prompt text only after deterministic checks and the specified quality evaluation show no regression.

## Technical Context

<!--
  Technical context and scope for this brownfield service change.
-->

**Language/Version**: Python 3.12–3.13 for AI service; TypeScript/NestJS backend and React/TypeScript frontend for the CV consent boundary and UI.

**Primary Dependencies**: FastAPI, Pydantic v2, boto3/Bedrock Converse, Google Gemini `generateContent` through the existing adapter, Ollama HTTP adapter, NestJS/TypeORM consent service, React/Vite. Add only the minimal Vitest/React Testing Library dev tooling needed to test the new consent interaction because the frontend currently has no test runner.

**Storage**: Existing PostgreSQL `ai_cv_consents` and consent events only; no new tables or fields. Evaluation fixtures remain checked-in synthetic files.

**Testing**: AI service pytest, Ruff, mypy; backend Jest; frontend Vitest/React Testing Library, lint, and build. Provider-boundary tests use deterministic doubles. Hosted model evaluation is a separate, explicit run.

**Target Platform**: Existing Linux AI-service runtime, NestJS API, and React web application; hosted providers are the currently enabled Bedrock and Gemini profiles, with Ollama retained for local development.

**Project Type**: Existing multi-service web application; feature changes are limited to AI generation/provider adapters plus the NestJS consent boundary and frontend consent surface required for CV analysis.

**Performance Goals**: No latency or API-cost reduction target. Preserve existing execution, timeout, output-token, and retry bounds unless evaluation and provider evidence justify a scoped change.

**Constraints**: No public request/response schema change; retain Pydantic validation, authorization, CV-matching consent, grounding, citations, prompt-injection defenses, safe fallback, and rollback. Do not send raw CV text where current match facts suffice. Do not send CV-derived facts to hosted providers without valid `cv_matching` consent. Routine tests must not call live providers.

**Scale/Scope**: RAG generation/review/agent, CV match analysis narrative, CV generation/localization, and other active text-generation call sites across Bedrock, Gemini, and local Ollama. Job-indexing embeddings, retrieval, deterministic ranking, and unrelated providers/workflows are out of scope.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Plan alignment |
|-----------|------|----------------|
| I. Brownfield-First | PASS | Extend existing provider adapters, schemas, prompt builders, CV analysis route, consent API, and consent UI; add no runtime dependency or generic framework. Add only the small frontend test tooling required for the new consent interaction because no current frontend test runner exists. |
| II. Backward Compatibility | PASS | Keep AI public request/response schemas and persistence formats unchanged. The only additive denial is for missing/revoked existing `cv_matching` consent. |
| III. Least-Privilege Agent Safety | PASS | Preserve tool allowlists, input validation, authorization, execution/retry bounds, and controlled provider failures. |
| IV. CV Data Privacy | PASS WITH GATE | Reuse the approved existing consent scope, enforce it in NestJS before hosted dispatch, and send only existing minimal match facts. Test missing/revoked consent as a no-dispatch case. |
| V. Human Approval for Material Changes | PASS | Keep generated CVs as reviewable drafts; no automatic overwrite or persisted business-data changes. |
| VI. Required Testing | PASS | Add unit and service-boundary integration tests with provider doubles, plus the fixed evaluation set and reviewer sample; routine tests remain offline. |
| VII. Rollback and Reversibility | PASS | No migration is planned. Prompt/schema/provider changes are reversible by restoring prior assets; consent UI changes can be reverted without changing stored records. |

The existing CV consent policy text/version remains unchanged per the clarified requirement. Before release, verify the existing `cv_matching` grant state is read for the correct applicant and the check occurs before hosted dispatch; do not infer consent from HR access or premium entitlements. Because the current policy text does not name external model providers, obtain privacy-owner confirmation that the existing consent is sufficient before rollout; do not change policy text without separate approval.

## Project Structure

### Documentation (this feature)

```text
specs/004-api-model-prompt-cleanup/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/ai-generation-and-consent.md
└── tasks.md                 # Later /speckit.tasks phase
```

### Source Code (repository root)
<!--
  Existing source paths directly affected by this feature.
-->

```text
ai-service/src/talentpulse_ai/
├── core/config.py
├── infrastructure/{provider_factory.py,llm/{gemini,bedrock,ollama}.py}
├── agent_foundation/model.py
├── modules/
│   ├── rag_chatbot/{agent.py,generation/,prompts/}
│   ├── cv_analysis/{analysis.py,schemas.py}
│   └── cv_generator/{core_generation.py,localization.py,provider_runtime.py,prompt_builder.py,schemas.py}
└── scripts/evaluation/{hosted_generation_eval.py,...}

ai-service/tests/
├── unit/{providers,agent_foundation,rag_chatbot,cv_analysis,cv_generator,evals}/
└── integration/{test_chat_api.py,test_agent_chat.py,test_cv_match_api.py,test_cv_api.py}

backend/src/{applications/applications.service.ts,ai-consents/}
frontend/src/{lib/cvApi.ts,components/consent/}
frontend/tests/consent/
```

**Structure Decision**: Keep work in existing service owners. AI-service owns prompt/schema projection, provider-specific generation, and response validation. NestJS owns applicant authorization and checks the existing `cv_matching` consent before CV-derived data crosses to the AI service. Frontend exposes grant/revoke for that existing scope through current policy metadata and endpoints. No database migration, retrieval/embedding change, or generic provider framework is planned.

## Post-Design Constitution Re-check

| Principle | Result after design | Evidence/gate |
|-----------|---------------------|---------------|
| I. Brownfield-First | PASS | Uses existing Gemini/Bedrock/Ollama adapters, Pydantic models, consent APIs/storage, and service modules. The focused evaluation runner and minimal frontend test tooling are justified by acceptance criteria and the lack of existing hosted-generation/UI evaluation support. |
| II. Backward Compatibility | PASS | No AI/consent endpoint schema or database schema changes. Existing consent check adds only the specified controlled denial for missing/revoked `cv_matching`. |
| III. Least-Privilege Agent Safety | PASS | Agent tool lists and bounds stay unchanged; provider validation and denial remain in application code. |
| IV. CV Data Privacy | PASS WITH RELEASE GATE | NestJS checks the correct applicant's active `cv_matching` scope before AI-service dispatch; only existing derived facts are sent; no-consent tests assert zero dispatch; no CV facts/prompts enter logs or fixtures; privacy owner confirms existing policy suitability before rollout. |
| V. Human Approval for Material Changes | PASS | CV generation remains an editable draft. No direct CV write, application decision, or score change is introduced. |
| VI. Required Testing | PASS | Provider request tests, CV analysis/consent unit and integration tests, frontend consent interaction tests, and opt-in quality evaluation cover the affected boundaries. Routine tests remain deterministic. |
| VII. Rollback and Reversibility | PASS | No data migration; code/UI changes can be reverted and the old local path remains available. Evaluation artifacts are synthetic and removable without data recovery. |

**Gate result**: PASS with the CV consent release gate above. No constitution violation needs an exception or a complexity-tracking entry.
