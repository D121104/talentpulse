# Feature Specification: API Model Prompt and Schema Cleanup

**Feature Branch**: `[004-api-model-prompt-cleanup]`

**Created**: 2026-11-18

**Status**: Draft

**Input**: User description: "vì trước đó trong quá trình phát triển dùng ollama nên có nhiều cái dư thừa, và ko phù hợp với các model lớn qua api, hãy kiểm tra và loại bỏ những phần ko cần thiết đi"

## Clarifications

### Session 2026-11-18

- Q: Bạn muốn đợt rà soát áp dụng cho những model AI gọi qua API nào (không gồm Ollama chạy local)? → A: Tất cả provider hosted hiện đang bật trong project.
- Q: Ngoài việc request được provider chấp nhận và output đúng định dạng, chất lượng câu trả lời (độ chính xác, bám nguồn và hữu ích) có cần là điều kiện bắt buộc để hoàn tất cleanup không? → A: Có; chất lượng nội dung là tiêu chí nghiệm thu cùng với hợp đồng output.
- Q: Bạn muốn chấm chất lượng câu trả lời trong bộ đánh giá bằng cách nào? → A: Tự động kiểm tra toàn bộ; người đánh giá chấm ít nhất 10 câu mỗi luồng/provider.
- Q: Trong feature này, bạn muốn xử lý luồng CV analysis hiện chỉ chạy với Ollama như thế nào? → A: Mở rộng hosted.
- Q: Trước khi gửi CV từ luồng CV analysis sang Bedrock/Gemini, bạn muốn xử lý consent hiện có thế nào? → A: Dùng consent hiện tại.
- Q: Nếu người dùng chưa có bản ghi consent `cv_matching`, bạn muốn họ cấp consent cho hosted CV analysis bằng cách nào? → A: Thêm UI dùng consent hiện tại.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reliable hosted-model answers (Priority: P1)

An applicant asks the AI assistant for help with a CV, job search, or career question using a hosted language model. The assistant returns a useful answer in the established product format instead of failing because its instructions or output constraints are unnecessarily restrictive or incompatible with that model.

**Why this priority**: A failure to generate an answer blocks the primary AI-assisted user journey and is the problem that prompted this work.

**Independent Test**: Exercise each in-scope generation journey with representative requests and a controlled hosted-model response; confirm the request constraints are accepted and the result passes the existing product contract and safety checks.

**Acceptance Scenarios**:

1. **Given** a supported hosted model and a valid user request, **When** the assistant generates a response, **Then** the response follows the existing user-facing contract without avoidable schema or request rejection.
2. **Given** a generated response that violates a required product or safety rule, **When** it is validated, **Then** it remains rejected or handled by the existing safe fallback rather than being accepted due to relaxed model constraints.
3. **Given** an unavailable or incompatible hosted model capability, **When** a request is made, **Then** the user receives the existing controlled failure behavior and no provider internals are exposed.
4. **Given** an active `cv_matching` consent and a supported hosted model, **When** CV analysis is requested, **Then** the analysis uses the hosted provider and retains its existing response contract.
5. **Given** `cv_matching` consent is missing or revoked, **When** CV analysis is requested, **Then** the CV-derived analysis data is not sent to a hosted provider and the existing controlled denial behavior is returned.
6. **Given** a user without `cv_matching` consent, **When** they open the existing AI consent controls, **Then** they can grant or revoke the `cv_matching` scope using its existing policy and endpoints.

---

### User Story 2 - Preserve local-model workflows (Priority: P2)

A developer or tester runs supported AI journeys with the local Ollama profile and continues to receive outputs that satisfy the same product contracts, without hosted-model-specific changes breaking local development.

**Why this priority**: Local Ollama remains a supported development path, but its constraints must not dictate the behavior of hosted models.

**Independent Test**: Run deterministic provider-boundary tests for the local profile across the generation journeys covered by the cleanup and verify contract compatibility.

**Acceptance Scenarios**:

1. **Given** the local Ollama profile, **When** a supported generation journey is executed, **Then** it continues to satisfy its existing response contract.
2. **Given** a setting that is necessary only for a specific provider, **When** another provider is selected, **Then** that setting does not impose unrelated restrictions on the selected provider.

---

### User Story 3 - Reviewable and reversible cleanup (Priority: P3)

The engineering team can determine which generation constraints were retained, simplified, or removed and can restore prior behavior if the cleanup causes a regression.

**Why this priority**: A scoped audit and recovery path prevent a broad prompt cleanup from silently weakening behavior or breaking other providers.

**Independent Test**: Review the change inventory and exercise the rollback or disable path in a controlled environment without changing public API contracts or stored user data.

**Acceptance Scenarios**:

1. **Given** a proposed prompt or output-constraint change, **When** it is reviewed, **Then** its affected generation journeys, expected benefit, and retained safeguards are identifiable.
2. **Given** a regression after rollout, **When** the rollback path is used, **Then** the previous behavior or an equivalent safe implementation can be restored without data migration.
3. **Given** a cleanup limited to language-model generation, **When** retrieval, embeddings, or ranking are exercised, **Then** their existing behavior remains unchanged unless an explicitly reviewed dependency requires a scoped adjustment.

### Edge Cases

- A model supports structured responses but rejects part of a schema because of its supported schema subset or complexity limits.
- A schema contains optional fields, nested unions, large enumerations, or array bounds that are useful to application validation but too restrictive for a provider's constrained generation.
- A constraint appears Ollama-specific but is also required for a product contract, privacy rule, authorization boundary, citation rule, or safe fallback.
- A hosted model and Ollama produce different surface forms while both can satisfy the same product-level contract.
- A provider is unavailable during evaluation; deterministic tests must still verify request construction and response handling without requiring a live model.
- A prompt includes length, retry, or context bounds that affect reliability or cost; such bounds must not be removed solely because they were introduced during local-model development.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST inventory every in-scope language-model generation journey and its prompt instructions, output constraints, provider settings, validation, retry, and fallback behavior before removing constraints.
- **FR-002**: The system MUST remove or simplify a constraint only when review evidence shows that it is redundant, local-model-specific, or incompatible with a supported hosted model; each change MUST state its evidence and MUST preserve the user-facing contract and safety requirements it affects.
- **FR-003**: The system MUST preserve the existing user-facing response contracts for chat, job search, CV analysis, CV matching explanations, CV generation, localization, and agent responses unless a separate approved contract change is made.
- **FR-004**: The system MUST continue to validate model outputs against product requirements after generation; provider-side structured output MUST NOT replace application validation.
- **FR-005**: The system MUST retain authorization, consent, privacy, prompt-injection defenses, citation and evidence rules, bounded execution, and safe fallback behavior while simplifying prompts or schemas.
- **FR-006**: The system MUST support the existing Ollama development profile and MUST scope provider-specific requirements so they do not unnecessarily constrain other providers.
- **FR-007**: The system MUST keep the change limited to language-model generation behavior and directly related prompts, schemas, and provider request settings; retrieval, embeddings, ranking logic, and unrelated workflows MUST remain unchanged unless a demonstrated dependency requires a scoped change.
- **FR-008**: The system MUST provide a practical rollback path for the cleanup without changing public API contracts or requiring migration of persisted user data.
- **FR-009**: The system MUST include deterministic unit and integration tests for changed generation behavior and provider boundaries, plus representative evaluation cases; routine test runs MUST NOT require live model-provider calls.
- **FR-010**: The system MUST automatically check response contracts and applicable safety rules across the full evaluation set and have reviewers assess at least 10 representative responses per generation journey and hosted provider for relevance, factual accuracy, usefulness, and support from supplied evidence where factual claims are made.
- **FR-011**: CV analysis MUST support the currently enabled hosted generation providers only after the existing `cv_matching` consent scope has been verified by the owning application service; missing or revoked consent MUST prevent CV-derived data from being sent to a hosted provider.
- **FR-012**: Users MUST be able to grant or revoke the existing `cv_matching` consent scope through the frontend using its current policy and endpoints. This feature MUST NOT add a consent scope or change the existing consent policy text/version.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every removed or simplified constraint has a recorded reason and evidence, and every in-scope generation journey has been reviewed before cleanup is considered complete.
- **SC-002**: Across a fixed evaluation set of at least 30 representative requests per in-scope journey, at least 95% produce a first-pass response that satisfies the existing product contract when run against each supported hosted model profile.
- **SC-003**: At least 10 representative responses per generation journey and hosted provider are assessed by reviewers using a case-specific rubric for relevance, factual accuracy, usefulness, and grounding of factual claims in supplied evidence; at least 90% of reviewed responses pass.
- **SC-004**: No evaluation case that previously satisfied privacy, authorization, grounding, citation, or output validation is accepted after cleanup when it violates the same safeguard.
- **SC-005**: All existing provider-boundary compatibility tests for hosted and Ollama profiles pass with no request or response schema changes; the only additive response behavior is a controlled denial when the existing `cv_matching` consent is missing or revoked.
- **SC-006**: The prior behavior or an equivalent safe fallback can be restored through the documented rollback path without changing persisted data.

## Assumptions

- Hosted language models are the primary target for reducing constraints that were introduced to accommodate local Ollama behavior.
- Supported hosted models for this feature are all non-Ollama language-model providers currently enabled for generation in the project.
- The existing `cv_matching` consent scope is the approved consent basis for hosted CV analysis in this feature; the policy text and version remain unchanged, while its existing consent API is exposed through the frontend.
- Ollama remains a supported local development and testing option; this feature does not remove it.
- This feature does not target reducing response latency or hosted-model cost; existing bounds that protect reliability or cost remain unless review evidence and evaluation justify a change.
- Product-level response contracts, application validation, privacy, authorization, and safety rules take precedence over provider convenience.
- Evaluation prompts and fixtures will be synthetic or otherwise approved for the target provider; CV data will not be added to routine test fixtures.
- The cleanup does not change user-visible features, public APIs, or persisted data semantics.
