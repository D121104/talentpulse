# Tích hợp Agent Foundation

## Mục đích và căn cứ

Tài liệu này ghi nhận kiến trúc Agent Foundation hiện có và các điểm nối cho Career Chat Agent và CV Generation Agent. Foundation là baseline; nội dung dưới đây không đề xuất thay thế runtime hoặc tạo framework agent song song.

Đã đối chiếu `specs/001-agent-foundation/spec.md`, `tasks.md`, các tài liệu contract/data-model/research/quickstart và source hiện hành trong `ai-service/`, migration NestJS, cùng test Foundation. Có hai sai khác tài liệu cần lưu ý:

- `spec.md` vẫn để trạng thái `Draft`, dù tasks ghi tất cả T001-T038 hoàn tất và có kết quả kiểm chứng.
- `specs/001-agent-foundation/plan.md` không có trong working tree, mặc dù được tasks liệt kê là prerequisite và làm căn cứ review.
- Tài liệu `docs/current-ai-architecture.md` cũng không có; inventory dưới đây được xác minh từ source và contract hiện hành.

## Kiến trúc đã xác minh

- **Service và runtime:** AI service là Python 3.12/3.13, FastAPI, Pydantic 2; composition root tại `ai-service/src/talentpulse_ai/main.py`. Foundation nằm trong `talentpulse_ai.agent_foundation`.
- **Orchestration:** `langgraph==1.2.22` được khai báo trực tiếp trong `ai-service/pyproject.toml`. Execution thông thường dùng `langgraph.graph.StateGraph` với các node `prepare → model_decision → tool_dispatch → model_decision → validate_finalize`, compile không checkpointer và chạy theo request. `approval.py` import `RunnableConfig` từ `langchain_core` để cấu hình graph, nhưng không dùng `LangChain create_agent`; không có LangSmith hay multi-agent runtime.
- **Approval state:** graph riêng trong `agent_foundation/approval.py` dùng `interrupt()` và `PostgresSaver` từ `langgraph-checkpoint-postgres==3.2.1`; `psycopg[binary,pool]` cung cấp pool. Checkpoint chỉ dành cho approval đang pending, reference/version/action metadata, TTL 24 giờ. Migration `backend/src/database/migrations/20261117120000-AgentFoundationCheckpoints.ts` tạo schema riêng `agent_checkpoint` và cấp quyền runtime trên các checkpoint tables.
- **State/error/budget:** `contracts.py` định nghĩa request, `TypedDict` state, `AgentDefinition`, result/usage, trạng thái và error codes. `ExecutionPolicy` giới hạn step/model/tool calls và thời gian; `policy.py` áp dụng cancellation/deadline. Execution thông thường không được resume sau restart; lần retry phải có `run_id` mới.
- **Tool boundary:** `tools.py` cung cấp `ToolDefinition`, registry, dispatcher, input/output Pydantic validation và `ToolAuthorizer` protocol. Dispatcher kiểm tra đăng ký, allowlist capability, authorization và budget trước handler; model không điều khiển context được ủy quyền. Hiện không có business tool catalog.
- **LLM adapter:** `AgentModelAdapter` chuẩn hóa `GenerationProvider` dùng chung hiện có; dùng `generate_structured` nếu provider hỗ trợ, nếu không parse typed decision envelope từ `generate`. Provider factory hiện cấu hình Bedrock/Nova cho cloud hoặc Ollama local; không có contract native tool calling chung. Provider errors/raw output được chuyển thành lỗi an toàn.
- **Selector:** `CapabilityImplementationSelector` chọn agent/legacy theo config server-side và danh sách capability đã đăng ký. `agent_enabled_capabilities` mặc định rỗng trong settings. Selector chỉ là chọn implementation, không tự tạo agent hay nối route.
- **Observability:** `observability.py` ghi run/correlation/capability/status/duration/counts/error category, không ghi prompt, CV, tool payload hoặc provider output.
- **Ownership:** NestJS vẫn sở hữu authorization, consent, business data, chat session/history, CV operation/queue/status/cancellation/version fences và persistence. AI service thực hiện inference/orchestration. Agent không được truy cập trực tiếp PostgreSQL business tables để vượt application boundary.

## Thành phần có thể tái sử dụng

- `AgentRequest`, `AgentDefinition`, `AgentExecutionState`, `AgentResult`, `AgentUsage`, `AgentError`, `AgentStatus` và `AgentErrorCode` cho execution contract.
- `ExecutionPolicy`, budget/cancellation helpers và `execute_agent`/`build_agent_graph` cho bounded request-scoped execution.
- `AgentModelAdapter`/`AgentModelPort` cùng provider protocols/factory hiện hữu.
- `ToolDefinition`, `ToolRegistry`, `ToolDispatcher`, `ToolExecutionContext`, `ToolAuthorizer` và `ToolResult` cho công cụ có schema/quyền rõ ràng. Mỗi capability vẫn phải khai báo allowlist riêng.
- `record_execution_observation` cho metadata vận hành đã làm sạch.
- `ApprovalRequest`, `ApprovalDecision`, `ApprovalManager`, approval graph và `AgentCheckpointer` cho workflow cần human approval/resume. Action executor phải thuộc boundary nghiệp vụ đáng tin cậy; Foundation không cung cấp thao tác ghi CV tổng quát.
- `CapabilityImplementationSelector` và cờ `agent_enabled_capabilities` cho rollout từng capability sau khi composition/route wiring được bổ sung.

Không dùng chung prompt, business schema, workflow, context rules, validators, retrieval policy hoặc tool allowlist giữa capability chỉ để tận dụng runtime. Chúng thuộc module capability.

## Public interface và integration contract

1. **Không có public Agent API mới.** Request/response/status/error contract của router chatbot/CV hiện tại không đổi. Execution contract là nội bộ giữa module capability và Foundation.
2. **Execution host** tạo `run_id`, correlation/capability IDs, input đã kiểm tra, authorized context tối thiểu và policy/allowlist tin cậy. Không đưa raw token vào context. Model/client không được chọn policy hoặc tự bật capability.
3. **Agent definition** cần capability ID ổn định, model profile, output Pydantic model, prompt/instructions riêng, tool allowlist và policy. Model decision chỉ là `tool_call` hoặc `final`; mọi output phải validate trước khi dispatch/trả caller.
4. **Tool handler** phải có input/output model, capability allowlist, required operation, timeout, side-effect class và authorization qua application boundary. Đọc dữ liệu business từ snapshot/API của owner service; write chỉ qua workflow được owner service kiểm soát, không qua generic DB/HTTP/shell tool.
5. **Adapter trở về luồng hiện hành:** ánh xạ kết quả Foundation sang schema/semantics hiện hữu. Chat đồng bộ qua NestJS; CV tiếp tục hỗ trợ sync/queue lifecycle do NestJS sở hữu. Không thay status nghiệp vụ CV bằng `AgentStatus`.
6. **Failure/rollback:** sau khi request đã chọn agent, lỗi trả controlled error/degraded theo capability hiện hữu, không chạy legacy lần hai trong cùng request. Tắt flag tác động request tiếp theo; pending approval vẫn phải resolve/cancel/expire.
7. **Approval:** chỉ NestJS xác thực actor/ownership/consent/version và gọi internal resume với scope `agent:resume`. Approval graph chỉ chứa reference/version/action metadata; action sau approve phải idempotent và revalidate quyền/version ở owner boundary. Generate/regenerate CV hiện tại cho phép lưu draft `EDITOR_ONLY`, không đồng nghĩa approve publish.

## Extension point: Career Chat Agent

Contract tương lai đã xác định là dùng `RagGenerateRequest` làm input đã hydrate/authorized và trả `RagGenerateResponse` hiện hành. Điểm nối nên đặt trong generation capability hiện hữu sau các bước retrieval, canonical hydration và deterministic matching; không chuyển session/history/quota/consent từ NestJS, không chuyển retrieval/citation validation ra khỏi owner module.

Agent có thể dùng model adapter chung và chỉ đăng ký các read tools thật sự cần. Nếu một tool truy cập dữ liệu tuyển dụng, nó phải nhận dữ liệu/ủy quyền đã xác thực từ NestJS hoặc service sở hữu dữ liệu. Giữ nguyên citation keys/provenance và kiểm tra citation ở capability hiện hữu. Sau khi đăng ký implementation, route/composition cần gọi selector đúng một lần cho mỗi request.

## Extension point: CV Generation Agent

Contract tương lai đã xác định là `CvDraftRequest` → `CvDraft`, giữ provenance, locale và `EDITOR_ONLY`. Điểm nối thuộc `cv_generator`/generation service hiện hữu; prompts, grounding, localization, validation/fallback vẫn là logic CV riêng. NestJS tiếp tục sở hữu sync/async operation, queue, status, cancellation, stale/version/consent rechecks và lưu draft.

Generation theo yêu cầu người dùng chỉ được ghi draft `EDITOR_ONLY` như hiện tại; output agent tự nó không cấp thêm quyền publish. Nếu sau này có publish/material write, CV workflow tạo approval reference, pause tại approval graph và resume qua NestJS-authorized internal contract. Không đưa CV text/prompt/model conversation vào checkpoint.

## Tests và giới hạn đã biết

**Test coverage có trong source:** unit tests cho execution, model parsing, tool dispatch, policy, observability, selector, approval và future capability contract; integration tests dùng fake provider/tool; test API nội bộ resume kiểm tra service scope; PostgreSQL checkpoint tests kiểm tra tạo lại manager, resume cùng thread, privacy, expiry và rollback. Test Chat/CV API và NestJS lifecycle/migration regressions được liệt kê trong quickstart/tasks.

**Kiểm chứng trong lần review:** `uv run pytest tests/unit/agent_foundation tests/integration/test_agent_foundation.py tests/integration/test_agent_checkpoint_api.py` đạt **57 passed, 1 skipped**. Skip là PostgreSQL lifespan test khi không cấu hình `AGENT_TEST_DATABASE_URL`. `uv run ruff check ...` và `uv run mypy src/talentpulse_ai/agent_foundation` đều đạt. Đây là kiểm chứng phạm vi Foundation, không chạy lại toàn bộ AI/NestJS suite. Task evidence ghi lần full gate trước đó đạt 472 test, 4 PostgreSQL test skip trong lần chạy đó; checkpoint/migration và 2 NestJS suites (9 tests) từng pass trên database disposable/Node 24.

**Giới hạn và blockers tích hợp:**

- Selector hiện được tạo trong `main.py` nhưng `registered_capabilities` mặc định rỗng; tìm kiếm source cho thấy các router RAG/CV hiện chưa gọi `select()` và `execute_agent()` chưa được gọi từ capability route/service. Do đó Foundation runtime tồn tại nhưng chưa có capability production nào được chuyển tuyến qua nó. Đây là blocker chính trước khi bật flag; không đổi flag một mình để rollout.
- ApprovalManager hiện được composition root khởi tạo với `action_executors={}` và `can_start_approval=False`. Internal resume route có auth scope, nhưng chưa có caller NestJS/business approval flow/action executor nối vào. Approval contract là seam nội bộ, chưa phải luồng approval end-to-end.
- `test_future_capabilities.py` xác nhận schema/model contract và approval references có thể biểu diễn; không chứng minh agent Career Chat/CV đã tích hợp hoặc test execution qua hai capability thật.
- Test phục hồi PostgreSQL, migration integration và lifespan cần database riêng đã migrate, runtime role đúng least privilege; không được xem kết quả skip là xác minh recovery ở môi trường hiện tại.
- Timeout của tool được truyền cho handler trong `ToolExecutionContext`; dispatcher gọi handler đồng bộ và không ép buộc handler chấm dứt khi timeout. Tool handler phải tôn trọng timeout/deadline, và tích hợp cần kiểm chứng điều đó.
- Cancellation của model/provider là best-effort; provider call đang chạy có thể chưa dừng được. Result muộn không được phép bắt đầu tool step tiếp theo hoặc được persist; NestJS terminal/version fences vẫn là chốt cuối.
- Spec success criteria như tỷ lệ quan sát 95%, API compatibility toàn bộ và privacy gate là mục tiêu đặc tả; test Foundation không thay thế xác minh triển khai/telemetry ở production.

## Checklist trước khi bật capability

- Đăng ký agent implementation và output/input contract ở capability owner; selector có registry capability thực.
- Nối selector/executor qua route/service hiện hữu, gọi selection đúng một lần và giữ nguyên DTO/status/public API.
- Xác minh auth/consent/context từ NestJS, tool allowlist hẹp, schema validation và không có side effect khi từ chối.
- Kiểm tra timeout/deadline/cancellation, output validation, citation/provenance hoặc CV version fences theo capability.
- Bổ sung integration/compatibility tests trên luồng capability thực, deterministic fake provider; kiểm tra rollback về legacy ở request kế tiếp.
- Chỉ bật approval khi đã có owner action executor, NestJS authorization/audit/resume caller và PostgreSQL role/migration/recovery tests xác thực.
- Cập nhật trạng thái spec và bổ sung/định vị plan chính thức để tài liệu thiết kế khớp trạng thái implementation.
