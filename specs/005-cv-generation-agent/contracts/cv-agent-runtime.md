# Internal Contract: CV Generation Agent Runtime

This is an internal AI-service contract. It does not add a public AI endpoint and does not change the public `CvDraft` response schema.

## Capability and Execution

| Property | Contract |
|---|---|
| Capability ID | `cv_generation` |
| Agent registration | `AgentDefinition` registered in the AI service composition root and capability selector |
| Execution | Shared `execute_agent()` and generic LangGraph `StateGraph`; no local orchestration framework |
| Model boundary | Shared `AgentModelAdapter` over the configured `GenerationProvider` |
| Agent output model | Strict `CvGenerationReceipt`; internal only |
| Review result | Request-scoped `CvDraftReviewMetadata`; not visible to Agent model and not part of `CvDraft` |
| Tool allowlist | Exactly `cv.generate_draft` |
| Execution policy | `max_steps=4` (prepare + at most 2 model calls + 1 tool call; final validation is not counted), at most 2 Agent model calls, 1 tool call, deadline bounded by remaining CV operation time |
| CV provider budget | Existing `ProviderRuntime`: at most 12 provider calls, current total/per-call timeout settings, one existing repair pass |
| Persistence | None in the Agent graph; no checkpointer; full `CvDraft` remains in request-scoped handler memory only |

## Agent Request

The route creates a Foundation `AgentRequest` only after `CvDraftRequest` has passed Pydantic validation and the existing internal service scope has been verified.

In the example below, `authorized_context` is host-side, tool-only context. It MUST NOT be serialized into the model-facing prompt or decision payload. The orchestration model receives only the bounded request input, tool schema and generation receipt; the trusted generation tool alone receives the authorized CV snapshot.

```json
{
  "run_id": "UUID",
  "correlation_id": "operation/correlation identifier",
  "capability_id": "cv_generation",
  "prompt": "Instructions to use the one approved generation tool and return its receipt.",
  "input": {
    "operation_attempt_id": "UUID",
    "source_version": "sha256",
    "content_version": 1,
    "template_type": "template1",
    "locale": "vi-VN"
  },
  "authorized_context": {
    "required_operation": "cv.generate",
    "consent_version": "server-validated version",
    "consent_policy_hash": "server-validated hash",
    "cv_draft_request": {
      "identity": {
        "request_id": "550e8400-e29b-41d4-a716-446655440001",
        "trace_id": "550e8400-e29b-41d4-a716-446655440002",
        "operation_attempt_id": "550e8400-e29b-41d4-a716-446655440003"
      },
      "candidate": {
        "candidate_id": "550e8400-e29b-41d4-a716-446655440004",
        "full_name": "Candidate",
        "email": null,
        "phone": null,
        "link": null,
        "address": null,
        "headline": null,
        "career_objective": null,
        "skills": [],
        "experience": [],
        "education": [],
        "projects": [],
        "certificates": [],
        "activities": [],
        "awards": []
      },
      "job": {
        "job_id": "550e8400-e29b-41d4-a716-446655440005",
        "title": "Candidate CV",
        "company_name": null,
        "description": null,
        "location": null,
        "work_mode": null,
        "level": null,
        "required_skills": [],
        "preferred_skills": []
      },
      "template_type": "template1",
      "locale": "vi-VN",
      "source_version": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "content_version": 1,
      "consent_version": "policy-version"
    }
  },
  "locale": "vi-VN"
}
```

The Foundation orchestration model input contains no CV body or user-supplied job description; it sees the tool schema and receipt, not candidate PII. The tool receives the source snapshot only through trusted `authorized_context`. The existing CV generation provider receives only career facts and canonical job context required for the selected target; `full_name` is replaced with a non-identifying placeholder, contact fields are null, and request/candidate/job IDs are excluded from provider prompts. NestJS restores identity/contact fields from canonical data after generation. No access token or caller-selected permission/policy is included. CV/job text is untrusted data and cannot override application instructions, tool allowlists or authorization.

### Accepted `CvDraftRequest`

Keep the exact existing strict contract:

- `identity`: `request_id`, `trace_id`, `operation_attempt_id` UUIDs.
- `candidate`: `candidate_id`, `full_name`, optional contact/headline/objective, owned skills, experience, education, projects, certificates, activities, awards.
- `job`: canonical `job_id`, title, optional company/description/location/work mode/level, required and preferred skill lists. Absence of a selected job retains the current backend's no-job representation (`job_id` sourced from the profile and title `Candidate CV`); the Agent does not resolve job IDs.
- `template_type`: `template1` or `template2`.
- `locale`: `en-US`, `vi-VN` and currently supported legacy aliases.
- `source_version`, `content_version`, optional `consent_version`.

The request remains validated by `schemas.CvDraftRequest` and backend `validateCvDraftRequest`. For selected-item regeneration, NestJS builds a valid request from the minimal authorized source references for that target while retaining the unchanged schema. Do not extend the schema with arbitrary tool permissions, raw tokens or a user-selected CV/profile owner.

## Tool Contract

### `cv.generate_draft`

| Field | Value |
|---|---|
| Input model | Strict empty object; model cannot choose IDs, locale, template, job or source fields |
| Output model | `CvGenerationReceipt` only |
| Allowed capability | `cv_generation` |
| Required operation | `cv.generate` |
| Side-effect class | `READ_ONLY` with respect to business data; performs bounded provider inference only |
| Timeout | Minimum of tool maximum and remaining execution deadline; handler forwards remaining time to existing provider runtime |
| Handler | Validates trusted `authorized_context.cv_draft_request`, invokes the review-result path of the existing `CvDraftGenerationService`, validates the resulting unchanged `CvDraft` plus sidecar, stores both in a request-scoped holder, returns receipt/hash only |
| Authorization | `ToolAuthorizer` verifies capability/operation and trusted, server-supplied consent/scope context; dispatcher also enforces definition allowlist and Pydantic input/output |

No read-profile, read-job, database, generic HTTP, filesystem, shell, export, persistence or publish tool is registered. Context collection and canonical hydration already occurred in NestJS. The one tool is the existing CV inference operation exposed through Foundation's constrained dispatcher.

The capability creates a dispatcher/tool handler closure per Agent run so its holder is not shared across concurrent requests. This is request-scoped execution state, not a global result cache or durable checkpoint.

`CvGenerationReceipt` fields:

```text
status: literal "GENERATED"
operation_attempt_id: UUID
source_version: bounded version/hash string
content_version: positive 32-bit integer
receipt_id: per-invocation random UUID
draft_hash: SHA-256 over canonical serialized CvDraft
warnings: bounded safe warning codes only
```

```json
{
  "status": "GENERATED",
  "operation_attempt_id": "550e8400-e29b-41d4-a716-446655440003",
  "source_version": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "content_version": 1,
  "receipt_id": "550e8400-e29b-41d4-a716-446655440006",
  "draft_hash": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "warnings": []
}
```

The Agent's final structured output must match the receipt returned by the tool. The capability adapter also requires `AgentResult.usage.tool_calls == 1` and a populated request-scoped holder whose recomputed draft hash matches the receipt. The holder contains both the strict `CvDraft` and internal `CvDraftReviewMetadata`; no final model fields are used as CV content or provenance. Missing tool execution, altered receipt/hash or missing holder returns `OUTPUT_INVALID` and no draft.

## Output Mapping

The existing `CvDraftGenerationService.generate()` remains unchanged for callers without review. The trusted review path uses the same pipeline through a result that pairs the unchanged `CvDraft` with request-scoped `CvDraftReviewMetadata`. After Foundation execution succeeds and receipt checks pass, the capability returns both to the trusted FastAPI route. It does not map `AgentResult.output` into CV fields or expose the sidecar to the Agent model. Without the trusted review-metadata opt-in, the route returns the exact existing `CvDraft` response; with the opt-in it returns `{draft: CvDraft, review_metadata: CvDraftReviewMetadata}`. NestJS validates every draft field/identity/version with `validateCvDraftResponse` and validates the sidecar against its allowlists before staging.

The externally visible CV schema remains unchanged, including `generation_mode="EDITOR_ONLY"`, `source_index`, warnings, template, locale, source/content versions, identity and editable section collections. The internal receipt never appears in the public response, database, queue or logs.

The existing output fields remain: request/trace/attempt IDs, candidate/target-job IDs, template, generation mode, name/title/position/contact placeholders, objective, education, projects, work-experience entries with `source_index` and bullets, skills, activities, certificates, awards, section order, warnings, generator identity, source version and content version. `schemas.CvDraft` remains the source of truth for exact field types, limits and nested shapes; do not fork it in the Agent contract.

The exact output keys remain `request_id`, `trace_id`, `operation_attempt_id`, `candidate_id`, `target_job_id`, `template_type`, `generation_mode`, `full_name`, `title`, `position`, `email`, `phone`, `link`, `address`, `career_objective`, `education[]`, `projects[]`, `work_experience[]`, `skills[]`, `activities[]`, `certificates[]`, `awards[]`, `section_order[]`, `warnings[]`, `generated_by`, `source_version` and `content_version`. `CvDraft` Pydantic constraints and backend exact-key/ownership validators remain authoritative.

### Review Sidecar

The sidecar is request-scoped output from the existing generation pipeline, not model output. Its strict internal fields are `field_origins_by_path` and `omissions_by_path`. For every visible editable leaf path it reports one origin: `SOURCE` (copied source value), `LOCALIZED` (source value transformed to the requested locale), `AI_SUGGESTED` (accepted provider-generated wording), or `FALLBACK` (deterministic source-grounded wording). It reports omitted paths with safe reason codes only; it contains no source values, PII, IDs, prompts or raw provider messages. `CvDraft` and its warning field remain unchanged. The trusted route serializes the sidecar only when NestJS opts in; otherwise it is discarded after request completion.

## Failure Mapping

| Foundation/CV condition | Capability result | NestJS operation | Persistence |
|---|---|---|---|
| Tool omitted or receipt mismatch | `OUTPUT_INVALID` | `FAILED` with safe code | No pending draft |
| Authorizer denies | `PERMISSION_DENIED` | `FAILED` | No pending draft |
| CV provider/schema/grounding fails | Existing safe service error or `TOOL_ERROR` | `DEGRADED` with path/reason sidecar only when all retained fields independently validate; otherwise `FAILED` | Stage only the validated retained draft; otherwise no pending draft |
| Deadline/cancel | `EXECUTION_LIMIT_EXCEEDED` / `CANCELLED` | `FAILED` / `CANCELLED` | Late result fenced out |
| Valid full or safe partial draft | held `CvDraft` | `COMPLETE` / `DEGRADED`, `reviewStatus=PENDING` | Stage only after owner/version/consent checks |

No prompt, source text, raw model output, credentials or stack trace is copied to error messages or observation logs.
