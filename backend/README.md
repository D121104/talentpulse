# Job Recruitment Backend API

Backend API cho ứng dụng tuyển dụng việc làm, xây dựng trên NestJS framework.

## Tech Stack

- **Framework**: NestJS 9.x
- **Database**: MongoDB với Mongoose
- **Authentication**: JWT + Passport (Local, Google OAuth)
- **File Storage**: Cloudinary
- **Queue**: Bull (Redis-based)
- **Real-time**: Socket.IO
- **AI/ML**: @xenova/transformers (all-MiniLM-L6-v2)
- **PDF Generation**: Puppeteer
- **Email**: Nodemailer + Handlebars templates

## Tính năng chính

### 1. Authentication & Authorization

- **Đăng ký/Đăng nhập**: Email/Password hoặc Google OAuth
- **JWT Tokens**: Access token + Refresh token
- **Roles**: USER, HR, ADMIN
- **Đăng ký HR**: Yêu cầu Admin duyệt trước khi hoạt động
- **Khóa tài khoản**: Admin có thể khóa user với lý do

### 2. Quản lý Công ty (Companies)

- **Tạo công ty**: HR tạo công ty mới (cần Admin duyệt để kích hoạt)
- **Duyệt công ty**: Admin kích hoạt/khóa công ty
- **Theo dõi công ty**: User có thể follow/unfollow công ty
- **Yêu cầu tham gia**: HR có thể request join công ty đã tồn tại
- **Quản lý HR**: Người tạo công ty có quyền duyệt/từ chối HR requests
- **Thông báo**: Tự động gửi notification khi có sự kiện (follow, duyệt, etc.)

### 3. Quản lý Công việc (Jobs)

- **CRUD Jobs**: HR tạo/sửa/xóa job cho công ty của mình
- **Thông tin job**: Tên, mô tả, skills, salary, level, location, deadline
- **Tự động thông báo**: Gửi notification đến followers khi công ty đăng job mới
- **Re-process CV**: Khi job description thay đổi, tự động re-process tất cả CV đã apply

### 4. Quản lý CV (UserCV)

#### Định dạng hỗ trợ
- **PDF**: Sử dụng `pdf-parse` để extract text
- **DOCX**: Sử dụng `mammoth` để extract text
- **Online CV**: Tạo CV trực tuyến với templates

> **Lưu ý**: Hệ thống không sử dụng OCR. Chỉ extract text trực tiếp từ file PDF/DOCX. PDF dạng scan/image sẽ không extract được nội dung.

#### Quy trình xử lý CV
1. User upload file PDF/DOCX lên Cloudinary
2. Backend tự động download và parse text từ file
3. Extract các sections: skills, education, experience, certificates
4. Lưu parsedText và structured data vào database
5. Dữ liệu này được sử dụng cho AI matching sau này

#### Tính năng
- Đặt CV chính (primary CV)
- Xem danh sách CV của user
- Xóa CV (auto chuyển primary sang CV khác)

### 5. Online CV Builder

- **Templates**: Hỗ trợ nhiều template (template1, template2,...)
- **Nội dung**: Thông tin cá nhân, học vấn, kinh nghiệm, kỹ năng, chứng chỉ, hoạt động, giải thưởng
- **Export PDF**: Sử dụng Puppeteer + Handlebars để generate PDF
- **Tự động tạo UserCV**: Khi export PDF, tự động tạo entry trong UserCV với parsed data

### 6. Ứng tuyển (Applications)

#### Quy trình ứng tuyển
1. User chọn CV và submit application cho job
2. Backend tạo application với status PENDING
3. **Async CV Processing**: Queue job để AI matching (không block user)
4. HR nhận notification về application mới

#### Trạng thái Application
- `PENDING`: Chờ review
- `REVIEWING`: Đang xem xét
- `APPROVED`: Đã chấp thuận
- `REJECTED`: Đã từ chối

#### Tính năng cho HR
- Xem danh sách applications theo job
- Cập nhật trạng thái application
- Tìm kiếm application theo nội dung CV

### 7. AI Matching System

#### Kiến trúc
```
Application Created
        ↓
Queue CV Processing (Bull)
        ↓
CV Processing Processor
        ↓
AI Matching Service
        ↓
CVMatchResult (DB)
```

#### Cách hoạt động
1. **Text Extraction**: Sử dụng pre-parsed text từ UserCV (không download lại file)
2. **Embedding Generation**: Sử dụng `all-MiniLM-L6-v2` để tạo vector embeddings
3. **Semantic Similarity**: Tính cosine similarity giữa CV embedding và JD embedding
4. **Skill Matching**: So khớp skills trong CV với requirements của job
5. **Score Calculation**:
   - 40% semantic similarity
   - 60% skill match ratio
   - Bonus points cho high skill match

#### API cho HR
- `GET /applications/job/:jobId/ranked`: Lấy danh sách ứng viên đã xếp hạng theo match score
- `GET /applications/job/:jobId/search`: Tìm kiếm theo skills, education, address, certificates
- `GET /applications/job/:jobId/processing-status`: Xem trạng thái processing

#### CVMatchResult Fields
```typescript
{
  cvId: ObjectId,
  userId: ObjectId,
  jobId: ObjectId,
  applicationId: ObjectId,
  cvText: string,
  cvEmbedding: number[],
  matchScore: number,        
  matchedSkills: string[],
  missingSkills: string[],
  explanation: string,
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
  processedAt: Date
}
```

### 8. Notifications

#### Loại thông báo
- `JOB`: Thông báo về công việc mới
- `RESUME`: Thông báo về application
- `COMPANY`: Thông báo về công ty
- `APPLICATION`: Thông báo về đơn ứng tuyển
- `SYSTEM`: Thông báo hệ thống

#### Real-time
- Sử dụng Socket.IO
- User connect với userId
- Server emit notifications theo userId

### 9. Subscribers (Email Notifications)

- User đăng ký nhận email về jobs theo skills
- Cron job chạy hàng ngày (8AM) gửi email
- Batch processing để tránh overwhelm mail server

### 10. Comments

- Nested comments (tree structure) cho company
- Sử dụng left/right để quản lý hierarchy

## Cấu trúc thư mục

```
src/
├── ai-matching/          # AI matching service & processor
│   ├── ai-matching.service.ts
│   ├── cv-processing.service.ts
│   ├── cv-processing.processor.ts
│   └── schemas/
├── applications/         # Job applications
├── auth/                 # Authentication
├── comments/            # Company comments
├── companies/           # Company management
├── files/               # File upload (Cloudinary)
├── jobs/                # Job postings
├── mail/                # Email service
├── notifications/       # Notifications + WebSocket
├── online-cvs/          # Online CV builder
│   └── templates/       # Handlebars templates
├── otps/                # OTP verification
├── redis/               # Redis cache service
├── skills/              # Skills management
├── subscribers/         # Email subscribers
├── usercvs/             # User CVs management
└── users/               # User management
```

## Environment Variables

```env
# MongoDB
MONGO_URL=mongodb://localhost:27017/job-recruitment

# JWT
JWT_SECRET=your-jwt-secret
JWT_EXPIRES_IN=1d
JWT_REFRESH_SECRET=your-refresh-secret
JWT_REFRESH_EXPIRES_IN=7d

# Redis (for Bull queue)
REDIS_HOST=localhost
REDIS_PORT=6379

# Cloudinary
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=http://localhost:8080/api/v1/auth/google/callback

# Mail
MAIL_HOST=smtp.gmail.com
MAIL_USER=your-email
MAIL_PASSWORD=your-app-password
MAIL_FROM="Job Recruitment" <noreply@example.com>

# Frontend URL
URL_FRONTEND=http://localhost:3000
```

## Installation

```bash
# Install dependencies
npm install

# Development
npm run dev

# Build
npm run build

# Production
npm run start:prod
```

## API Documentation

Swagger UI available at: `http://localhost:8080/api`

## Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| @nestjs/core | 9.4.0 | NestJS framework |
| mongoose | 7.1.0 | MongoDB ODM |
| @nestjs/jwt | 10.0.3 | JWT authentication |
| @nestjs/bull | 10.0.1 | Queue processing |
| @xenova/transformers | 2.17.2 | AI embeddings |
| pdf-parse | 1.1.1 | PDF text extraction |
| mammoth | 1.11.0 | DOCX text extraction |
| puppeteer | 24.37.5 | PDF generation |
| cloudinary | 2.1.0 | File storage |
| socket.io | 4.8.3 | Real-time communication |

## Notes

### CV Processing
- **Không sử dụng OCR**: Chỉ extract text trực tiếp từ PDF/DOCX
- **PDF scan/image**: Sẽ không extract được nội dung, chỉ hoạt động với PDF có text layer
- **Async processing**: CV được parse async sau khi upload, AI matching cũng chạy async

### AI Matching
- **Model**: all-MiniLM-L6-v2 (sentence transformer)
- **Embedding size**: 384 dimensions
- **Queue**: Bull + Redis, retry 3 lần với exponential backoff
- **Pre-calculated**: Kết quả được lưu trong CVMatchResult, query nhanh khi HR xem

### Security
- Helmet middleware
- Rate limiting với @nestjs/throttler
- Soft delete pattern (không xóa vĩnh viễn)
- Role-based access control
