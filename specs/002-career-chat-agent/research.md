# Research: Career Chat Agent

## Căn cứ đã kiểm tra

- Đặc tả: `specs/002-career-chat-agent/spec.md`.
- Architecture baseline và giới hạn tích hợp: `docs/architecture/agent-foundation-integration.md`.
- Foundation contracts/runtime: `specs/001-agent-foundation/contracts/agent-execution.md`, `ai-service/src/talentpulse_ai/agent_foundation/{contracts,execution,model,tools,policy,observability,selector}.py`.
- Composition/provider: `ai-service/src/talentpulse_ai/{main,dependencies}.py`, `infrastructure/provider_factory.py`, `modules/rag_chatbot/schemas.py`.
- Chat ownership/flow: `backend/src/candidate-assistant/{candidate-assistant.controller.ts,candidate-assistant.service.ts,candidate-assistant-ai.client.ts,candidate-assistant.types.ts}`.
- RAG components: `ai-service/src/talentpulse_ai/modules/rag_chatbot/{router.py,service.py,retrieval/,generation/}`.
- Compatibility references: `frontend/src/lib/assistantApi.ts`, `ai-service/tests/integration/test_chat_api.py`, `backend/tests/candidate-assistant/candidate-assistant-ai.loopback.integration.spec.ts`.

## Luồng hiện tại

`Frontend → CandidateAssistantController/Service → auth/session/consent/quota/history/CV snapshot → CandidateAssistantAiServiceClient.retrieveRag → canonical job hydration và optional deterministic CV matching → generateRag → FastAPI RagGenerateRequest → GenerationService → RagGenerateResponse → lưu message/commit quota`.

NestJS `CandidateAssistantService` hiện giới hạn history thành 8 entries/6000 ký tự trước khi chuyển; AI schemas cũng giới hạn `recent_history` 8/6000. Candidate Assistant client giữ flow đồng bộ và lưu assistant blocks/citations/filter state/provenance. AI service retrieval chỉ hỗ trợ `PUBLIC_ACTIVE_JOBS`. Generation giữ các prompt locale/mode, output schemas, citation validation, grounding review, một repair attempt và deterministic fallback.

Foundation đã có `StateGraph` bounded executor, `AgentModelAdapter`, tool registry/dispatcher, capability selector và redacted observations. Thực thi thường không checkpoint. Hiện selector được compose nhưng registry mặc định rỗng; RAG generate route gọi trực tiếp `GenerationService`, chưa dispatch qua selector/executor. Không có business tools.

## Quyết định kỹ thuật

### Dùng đúng runtime/contract của Foundation

**Quyết định**: Capability adapter trong `rag_chatbot` tạo `AgentDefinition`, `AgentRequest`, model adapter và `ToolDispatcher`, sau đó gọi `execute_agent` hiện hữu. Không tạo graph framework, agent loop, checkpointer hoặc model client riêng.

**Lý do**: Foundation đã được triển khai/kiểm thử và là architecture baseline; route cần thêm adapter/wiring chứ không cần runtime mới.

**Lựa chọn khác**: Thay Foundation hoặc thêm framework khác bị loại vì trùng execution/budget/tool logic và vi phạm yêu cầu.

### Route seam và rollout

**Quyết định**: Dùng cùng internal `/internal/v1/rag/generate` request/response. Gọi capability selector đúng một lần ở FastAPI composition/route boundary; agent chỉ được chọn khi `rag.generate` đã registered và server flag bật. Legacy `GenerationService.generate` tiếp tục là branch mặc định.

**Lý do**: NestJS AI client đã có signed service transport/scope; thay route hoặc frontend không cần thiết. Không bật flag riêng khi registry chưa có capability.

### Prompt, domain validation và provider

**Quyết định**: Reuse mode/locale instructions và strict `ProviderGeneration`/`RagGenerateResponse` schemas hiện có; prompt mở đầu không chứa current request's canonical CV/job/retrieval facts. History tối đa 8 entries/6000 ký tự; application xác thực mode và CV consent/snapshot trước khi nạp history vào AI request. Session có mode cố định; CV-mode request không hợp lệ dừng trước AI call và non-CV mode không lấy history từ session CV khác. Persisted history không bị xóa/sửa. Agent dùng `AgentModelAdapter` bọc provider đã compose; capability adapter thực hiện contextual validation/citation pairing với request gốc rồi ánh xạ sang response hiện tại. Grounding reviewer hiện hữu được tái sử dụng có giới hạn dưới tổng request deadline. Với final output không hợp lệ, cho phép tối đa một lần sửa khi còn budget, sau đó deterministic fallback trạng thái degraded/no-evidence nếu có thể tạo câu trả lời an toàn, nếu không thì controlled error; claim/citation sai không được trả và không retry qua legacy trong cùng request. Không đưa prompt/CV/history vào telemetry.

**Lý do**: Prompt builder đã tách/đánh dấu dữ liệu không tin cậy; validator bảo vệ citations, canonical jobs, matching score, language và deterministic fallback. Foundation model port chuẩn hóa provider errors/structured output. Giới hạn một lần sửa giữ parity với hành vi generation hiện hữu mà không tạo unbounded retry.

**Lựa chọn khác**: Copy prompt/schema vào module agent hoặc dùng LLM native tool calling bị loại vì prompt divergence và provider contract không chung native tools.

### Tool surface nhỏ và capability-owned

**Quyết định**: Chỉ đăng ký hai read-only tools cho `rag.generate`: `rag.retrieve_context` đọc prepared job/CV/evidence context và `career.read_matching_evidence` đọc deterministic CV-job match đã có. Cả hai nhận object input rỗng/đóng (không nhận ID tùy ý), giới hạn theo request/mode và không thực hiện query/tính score. Prompt đầu vào không chứa canonical job/CV/retrieval facts; factual/CV modes phải gọi context tool trước final; comparison chỉ được đọc matching tool trong mode phù hợp. Không truy cập PostgreSQL/Qdrant trực tiếp từ model, không tạo tool ghi.

**Lý do**: RAG semantic retrieval và CV matching đã chạy trước `/rag/generate`; application service hydrate canonical job/CV/matching evidence trước đó. Exposing prepared evidence dưới tool boundaries cho phép agent chọn và phối hợp nhiều bước context read mà không lặp retrieval/matching, thêm callback service-to-service hoặc vượt ownership.

Tool handlers là stateless, lấy snapshot typed từ `ToolExecutionContext.authorized_context` của run hiện tại, không giữ per-user state trong registry/global variable. Capability adapter giữ tool invocation audit riêng cho run để buộc tool prerequisite theo intent.

**Ranh giới scope**: `rag.retrieve_context` truy xuất prepared retrieval context; nó không khởi tạo vector search mới bên trong graph. `career.read_matching_evidence` chỉ đọc matching result đã được tính. Điều này giữ nguyên retrieve→canonical hydration→matching trước `/rag/generate` như FR-022 và tránh internal callback/API mới. Model-triggered Qdrant search và contract hydration hai giai đoạn nằm ngoài scope đã chốt.

### State/history và lifecycle

**Quyết định**: Chat history là application-owned context, giới hạn 8 entries/6000 ký tự và chỉ được nạp sau mode/consent/CV snapshot guard tại application boundary. Mỗi message là agent execution mới; status/lưu message/quota do ứng dụng quản lý. Client disconnect/timeout hoặc process interruption được phát hiện sau khi nhận user turn giữ user message COMPLETED, đánh assistant message FAILED, release quota reservation đúng một lần và bỏ model/tool result đến muộn trước persistence/commit; execution không tự resume/replay. Thử abort outbound transport khi có thể, nhưng provider inference cancellation không được bảo đảm. LangGraph state chỉ giữ state request-scoped cần để bounded tool loop.

**Lý do**: Foundation không phải session store; đặc tả yêu cầu giữ ownership/history/API hiện có. Không dùng approval checkpointer cho chat.

### Tool safety và lỗi

**Quyết định**: Tool allowlist riêng capability, schema input/output đóng, authorizer dựa trên authenticated `rag:generate` service boundary cùng trusted request context. CV invariant/consent đã được NestJS kiểm tra; agent chỉ dùng snapshot gắn với request. Unknown/denied/invalid tool dừng safe. Capability adapter ánh xạ AgentError sang error/fallback hiện có; không auto-fallback sang legacy cùng request.

**Timeout/budget**: Foundation defaults là 16 steps/4 model calls/2 tool calls/30s; RAG generator có provider steps với timeout 60s/30s, AI transport có production default 30s và local/test default 180s. Product owner đã xác nhận agent budget tối đa 24s và transport tối thiểu 29s là release gates, không phải latency SLO. `AgentModelAdapter` chỉ truyền timeout cho provider có `generate_structured`; production `BedrockNovaGenerationAdapter` chỉ có `generate(prompt)`, nên deadline hiện bị bỏ qua ở provider call. Đây là blocker production. **Focused change**: thêm timeout-aware agent call cho Bedrock bằng client agent-specific có `read_timeout` bounded theo tổng request deadline; `AgentModelAdapter` dùng method này hoặc từ chối provider thiếu timeout contract (fail-closed). Giữ legacy Bedrock client/branch nguyên trạng. Capability policy giới hạn steps/model/tool calls; grounding review nhận remaining request time. Foundation không dừng handler đồng bộ, vì vậy tool chỉ đọc prepared in-memory context, không thực hiện I/O/provider call. HTTP abort có thể kết thúc transport phía NestJS nhưng không chứng minh Bedrock/provider đã dừng inference.

Hợp đồng timeout-aware cần được chứng minh với fake provider (timeout được truyền) và client-factory test (Bedrock agent client được dựng với timeout bounded); nếu provider không đáp ứng thì selector không được chọn agent. Vì AWS synchronous call không có cancel API trong contract hiện tại, deadline thực tế cần đảm bảo transport read timeout của mỗi provider call không lớn hơn remaining request budget; timeout aggregate phải được đo/test trước rollout.

**Telemetry**: `AgentExecutionObservation` ghi model/tool call counts của graph. Generation validation/fallback events hiện ghi correlation/attempt/stage/code. Giữ hai nhóm event phân biệt và nối bằng request/trace IDs; không tuyên bố AgentUsage là tổng số mọi provider calls ngoài graph.

## Compatibility và phạm vi

- Public candidate assistant API, NestJS DTO/session/message persistence, frontend API types, status/error fields, citation/block shape không đổi.
- “100%” grounding, authorization và tool-denial success criteria được đánh giá trên toàn bộ synthetic fixtures duy trì trong test suite; không diễn giải thành cam kết về mọi request production.
- Internal `/rag/retrieve` và `/rag/generate` contracts giữ nguyên. Agent chỉ thay implementation của `/rag/generate` khi được bật.
- CV analysis/comparison tiếp tục dùng authorized snapshot, consent/version và deterministic matching evidence; không thực hiện CV write hoặc approval flow.
- Không thêm execution store hay new source; ưu tiên persistence request/quota hiện hữu cho lease. Nếu cần schema migration tối thiểu, phải có compatibility tests và rollback trước rollout. Qdrant remains derived public-active-job index, PostgreSQL remains canonical.
- Một failure sau agent dispatch không chạy legacy cùng message request; flag-off chuyển request tiếp theo về legacy.

## Kết luận research

Không còn unknown framework, provider, API owner, history storage, tool scope hoặc test command cần quyết định trước implementation. Timeout/provider limitation có focused change và test gate tại `plan.md`; không dùng provider thiếu timeout contract. FR-022 đã chốt semantic retrieval/canonical hydration ở host flow hiện hữu, nên không còn product ambiguity về việc agent có tự gọi vector search hay không.
