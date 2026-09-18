# Real-World Examples: AI Slop vs Authentic Human Writing

This guide shows side-by-side transformations across UI interfaces, product copy, system architecture documentation, and developer communications.

---

## 1. Web UI & Component Copy

### Scenario A: Landing Page Hero Section
- ❌ **AI Generated**:
  > **Chào mừng đến với TalentPulse: Định hình tương lai tuyển dụng nhân tài**
  > Trong bối cảnh công nghệ không ngừng biến đổi, TalentPulse tự hào đóng vai trò như một cầu nối vững chắc, kết nối những ứng viên xuất sắc với các tập đoàn hàng đầu. Với thuật toán AI đột phá, chúng tôi không chỉ tối ưu hóa quy trình tìm việc mà còn mở ra một hành trình sự nghiệp thăng hoa, nơi tiềm năng của bạn được tỏa sáng rực rỡ.
  > `[Khám phá hành trình ngay hôm nay 🚀]`

- ✅ **Human Written**:
  > **Nền tảng tuyển dụng & kết nối việc làm IT**
  > Tìm việc làm Developer, DevOps, Designer từ hơn 500 công ty công nghệ đã xác thực. Nhận phản hồi tuyển dụng trong vòng 48 giờ.
  > `[Tìm việc làm]` `[Đăng tin tuyển dụng]`

---

### Scenario B: Pricing Package Description
- ❌ **AI Generated**:
  > **HR Premium Enterprise: Giải pháp toàn diện nâng tầm doanh nghiệp**
  > Gói dịch vụ này đóng vai trò là một minh chứng cho cam kết của chúng tôi đối với sự phát triển của bạn. Sở hữu quyền năng tiếp cận kho tàng hồ sơ ứng viên phong phú, đăng tin không giới hạn và gắn nhãn HOT độc quyền, trao quyền cho các chuyên viên nhân sự bứt phá mọi giới hạn tuyển dụng trong kỷ nguyên số.

- ✅ **Human Written**:
  > **HR Premium (1 Năm)**
  > - Đăng tin tuyển dụng không giới hạn (gắn nhãn HOT cho 10 tin).
  > - Mở khóa xem thông tin ứng viên không giới hạn.
  > - 1.500 lượt phân tích hồ sơ bằng AI.
  > - Giá: 2.390.000 đ / năm.

---

### Scenario C: Empty States & System Alerts
- ❌ **AI Generated (Empty State)**:
  > **Không gian của bạn đang chờ đón những điều kỳ diệu!**
  > Hiện tại chưa có đơn ứng tuyển nào được ghi nhận tại đây. Hãy tiếp tục cập nhật tin tuyển dụng để thu hút những ứng viên tài năng trong bức tranh thị trường sôi động.

- ✅ **Human Written (Empty State)**:
  > **Chưa có ứng viên ứng tuyển**
  > Tin tuyển dụng vừa đăng có thể mất vài giờ để tiếp cận ứng viên. Bạn có thể chia sẻ đường dẫn tin đăng để thu hút thêm hồ sơ.
  > `[Sao chép liên kết tin tuyển dụng]`

- ❌ **AI Generated (Error Toast)**:
  > *Rất tiếc vì sự bất tiện này! Hệ thống của chúng tôi đã gặp phải sự cố không mong muốn trong khi xử lý dữ liệu của bạn. Chúng tôi đang nỗ lực hết mình để khắc phục.*

- ✅ **Human Written (Error Toast)**:
  > *Không thể lưu thay đổi. Vui lòng kiểm tra lại kết nối mạng và thử lại.*

---

## 2. Technical Documentation & Architecture

### Scenario D: Service Description (Backend NestJS)
- ❌ **AI Generated**:
  > **PaymentsService: Trọng tâm của hệ thống tài chính TalentPulse**
  > PaymentsService đóng vai trò then chốt trong việc quản lý dòng tiền của nền tảng, tích hợp liền mạch với cổng thanh toán PayOS hiện đại. Bằng cách điều phối nhịp nhàng giữa webhook, cơ chế xác thực HMAC-SHA256 tinh vi và hàng đợi Bull Queue, service này không chỉ bảo đảm tính toàn vẹn của giao dịch mà còn nâng tầm trải nghiệm thanh toán của người dùng lên một chuẩn mực mới, phản ánh sự tận tâm trong từng dòng mã.

- ✅ **Human Written**:
  > **PaymentsService**
  > Xử lý tạo link thanh toán PayOS và xác thực webhook.
  > - **Kích hoạt gói**: Tự động gia hạn `premiumExpiresAt` và nạp quota AI khi nhận webhook `PAID`.
  > - **Hết hạn đơn**: Chạy cron job quét các đơn pending quá 15 phút và chuyển sang `EXPIRED`.
  > - **Bảo mật**: Xác thực chữ ký số bằng thuật toán HMAC-SHA256 với `PAYOS_CHECKSUM_KEY`.

---

### Scenario E: Release Notes & Changelogs
- ❌ **AI Generated**:
  > **Thông báo phát hành phiên bản 2.4.0: Một bước tiến vượt bậc**
  > Chúng tôi vô cùng hào hứng giới thiệu bản cập nhật 2.4.0, đánh dấu một cột mốc quan trọng trong lộ trình phát triển. Bản phát hành này mang đến một bức tranh toàn diện về các cải tiến:
  > * **Giao diện quản trị viên:** Được thiết kế tỉ mỉ, giúp nâng tầm trải nghiệm giám sát.
  > * **Hiệu năng cơ sở dữ liệu:** Được củng cố mạnh mẽ, mở đường cho khả năng mở rộng không giới hạn.
  > * **Bảo mật:** Tăng cường lớp phòng thủ, bảo vệ người dùng khỏi mọi mối đe dọa tiềm ẩn.
  > Nhìn về tương lai, chúng tôi cam kết sẽ không ngừng đổi mới để mang lại giá trị bền vững.

- ✅ **Human Written**:
  > **Changelog v2.4.0**
  > - **Admin Dashboard**: Thêm màn hình thống kê doanh thu, quản lý gói Premium và danh sách HR chờ duyệt.
  > - **Database Migration**: Thêm bảng `premium_packages` và các cột `premiumPackageId`, `aiQuotaRemaining` trong bảng `users`.
  > - **Bug Fixes**: Sửa lỗi `EntityPropertyNotFoundError` khi tải quan hệ công ty của người dùng.

---

## 3. Pull Request & Commit Messages

- ❌ **AI Generated PR Summary**:
  > *This pull request meticulously refactors the candidate search algorithm, fostering a harmonious synergy between PostgreSQL and Elasticsearch. By seamlessly bridging these technologies, it unlocks unprecedented performance gains, serving as a testament to our engineering excellence.*

- ✅ **Human Written PR Summary**:
  > *Sync approved candidates to Elasticsearch index `candidates_v1`. Replaces full-table Postgres ILIKE queries with BM25 keyword matching, reducing p95 search latency from 450ms to 65ms.*
