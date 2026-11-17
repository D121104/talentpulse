# Đặc tả tính năng: Career Chat Agent

**Feature Branch**: `refactor/ai-gen-cv`

**Created**: 2026-11-17

**Status**: Draft

**Input**: User description: "Từng bước chuyển chatbot TalentPulse hiện có thành trợ lý nghề nghiệp dùng Agent Foundation, giữ hội thoại nhiều lượt, RAG có căn cứ, công cụ được cấp quyền và tương thích API/frontend hiện hành."

## Clarifications

### Session 2026-11-17

- Q: Thời hạn agent 24 giây và timeout transport tối thiểu 29 giây là điều kiện kỹ thuật trước khi rollout, hay là mục tiêu latency sản phẩm? → A: Đây là điều kiện kỹ thuật trước rollout, không phải SLO sản phẩm.
- Q: Spec có nên chốt giới hạn history hiện tại là tối đa 8 entries và 6000 ký tự không? → A: Có; quy định giới hạn tối đa 8 entries/6000 ký tự trong spec.
- Q: Nếu claim không được bằng chứng hỗ trợ hoặc citation không hợp lệ sau lần sửa duy nhất, nên trả fallback an toàn hay luôn trả lỗi? → A: Trả deterministic fallback ở trạng thái degraded/no-evidence nếu có thể; nếu không thể tạo câu trả lời an toàn thì trả controlled error. Không trả citation không hợp lệ.
- Q: Nếu consent CV bị thu hồi hoặc mode hiện tại không cho dùng CV, agent có được nhận history cũ chứa thông tin suy ra từ CV không? → A: Không; application service từ chối CV request trước khi nạp history vào AI context, còn non-CV mode không đọc history từ CV session khác. Persisted history không bị xóa hoặc sửa.
- Q: Nếu request bị hủy nhưng model hoặc tool trả kết quả muộn, trạng thái message, quota và kết quả muộn nên được xử lý thế nào? → A: User message giữ `COMPLETED`, assistant response chuyển `FAILED`, quota được giải phóng đúng một lần và kết quả đến muộn không được persist hoặc commit.
- Q: Tiêu chí “100%” về grounding, authorization và từ chối tool trái phép có nên áp dụng cho toàn bộ fixture kiểm thử tổng hợp được duy trì trong test suite không? → A: Có; tính trên toàn bộ fixture tổng hợp trong test suite, không suy rộng thành bảo đảm cho mọi request production.
- Q: Nếu ứng viên muốn đổi từ một mode chatbot sang mode khác, họ nên tiếp tục trong session hiện tại hay bắt đầu session mới? → A: Bắt đầu session mới; mode của session bất biến và history không chuyển giữa các mode.
- Q: Chatbot nên xử lý thế nào khi retrieval không tìm thấy evidence, evidence không khớp canonical job context, hoặc retrieval/hydration service bị lỗi? → A: Evidence rỗng hoặc bị loại vì không hợp lệ dẫn đến `NO_EVIDENCE` và fallback an toàn; lỗi retrieval/hydration dẫn đến `DEGRADED` hoặc controlled error. Không trả citation không xác minh được.
- Q: Nếu worker/service restart làm gián đoạn một lượt đang chạy, trạng thái message, quota và kết quả muộn nên được xử lý thế nào khi interruption được phát hiện? → A: Không resume/replay; user message giữ `COMPLETED`, assistant response chuyển `FAILED`, quota được giải phóng đúng một lần và late result bị bỏ.
- Q: Validator nên xử lý citation bị lặp, malformed hoặc trỏ sang job khác như thế nào? → A: Deduplicate citation key lặp chính xác; citation malformed/không tồn tại/cross-job làm claim không hợp lệ, kích hoạt tối đa một repair rồi safe fallback/error nếu không sửa được.
- Q: Ngoài việc không đặt latency SLO mới, migration này có giữ nguyên availability và scale targets hiện có thay vì đặt mục tiêu mới không? → A: Có; giữ operational baseline hiện hành và không thêm SLO availability/throughput/scale cho migration.
- Q: Client disconnect khi chatbot đang chờ AI có được xem là cancellation không? → A: Có; giữ user message `COMPLETED`, đánh assistant response `FAILED`, giải phóng quota và bỏ kết quả muộn.
- Q: Cancellation khi client disconnect có phải đảm bảo provider dừng inference không? → A: Không; hệ thống cố truyền abort khi transport hỗ trợ, nhưng chỉ cam kết không persist/commit kết quả muộn.
- Q: Sau khi một instance khởi động lại, cơ chế nào nên xác định request bị gián đoạn mà không đánh nhầm request vẫn đang chạy ở instance khác? → A: Dùng lease bền vững có owner và thời điểm hết hạn gắn với request; reconciler chỉ kết thúc request sau khi lease hết hạn và cập nhật trạng thái/quota nguyên tử, không resume/replay.
- Q: Những nhóm trường hợp nào plan nên nêu rõ trong chiến lược kiểm thử grounding để khớp với spec và tasks? → A: Đồng bộ đủ empty/filtered evidence, retrieval hoặc canonical-hydration failure, citation duplicate deduplication, malformed/unknown/unpaired/cross-job rejection và hành vi sau repair thất bại/hết budget.
- Q: Nếu persistence hiện tại không lưu được lease bền vững, phạm vi triển khai nên xử lý migration như thế nào? → A: Ưu tiên persistence hiện tại nếu đáp ứng; nếu không, thêm migration tối thiểu cùng kiểm thử tương thích và rollback trước rollout.
- Q: Khi request còn chạy hoặc service khởi động lại, cơ chế nào nên giữ lease hợp lệ và kích hoạt việc dọn request đã mồ côi? → A: Request đang chạy gia hạn lease; reconciler định kỳ kết thúc lease đã hết hạn bằng cập nhật nguyên tử, với khoảng chờ để tránh hết hạn nhầm khi renewal bị trễ.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Tiếp tục hội thoại hiện có (Priority: P1)

Ứng viên gửi tin nhắn trong phiên hiện có và nhận câu trả lời tiếp nối đúng ngữ cảnh. Các luồng tạo phiên, liệt kê/lưu tin nhắn, phân trang lịch sử, locale, trạng thái, quota và chống gửi trùng tiếp tục như trước.

**Why this priority**: Đây là hành trình đang được frontend và người dùng sử dụng; agent chỉ có giá trị nếu thay đổi bên trong không làm mất hội thoại.

**Independent Test**: Gửi nhiều lượt qua API hiện tại bằng một session, kiểm tra history đưa vào lượt kế tiếp có thứ tự và giới hạn như hiện tại, câu trả lời được lưu cùng citation/metadata và phản hồi gửi trùng không tạo một lượt mới.

**Acceptance Scenarios**:

1. **Given** ứng viên có session đang hoạt động, consent cần thiết và quota còn hợp lệ, **When** gửi message hợp lệ, **Then** nhận cặp user/assistant message theo response hiện hành và assistant message giữ blocks, citations, filter state cùng generation metadata.
2. **Given** session có các lượt trước, **When** ứng viên hỏi tiếp, **Then** câu hỏi mới được xử lý cùng recent history giới hạn theo hành vi hiện tại và không làm lộ nội dung của session khác.
3. **Given** cùng `clientMessageId` được gửi lại, **When** request lặp đến, **Then** hệ thống trả kết quả idempotent hiện có hoặc xử lý lại assistant message thất bại theo quy tắc hiện tại mà không nhân đôi quota/message.
4. **Given** session bị archive, caller không sở hữu session, CV consent bị thu hồi/không hợp lệ, mode/CV selection không hợp lệ hoặc quota không còn, **When** gửi message, **Then** request bị từ chối theo contract hiện có trước khi history được nạp vào AI context và không gọi agent/tool; persisted history không bị xóa hoặc sửa.
5. **Given** ứng viên muốn chuyển sang mode khác, **When** bắt đầu trao đổi ở mode mới, **Then** ứng dụng dùng session mới và không đưa history của session mode cũ vào context.

---

### User Story 2 - Tìm việc và nhận tư vấn có căn cứ (Priority: P1)

Ứng viên hỏi bằng ngôn ngữ tự nhiên về việc làm hoặc hướng nghiệp, có thể nêu location, kỹ năng, level, work mode, loại việc và mức lương. Trợ lý giữ các filter phù hợp qua follow-up, sử dụng dữ liệu việc làm công khai đang hoạt động khi trả lời câu hỏi thực tế về việc làm và phân biệt lời khuyên/nhận định với dữ kiện có nguồn.

**Why this priority**: Job search và advice là hai mode hiện hữu; giữ khả năng này là điều kiện chính để chuyển đổi an toàn.

**Independent Test**: Dùng bộ dữ liệu job tổng hợp, hội thoại nhiều lượt và provider giả lập; kiểm tra filter được áp dụng, các job được nêu nằm trong canonical/retrieved context, citation hợp lệ và câu trả lời từ chối hoặc nêu rõ thiếu bằng chứng khi không có kết quả.

**Acceptance Scenarios**:

1. **Given** mode tìm việc và câu hỏi có tiêu chí cấu trúc, **When** trợ lý tìm việc, **Then** chỉ job công khai đang hoạt động phù hợp hard filters được trình bày như kết quả và state/filter response giữ đúng contract hiện có.
2. **Given** người dùng follow-up để bổ sung hoặc sửa tiêu chí tìm việc, **When** lượt tiếp theo chạy, **Then** ngữ cảnh hội thoại và filter state được dùng để hiểu yêu cầu mới; điều kiện mới không được bịa thành dữ kiện về một job.
3. **Given** câu hỏi về sự nghiệp không yêu cầu khẳng định dữ kiện riêng tư, **When** mode advice được xử lý, **Then** câu trả lời giữ dạng block/locale hiện có và phân biệt advice hoặc inference với dữ kiện job có nguồn.
4. **Given** retrieval không có bằng chứng phù hợp hoặc provider vẫn trả claim không được hỗ trợ/citation không hợp lệ sau tối đa một lần sửa, **When** sinh câu trả lời, **Then** trợ lý không trả claim/citation không hợp lệ; dùng deterministic fallback trạng thái degraded/no-evidence nếu có thể, nếu không thì trả controlled error theo contract hiện tại.

---

### User Story 3 - Phân tích và so sánh CV có ủy quyền (Priority: P1)

Ứng viên chọn một CV của mình để phân tích hoặc so sánh với đúng một job. Trợ lý chỉ nhận CV snapshot đã được application service xác thực cùng consent/version cần thiết; điểm matching là bằng chứng xác định, không do model tự quyết.

**Why this priority**: Phân tích CV và so sánh CV-job là mode hiện hữu, xử lý PII và có ranh giới authorization/consent đặc biệt.

**Independent Test**: Dùng CV/job tổng hợp cùng authorized snapshot và deterministic matching fixture; kiểm tra consent/version, quyền sở hữu, job context, citation và rejection khi thiếu/không khớp bất kỳ reference cần thiết nào.

**Acceptance Scenarios**:

1. **Given** mode phân tích CV, CV thuộc ứng viên và consent còn hiệu lực, **When** gửi message, **Then** agent chỉ dùng snapshot đã được xác thực và trả phân tích theo response hiện hành mà không lưu hay ghi đè CV.
2. **Given** mode so sánh CV-job, một CV được ủy quyền và đúng một job đang hoạt động, **When** trả kết quả, **Then** thông tin match định lượng lấy từ kết quả matching xác định hiện có; phần giải thích không mâu thuẫn với score/facts và giữ reference tương ứng.
3. **Given** CV không thuộc caller, thiếu consent, consent/version không khớp, hoặc mode không cho phép CV, **When** request được gửi, **Then** bị từ chối trước agent/tool và không đưa CV vào model context.
4. **Given** job/CV reference không còn hợp lệ hoặc snapshot stale, **When** xử lý lượt chat, **Then** không tạo câu trả lời khẳng định dựa trên snapshot stale; trả lỗi/degraded phù hợp mà không persist thay đổi.

---

### User Story 4 - Agent sử dụng công cụ an toàn và chịu lỗi (Priority: P2)

Ứng viên nhận câu trả lời khi agent cần tra cứu thêm bằng chứng hiện có. Agent chỉ được gọi công cụ đã đăng ký và được cho phép cho capability; lỗi công cụ/provider hoặc chạm giới hạn dừng an toàn, không biến nội dung retrieved thành chỉ dẫn và không làm thay đổi hợp đồng chatbot.

**Why this priority**: Tool use tạo ra khác biệt agent nhưng quyền truy cập và giới hạn là điều kiện bắt buộc trước rollout.

**Independent Test**: Với provider/tool giả lập, kiểm tra hoàn tất không gọi tool, một hoặc nhiều bước tool hợp lệ, tool ngoài allowlist, input sai schema, denied authorization, lỗi/timeout và budget exhaustion; xác nhận không có handler call trái phép và response ngoài vẫn theo contract.

**Acceptance Scenarios**:

1. **Given** agent cần thông tin từ nguồn được phép, **When** model đề xuất registered tool trong allowlist và input hợp lệ, **Then** tool chỉ được thực thi sau kiểm tra quyền/schema và kết quả được validate trước khi dùng làm context.
2. **Given** model yêu cầu tool không tồn tại/không allowlist, input sai, hoặc principal không được phép, **When** dispatcher xử lý, **Then** tool bị từ chối trước side effect và caller nhận lỗi/degraded result an toàn theo hành vi chatbot hiện có.
3. **Given** tool/provider thất bại, timeout hoặc agent vượt số bước/lượt gọi/thời gian được cấp, **When** execution dừng, **Then** không có bước gọi tiếp theo, raw payload/stack trace không lộ ra ngoài và request không tự chạy lần thứ hai qua legacy.
4. **Given** retrieved job text hoặc CV text chứa instruction, **When** được thêm vào model context, **Then** nội dung chỉ được xem là dữ liệu không đáng tin cậy và không thể đổi quyền, tool allowlist hoặc system instruction.
5. **Given** agent cần dữ kiện về job/CV hoặc kết quả so sánh, **When** nó gọi tool, **Then** tool chỉ đọc context/evidence đã được application service chuẩn bị và chỉ trả matching evidence xác định trong mode so sánh; không phát sinh truy cập dữ liệu hay side effect ngoài request.

---

### User Story 5 - Chuyển đổi theo từng capability mà không đổi client (Priority: P2)

Nhóm kỹ thuật bật agent cho capability chatbot đã kiểm chứng, trong khi implementation cũ vẫn có thể được chọn cho request khác hoặc rollback. Người dùng và frontend tiếp tục dùng luồng API hiện có.

**Why this priority**: Foundation đã có execution/tool/selector contracts nhưng chatbot cần được nối từng bước và phải có đường quay lại legacy.

**Independent Test**: Chạy contract/integration tests với agent tắt, bật riêng cho capability đã đăng ký, agent lỗi sau khi được chọn và rollback cho request kế tiếp; so sánh schema, status, error mapping và frontend-visible fields.

**Acceptance Scenarios**:

1. **Given** agent chưa bật hoặc capability chưa đăng ký, **When** người dùng gọi chatbot, **Then** legacy tiếp tục xử lý request với cùng API/response contract.
2. **Given** capability agent đã đăng ký và được bật server-side, **When** một request mới đến, **Then** request được chọn đúng một implementation; user/client không thể tự bật agent bằng request field.
3. **Given** request đã dispatch vào agent rồi execution lỗi, **When** lỗi được xử lý, **Then** request không chạy legacy lần thứ hai; request mới sau rollback dùng legacy.
4. **Given** agent trả response, **When** ứng dụng lưu message/trả frontend, **Then** cấu trúc request/response, blocks, citations, filter state, provenance, trạng thái/quota và hành vi idempotency vẫn tương thích với consumer hiện tại.
5. **Given** capability agent được bật cho một request, **When** agent xử lý, **Then** request chỉ có một Career Chat Agent execution, không delegate sang agent khác; request khác vẫn được chọn implementation độc lập theo cấu hình server-side.

### Edge Cases

- Session rỗng, archived, lịch sử không hợp lệ/quá dài hoặc chỉ có một phần các lượt trước hợp lệ.
- Tin nhắn lặp, concurrent request cùng session/client message ID, quota reservation bị tranh chấp hoặc assistant generation thất bại rồi retry.
- Follow-up mơ hồ, đổi mode, đổi job/CV, hoặc filter trong history mâu thuẫn với filter hiện tại.
- Không có job/evidence phù hợp hoặc evidence bị loại do không khớp canonical context: trả `NO_EVIDENCE`/fallback an toàn, không dựng job/citation.
- Retrieval hoặc canonical hydration service lỗi/không sẵn sàng: trả `DEGRADED` hoặc controlled error, không coi lỗi dịch vụ là kết quả rỗng và không trả evidence chưa xác minh.
- Citation key lặp chính xác được deduplicate. Citation malformed, không tồn tại, unpaired hoặc trỏ sang job khác làm claim liên quan không hợp lệ; sau tối đa một repair nếu vẫn không hợp lệ thì không trả claim/citation đó và dùng fallback/error theo FR-014. Job inactive hoặc score không hợp lệ không được trình bày như evidence hợp lệ.
- CV snapshot thiếu, không thuộc caller, thiếu consent, consent bị thu hồi, version stale hoặc chứa PII vượt phần được cấp cho request.
- Model trả final output sai schema, tool call sai định dạng, unknown tool, tool trả output sai schema hoặc tool không tuân deadline.
- Retrieved content chứa prompt injection, dữ liệu CV/job chứa thông tin nhạy cảm, hoặc log/trace/error vô tình nhận raw prompt/payload.
- Client disconnect, agent timeout hoặc worker/service restart khi đang chạy; execution không tự resume/replay. Request active trên instance khác gia hạn lease và không được xem là orphaned. Nếu renewal trễ, khoảng chờ trước expiry phải ngăn reconciler kết thúc request còn sống. Reconciler định kỳ chỉ xử lý lease hết hạn bằng cập nhật nguyên tử để tránh đua với request hoặc reconciler khác. Khi interruption được phát hiện, user message đã nhận giữ COMPLETED, assistant response chuyển FAILED, quota reservation được release đúng một lần và kết quả muộn không được persist. Abort được truyền upstream khi transport hỗ trợ; không đảm bảo provider dừng inference đã bắt đầu.
- Agent flag bật nhưng không có implementation đăng ký; rollback xảy ra khi request đang chạy.
- Provider/RAG/matching không sẵn sàng; degraded/fallback phải giữ semantics hiện tại, không tự retry qua implementation legacy cùng request.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Hệ thống MUST tiếp tục nhận tin nhắn, session, history, locale, job/CV selection và filter qua các API hiện hành; không yêu cầu frontend thay đổi để dùng agent.
- **FR-002**: Hệ thống MUST giữ conversation session/history là nguồn ngữ cảnh do application chatbot hiện hữu sở hữu; agent MUST chỉ nhận phần history gần nhất, tối đa 8 entries và 6000 ký tự, theo thứ tự hiện tại. Mode của session là bất biến; khi đổi mode, ứng dụng MUST tạo session mới và MUST NOT chuyển history từ session cũ.
- **FR-003**: Hệ thống MUST giữ idempotency theo `clientMessageId`, quota reservation/commit/release, message persistence, archive behavior và assistant status/error semantics hiện có. Khi client disconnect, request timeout/cancellation hoặc process interruption được phát hiện sau khi user message đã được nhận, user message giữ `COMPLETED`, assistant response MUST chuyển `FAILED` và quota reservation được release đúng một lần; model/tool results đến sau interruption MUST NOT được persist hoặc commit. Để phát hiện request mồ côi sau restart, MUST dùng lease bền vững gắn với request, có owner và expiry; execution đang chạy MUST gia hạn lease, còn reconciler định kỳ chỉ được kết thúc lease hết hạn bằng cập nhật nguyên tử sau khoảng chờ để renewal trễ không gây false expiry. Không được kết luận request ở instance khác đã chết chỉ từ startup. MUST ưu tiên lưu lease trong persistence hiện có; nếu không đáp ứng, phải có migration tối thiểu, kiểm thử tương thích và rollback trước rollout. Execution không tự resume/replay.
- **FR-004**: Hệ thống MUST hỗ trợ đủ các mode hiện hữu: `JOB_SEARCH`, `ADVICE`, `CV_ANALYSIS` và `CV_JOB_COMPARISON`; không được làm mất behavior đã được xác nhận của bất kỳ mode nào.
- **FR-005**: Hệ thống MUST chạy agent thông qua Agent Foundation contract hiện có, với request/capability/output được kiểm tra, bounded execution và kết quả/lỗi phân loại; không sao chép một runtime hoặc tool dispatcher riêng.
- **FR-006**: Hệ thống MUST chỉ cho agent đề xuất và gọi tool đã đăng ký, được allowlist theo capability và authorized bởi application boundary; model output không thể cấp quyền hoặc sửa context/policy.
- **FR-007**: Hệ thống MUST cho phép zero hoặc nhiều bước tool cần thiết trong giới hạn execution; không gọi tool khi final output đã hợp lệ hoặc budget/cancellation đã dừng execution.
- **FR-008**: Hệ thống MUST tái sử dụng retrieval hiện có cho dữ liệu job công khai đang hoạt động, với filter có cấu trúc và context canonical; không được mở rộng nguồn dữ liệu ngoài các nguồn hiện được repository xác nhận.
- **FR-009**: Retrieval result được dùng làm evidence MUST khớp với canonical job context và giữ source reference/citation key khi có; evidence không khớp bị loại và mọi citation/reference trả ra MUST thuộc evidence được phép của request. Citation key lặp chính xác được deduplicate; malformed, unknown, unpaired hoặc cross-job citation làm claim liên quan không hợp lệ. Retrieval/hydration service failure không được diễn giải thành empty result.
- **FR-010**: Hệ thống MUST không trình bày claim factual về job như sự thật nếu không có canonical/retrieved evidence. Empty/invalid evidence sau filtering MUST dẫn đến `NO_EVIDENCE`/deterministic safe fallback; retrieval hoặc canonical hydration failure MUST dẫn đến `DEGRADED` hoặc controlled error. Không trả citation/reference chưa xác minh.
- **FR-011**: Hệ thống MUST tiếp tục dùng matching xác định hiện có cho CV/job comparison; LLM chỉ được giải thích evidence và MUST NOT tự tạo/thay score.
- **FR-012**: Trước khi nạp history vào AI context, application service MUST xác thực quyền sở hữu, mode, consent và version cho capability yêu cầu CV; nếu CV authorization/selection không hợp lệ, MUST từ chối request trước khi history được nạp hoặc AI được gọi. Mode của session là cố định; non-CV request MUST NOT đọc history từ CV session khác. Persisted history không bị xóa hoặc sửa bởi các guard này; AI chỉ nhận authorized snapshot tối thiểu và không đọc trực tiếp kho dữ liệu nghiệp vụ.
- **FR-013**: Nội dung user/retrieval/CV/job được xử lý như dữ liệu không đáng tin; nội dung đó MUST NOT thay đổi system instruction, tool allowlist, authorization hay execution policy.
- **FR-014**: Lỗi tool/provider/output validation, timeout, cancellation hoặc execution limit MUST được chuyển thành safe error/degraded result tương thích; không trả stack trace, secret, credential, raw provider payload hoặc dữ liệu CV nhạy cảm. Với final output không hợp lệ, agent được phép tối đa một lần sửa có giới hạn và chỉ khi còn execution budget. Nếu lần sửa không thành công hoặc không còn budget, MUST dùng deterministic fallback trạng thái degraded/no-evidence khi có thể tạo câu trả lời an toàn; nếu không, trả controlled error. Claim không được hỗ trợ và citation không hợp lệ MUST NOT được trả cho người dùng. Không retry không giới hạn và không chạy lại request qua legacy.
- **FR-015**: Lựa chọn implementation MUST server-controlled, độc lập theo capability và mặc định legacy khi agent tắt/chưa đăng ký; một request chỉ chọn một implementation và agent failure MUST NOT tự chạy lại request đó qua legacy.
- **FR-016**: Rollback MUST chuyển request tiếp theo của capability về legacy mà không đổi client/API hoặc làm mất message/session/quota state; request đã dispatch không đổi implementation giữa chừng.
- **FR-017**: Hệ thống MUST giữ response hiện hành gồm assistant blocks, citations, filter state, generation source/fallback reason và tương thích với frontend types/rendering; mọi thay đổi public contract cần nằm ngoài phạm vi này.
- **FR-018**: Hành vi mới MUST có unit tests và integration/contract tests độc lập với provider thật, bao gồm tool authorization, prompt injection, multi-turn history, failure, budget, API compatibility và rollback. Grounding tests MUST bao gồm empty/filtered evidence, retrieval/canonical-hydration failure, deduplicate citation key lặp chính xác, reject malformed/unknown/unpaired/cross-job citations, cùng kết quả sau repair thất bại hoặc hết budget.
- **FR-019**: Hệ thống MUST chỉ ghi nhận metadata chẩn đoán tối thiểu; prompt đầy đủ, CV text, history nguyên văn, token và tool/provider payload nhạy cảm MUST NOT được ghi vào telemetry.
- **FR-020**: Khi capability agent được chọn, mỗi generation request MUST chạy một Career Chat Agent duy nhất theo Agent Foundation; không điều phối/delegate cho agent khác hoặc tạo agent con.
- **FR-021**: Toolset ban đầu MUST chỉ cung cấp read-only access tới retrieval/canonical context đã được chuẩn bị và authorization bởi application service, cùng matching evidence xác định trong mode CV_JOB_COMPARISON. Tools MUST NOT truy vấn trực tiếp database/vector store, gọi arbitrary service, tính lại score hoặc ghi dữ liệu.
- **FR-022**: Semantic job retrieval, canonical job hydration, CV authorization và deterministic matching MUST tiếp tục theo luồng application/RAG hiện hành trước generation. Agent chỉ được dùng evidence/context của request hiện tại qua tool đã allowlist; không được tự mở rộng nguồn hoặc phạm vi retrieval.
- **FR-023**: Trước rollout, execution budget của agent MUST được giới hạn tối đa 24 giây và internal AI transport timeout MUST ít nhất 29 giây để agent dừng an toàn trước transport deadline. Đây là điều kiện kỹ thuật rollout, không phải latency SLO hay cam kết thời gian phản hồi cho người dùng.

### Key Entities *(include if feature involves data)*

- **Chat session**: Phiên hội thoại gắn với user, mode, title và archive state; tiếp tục thuộc chatbot application hiện hữu.
- **Chat message**: Tin nhắn user hoặc assistant với trạng thái, nội dung, blocks, citations, filter/provenance metadata và liên kết lượt cha; giữ idempotency key từ client.
- **Assistant request context**: Message hiện tại, history gần nhất, mode, locale, filters, canonical job context và authorized CV snapshot/consent khi mode cho phép; chỉ tồn tại trong phạm vi request AI cần xử lý.
- **Retrieval evidence**: Job ID, rank/score, citation key và thông tin filter áp dụng; evidence phải tham chiếu job canonical được phép trong request.
- **Agent tool invocation**: Tool ID/call ID, input/output theo schema, capability/operation authorization và status; payload nhạy cảm không thuộc telemetry.
- **Agent execution**: Một lần thực thi bounded gắn với capability và correlation/request hiện có; khi đang chạy có lease owner/expiry được gia hạn để phục vụ recovery; không thay thế chat session/history/message state.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Người dùng hiện tại tiếp tục hoàn tất cả bốn use case JOB_SEARCH, ADVICE, CV_ANALYSIS và CV_JOB_COMPARISON mà không cần thay đổi client đang sử dụng.
- **SC-002**: 100% kịch bản hội thoại kiểm thử nhiều lượt tiếp tục dùng đúng session, đúng history gần nhất, đúng thứ tự và không vượt quá 8 entries/6000 ký tự.
- **SC-003**: Trên toàn bộ fixture tổng hợp được duy trì trong test suite, factual job claims có citation phải trỏ đến job/evidence được phép của request và empty/invalid evidence không được trả khẳng định job giả. Citation key lặp chính xác phải được deduplicate; malformed, unknown, unpaired hoặc cross-job citations không được trả cùng claim không hợp lệ sau tối đa một repair. Empty/filtered evidence phải cho `NO_EVIDENCE`/safe fallback; retrieval hoặc canonical hydration failure phải cho `DEGRADED`/controlled error.
- **SC-004**: Trên toàn bộ fixture tổng hợp được duy trì trong test suite, tool ngoài allowlist, sai schema hoặc thiếu quyền phải bị từ chối trước handler; không phát sinh side effect trong các trường hợp này.
- **SC-005**: Trên toàn bộ fixture tổng hợp được duy trì trong test suite, trường hợp CV sai owner, thiếu/không còn consent, mode/CV selection không hợp lệ hoặc version stale phải bị từ chối trước khi history được nạp vào AI context hoặc agent/tool được gọi; non-CV mode không được đọc history từ CV session khác và persisted history không bị xóa/sửa.
- **SC-006**: Trên toàn bộ fixture tổng hợp được duy trì trong test suite, budget, timeout/cancellation (bao gồm client disconnect và process interruption được phát hiện) cùng tool/provider error phải kết thúc trong giới hạn đã cấu hình (agent tối đa 24 giây, transport ít nhất 29 giây), không dispatch thêm tool call sau khi dừng và không lộ raw payload/stack trace/PII. Khi bị hủy/gián đoạn, user message giữ `COMPLETED`, assistant response chuyển `FAILED`, quota reservation được release đúng một lần và kết quả muộn không được persist/commit. Request active gia hạn lease; lease hết hạn sau 30 giây, có grace 5 giây và reconciler chạy mỗi 15 giây, nên request mồ côi phải terminalize trong tối đa 50 giây kể từ lần gia hạn cuối khi database/runtime khỏe. Reconciler dùng cập nhật nguyên tử và không kết thúc lease còn hạn/trong grace. Các mốc thời gian là release gates, không phải latency SLO sản phẩm.
- **SC-007**: Người dùng tiếp tục xem được câu trả lời, nguồn tham chiếu, bộ lọc, ngôn ngữ và trạng thái xử lý như trước; gửi lại cùng một lượt không làm tăng message hoặc quota ngoài quy tắc hiện tại.
- **SC-008**: Không có lượt chat nào được xử lý hai lần; sau rollback, lượt mới hoạt động theo hành vi trước chuyển đổi và lượt đang chạy giữ nguyên cách xử lý đã chọn.
- **SC-009**: Các kịch bản nghiệm thu deterministic được xác định trong test suite MUST cho cùng response/status, citation, tool-authorization outcome và fallback/error category trong 10 lần chạy liên tiếp với cùng fixture tổng hợp; không yêu cầu CV thật, provider LLM thật hoặc dịch vụ bên ngoài đang hoạt động. Không áp tiêu chí byte-for-byte lên nội dung sinh tự do.

## Assumptions

- Application service hiện hữu tiếp tục sở hữu xác thực người dùng, session/history, consent, quota, dữ liệu canonical của job/CV và persistence; dịch vụ xử lý AI chỉ thực hiện inference/RAG theo boundary nội bộ hiện có.
- Các API public chatbot và internal AI contracts hiện hành được dùng làm baseline; không có yêu cầu đổi frontend hoặc thêm endpoint public.
- Các nghiệp vụ chatbot đã xác nhận trong repository là job search theo structured filters, ADVICE, phân tích CV và so sánh một CV với một job. Không thêm career planning, application tracking hoặc nguồn dữ liệu mới nếu chưa có yêu cầu được duyệt.
- Job retrieval hiện giới hạn trong public active jobs; CV context chỉ được chuyển khi đã được xác thực/consented theo flow hiện tại.
- RAG retrieval và canonical hydration tiếp tục diễn ra trước generation như flow hiện tại; tool agent chỉ phơi bày prepared evidence/context cho model đọc theo nhu cầu. Repository hiện chưa có business tools đăng ký cho Agent Foundation.
- Phiên bản Career Chat ban đầu là single-agent, request-scoped; không dùng checkpoint hay persistence riêng ngoài chat session/message hiện hữu.
- Multi-agent orchestration/delegation, model-triggered vector searches, nguồn dữ liệu mới, arbitrary database/service access, write tools và thay đổi public API/frontend/session-history/quota flow nằm ngoài phạm vi.
- Capability dùng Agent Foundation vẫn cần được đăng ký/nối selector và route/service; spec này không giả định wiring đó đã tồn tại.
- Legacy implementation tiếp tục là phương án mặc định và rollback; lỗi agent trong cùng request trả controlled error/degraded response thay vì tự thực hiện lần hai qua legacy.
- Không bổ sung persistence hội thoại hoặc agent checkpoint riêng; lịch sử tiếp tục theo session hiện có, execution thông thường chỉ theo request.
- Chất lượng gợi ý hướng nghiệp được đánh giá trên test/evaluation set có facts kỳ vọng; chưa có latency/availability/scale SLO hoặc satisfaction baseline mới được xác nhận. Migration giữ operational baseline hiện hành và không áp đặt ngưỡng production mới trong spec này.
