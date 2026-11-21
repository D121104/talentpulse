# Đặc tả tính năng: Tác tử tạo CV TalentPulse

**Nhánh tính năng**: Chưa tạo (chỉ có tài liệu đặc tả)

**Ngày tạo**: 2026-11-19

**Trạng thái**: Bản nháp

**Yêu cầu ban đầu**: Nâng cấp chức năng tạo CV bằng AI để ứng viên nhận được bản nháp có cấu trúc, dựa trên dữ liệu của mình, tiếp tục dùng trình chỉnh sửa hiện tại và duyệt nội dung trước khi lưu.

## Nội dung đã làm rõ

### Phiên làm rõ 2026-11-19

- Q: Với tiêu chí SC-006, nên định nghĩa hồ sơ dùng để đo hiệu năng và thời hạn tối đa để trả kết quả hoặc lỗi có thể xử lý như thế nào? → A: Dùng hồ sơ có tối đa 50 mục trong mỗi danh sách dữ liệu đầu vào làm chuẩn và yêu cầu trả kết quả hoặc lỗi có thể xử lý trong tối đa 5 phút.
- Q: Khi ứng viên đang xem xét bản nháp, thao tác “tạo lại” nên tạo lại toàn bộ bản nháp hay chỉ mục được chọn? → A: Tạo lại mục được chọn; giữ nguyên các mục khác trong bản nháp.
- Q: Khi nói “mọi mục trong CV”, có bao gồm thông tin định danh/liên hệ hay chỉ các mục nội dung nghề nghiệp hiển thị? → A: Bao gồm mọi mục nội dung nghề nghiệp hiển thị; loại trừ tên, thông tin liên hệ, mã định danh và thông tin vận hành.
- Q: Với các mục hiện được sao chép hoặc bản địa hóa, “tái tạo” có nên mở rộng để AI viết lại mọi mục không? → A: Chạy lại xử lý hiện có theo mục; chỉ sinh lại nội dung vốn do AI tạo, các mục sao chép/bản địa hóa tiếp tục theo quy tắc hiện tại.
- Q: Trong trình chỉnh sửa, ứng viên cần nhận biết nguồn gốc nội dung CV ở mức nào? → A: Gắn nhãn cho từng mục là giữ từ nguồn, chuyển ngữ, AI đề xuất hoặc nội dung dự phòng.
- Q: Khi một hoặc nhiều mục CV không qua kiểm tra nguồn hoặc cấu trúc, khi nào hệ thống được trả bản nháp một phần thay vì báo lỗi toàn bộ? → A: Chỉ giữ mục hợp lệ; cảnh báo từng mục bị bỏ và lý do; nếu không xác định được phạm vi an toàn thì lỗi toàn bộ.
- Q: Nhà cung cấp AI được phép lưu dữ liệu CV trong bao lâu, và ai phải phê duyệt điều khoản đó trước khi gửi dữ liệu? → A: Cấm dùng dữ liệu để huấn luyện và yêu cầu không lưu giữ sau khi xử lý; người phụ trách quyền riêng tư/bảo mật phải phê duyệt điều khoản trước khi gửi.
- Q: Thành phần điều phối quá trình tạo CV có cần xem nội dung CV, tên ứng viên hoặc mã định danh để chọn bước xử lý không? → A: Không. Thành phần điều phối chỉ nhận thông tin cần để chọn bước xử lý; dữ liệu CV chỉ được chuyển tới thành phần tạo CV đã được cấp quyền.
- Q: Giới hạn chi tiết về cách xử lý nên được ghi ở đâu để đặc tả sản phẩm vẫn dễ đọc? → A: Đặc tả yêu cầu quá trình xử lý có giới hạn và có kết quả hoặc lỗi có thể xử lý trong 300 giây; thông số giới hạn cụ thể được ghi trong tài liệu thiết kế.
- Q: Đặc tả sản phẩm có nên tập trung vào điều người dùng cần và chuyển cách xây dựng cụ thể sang tài liệu thiết kế không? → A: Có. Đặc tả giữ hành vi và kết quả sản phẩm; tài liệu thiết kế giữ chi tiết triển khai.
- Q: Khi tạo CV mới, hệ thống có phải giữ nguyên cách chức năng hiện tại xử lý thông tin bị bỏ trống và các tên ngôn ngữ đang hỗ trợ không? → A: Có. Hành vi hiện tại được giữ nguyên; danh sách mẫu, ngôn ngữ và quy tắc nhập cụ thể được ghi trong tài liệu tích hợp.

### Session 2026-11-20

- Q: Đặc tả nên dùng tiếng Việt phổ thông xuyên suốt hay giữ lại các ký hiệu quy ước tiếng Anh? → A: Dùng tiếng Việt phổ thông; giữ nguyên mã FR/SC để truy vết.

## Hành trình người dùng và cách kiểm tra *(bắt buộc)*

### Hành trình 1 - Tạo CV nháp từ hồ sơ nghề nghiệp (Ưu tiên: P1)

Ứng viên yêu cầu tạo CV từ hồ sơ nghề nghiệp đã lưu, chọn ngôn ngữ, mẫu CV và tùy chọn một tin tuyển dụng phù hợp. Hệ thống tạo một bản nháp có thể chỉnh sửa, hiển thị bản nháp trong trình chỉnh sửa hiện tại và giữ nguyên các CV đã có.

**Vì sao ưu tiên**: Đây là hành trình cốt lõi giúp ứng viên biến thông tin đã cung cấp thành CV có thể dùng và chỉnh sửa.

**Cách kiểm tra độc lập**: Dùng hồ sơ thử nghiệm có kinh nghiệm, học vấn, dự án và kỹ năng; yêu cầu tạo CV có và không có tin tuyển dụng; xác nhận bản nháp mở được trong trình chỉnh sửa và không sửa nội dung CV nguồn.

**Tình huống chấp nhận**:

1. **Bối cảnh:** Ứng viên đã đăng nhập, có hồ sơ hợp lệ và đã cho phép xử lý dữ liệu bằng AI. **Khi:** Ứng viên yêu cầu tạo CV bằng mẫu và ngôn ngữ được hỗ trợ. **Thì:** Hệ thống tạo bản nháp theo hồ sơ đó và mở bản nháp trong trình chỉnh sửa hiện tại.
2. **Bối cảnh:** Ứng viên chọn một tin tuyển dụng được phép dùng làm ngữ cảnh. **Khi:** CV được tạo. **Thì:** Tin tuyển dụng chỉ ảnh hưởng đến cách ưu tiên và diễn đạt dữ kiện đã có trong hồ sơ, không trở thành dữ kiện về ứng viên.
3. **Bối cảnh:** Ứng viên đã có một hoặc nhiều CV. **Khi:** Tạo CV từ hồ sơ nghề nghiệp. **Thì:** Các CV hiện có giữ nguyên nội dung, phiên bản, trạng thái chính và khả năng được nhà tuyển dụng tìm kiếm.

---

### Hành trình 2 - Tạo CV mới từ CV hiện có mà không ghi đè (Ưu tiên: P1)

Ứng viên chọn một CV của chính mình để tạo phiên bản nháp mới, có thể chọn tin tuyển dụng nếu luồng hiện tại cho phép. Kết quả được mở để xem xét độc lập; bản CV đã lưu chỉ thay đổi sau khi ứng viên xác nhận lưu.

**Vì sao ưu tiên**: Người dùng cần cải thiện hoặc điều chỉnh CV theo cơ hội việc làm nhưng phải có khả năng quay lại bản đã lưu nếu không chấp nhận nội dung mới.

**Cách kiểm tra độc lập**: Lưu một CV nguồn, tạo bản nháp, từ chối hoặc rời trang mà không lưu; xác nhận CV nguồn không thay đổi. Lặp lại và xác nhận lưu để kiểm tra chỉ các chỉnh sửa được người dùng chấp nhận mới được lưu.

**Tình huống chấp nhận**:

1. **Bối cảnh:** CV nguồn thuộc về ứng viên và quyền truy cập còn hiệu lực. **Khi:** Ứng viên yêu cầu tạo CV mới. **Thì:** Hệ thống dùng dữ liệu của CV nguồn làm căn cứ và trả về một bản nháp riêng tương thích với trình chỉnh sửa.
2. **Bối cảnh:** Bản nháp đã được tạo. **Khi:** Ứng viên chỉnh sửa rồi xác nhận lưu. **Thì:** Hệ thống chỉ lưu nội dung người dùng xác nhận và xác nhận CV đích chưa thay đổi ngoài dự kiến.
3. **Bối cảnh:** Bản nháp đã được tạo. **Khi:** Ứng viên từ chối hoặc bỏ bản nháp. **Thì:** Nội dung và trạng thái của CV nguồn không bị thay đổi.

---

### Hành trình 3 - Xem, sửa, tạo lại hoặc từ chối bản nháp (Ưu tiên: P2)

Ứng viên xem các nội dung được đề xuất trong trình chỉnh sửa CV hiện tại, so sánh với dữ kiện nguồn, tự sửa phần chưa phù hợp, yêu cầu tạo lại hoặc từ chối bản nháp. Hệ thống chỉ lưu khi có hành động lưu rõ ràng của ứng viên.

**Vì sao ưu tiên**: Bản nháp do AI tạo cần được người có dữ kiện gốc kiểm tra trước khi trở thành nội dung CV họ sử dụng.

**Cách kiểm tra độc lập**: Tạo bản nháp có cảnh báo, sửa một mục, tạo lại một mục và từ chối một bản nháp khác; xác nhận các lựa chọn chỉ ảnh hưởng đến bản nháp tương ứng và không tự thay đổi CV nguồn.

**Tình huống chấp nhận**:

1. **Bối cảnh:** Bản nháp đã hoàn tất hoặc hoàn tất một phần. **Khi:** Ứng viên mở trình chỉnh sửa. **Thì:** Các mục nội dung, ngôn ngữ, mẫu và cảnh báo được hiển thị theo cách trình chỉnh sửa hiện tại hỗ trợ.
2. **Bối cảnh:** Một hoặc nhiều mục không đủ dữ kiện hoặc không vượt qua kiểm tra. **Khi:** Bản nháp được hoàn tất. **Thì:** Chỉ các mục còn lại tự vượt kiểm tra được đưa vào bản nháp một phần; mỗi mục bị bỏ có cảnh báo nêu vị trí và lý do. Nếu không xác định được tập mục an toàn, toàn bộ yêu cầu trả lỗi có thể xử lý. Nội dung thiếu nguồn không được trình bày như dữ kiện đã xác minh.
3. **Bối cảnh:** Ứng viên chọn tạo lại một mục hoặc từ chối bản nháp. **Khi:** Thao tác hoàn tất. **Thì:** Hệ thống chỉ thay mục được chọn và giữ nguyên các mục khác, hoặc loại bỏ đúng bản nháp bị từ chối; các CV khác không thay đổi.
4. **Bối cảnh:** Bản nháp có dữ kiện giữ từ nguồn, nội dung chuyển ngữ, nội dung AI đề xuất hoặc nội dung dự phòng. **Khi:** Ứng viên xem bản nháp. **Thì:** Từng mục được gắn đúng nhãn nguồn gốc để ứng viên biết phần nào cần kiểm tra.
5. **Bối cảnh:** Ứng viên yêu cầu tạo lại một mục nội dung hợp lệ trong bản nháp đang chờ xem xét. **Khi:** Xử lý mục đó hoàn tất. **Thì:** Chỉ mục được chọn thay đổi, các mục còn lại được giữ nguyên và bản nháp vẫn chờ ứng viên lưu.
6. **Bối cảnh:** Mục được chọn không hợp lệ, không xác định được dữ kiện nguồn, dữ liệu nguồn đã thay đổi hoặc xử lý thất bại. **Khi:** Yêu cầu tạo lại kết thúc. **Thì:** Bản nháp đang chờ xem xét không thay đổi; nếu bị bỏ quên quá 7 ngày, nội dung bị xóa và chủ sở hữu được báo bản nháp đã hết hạn.
7. **Bối cảnh:** Ứng viên quay lại khi bản nháp vẫn chờ xem xét. **Khi:** Mở lại bản nháp bằng tài khoản sở hữu. **Thì:** Bản nháp hiện tại được trả lại; nội dung hết hạn không được trả về.

---

### Hành trình 4 - Tiếp tục dùng chức năng hiện tại khi cách tạo mới gặp lỗi (Ưu tiên: P2)

Ứng viên tiếp tục sử dụng các luồng tạo CV hiện có trong thời gian chuyển đổi. Khi cách tạo CV mới gặp lỗi, ứng viên nhận được thông báo an toàn, có thể thử lại có kiểm soát hoặc tiếp tục bằng bản nháp chỉ chứa dữ kiện có sẵn.

**Vì sao ưu tiên**: Việc chuyển đổi không được làm gián đoạn hành trình tạo CV hoặc khiến lỗi AI làm mất dữ liệu đã lưu.

**Cách kiểm tra độc lập**: Yêu cầu tạo CV trong lúc chức năng mới chưa khả dụng, rồi thử lại khi chức năng mới gặp lỗi, bị hủy hoặc trả nội dung không hợp lệ; xác nhận ứng viên vẫn nhận được kết quả an toàn hoặc thông báo có thể xử lý và CV đã lưu không bị thay đổi ngoài ý muốn.

**Tình huống chấp nhận**:

1. **Bối cảnh:** Chức năng tạo CV mới chưa được bật. **Khi:** Ứng viên tạo CV. **Thì:** Luồng hiện tại vẫn dùng được và giữ nguyên cách ứng viên đã quen.
2. **Bối cảnh:** Cách tạo CV mới không thể hoàn tất. **Khi:** Hệ thống xử lý lỗi. **Thì:** Ứng viên nhận được bản nháp an toàn chỉ từ dữ kiện có sẵn hoặc thông báo lỗi có thể xử lý; hệ thống không tạo thêm kết quả ngoài ý muốn.
3. **Bối cảnh:** Ứng viên gửi lại cùng một yêu cầu với cùng dữ liệu nguồn. **Khi:** Hệ thống nhận yêu cầu lặp. **Thì:** Ứng viên nhận lại cùng kết quả xử lý thay vì tạo thêm CV hoặc yêu cầu trùng.
4. **Bối cảnh:** CV, hồ sơ hoặc mô tả công việc có câu chữ yêu cầu hệ thống thay đổi cách xử lý hay quyền truy cập. **Khi:** Hệ thống đọc nội dung đó. **Thì:** Nội dung chỉ được xem là dữ liệu và không thể thay đổi quyền hoặc phạm vi xử lý.
5. **Bối cảnh:** Hệ thống ghi nhận một yêu cầu thành công hoặc lỗi. **Khi:** Thông tin vận hành được lưu. **Thì:** Thông tin đó không chứa CV, thông tin cá nhân, nội dung hướng dẫn cho AI hoặc câu trả lời thô từ nhà cung cấp.

### Tình huống đặc biệt

- Hồ sơ nghề nghiệp hoặc CV nguồn trống, thiếu một số mục, có mục trùng hoặc chứa giá trị giữ chỗ; hệ thống không được tự điền dữ kiện cá nhân còn thiếu.
- Ứng viên không cấp quyền xử lý AI, rút quyền trong khi đang tạo, hoặc chính sách đồng ý thay đổi trước khi lưu; không gửi dữ liệu khi thiếu quyền và không lưu kết quả không còn được phép.
- CV nguồn, hồ sơ nghề nghiệp hoặc tin tuyển dụng thay đổi sau khi bắt đầu; kết quả cũ phải được đánh dấu lỗi thời và không được ghi đè dữ liệu mới.
- Tin tuyển dụng tùy chọn bị xóa, không còn hoạt động hoặc ứng viên không được phép dùng; hệ thống chỉ tiếp tục tạo CV không kèm tin tuyển dụng khi lựa chọn đó được chấp nhận, nếu không thì trả lời rõ rằng không thể tiếp tục với tin tuyển dụng đã chọn.
- Dữ kiện giữa hồ sơ nghề nghiệp và CV nguồn mâu thuẫn; hệ thống không tự chọn một nguồn làm sự thật mà phải giữ lại để ứng viên xác nhận hoặc bỏ nội dung liên quan.
- Nhà cung cấp AI trả nội dung sai cấu trúc, thiếu mục, sai ngôn ngữ, thêm mục không có nguồn, trộn dữ kiện giữa kinh nghiệm/dự án hoặc đưa ra số liệu, chứng chỉ, kỹ năng không được cung cấp.
- CV hoặc mô tả công việc có câu chữ yêu cầu hệ thống thay đổi cách xử lý, quyền hoặc nguồn dữ liệu; xem đó là nội dung tài liệu, không làm theo yêu cầu.
- Chỉ một số mục có thể tạo hoặc bản dịch không đạt yêu cầu; hệ thống giữ các mục hợp lệ, đánh dấu phần thiếu và không biến nội dung dự phòng thành dữ kiện do người dùng cung cấp.
- Người dùng hủy tác vụ trong khi mô hình đang chạy hoặc tác vụ hoàn tất sau khi đã hủy; kết quả muộn không được áp dụng hay lưu.
- Người dùng gửi lặp yêu cầu, nhiều yêu cầu đồng thời hoặc lưu từ hai cửa sổ cùng lúc; hệ thống không tạo kết quả trùng hoặc ghi đè thay đổi mới hơn.
- Yêu cầu lặp nhưng nhắm tới CV, tin tuyển dụng hoặc mục nội dung khác phải được phân biệt; dữ liệu và kết quả của các yêu cầu độc lập không được trộn lẫn.
- Người dùng cố truy cập CV, hồ sơ, tin tuyển dụng hoặc thao tác của tài khoản khác; hệ thống từ chối mà không tiết lộ sự tồn tại hay nội dung dữ liệu đó.
- Ứng viên yêu cầu tạo lại thông tin định danh/liên hệ hoặc mục không thuộc nội dung CV được hỗ trợ; hệ thống từ chối và giữ nguyên bản nháp đang chờ xem xét. Nếu dữ kiện nguồn đã thay đổi, hệ thống không được ghi kết quả cũ lên bản nháp.
- Khi ghi nhận thông tin vận hành hoặc xử lý lỗi, không lưu nội dung CV, thông tin cá nhân, nội dung hướng dẫn cho AI, mã định danh hoặc phản hồi thô từ nhà cung cấp.
- Giới hạn gói tài khoản không cho phép mẫu CV hoặc số lượng CV yêu cầu; hệ thống giữ nguyên dữ liệu và trả lý do có thể hiểu được.

## Yêu cầu *(bắt buộc)*

### Yêu cầu chức năng

- **FR-001**: Chỉ ứng viên đã đăng nhập và có quyền sử dụng hồ sơ nghề nghiệp hoặc CV mới được yêu cầu tạo CV từ dữ liệu đó. Hệ thống phải kiểm tra quyền trước khi dùng hoặc thay đổi dữ liệu.
- **FR-002**: Hệ thống phải lấy dữ liệu ứng viên từ hồ sơ nghề nghiệp hoặc CV hiện có của chính người yêu cầu. Bản nháp phải phân biệt dữ kiện giữ từ nguồn với câu chữ do AI diễn đạt lại. Việc tạo CV không được sửa hồ sơ nghề nghiệp nguồn.
- **FR-003**: Hệ thống chỉ được dùng tin tuyển dụng đang hoạt động mà ứng viên được phép chọn; tin tuyển dụng chỉ giúp ưu tiên dữ kiện đã có, không phải bằng chứng về ứng viên. Nếu tin tuyển dụng tùy chọn không còn phù hợp, hệ thống chỉ tiếp tục không kèm tin đó khi lựa chọn này được chấp nhận; nếu không, phải nói rõ không thể tiếp tục.
- **FR-004**: Hệ thống chỉ gửi dữ liệu nghề nghiệp cần thiết cho việc tạo CV tới nhà cung cấp AI đã được cấp quyền sử dụng. Thành phần điều phối không được nhận nội dung CV, tên, thông tin liên hệ hoặc mã định danh; dữ liệu gửi tới nhà cung cấp cũng không được có các thông tin này. Nhà cung cấp không được dùng dữ liệu CV để huấn luyện và phải cam kết không lưu giữ sau khi xử lý; người phụ trách quyền riêng tư/bảo mật phải phê duyệt điều khoản trước khi gửi dữ liệu. Nếu điều khoản chưa rõ, chưa được phê duyệt hoặc không đáp ứng các yêu cầu trên, hệ thống không được gửi dữ liệu. Thông tin vận hành không được chứa nội dung CV, thông tin cá nhân, hướng dẫn cho AI, mã định danh, thông tin đăng nhập hoặc phản hồi thô từ nhà cung cấp; chỉ được lưu thông tin tối thiểu không định danh.
- **FR-005**: Hệ thống phải có sự cho phép xử lý dữ liệu còn hiệu lực cho mục đích tạo CV trước khi thu thập hoặc xử lý dữ liệu; trước khi lưu kết quả, phải kiểm tra lại sự cho phép này và các điều kiện liên quan.
- **FR-006**: Hệ thống phải tiếp tục hỗ trợ các mẫu, ngôn ngữ và cách nhập thông tin hiện có; thông tin bị bỏ trống phải được xử lý như trước. Bản nháp phải tiếp tục hiển thị và chỉnh sửa được trong trình chỉnh sửa hiện tại.
- **FR-007**: Các luồng tạo CV hiện có phải tiếp tục hoạt động như trước. Người dùng không phải cung cấp thêm thông tin bắt buộc hoặc chuyển sang trình chỉnh sửa khác; nếu không dùng chức năng tạo lại một mục thì hành vi hiện tại phải được giữ nguyên.
- **FR-008**: Quá trình tạo CV phải có giới hạn rõ ràng và phải trả bản nháp hoặc thông báo lỗi có thể xử lý trong tối đa 300 giây kể từ khi người dùng gửi yêu cầu, kể cả thời gian chờ. Chi tiết giới hạn kỹ thuật được ghi trong tài liệu thiết kế và không được kéo dài thời hạn này.
- **FR-009**: Hệ thống chỉ được xử lý dữ liệu ứng viên đã được xác thực và cho phép dùng để tạo CV. Quy trình không được tự mở rộng quyền, chọn dữ liệu của người khác, truy cập nguồn dữ liệu tùy ý hoặc ghi trực tiếp lên CV đã lưu trước khi ứng viên chấp thuận.
- **FR-010**: Ứng viên phải biết yêu cầu tạo CV đang xử lý, đã hoàn tất, bị hủy, thất bại hoặc không còn dựa trên dữ liệu mới nhất. Thông tin lưu lại không được chứa CV hoặc hội thoại AI nếu không cần thiết. Bản nháp không được lưu hoặc từ chối trong vòng 7 ngày sẽ hết hạn; hệ thống xóa nội dung nhưng vẫn cho chủ sở hữu biết bản nháp đã hết hạn.
- **FR-011**: Nội dung phải theo cấu trúc CV hiện hành, gồm các mục và thứ tự hiển thị được hỗ trợ. Mọi bản nháp phải được kiểm tra trước khi đưa đến trình chỉnh sửa.
- **FR-012**: Mọi khẳng định về kinh nghiệm, học vấn, dự án, chứng chỉ, thành tích định lượng hoặc kỹ năng phải có căn cứ từ dữ liệu ứng viên được phép sử dụng. Hệ thống không được tự tạo hoặc suy diễn dữ kiện, cũng không được biến yêu cầu tuyển dụng thành thông tin về ứng viên.
- **FR-013**: Mọi mục nội dung trong bản nháp phải truy được về dữ kiện nguồn được phép; câu chữ AI tạo cho kinh nghiệm/dự án phải truy được về mục nguồn tương ứng. Các mục khác phải giữ nguyên dữ kiện nguồn và chỉ được sao chép, nhóm hoặc chuyển ngữ theo cách hiện có. Trình chỉnh sửa phải cho biết từng mục được giữ từ nguồn, chuyển ngữ, AI đề xuất hay dự phòng. Nếu không chứng minh được nguồn hoặc không xác định duy nhất được mục nguồn, hệ thống phải bỏ hoặc đánh dấu nội dung đó, không trình bày nó như dữ kiện đã xác minh.
- **FR-014**: Hệ thống phải giải thích tại mục liên quan khi nội dung bị bỏ qua, thiếu, sai ngôn ngữ hoặc không thể xác thực. Chỉ được trả bản nháp một phần khi từng mục được giữ lại đáp ứng yêu cầu về cấu trúc và dữ kiện; nếu không xác định được phần an toàn thì phải trả thông báo lỗi có thể xử lý. Nội dung dự phòng chỉ được dùng dữ kiện đã có và phải được nhận biết là nội dung dự phòng, không giả dạng dữ kiện đã xác minh.
- **FR-015**: Kết quả phải được trình bày dưới dạng bản nháp để ứng viên xem và chỉnh sửa. Việc tạo hoặc mở bản nháp không được tự ghi đè CV nguồn, xuất bản CV, bật khả năng tìm kiếm hoặc thay đổi trạng thái chia sẻ.
- **FR-016**: Ứng viên phải có thể sửa, yêu cầu xử lý lại đúng một mục nội dung nghề nghiệp đang xem hoặc từ chối bản nháp. Việc xử lý lại phải theo cách hiện có của loại nội dung đó, không mở rộng những loại nội dung được AI tạo. Thông tin định danh, liên hệ và thông tin vận hành không được xử lý lại. Kết quả chỉ được thay đổi mục đã chọn, giữ nguyên các mục khác và không làm mất bản nháp nếu dữ kiện nguồn thay đổi hoặc xử lý lại thất bại. Chỉ cập nhật nội dung vào CV đã lưu sau khi ứng viên chủ động lưu và hệ thống xác nhận quyền sở hữu cùng tính mới của dữ liệu.
- **FR-017**: Khi yêu cầu cần thời gian xử lý, ứng viên phải xem được tiến độ hoặc hủy yêu cầu theo cách hiện có. Kết quả bị hủy, đã lỗi thời hoặc dựa trên dữ liệu nguồn đã thay đổi không được áp dụng vào CV.
- **FR-018**: Hệ thống phải nhận biết yêu cầu lặp để không tạo CV hoặc lưu thay đổi trùng lặp; yêu cầu dựa trên dữ liệu khác nhau phải được xử lý riêng và không ghi đè thay đổi mới hơn.
- **FR-019**: Khi cách tạo CV mới gặp lỗi, hệ thống phải trả thông báo lỗi có thể xử lý hoặc bản nháp một phần chỉ gồm các mục đáp ứng yêu cầu về cấu trúc và dữ kiện, kèm lý do cho từng mục bị bỏ. Nếu không xác định được phần an toàn thì phải trả lỗi thay vì bản nháp. Hệ thống không được tạo thêm kết quả ngoài kiểm soát trong cùng một yêu cầu. Luồng tạo CV hiện tại vẫn phải dùng được khi cách mới bị tắt; bản nháp đang chờ xem xét vẫn phải tuân theo quy tắc lưu và chấp thuận của ứng viên.
- **FR-020**: Mọi lần thử lại phải có giới hạn, không lặp vô hạn hoặc tạo kết quả trùng. Yêu cầu lặp lại với cùng dữ liệu phải trả cùng kết quả xử lý; lần thử mới sau thất bại phải được phân biệt. Hết thời gian hoặc lỗi từ nhà cung cấp không được khiến kết quả đến muộn được áp dụng.
- **FR-021**: Hệ thống chỉ được lưu thông tin vận hành không định danh, ở mức tối thiểu cần thiết để tìm hiểu tình trạng, thời lượng và loại lỗi. Không được lưu CV, thông tin cá nhân, hướng dẫn cho AI, thông tin đăng nhập hoặc câu trả lời thô từ nhà cung cấp.
- **FR-022**: Hệ thống phải xem CV, hồ sơ nghề nghiệp, mô tả công việc và nội dung bên ngoài là dữ liệu, không phải chỉ dẫn điều khiển. Nội dung đó không được thay đổi quyền truy cập hoặc khiến hệ thống dùng dữ liệu ngoài mục đích tạo CV.

### Liên kết yêu cầu với tình huống chấp nhận

| Requirement | Acceptance coverage |
|---|---|
| FR-001 | Hành trình 1/TH1, Hành trình 2/TH1; tình huống truy cập chéo; SC-003 |
| FR-002 | Hành trình 1/TH2, Hành trình 2/TH2–TH3; SC-004 |
| FR-003 | Hành trình 1/TH1; tin tuyển dụng không hợp lệ; SC-002 |
| FR-004 | Hành trình 4/TH5; thông tin vận hành; SC-003; nhà cung cấp được duyệt |
| FR-005 | Hành trình 1/TH1; thiếu hoặc rút quyền xử lý dữ liệu; SC-003 |
| FR-006 | Hành trình 3/TH1; SC-001, SC-005 |
| FR-007 | Hành trình 4/TH1; SC-005 |
| FR-008 | Hành trình 4/TH1–TH2; SC-006 |
| FR-009 | Hành trình 4/TH2, TH4; truy cập chéo; SC-003 |
| FR-010 | Hành trình 3/TH7; bản nháp hết hạn |
| FR-011 | Hành trình 3/TH1; SC-001 |
| FR-012 | Hành trình 3/TH2; nội dung thiếu nguồn; SC-002 |
| FR-013 | Hành trình 3/TH2, TH4–TH6; SC-002 |
| FR-014 | Hành trình 3/TH1–TH2; nội dung một phần hoặc sai ngôn ngữ; SC-001 |
| FR-015 | Hành trình 2/TH2–TH3; SC-004 |
| FR-016 | Hành trình 3/TH3, TH5–TH6; mục được chọn không hợp lệ; SC-004 |
| FR-017 | Hành trình 4/TH2; hủy hoặc dữ liệu cũ; SC-004 |
| FR-018 | Hành trình 4/TH3; yêu cầu lặp hoặc đồng thời; SC-004 |
| FR-019 | Hành trình 4/TH1–TH2; SC-005 |
| FR-020 | Hành trình 4/TH2–TH3; thử lại hoặc kết quả muộn; SC-004 |
| FR-021 | Hành trình 4/TH5; thông tin vận hành; SC-003 |
| FR-022 | Hành trình 4/TH4; chỉ dẫn độc hại trong nội dung nguồn; SC-003 |

### Dữ liệu chính *(nếu tính năng có dữ liệu)*

- **Nguồn CV được ủy quyền**: Hồ sơ nghề nghiệp hoặc CV của ứng viên, cùng những mục dữ liệu được phép dùng làm căn cứ.
- **Ngữ cảnh công việc tùy chọn**: Tin tuyển dụng đang hoạt động mà ứng viên được phép chọn; chỉ dùng để ưu tiên cách trình bày dữ kiện đã có.
- **Yêu cầu tạo CV**: Yêu cầu của ứng viên, dữ liệu nguồn được phép dùng, quyền xử lý và tình trạng hoàn tất.
- **Bản nháp CV**: Nội dung có cấu trúc theo mẫu và ngôn ngữ hiện có, có thể chỉnh sửa, kèm cảnh báo và nguồn dữ kiện; chưa phải CV đã được người dùng chấp thuận.
- **Quyết định xem xét**: Hành động của ứng viên đối với bản nháp: sửa, lưu, tạo lại hoặc từ chối; chỉ nội dung được xác nhận mới được cập nhật vào CV đã lưu.

## Tiêu chí thành công *(bắt buộc)*

### Kết quả đo lường được

- **SC-001**: 100% bản nháp được cung cấp cho trình chỉnh sửa có đầy đủ cấu trúc và mục nội dung được hỗ trợ; bản nháp không đáp ứng yêu cầu không được trình bày như kết quả hoàn tất.
- **SC-002**: Trong bộ dữ liệu mẫu có ít nhất một tình huống cho mỗi mục nội dung có thể tạo lại, 100% dữ kiện trong bản nháp phải liên kết với dữ liệu nguồn được phép hoặc được đánh dấu cần ứng viên xác nhận; nhãn nguồn gốc phải đúng và không có dữ kiện thiếu nguồn nào được trình bày là đã xác minh. Mỗi tình huống mẫu ghi rõ nguồn và nhãn mong đợi; bất đồng giữa người đánh giá phải được giải quyết trước khi dùng làm tiêu chuẩn.
- **SC-003**: Trong kiểm thử quyền truy cập đa tài khoản, 100% yêu cầu truy cập chéo người dùng bị từ chối và không làm lộ nội dung hoặc sự tồn tại của CV/hồ sơ khác.
- **SC-004**: Trong kiểm thử đồng thời, hủy, kết quả muộn, phiên bản lỗi thời và gửi lại cùng khóa chống trùng, có 0 lần ghi đè CV nguồn hoặc tạo bản ghi ngoài ý muốn.
- **SC-005**: 100% hành trình tạo CV từ hồ sơ hoặc CV hiện có, theo dõi hoặc hủy yêu cầu, xem kết quả và lưu CV tiếp tục khả dụng theo cách hiện tại; người dùng hiện hữu không phải thay đổi thông tin bắt buộc đã cung cấp hoặc chuyển sang trình chỉnh sửa mới.
- **SC-006**: Với hồ sơ chuẩn có tối đa 50 mục trong mỗi danh sách dữ liệu nghề nghiệp, ít nhất 95% yêu cầu hợp lệ phải hoàn tất hoặc trả hướng xử lý lỗi trong tối đa 5 phút kể từ khi người dùng gửi yêu cầu, kể cả thời gian chờ xử lý.
- **SC-007**: Trong nhóm ít nhất 30 ứng viên đã cho phép xử lý dữ liệu, ít nhất 90% tự tìm thấy bản nháp đang chờ xem xét và hoàn tất tác vụ được giao (mở rồi lưu bản nháp, tạo lại một mục hoặc từ chối) mà không cần người khác hướng dẫn; chỉ tính người đã bắt đầu tác vụ hợp lệ.
- **SC-008**: Sau khi xem bản nháp nhưng trước khi chỉnh sửa hoặc lưu, mỗi người trong nhóm thử nghiệm trả lời câu “Bản nháp này hữu ích đến mức nào như điểm khởi đầu cho CV của bạn?” theo thang 1–5; trung bình của ít nhất 30 câu trả lời hợp lệ đạt tối thiểu 4/5. Dữ kiện thiếu căn cứ được ghi nhận riêng, không gộp với lỗi trình bày.

## Giả định

- Hồ sơ nghề nghiệp, CV đã lưu, tin tuyển dụng, sự cho phép xử lý dữ liệu, giới hạn mẫu/gói và cách chỉnh sửa hiện tại tiếp tục là nguồn và quy tắc nghiệp vụ có thẩm quyền.
- Thông tin người dùng tự cung cấp được hiểu là dữ liệu họ nhập vào hồ sơ nghề nghiệp hoặc CV hiện có; đặc tả không bổ sung một kênh nhập tự do mới.
- Ngữ cảnh công việc tùy chọn chỉ gồm dữ liệu tuyển dụng mà luồng hiện tại cho phép chọn; đặc tả không mở rộng sang nhập hoặc tải lên mô tả công việc tùy ý.
- Bản nháp có thể được lưu riêng để hỗ trợ luồng hiện tại, nhưng không được thay đổi nội dung CV nguồn, trạng thái chính hoặc chia sẻ trước khi người dùng xác nhận.
- Thông tin liên hệ được lấy lại từ nguồn có thẩm quyền sau khi tạo nội dung nếu cần cho trình chỉnh sửa; thành phần tạo câu chữ không cần nhận thông tin này.
- Cách tạo CV hiện tại được duy trì làm phương án quay lại cho từng yêu cầu mới cho đến khi các tiêu chí tương thích, độ tin cậy dữ kiện và vận hành được xác minh.
- Tính năng này không thay đổi nền tảng điều phối AI dùng chung, không xây lại trình chỉnh sửa CV và không bao gồm trợ lý hội thoại nghề nghiệp.

## Ngoài phạm vi

- Xây dựng trợ lý hội thoại nghề nghiệp hoặc thay đổi cách hệ thống hiểu mục đích hội thoại.
- Xây dựng lại trình chỉnh sửa CV, mẫu CV mới hoặc cơ chế lưu trữ CV thay thế.
- Thiết kế lại nền tảng điều phối AI dùng chung hoặc mở rộng quyền truy cập dữ liệu ngoài phạm vi được cấp.
- Tạo dữ kiện hồ sơ từ nguồn bên ngoài, tự điền nội dung không có trong hồ sơ/CV, hoặc tự động xuất bản/chia sẻ CV.
- Thay đổi chức năng tuyển dụng, matching, gợi ý việc làm hoặc các luồng sản phẩm không trực tiếp phục vụ tạo và xem xét bản nháp CV.
