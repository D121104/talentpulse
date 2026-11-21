# CV Generation Compatibility Contract

## Public and NestJS Contracts

- Keep existing CV-generation routes, request fields, status/error codes and response fields unchanged.
- Do not change template/locale behavior, idempotency semantics, generation operation identifiers, editor payload shape or saved CV schema.
- Keep NestJS responsible for authentication, ownership, consent, candidate/job authorization and canonical persistence.
- Do not write the pending draft to canonical CV/profile state before the existing explicit approval proof is accepted.
- Do not serialize the raw generation snapshot or raw provider request/response to clients.

## Internal AI-Service Contract

- Preserve the existing strict `CvDraftRequest` and strict inner `CvDraft` schema.
- Preserve the current bare `CvDraft` response for internal callers that do not request review metadata.
- Preserve the trusted optional review envelope and its safe `review_metadata` sidecar. Do not add provider-specific fields to `CvDraft`.
- Preserve internal scope/authorization behavior and capability-based provider selection. The provider may return malformed or semantically incorrect output; application validation remains authoritative.

## Generation Semantics

- A hosted-profile simplification may change internal provider-call count or how many application stages run, but not the accepted request fields or user-visible draft/review semantics.
- Every retained generated fact must keep its existing source/review treatment. Rejected facts remain omitted or produce the existing controlled failure; no provider output can set canonical identity, consent, ownership, approval or persistence state.
- Keep total/per-call bounds and late-result rejection. Any re-tuning must preserve the user-facing timeout contract.
- Ollama-specific request settings remain local to that adapter/profile if local support remains enabled.

## Compatibility Verification

Verify the internal CV API tests for both bare-draft and review-envelope modes, the AI provider construction tests, and existing NestJS/PostgreSQL/editor review lifecycle suites. No migration or public API version change is expected.
