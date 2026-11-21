# Requirements Quality Checklist: TalentPulse CV Generation Agent

**Purpose**: Review completeness, clarity, consistency, measurability, and coverage of the CV Generation Agent requirements
**Created**: 2026-11-19
**Feature**: [spec.md](../spec.md)

**Note**: This custom checklist is based on the feature specification and implementation plan.
**Review Ownership**: This is a reviewer-owned requirements-quality artifact. Every item is intentionally unchecked; only the reviewer may mark `[x]` after determining that the requirement-writing criterion is satisfied.
**Marker Semantics**: `[x]` means requirements-quality review passed. It does not mean implementation work is complete.

## Requirement Completeness

- [x] CHK001 Are permitted candidate-data sources identified, and is “user-provided information” clear about saved profile/CV data versus information supplied during a generation request? [Completeness, Clarity, Spec §FR-002, Assumptions]
- [x] CHK002 Are eligibility conditions for optional job context defined, including selected-job criteria, unavailable jobs, and the no-job path? [Completeness, Spec §FR-003, Edge Cases]
- [x] CHK003 Does the specification explicitly prohibit automatic changes to the candidate’s profile, rather than relying only on the absence of profile-write requirements? [Gap, Spec §FR-001–FR-002, Out of scope]
- [x] CHK004 Are the candidate, source CV, target CV, and optional job relationships defined well enough to distinguish source data from the destination for every generation flow? [Completeness, Spec §Key Entities, User Story 1–2]
- [x] CHK005 Are the responsibilities of the shared Agent Foundation and the existing CV-generation capability clearly bounded, including which existing prompts, schemas, validators, and provider integrations remain authoritative? [Completeness, Spec §FR-006–FR-009, Plan §Summary]
- [x] CHK006 Are the permitted Agent tools and operations specified in requirements, including what context they may receive and whether any tool may read or persist business data? [Gap, Spec §FR-009]
- [x] CHK007 Are the conditions that justify multi-step agent execution distinguished from work that should remain deterministic or in the existing CV pipeline? [Clarity, Spec §FR-008, Plan §Workflow and State Transitions]
- [x] CHK008 Are workflow-state requirements complete for queued, running, completed, degraded, failed, cancelled, stale, pending-review, approved, rejected, and expired outcomes? [Completeness, Spec §FR-010, FR-017, Plan §Workflow and State Transitions]
- [x] CHK009 Is it clear which state must survive a service restart or user return, and which state must remain transient? [Clarity, Spec §FR-010, Plan §Workflow and State Transitions]

## Requirement Clarity

- [x] CHK010 Are the exact existing CV fields, supported templates, locales, aliases, and null/empty-field semantics identified as the compatibility baseline? [Clarity, Spec §FR-006–FR-007, Assumptions]
- [x] CHK011 Is “schema-valid CV draft” defined against the same required fields, nested constraints, limits, and editor expectations used by all existing generation flows? [Clarity, Spec §FR-006, FR-011, SC-001]
- [x] CHK012 Is “distinguish provided facts from AI-generated wording” defined at a clear granularity and with a user-visible meaning? [Ambiguity, Spec §FR-002, User Story 3]
- [x] CHK013 Is “unsupported claim” defined consistently for copied facts, rewritten facts, inferred skills, translated content, and claims marked for user confirmation? [Clarity, Spec §FR-012–FR-014]
- [x] CHK014 Are “safe partial draft,” retryability/limits, timeout, cancellation, invalid output, controlled error, and user recovery defined with criteria that can be interpreted consistently? [Ambiguity, Coverage, Spec §FR-014, FR-019–FR-020, SC-006, Edge Cases]
- [x] CHK015 Is the meaning of user approval clear for synchronous and asynchronous generation, including whether pressing the existing Save action is the approval event? [Clarity, Spec §FR-015–FR-016, Plan §Integration Contracts]
- [x] CHK016 Is the difference between persisting an isolated pending draft and modifying the canonical CV explicit, including what action constitutes approval before persistence? [Ambiguity, Spec §FR-015–FR-016, Assumptions, Plan §Integration Contracts]

## Requirement Consistency

- [x] CHK017 Do the broad source-trace expectations in SC-002 align with FR-013, which names experience and project source entries specifically? [Conflict, Spec §FR-013, SC-002]
- [x] CHK018 Are “never invent facts” and “flag a claim for user confirmation” reconciled so that an unsupported claim cannot appear in the draft as a verified CV fact? [Consistency, Spec §FR-012–FR-014, User Story 3]
- [x] CHK019 Does preserving API contracts define whether additive response metadata, an approval field, and a discard route are allowed, and are sync/async review flows covered consistently? [Conflict, Consistency, Spec §FR-007, FR-015–FR-017, Plan §Integration Contracts]
- [x] CHK020 Do the human-approval requirements account for the existing editor autosave behavior so that “explicit Save” cannot conflict with automatic persistence? [Conflict, Spec §FR-016, Plan §Integration Contracts]
- [x] CHK021 Are rollback requirements consistent with pending Agent drafts and in-flight operations, including what remains usable after capability flag rollback? [Consistency, Spec §FR-019, Plan §Migration and Rollback]

## Acceptance Criteria Quality

- [x] CHK022 Is SC-006’s five-minute user-facing target reconciled with the plan’s existing 600-second CV-generation timeout and two additional Agent model decisions? [Conflict, Spec §SC-006, Plan §Technical Context]
- [x] CHK023 Is the “normal-size profile” workload in SC-006 defined by measurable input bounds rather than left open to interpretation? [Clarity, Spec §SC-006]
- [x] CHK024 Are the source-grounding and zero-fabrication targets tied to a defined, representative set of facts and adjudication rules? [Measurability, Spec §SC-002–SC-003]
- [x] CHK025 Are the sample size, survey question, rating scale, and treatment of post-review edits specified for the four-out-of-five usefulness target? [Measurability, Spec §SC-008]
- [x] CHK026 Can SC-005 compatibility be evaluated across the named request, response, status, save, and editor contracts without ambiguity about which existing consumers are in scope? [Measurability, Spec §SC-005]

## Scenario Coverage

- [x] CHK027 Are requirements explicit for editing, regenerating, rejecting, saving, reopening, and abandoning a pending draft? [Coverage, Spec §User Story 3, FR-016]
- [x] CHK028 Are conflict-resolution requirements clear when source CV/profile/job data changes or another editor saves while generation or review is pending? [Coverage, Recovery Flow, Spec §Edge Cases, FR-017]
- [x] CHK029 Are rollback and migration requirements complete for new requests, queued requests, running requests, and drafts awaiting review? [Coverage, Recovery Flow, Spec §FR-019, Plan §Migration and Rollback]

## Edge Case Coverage

- [x] CHK030 Are the consequences of consent being revoked before generation, during generation, and before approval separately defined? [Coverage, Edge Case, Spec §FR-005, Edge Cases]
- [x] CHK031 Is the behavior specified when candidate facts conflict across profile and source CV, or when duplicate/placeholder values cannot be reconciled? [Gap, Spec §Edge Cases]
- [x] CHK032 Are prompt-injection and instruction-like text in CVs and job descriptions explicitly covered as untrusted content? [Gap, Spec §FR-003, FR-009, Security]
- [x] CHK033 Are concurrent duplicate requests and two-tab saves defined for both same-source and different-source operations? [Coverage, Edge Case, Spec §Edge Cases, FR-018]
- [x] CHK034 Are pending-draft retention duration, expiration visibility, and deletion behavior defined in the product requirements, not only in the plan? [Gap, Spec §FR-010, Edge Cases; Plan §Integration Contracts]

## Non-Functional Requirements

- [x] CHK035 Are authorization and isolation requirements explicit for every source, operation-status lookup, pending-draft retrieval, approval, and rejection action? [Coverage, Spec §FR-001, FR-009, SC-003]
- [x] CHK036 Are data-minimization requirements clear about which candidate fields may reach the generation provider, how consent scopes that transfer, and how long provider data may be retained? [Completeness, Spec §FR-004–FR-005, Security]
- [x] CHK037 Are logging and diagnostic exclusions defined for source text, generated draft text, prompts, provider output, identifiers, and error details consistently across all services? [Consistency, Spec §FR-004, FR-021]
- [x] CHK038 Are performance, retry, step, model-call, tool-call, and provider-call bounds specified in one consistent requirement set rather than split between the spec and implementation plan? [Completeness, Spec §FR-008, FR-020, SC-006; Plan §Technical Context]

## Dependencies and Assumptions

- [x] CHK039 Are dependencies on the current profile/CV sources, consent policy, job eligibility, queue/status flow, and editor save behavior named with an owner for each contract? [Dependency, Spec §Assumptions, Plan §Integration Contracts]
- [x] CHK040 Is it clear whether the legacy generator must satisfy the new review/approval behavior when selected for rollback, or whether rollback intentionally restores legacy persistence semantics? [Ambiguity, Spec §User Story 4, FR-019, Plan §Migration and Rollback]

## Notes

- Initial cross-document gap signals for reviewer attention; these are not checklist pass/fail decisions. SC-006's workload/deadline, SC-002/FR-013 grounding scope, optional regeneration API compatibility, and seven-day pending-draft expiry are now specified across the feature documents. Remaining reviewer signals: the editor's autosave suppression remains a plan-level UX detail, safe-partial acceptance conditions need more precision, and provider-specific retention terms require release verification. Checklist markers remain reviewer-owned and unchanged.
- Leave every item unchecked until a reviewer evaluates the requirements themselves. Do not interpret `[x]` as implementation completion.
- `/speckit.implement` may read checklist state as a gate but must not modify checkbox markers.

## Plan Alignment and Clarified Regeneration Scope

- [x] CHK041 Does the specification enumerate every user-visible CV content section eligible for selected-item regeneration and explicitly exclude identity/contact fields and internal metadata? [Completeness, Clarity, Spec §FR-004, FR-016; Plan §Integration Contracts]
- [x] CHK042 Does the API contract define how a target resolves to exactly one scalar or collection item in every permitted section, including index rules, without allowing arbitrary paths? [Clarity, Spec §FR-016; Contract §Existing Request Contracts]
- [x] CHK043 Do the specification and plan define factual grounding and source traceability for every permitted section, including content currently copied or localized rather than generated by the existing core pipeline? [Consistency, Gap, Spec §FR-012–FR-013; Plan §Workflow and State Transitions]
- [x] CHK044 Do implementation tasks map coverage for every permitted target type and require preservation of unselected draft content on success, stale hash, timeout, and partial output? [Coverage, Plan §Testing Strategy; Tasks §User Story 3]
- [x] CHK045 Are the optional regeneration request, unchanged `CvDraft` schema, target allowlist, hash compare-and-set, and idempotency semantics specified consistently across the public contract and plan? [Consistency, Spec §FR-007, FR-016, FR-018; Plan §Integration Contracts]
- [x] CHK046 Does the specification define that selected-item regeneration remains available through legacy rollback for all permitted content sections without changing approval or persistence semantics? [Completeness, Consistency, Spec §FR-019; Plan §Migration and Rollback]
- [x] CHK047 Do the specification and plan map each permitted section to its existing processing behavior (AI generation versus source-copy/localization) so “regenerate” has a clear, consistent meaning without adding an unapproved generation capability? [Clarity, Consistency, Spec §FR-006, FR-016; Plan §Integration Contracts]

## Plan Alignment Follow-up

- [x] CHK048 Does the runtime contract clearly separate model-visible data from trusted tool-only authorized context, and does its example avoid values its prose says the model must not receive? [Consistency, Conflict, Contract §Agent Request]
- [x] CHK049 Is the Foundation step budget stated as a numeric maximum consistently across the specification and plan, rather than described only as a “small fixed step cap”? [Clarity, Gap, Spec §FR-008; Plan §Workflow]
- [x] CHK050 Are provider data-processing, training-use, and retention requirements defined with an approval authority and a measurable retention limit or explicit no-retention condition? [Completeness, Measurability, Spec §FR-004; Plan §Constitution Check]

- Review addendum (2026-11-19): The earlier note above predates the current spec/plan clarification of safe-partial acceptance. CHK050 separately asks the reviewer to assess whether provider-retention acceptance criteria are sufficiently measurable; all added items remain unchecked.
