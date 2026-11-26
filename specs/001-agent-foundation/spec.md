# Đặc tả tính năng: Agent Foundation

**Feature Branch**: `refactor/ai-gen-cv`

**Created**: 2026-11-16

**Status**: Draft

**Input**: User description: "Tạo nền tảng agent dùng chung cho TalentPulse để các tính năng AI hiện có có thể chuyển đổi từng bước, vẫn tương thích API và an toàn với dữ liệu CV."

## Clarifications

### Session 2026-11-16

- Q: Khi worker hoặc service bị restart giữa một lần chạy agent, bạn muốn hệ thống tiếp tục từ tiến trình đã lưu hay kết thúc lần chạy đó và yêu cầu chạy lại? → A: Execution state chỉ dùng cho một lần chạy; sau restart lần chạy kết thúc với lỗi gián đoạn, retry bắt đầu một execution mới.
- Q: Khi người dùng chủ động yêu cầu tạo lại CV, có được xem đó là phê duyệt để lưu bản nháp EDITOR_ONLY vào CV hiện có, hay cần thêm bước phê duyệt trước khi lưu? → A: Yêu cầu tạo/tạo lại CV là phê duyệt để lưu bản nháp EDITOR_ONLY như hiện tại; không đồng nghĩa phê duyệt publish hoặc thay đổi dữ liệu ngoài phạm vi bản nháp.
- Q: Trong Agent Foundation, thành phần nào nên dùng chung giữa các agent và thành phần nào cần tiếp tục thuộc riêng từng capability? → A: Dùng chung execution contract/state/error/budget/model integration/observability và định nghĩa tool; prompt, schema nghiệp vụ, workflow, validators và allowlist tool thuộc riêng từng capability.
- Q: Nếu một request đã được định tuyến sang agent nhưng execution gặp lỗi, hệ thống có nên tự chạy lại cùng request qua implementation legacy không? → A: Không tự fallback cùng request; trả lỗi/degraded result theo contract hiện có, còn rollback định tuyến các request tiếp theo về legacy.
- Q: Agent Foundation có phải đáp ứng quy định pháp lý cụ thể về dữ liệu CV ngoài các nguyên tắc privacy hiện có của repository không? → A: Không thêm chế độ tuân thủ pháp lý cụ thể vào feature này khi repository chưa nêu; tiếp tục áp dụng các nguyên tắc privacy hiện có.
- Q: Nếu CV graph đang chờ người duyệt publish/thay đổi quan trọng mà AI service restart, approval pending có phải resume đúng execution đó không? → A: Có, chỉ execution đang chờ approval được checkpoint tối thiểu và resume sau restart; execution thông thường vẫn không được resume.
- Q: Approval-pending checkpoint cần được giữ resumable trong bao lâu trước khi hết hạn và bị xóa? → A: Hết hạn sau 24 giờ.

## Kịch bản người dùng và kiểm thử *(bắt buộc)*

### User Story 1 - Chạy một năng lực AI qua nền tảng dùng chung (Priority: P1)

Là kỹ sư AI của TalentPulse, tôi muốn đăng ký và thực thi một năng lực agent qua hợp đồng chung, để có thể chuyển đổi từng năng lực hiện có mà không phải viết lại toàn bộ chatbot hoặc CV generation.

**Lý do ưu tiên**: Đây là giá trị nền tảng cốt lõi và cho phép kiểm chứng mô hình coexist trước khi chuyển thêm tính năng.

**Kiểm thử độc lập**: Chạy một agent thử nghiệm với dữ liệu tổng hợp; xác nhận nhận kết quả có cấu trúc hoặc lỗi có phân loại, trong khi luồng legacy tiếp tục hoạt động.

**Kịch bản chấp nhận**:

1. **Given** một agent hợp lệ đã được đăng ký, **When** một năng lực AI được cấu hình chạy qua nền tảng, **Then** nền tảng trả kết quả hoặc lỗi theo hợp đồng thực thi chung.
2. **Given** một tính năng vẫn dùng implementation legacy, **When** một agent thử nghiệm được bật cho năng lực khác, **Then** cả hai implementation cùng hoạt động mà không làm thay đổi API công khai.
3. **Given** agent chưa được bật cho một năng lực, **When** người dùng gọi API AI hiện có, **Then** request tiếp tục được xử lý theo hành vi legacy.
4. **Given** hai capability agent khác nhau, **When** cả hai thực hiện một tác vụ ngôn ngữ, **Then** chúng sử dụng cùng hợp đồng tích hợp model và nhận kết quả/lỗi theo dạng thống nhất.

---

### User Story 2 - Tái sử dụng công cụ AI có hợp đồng và quyền rõ ràng (Priority: P1)

Là người phát triển năng lực AI, tôi muốn dùng lại các công cụ có đầu vào, đầu ra và phạm vi quyền xác định, để agents có thể phối hợp với dữ liệu hoặc dịch vụ hiện có mà không được tự ý thực hiện hành động ngoài phạm vi.

**Lý do ưu tiên**: Tool là ranh giới giữa model và dữ liệu/hành động của ứng dụng; hợp đồng và quyền rõ ràng là điều kiện an toàn để tái sử dụng.

**Kiểm thử độc lập**: Gọi tool với input hợp lệ, input sai schema và quyền bị từ chối; xác nhận chỉ trường hợp hợp lệ, được cấp quyền mới thực hiện tác vụ.

**Kịch bản chấp nhận**:

1. **Given** tool có hợp đồng input/output hợp lệ và caller được cấp quyền, **When** agent gọi tool, **Then** tool trả kết quả đúng hợp đồng.
2. **Given** input sai hợp đồng hoặc caller không có quyền, **When** agent yêu cầu tool thực thi, **Then** thao tác bị từ chối an toàn và không tạo side effect.
3. **Given** nội dung CV hoặc nội dung truy xuất chứa chỉ dẫn, **When** agent xử lý nội dung đó, **Then** nội dung được coi là dữ liệu không đáng tin cậy, không thể mở rộng quyền tool.
4. **Given** thay đổi nền tảng được đề xuất hoàn tất, **When** chạy bộ kiểm thử, **Then** có unit tests cho quy tắc hợp đồng/quyền và integration tests cho các ranh giới model/tool liên quan; các kiểm thử thường quy không cần gọi provider thật.

---

### User Story 3 - Giới hạn và chẩn đoán một lần chạy agent (Priority: P2)

Là người vận hành nền tảng AI, tôi muốn mỗi lần chạy có trạng thái, giới hạn và thông tin lỗi có thể chẩn đoán, để sự cố dừng an toàn và không làm lộ dữ liệu cá nhân.

**Lý do ưu tiên**: Giới hạn và khả năng quan sát giúp kiểm soát chi phí, vòng lặp lỗi và sự cố trước khi tăng số năng lực agent.

**Kiểm thử độc lập**: Chạy các trường hợp hoàn tất, lỗi tool/model, vượt giới hạn và hủy; kiểm tra trạng thái cuối, số lần gọi bị chặn và bản ghi quan sát đã được làm sạch.

**Kịch bản chấp nhận**:

1. **Given** một lần chạy đang hoạt động, **When** nó hoàn tất, thất bại, bị hủy hoặc chạm giới hạn, **Then** trạng thái cuối và kết quả lỗi phản ánh đúng nguyên nhân.
2. **Given** agent vượt giới hạn vòng lặp, thời gian hoặc số lần gọi đã cấu hình, **When** giới hạn bị chạm, **Then** thực thi dừng và trả lỗi kiểm soát được, không tiếp tục gọi model/tool.
3. **Given** provider hoặc tool gặp lỗi, **When** lỗi được ghi nhận, **Then** thông tin phục vụ chẩn đoán không chứa CV nguyên bản, token, bí mật hoặc stack trace nội bộ trả cho người dùng.

---

### User Story 4 - Chuyển đổi mà không làm gián đoạn API hiện có (Priority: P1)

Là người dùng chatbot hoặc CV generation, tôi muốn các API và hành vi đã dùng tiếp tục ổn định trong quá trình migration, để không cần thay đổi client chỉ vì implementation bên trong dần chuyển sang agent.

**Lý do ưu tiên**: Chatbot và CV generation đã được triển khai; nền tảng mới phải hỗ trợ migration tăng dần thay vì buộc thay thế đồng loạt.

**Kiểm thử độc lập**: Chạy kiểm thử hợp đồng API hiện có trên cấu hình legacy và agent thử nghiệm; so sánh schema, status/error behavior và kết quả nghiệp vụ được cam kết.

**Kịch bản chấp nhận**:

1. **Given** client hiện tại gửi request theo hợp đồng hiện hành, **When** xử lý qua legacy hoặc agent implementation tương thích, **Then** client không cần đổi request/response schema.
2. **Given** agent implementation lỗi hoặc bị tắt, **When** migration được rollback, **Then** năng lực trở lại legacy mà không mất dữ liệu nghiệp vụ.
3. **Given** một capability chưa được migration, **When** hệ thống được phát hành nền tảng agent, **Then** capability đó vẫn dùng luồng legacy.
4. **Given** người dùng chủ động yêu cầu tạo/tạo lại CV, **When** kết quả generation được lưu, **Then** chỉ bản nháp `EDITOR_ONLY` được lưu theo hành vi hiện tại; hành động đó không tự phê duyệt publish.
5. **Given** agent thất bại trong một request, **When** lỗi được trả về, **Then** cùng request không tự chạy lần hai qua legacy; sau khi capability được rollback, request mới dùng legacy.

---

### User Story 5 - Mở rộng nền tảng cho agents tương lai (Priority: P3)

Là nhóm sản phẩm, tôi muốn nền tảng hỗ trợ các nhu cầu của Career Chat Agent và CV Generation Agent trong tương lai, để có thể phát triển riêng các tính năng đó sau khi nền tảng được kiểm chứng.

**Lý do ưu tiên**: Khả năng mở rộng là mục tiêu thiết kế của nền tảng, nhưng không được trì hoãn việc cung cấp một execution foundation dùng được.

**Kiểm thử độc lập**: Đối chiếu các nhu cầu ở mức hợp đồng của hai agent tương lai với khả năng execution, tool, model, state và policy của nền tảng mà không triển khai hai agent hoàn chỉnh.

**Kịch bản chấp nhận**:

1. **Given** yêu cầu hợp đồng ở mức capability cho Career Chat và CV Generation, **When** đánh giá nền tảng, **Then** mỗi capability có thể ánh xạ vào cơ chế dùng chung hoặc được ghi nhận là khoảng trống rõ ràng.
2. **Given** một capability tương lai yêu cầu truy cập CV hoặc thay đổi dữ liệu, **When** xác định quyền và luồng phê duyệt, **Then** nền tảng không tự cấp quyền hoặc tự ghi dữ liệu ngoài chính sách.
3. **Given** CV workflow yêu cầu publish hoặc thay đổi quan trọng, **When** workflow đến approval gate, **Then** nó pause với checkpoint reference-only và chỉ resume sau decision được NestJS authorize.
4. **Given** approval đã pending 24 giờ, **When** người dùng gửi decision muộn, **Then** decision bị từ chối, checkpoint được dọn và không có write xảy ra.

### Trường hợp biên

- Model trả output sai hợp đồng, gọi tool không tồn tại hoặc yêu cầu lặp quá giới hạn.
- Provider/tool timeout, lỗi tạm thời hoặc không khả dụng; retry không được vượt budget chung.
- Request bị hủy trong lúc model/tool đang chạy; kết quả đến muộn không được ghi thành dữ liệu đã hoàn tất.
- Worker/service restart khi agent đang chạy kết thúc execution thông thường với lỗi gián đoạn; retry tạo execution mới. Ngoại lệ duy nhất là graph đã dừng tại human-approval gate và đang có checkpoint tối thiểu.
- Agent execution thất bại sau khi bắt đầu không tự chạy lại cùng request qua legacy; tránh lặp provider call hoặc side effect ngoài dự kiến.
- Agent không được cấp một quyền cần thiết hoặc input chứa CV không có consent hợp lệ.
- Một agent được bật cho một capability trong khi capability khác vẫn ở legacy.
- Rollback xảy ra khi có request agent đang chạy; request đã định tuyến không chuyển sang legacy giữa chừng, còn request mới theo legacy sau khi rollback có hiệu lực.
- Dữ liệu quan sát có metadata hữu ích nhưng tuyệt đối không cần nội dung CV để chẩn đoán.

## Yêu cầu *(bắt buộc)*

### Yêu cầu chức năng

- **FR-001**: Hệ thống MUST cung cấp hợp đồng execution/state/error/budget chung để một capability có thể yêu cầu chạy agent và nhận kết quả thành công hoặc lỗi có cấu trúc; prompt, schema nghiệp vụ, workflow và validators MUST thuộc capability tương ứng.
- **FR-002**: Hệ thống MUST cho phép mô tả hợp đồng input/output của tool và từ chối input không hợp lệ trước khi tool tạo side effect.
- **FR-003**: Định nghĩa tool MUST có thể tái sử dụng nhưng mỗi capability MUST có allowlist tool riêng; mỗi tool MUST khai báo phạm vi thao tác và hợp đồng của nó. Quyền truy cập MUST được xác thực ở application boundary, không giao cho model quyết định.
- **FR-004**: Hệ thống MUST cung cấp tích hợp model dùng chung cho các agent, đồng thời cho phép capability nhận diện lỗi provider và kết quả không hợp lệ theo hợp đồng.
- **FR-005**: Mỗi lần thực thi MUST có định danh và trạng thái tối thiểu để phân biệt đang chạy, chờ phê duyệt, hoàn tất, thất bại, bị hủy và bị gián đoạn; trạng thái MUST gắn với đúng request/capability. Chỉ execution đang chờ phê duyệt được resume sau restart.
- **FR-006**: Hệ thống MUST phân loại lỗi thực thi đủ để caller phân biệt input không hợp lệ, quyền bị từ chối, giới hạn bị chạm và lỗi phụ thuộc ngoài; thông tin lỗi công khai MUST không tiết lộ chi tiết nội bộ.
- **FR-007**: Hệ thống MUST cho phép đặt và áp dụng giới hạn cho số bước/vòng lặp, số lần gọi model/tool và thời gian của một lần chạy; khi chạm giới hạn, agent MUST dừng an toàn.
- **FR-008**: Hệ thống MUST áp dụng quyền theo capability và tool; một agent MUST NOT kế thừa quyền vượt quá các quyền đã được cấp cho caller và request.
- **FR-009**: Hệ thống MUST ghi nhận metadata quan sát cho từng lần chạy gồm định danh tương quan, capability, trạng thái, thời lượng, số lần gọi và loại lỗi khi có.
- **FR-010**: Metadata quan sát MUST loại bỏ hoặc che dữ liệu CV, PII, prompt chứa dữ liệu nhạy cảm, secrets và credentials.
- **FR-011**: Hệ thống MUST cho phép capability chọn implementation legacy hoặc agent-based độc lập; mặc định hiện tại MUST tiếp tục dùng legacy cho capability chưa được bật.
- **FR-012**: Agent Foundation MUST giữ nguyên request/response contract và các hành vi API hiện có của chatbot và CV generation trong phạm vi migration nội bộ.
- **FR-013**: Hệ thống MUST cho phép tắt agent implementation và quay lại legacy cho các request tiếp theo của capability đã migration mà không cần thay đổi client hoặc mất dữ liệu nghiệp vụ. Lỗi agent MUST NOT tự kích hoạt lần chạy legacy thứ hai trong cùng request; capability vẫn trả controlled error/degraded result theo contract hiện có.
- **FR-014**: Hệ thống MUST có khả năng phục vụ nhu cầu hợp đồng của Career Chat Agent và CV Generation Agent trong tương lai mà không yêu cầu hoàn tất hai agent đó trong tính năng này.
- **FR-015**: Yêu cầu rõ ràng của người dùng để tạo/tạo lại CV MUST được xem là phê duyệt chỉ cho việc lưu bản nháp `EDITOR_ONLY` theo hợp đồng hiện tại; output do agent sinh tự nó không phải phê duyệt. Publish hoặc thay đổi dữ liệu quan trọng ngoài bản nháp MUST có phê duyệt riêng.
- **FR-016**: Phần nền tảng mới MUST có kiểm thử unit cho quy tắc execution/tool/policy và kiểm thử integration cho ranh giới model/tool/API liên quan; kiểm thử thường quy MUST có thể chạy với provider giả lập xác định.
- **FR-017**: Workflow có hành động publish/thay đổi dữ liệu quan trọng MUST pause tại human-approval gate; chỉ decision được xác thực bởi application service mới cho phép workflow tiếp tục tới hành động đó.
- **FR-018**: Approval-pending checkpoint MUST hết hạn 24 giờ sau khi approval được tạo; decision đến sau expiry MUST bị từ chối và checkpoint MUST được cleanup trước khi hành động được thực hiện.

### Yêu cầu phi chức năng

- **NFR-001**: Không có log, trace hoặc thông báo lỗi nào trong bộ kiểm thử privacy được chứa CV nguyên bản, token hay credential.
- **NFR-002**: Việc đưa nền tảng vào hoạt động MUST không làm thay đổi schema API công khai; toàn bộ kiểm thử hợp đồng hiện hành MUST tiếp tục đạt.
- **NFR-003**: Mỗi lần chạy MUST có budget hữu hạn; không có chuỗi gọi model/tool vô hạn khi provider trả lỗi, output sai hoặc agent lặp lại hành động.
- **NFR-004**: Trạng thái và lỗi quan sát được MUST nhất quán giữa legacy adapter và agent execution đủ để vận hành theo cùng quy trình chẩn đoán.
- **NFR-005**: Mọi thay đổi MUST có đường rollback được kiểm chứng trước khi mở rộng migration tới capability khác.
- **NFR-006**: Agent Foundation MUST NOT checkpoint execution thông thường. Chỉ checkpoint tối thiểu của graph đang chờ human approval được lưu bền vững tối đa 24 giờ và resume sau restart; checkpoint MUST không chứa CV nguyên bản, prompt hoặc toàn bộ model conversation, phải được xóa sau approve/reject/cancel/expiry.

### Ràng buộc migration

- Chatbot và CV Generation đang hoạt động; MUST giữ chúng như brownfield components và chỉ chuyển từng capability có lý do, kiểm thử và đường rollback. Chatbot hiện có API gửi tin đồng bộ cùng session/history do NestJS quản lý; nền tảng không chuyển ownership đó sang AI service.
- CV Generation hiện có cả request đồng bộ và operation bất đồng bộ với queue, polling, cancellation và trạng thái nghiệp vụ riêng (`QUEUED`, `RUNNING`, `COMPLETE`, `DEGRADED`, `FAILED`, `CANCELLED`, `STALE`). Foundation MUST giữ các hợp đồng và semantics này; không thay status API bằng trạng thái agent nội bộ.
- Legacy và agent-based implementations MUST cùng tồn tại trong giai đoạn migration. Việc chuyển đổi MUST có thể bật/tắt theo capability mà không yêu cầu client thay đổi.
- Chỉ execution contract/state/error/budget, model integration, observability và tool definitions là thành phần dùng chung. Prompt, schema nghiệp vụ, workflow, context rules, validators và allowlist tool vẫn riêng theo capability; không hợp nhất các luồng chatbot và CV chỉ để dùng chung runtime.
- Agent execution nội bộ MUST được gọi bởi các flow hiện có mà không thay hợp đồng công khai: chatbot tiếp tục request/response đồng bộ; CV generation tiếp tục hỗ trợ request đồng bộ và worker queue/status/cancellation do NestJS sở hữu.
- Tích hợp model dùng chung MUST tái sử dụng provider boundary hiện có; Agent Foundation không ép đổi provider/model hoặc chuyển provider-specific policy vào từng agent.
- API contracts hiện có là ranh giới tương thích; breaking changes không thuộc phạm vi nền tảng này.
- NestJS tiếp tục sở hữu authorization, consent, dữ liệu nghiệp vụ và persistence; AI service tiếp tục sở hữu inference/orchestration AI. Agent không được trở thành nguồn quyết định authorization.
- Trạng thái phiên/lịch sử chat tiếp tục do service hội thoại hiện tại sở hữu; trạng thái operation và queue CV tiếp tục do service CV hiện tại sở hữu. Agent Foundation MUST NOT chuyển các nguồn trạng thái nghiệp vụ này sang một kho execution riêng.
- Execution state nội bộ thông thường chỉ tồn tại trong phạm vi một lần chạy. Khi process restart, execution thông thường kết thúc với lỗi gián đoạn; retry bắt đầu execution mới. Ngoại lệ duy nhất là graph approval riêng, chỉ chứa reference/version/action metadata, được checkpoint và resume sau restart.
- Chatbot tiếp tục dùng pipeline hiện hành: NestJS kiểm tra quyền/consent, giữ session/quota/history và gọi AI service nội bộ cho retrieval/generation. CV Generation tiếp tục qua các API đồng bộ hoặc queue hiện có; operation `RUNNING` bị worker nhận lại sau restart tiếp tục fail-closed theo hành vi hiện hành thay vì resume inference.
- Không mặc định thêm migration cơ sở dữ liệu. Checkpoint tables chỉ được thêm cho approval-pending graph, với quyền service riêng và không truy cập bảng business data; thay đổi này phải có migration/rollback và retention cleanup. Không checkpoint graph chứa CV, prompt hoặc model context.
- Yêu cầu tạo/tạo lại CV hiện có là hành động rõ ràng cho phép lưu bản nháp `EDITOR_ONLY`; foundation MUST giữ hành vi này để tương thích. Việc publish CV hoặc ghi thay đổi quan trọng khác vẫn cần phê duyệt riêng.
- Vì `docs/current-ai-architecture.md` không có trong working tree hiện tại, inventory và ownership của từng component MUST được xác nhận từ mã nguồn/tài liệu hiện hành trong bước lập kế hoạch trước khi chọn migration boundary.

### Ngoài phạm vi

- Hoàn thiện Career Chat Agent hoặc thay thế chatbot hiện tại bằng agent.
- Hoàn thiện CV Generation Agent hoặc thay thế CV generator hiện tại bằng agent.
- Thiết kế lại frontend hoặc thay đổi hành trình giao diện người dùng.
- Thay đổi API công khai, yêu cầu client migration hoặc thiết kế lại hệ thống session.
- Ghi/ghi đè CV ngoài hành động người dùng chủ động yêu cầu tạo/tạo lại bản nháp; tự phê duyệt publish hoặc để agent tự quyết định quyền truy cập.
- Di chuyển hàng loạt chatbot/CV generation sang agent trong một lần phát hành.
- Database migration không cần thiết ngoài các checkpoint tables tối thiểu cho human approval.
- Mở rộng agent thành autonomous multi-agent orchestration ngoài các hợp đồng và giới hạn đã yêu cầu.

### Thực thể chính

- **Agent capability**: Một năng lực AI có tên và hợp đồng đầu vào/đầu ra, có thể được xử lý bởi legacy hoặc agent-based implementation.
- **Agent execution**: Một lần chạy capability, có định danh, trạng thái, kết quả hoặc lỗi, giới hạn áp dụng và metadata quan sát.
- **Tool**: Một thao tác được agent yêu cầu, có hợp đồng input/output, quyền được cấp và kết quả hoặc lỗi.
- **Execution policy**: Các giới hạn và quyền cho phép áp dụng trong một lần chạy; gắn với capability và caller/request tương ứng.
- **Model invocation**: Một lần gọi năng lực tạo sinh/hiểu ngôn ngữ, có kết quả, trạng thái và metadata vận hành; không bao gồm dữ liệu nhạy cảm dư thừa.
- **Human approval**: Hành động rõ ràng của người có thẩm quyền; yêu cầu tạo/tạo lại CV cho phép lưu bản nháp `EDITOR_ONLY`, còn publish hoặc thay đổi quan trọng ngoài bản nháp cần phê duyệt riêng.
- **Approval checkpoint**: Snapshot tối thiểu của workflow runtime khi execution đang chờ approval; không chứa CV nguyên bản, prompt hoặc toàn bộ hội thoại model và bị xóa sau decision/expiry.

## Tiêu chí thành công *(bắt buộc)*

### Kết quả đo lường được

- **SC-001**: 100% kiểm thử hợp đồng API hiện tại của chatbot và CV generation đạt khi Agent Foundation được bật nhưng migration agent chưa được bật cho các capability đó.
- **SC-002**: 100% lần chạy trong bộ kiểm thử giới hạn dừng trong budget cấu hình và trả trạng thái/lỗi xác định; không có trường hợp gọi model/tool tiếp tục sau khi budget cạn.
- **SC-003**: 100% trường hợp kiểm thử quyền từ chối thao tác ngoài allowlist trước khi tạo side effect.
- **SC-004**: 0 CV nguyên bản, secrets hoặc credentials xuất hiện trong log/trace của bộ kiểm thử privacy.
- **SC-005**: Người vận hành có thể xác định capability, trạng thái cuối, thời lượng và loại lỗi của ít nhất 95% các lần chạy tổng hợp được đưa vào bộ kiểm thử quan sát.
- **SC-006**: Một capability thử nghiệm có thể chạy qua agent execution trong khi capability khác tiếp tục dùng legacy; rollback capability thử nghiệm không yêu cầu thay đổi client hoặc làm mất dữ liệu.
- **SC-007**: 100% kiểm thử các hành động ghi/ghi đè CV xác nhận không có thay đổi bền vững nếu thiếu phê duyệt rõ ràng.
- **SC-008**: 100% kiểm thử approval-pending graph xác nhận checkpoint chỉ chứa reference/version/pending action cần thiết, resume cùng execution sau restart, và bị xóa sau quyết định hoặc hết hạn.
- **SC-009**: 100% decision nhận sau 24 giờ bị từ chối và không gọi write action; checkpoint hết hạn được cleanup.

## Giả định

- Người gọi AI đã được xác thực và quyền sở hữu tài nguyên được xác minh bởi application service hiện có trước khi agent thực thi.
- “Execution state” nội bộ thông thường chỉ gắn với một lần chạy và không resume sau restart. Ngoại lệ approval-pending graph dùng checkpoint tối thiểu để resume; session history và trạng thái operation hiện có vẫn thuộc service sở hữu chúng.
- “Shared LLM integration” nghĩa là các agent dùng một hợp đồng tích hợp model chung; không mặc định thay provider hiện có hoặc ép mọi tác vụ dùng cùng một model.
- Legacy tiếp tục là lựa chọn mặc định trong migration; agent-based execution được bật riêng theo capability sau khi đạt kiểm thử và có rollback.
- Không cần dữ liệu bền vững mới cho execution thông thường; chỉ approval graph tách biệt dùng persistence và chứa reference/version/action metadata, không chứa CV text hoặc model context.
- Không có chế độ tuân thủ pháp lý hoặc thị trường cụ thể nào được xác định cho feature này; các nguyên tắc privacy của repository vẫn áp dụng. Yêu cầu tuân thủ cụ thể cần được nêu rõ nếu phạm vi pháp lý được xác định sau này.
- Tài liệu `docs/current-ai-architecture.md` được người dùng nêu nhưng không có tại đường dẫn đó trong working tree; phạm vi component hiện hành cần được xác thực trước khi lập kế hoạch chi tiết.
