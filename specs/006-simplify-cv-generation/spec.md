# Feature Specification: Rút gọn quy trình tạo CV

**Feature Branch**: `[006-simplify-cv-generation]`

**Created**: 2026-11-21

**Status**: Draft

**Input**: User description: "hiện tại chức năng AI gen cv đang có nhiều phần dư thừa do trước đó dùng model yếu trong ollama, hiện tại dùng model mạnh qua api nên những phần đó ko cần thiết nữa, hãy phân tích và loại bỏ những phần dư thừa này"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Nhận bản nháp CV tốt hơn trong ít bước hơn (Priority: P1)

Ứng viên tạo CV bằng Agent trên Gemini hoặc Bedrock. Agent tạo toàn bộ bản nháp trong một lần structured response; locale được nêu ngay trong prompt, không qua các bước locale, lexical, skill-rule, localization hoặc bullet-shaping riêng.

**Why this priority**: Đây là lợi ích trực tiếp của việc bỏ các bước chỉ cần thiết để bù cho hạn chế của mô hình local trước đây.

**Independent Test**: Dùng fixture tổng hợp với fake structured provider; xác nhận đúng schema, prompt chứa locale, đúng source index, một provider call, không có tool call và bản nháp vẫn chờ người dùng duyệt.

**Acceptance Scenarios**:

1. **Với** hồ sơ hợp lệ và Gemini hoặc Bedrock có structured output, **Khi** ứng viên yêu cầu tạo CV, **Thì** Agent trả một bản nháp có cấu trúc trong một lần gọi model.
2. **Với** ứng viên chọn mẫu, ngôn ngữ hoặc tin tuyển dụng tùy chọn đang được hỗ trợ, **Khi** tạo CV, **Thì** các lựa chọn đó tiếp tục được áp dụng đúng như trước.
3. **Với** bản nháp được tạo, **Khi** ứng viên chưa chủ động lưu, **Thì** CV nguồn và hồ sơ nghề nghiệp không thay đổi.
4. **Với** provider không phải Gemini hoặc Bedrock, **Khi** ứng viên yêu cầu tạo CV, **Thì** hệ thống trả lỗi rõ ràng và không fallback sang Ollama hoặc legacy flow.

---

### User Story 2 - Giữ nội dung đáng tin cậy khi quy trình được rút gọn (Priority: P1)

Ứng viên xem bản nháp được tạo từ dữ kiện hồ sơ được cho phép. Ứng dụng giữ identity, contact, source index và trạng thái duyệt; model chỉ tạo nội dung CV. Ứng viên vẫn là người quyết định nội dung cuối cùng.

**Why this priority**: Model mạnh hơn có thể giảm nhu cầu sửa câu chữ, nhưng không thay thế dữ kiện nguồn, kiểm tra của ứng dụng hoặc sự chấp thuận của người sở hữu CV.

**Independent Test**: Dùng fixture có source index sai, thiếu consent, provider không hỗ trợ structured output và provider lỗi; xác nhận lỗi được xử lý an toàn, dữ liệu identity lấy từ ứng dụng và không có nội dung nào được ghi vào CV canonical trước explicit Save.

**Acceptance Scenarios**:

1. **Với** model trả source index không tồn tại hoặc trùng lặp, **Khi** ứng dụng xác thực structured response, **Thì** request thất bại an toàn và không staging bản nháp.
2. **Với** model tạo nội dung CV, **Khi** ứng dụng lắp bản nháp, **Thì** candidate identity/contact và các trường source-owned được lấy từ hồ sơ canonical thay vì tin giá trị do model trả.
3. **Với** bản nháp được tạo, **Khi** ứng viên chưa explicit Save, **Thì** draft chỉ ở trạng thái pending review và CV nguồn không đổi.
4. **Với** bản nháp đang chờ xem xét, **Khi** ứng viên chưa xác nhận lưu hoặc đã từ chối, **Thì** không có nội dung nào được tự động áp dụng lên CV nguồn.

---

### User Story 3 - Chuyển đổi có kiểm soát giữa mô hình dịch vụ và môi trường local (Priority: P2)

Nhóm phát triển duy trì một đường tạo CV duy nhất bằng Agent và provider structured được hỗ trợ; thay đổi được kiểm thử bằng deterministic fixtures và có thể rollback bằng release/version control mà không giữ runtime legacy branch.

**Why this priority**: Phân loại rõ phần nào được bỏ và phần nào phải giữ giúp tránh xóa nhầm quy tắc sản phẩm hoặc làm hỏng môi trường phát triển.

**Independent Test**: Xác nhận request chạy đúng một lần structured output qua Gemini/Bedrock, không có selector/tool loop/legacy call, và thử provider Ollama nhận lỗi có kiểm soát.

**Acceptance Scenarios**:

1. **Với** Gemini hoặc Bedrock không trả đúng schema, **Khi** provider call thất bại hoặc hết hạn, **Thì** hệ thống trả lỗi an toàn, không retry qua legacy flow.
2. **Với** Ollama được cấu hình làm generation provider, **Khi** tạo CV, **Thì** ứng dụng từ chối provider thay vì chạy pipeline local cũ.
3. **Với** thay đổi mới gây suy giảm chất lượng, **Khi** phát hiện vấn đề, **Thì** nhóm có thể rollback release/code mà không sửa CV đã lưu.
5. **Với** bộ hồ sơ tổng hợp cố định, **Khi** đánh giá bản nháp sau thay đổi, **Thì** tỷ lệ đạt cấu trúc, độ chính xác và mức hữu ích được báo cáo riêng; không tuyên bố thành công nếu ngưỡng chất lượng chưa đạt.

### Edge Cases

- Chỉ Gemini và Bedrock được chấp nhận làm provider tạo CV; cả hai phải hỗ trợ structured output.
- Model trả nội dung đúng cấu trúc nhưng chứa số liệu, kỹ năng, chứng chỉ hoặc thành tựu không có trong hồ sơ.
- Nguồn thiếu dữ kiện, có mâu thuẫn giữa hồ sơ nghề nghiệp và CV, hoặc có văn bản yêu cầu model bỏ qua quy tắc.
- Model bỏ qua chỉ dẫn locale; không có localization pass thứ hai, bản nháp vẫn được người dùng xem xét trước khi lưu.
- Model chậm, lỗi, trả sai cấu trúc hoặc hoàn tất sau khi yêu cầu bị hủy.
- Provider dịch vụ bị tắt hoặc Ollama được chọn; không fallback sang pipeline legacy.
- Structured output có index sai, thiếu phần hoặc nội dung không hữu ích; reject schema/index invalid, còn nội dung hợp lệ chờ người dùng duyệt.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Trước khi loại bỏ hoặc gộp một bước trong tạo CV, nhóm phải lập danh mục các bước xử lý, lời nhắc, lần thử lại, cách khôi phục, kiểm tra đầu ra và giới hạn hiện hành; mỗi mục phải được phân loại giữ lại, thu gọn, loại bỏ hoặc chỉ áp dụng cho một nhà cung cấp.
- **FR-002**: Luồng tạo CV phải dùng một structured response để sinh toàn bộ nội dung, với locale được yêu cầu ngay trong prompt; không chạy locale/lexical/skill-rule/localization/bullet-shaping hoặc legacy generation stage riêng.
- **FR-003**: Hệ thống phải giữ nguyên cấu trúc CV, trường bắt buộc, mẫu, ngôn ngữ, cách xử lý dữ kiện trống và tương thích với trình chỉnh sửa hiện tại.
- **FR-004**: Ứng dụng phải xác thực structured schema, source index tồn tại/duy nhất, request identity và content version trước khi staging draft.
- **FR-005**: Prompt phải yêu cầu chỉ dùng dữ kiện ứng viên, không bịa số liệu/chứng chỉ/thành tựu, dùng target job chỉ để ưu tiên nội dung; output gắn source index để review. Không chạy lexical/skill-membership post-validation.
- **FR-006**: Việc thu gọn không được loại bỏ authorization, consent còn hiệu lực, data minimization, prompt-injection separation, source-reference metadata, human review và explicit Save. Draft chưa duyệt không được ghi đè CV nguồn.
- **FR-007**: CV nguồn, hồ sơ nghề nghiệp, phiên bản, trạng thái chính/tìm kiếm và quyết định duyệt phải giữ nguyên cho đến khi ứng viên chủ động chấp thuận lưu; không thay đổi hợp đồng tích hợp công khai hoặc dữ liệu đã lưu nếu không có phê duyệt riêng.
- **FR-008**: Một request gọi model tối đa một lần, có timeout hữu hạn và không retry vô hạn; kết quả đến muộn hoặc sai schema/index không được staging.
- **FR-009**: CV generation chỉ chấp nhận provider Gemini hoặc Bedrock hỗ trợ structured output. Ollama không được chọn làm CV generator và không có legacy fallback.
- **FR-010**: Khi structured response không hợp lệ hoặc không có nội dung reviewable, hệ thống trả lỗi có thể xử lý thay vì dựng fallback từ pipeline cũ.
- **FR-011**: Thông tin vận hành chỉ được chứa mã lỗi đã làm sạch, trạng thái, thời lượng và số lượng tối thiểu; không được chứa CV, thông tin liên hệ, lời nhắc, câu trả lời thô từ nhà cung cấp hoặc thông tin đăng nhập.
- **FR-012**: Có thể rollback code/release trước đó mà không sửa dữ liệu CV đã lưu; bản nháp pending hiện có vẫn đọc/duyệt/từ chối/hết hạn theo quy tắc hiện hành.
- **FR-013**: Việc đánh giá phải dùng đầu vào tổng hợp hoặc dữ liệu đã được cho phép, kiểm tra cấu trúc và an toàn tự động trên toàn bộ bộ kiểm thử, và có đánh giá thủ công đại diện trước khi tuyên bố chất lượng không suy giảm.

### Key Entities *(include if feature involves data)*

- **Quy tắc xử lý CV**: Một lời nhắc, bước diễn đạt, thử lại, khôi phục, xác thực hoặc giới hạn đang ảnh hưởng đến kết quả tạo CV; có quyết định giữ, thu gọn, bỏ hoặc giới hạn theo nhà cung cấp cùng bằng chứng.
- **Cấu hình mô hình**: Một cách tạo nội dung hiện được hỗ trợ, gồm môi trường dịch vụ hoặc môi trường phát triển local và các khả năng có thể dùng.
- **Bản nháp CV**: Nội dung có cấu trúc được tạo từ dữ kiện ứng viên được cho phép, kèm nhãn nguồn, cảnh báo và trạng thái duyệt; không đồng nghĩa với CV đã lưu.
- **Ca đánh giá CV**: Đầu vào tổng hợp, kết quả mong đợi về cấu trúc/nguồn/an toàn và tiêu chí đánh giá mức hữu ích của bản nháp.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% bước xử lý được xem xét có quyết định và lý do được ghi lại trước khi thay đổi; không có bước bị xóa chỉ vì được cho là không cần thiết.
- **SC-002**: Trên bộ đánh giá tổng hợp cố định có ít nhất 30 tình huống, ít nhất 95% yêu cầu hợp lệ trong mỗi môi trường dịch vụ mục tiêu trả bản nháp đáp ứng hợp đồng ngay trong lần xử lý đầu tiên.
- **SC-003**: Với ít nhất 10 bản nháp đại diện từ mỗi môi trường dịch vụ mục tiêu được đánh giá thủ công, ít nhất 90% đạt tiêu chí phù hợp, chính xác, hữu ích và có căn cứ nguồn; không chấp nhận ngưỡng thấp hơn để đổi lấy ít bước xử lý hơn.
- **SC-004**: Với bộ kiểm thử sai source index, prompt injection, consent bị rút, provider lỗi và kết quả muộn, có 0 trường hợp draft invalid được staging hoặc nội dung chưa duyệt ghi vào CV nguồn.
- **SC-005**: Với cùng bộ hồ sơ hợp lệ và cùng môi trường dịch vụ mục tiêu, tỷ lệ người dùng phải gửi lại yêu cầu hoặc chờ một kết quả sửa chữa bổ sung giảm ít nhất 30% so với đường cơ sở được ghi nhận trước thay đổi, trong khi các tiêu chí SC-002 và SC-003 vẫn đạt.
- **SC-006**: Ít nhất 95% yêu cầu hợp lệ hoàn tất hoặc trả hướng xử lý lỗi trong tối đa 300 giây kể từ khi ứng viên gửi yêu cầu.
- **SC-007**: 100% bản nháp được mở nhưng chưa được ứng viên xác nhận lưu giữ nguyên CV nguồn, hồ sơ và trạng thái tìm kiếm/chia sẻ.
- **SC-008**: 100% request CV dùng Gemini/Bedrock structured output; Ollama không được gọi và không có runtime legacy branch.

## Assumptions

- “Model mạnh qua API” nghĩa là mô hình tạo CV hiện đã được nâng cấp; đặc tả không chọn một nhà cung cấp hoặc mô hình mới.
- Các tính năng AI khác có thể còn dùng Ollama; riêng CV generation chỉ dùng Gemini hoặc Bedrock.
- Phạm vi chỉ gồm quy trình tạo CV và xử lý ngôn ngữ trực tiếp phục vụ bản nháp; không gồm CV matching, tìm việc, tìm kiếm hoặc xếp hạng.
- Quy tắc về bản nháp chờ duyệt, quyền đồng ý, truy nguồn dữ kiện, thời hạn và lưu CV từ đặc tả tạo CV hiện hành tiếp tục có hiệu lực.
- Bộ đánh giá có thể tái sử dụng dữ liệu tổng hợp và công cụ đánh giá chất lượng tạo CV hiện có; không dùng CV thật trong kiểm thử thông thường.
- Bất kỳ đánh giá trực tiếp nào với nhà cung cấp bên ngoài chỉ được chạy sau khi có chấp thuận về chi phí và điều khoản xử lý dữ liệu.
