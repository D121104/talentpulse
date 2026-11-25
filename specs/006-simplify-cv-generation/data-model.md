# Data Model: Rút gọn quy trình tạo CV

## Scope

This feature changes generation behavior only. It adds no persisted entity, database column, migration, public request field, or new state transition. The canonical CV and applicant profile remain owned by PostgreSQL/NestJS.

## Existing Generation Data

### CV Generation Request

`CvDraftRequest` is an internal, strict, non-persisted request containing:

- `identity`: request, trace and operation-attempt UUIDs.
- `candidate`: source sections needed for generation; identity and contact values remain app-owned and are not sent to the model.
- `job`: target job ID/title plus available company, description, location, work mode, level and skill facts.
- `template_type`: `template1` or `template2`; `locale`: `en-US`, `vi-VN`, `en` or `vi`.
- `source_version`, `content_version` and optional `consent_version`.

The existing request rejects unknown fields and bounds text/list sizes. Identity, locale, template, consent and source/content version values are inputs, not fields the model may redefine. Only candidate facts needed to generate the CV are sent to the selected Gemini/Bedrock provider.

### Provider Generation Result

`CvGenerationContent` is the one structured Agent response. It contains CV sections and source indices; it is validated as a strict transient model and is not persisted. Locale is specified in the prompt. No core/localization intermediate payloads, repair objects, lexical or skill-rule results are produced.

### Editable CV Draft

The existing strict `CvDraft` represents the output shown in the CV editor. It contains request/trace/attempt IDs, candidate/job IDs, template, editor mode, identity/contact display fields, position/objective, education, indexed work experience/projects with bullets, skills, section order, warnings, generated-by label and source/content versions. It is a draft, not canonical persisted CV data.

### Review Metadata

The existing opt-in review sidecar contains field origins and source references derived by the application; it contains no source text and does not replace `CvDraft`. The sidecar format and NestJS mapping/staging behavior remain unchanged.

### Canonical CV and Profile

Saved CV/profile values, content version, primary/searchable flags and ownership remain unchanged until the applicant explicitly approves and saves through the existing flow.

## Existing Lifecycle

```text
Authorized request
  -> one structured Agent response and schema/source-index validation
  -> editable draft + safe review metadata
  -> pending review in existing editor
  -> explicit applicant Save: apply validated draft
     or Reject/Expire: discard staged draft
```

Simplifying internal model work must not alter this lifecycle or cause automatic persistence.
