# Hợp đồng execution và tool

## Ranh giới hợp đồng

Đây là hợp đồng nội bộ giữa module AI capability và Agent Foundation trong FastAPI AI service, không phải endpoint HTTP công khai mới. Các router NestJS/FastAPI đang dùng tiếp tục giữ nguyên request, response, status code và authorization boundary. Human-approval resume là internal service contract; giao diện/API người dùng thuộc feature CV tương lai.

## Hợp đồng thực thi chung

### Request

Host tạo request sau khi application service đã xác minh caller, consent và tài nguyên. Các policy/allowlist được nạp từ cấu hình capability đáng tin cậy, không lấy từ model output hoặc field do client tùy ý đặt.

| Field | Kiểu logic | Ghi chú |
|---|---|---|
| `run_id` | UUID | ID của một lần chạy, sinh ở server |
| `correlation_id` | string/UUID | Liên kết request với trace/operation hiện hữu |
| `capability_id` | string | Khóa registry đã được cho phép |
| `input` | object theo input contract của capability | Chat/CV schemas hiện hành được tái sử dụng; không gộp thành một schema nghiệp vụ chung |
| `authorized_context` | object giới hạn | Chỉ ID/snapshot/resource đã được application service cấp quyền; không chứa raw auth token |
| `locale` | optional locale string | Khi capability hiện tại đã hỗ trợ locale |

Execution policy không nằm trong input tin cậy từ user. Runner lấy policy và tool allowlist theo `capability_id`.

### StateGraph

Mỗi agent definition cung cấp một `StateGraph` với state schema có kiểu. Dùng `TypedDict` cho channels runtime và Pydantic schemas tại ranh giới request/tool/result. Shared nodes tối thiểu là prepare, model decision, tool dispatch, validation/finalize; conditional edges điều khiển bounded loop. Capability chỉ thêm node khi có domain boundary, nhánh hoặc approval interrupt thực sự cần.

Execution thường compile không checkpointer. Approval workflow dùng một graph/state schema tách biệt, compile với persistent checkpointer; state graph đó chỉ chứa references/version/action metadata và không chứa prompt, CV hay model conversation.

### Model decision envelope

Model đề xuất một trong hai dạng; đây là output không đáng tin cậy và luôn phải validate:

```json
{
  "kind": "tool_call",
  "tool_call_id": "call-uuid",
  "tool_id": "registered-tool-id",
  "input": {}
}
```

hoặc:

```json
{
  "kind": "final",
  "output": {}
}
```

Unknown `kind`, `tool_id` không nằm trong allowlist, schema sai hoặc output không đạt output contract không được dispatch/persist. Có thể repair parse/domain output chỉ khi capability policy cho phép và mọi lần gọi còn trong shared budget. Model output không được thay execution policy hoặc authorization context.

### Result

| Field | Kiểu logic | Ghi chú |
|---|---|---|
| `run_id` | UUID | Echo correlation của execution |
| `status` | `COMPLETE`, `FAILED`, `CANCELLED`, `INTERRUPTED`, `AWAITING_APPROVAL` | `AWAITING_APPROVAL` là paused status; terminal states không resume, trừ approval-pending graph |
| `output` | object theo output contract của capability | Chỉ có khi có kết quả được chấp nhận; `DEGRADED` vẫn thuộc schema nghiệp vụ hiện hành |
| `error` | `{code, safe_message, retryable}` hoặc null | Không có stack trace, prompt hay dữ liệu CV |
| `usage` | `{steps, model_calls, tool_calls, elapsed_ms}` | Metadata vận hành, không chứa nội dung model |
| `trace` | Correlation ID và child span references | Liên kết model/tool spans; không chứa prompt, CV hoặc payload |

Các error code nội bộ cần ổn định tối thiểu: `INVALID_INPUT`, `TOOL_NOT_ALLOWED`, `PERMISSION_DENIED`, `PROVIDER_ERROR`, `TOOL_ERROR`, `EXECUTION_LIMIT_EXCEEDED`, `CANCELLED`, `INTERRUPTED`, `OUTPUT_INVALID`. Adapter ánh xạ chúng sang hành vi lỗi/degraded hiện có; không công khai stack/provider payload.

`INTERRUPTED` chỉ có thể được báo khi caller/worker phát hiện run bị ngắt. Nếu process bị kill đột ngột, run-local state không thể ghi terminal result; synchronous caller có thể chỉ nhận transport failure. Với CV, NestJS tiếp tục dùng redelivery detection hiện tại cho execution thường. Ngoại lệ là approval-pending graph có checkpointer và được resume theo cùng thread ID.

## Hợp đồng human approval

Approval chỉ gate publish/material write. User-triggered generate/regenerate hiện có tiếp tục cho phép lưu draft `EDITOR_ONLY` và không đi qua interrupt.

| Hợp đồng | Trường tối thiểu | Ràng buộc |
|---|---|---|
| `ApprovalRequest` | `approval_id`, `operation_ref`, `resource_ref`, `expected_version`, `action_code`, `expires_at` | `expires_at` là UTC, cố định 24 giờ từ lúc tạo; không mang CV text/prompt; action phải nằm trong allowlist |
| `ApprovalDecision` | `approval_id`, `decision` (`APPROVE`/`REJECT`), `decision_id`, `actor_ref` | Chỉ được tạo sau khi NestJS xác thực actor/ownership/consent; idempotent; client/model không gọi thẳng checkpoint store |
| `ApprovalResume` | `approval_id`, validated decision, authorization context từ trusted caller | Tìm checkpoint theo ID; kiểm tra pending/expiry/version/consent; truyền resume value cho cùng LangGraph `thread_id` |
| `ApprovalCheckpoint` | StateGraph snapshot chứa approval/resource refs, expected version, action code, graph schema version | Checkpointer riêng; không chứa CV text, prompts, full messages hay model output; xóa sau approve/reject/cancel/expiry |

Foundation chỉ cung cấp graph gate và internal resume contract. Không thêm public approve endpoint hoặc frontend flow hiện tại; feature CV Agent tương lai nối UI/application approval action vào contract này.

Khi NestJS và FastAPI cần giao tiếp qua process boundary, internal route đề xuất là:

```text
POST /internal/v1/agent-executions/{approval_id}/resume
Authorization: service JWT với scope agent:resume
```

Request body gồm `decision_id`, `decision`, `operation_ref` và `expected_version`. `actor_ref` không được tin từ body; NestJS xác thực actor và lưu audit trước khi gọi route. `approval_id` lấy từ pending operation phía server, không nhận từ model/client. Kết quả chỉ trả `run_id` cùng `RESUMED`, `REJECTED` hoặc safe error; không trả checkpoint/CV nội dung. `404` dùng cho reference không tồn tại hoặc không thuộc caller scope, `409` cho expired/non-pending/stale version. Approval hết hạn sau 24 giờ và không thể gia hạn bằng cách gửi lại decision. Route nội bộ này không đổi public API và chưa được gọi bởi Chatbot/CV legacy routes.

### Hợp đồng capability tương lai

| Adapter tương lai | Input | Output | Phần vẫn do module hiện có sở hữu |
|---|---|---|---|
| Career Chat Agent | Request/context của generation RAG hiện có sau retrieval/canonical hydration/matching | `RagGenerateResponse` hiện có, gồm answer blocks, citations, filters/state delta và provenance | NestJS session, consent, quota, lịch sử; RAG retrieval, canonical job context, deterministic match và citation validation |
| CV Generation Agent | `CvDraftRequest` hiện có, gồm snapshot/versions/locale/consent metadata | `CvDraft` hiện có với provenance và `EDITOR_ONLY` | Queue/status/cancel, stale/consent/version rechecks và persist draft thuộc NestJS; prompt/grounding/localization/fallback thuộc CV module |

Foundation chỉ cung cấp seam để các adapter này dùng sau này. Hai agent hoàn chỉnh và thay đổi router/API không nằm trong phạm vi này.

## Hợp đồng tool

Tool definitions có thể tái sử dụng, nhưng capability đăng ký allowlist riêng. Foundation chỉ cung cấp contract/dispatcher; không bao gồm catalog tool nghiệp vụ hoặc quyền ghi dữ liệu.

Mỗi tool definition gồm:

| Field | Quy định |
|---|---|
| `tool_id` | Tên ổn định, được registry nhận diện |
| `description` | Mục đích/giới hạn dễ hiểu cho model; không cấp quyền |
| `input_schema` | Schema có kiểu; validation trước handler |
| `output_schema` | Schema có kiểu; validation sau handler |
| `allowed_capabilities` | Allowlist theo capability; không mặc định mọi tool dùng được ở mọi agent |
| `required_operation` | Quyền cần kiểm tra tại application boundary |
| `timeout` | Thời hạn một lần gọi; không thể vượt execution deadline |
| `side_effect_class` | Read-only hoặc thao tác ghi qua luồng nghiệp vụ được kiểm soát; foundation không có arbitrary database write |

Một tool invocation có `tool_call_id`, `tool_id`, `input` và kết quả có kiểu hoặc error code. Trình dispatch phải kiểm tra capability allowlist, quyền đã được ủy quyền, input schema và budget trước khi gọi handler; sau khi gọi phải kiểm tra output schema và làm sạch lỗi. Tool không được nhận quyền bằng cách đọc chỉ dẫn từ CV/job/retrieved text.

Các tool đọc dữ liệu nghiệp vụ chỉ hoạt động trên snapshot đã xác thực hoặc boundary/API do service sở hữu dữ liệu cung cấp. FastAPI agent không được truy cập trực tiếp PostgreSQL để bỏ qua authorization của NestJS. Foundation kiểm thử bằng handler giả lập; tool nghiệp vụ cụ thể được thêm bởi capability migration sau này.

## LLM integration

Foundation dùng một model port chung để gọi provider/configuration hiện có, truyền prompt/schema có kiểu, timeout/budget và nhận output/usage/error đã chuẩn hóa. Adapter tái sử dụng `GenerationProvider` và `StructuredGenerationProvider` hiện hành nếu chúng đáp ứng contract; provider không được giả định có native tool-calling API chung. Không tạo client mới cho từng agent và không ép đổi provider. Tác vụ nghiệp vụ vẫn cung cấp prompt, output schema và policy riêng.

## Retry, fallback và rollback

- Runner giới hạn số bước, model calls, tool calls và tổng thời gian theo execution policy.
- Repair/retry nghiệp vụ chỉ xảy ra theo policy của capability và dùng chung budget; runner không tự nhân đôi retry.
- Lỗi agent không khởi chạy implementation legacy lần thứ hai trong cùng request.
- Capability flag mặc định chọn legacy. Tắt agent áp dụng cho request kế tiếp; request đã dispatch không chuyển implementation giữa chừng.
- Fallback/degraded response bên trong chatbot/CV giữ nguyên theo từng capability; không đồng nghĩa fallback từ agent sang legacy.
- NestJS giữ trạng thái queue, version fence, cancellation và persistence. Agent result tới muộn sau terminal/cancelled/stale operation không được phép ghi dữ liệu nghiệp vụ.
- `interrupt()` chỉ dùng trong approval graph có checkpointer và `thread_id`. Approval node không thực hiện write trước interrupt; khi resume node bắt đầu lại từ đầu, vì vậy write sau approve tách node và dùng idempotent operation ID.
- Checkpointer production dùng PostgreSQL hiện có với service DB role chỉ được quyền vào các checkpoint tables; đây là operational execution state, không phải business data access. Tools vẫn chỉ đọc/ghi business data qua owner service.
- Approval checkpoint có TTL/cleanup. Rollback dừng graph mới nhưng giữ resume/cancel handling cho pending approval threads đến khi được giải quyết hoặc hết hạn; graph schema/nodes đang được pending threads dùng phải được giữ tương thích.
