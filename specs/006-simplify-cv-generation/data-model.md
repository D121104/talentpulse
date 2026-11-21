# Data Model: Rút gọn quy trình tạo CV

## Scope

This feature changes generation behavior only. It adds no persisted entity, database column, migration, public request field, or new state transition. The canonical CV and applicant profile remain owned by PostgreSQL/NestJS.

## Existing Generation Data

### CV Generation Request

`CvDraftRequest` is an internal, strict, non-persisted request containing:

- `identity`: request, trace and operation-attempt UUIDs.
- `candidate`: candidate ID and name/contact fields plus optional headline, objective, skills, experience, education, projects, certificates, activities and awards.
- `job`: target job ID/title plus available company, description, location, work mode, level and skill facts.
- `template_type`: `template1` or `template2`; `locale`: `en-US`, `vi-VN`, `en` or `vi`.
- `source_version`, `content_version` and optional `consent_version`.

The existing model rejects unknown fields and bounds text/list sizes. Identity, locale, template, consent and source/content version values are inputs, not fields this feature may redefine. Only the minimum required candidate facts are sent to the selected content provider.

### Provider Generation Result

`ProviderCoreDraft` returns bounded experience/project bullets, source indices, coverage and warnings. Localization uses `ProviderLocalizedItems`, whose keys are application-owned; arbitrary provider-selected keys are not accepted. Both are untrusted intermediate results, not persistence entities. The AI service validates structure and then applies application-owned source, locale, relevance and factual checks. Provider-specific response schemas or JSON modes do not become the product contract.

### Editable CV Draft

The existing strict `CvDraft` represents the output shown in the CV editor. It contains request/trace/attempt IDs, candidate/job IDs, template, editor mode, identity/contact display fields, position/objective, education, indexed work experience/projects with bullets, skills, section order, warnings, generated-by label and source/content versions. It is a draft, not canonical persisted CV data.

### Review Metadata

The existing opt-in review sidecar contains field origins and safe omission paths/reasons derived by the application. Existing draft warnings remain in their current `CvDraft` field. The sidecar contains no source text and does not replace `CvDraft`; this feature preserves its format and the NestJS mapping/staging behavior.

### Canonical CV and Profile

Saved CV/profile values, content version, primary/searchable flags and ownership remain unchanged until the applicant explicitly approves and saves through the existing flow.

## Existing Lifecycle

```text
Authorized request
  -> provider generation and application validation
  -> editable draft + safe review metadata
  -> pending review in existing editor
  -> explicit applicant Save: apply validated draft
     or Reject/Expire: discard staged draft
```

Simplifying internal model work must not alter this lifecycle or cause automatic persistence.
