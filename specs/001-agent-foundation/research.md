# Research: TalentPulse Agent Foundation

## Baseline xác minh

Tài liệu `docs/current-ai-architecture.md` không tồn tại trong working tree hiện tại; các quyết định dưới đây dựa trên source và các audit/tests hiện có, không suy đoán nội dung tài liệu bị thiếu.

- AI service là FastAPI, Python `>=3.12,<3.14`, dùng Pydantic 2 và `uv`: `ai-service/pyproject.toml:1-16,21-50`.
- Composition root đã lắp RAG, CV matching/draft, indexing và provider instances trong một service: `ai-service/src/talentpulse_ai/main.py:120-159`.
- Provider factory tạo provider dùng chung cho generation, hiện gồm local Ollama/Qdrant và cloud Cohere/Qdrant/Bedrock: `infrastructure/provider_factory.py:17-29,47-142`.
- Local protocols gồm `GenerationProvider.generate()` và optional `StructuredGenerationProvider.generate_structured()`: `modules/rag_chatbot/schemas.py:376-390`. Provider chưa có native tool-call contract chung; Bedrock boundary expose text generation, Ollama adapter hỗ trợ structured output.
- LangGraph/LangChain chưa là dependency trực tiếp trong `pyproject.toml` trước thay đổi này.
- NestJS giữ public chatbot API, auth/consent/quota/session/history và persistence. Chat adapter thực hiện retrieval/canonical context/optional deterministic match/generation: `backend/src/candidate-assistant/candidate-assistant.controller.ts:24-62`, `candidate-assistant.service.ts:148-338`, `candidate-assistant-ai.client.ts:217-352`.
- NestJS sở hữu CV queue, operation state, cancellation và version fences. CV `RUNNING` redelivery hiện fail-closed thành `WORKER_INTERRUPTED`, không resume: `backend/src/online-cvs/online-cvs.controller.ts:42-130`, `online-cvs.service.ts:2308-2326`.
- CV user-triggered generate/regenerate hiện lưu draft `EDITOR_ONLY`; không có publish-approval endpoint sau generation. Quyết định hiện tại giữ draft write này, chỉ gate publish/material write tương lai.

## Quyết định 1: LangGraph là bắt buộc; dùng trực tiếp StateGraph

**Quyết định**: Owner đã override recommendation trước đó. Agent orchestration mới MUST dùng LangGraph `StateGraph`; không dùng direct Python loop làm execution engine và không dùng `LangChain create_agent` làm wrapper tổng quát. LangGraph được giới hạn trong `agent_foundation` boundary; business logic, prompts, validators, authorization và persistence tiếp tục thuộc các owner hiện hữu.

**Lý do**:

- StateGraph cung cấp state có kiểu, nodes và conditional edges minh bạch cho model/tool loops, giới hạn, failure routing và approval interruption.
- Một shared graph template nhỏ đáp ứng yêu cầu project về explicit state mà vẫn cho capability giữ workflow riêng.
- LangGraph có thể dùng độc lập; user không yêu cầu LangChain. Existing LLM clients/providers tiếp tục được gọi qua local port.
- Không cần `create_agent`, agent server, LangSmith hay multi-agent layer để triển khai yêu cầu này.

**Các phương án đã cân nhắc**:

| Phương án | Kết quả |
|---|---|
| Direct Python bounded loop + Pydantic | Ít dependency nhất nhưng không đáp ứng technical mandate dùng LangGraph; không chọn làm orchestrator |
| LangGraph `StateGraph` + custom typed model/tool adapters | **Chọn**; owner-mandated framework, control flow tường minh, giữ provider/domain boundaries |
| LangChain `create_agent`/prebuilt tool loop | Không chọn; bổ sung abstractions/provider integrations không cần thiết, giảm visibility vào project budgets/authorization; vẫn dựa trên LangGraph bên dưới |
| LangGraph + checkpointer cho mọi run | Không chọn; ghi state nhạy cảm mỗi super-step và thêm cost/storage không cần thiết cho request thông thường |
| LangGraph + checkpointer chỉ cho approval wait | **Chọn cho approval workflow**; resume đúng pending action sau human decision/restart, giới hạn dữ liệu và retention |

**Đánh đổi**:

- Thêm dependency/runtime, version compatibility và graph state schema cần quản lý.
- Node boundaries trở thành retry/resume boundaries; side effect trong node có thể chạy lại khi resume, phải đặt sau approval hoặc dùng idempotency.
- Cần test topology/conditional routes/terminal states và observability riêng; tests chỉ kiểm tra hàm domain là chưa đủ.
- Checkpointer thêm schema, service credentials, retention, cleanup và privacy review cho approval-only state.
- LangGraph không thay permission checks, budget policy, schema validation, API compatibility hoặc version fencing.

**Nguồn chính thức**:

- [LangGraph Graph API](https://docs.langchain.com/oss/python/langgraph/graph-api): StateGraph gồm state, nodes, edges; TypedDict/dataclass phù hợp cho state runtime; node là checkpoint/recovery unit.
- [LangGraph Interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts): `interrupt()` cần checkpointer và `thread_id`; resume qua `Command(resume=...)`; node được chạy lại từ đầu khi resume; side effects trước interrupt phải idempotent.
- [LangGraph Checkpointers](https://docs.langchain.com/oss/python/langgraph/checkpointers): checkpointer lưu state theo thread/super-step; PostgresSaver là production option cần package riêng; graph state/history phải được giới hạn và quản lý.
- [LangGraph Postgres saver setup](https://docs.langchain.com/oss/python/langgraph/add-memory#use-in-production): `PostgresSaver` dùng `langgraph-checkpoint-postgres` cùng psycopg; setup checkpoint tables được thực hiện rõ ràng trước khi compile/invoke graph.
- [LangGraph overview](https://docs.langchain.com/oss/python/langgraph/overview): LangGraph runtime không bắt buộc dùng LangChain.
- [LangChain agents](https://docs.langchain.com/oss/python/langchain/agents): prebuilt agent abstraction sử dụng LangGraph runtime; không cần thêm lớp này nếu project cần kiểm soát trực tiếp graph.

## Quyết định 2: StateGraph tách khỏi business logic/provider clients

**Quyết định**: Thêm local contracts/adapter cho Graph state, `AgentDefinition`, `ToolDefinition`, model invocation và safe errors. Graph nodes chỉ gọi các capability service/provider interfaces hiện hữu; không import NestJS business concerns, không truy cập trực tiếp bảng PostgreSQL của ứng dụng.

Graph cơ bản dùng các bước có ý nghĩa: `prepare → model decision → (tool dispatch → model decision)* → validate/finalize`. Dùng một tool-dispatch node có allowlist thay vì tạo node riêng cho mọi tool. Capability cung cấp prompt/schema/validator/workflow nodes riêng khi thật sự cần.

`GenerationProvider` không bảo đảm native function calling. Adapter dùng structured output khi provider hỗ trợ; nếu không, dùng typed decision envelope và validate/parse output trong local provider boundary. Model đề xuất tool name/input nhưng executor quyết định quyền, allowlist và side effect.

**Lý do**: Giữ Bedrock/Ollama và provider factory đang dùng; không chuyển prompts/CV grounding/RAG citations sang framework-specific types.

## Quyết định 3: Hai persistence mode, chỉ approval graph có checkpointer

### Execution thông thường

- StateGraph chạy request-scoped, compile không checkpointer.
- Process/worker restart làm run thông thường `INTERRUPTED`; retry là execution mới. Chat history và CV operation status tiếp tục do NestJS sở hữu.
- Không ghi `thread_id`/state thành conversation memory; không persistence cho run không approval.

### CV approval wait

- Dùng một graph boundary riêng, state tối thiểu chỉ có approval/run reference, operation/resource ID, version, action code, `approval_id`, expiry và graph-state version.
- Không đưa CV text, prompts, full messages, model output hoặc credentials vào graph/checkpoint. Draft `EDITOR_ONLY` hiện tại vẫn được lưu sau user generate action; approval graph gate chỉ publish/material write tương lai.
- LangGraph `interrupt()` pause graph; checkpointer bền vững giữ approval-pending state. Resume dùng cùng `thread_id`/approval reference và decision đã được NestJS authorize.
- Dùng `PostgresSaver` trong PostgreSQL hiện hữu; migration role provision checkpoint tables, runtime DB role chỉ được quyền CRUD trên các checkpoint tables, không đọc/ghi business tables. `setup()`/DDL không chạy trên request path. Đây là migration có chủ đích duy nhất cho durable approval wait, không phải generic execution store.
- Xóa checkpoint/thread khi approved/rejected/cancelled/expired; TTL cố định 24 giờ từ lúc approval tạo. Kiểm tra consent/resource version trước resume; audit decision/business status vẫn thuộc NestJS.
- Khi rollback, ngừng nhận approval workflow mới nhưng giữ resume/cancel handler cho pending threads đến khi chúng được giải quyết hoặc hết hạn; không để mất một approval đang chờ.

**Lý do**: LangGraph cần checkpointer và cùng thread ID để resume interrupt; không checkpoint graph generation chứa CV. Tách approval graph tránh serial hóa dữ liệu nhạy cảm và giữ exception hẹp cho quyết định không-resume trước đây.

**Đánh đổi**: Một migration checkpoint tables và cleanup operation là cần thiết; privacy test phải kiểm tra serializer/state thực tế chứ không chỉ logger.

**Các lựa chọn persistence đã cân nhắc**:

- `InMemorySaver`: chỉ dành cho unit/local tests; không đáp ứng resume sau restart.
- Redis/Valkey checkpointer: LangGraph có Redis integration, nhưng repository đang dùng Valkey cho Bull. Chưa xác minh compatibility/durability/eviction policy với deployment Valkey hiện tại; dùng chung có thể ảnh hưởng queue workload. Không chọn trong baseline.
- PostgresSaver: chọn cho approval checkpoint vì PostgreSQL hiện có và approval cần durability. Migration/bootstrap tạo checkpoint tables bằng migration role; AI runtime role chỉ có quyền CRUD trên checkpoint tables, không có quyền business tables. Chỉ graph approval reference-only được compile với saver.

## Quyết định 4: Approval contract nội bộ, không đổi public API trong Foundation

Foundation cung cấp internal `ApprovalRequest`/`ApprovalDecision` contract và resume boundary. NestJS xác thực user/session/ownership/consent, lưu business operation/audit và chỉ sau đó gọi resume với service-scoped permission. Không chấp nhận public `thread_id`, `actor_id` hoặc `approved=true` do model/client tự quyết.

Foundation không thêm giao diện approve/publish, không thay endpoint/status hiện có và không triển khai CV Agent. Feature CV Agent tương lai phải tích hợp luồng user-visible approval của NestJS với internal resume contract. Tài liệu `docs/current-ai-architecture.md` được yêu cầu nhưng thiếu; vì vậy không giả định một endpoint approval hiện hữu.

## Quyết định 5: Giữ compatibility, failure policy và rollback

- Existing Chat/CV routes, request/response DTOs, status codes, legacy fallbacks và persistence behavior không đổi; agent selection server-side, tắt mặc định theo capability.
- RAG/CV hiện tại tiếp tục legacy trong Foundation. Future adapters trả schema hiện tại (`RagGenerateResponse`, `CvDraft`).
- Agent graph failure không chạy legacy lần thứ hai trong cùng request. Rollback chuyển request mới về legacy; pending approval thread giữ nguyên xử lý/resume cho đến quyết định/expiry.
- Graph step/model/tool loops có per-capability step/call/deadline caps; LangGraph recursion limit là safety backstop, không thay application budget.
- Cancellation/provider timeout vẫn best-effort; tool/write được gọi sau approval phải idempotent và application service revalidates source/version/consent.

## Câu hỏi đã giải quyết / chưa giải quyết

- Human approval boundary: generate/regenerate hiện tại authorizes lưu draft `EDITOR_ONLY`; gate riêng cho publish/material write.
- Restart policy: run thông thường không resume; chỉ approval-pending graph checkpoint tối thiểu và resume cùng run sau restart.
- Shared/agent-specific split: common StateGraph/runtime/model/tool contracts; per-capability prompts, validators, workflow nodes và tool allowlist.
- API compatibility: không thay public APIs/statuses; approval resume là internal boundary, user-facing integration thuộc feature CV Agent.
- Chưa có yêu cầu jurisdiction-specific compliance hoặc latency/throughput SLO. Approval checkpoint retention đã được chốt là 24 giờ; không tự đặt compliance/SLO.
