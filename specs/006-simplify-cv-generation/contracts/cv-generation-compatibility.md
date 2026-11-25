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
- Preserve the trusted optional review envelope and its safe `review_metadata` sidecar. New envelopes always identify `implementation: "agent"`; do not add provider-specific fields to `CvDraft`.
- Preserve internal scope/authorization behavior. CV generation no longer uses a capability selector or legacy fallback; only Gemini/Bedrock structured-output providers are accepted.

## Generation Semantics

- Generation is one structured response containing all CV sections; requested locale appears in the generation prompt instead of a separate localization stage.
- Provider output is converted into the unchanged `CvDraft` contract only after schema and source-index checks. Application-owned identity/contact fields are copied from the authorized request.
- Prompt-injection separation, consent, source-reference metadata, pending review, explicit Save proof, per-request timeout and late-result rejection remain enforced.
- Ollama is not a supported CV-generation provider; unrelated Ollama embedding/RAG usage is outside this contract.

## Compatibility Verification

Verify the internal CV API tests for both bare-draft and review-envelope modes, the AI provider construction tests, and existing NestJS/PostgreSQL/editor review lifecycle suites. No migration or public API version change is expected.
