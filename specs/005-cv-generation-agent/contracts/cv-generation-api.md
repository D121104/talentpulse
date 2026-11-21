# Integration Contract: CV Generation API and Review

## Compatibility Rules

- Do not rename or remove existing routes, required request fields, operation IDs, status values, error codes or `CvDraft` fields.
- Keep the internal AI path `POST /internal/v1/cv/draft`, `cv_generate_scope`, the strict `CvDraftRequest`, and the exact inner `CvDraft` schema. Without the trusted review opt-in, its response remains the existing bare `CvDraft`.
- Preserve the existing request compatibility baseline: templates are `template1` and `template2`; locales are `en-US`, `vi-VN`, `en` and `vi`, with `en-US` as the default. The strict request model rejects unknown fields. Optional nullable scalar fields may be omitted or sent as `null`; omitted list fields default to `[]`, while explicit `null` for list fields is rejected. Required fields remain required, and empty strings remain subject to their existing field validators. Do not normalize aliases or change these semantics in this feature.
- Add only optional review metadata (`reviewStatus`, `draftHash`, `reviewMetadata`), an optional `regenerationTarget` field on the existing async generation-job request, and one owner-authorized discard route. Existing clients that omit the optional request field continue to use current behavior and parse the unchanged `CvDraft` schema.
- NestJS remains the only business authorization, consent, canonical data and persistence boundary.

## Existing Routes

| Route | Existing purpose | Agent/review behavior |
|---|---|---|
| `POST /online-cvs/generate-from-career-profile` and `/generate-from-profile` | Synchronous profile-to-CV draft | Existing body remains; Agent response adds optional review metadata and stages its draft separately. |
| `POST /online-cvs/generation-jobs/from-career-profile` | Queue profile-to-CV generation | Keep `Idempotency-Key`, profile version and async operation response; Agent result appears as pending `draft` with optional review metadata. |
| `POST /online-cvs/:id/generate` | Synchronous generation from owned CV | Keep body (`jobId?`) and existing response fields; Agent response adds optional review metadata and does not update source CV columns. |
| `POST /online-cvs/:id/generation-jobs` | Queue generation from owned CV | Keep body (`jobId?`, `expectedContentVersion`, optional `sourceVersion`) and `Idempotency-Key`; stage result only after worker rechecks. An optional `regenerationTarget` requests replacement of one item in an owner-visible pending draft. |
| `GET /online-cvs/:id/generation-jobs/:operationId` | Get operation result/status | `current` remains canonical persisted CV; `draft` is the generated pending editor draft; optionally add `reviewStatus`, `draftHash` and `reviewMetadata`. |
| `DELETE /online-cvs/:id/generation-jobs/:operationId` | Cancel queued/running operation | Keep active-cancellation behavior; does not double as completed-draft rejection. |
| `PATCH /online-cvs/:id` | Save current editor content | Existing expected-content-version and owner checks apply. When an Agent draft is pending, require the matching explicit `generationApproval` envelope; ordinary autosaves are rejected. |
| `GET /online-cvs/:id` | Load owned CV | Returns the canonical persisted CV and optional non-sensitive `pendingGeneration` summary; never serialize the raw `generationSnapshot` JSONB. Pending output is returned only through the owner-checked generation status flow. |

## Internal Optional Review Metadata

The existing internal `POST /internal/v1/cv/draft` body contract remains `CvDraftRequest`. Existing callers that do not opt in continue receiving the exact strict `CvDraft` response. For the trusted NestJS review flow only, NestJS sends `X-Cv-Review-Metadata: true`; FastAPI then returns the same draft in an additive envelope:

```json
{
  "draft": "unchanged CvDraft object",
  "review_metadata": {
    "field_origins_by_path": {
      "/work_experience/0/position": "SOURCE",
      "/work_experience/0/bullets/0": "AI_SUGGESTED"
    },
    "omissions_by_path": [
      {"path": "/projects/1/bullets", "reason_code": "INSUFFICIENT_EVIDENCE"}
    ]
  }
}
```

The header is server-selected and is not accepted from public clients. `fieldOriginsByPath` contains leaf paths only under allowlisted user-visible content and one value from `SOURCE`, `LOCALIZED`, `AI_SUGGESTED` or `FALLBACK`. `omissionsByPath` contains only a path and safe reason code from `SOURCE_UNAVAILABLE`, `INSUFFICIENT_EVIDENCE`, `STRUCTURE_INVALID` or `LOCALIZATION_FAILED`. Neither map includes source values, PII, IDs or raw provider messages. The metadata is computed from the existing generator's core/localization/fallback outcome; it is not produced or rewritten by the Agent model. The existing `CvDraft` schema and its `warnings` field are unchanged.

The internal metadata keys are strict snake_case and are not added to `CvDraft`. NestJS validates the sidecar, maps it to camelCase `reviewMetadata` on owner-checked sync response/async status, and stores it with the pending draft. If the result is `DEGRADED`, every retained field must independently pass structure and factual validation and every omitted field must have a path/reason; otherwise the operation is `FAILED` and no pending draft is staged. A legacy/internal caller without the opt-in header retains the existing response body.

## Additive Discard Route

```http
DELETE /online-cvs/{id}/generation-jobs/{operationId}/draft
Authorization: Bearer <existing user session>
```

The route is idempotent for an already rejected/expired draft. NestJS verifies authenticated owner, CV ID, operation ID and `reviewStatus=PENDING`, clears the pending output only, records `REJECTED`, and leaves CV content/version, profile, primary/searchable flags and other operations unchanged. It returns `204 No Content`; a subsequent owner-checked operation-status request reports the terminal review state without returning the removed content. Requests from a non-owner return the existing non-disclosing not-found behavior.

## Existing Request Contracts

### `GenerateOnlineCvDto`

```text
jobId?: UUID   // optional active canonical job; NestJS resolves and snapshots it
```

### `EnqueueOnlineCvGenerationDto`

```text
jobId?: UUID
expectedContentVersion: positive 32-bit integer
sourceVersion?: 64-character SHA-256 hex string
regenerationTarget?: {
  reviewOperationId: UUID
  expectedDraftHash: 64-character SHA-256 hex string
  targetPath: one allowlisted path from the target map below; arbitrary JSON paths are forbidden
}
Idempotency-Key: required by existing async route; stored as hash only
```

Allowed `targetPath` values are limited to the following user-visible content. Collection indexes are zero-based indexes into the pending draft, not source indexes. NestJS resolves each path through internal `sourceRefsByPath` metadata before constructing the source request; the mapping is not returned to the client and contains references only, not source text.

| Target path | Existing processing rerun |
|---|---|
| `/position` | Reuse current headline/application-role mapping and localization. |
| `/career_objective` | Reuse current objective localization and deterministic fallback. |
| `/education/{index}` | Copy the selected authorized education source entry and apply existing localization. |
| `/work_experience/{index}` | Reuse current source-indexed core generation, localization and grounding for that source entry. |
| `/projects/{index}` | Reuse current source-indexed core generation, localization and grounding for that source entry. |
| `/skills/{index}` | Rebuild the selected existing owned-skill group using current filtering, grouping and locale behavior; do not invent skills. |
| `/activities/{index}`, `/certificates/{index}`, `/awards/{index}` | Reuse current copy/localization behavior for the mapped source entry. |

Identity/contact fields (`full_name`, `email`, `phone`, `link`, `address`), the name-derived `title`, IDs, `section_order`, warnings, versions and operational metadata are not targets. If a path does not resolve to exactly one scalar or collection entry, its source mapping is absent/ambiguous, or output for the selected path is missing, reject the regeneration and preserve the existing pending draft unchanged.

Career-profile generation retains the current DTO and expected profile version behavior. For selected-item regeneration, NestJS requires the target review operation/hash to match the owner's current pending draft, validates the path against the allowlist/source map, and hydrates only the authorized source context needed for that item. Identity/contact data and IDs are not serialized into model prompts. The AI service receives the existing strict `CvDraftRequest` and returns the unchanged `CvDraft` schema; NestJS accepts only the item corresponding to the target and replaces it with a compare-and-set on `expectedDraftHash`. Every other pending-draft item and all canonical CV fields remain unchanged. The idempotency fingerprint includes the pending operation, expected draft hash and target path. A mismatch, invalid target, timeout, missing output or late completion leaves the pending draft unchanged. Candidate identity, consent, allowed template, locale, job snapshot and operation IDs are set by NestJS, not selected by the model.

## Async Status Response

Existing fields remain: `status`, `operationId`, `onlineCvId`, timestamps, `pollAfterSeconds`, `kind`, source/profile/content versions, job/template/locale, attempts, safe `errorCode`, warnings, `current`, `draft`, generation mode, versions and revision. Agent sync responses and async status responses may add optional `reviewStatus`, `draftHash` and `reviewMetadata` outside `CvDraft`:

```json
{
  "status": "COMPLETE",
  "operationId": "UUID",
  "onlineCvId": "UUID",
  "current": "unchanged persisted OnlineCV",
  "draft": "existing CVGenerationDraft/CvDraft editor payload",
  "reviewStatus": "PENDING",
  "draftHash": "sha256",
  "reviewMetadata": {
    "fieldOriginsByPath": {
      "/work_experience/0/position": "SOURCE",
      "/work_experience/0/bullets/0": "AI_SUGGESTED"
    },
    "omissionsByPath": [
      {"path": "/projects/1/bullets", "reasonCode": "INSUFFICIENT_EVIDENCE"}
    ]
  }
}
```

`reviewMetadata` is owner-scoped and contains no source text, PII, source IDs or raw provider messages. `fieldOriginsByPath` uses only leaf paths under allowlisted content sections and values `SOURCE`, `LOCALIZED`, `AI_SUGGESTED` or `FALLBACK`. The editor renders the corresponding per-field label. `omissionsByPath` contains the path and one safe reason code (`SOURCE_UNAVAILABLE`, `INSUFFICIENT_EVIDENCE`, `STRUCTURE_INVALID`, `LOCALIZATION_FAILED`); the editor maps the code to a localized explanation. Existing clients may ignore the optional object. Neither metadata map is added to `CvDraft`; the only internal response change is the additive opt-in envelope documented above.

Allowed `reviewStatus` values: `PENDING`, `APPROVED`, `REJECTED`, `EXPIRED`; absent means a legacy response with no pending-review lifecycle. `PROCESSING` remains the API representation of existing `RUNNING`. A safe partial result is returned with `status=DEGRADED`, a pending review draft and one `omissionsByPath` item per omitted field only when every retained field passes structural and factual validation. If the safe retained set cannot be determined, return `FAILED` without a pending draft. Do not substitute Foundation `AgentStatus` for business operation statuses.

For reload/discovery, `GET /online-cvs/:id` may include only this summary, never the staged content or raw JSONB snapshot:

```json
{
  "pendingGeneration": {
    "operationId": "UUID",
    "reviewStatus": "PENDING",
    "draftHash": "sha256",
    "expiresAt": "ISO-8601 timestamp"
  }
}
```

The editor uses `operationId` to retrieve the owner-checked status response and staged `draft`.

For a selected-item regeneration operation, the operation status reports completion/failure for the regeneration attempt. On success, its `draft` and `draftHash` represent the updated pending review draft; the pending review's original operation ID remains the approval identity. The editor must retain that review operation ID and use the latest draft hash for Save or another regeneration. A failed or stale attempt returns no replacement draft and does not change the existing pending review.

## Explicit Save Contract

1. While `reviewStatus=PENDING`, the editor stores field edits locally and disables autosave for that generation result.
2. The user presses the existing Save action; this is the human approval event.
3. Editor sends the existing update DTO with the current `expectedContentVersion` plus this optional approval proof, required while a draft is pending:

```json
{
  "generationApproval": {
    "operationId": "UUID",
    "draftHash": "sha256"
  }
}
```

4. NestJS checks owner, active consent/policy, source version, `operationId`, `draftHash` and conditional update criteria. A normal PATCH/autosave without matching approval proof is rejected while review is pending; a stale draft returns the current conflict contract and remains available for resolution.
5. On success, persist exactly the user-visible editor data once, increment `contentVersion`, clear pending content and mark review approved. Primary/searchable state changes only through their existing explicit user controls.
6. After approval, existing autosave behavior resumes for later edits.

The synchronous Agent generation responses retain their current required fields and add optional `reviewStatus=PENDING` and `draftHash` so the current editor can distinguish an unapproved result. Legacy responses omit these fields and retain their previous behavior. The optional fields are response metadata only; they are not added to `CvDraft`.

## Internal AI Contract

`POST /internal/v1/cv/draft` remains protected by `cv_generate_scope`. Input/output are strict Pydantic schemas in `ai-service/.../cv_generator/schemas.py` and independent exact-key validators in `backend/src/ai-matching/ai-service.cv-draft.ts`. Internal Foundation receipt is not added to this route's public response.
