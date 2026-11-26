# TalentPulse — Feature specification and current implementation contract

## 1. Product scope

TalentPulse connects candidates and recruiters through job discovery, applications,
company workflows, notifications, CV management and AI-assisted search/matching.
This document distinguishes the product roadmap from the currently implemented RAG
v1 contract.

## 2. Candidate features

- Search and filter jobs by keyword, industry, location, skills, salary, level and
  work mode.
- View job/company details, follow companies, and receive job/application
  notifications.
- Upload PDF/DOCX CVs, create an online CV, select a primary CV and manage CVs.
- Apply to jobs, track application status/history, and communicate with recruiters.
- Premium capabilities may include profile boosting, competition insights, profile
  insights and nearby jobs as product features; availability remains controlled by
  the corresponding backend entitlement.

## 3. Recruiter and administrator features

- HR users manage companies, jobs, candidates, applications, status transitions,
  interview invitations, notes, notifications and real-time communication.
- HR search can filter candidates by skills, experience, location, salary and
  education where the authorized backend data is available.
- Administrators approve/disable users, companies and job postings, manage skills,
  reports, subscriptions, payments and system dashboards.

## 4. AI features currently in RAG v1

### 4.1 CV parsing

FastAPI parses text-bearing PDF/DOCX uploads and returns bounded structured fields
such as skills, education, experience and certificates. NestJS controls the
authorized request, canonical persistence and retention policy. OCR for scanned
PDF/image-only documents is not part of this contract.

### 4.2 Deterministic CV-job matching

The matching result reports:

- semantic similarity: **50%**
- skill coverage: **35%**
- experience/level compatibility: **15%**
- location and work-mode compatibility separately, with **no numeric contribution**

Results include matched skills, missing required skills, strengths, gaps, component
evidence, scoring version and whether the result was degraded. The score is an
explainable signal, not a business truth by itself.

### 4.3 Job search and grounded RAG

RAG retrieves authorized, filtered job context before generation. Hard filters such
as location, salary, level, employment type and skills are applied deterministically
when present. Retrieved content is untrusted context and cannot override system
instructions. Insufficient evidence produces uncertainty rather than fabricated
facts.

Current RAG v1 uses bounded CV/active-job evidence for retrieval and generation.
Later versions may add application-history/behavioral recommendation modes.

## 5. Ownership and deployment

- **NestJS** owns business APIs, authorization, PostgreSQL/RDS canonical
  persistence, job lifecycle, transactional outbox and job-indexing orchestration.
- **FastAPI** owns CV parsing, deterministic matching, RAG, embeddings and
  provider-specific indexing adapters.
- **Qdrant Cloud** stores only derived job vectors and can be rebuilt from canonical
  PostgreSQL data.
- Demo topology: CloudFront and private S3 SPA at the edge; private EC2/Nginx
  running NestJS, FastAPI and Valkey; RDS PostgreSQL and Qdrant Cloud as managed
  data services; Cloudinary for CV/media storage.

## 6. Service contracts

### Health

- FastAPI: `/health`, `/health/live`, `/health/ready`
- NestJS: `/api/v1/health`, `/api/v1/health/ready`
- Nginx: `/origin-health`

### AI scopes and indexing routes

Scopes are `cv:parse`, `cv:match`, `rag:retrieve`, `rag:generate` and `jobs:index`.
The indexing scope is configured with `AI_JOB_INDEX_SCOPE`. FastAPI exposes:

- `POST /internal/v1/index/jobs/upsert`
- `POST /internal/v1/index/jobs/delete`

### Demo model/index values

- Qdrant collection: `jobs_cohere_multilingual_v3_1024_demo_v1`
- Qdrant alias: `jobs_current_demo`
- Qdrant index version: `demo-v1`
- Cohere model: `cohere.embed-multilingual-v3`
- Embedding dimensions: `1024`
- Bedrock model: `amazon.nova-lite-v1:0`
- Approved IAM Bedrock ARN: must match the configured runtime model/profile

## 7. Technology summary

- Frontend: React, Vite, TypeScript, Tailwind CSS, Redux Toolkit
- Backend: NestJS, TypeORM, Socket.IO, PostgreSQL/PostGIS
- Cache/queue: Redis-compatible Valkey/Redis and Bull
- AI: FastAPI, Cohere embeddings, Bedrock Nova Lite, RAG, cosine similarity,
  `pdf-parse` and `mammoth`
- Vector retrieval: Qdrant Cloud derived index
- Deployment: Docker Compose on private EC2 behind Nginx/CloudFront, private S3
  SPA, RDS PostgreSQL
- Payments: PayOS
- Observability: Prometheus, Grafana, Loki and Promtail
