# AI Generation and CV Consent Contract

## Scope

This feature does not change the request/response schemas of the AI service or existing consent endpoints. It changes which currently enabled provider can serve a generation journey, how provider-compatible constraints are sent, and adds an additive controlled denial when the existing `cv_matching` consent is absent or revoked.

## Product-Level Generation Contract

- Each generation journey keeps its existing request and typed response model, including current application validation and semantic/evidence checks.
- Provider-enforced schema is optional and capability-specific; it is never considered a substitute for application validation.
- A provider unable to accept native structured output continues through its supported prompt/JSON parsing path and is validated identically after parsing.
- Blocked, incomplete, malformed, semantically invalid, or provider-rejected results continue through the existing controlled error/fallback behavior; raw provider messages and sensitive data are not exposed to clients or logs.
- No generation path may broaden agent tools, authorization, persistence, or automatic CV updates as part of schema cleanup.

## Provider Request Profiles

| Profile | Request constraint | Required post-response behavior |
|---|---|---|
| Gemini `generateContent` | Use only the documented structured-output JSON Schema subset for the exact configured model profile. Keep schema size/branching within documented limits. | Parse and validate with the full application model; enforce semantic/evidence rules locally. Distinguish request/schema rejection from blocked/incomplete output and validation failure. |
| Bedrock `amazon.nova-lite-v1:0` | Use the existing Converse text-generation path; do not send native structured-output fields unsupported by this model. Keep concise task-level JSON instructions where an output is structured. | Parse JSON and validate against the full application model; return controlled failure/fallback on incomplete or invalid content. |
| Ollama local | Keep provider-specific JSON Schema in the `format` request property and local-only settings scoped to the Ollama adapter. | Preserve the same application validation and failure behavior as hosted providers. |

The exact model ID may be deployment-configured. A model profile change requires a capability check and evaluation before changing its request profile.

## Existing CV-Matching Consent API

The frontend must reuse the authenticated routes already exposed by NestJS:

- `GET /ai/cv-consents/policy/cv_matching` obtains current scope/version/hash metadata.
- `GET /ai/cv-consents/current/cv_matching` obtains the signed-in user's current consent state.
- `POST /ai/cv-consents/grant` grants the existing scope using its current metadata and audit source.
- `POST /ai/cv-consents/revoke` revokes the existing scope using its current metadata and audit source.

No new consent scope, policy text, policy version, database field, or endpoint is introduced. The frontend must submit the current policy version/hash; it must not treat client-held values as authoritative because NestJS validates them against active server policy.

## CV Analysis Provider Boundary

1. NestJS authenticates the HR/admin user and verifies job/company entitlements as it does today.
2. Before calling the AI service, NestJS checks that the applicant associated with the match has an active, current `cv_matching` consent. HR access or premium entitlement alone is not consent.
3. If consent is missing/revoked/stale, NestJS sends no request to the AI service and returns a controlled denial.
4. If consent is valid, NestJS sends the existing minimal `NarrativeRequest` facts; it does not send raw CV text or upload documents.
5. FastAPI applies the provider-specific generation profile, then validates the response with the existing `MatchNarrative` contract and evidence rules.
6. Provider failures keep the existing controlled fallback/error handling without raw CV text, prompts, provider bodies, or credentials in logs.

## Evaluation Contract

- Automated contract and applicable safety checks run over the full synthetic set: at least 30 cases per journey/provider.
- Reviewers score at least 10 representative responses per journey/provider for relevance, factual accuracy, usefulness, and grounding where factual claims are made; at least 90% must pass the case-specific rubric.
- At least 95% of cases must produce first-pass output satisfying the existing product contract.
- Evaluation calls are opt-in and use only synthetic or explicitly approved fixtures; ordinary unit/integration tests use provider doubles.
