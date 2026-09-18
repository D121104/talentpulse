# TalentPulse AI service

FastAPI owns bounded CV parsing, deterministic CV-to-job matching, RAG retrieval /
grounded generation, embeddings, and provider-specific vector-index operations.
NestJS remains responsible for authorization, canonical job hydration, quota,
conversation/application state, PostgreSQL persistence, job lifecycle/outbox and
job-indexing orchestration. Qdrant Cloud is a derived index.

## Run

```bash
uv sync
uv run uvicorn app.main:app --app-dir . --host 0.0.0.0 --port 8001
```

The Qdrant demo collection is initialized only by an explicit operator command; it
is never run during application startup or readiness checks:

```bash
AI_QDRANT_ADMIN_ENABLED=true uv run qdrant-admin initialize
```

### Optional local PDF OCR

OCR is a host-local, development-only opt-in. It is disabled by default and does
not apply to the cloud/demo runtime or add a Compose service. From the repository
root, start either local profile with:

```bash
./scripts/start-local.sh --cv-ocr --ai-profile=deterministic
./scripts/start-local.sh --cv-ocr --ai-profile=ollama
```

The startup script checks, but never installs, these Debian/Ubuntu prerequisites:

```bash
sudo apt-get update && sudo apt-get install --no-install-recommends \
  poppler-utils tesseract-ocr tesseract-ocr-eng tesseract-ocr-vie
```

`pdftoppm` and `tesseract` must be on `PATH`, and Tesseract must report both
`eng` and `vie`. OCR is attempted only after native PDF extraction for eligible
low-structure PDFs; DOCX parsing is unchanged. Limits are native text threshold
250 characters, 5 pages, 200 DPI, 10,000,000 render pixels per page, 10 seconds
per render, 15 seconds per recognition, 60 seconds total, and 1,000,000 maximum OCR
output bytes. The language setting
uses the Pydantic Settings-compatible JSON list `["eng","vie"]`.

PDF bytes, temporary rendered images, and OCR text remain local to the FastAPI
process and are not printed or sent to an external provider. OCR is bounded and
fails back to native parsing when possible. Do not enable this local flag as a
cloud/demo deployment setting. Local Ollama keeps its existing 120-second FastAPI
provider bound and 180-second NestJS AI request timeout; deterministic mode keeps
its 10-second NestJS timeout.

The local application ports are FastAPI HTTPS `8001`, NestJS `8000`, Vite `5173`,
PostgreSQL `5432`, Redis `6379`, Qdrant `6333`, and Ollama `11435` (the latter two
only with the Ollama profile).

## Authentication and scopes

Internal routes require a bearer JWT with the endpoint-specific scope:

- `cv:parse`
- `cv:match`
- `rag:retrieve`
- `rag:generate`
- `jobs:index` (configured by `AI_JOB_INDEX_SCOPE`)

The job indexing routes are `POST /internal/v1/index/jobs/upsert` and
`POST /internal/v1/index/jobs/delete`. In non-local environments, tokens also use
the configured issuer, audience and exact service subject. Configure
`AI_JWT_PUBLIC_KEY`, `AI_JWT_ALGORITHMS`, `AI_JWT_ISSUER`, `AI_JWT_AUDIENCE` and
`AI_JWT_SUBJECT`; the backend service subject defaults to `talentpulse-backend`.
`AI_AUTH_REQUIRED=false` is accepted only for local/development/test environments.

## Health

Health endpoints are unauthenticated:

- `GET /health/live` is process-only liveness.
- `GET /health/ready` validates non-local configuration and provider/Qdrant wiring
  without paid-provider calls; it returns sanitized `503 not_ready` on failure.
- `GET /health` remains the compatibility health alias.

## Provider and vector contract

Non-local demo configuration uses:

- Embeddings: Cohere `cohere.embed-multilingual-v3`, **1024 dimensions**.
- Vector store: Qdrant Cloud collection
  `jobs_cohere_multilingual_v3_1024_demo_v1`, alias `jobs_current_demo`, index
  version `demo-v1`.
- The operator command also creates/verifies one deterministic inactive representation
  marker for this exact collection, alias, index version, embedding model, dimensions,
  normalization version, and payload schema. Existing incompatible markers fail closed;
  the command never deletes or repoints a collection/alias. Normal retrieval excludes
  the marker through an explicit filter and lifecycle defense in depth.
- Generation: Bedrock `amazon.nova-lite-v1:0`.

The approved IAM Bedrock ARN must correspond to the runtime model/profile actually
configured in `AI_BEDROCK_MODEL`; wildcard model permissions are not an approved
demo contract. Startup validates required cloud configuration before constructing
clients and does not call embedding, retrieval, generation, or collection APIs.
Deterministic embeddings, in-memory retrieval and deterministic generation remain
local/development/test-only providers.

## Matching contract

Matching is deterministic and explainable: semantic similarity contributes 50%,
skill coverage 35%, and experience/level compatibility 15%. Location and work-mode
compatibility are returned as separate reported attributes and are not numeric
score components. Results retain canonical CV/job IDs, matched and missing skills,
component evidence, scoring version and degraded state.

## RAG and CV safety

RAG routes are internal `/internal/v1/rag/retrieve` and
`/internal/v1/rag/generate`. Retrieved content is bounded, treated as untrusted
data, and separated from system instructions. The service does not invent jobs,
employer, salary, date, skill, CV or citation facts when evidence is insufficient.

CV uploads are JSON requests with bounded base64-encoded PDF/DOCX bytes. Encoded
and decoded sizes, PDF magic/page counts, DOCX OOXML structure, ZIP members,
decompression totals, paths and nested archives are checked. Raw CV content is
never logged. Callers must apply authorization and retention policies to parsed
text.

Current RAG v1 uses bounded active-job/CV/conversation evidence. The product can
add application-history/behavioral recommendation modes in a later version.
