# Feature Specification: Rút gọn quy trình tạo CV

**Feature Branch**: `[006-simplify-cv-generation]`

**Created**: 2026-11-21

**Status**: Draft

**Input**: User description: "hiện tại chức năng AI gen cv đang có nhiều phần dư thừa do trước đó dùng model yếu trong ollama, hiện tại dùng model mạnh qua api nên những phần đó ko cần thiết nữa, hãy phân tích và loại bỏ những phần dư thừa này"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Nhận bản nháp CV tốt hơn trong ít bước hơn (Priority: P1)

Ứng viên tạo CV bằng mô hình tạo nội dung hiện được hỗ trợ. Hệ thống dùng quy trình gọn hơn khi mô hình có thể tự tạo kết quả đạt yêu cầu, nhưng vẫn trả bản nháp đúng cấu trúc, ngôn ngữ và dữ kiện của ứng viên trong trình chỉnh sửa hiện tại.

**Why this priority**: Đây là lợi ích trực tiếp của việc bỏ các bước chỉ cần thiết để bù cho hạn chế của mô hình local trước đây.

**Independent Test**: Dùng cùng một bộ hồ sơ tổng hợp trước và sau khi đơn giản hóa; kiểm tra tỷ lệ bản nháp dùng được ngay, số lần ứng viên phải yêu cầu lại và thời gian nhận bản nháp.

**Acceptance Scenarios**:

1. **Với** hồ sơ hợp lệ trong môi trường dịch vụ đang được hỗ trợ, **Khi** ứng viên yêu cầu tạo CV, **Thì** ứng viên nhận được bản nháp có thể chỉnh sửa mà không phải yêu cầu lại chỉ vì các bước khắc phục chất lượng không cần thiết.
2. **Với** ứng viên chọn mẫu, ngôn ngữ hoặc tin tuyển dụng tùy chọn đang được hỗ trợ, **Khi** tạo CV, **Thì** các lựa chọn đó tiếp tục được áp dụng đúng như trước.
3. **Với** bản nháp được tạo, **Khi** ứng viên chưa chủ động lưu, **Thì** CV nguồn và hồ sơ nghề nghiệp không thay đổi.
4. **Với** dữ liệu ứng viên được gửi đến dịch vụ tạo nội dung bên ngoài, **Khi** điều khoản sử dụng dữ liệu chưa được người phụ trách quyền riêng tư/bảo mật phê duyệt hoặc cho phép lưu/huấn luyện, **Thì** hệ thống không gửi dữ liệu đó.

---

### User Story 2 - Giữ nội dung đáng tin cậy khi quy trình được rút gọn (Priority: P1)

Ứng viên xem bản nháp có nội dung bắt nguồn từ hồ sơ hoặc được model diễn đạt lại. Hệ thống không đánh đổi độ chính xác, khả năng truy nguồn, quyền riêng tư hay quyền quyết định của ứng viên để giảm số bước xử lý.

**Why this priority**: Model mạnh hơn có thể giảm nhu cầu sửa câu chữ, nhưng không thay thế dữ kiện nguồn, kiểm tra của ứng dụng hoặc sự chấp thuận của người sở hữu CV.

**Independent Test**: Dùng các trường hợp tổng hợp có dữ kiện thiếu, mâu thuẫn, sai ngôn ngữ, câu lệnh chèn trong CV và nội dung model bịa; xác nhận nội dung không an toàn vẫn bị loại hoặc báo lỗi, không được ghi vào CV đã lưu.

**Acceptance Scenarios**:

1. **Với** model trả nội dung đúng cấu trúc nhưng có một khẳng định không được dữ kiện nguồn hỗ trợ, **Khi** kết quả được kiểm tra, **Thì** khẳng định đó không được trình bày như dữ kiện đã xác minh.
2. **Với** chỉ một phần nội dung đạt kiểm tra, **Khi** hệ thống có thể xác định chính xác các mục an toàn, **Thì** chỉ các mục đó được đưa vào bản nháp và từng phần bị bỏ có lý do để ứng viên xem.
3. **Với** hệ thống không xác định được tập nội dung an toàn, **Khi** tạo CV kết thúc, **Thì** ứng viên nhận được lỗi có thể xử lý thay vì bản nháp không đáng tin cậy.
4. **Với** bản nháp đang chờ xem xét, **Khi** ứng viên chưa xác nhận lưu hoặc đã từ chối, **Thì** không có nội dung nào được tự động áp dụng lên CV nguồn.

---

### User Story 3 - Chuyển đổi có kiểm soát giữa mô hình dịch vụ và môi trường local (Priority: P2)

Nhóm phát triển đánh giá từng bước xử lý đang dùng trong tạo CV, loại bỏ phần chỉ phục vụ hạn chế của mô hình local khi có bằng chứng, và vẫn giữ được môi trường phát triển local nếu môi trường đó còn được hỗ trợ.

**Why this priority**: Phân loại rõ phần nào được bỏ và phần nào phải giữ giúp tránh xóa nhầm quy tắc sản phẩm hoặc làm hỏng môi trường phát triển.

**Independent Test**: Kiểm tra danh sách quyết định trước/sau và chạy các bộ kiểm thử tổng hợp cho môi trường dịch vụ cùng môi trường local; xác nhận khác biệt chỉ nằm ở xử lý riêng của từng môi trường và không làm đổi hợp đồng sản phẩm.

**Acceptance Scenarios**:

1. **Với** một bước xử lý được đề xuất loại bỏ, **Khi** nhóm xem xét thay đổi, **Thì** lý do và bằng chứng cho thấy bước đó chỉ bù cho hạn chế của model local hoặc thật sự trùng lặp phải được ghi lại.
2. **Với** môi trường local vẫn được hỗ trợ, **Khi** môi trường này được chọn, **Thì** các thiết lập riêng cần thiết vẫn hoạt động mà không áp đặt lên môi trường dịch vụ.
3. **Với** môi trường dịch vụ hoặc local gặp lỗi, **Khi** hệ thống xử lý thất bại, **Thì** giới hạn thử lại, thời hạn và cách báo lỗi vẫn có thể dự đoán; kết quả đến muộn không được áp dụng.
4. **Với** một thay đổi rút gọn gây suy giảm chất lượng, **Khi** kiểm thử hoặc đánh giá phát hiện vấn đề, **Thì** nhóm có thể tắt hoặc khôi phục hành vi trước mà không sửa dữ liệu CV đã lưu.
5. **Với** bộ hồ sơ tổng hợp cố định, **Khi** đánh giá bản nháp sau thay đổi, **Thì** tỷ lệ đạt cấu trúc, độ chính xác và mức hữu ích được báo cáo riêng; không tuyên bố thành công nếu ngưỡng chất lượng chưa đạt.

### Edge Cases

- Một mô hình không hỗ trợ cách tạo cấu trúc mà mô hình khác hỗ trợ; xử lý theo khả năng thực tế, không suy rộng từ tên nhà cung cấp.
- Model trả nội dung đúng cấu trúc nhưng chứa số liệu, kỹ năng, chứng chỉ hoặc thành tựu không có trong hồ sơ.
- Nguồn thiếu dữ kiện, có mâu thuẫn giữa hồ sơ nghề nghiệp và CV, hoặc có văn bản yêu cầu model bỏ qua quy tắc.
- Đổi ngôn ngữ tạo ra nội dung chỉ đúng một phần; yêu cầu đơn giản hóa không được biến nội dung sai ngôn ngữ thành nội dung hợp lệ.
- Model chậm, lỗi, trả sai cấu trúc hoặc hoàn tất sau khi yêu cầu bị hủy.
- Môi trường dịch vụ bị tắt hoặc môi trường local được chọn; các luồng và hợp đồng hiện có vẫn phải có hành vi xác định.
- Số lần sửa chữa giảm nhưng tỷ lệ bản nháp sai nguồn hoặc cần ứng viên sửa lại tăng.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Trước khi loại bỏ hoặc gộp một bước trong tạo CV, nhóm phải lập danh mục các bước xử lý, lời nhắc, lần thử lại, cách khôi phục, kiểm tra đầu ra và giới hạn hiện hành; mỗi mục phải được phân loại giữ lại, thu gọn, loại bỏ hoặc chỉ áp dụng cho một nhà cung cấp.
- **FR-002**: Chỉ được loại bỏ một phần xử lý khi có bằng chứng cho thấy phần đó chỉ bù cho hạn chế của mô hình local hoặc bị lặp với một quy tắc khác mà không bổ sung bảo vệ cần thiết; lý do và kiểm thử chứng minh phải truy được tới từng thay đổi.
- **FR-003**: Hệ thống phải giữ nguyên cấu trúc CV, trường bắt buộc, mẫu, ngôn ngữ, cách xử lý dữ kiện trống và tương thích với trình chỉnh sửa hiện tại.
- **FR-004**: Hệ thống phải tiếp tục xác thực đầu ra ở phía ứng dụng sau khi model phản hồi. Khả năng tạo cấu trúc của model không thay thế kiểm tra kiểu dữ liệu, ý nghĩa, dữ kiện nguồn hoặc quyền xử lý.
- **FR-005**: Mọi nội dung về kinh nghiệm, học vấn, dự án, kỹ năng, chứng chỉ hoặc thành tựu phải được hỗ trợ bởi dữ kiện ứng viên được phép dùng; nội dung tuyển dụng không được biến thành dữ kiện về ứng viên.
- **FR-006**: Việc thu gọn không được loại bỏ kiểm tra quyền sở hữu, consent còn hiệu lực, giới hạn dữ liệu gửi đi, bảo vệ chỉ dẫn độc hại, khả năng truy nguồn từng mục, cảnh báo nội dung bị loại hoặc yêu cầu ứng viên duyệt và lưu rõ ràng. Dịch vụ bên ngoài chỉ được dùng khi điều khoản cấm huấn luyện và lưu dữ liệu sau xử lý đã được người phụ trách quyền riêng tư/bảo mật phê duyệt.
- **FR-007**: CV nguồn, hồ sơ nghề nghiệp, phiên bản, trạng thái chính/tìm kiếm và quyết định duyệt phải giữ nguyên cho đến khi ứng viên chủ động chấp thuận lưu; không thay đổi hợp đồng tích hợp công khai hoặc dữ liệu đã lưu nếu không có phê duyệt riêng.
- **FR-008**: Hệ thống phải duy trì giới hạn thời gian, số lần thử lại và mức sử dụng có thể kiểm soát. Một yêu cầu không được lặp vô hạn hoặc trả kết quả muộn sau khi hết hạn hay bị hủy.
- **FR-009**: Cấu hình hoặc chỉ dẫn chỉ cần cho môi trường local phải được giới hạn trong môi trường đó; không được áp đặt lên môi trường dịch vụ. Nếu môi trường local vẫn được hỗ trợ, hành vi hiện tại phải tiếp tục được kiểm tra.
- **FR-010**: Khi kết quả chỉ đạt một phần, hệ thống chỉ được trả các mục vượt qua kiểm tra độc lập và phải nêu đường dẫn cùng lý do của mục bị bỏ. Nếu không có tập mục an toàn, hệ thống phải trả lỗi có thể xử lý và không trả bản nháp.
- **FR-011**: Thông tin vận hành chỉ được chứa mã lỗi đã làm sạch, trạng thái, thời lượng và số lượng tối thiểu; không được chứa CV, thông tin liên hệ, lời nhắc, câu trả lời thô từ nhà cung cấp hoặc thông tin đăng nhập.
- **FR-012**: Thay đổi phải có thể tắt hoặc quay lại hành vi trước đó mà không cần sửa dữ liệu CV đã lưu; bản nháp đang chờ vẫn phải đọc, duyệt, từ chối hoặc hết hạn theo đúng quy tắc hiện hành.
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
- **SC-004**: Với bộ kiểm thử dữ kiện thiếu, sai nguồn, chỉ dẫn độc hại, quyền đồng ý bị rút và kết quả muộn, có 0 trường hợp nội dung không an toàn được chấp nhận hoặc ghi vào CV nguồn.
- **SC-005**: Với cùng bộ hồ sơ hợp lệ và cùng môi trường dịch vụ mục tiêu, tỷ lệ người dùng phải gửi lại yêu cầu hoặc chờ một kết quả sửa chữa bổ sung giảm ít nhất 30% so với đường cơ sở được ghi nhận trước thay đổi, trong khi các tiêu chí SC-002 và SC-003 vẫn đạt.
- **SC-006**: Ít nhất 95% yêu cầu hợp lệ hoàn tất hoặc trả hướng xử lý lỗi trong tối đa 300 giây kể từ khi ứng viên gửi yêu cầu.
- **SC-007**: 100% bản nháp được mở nhưng chưa được ứng viên xác nhận lưu giữ nguyên CV nguồn, hồ sơ và trạng thái tìm kiếm/chia sẻ.
- **SC-008**: Nếu môi trường phát triển local tiếp tục được hỗ trợ, 100% bộ kiểm thử liên quan đạt lại hợp đồng hiện có sau khi thay đổi.

## Assumptions

- “Model mạnh qua API” nghĩa là mô hình tạo CV hiện đã được nâng cấp; đặc tả không chọn một nhà cung cấp hoặc mô hình mới.
- Mặc định vẫn giữ môi trường local cho phát triển/kiểm thử. Chỉ bỏ hỗ trợ local nếu có quyết định riêng.
- Phạm vi chỉ gồm quy trình tạo CV và xử lý ngôn ngữ trực tiếp phục vụ bản nháp; không gồm CV matching, tìm việc, tìm kiếm hoặc xếp hạng.
- Quy tắc về bản nháp chờ duyệt, quyền đồng ý, truy nguồn dữ kiện, thời hạn và lưu CV từ đặc tả tạo CV hiện hành tiếp tục có hiệu lực.
- Bộ đánh giá có thể tái sử dụng dữ liệu tổng hợp và công cụ đánh giá chất lượng tạo CV hiện có; không dùng CV thật trong kiểm thử thông thường.
- Bất kỳ đánh giá trực tiếp nào với nhà cung cấp bên ngoài chỉ được chạy sau khi có chấp thuận về chi phí và điều khoản xử lý dữ liệu.
