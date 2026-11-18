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
