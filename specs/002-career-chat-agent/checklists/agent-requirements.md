# Agent Requirements Checklist: TalentPulse Career Chat Agent

**Purpose**: Reviewer checklist for completeness, clarity, consistency, and measurability of Career Chat Agent requirements
**Created**: 2026-11-17
**Feature**: [spec.md](../spec.md)

**Note**: This custom checklist evaluates the quality of written requirements, not implementation behavior.
**Review Ownership**: This is a reviewer-owned requirements-quality artifact. Only the reviewer may mark an item `[x]` after deciding that the criterion is satisfied.
**Marker Semantics**: `[x]` means the requirement-quality criterion was reviewed and satisfied. It does not mean implementation work is complete.

## Requirement Completeness

- [x] CHK001 - Are the goals, permitted inputs, and expected user-visible outcomes specified for each existing mode: JOB_SEARCH, ADVICE, CV_ANALYSIS, and CV_JOB_COMPARISON? [Completeness, Spec §US2-3, §FR-004]
- [x] CHK002 - Are the differences between public active-job facts, authorized CV snapshots, and deterministic CV-job matching evidence clearly stated? [Completeness, Spec §FR-008-12]
- [x] CHK003 - Are the existing session, history, consent, quota, archive, locale, idempotency, and message-status behaviors identified as preservation requirements? [Completeness, Spec §US1, §FR-001-03]
- [x] CHK004 - Does the spec state that one request uses one Career Chat Agent and explicitly exclude agent delegation or subagents? [Completeness, Spec §US5, §FR-020]
- [x] CHK005 - Are the Foundation responsibilities the feature relies on distinguished from chatbot-owned business behavior and output validation? [Completeness, Spec §FR-005, §FR-015-17; Plan §Quyết định thiết kế và giới hạn]
- [x] CHK006 - Are the initial read-only context and matching tool purposes, allowed modes, and prohibited data access/write operations sufficiently described for scope review? [Completeness, Spec §FR-021-22; Plan §Tool contracts]

## Requirement Clarity

- [x] CHK007 - Does the spec define the exact history bound, or normatively reference where the current history limit is defined, rather than only saying “the current behavior”? [Clarity, Spec §US1, §FR-002; Plan §Phân tích luồng hiện hành]
- [x] CHK008 - Is it clear whether retrieved evidence is searched before agent execution and merely exposed through tools, or whether the agent may initiate retrieval itself? [Clarity, Spec §FR-008, §FR-022; Plan §Quyết định thiết kế và giới hạn]
- [x] CHK009 - Are the conditions requiring context-tool use clear for factual job claims, CV analysis, comparison, and general advice? [Clarity, Spec §US2-4, §FR-010, §FR-021]
- [x] CHK010 - Are “degraded”, “no evidence”, “unsupported evidence”, and “invalid citation” distinguished clearly enough to determine the required user-visible outcome? [Clarity, Spec §US2, §FR-009-10, §FR-014]
- [x] CHK011 - Are the boundaries for an authorized CV snapshot explicit about owner, consent, version, allowed mode, and what happens when any condition is absent? [Clarity, Spec §US3, §FR-012]
- [x] CHK012 - Are the required outputs and validation responsibilities clear when an agent final result differs from the existing RAG response schema or evidence? [Clarity, Spec §FR-005, §FR-009-10, §FR-017]

## Requirement Consistency

- [x] CHK013 - Do requirements to preserve existing chatbot behavior align with the rule that an agent-dispatched request must not retry through the legacy implementation? [Consistency, Spec §US1, §US5, §FR-015-16]
- [x] CHK014 - Is the existing single repair attempt for invalid legacy generation reconciled with the agent path’s controlled-error/deterministic-fallback policy? [Conflict, Spec §FR-014-16; Plan §Thứ tự thực hiện cho một developer]
- [x] CHK015 - Do the requirement that tools expose retrieval functionality and the requirement to keep semantic retrieval in the host flow describe one consistent tool responsibility? [Consistency, Spec §FR-008, §FR-021-22; Plan §Tool contracts]
- [x] CHK016 - Are the single-agent requirement, two-tool scope, and zero-or-more tool-step wording consistent about which requests may finish without calling a tool? [Consistency, Spec §FR-006-07, §FR-020-21; Plan §Tool contracts]
- [x] CHK017 - Are authorization and consent responsibilities consistently assigned to the application service rather than to the model, tool description, or retrieved content? [Consistency, Spec §US3-4, §FR-006, §FR-012-13, §FR-021]

## Acceptance Criteria Quality

- [x] CHK018 - Can each success criterion be evaluated against a defined user journey or evidence set, with the required inputs and pass condition clear? [Measurability, Spec §SC-001-09]
- [x] CHK019 - Are the test population and evidence rules behind “100%” job-claim, authorization, and tool-denial criteria defined or referenced? [Clarity, Spec §SC-003-06]
- [x] CHK020 - Is the 10-run repeatability criterion scoped to deterministic scenarios and a stated set of expected outputs? [Measurability, Spec §SC-009]
- [x] CHK021 - Are user-visible compatibility outcomes measurable without relying only on implementation-specific field names? [Acceptance Criteria, Spec §SC-001, §SC-007-08]

## Scenario Coverage

- [x] CHK022 - Are primary, follow-up, and mode-change requirements covered for all four existing chatbot modes? [Coverage, Spec §US1-3, §Edge Cases]
- [x] CHK023 - Are requirements complete for both an agent tool call followed by a final answer and a valid answer that needs no tool? [Coverage, Spec §US4, §FR-007]
- [x] CHK024 - Are retrieval-empty, retrieval-unreliable, missing canonical context, unsupported claims, and citation mismatch scenarios distinguished? [Coverage, Spec §US2, §Edge Cases, §FR-009-10]
- [x] CHK025 - Are rollback, in-flight requests, duplicate messages, concurrent requests, quota races, and failed-message retries covered as separate or clearly grouped scenarios? [Coverage, Spec §US1, §US5, §Edge Cases, §FR-003, §FR-016]

## Edge Case Coverage

- [x] CHK026 - Are privacy requirements clear for prior CV-derived chat history when consent is revoked or the selected mode changes? [Gap, Spec §US1, §US3, §Edge Cases, §FR-012]
- [x] CHK027 - Are late model/tool results after cancellation, process interruption, or request timeout assigned a clear message, quota, and persistence outcome? [Coverage, Spec §Edge Cases, §FR-014, §FR-018]
- [x] CHK028 - Are missing, malformed, duplicated, or cross-job citation references addressed consistently with the canonical job context rules? [Coverage, Spec §US2-3, §Edge Cases, §FR-009-10]

## Non-Functional Requirements

- [x] CHK029 - Does the spec explicitly state whether latency/availability/scale targets are intentionally unchanged, or provide measurable targets for the four critical modes? [Gap, Spec §SC-001-09, §Assumptions]
- [x] CHK030 - Are execution, model-call, tool-call, and end-to-end timeout limits specified in the requirements or linked to a normative contract, rather than left only in the implementation plan? [Clarity, Spec §FR-014, §SC-006; Plan §Quyết định thiết kế và giới hạn]
- [x] CHK031 - Are privacy, telemetry, and prompt-injection requirements complete for both user/history content and tool-returned job/CV evidence? [Completeness, Spec §US4, §FR-013-14, §FR-019]

## Dependencies & Assumptions

- [x] CHK032 - Are dependencies on application-owned session/history, CV authorization, canonical job hydration, deterministic matching, and existing RAG evidence explicitly identified as prerequisites? [Dependency, Spec §FR-002, §FR-008, §FR-011-12, §FR-022]
- [x] CHK033 - Are the assumptions that retrieval is limited to public active jobs and that no business tools are currently registered distinguished from capabilities that this feature will add? [Assumption, Spec §Assumptions]
- [x] CHK034 - Is the relationship between server-side capability selection, default legacy behavior, registration state, and rollout/rollback requirements unambiguous? [Completeness, Spec §US5, §FR-015-16, §Assumptions]

## Ambiguities & Conflicts

- [x] CHK035 - Is “same behavior as today” tied to a specific source of truth for history limits, retry/repair rules, response statuses, and fallback semantics? [Ambiguity, Spec §US1-2, §FR-002-03, §FR-014-17]
- [x] CHK036 - Does the spec reconcile the absence of a latency SLO with the plan’s 24-second agent budget and 29-second transport gate as either a release constraint or an intended product target? [Conflict, Spec §SC-006, §Assumptions; Plan §Quyết định thiết kế và giới hạn]
- [x] CHK037 - Are any user-visible or operational requirements implied by the plan but absent from the spec, especially provider timeout bounds and tool-use prerequisites? [Traceability, Spec §FR-005-07, §FR-014; Plan §Quyết định thiết kế và giới hạn]

## Notes

- All 37 items have been reviewed against the current requirement artifacts. `[x]` means the requirement-quality criterion is satisfied; it does not mean implementation or runtime tests are complete.
- Clarified coverage: retrieval remains host-owned; mode changes start a new session; retrieval/canonical-hydration failures, cancellation/restart outcomes, citation validation, and unchanged availability/scale baselines are specified. Process-interruption detection/reconciliation mechanics remain implementation work, with test coverage assigned in tasks.
- This checklist complements, and does not replace, `checklists/requirements.md`, which is maintained by `/speckit.specify` and `/speckit.clarify`.
- `/speckit.implement` reads checklist state as a gate and must not modify these reviewer-owned markers.
