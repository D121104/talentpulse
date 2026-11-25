# Research: Rút gọn quy trình tạo CV

**Feature**: [Rút gọn quy trình tạo CV](./spec.md)  
**Updated**: 2026-11-22

## Implementation Decisions

### One structured Agent response

- Generate the complete CV content in one structured response through the configured Gemini or Bedrock provider.
- Put the requested CV locale in the prompt; do not run separate locale detection, lexical/skill rules, localization, bullet shaping, repair, or fallback stages.
- Do not route CV generation through the legacy `CvDraftGenerationService` or a capability selector. Unsupported providers fail safely; they never fall back to Ollama.
- Use the structured response schema for field shape, source indices and section bounds. The application copies candidate identity/contact and source-owned fields from the authorized request.
- Keep concise source references/origins, current consent checks, prompt-injection separation, pending review, explicit Save proof, request deadlines and late-result rejection.
- User instruction on 2026-11-21 explicitly selected this architecture and superseded the earlier evidence-gated proposal to retain the legacy generation stages. This authorizes code changes only; it does not authorize live provider evaluation or sending real CVs to hosted providers.

### Keep the product boundary

- NestJS remains responsible for authentication, ownership, consent, job authorization, pending-draft persistence and explicit approval.
- The internal request, bare `CvDraft` response shape, optional safe review envelope, saved CV schema and editor lifecycle remain unchanged. New review envelopes report `implementation: "agent"` only.
- Existing persisted pending-draft metadata remains readable so drafts created before this release can still be reviewed, rejected, saved or expired. This is data-reader compatibility, not a legacy generation path.
- Rollback is through the prior source-control release (`3426ba0`); no live legacy selector or fallback remains in the new code.

### Deterministic evaluation and provider authorization

- Reuse `ai-service/evals/datasets/generation_quality_eval_v1.json`. The `CV_GENERATION` and `CV_LOCALIZATION` groups both exercise full draft generation with distinct prompt locales; no standalone localization pass runs.
- Deterministic fixtures verify exact response schema, locale prompt, one model call, zero tool calls, source-index validation and pending review.
- Keep live Gemini/Bedrock comparison opt-in. It incurs provider cost and processes synthetic CV-like content; explicit authorization is still required before the run and human ratings.

## Removed Runtime Stages

| Removed stage/path | Replacement |
|---|---|
| Legacy `CvDraftGenerationService` and capability selection | `CvGenerationAgent` invoked directly by the CV router |
| Locale/lexical/skill-rule validators | Locale instruction in the prompt plus structured response schema |
| Separate localization and localization retry | Full CV response generated in the requested locale |
| Bullet shaping and per-item repair | Structured experience/project bullets in the same response |
| Deterministic legacy fallback and Ollama CV generation | Safe provider/schema error; no generated content is staged |
| Agent tool loop around the legacy service | Direct final-schema structured output, one model call, zero tools |

Source-index bounds/uniqueness, consent, identity ownership, review metadata, canonical persistence guards and human approval remain. These protect data boundaries rather than compensate for a local model.

## Baseline Record

- **Pre-change revision**: `3426ba0` (`feat(cv): add agent generation review lifecycle`).
- **Synthetic dataset**: `generation_quality_eval_v1.json`, 210 fixtures in total, including 30 `CV_GENERATION` and 30 `CV_LOCALIZATION` cases.
- **Hosted baseline report**: None was recorded before implementation; no comparative quality result or human rating is claimed.
- **Live model calls**: Not run during implementation. No `.env`, credential or secret-bearing runtime configuration was read.

## Verification

- Use deterministic fake providers for routine tests; no provider request is required to validate the path or response contract.
- Compare first-pass validity, safety outcomes and latency by hosted profile only after explicit provider-cost/data authorization. Do not interpret deterministic fixtures as hosted quality evidence.
- Existing pending drafts and consent/save lifecycle tests remain required after removing the legacy generation path.
