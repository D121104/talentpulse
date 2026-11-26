# Quickstart: Tạo CV bằng Agent và structured output

## Runtime

CV generation luôn chạy qua một Agent structured response và chỉ chấp nhận provider Gemini hoặc Bedrock. Không cần `AI_AGENT_ENABLED_CAPABILITIES` để bật CV; selector đó chỉ còn cho các capability khác.

Chạy Gemini:

```bash
scripts/start-local.sh --ai-profile=gemini
```

Chạy Bedrock:

```bash
scripts/start-local.sh --ai-profile=bedrock
```

Gemini cần `AI_GEMINI_API_KEY`; Bedrock cần region và AWS credentials. Cung cấp cấu hình an toàn qua môi trường local hiện hành, không ghi credentials vào lệnh hoặc log. Startup script có thể còn chạy Ollama cho embedding/RAG; CV content generation dùng provider Gemini/Bedrock đã chọn và từ chối Ollama.

Trước khi tạo CV, ứng viên cần consent còn hiệu lực. Draft được staging ở trạng thái pending review; chỉ explicit Save mới cập nhật CV canonical.

## Deterministic Verification

Run from `ai-service/`:

```bash
AI_ENVIRONMENT=test AI_EMBEDDING_PROVIDER=deterministic AI_VECTOR_STORE_PROVIDER=memory AI_GENERATION_PROVIDER=deterministic \
  uv run pytest tests/unit/cv_generator/test_structured_agent.py tests/unit/agent_foundation/test_model.py tests/unit/evals/test_application_journeys.py tests/unit/evals/test_hosted_generation_eval.py tests/unit/providers/test_provider_factory.py tests/integration/test_cv_api.py -q
AI_ENVIRONMENT=test AI_EMBEDDING_PROVIDER=deterministic AI_VECTOR_STORE_PROVIDER=memory AI_GENERATION_PROVIDER=deterministic \
  uv run ruff check src tests
AI_ENVIRONMENT=test AI_EMBEDDING_PROVIDER=deterministic AI_VECTOR_STORE_PROVIDER=memory AI_GENERATION_PROVIDER=deterministic \
  uv run mypy
```

Tests use synthetic inputs and provider doubles; they do not call Gemini/Bedrock, Ollama, Qdrant or a live database. Assertions cover one structured response, requested locale in prompt, source-index bounds, canonical identity copying, no-tool execution, unsupported-provider rejection and review envelope compatibility.

Implementation verification completed: the AI-service full deterministic suite passed with the existing production-provider startup test excluded because local `AI_QDRANT_URL` configuration is not HTTPS; affected AI CV/Agent/evaluator/API suites, Ruff and mypy passed. Backend build passed; 135 focused CV lifecycle/unit tests and 28 PostgreSQL integration tests passed. Frontend editor tests passed (24). No live provider call or human quality evaluation was run.

## Review/Persistence Verification

Run from the repository root:

```bash
npm --prefix backend test -- --runInBand tests/online-cvs/async-generation.service.spec.ts tests/online-cvs/async-generation.postgres.integration.spec.ts tests/online-cvs/online-cvs.service.spec.ts tests/online-cvs/generate-from-career-profile.service.spec.ts
node --test frontend/src/pages/cv/CVEditorPage.test.mjs
```

Confirm pending drafts remain readable and can be explicitly saved, rejected or expired. Existing persisted legacy metadata remains readable; it cannot invoke legacy generation.

## Hosted Evaluation

The fixed synthetic evaluator supports filtering with `--journey CV_GENERATION` and `--journey CV_LOCALIZATION`; both groups run the complete structured draft flow with different locales. Do not run live provider comparison until provider cost/data processing is explicitly authorized. No hosted baseline or human rating is claimed for this implementation.

## Rollback

Rollback by restoring the previous release/source revision (`3426ba0`). The new runtime has no legacy generation selector or fallback. No database migration or saved-CV repair is required; leave pending drafts for normal review/expiry behavior.
