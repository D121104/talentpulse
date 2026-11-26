# Research: API Model Prompt and Schema Cleanup

**Feature**: [API Model Prompt and Schema Cleanup](./spec.md)
**Date**: 2026-11-18

## Decisions

### 1. Keep a shared product contract, but build provider-specific requests

**Decision**: Retain Pydantic models and semantic validation as the canonical application contract. Build request schemas and generation settings according to each active provider/model capability; do not pass one unmodified Pydantic JSON Schema to every provider.

**Rationale**:

- The default hosted profiles evidenced in repository configuration are Gemini (`gemini-2.5-flash`) and Bedrock (`amazon.nova-lite-v1:0`); Ollama remains a local-only provider path.
- Gemini supports structured output, but `generateContent` accepts only a supported subset of JSON Schema and rejects schemas that exceed its constraints/complexity. The recent runtime `INVALID_ARGUMENT`/`schema_rejected` event is consistent with this boundary. The exact runtime override model ID must still be checked in the explicit evaluation run; secrets and `.env` files are not part of this planning audit.
- AWS Bedrock's general structured-output API does not imply support on every model. The configured Nova Lite model card marks structured outputs unsupported, so do not add `outputConfig.textFormat` to Nova Lite requests.
- Ollama accepts JSON Schema through its `format` field, but this is a local adapter capability and is not a hosted-provider contract.

**Alternatives considered**:

- Send the complete Pydantic schema to all providers: rejected because Gemini rejects some complex schemas and Nova Lite does not support native structured output.
- Remove provider-side structured output everywhere and rely on prompts: rejected because Gemini and Ollama can enforce supported structural constraints usefully.
- Replace the Bedrock model with a model that supports native structured output: rejected as outside this feature's cleanup scope and an unnecessary model-selection change.

### 2. Keep application validation independent of provider enforcement

**Decision**: Provider schemas are generation guidance/constraints only. Continue full Pydantic parsing, semantic/evidence validation, authorization checks, and controlled failure/fallback for every response, including provider-constrained output.

**Rationale**: Gemini documents that unsupported schema constraints may not be enforced, and a structurally valid response can still be semantically wrong. Nova Lite and Ollama model tags also cannot be assumed to have identical output adherence.

**Alternatives considered**:

- Remove duplicated application validators after adding provider schemas: rejected because provider behavior cannot establish business truth, evidence validity, authorization, or safety.
- Relax the domain response models to make them easier for providers: rejected unless a requirement and evaluation prove a product constraint is unnecessary.

### 3. Simplify prompts only with evidence and flow-level evaluation

**Decision**: Inventory prompts, provider settings, response models, retries, and output limits by generation journey. Remove repeated or provider-incompatible wording only where tests and the agreed quality evaluation show equivalent behavior. Keep Ollama-specific `format`, Qwen thinking, temperature, and schema normalization scoped to Ollama.

**Rationale**:

- CV analysis repeats a final checklist after the main prompt, but those instructions include safety/evidence requirements; duplication alone is not proof that the text is safe to remove.
- CV generation has exact-shape instructions alongside typed output models; the prompt may still guide providers that cannot accept native schemas.
- `num_predict`, output token limits, timeouts, and retry counts affect cost/reliability and are not inherently Ollama-specific. Preserve them until per-provider evidence supports an adjustment.
- Job indexing in the AI service is embedding/Qdrant work and has no generation prompt path; retrieval, embedding, and deterministic ranking remain out of scope.

**Alternatives considered**:

- Delete every repeated prompt instruction: rejected because some repeat the domain safety rules that application parsing cannot fully replace.
- Remove all generation limits inherited from local development: rejected because bounded runtime, output, and retry behavior is required and limits are not proven redundant.

### 4. Treat CV analysis as a hosted generation flow only behind existing consent

**Decision**: Remove the Ollama type restriction from CV match analysis so its existing generated narrative can use the currently enabled hosted providers. NestJS must verify the applicant's existing `cv_matching` consent before provider dispatch. Reuse the existing scope, consent policy/version, grant/revoke endpoints, and stored consent/event entities; add frontend access to those existing endpoints. Send only the existing minimal match facts, not raw CV text. Missing or revoked consent must stop dispatch.

**Rationale**:

- `MatchAnalysisService.analyze` currently rejects every non-Ollama provider, while `ApplicationsService.getMatchAnalysis` sends a derived `NarrativeRequest` to the AI service.
- `ApplicationsService.getMatchAnalysis` checks HR entitlement and company access but has no `cv_matching` consent check before its AI call. `AiCvConsentsService` supports the scope, while the current frontend consent API usage covers `cv_generation` and the separate candidate-assistant scope, not `cv_matching`.
- NestJS owns authorization and data-transfer decisions. HR entitlement must not be treated as applicant consent.
- The existing consent entity and API already support `cv_matching`; the current frontend client only exposes `cv_generation`, so a user cannot currently grant this scope through the visible UI.
- The user explicitly chose to use the current consent rather than add a scope or change policy text/version.

**Alternatives considered**:

- Send CV facts to hosted models based only on HR access: rejected because HR authorization is not the candidate's AI consent.
- Add a new consent scope or rewrite the existing policy text: rejected by the clarified product decision.
- Keep CV analysis local-only: rejected by the clarified product decision to expand it to hosted providers.

**Privacy gate**: Verify subject ownership and active `cv_matching` consent in the NestJS call path before sending any facts. Add a no-dispatch regression test for missing/revoked consent. Do not log CV facts or prompts.

The current policy text describes the CV-matching purpose but does not name third-party model providers. Per the user's decision, the implementation reuses the existing policy and does not change its version/text; require privacy-owner confirmation that this policy covers hosted processing before rollout. If it does not, block hosted CV analysis rather than silently changing the consent policy.

**Frontend test tooling**: Repository inspection found no frontend test runner or component tests. Add only a minimal Vitest/React Testing Library setup so the new grant/revoke interaction has focused unit coverage; keep authorization and consent enforcement tests in NestJS/Jest.

### 5. Reuse current tests and evaluation, adding only the missing generation coverage

**Decision**: Keep deterministic pytest/Jest/component tests for routine validation. Add/extend an opt-in hosted-generation evaluation set and runner for the in-scope journeys and providers; use synthetic inputs, automated contract/safety checks on all cases, and blind reviewer scoring of at least ten responses per journey/provider.

**Rationale**:

- Existing provider, RAG, agent, CV-analysis, and CV-generation tests are already organized by domain and can host focused regressions.
- `job_search_eval_v1.json` evaluates retrieval, not generated answer quality. `live_cv_generation.py` is Ollama-specific. Neither alone satisfies the new generation-quality acceptance criteria.
- A small feature-scoped dataset/report is required, but a plugin-based evaluation framework or live calls in ordinary tests are not.

## Constraint Inventory (Baseline Before Feature Edits)

This inventory records the implementation state found before cleanup changes in this feature. Existing uncommitted provider-diagnostic work was treated as the baseline and was not reverted.

| Journey / boundary | Current constraint or behavior | Disposition | Evidence / validation |
|---|---|---|---|
| Provider selection | Factory supports hosted Gemini and Bedrock profiles; Ollama is restricted to local/development/test. | RETAIN | `ai-service/src/talentpulse_ai/infrastructure/provider_factory.py`; provider tuple tests. |
| Gemini structured output | Adapter sends the complete supplied `responseJsonSchema`; generic `ProviderGeneration` contains nested references/unions and list bounds, and the runtime recently rejected it as `INVALID_ARGUMENT`. | SIMPLIFY provider schema projection only; retain full Pydantic validation. | `ai-service/src/talentpulse_ai/infrastructure/llm/gemini.py`, `ai-service/src/talentpulse_ai/modules/rag_chatbot/schemas.py`; request-construction and projection tests. |
| Bedrock Nova Lite output | Converse request uses prompt + JSON parsing, temperature 0; no native response schema or explicit output-token cap is sent. | RETAIN current capability-specific path; do not add unsupported schema fields. | `ai-service/src/talentpulse_ai/infrastructure/llm/bedrock.py`; adapter request and malformed-response tests. |
| Ollama schema/settings | `format` receives a normalized schema; `_ollama_schema` inlines refs and removes descriptive/default/string-length metadata; temperature 0, non-streaming, Qwen3 `think=False`, and bounded local `num_predict`/timeout are adapter-local. | RETAIN and keep local-only. Application Pydantic/evidence checks remain authoritative. | `ai-service/src/talentpulse_ai/infrastructure/llm/ollama.py`; Ollama request tests. |
| RAG advice/QA | Uses `ProviderGeneration` and a shared QA template; provider capability routes structured output where available, otherwise existing JSON prompt/parsing remains. | SIMPLIFY only repeated output-shape wording; retain locale, evidence, injection, and uncertainty rules. | `ai-service/src/talentpulse_ai/modules/rag_chatbot/generation/prompt_builder.py`, `prompts/qa_v1.txt`; intent/repair contract tests. |
| RAG job search | Uses a selection schema with up to eight selected IDs and a context-derived ID enum, then app attaches citations/claims and can run a grounding review. | RETAIN selection/evidence semantics; project only supported provider-schema fields and preserve local validation. | `generation/generator.py`, `generation/prompt_builder.py`, `schemas.py`; enum, unsupported-ID, refusal, and grounding tests. |
| RAG CV/job comparison | Provider returns a limited explanation and a separate grounding review; CV/job facts are application supplied. | RETAIN evidence, score, and uncertainty rules; simplify only redundant structural instructions after contract tests. | `generation/prompt_builder.py`, `generation/generator.py`; comparison contract/review tests. |
| Career Chat Agent | `AgentModelAdapter` sends `ModelDecision` schema when provider supports structured output; agent prompt requests structured output; tool/step/time limits are explicit. | RETAIN schema semantics, allowlists, and bounds; remove no safety/tool guidance as prompt duplication. | `agent_foundation/model.py`, `rag_chatbot/agent.py`, `prompts/career_chat_agent_v1.txt`; agent bounded-output tests. |
| CV match analysis narrative | `MatchAnalysisService` rejects every non-Ollama provider before generation. Its long instruction block repeats some final-checklist constraints; schema includes provider-specific complexity such as `const`, length, pattern, and nested enums. | SIMPLIFY provider dispatch/schema for hosted capabilities; remove only demonstrably duplicate prompt clauses after narrative/evidence tests. | `ai-service/src/talentpulse_ai/modules/cv_analysis/analysis.py`; hosted/local provider, schema, language, evidence tests. |
| CV generation draft | Typed draft schemas and prompts both describe exact response shape; output remains an editable draft and only authorized candidate facts are sent. | RETAIN facts/evidence/language/draft guarantees; simplify repeated shape text only when Bedrock and evaluation remain valid. | `cv_generator/schemas.py`, `prompt_builder.py`, `core_generation.py`; provider contract and draft review tests. |
| CV localization | Flat/batched items use application-owned keys, bounded batches, locale checks, and repair prompts; schemas cap batches at 20. | RETAIN key identity, locale and batch bounds; simplify only repeated JSON envelope instructions when supported by all required paths. | `cv_generator/schemas.py`, `prompt_builder.py`, `localization.py`; localization-key and locale regression tests. |
| CV consent boundary | CV analysis runs only on Ollama; NestJS `ApplicationsService.getMatchAnalysis` has HR/job authorization but no `cv_matching` consent check; frontend exposes `cv_generation` consent only. | ADD the existing `cv_matching` check before dispatch and UI controls using existing policy/API; no new scope, policy version, or text. | `backend/src/applications/applications.service.ts`, `backend/src/ai-consents/`, `frontend/src/lib/cvApi.ts`, `frontend/src/pages/cv/MyCVPage.tsx`; no-dispatch and grant/revoke tests. |
| Job indexing/retrieval/embeddings/ranking | Job indexing path is embedding/Qdrant; retrieval and ranking are not language-model prompt generation for this feature. | OUT OF SCOPE | `ai-service/src/talentpulse_ai/modules/job_indexing/`; run existing regression tests to prove no change. |

No prompt/schema, retry, timeout, or output-token bound is removed solely because it originated during Ollama development. Every later change must add its result and evidence to the ledger in this file.

## Before/After Constraint Ledger

| Journey / provider | Before | After / decision | Retained safeguard | Test evidence |
|---|---|---|---|---|
| Gemini structured generation | Adapter passed the complete Pydantic schema to `responseJsonSchema`. | Project to the supported subset; provider-facing complexity bounds are omitted. | Full Pydantic and semantic validation remains application-owned. | `tests/unit/providers/test_hosted_generation_contract.py` |
| Bedrock Nova Lite structured generation | Text generation plus JSON parsing; no native schema field. | Retain prompt-plus-parse and do not add `outputConfig`. | Application validates parsed output against its full typed contract. | `tests/unit/providers/test_hosted_generation_contract.py` |
| Ollama structured generation | Normalized JSON Schema in `format`; non-streaming, temperature zero, Qwen `think=False`, bounded timeout/token count. | Retain all settings within the Ollama adapter; no shared-provider change. | Local response parsing and product validation are unchanged. | `tests/unit/providers/test_ollama_provider.py`; `tests/unit/providers/test_provider_factory.py` |
| RAG job search selection | Selection contract was present in the rendered search prompt and appended a second time for structured providers. | Remove the second append only. | Selection schema, exact allowed job IDs, grounding review, repair and deterministic fallback remain. | `tests/unit/rag_chatbot/test_rag.py::test_search_selection_instructions_are_not_repeated_in_provider_prompt` and job-search repair/grounding tests |
| RAG advice/QA | Shared QA template included CV/job comparison-only instructions; legacy generation lacked an explicit JSON schema hint. | Remove comparison-only text from the shared template; pass the corresponding typed schema as legacy prompt guidance. | Comparison keeps its dedicated prompt; parsed output and citations/evidence continue through existing validators and one repair attempt. | `tests/unit/rag_chatbot/test_rag.py::test_advice_prompt_omits_cv_job_comparison_only_instructions`; `test_legacy_provider_receives_json_schema_guidance_for_advice`; full `test_rag.py` |
| Career Chat Agent | Structured model decision schema plus bounded agent tools/calls and repair. | No prompt or limit cleanup applied; preserve audited safety guidance. | Tool allowlist, authorization, call/step/time bounds, and controlled failure remain unchanged. | `tests/unit/rag_chatbot/test_agent_generation.py` |
| CV match analysis / Gemini and Ollama | Service accepted only an `OllamaGenerationAdapter`; both built a derived evidence-constrained schema. | Use structured generation when exposed by the selected provider capability. | Keep full `MatchNarrative` parsing, locale, numeric/PII, evidence polarity, skill binding, and grounding validation. | `tests/unit/cv_analysis/test_analysis_hosted.py`; `tests/unit/cv_analysis/test_analysis.py`; `tests/integration/test_cv_match_api.py` |
| CV match analysis / Bedrock Nova Lite | No supported native structured output path was available to the service. | Render the derived schema as prompt guidance and parse through the same application validation. | No raw CV sent by this change; NestJS checks current applicant consent before dispatch. | `tests/unit/cv_analysis/test_analysis_hosted.py`; `tests/integration/test_cv_match_api.py`; backend `applications.service.spec.ts` |
| CV generation/localization | Existing provider-specific generation paths, locale checks, localization keys, and editor-only draft behavior. | No prompt constraints removed pending evaluation evidence. | Facts, keys, locale integrity, bounds, and user-review guarantee remain. | `tests/unit/cv_generator/test_cv_generation.py` (Bedrock/structured provider regressions) |
| Consent boundary | CV analysis did not check candidate `cv_matching` consent before sending derived facts. | Gate NestJS dispatch on the matched applicant's current scope, version, and hash; add the existing-policy grant/revoke UI. | HR access does not substitute for candidate consent; denied cases make no AI call. Policy metadata and storage are unchanged. | `backend/tests/applications/applications.service.spec.ts`; `frontend/tests/consent/AiCvMatchingConsentCard.test.tsx` |

The Career Chat Agent audit found no hosted-incompatible wording that could be removed without weakening its untrusted-content, tool-authorization, or bounded-execution instructions; its prompt and call/step/repair limits are intentionally unchanged. CV generation/localization similarly retains the existing instructions because the current audit/tests do not establish a safe redundant block to remove.

The local/provider and generation regression run after these changes completed successfully:
`uv run pytest tests/unit/providers/test_provider_factory.py tests/unit/providers/test_ollama_provider.py tests/unit/providers/test_hosted_generation_contract.py tests/unit/rag_chatbot tests/unit/cv_analysis tests/unit/cv_generator -q` (all passed). This is deterministic regression evidence, not hosted quality-evaluation evidence.

## Release Gates Still Open

- The synthetic dataset now has 210 unique, validated application requests: 30 for each of the seven journeys. Unsupported-field cases are scored for non-assertion rather than fabricated context; comparison and matching fixtures use explicit synthetic snapshots/evidence/consent markers; CV localization uses whole-CV `CvDraftRequest` cases rather than arbitrary provider keys. `validate_application_dataset(..., minimum_cases_per_journey=30)` passed before provider construction.
- Application reports separate successful service completion from `first_pass_contract_valid`, calculate per-provider/per-journey coverage and first-pass rates, and emit sanitized review rows. `--reviewed-report` aggregates unique, complete boolean ratings without repeating provider calls; quality thresholds can be recorded, but `release_ready` remains false because this runner does not test API authorization, canonical retrieval, or persistence.
- No live provider calls or human review were performed. After the runtime call-budget review corrected the earlier estimate of ~420 calls to a worst-case cap around 2,340 generation calls (including up to 12 CV-generation calls per request), the user chose not to run live evaluation at this time. This supersedes the earlier authorization that was based on the lower estimate. T026 remains open until the live evaluation is authorized and run, achieves at least 95% first-pass validity for every provider/journey group, and reviewers complete at least ten ratings per group with at least 90% passing. Scripted-provider tests establish deterministic engineering behavior only, not hosted quality evidence.
- On 2026-11-18, the user explicitly confirmed in response to the privacy gate question that they are the privacy owner or authorized delegate and that the unchanged `cv_matching` policy is sufficient for hosted processing. Policy text, version, and scope remain unchanged.

## Final Deterministic Validation

- AI service: `uv run pytest tests -q` passed; `uv run ruff check src/talentpulse_ai tests`, `uv run ruff format --check src/talentpulse_ai tests`, and `uv run mypy src/talentpulse_ai` passed. `uv run pytest tests/unit/job_indexing/test_indexing.py -q` passed (35 tests).
- Backend: full Jest passed (51 suites, 621 tests; one suite/test skipped); NestJS build passed. `npm run lint` reported 40 Prettier errors in existing unrelated candidate-assistant, execution-lease migration, and environment-validation test files, plus existing warnings. No formatting in those unrelated files was changed.
- Frontend: Vitest passed (1 test file, 6 tests) after discovery was scoped to `tests/**/*.test.{ts,tsx}` so legacy Node-native `.test.mjs` files are not misinterpreted as Vitest suites. TypeScript/Vite build passed with the existing large-chunk warning; ESLint passed with 0 errors and 49 existing warnings.
- Evaluation: `uv run pytest tests/unit/evals -q` passed (61 tests); evaluation runner Ruff/format and strict mypy passed; a no-provider CLI preflight validated all 210 application fixtures across seven journeys. The preflight does not call hosted providers.
- No retrieval/indexing algorithm, embedding settings, ranking logic, public request/response schema, database schema, or persisted records were changed.

## Provider Capability Matrix

| Provider profile | Native structured output | Plan treatment |
|------------------|---------------------------|----------------|
| Gemini `generateContent` | Supported for documented model/profile and schema subset | Send a minimized supported schema projection; retain full Pydantic and semantic validation after generation. Verify the exact configured model alias/profile in the opt-in run. |
| Bedrock `amazon.nova-lite-v1:0` | Not supported according to the current Nova Lite model card | Keep the existing Converse text-generation/JSON parsing path; do not send structured-output fields. Validate the parsed response in application code. |
| Local Ollama | JSON Schema supported through its `format` request field | Keep current local schema adaptation and Ollama-only settings scoped to the Ollama adapter. |

## Research Sources

- Google Gemini API, structured output and supported JSON Schema: https://ai.google.dev/gemini-api/docs/generate-content/structured-output
- Google Gemini API, safety/blocking and response feedback: https://ai.google.dev/gemini-api/docs/generate-content/safety-settings
- AWS Bedrock, structured output schemas and model support: https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html
- AWS Bedrock, Amazon Nova Lite model card and supported capabilities: https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-lite.html
- Ollama, structured output `format` and Pydantic JSON Schema: https://ollama.com/blog/structured-outputs

## Profile-Specific Validation Gates

- Enumerate the actual enabled provider/model IDs from non-secret runtime configuration during implementation and run the explicit evaluation against each one. Do not inspect or log credentials to discover this matrix.
- For Gemini, test supported schema projection and distinguish request rejection, blocked/incomplete candidates, invalid JSON, and application validation failures.
- For Bedrock Nova Lite, assert the request omits unsupported native structured-output fields; test parsing and incomplete/malformed content paths.
- For Ollama, keep adapter tests for its `format` schema and local-only settings.
- Do not change provider model selection, embedding profiles, retrieval, or prompt-version storage as part of this feature.
