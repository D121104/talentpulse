# Local startup

From the repository root, run:

```bash
./scripts/start-local.sh
```

The script starts PostgreSQL and Redis from `backend/environment/docker-compose.yml`,
then starts the deterministic HTTPS FastAPI service, NestJS, and Vite. It waits for
readiness before reporting success. Ports are FastAPI `8001` (HTTPS), NestJS
`8000`, Vite `5173`, PostgreSQL `5432`, and Redis `6379`.

OCR is local-only and disabled by default. Without `--cv-ocr`, FastAPI receives
`AI_CV_OCR_ENABLED=false` and no OCR binaries are required.

## AI profiles

Deterministic mode is the default and does not start or pull Ollama/Qdrant:

```bash
./scripts/start-local.sh --ai-profile=deterministic
```

The explicit Ollama profile starts loopback-only Qdrant (`6333`) and Ollama on
host port `11435` (container port `11434`) with persistent named volumes, waits
for both health endpoints, pulls only missing `qwen3-embedding:0.6b` and
`qwen3:1.7b` models, and initializes the separate `jobs_ollama_1024_local_v1`
collection through the existing
non-destructive `qdrant-admin initialize` command:

```bash
./scripts/start-local.sh --ai-profile=ollama
```

## Local PDF OCR (explicit opt-in)

Use `--cv-ocr` to enable bounded OCR in the host-local FastAPI process. The same
flag works with both AI profiles and does not change Compose, Ollama, cloud, or
demo behavior:

```bash
./scripts/start-local.sh --cv-ocr --ai-profile=deterministic
./scripts/start-local.sh --cv-ocr --ai-profile=ollama
```

Before starting anything, the flag checks that `pdftoppm` and `tesseract` are
available and that Tesseract reports both `eng` and `vie`. The script never installs
packages or invokes `sudo`. On Debian/Ubuntu, install these prerequisites manually
when needed:

```bash
sudo apt-get update && sudo apt-get install --no-install-recommends \
  poppler-utils tesseract-ocr tesseract-ocr-eng tesseract-ocr-vie
```

OCR runs only for eligible PDFs after native extraction, using at most 5 pages at
200 DPI, 10,000,000 estimated render pixels per page, 10 seconds per render,
15 seconds per recognition, 60 seconds per document, and 1,000,000 maximum OCR
output bytes. Languages are passed to
FastAPI as the Settings-compatible JSON list `["eng","vie"]`. Rendered images
are temporary and OCR text stays local; CV content is not printed or sent to an
external OCR/LLM provider. OCR failures degrade safely to native parsing when
possible. This feature is for local development only, not demo or production.

Model downloads can require several gigabytes and are bounded to 15 minutes per
model. Ollama provider requests use a bounded 120-second FastAPI timeout, while
NestJS waits up to 180 seconds for the local Ollama profile (the deterministic
profile remains at 10 seconds). The local Qdrant initializer refuses an existing incompatible collection
or alias target; it never deletes data or repoints an alias. Qdrant and Ollama
data stay in Docker named volumes. Remove only those volumes, after confirmation,
when a full local AI reset is required; do not remove PostgreSQL data implicitly.

The current worktree's exact indexing bootstrap is not run automatically.
`--index-bootstrap` is an explicit, bounded opt-in for the existing
`npm run index:jobs -- --environment=local --max-operations=100` command after
application readiness.

## Prerequisites

- Docker with the Compose v2 plugin and a running Docker daemon
- Node.js/npm with dependencies already installed in `backend` and `frontend`
- `uv` with the existing `ai-service/.venv` dependencies available
- OpenSSL, curl, and `setsid`
- `ai-service/.env` and `backend/.env`; the backend file is copied from
  `backend/.env.example` only when absent. Existing environment files are never
  overwritten.
- `.secret/service-private.pem` and `.secret/service-public.pem` as a matching
  local-only service JWT key pair. Do not put real or shared secrets in the
  repository.

Use `./scripts/start-local.sh --dry-run` to inspect the planned commands without
starting services or changing files. Add `--cv-ocr` to validate the OCR binaries and
language packs and show the bounded OCR environment without starting services:

```bash
./scripts/start-local.sh --dry-run --cv-ocr --ai-profile=deterministic
./scripts/start-local.sh --dry-run --cv-ocr --ai-profile=ollama
```

The script explicitly supplies the local
`AI_SERVICE_URL`, TLS trust, JWT settings, and scopes to the NestJS process so a
conflicting value in `backend/.env` cannot break the FastAPI message calls. It
does not replace `AI_CV_CONSENT_*` values from that file. PEM contents are passed
only through child-process environments and are not printed.

FastAPI TLS material is reused or generated under `/tmp/talentpulse-local` and
never stored in the repository. Ctrl-C stops FastAPI, NestJS, and Vite, retains
logs under `/tmp/talentpulse-local/logs-*`, and leaves PostgreSQL/Redis running.
Stop those dependencies separately with:

```bash
docker compose -f backend/environment/docker-compose.yml stop postgres redis
docker compose -f backend/environment/docker-compose.yml --profile ollama stop qdrant ollama
```

Use the static checks used for this startup slice from the repository root:

```bash
bash -n scripts/start-local.sh
shellcheck scripts/start-local.sh
./scripts/start-local.sh --dry-run --ai-profile=deterministic
./scripts/start-local.sh --dry-run --ai-profile=ollama
docker compose -f backend/environment/docker-compose.yml config
```
