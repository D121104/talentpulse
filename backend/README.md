# Job Recruitment Backend API

NestJS backend cho nền tảng tuyển dụng TalentPulse.

## Current implementation contract

NestJS là owner của business APIs, authorization, users, companies, jobs,
applications, PostgreSQL/RDS canonical persistence, job lifecycle, transactional
outbox, lease/retry/idempotency và orchestration của job indexing. PostgreSQL là
nguồn dữ liệu nghiệp vụ duy nhất; Qdrant Cloud chỉ là derived vector index và
FastAPI là boundary cho các xử lý AI.

Demo chạy qua CloudFront tới private EC2/Nginx. Trên EC2, NestJS API/worker,
FastAPI AI service và Valkey là private services; PostgreSQL chạy trên RDS và
vector index chạy trên Qdrant Cloud. Media CV tiếp tục dùng Cloudinary.

## Tech stack

- **Framework**: NestJS, TypeORM, TypeScript
- **Database**: PostgreSQL/RDS (canonical persistence)
- **Authentication**: JWT + Passport (Local, Google OAuth)
- **Authorization**: NestJS guards/roles và explicit service boundaries
- **File storage**: Cloudinary
- **Queue/cache**: Bull trên Redis-compatible Valkey/Redis
- **Real-time**: Socket.IO
- **AI boundary**: FastAPI cho CV parsing, deterministic CV-job matching, RAG,
  embeddings và provider-specific indexing
- **PDF/DOCX**: `pdf-parse` và `mammoth`; PDF generation dùng Puppeteer
- **Email**: Nodemailer + Handlebars templates

## Local endpoints

| Thành phần | URL |
| --- | --- |
| NestJS API | `http://localhost:8000/api/v1` |
| Vite frontend | `http://localhost:5173` |
| Google OAuth callback | `http://localhost:8000/api/v1/auth/google/callback` |
| Swagger | `http://localhost:8000/api` |

Health contract:

- NestJS: `GET /api/v1/health` và `GET /api/v1/health/ready`.
- FastAPI: `GET /health`, `GET /health/live`, và `GET /health/ready`.
- Nginx: `GET /origin-health`.

## Core features

### Authentication, authorization, companies and jobs

- Email/password và Google OAuth authentication với JWT access/refresh tokens.
- Roles USER, HR và ADMIN; HR/company approval và account/company controls.
- HR tạo, sửa, quản lý và đóng job; job changes phát sinh lifecycle/outbox events.
- User theo dõi company, nhận notifications và quản lý hồ sơ/CV.

### CV and applications

- Upload PDF/DOCX lên Cloudinary; backend lưu metadata và parsed result canonical
  trong PostgreSQL. Không dùng OCR cho PDF scan/image không có text layer.
- Online CV builder, export PDF, primary CV management và soft-delete workflows.
- Submit application, theo dõi status, HR review/status updates và notifications.
- CV processing chạy async qua Bull/Valkey; application state vẫn do NestJS sở hữu.

### AI matching

NestJS gửi dữ liệu đã được authorization và consent kiểm soát tới FastAPI. FastAPI
trả về deterministic, explainable components; NestJS quyết định persistence và
API exposure của application result.

Scoring contract:

- semantic similarity: **50%**
- skill coverage: **35%**
- experience/level compatibility: **15%**
- location và work-mode được báo cáo riêng, **không** đưa vào numeric score

Các kết quả gồm overall score, matched/missing skills, strengths, gaps, component
scores, scoring version và degradation state. Current result contract uses
UUID/string-compatible canonical IDs, provider-managed ephemeral embeddings, CV
`contentHash`, job `jobSourceVersion`, validated component scores,
scoring/normalization versions, and compatibility metadata.

### Job indexing orchestration

NestJS tạo và claim outbox work, kiểm soát lease/retry/idempotency/stale fencing,
rồi gọi FastAPI bằng service JWT. FastAPI cung cấp:

- `POST /internal/v1/index/jobs/upsert`
- `POST /internal/v1/index/jobs/delete`

Scope indexing mặc định là `jobs:index` và có thể cấu hình bằng
`AI_JOB_INDEX_SCOPE`. Các scope AI là `cv:parse`, `cv:match`, `rag:retrieve`,
`rag:generate`, `jobs:index` — không dùng một scope tổng quát cho mọi route.

## Environment variables

Development values live in `backend/.env.example`; never copy real credentials
into documentation. Các biến chính:

```env
PORT=8000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=replace-me
DB_DATABASE=recruitment_db
DB_SYNCHRONIZE=true
REDIS_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379
GOOGLE_CALLBACK_URL=http://localhost:8000/api/v1/auth/google/callback
URL_FRONTEND=http://localhost:5173
AI_JOB_INDEX_SCOPE=jobs:index
```

Trong demo, secrets được render trên EC2 từ Secrets Manager và không truyền qua
Compose interpolation hoặc process arguments. `DB_SYNCHRONIZE=false` ngoài local
development; migration là trách nhiệm vận hành có kiểm soát.

## Installation and development

```bash
npm install
npm run start:dev
npm run build
npm run lint
npm test
```

## Project structure

```text
src/
├── ai-matching/          # AI client, matching and async CV processor
├── applications/         # Application lifecycle and persistence
├── auth/                 # Authentication and Google OAuth
├── companies/            # Company management
├── jobs/                 # Job lifecycle
├── job-indexing/         # Outbox, lease/retry and FastAPI indexing orchestration
├── notifications/        # Notifications and Socket.IO
├── online-cvs/            # Online CV builder and templates
├── redis/                # Valkey/Redis integration
├── usercvs/              # CV metadata and processing state
└── users/                # User management
```

## Notes

- CV text and provider payloads are sensitive; logs must not contain raw CVs,
  tokens, passwords or full prompts/responses.
- Authorization is enforced by NestJS, not by an LLM.
- Qdrant data is rebuildable from PostgreSQL and indexing outbox state.
- Current RAG v1 uses bounded active-job/CV/conversation evidence. The product can
  add application-history/behavioral recommendation modes in a later version.
