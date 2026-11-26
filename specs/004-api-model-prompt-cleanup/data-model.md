# Data Model: API Model Prompt and Schema Cleanup

## Persistence Impact

No new persistent entity, table, column, index, or migration is required. The feature reuses the existing AI CV consent model and does not persist prompts, provider schemas, or evaluation responses as product data.

## Existing Consent Entities

### `AiCvConsent`

Stored in `ai_cv_consents`; one current consent record is associated with a user and scope. For this feature the relevant scope is `cv_matching`.

| Field | Meaning for this feature |
|---|---|
| `_id` | Consent record identifier |
| `userId` | Applicant who granted or revoked consent |
| `scope` | Existing purpose scope; must equal `cv_matching` |
| `consentVersion` | Version of the existing policy accepted |
| `policyHash` | SHA-256 hash of the existing policy text |
| `status` | `GRANTED` or `REVOKED`; only a current matching grant permits hosted dispatch |
| `grantedAt`, `revokedAt` | Lifecycle timestamps |
| `source`, `sourceMetadata` | Existing grant/revoke source audit metadata |
| `createdAt`, `updatedAt` | Record lifecycle timestamps |

The existing partial unique index permits at most one active grant per `(userId, scope)`. No schema change is planned.

### `AiCvConsentEvent`

Stored in `ai_cv_consent_events`; append-only audit events record grant and revoke operations with user, consent ID, scope, policy version/hash, event time, source, and source metadata. The frontend grant/revoke flow must use the existing backend endpoints so event creation and current-state updates remain transactional.

## Consent Lifecycle

```text
No current record -> GRANTED -> REVOKED -> GRANTED
```

- Grant requires the server's current scope, version, and policy hash.
- Revoke marks the active consent revoked and records a revoke event.
- Hosted CV analysis checks current consent for the applicant and `cv_matching` immediately before the AI-service request.
- Missing, revoked, or version/hash-mismatched consent means no CV-derived data is dispatched to a hosted provider.

## Evaluation Fixtures (Non-Persistent)

The planned generation quality evaluation uses synthetic fixtures, not product entities. Each case identifies a generation journey, locale, synthetic input/context, expected contract/evidence facts, and reviewer rubric. Runtime reports contain provider/model identifiers, pass/fail and quality scores, and sanitized failure categories; they must not contain real CV text, credentials, unrestricted prompts, or raw provider error bodies.
