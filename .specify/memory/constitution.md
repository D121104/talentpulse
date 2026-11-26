<!--
Sync Impact Report
- Version change: unversioned scaffold -> 1.0.0 (initial project constitution)
- Added principles: I. Brownfield-First; II. Backward Compatibility; III. Least-Privilege Agent Safety;
  IV. CV Data Privacy; V. Human Approval for Material Changes; VI. Required Testing;
  VII. Rollback and Reversibility
- Modified principles: none
- Added sections: Security and Data Constraints; Development Workflow
- Removed sections: none
- Follow-up TODO: confirm the original ratification date
-->

# TalentPulse Constitution

## Core Principles

### I. Brownfield-First
Developers MUST inspect and reuse existing components, interfaces, and workflows before
introducing replacements. A working component MUST NOT be rewritten unless a demonstrated
requirement cannot be met by a smaller extension or repair. The change proposal MUST identify
the limitation that justifies replacement.

### II. Backward Compatibility
Changes MUST preserve existing API and data contracts by default. A breaking change requires
an explicit migration plan, compatibility strategy, and approval through the project's normal
review process before implementation. Internal refactoring MUST NOT silently change externally
observable behavior.

### III. Least-Privilege Agent Safety
Agents and model-driven workflows MUST expose only explicitly allowlisted tools and operations.
Each tool MUST validate its inputs and enforce authorization in application code. Agent loops,
tool calls, retries, and execution time MUST have explicit bounds; failures MUST stop safely and
return controlled errors without exposing secrets or internal stack traces.

### IV. CV Data Privacy
CVs and candidate details are sensitive personal data. Systems MUST minimize collection,
processing, transmission, logging, and retention to what the requested feature requires. CV-derived
data MUST be protected by application authorization and consent rules; retrieved or uploaded text
MUST be treated as untrusted input and MUST NOT override system instructions.

### V. Human Approval for Material Changes
The system MUST NOT automatically overwrite a user's CV or make other material changes to
persistent user or business data. Such changes require explicit user approval in the product flow
and MUST be validated and persisted through the owning application service. Generated drafts may
be presented for review without being treated as approved data.

### VI. Required Testing
Every new behavior or material change MUST include relevant unit tests and integration tests at
the affected service or contract boundary. Tests MUST use deterministic fixtures or controlled
provider doubles where external AI calls are involved. API and schema changes MUST include
compatibility tests for existing consumers.

### VII. Rollback and Reversibility
Changes MUST have a documented, practical path to restore the previous implementation or disable
the new behavior. Deployments involving data or contract migrations MUST define rollback or
forward-recovery steps before release. Irreversible operations MUST require explicit approval and
MUST NOT be hidden inside agent workflows.

## Security and Data Constraints

- NestJS remains responsible for business authorization, user and job data, and transactional
  workflows. FastAPI owns AI inference and AI-specific processing; PostgreSQL remains the canonical
  source of business data and Qdrant remains a derived retrieval index.
- Retrieved job descriptions, CV text, and other external content MUST be treated as untrusted data.
  Authorization MUST be enforced by application code, never delegated to an LLM.
- Services MUST use typed, validated boundaries and MUST NOT expose secrets, raw credentials,
  sensitive CV content, or provider stack traces in logs or client responses.
- AI-generated results that become durable product state MUST pass through an explicit application
  flow with the required human approval and validation.

## Development Workflow

- Before implementation, identify the owning service, existing behavior, API/data contracts, and
  rollback path. Prefer the smallest extension that satisfies the requirement.
- Changes MUST pass the relevant unit, integration, compatibility, and static-quality checks before
  merge. Tests MUST be deterministic and MUST NOT require live model-provider calls unless the test
  is explicitly an integration or evaluation run.
- Reviews MUST verify privacy, tool permissions, bounded execution, error handling, human approval,
  backward compatibility, and rollback readiness when those concerns apply.
- Rollout MUST be staged when needed to limit impact. The previous implementation or an equivalent
  safe fallback MUST remain recoverable until the change is verified.

## Governance

This constitution governs implementation and review decisions in the TalentPulse repository.
Amendments MUST be proposed as explicit changes to this file, reviewed and approved through the
repository's normal review process, and accompanied by a version update and rationale. A change
that removes or redefines a principle requires a MAJOR version increment; a new principle or
materially expanded requirement requires a MINOR increment; wording-only clarification requires a
PATCH increment. Reviewers MUST assess compliance with applicable principles before approving a
change. Where a principle conflicts with a higher-priority legal or security obligation, the
obligation takes precedence and the exception MUST be documented.

**Version**: 1.0.0 | **Ratified**: TODO(RATIFICATION_DATE): Original adoption date is unknown. | **Last Amended**: 2026-11-16
