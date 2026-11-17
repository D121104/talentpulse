# Hướng dẫn kiểm chứng Career Chat Agent

## Mục tiêu

Kiểm chứng agent Career Chat cùng RAG hiện hữu bằng dữ liệu tổng hợp và fake providers trước khi bật capability flag. Không dùng CV thật hoặc credential/provider production.

## Điều kiện tiên quyết

- Python 3.12/3.13 và `uv` như `ai-service/pyproject.toml`.
- Backend Node dependencies đã cài nếu chạy Jest/loopback tests.
- Test dùng fake/deterministic generation provider, in-memory retrieval và synthetic canonical job/CV.
- Không cần execution store/checkpointer mới; xác minh lease recovery có thể dùng persistence request/quota hiện hữu. Nếu cần migration tối thiểu để lưu lease, phải triển khai và kiểm tra migration tương thích cùng rollback trước rollout. Approval checkpoint database không thuộc tính năng này.
- Nếu chạy backend-to-FastAPI loopback, sử dụng test JWT keys tạm sinh trong test và môi trường local/test.

## Chạy kiểm chứng AI service

Từ `ai-service/`:

```bash
uv sync --locked
uv run pytest tests/unit/agent_foundation
uv run pytest tests/unit/rag_chatbot
uv run pytest tests/integration/test_agent_chat.py tests/integration/test_chat_api.py
uv run ruff check src/talentpulse_ai/agent_foundation src/talentpulse_ai/modules/rag_chatbot tests/unit/agent_foundation tests/unit/rag_chatbot tests/integration/test_agent_chat.py tests/integration/test_chat_api.py
uv run mypy src/talentpulse_ai/agent_foundation src/talentpulse_ai/modules/rag_chatbot
```

Kết quả cần thiết: tool allowlist/schema/authorization, bounded execution, prompt injection fixtures, citations/grounding, no-evidence fallback, 4 intents, locale, legacy selector default và internal RAG contracts đạt.

Các test phải xác nhận invalid agent output chỉ được sửa tối đa một lần khi còn budget, rồi fallback `DEGRADED`/`NO_EVIDENCE` nếu có thể trả câu an toàn hoặc controlled error; không được trả claim/citation sai. “100%” grounding, authorization và tool-denial criteria áp dụng trên toàn bộ synthetic fixtures được duy trì trong suite. Lặp deterministic acceptance suite 10 lần cùng fixtures và so sánh response/status, citations, authorization outcomes, fallback/error category (không so khớp byte-for-byte văn bản sinh tự do).

## Chạy compatibility loopback

Từ repository root:

```bash
npm --prefix backend test -- --runInBand tests/candidate-assistant/candidate-assistant-ai.loopback.integration.spec.ts tests/candidate-assistant/candidate-assistant.service.spec.ts tests/candidate-assistant/candidate-assistant.controller.spec.ts
```

Kết quả cần thiết: signed AI service transport/scope, retrieval→canonical context→generation flow, message/session/quota semantics, response blocks/citations/provenance và error mapping giữ nguyên. Frontend API typecheck/tests hiện hữu cũng phải pass; không có frontend source change dự kiến.

## Kịch bản xác minh rollout

1. Tắt `rag.generate` flag và để registry không đăng ký: cùng request fixture dùng legacy, API schema/response unchanged.
2. Đăng ký capability trong test composition và bật flag: chỉ `rag.generate` chọn agent; các capability khác không đổi.
3. Chạy JOB_SEARCH, ADVICE, CV_ANALYSIS, CV_JOB_COMPARISON với fake provider, prepared retrieval evidence/canonical context và deterministic matching fixture.
4. Cho model gọi `rag.retrieve_context`, nhận kết quả giới hạn theo request, rồi trả final structured result; xác nhận output evidence/citations chỉ dùng ID được chuẩn bị.
5. Với CV_JOB_COMPARISON, yêu cầu agent đọc thêm `career.read_matching_evidence`; xác nhận score/signals trả về đúng snapshot deterministic và tool bị từ chối ở mode khác.
6. Gửi unknown tool, cross-capability tool, schema sai, thiếu authorization, invalid final output, provider failure, timeout/cancel/budget exhaustion; xác nhận không có unauthorized handler call, không lộ payload và không có bước gọi sau khi stop. Mô phỏng client disconnect và recovered process interruption: abort outbound transport khi hỗ trợ, user message giữ COMPLETED, assistant response FAILED, quota được release đúng một lần, không auto-resume và late result không được persist/commit. Với nhiều instance, xác nhận request active gia hạn lease mỗi 10 giây, reconciler định kỳ không xử lý lease còn hạn/trong grace, chỉ một reconciler atomically kết thúc lease hết hạn, và request mồ côi terminalize trong 50 giây kể từ lần gia hạn cuối trong fixture healthy-runtime. Không yêu cầu chứng minh provider đã dừng inference.
7. Fixture CV consent/version/owner sai; xác nhận bị chặn ở owner boundary trước khi history được nạp hoặc AI được gọi. Xác nhận non-CV mode không nhận CV context hay history từ CV session khác; persisted history không bị thay đổi.
8. Tạo no-result, duplicate/malformed/unpaired/cross-job citation, missing canonical hydration và retrieval-service failure fixtures; xác nhận exact duplicate citation keys được deduplicate, empty/filtered evidence trả `NO_EVIDENCE`/safe fallback, service failure trả `DEGRADED`/controlled error, citation sai không đi cùng claim invalid và unsupported final chỉ được sửa tối đa một lần.
9. Inject lỗi sau agent dispatch; xác nhận cùng request không gọi legacy. Tắt flag và gửi request mới; xác nhận chọn legacy.
10. Đối chiếu `AgentExecutionObservation` với generation-stage observations qua request/trace ID; kiểm tra không có message/history/CV/prompt/token/raw tool payload và không có agent-to-agent delegation.

11. Dùng fake Bedrock client/provider để xác nhận agent model calls nhận remaining timeout, bounded client không vượt request deadline và provider không có timeout contract bị fail-closed; legacy provider client không đổi.

## Phạm vi timeout cần kiểm chứng

AI service transport mặc định production 30 giây, local/test 180 giây; Foundation executor default 30 giây. RAG provider calls có timeout riêng tới 60 giây ở một số nhánh hiện hữu. Agent target giới hạn 24 giây và chỉ bật khi internal transport timeout >=29 giây. Đây là release gate, không phải latency SLO. Provider mỗi lần gọi phải nhận remaining deadline; test phải chứng minh controlled failure trước transport timeout, không giả định Foundation dispatcher cưỡng chế hủy tool handler đồng bộ.

## Acceptance trước canary

- Regression/loopback contracts của legacy pass cho cả 4 mode.
- Synthetic agent path đạt schema, citation/grounding, privacy, tool denial và execution budget cases.
- Toolset chỉ thực hiện read-only context/matching operations; không truy vấn vector store, business database hoặc ghi dữ liệu.
- Selector test chứng minh off/unregistered=legacy và rollback=legacy request kế tiếp.
- Error từ agent không retry qua legacy cùng request.
- Bedrock agent provider path có timeout thực; provider thiếu timeout support không được route vào agent.
- Observability chỉ chứa metadata đã cho phép và mọi execution có correlation/capability/status/duration/error category khi phù hợp.
- Product/architecture owner chấp nhận giới hạn retrieval tool: tool đọc prepared evidence; vector retrieval/hydration vẫn do host flow hiện tại thực hiện.
