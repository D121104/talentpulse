# Hợp đồng tích hợp: Career Chat Agent

## Phạm vi hợp đồng

Đây là thiết kế tích hợp nội bộ cho implementation plan. Không thêm public endpoint, không thay public candidate-assistant APIs và không thay internal RAG request/response. NestJS/application service vẫn là caller tin cậy, owner authorization/history/quota/persistence; FastAPI AI service vẫn sở hữu retrieval/generation/agent execution.

## Luồng hiện hữu giữ nguyên

1. Frontend gửi message bằng Candidate Assistant API hiện hành.
2. Application service xác minh role/session ownership/archive/consent/mode/CV reference, reserve quota, lưu user message idempotent và lấy bounded history.
3. `CandidateAssistantAiServiceClient` gọi internal RAG retrieve qua signed service client.
4. Application service hydrate canonical jobs từ retrieved IDs; nếu mode so sánh CV-job, gọi deterministic matcher; CV snapshot chỉ được tạo qua user CV owner service.
5. Client gọi internal RAG generate với `RagGenerateRequest`; AI generation route auth scope hiện hữu (`rag:generate`) vẫn là contract boundary.
6. FastAPI chọn legacy hoặc `rag.generate` agent server-side; response luôn là `RagGenerateResponse` hiện tại.
7. Application service bounds/validates response, lưu assistant message, commit quota hoặc map lỗi an toàn/release reservation.

## Internal request/response

### Request

Giữ type/schema `RagGenerateRequest` ở `ai-service/src/talentpulse_ai/modules/rag_chatbot/schemas.py`. Các trường chính:

| Field | Ý nghĩa/guard |
|---|---|
| `identity` | request/trace/attempt/message/user/session IDs đã chuẩn hóa; correlation, không tự cấp quyền |
| `normalized_user_message`, `intent`, `locale` | User turn, một trong 4 intent hiện hữu và output locale |
| `recent_history` | Tối đa 8 entries/6000 ký tự; application chỉ chuẩn bị/gửi history sau khi mode và CV consent/snapshot guard đã qua; không đọc history từ session CV khác |
| `filter_state`, `explicit_filters`, `policy` | Filter có kiểu; `data_scope=PUBLIC_ACTIVE_JOBS`, giới hạn candidate/context theo schema |
| `canonical_active_job_context` | Job facts đã hydrate bởi application service, tối đa 8 |
| `retrieval_evidence` | Tối đa 20 evidence results, job IDs phải có canonical context |
| `authorized_cv_snapshot`, `consent_version` | Bắt buộc/được phép theo intent CV, snapshot owner-authorized/sanitized |
| `matching_evidence` | Chỉ CV_JOB_COMPARISON; output deterministic matcher |

### Response

Giữ `RagGenerateResponse`: `request_id`, `trace_id`, `client_message_id`, `answer_status` (`COMPLETE`, `DEGRADED`, `NO_EVIDENCE`), `answer_blocks`, `claims`, `citation_keys`, `referenced_job_ids`, `filters`, `state_delta`, `degraded`, `source`, `fallbackReason`. FastAPI route status/error mapping hiện hữu tiếp tục giữ. NestJS message persistence vẫn lưu `blocks`, citations, filter/provenance hiện có.

## Foundation execution adapter

Capability ID: `rag.generate`.

`AgentRequest` được tạo server-side từ request đã validate:

- `run_id`: UUID mới cho mỗi request dispatch vào agent.
- `correlation_id`: trace/request ID hiện hữu.
- `capability_id`: hằng số `rag.generate`.
- `input`: domain request/context đã serialize có giới hạn; không chứa raw service token và không được tự nối vào model prompt.
- `authorized_context`: scope/capability, permission facts và request-scoped prepared snapshot phục vụ tool handlers; model không sửa được. Không dùng biến global/closure dùng chung để giữ dữ liệu user giữa runs.
- `prompt`: instructions/mode/locale/user turn/bounded eligible session history và tool catalog do capability tạo. History tối đa 8 entries/6000 ký tự. Application chỉ gửi CV-mode request sau khi CV snapshot/current consent được xác thực; mode không nhận CV không thể lấy history từ session CV khác, còn persisted history không bị xóa/sửa. Catalog lấy tool IDs/descriptions/input JSON schemas từ registry definitions hiện hành để tránh schema drift; hướng dẫn model trả một `ModelDecision` hợp lệ và gọi tool cần thiết. Không nhúng canonical job facts, retrieval evidence hoặc current CV snapshot vào prompt ban đầu; model phải lấy qua `rag.retrieve_context` khi cần evidence.
- `locale`: locale đã validate.

`AgentDefinition.output_model` xác thực final generation envelope. Adapter tiếp tục contextual validation bằng existing citation/claim/intent validators trước khi chuyển thành `RagGenerateResponse`. Agent `status/error/usage` không được expose thành chat message fields mới; map qua hiện trạng safe error/degraded handling.

Execution graph reuse `prepare → model_decision → tool_dispatch → model_decision → validate_finalize`, không checkpointer. Bounded policy của capability: tối đa 8 graph steps, 4 model decisions, 2 tool calls; deadline tối đa 24 giây. Rollout chỉ được bật khi internal AI HTTP timeout được cấu hình ít nhất 29 giây; nếu không, flag phải để off. Provider mỗi call phải nhận remaining 24-second deadline; Bedrock cần timeout-aware agent client riêng, legacy client giữ nguyên.

## Tool contracts

Mỗi tool dùng `ToolDefinition`/`ToolRegistry`/`ToolDispatcher` của Foundation. Schema dùng Pydantic strict, extra fields bị cấm. Không có write tool.

### `rag.retrieve_context`

| Thuộc tính | Hợp đồng |
|---|---|
| Capability | `rag.generate` |
| Operation | `rag:generate` trong authenticated internal request boundary |
| Effect | READ_ONLY |
| Input | Empty/closed object; model không tự truyền user/CV/job IDs |
| Output | Context đã chuẩn bị: canonical jobs và retrieval evidence đã pair; filter state; CV snapshot chỉ khi intent+consent cho phép, giới hạn theo schema hiện tại |
| Handler | Đọc từ immutable per-request `RagGenerateRequest`, không truy cập Qdrant/SQL hoặc gọi service ngoài |
| Denial | Capability mismatch, invalid selector/schema hoặc authorization/context invariant fail thì dispatcher dừng trước handler |
| Data handling | Trả subset tối thiểu; tool result được gắn là untrusted data trong model context; không log raw input/output. JOB_SEARCH/CV modes yêu cầu tool thành công trước final; ADVICE có thể trả advice chung không khẳng định job/CV facts mà không đọc context |

### `career.read_matching_evidence`

| Thuộc tính | Hợp đồng |
|---|---|
| Capability | `rag.generate` |
| Operation | `rag:generate` trong authenticated internal request boundary |
| Effect | READ_ONLY |
| Input | Empty/closed object; model không truyền CV/job IDs hoặc tự chọn principal |
| Output | Matching evidence xác định đã được request chuẩn bị: CV/job IDs, score/signals/gaps theo schema hiện tại |
| Handler | Chỉ trả `matching_evidence` từ request; chỉ cho intent `CV_JOB_COMPARISON`; không gọi matcher hoặc business store |
| Denial | Sai mode, thiếu/mismatch evidence, schema sai hoặc authorization fail thì dispatcher dừng; không tự tính lại score |
| Data handling | Không trả CV text nếu không cần; không log input/output; tool result là untrusted data, score vẫn được final validator đối chiếu với request |


Không đăng ký tool khác cho đến khi một use case hiện hữu chứng minh cần thiết. Không expose CV selection, session/history persistence, job DB reads, match score recalculation, publish/write hay arbitrary HTTP/SQL.

## Grounding/validation contract

- Prompt instructions, locale and mode-specific rules được reuse/tách từ `generation/prompt_builder.py` và prompt `qa_v1.txt`; user/history ở prompt ban đầu vẫn là untrusted input, còn canonical job/CV/retrieval JSON của request hiện tại chỉ được nối sau tool call và vẫn là untrusted data.
- Job facts chỉ từ canonical context; search results dùng retrieved evidence và citations paired. Unknown job/citation/reference bị reject.
- CV_JOB_COMPARISON dùng `matching_evidence` đã tính; không để model thay score/skills/gaps. CV_ANALYSIS chỉ dựa snapshot authorized.
- Multi-step tool loop chỉ ghép hai prepared-context reads (RAG context rồi matching evidence); không có tool business side effect hoặc query tùy ý.
- Capability adapter ghi nhận tool IDs vào audit set chỉ tồn tại trong request; trước final, bắt buộc context tool cho JOB_SEARCH/CV modes và cả context+matching tools cho CV_JOB_COMPARISON. Không tin `usage.tool_calls` đơn thuần để suy ra tool nào chạy.
- Tool handlers đọc typed values từ `ToolExecutionContext.authorized_context` (hoặc immutable request-scoped binding), validate lại intent/IDs trước trả output; registry/handler không giữ state của request sau execution.
- Reuse `generation/citations.py`, existing validators/review and deterministic fallback. Agent final phải đi qua adapter validation; không trả raw ModelDecision thẳng ra caller.
- Grounding review sau graph chỉ chạy các nhánh cần thiết, tối đa một review call cho claim set; truyền remaining total-request deadline cho provider. Nếu không còn budget hoặc review không pass, dùng deterministic degraded fallback hiện có.
- Nếu agent final output không hợp lệ, cho phép tối đa một lần sửa có giới hạn trong cùng execution và chỉ khi còn budget. Nếu lần sửa thất bại hoặc không còn budget, trả deterministic fallback trạng thái `DEGRADED`/`NO_EVIDENCE` khi có thể tạo câu trả lời an toàn; nếu không, trả controlled error. Không trả claim/citation không hợp lệ, không có vòng sửa lặp và không retry cùng request bằng legacy `GenerationService`.

## Authorization/privacy boundary

- NestJS/application service là nơi xác minh actor, session ownership, consent, CV ownership/version, quota và business job context trước AI calls.
- FastAPI internal route tiếp tục yêu cầu authenticated service identity/scope hiện tại. `ToolAuthorizer` không tin model/client; nó kiểm tra operation/capability và trusted request invariants.
- Không cho AI service truy cập PostgreSQL business tables hoặc gọi internal owner services không có contract.
- CV snapshot/history chỉ tồn tại cần thiết trong request/model prompt hiện tại; không checkpoint, cache xuyên request hoặc log nội dung.
- Mode của session là cố định. Application service xác thực CV mode/consent/snapshot trước khi history được nạp vào AI request; request không hợp lệ dừng trước AI call, non-CV mode không nhận CV context hoặc history từ session CV khác. Persistence history không bị xóa/sửa vì quy tắc này.
- Client disconnect, timeout và process interruption được phát hiện là cancellation triggers. Sau khi user message đã được nhận, application service giữ user message `COMPLETED`, đánh dấu assistant response `FAILED`, release quota reservation đúng một lần và bỏ kết quả model/tool đến muộn; kết quả đó không được persist hay commit quota. Recovery sau restart dùng lease bền vững có owner/expiry; execution gia hạn mỗi 10 giây, lease có TTL 30 giây cộng grace 5 giây, reconciler định kỳ chạy mỗi 15 giây và phải terminalize orphan trong 50 giây từ lần gia hạn cuối khi runtime/database khỏe. Việc terminalize và quota/message transition dùng cập nhật nguyên tử có điều kiện. Interrupted execution không tự resume/replay. Thử abort outbound transport khi hỗ trợ, nhưng không đảm bảo provider dừng inference đã bắt đầu.
- Tool/provider exception chỉ trả `AgentError`/safe service error; không serialize traceback/provider payload.

## Selection, errors và rollback

- Selector được cấu hình với registered capability `rag.generate` và `agent_enabled_capabilities` server-side. Client payload không điều khiển selector.
- Legacy path là mặc định khi flag off hoặc capability chưa đăng ký.
- Chọn một implementation một lần trước execution. Agent-dispatched request thất bại trả safe error/degraded theo contract; không cùng-request fallback sang legacy.
- Rollback tắt flag; request tiếp theo về legacy. Nếu cần migration tối thiểu cho lease, migration phải backward-compatible và có rollback đã kiểm thử; không làm mất trạng thái request/quota đang hoạt động.
- LangGraph/Provider/model tool errors map sang error taxonomy của Foundation, sau đó qua existing RAG/API error mapping.

## Integration tests cần chứng minh

- Request/response JSON schema và HTTP status của internal RAG route không đổi.
- NestJS loopback giữ signed `rag:retrieve`/`rag:generate` scope, canonical hydration, context/evidence pairing và response fields.
- Agent flag off/unregistered chọn legacy; flag on+registered chọn agent; error không chạy legacy lần hai; rollback áp dụng request kế tiếp.
- Synthetic CV marker không xuất hiện logs/errors; cross-capability/unknown tool và bad schema không gọi handler.
- Cancellation/late-result integration xác nhận message `FAILED`, quota release đúng một lần và không lưu assistant response đến muộn; “100%” security/grounding criteria áp dụng trên toàn bộ synthetic fixtures duy trì trong test suite.
