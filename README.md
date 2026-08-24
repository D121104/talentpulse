<div align="center">
  <img src="frontend/public/logo-lightmode.svg" alt="TalentPulse Logo" width="380" />
  
  <p align="center">
    <strong>Hệ thống Tuyển dụng & Kết nối Việc làm Thông minh tích hợp AI</strong>
  </p>

  <p align="center">
    <a href="#-tổng-quan-dự-án">Tổng quan</a> •
    <a href="#-kiến-trúc-hệ-thống">Kiến trúc</a> •
    <a href="#-công-nghệ-sử-dụng">Công nghệ</a> •
    <a href="#-cài-đặt--khởi-chạy">Cài đặt & Khởi chạy</a> •
    <a href="#-cấu-trúc-thư-mục">Cấu trúc thư mục</a> •
    <a href="FEATURES.md">Chi tiết chức năng (FEATURES.md)</a>
  </p>

  <p align="center">
    <img src="https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" alt="NestJS" />
    <img src="https://img.shields.io/badge/React_19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
    <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
    <img src="https://img.shields.io/badge/Tailwind_CSS_v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind CSS" />
    <img src="https://img.shields.io/badge/Elasticsearch-005571?style=for-the-badge&logo=elasticsearch&logoColor=white" alt="Elasticsearch" />
    <img src="https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis" />
    <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
  </p>
</div>

---

## 📌 Tổng quan dự án

**TalentPulse** là nền tảng tuyển dụng trực tuyến thế hệ mới, kết nối ứng viên và nhà tuyển dụng thông qua sức mạnh của **Trí tuệ Nhân tạo (AI & NLP)**. Hệ thống giải quyết bài toán tuyển dụng truyền thống bằng cách tự động hóa quy trình sàng lọc hồ sơ, xếp hạng ứng viên theo độ tương đồng ngữ nghĩa, và hỗ trợ định hướng nghề nghiệp thông minh.

### 🌟 Điểm nổi bật
- 🤖 **AI Matching & Candidate Ranking**: Tính toán độ tương đồng ngữ nghĩa (Embedding + Cosine Similarity) giữa CV và mô tả công việc (JD), tự động chấm điểm và xếp hạng ứng viên.
- 💬 **AI Career Assistant & CV Analysis**: Chatbot RAG (Retrieval-Augmented Generation) phân tích CV, phát hiện kỹ năng còn thiếu và tư vấn cải thiện hồ sơ.
- 📍 **Nearby Jobs (PostGIS)**: Tìm kiếm việc làm xung quanh vị trí hiện tại của ứng viên theo bán kính (5km, 10km, 20km,...).
- ⚡ **Realtime Communication**: Nhắn tin trực tiếp thời gian thực giữa Nhà tuyển dụng & Ứng viên qua WebSockets (Socket.IO).
- 🌐 **Đa ngôn ngữ & Giao diện hiện đại**: Hỗ trợ Song ngữ (Tiếng Việt / English), Dark/Light mode, hiệu ứng mượt mà chuẩn **Castify & UI-UX Pro Max**.
- 💎 **Hệ sinh thái Premium**: Gói dịch vụ cao cấp cho Candidate (Hồ sơ nổi bật, Phân tích cạnh tranh) và HR (Tin Hot, Tìm kiếm nâng cao).

Chi tiết toàn bộ đặc tả chức năng: [FEATURES.md](FEATURES.md).

---

## 🏗 Kiến trúc hệ thống

```mermaid
flowchart TB
    subgraph Client ["Client Layer"]
        Web["💻 Web App (React 19 + Vite + Tailwind v4)"]
        Mobile["📱 Mobile App (React Native / Expo)"]
    end

    subgraph Gateway ["API & Realtime"]
        Nest["🚀 NestJS API Gateway & Services (Port 8000)"]
        WS["⚡ Socket.IO Realtime Gateway"]
    end

    subgraph Data ["Data & Storage Layer"]
        PG[("🐘 PostgreSQL 16 + PostGIS\n(TypeORM)")]
        Redis[("⚡ Redis 7\n(Cache & Session)")]
        ES[("🔍 Elasticsearch 8\n(Full-text & Vector Search)")]
        Cloudinary["☁️ Cloudinary (CVs & Media)"]
    end

    subgraph AI ["AI & NLP Processing"]
        Transformers["🧠 Xenova Transformers\n(Embeddings)"]
        RAG["📚 RAG Engine\n(CV Analysis & Advisor)"]
    end

    subgraph Monitor ["Observability Stack"]
        Prom["📊 Prometheus"]
        Graf["📈 Grafana"]
        Loki["📋 Loki & Promtail"]
    end

    Client --> Gateway
    Gateway --> Data
    Gateway --> AI
    Gateway -.-> Monitor
```

---

## 🛠 Công nghệ sử dụng

| Tầng / Thành phần | Công nghệ & Thư viện chính |
| :--- | :--- |
| **Frontend Web** | React 19, TypeScript, Vite 6, Tailwind CSS v4, Framer Motion, Lucide React, i18next |
| **Backend API** | NestJS, TypeORM, Passport JWT, Socket.IO, BullMQ, Class Validator |
| **Cơ sở dữ liệu** | PostgreSQL 16 + PostGIS Extension |
| **Caching & Queue** | Redis 7, Bull Queue |
| **Tìm kiếm & Vector** | Elasticsearch 8 (Full-text Search & Vector Similarity) |
| **AI & Xử lý ngôn ngữ** | `@xenova/transformers`, Cosine Similarity, PDF/DOCX Parsers (`pdf-parse`, `mammoth`) |
| **Thanh toán** | Cổng thanh toán trực tuyến PayOS |
| **Giám sát (Observability)** | Prometheus, Grafana, Loki, Promtail |
| **Triển khai & Hạ tầng** | Docker, Docker Compose, Multi-stage Builds |

---

## 🚀 Cài đặt & Khởi chạy

### 1. Yêu cầu môi trường (Prerequisites)
- [Node.js](https://nodejs.org/) (phiên bản $\ge$ 20.x) & `npm`
- [Docker](https://www.docker.com/) & Docker Compose
- [Git](https://git-scm.com/)

---

### 2. Khởi chạy Hạ tầng dịch vụ (Infrastructure)
Khởi động cụm dịch vụ cơ sở dữ liệu, caching, search và monitoring bằng Docker Compose:

```bash
# Di chuyển vào thư mục cấu hình môi trường
cd backend/environment

# Khởi chạy toàn bộ cụm container (PostgreSQL, Redis, Elasticsearch, Prometheus, Grafana, Loki)
docker-compose up -d
```

Các dịch vụ sẽ chạy tại:
- **PostgreSQL**: `localhost:5432`
- **Redis**: `localhost:6379`
- **Elasticsearch**: `localhost:9200`
- **Grafana Dashboard**: `localhost:3001` (admin/admin)
- **Prometheus**: `localhost:9090`

---

### 3. Khởi chạy Backend (NestJS)

```bash
# Di chuyển vào thư mục backend
cd backend

# Cài đặt dependencies
npm install

# Tạo file biến môi trường từ mẫu
cp .env.example .env

# Chạy backend ở chế độ Development
npm run start:dev
```
Backend API sẽ hoạt động tại: `http://localhost:8000/api/v1`

---

### 4. Khởi chạy Frontend (React Vite)

```bash
# Di chuyển vào thư mục frontend
cd frontend

# Cài đặt dependencies
npm install

# Tạo file biến môi trường từ mẫu
cp .env.example .env

# Khởi chạy frontend dev server
npm run dev
```
Giao diện Web sẽ hoạt động tại: `http://localhost:5173/`

---

## 📁 Cấu trúc thư mục

```
BTL_Mobile/
├── .agents/                    # Workspace Rules, Skills (Frontend, Design, Backend, Graphify)
├── backend/                    # Mã nguồn Backend NestJS
│   ├── environment/            # Docker Compose & cấu hình Observability (Prometheus, Loki, Grafana)
│   ├── src/                    # 14 modules nghiệp vụ (users, jobs, companies, applications, ai-matching,...)
│   └── test/                   # E2E test suites
├── frontend/                   # Mã nguồn Frontend React Vite
│   ├── public/                 # Assets tĩnh & Logo SVGs (Dark/Light mode)
│   └── src/
│       ├── components/         # UI components & Landing page sections
│       ├── context/            # ThemeContext (Dark/Light mode)
│       ├── i18n/               # Đa ngôn ngữ (Tiếng Việt / English)
│       └── pages/              # Các trang giao diện (LandingPage,...)
├── graphify-out/               # AST Knowledge Graph tối ưu hoá tra cứu mã nguồn
├── FEATURES.md                 # Đặc tả chi tiết toàn bộ chức năng hệ thống
├── AGENTS.md                   # Hướng dẫn & Tiêu chuẩn phát triển cho Agent
└── README.md                   # Tài liệu hướng dẫn chính của Repository
```

---

## 🧭 Hướng dẫn phát triển với Agent (Graphify & Skills)

Repository này được tích hợp hệ thống **Graphify Knowledge Graph** và bộ kỹ năng chuyên biệt trong `.agents/skills/`:

- **Graphify Tra cứu mã nguồn**: Khi cần tìm kiếm logic nghiệp vụ mà không tốn token, chạy `graphify query "<từ khóa>"` hoặc `graphify explain "<module>"`.
- **Frontend & Design System**: Tuân thủ quy chuẩn thiết kế tại `.agents/skills/frontend/RULES.md` (chuẩn WCAG AA, không dùng emoji làm icon, 3D perspective mockup, Aurora gradients, Bento Grid).
- **Backend Architecture**: Tuân thủ mẫu TypeORM repository, UUID primary key, Soft Delete tại `.agents/skills/backend/SKILL.md`.

---

## 📄 Bản quyền (License)

Dự án phục vụ mục đích học tập và nghiên cứu (BTL Mobile & Fullstack Project). Mọi quyền được bảo lưu.
