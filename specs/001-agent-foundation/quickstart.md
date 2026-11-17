# Hướng dẫn kiểm chứng Agent Foundation

## Mục tiêu

Kiểm chứng runtime chung với provider/tool giả lập trước khi bật bất kỳ capability production nào. Hướng dẫn này mô tả kiểm thử sau khi các implementation phases hoàn tất; hiện chưa có module Agent Foundation để chạy.

## Điều kiện tiên quyết

- Python 3.12 hoặc 3.13 và `uv`, theo `ai-service/pyproject.toml`.
- Node.js và dependencies backend chỉ cần cho các hồi quy NestJS.
- Unit tests dùng dữ liệu tổng hợp, provider giả lập và in-memory LangGraph checkpointer; không cần credentials LLM hoặc CV thật.
- Approval checkpoint integration test cần PostgreSQL test instance riêng, không dùng production database; không cần dùng dữ liệu business/CV thật.

## Kiểm chứng cục bộ

Từ `ai-service/`:

```bash
uv sync --locked
uv run pytest tests/unit/agent_foundation
uv run pytest tests/unit/rag_chatbot/test_rag.py tests/unit/cv_generator
uv run ruff check src/talentpulse_ai/agent_foundation tests/unit/agent_foundation
uv run mypy src/talentpulse_ai/agent_foundation
```

Kết quả kỳ vọng: runtime unit tests chứng minh lifecycle, budget, tool allowlist, schema validation và redaction; regression hiện có của RAG/CV tiếp tục pass.

Các unit tests approval dùng `InMemorySaver` để kiểm tra interrupt/decision/route; chúng không đại diện cho durable restart recovery.

## Kịch bản integration và compatibility

Approval persistence tests require a disposable PostgreSQL database with the `AgentFoundationCheckpoints` TypeORM migration applied. Provision `agent_checkpoint_runtime` as a `NOLOGIN` role before migration, and use a dedicated login that is a member of that role for `AGENT_TEST_DATABASE_URL`. The login must not have privileges on business schemas. `AGENT_CHECKPOINT_MIGRATION_TEST_URL` is a migration-owner connection used only by the migration integration test.

Từ `ai-service/`:

```bash
uv run pytest tests/integration/test_chat_api.py tests/integration/test_cv_api.py
uv run pytest tests/integration/test_agent_foundation.py
uv run pytest tests/integration/test_agent_checkpoint.py
```

`test_agent_checkpoint.py` chỉ chạy với PostgreSQL test instance đã provision checkpoint tables bằng migrations. Test phải xác nhận resume dùng cùng approval/thread ID sau process restart.

Apply the checkpoint schema using `backend/src/database/migrations/20261117120000-AgentFoundationCheckpoints.ts` before running that integration test. The runtime checkpointer must never call `PostgresSaver.setup()`; schema DDL belongs to the migration step.

Từ repository root, trong environment backend test đã cấu hình:

```bash
npm --prefix backend test -- --runInBand \
  tests/candidate-assistant/candidate-assistant-ai.loopback.integration.spec.ts \
  tests/online-cvs/async-generation.service.spec.ts
```

Kết quả kỳ vọng:

- Request/response contract hiện hành của chatbot và CV không đổi.
- Chatbot vẫn đồng bộ qua NestJS; CV worker vẫn sở hữu queue, trạng thái, cancellation và persistence.
- Capability chưa bật agent tiếp tục chạy legacy.
- Agent failure không chạy legacy lần nữa trong cùng request; sau rollback, request mới chạy legacy.
- CV write chỉ xảy ra theo user-triggered generation action hiện tại và tiếp tục trả về draft `EDITOR_ONLY`; late result không ghi đè operation terminal/stale/cancelled.
- Approval workflow pause trước publish/material write; NestJS xác thực decision rồi internal resume tiếp tục đúng checkpointed graph. Không có public API/response contract thay đổi trong Foundation.
- Internal resume route từ chối service call không có scope `agent:resume`, decision trùng lặp và resource version đã stale.

## Security và recovery checks

- Dùng fixture CV tổng hợp có marker nhận diện; xác nhận marker không xuất hiện trong logs/traces/error responses.
- Đăng ký tool cho capability A, rồi gọi từ capability B; xác nhận bị từ chối trước handler.
- Gọi tool với input sai schema và principal thiếu quyền; xác nhận không tạo side effect.
- Ép provider/tool timeout, vượt giới hạn, cancellation và process interruption; xác nhận terminal status/error ổn định, retry là execution mới và không có auto-fallback qua legacy.
- Tạo approval interrupt, restart worker, resume cùng thread bằng decision đã xác thực; reject/expiry/stale không chạy write handler và checkpoint bị xóa sau terminal state.
- Dùng clock giả lập xác nhận decision ngay trước 24 giờ còn hợp lệ, decision tại/sau expiry bị từ chối, và cleanup xóa checkpoint hết hạn.
- Kiểm tra checkpoint serializer/state thật chỉ chứa approval/resource/version/action references, không có CV text, prompts, messages hoặc model output.
- Hủy hoặc làm stale CV operation trước khi worker persist; xác nhận existing NestJS version/consent fence chặn ghi kết quả muộn.

## Ranh giới kiểm thử

Không chạy test gọi LLM production trong vòng unit. Provider integration tests nếu cần chạy tách biệt, phải dùng môi trường kiểm thử được phê duyệt, giới hạn dữ liệu và không dùng CV thật. Thực thi lệnh thực tế phụ thuộc task implementation có tạo đúng test modules nêu trên; hướng dẫn này không tuyên bố các test mới đã tồn tại hoặc đã chạy.
