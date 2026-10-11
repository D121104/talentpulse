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
for both health endpoints, pulls only missing `qwen3-embedding:4b` and `qwen3:4b`, and initializes the
new separate `jobs_ollama_qwen3_embedding_4b_2560_local_v2` collection (2560
dimensions) with alias `jobs_current_local_qwen3_embedding_4b_2560` and index
version `local-ollama-qwen3-embedding-4b-2560-v2` through the existing non-destructive
`qdrant-admin initialize` command:

```bash
./scripts/start-local.sh --ai-profile=ollama
```

`qwen3:4b` is the local generation default. Preserve environment overrides by
setting `AI_OLLAMA_GENERATION_MODEL` and/or `AI_OLLAMA_EMBEDDING_MODEL` before
startup; the explicit embedding dimension must match the model metadata:

```bash
AI_OLLAMA_GENERATION_MODEL=qwen3:1.7b ./scripts/start-local.sh --ai-profile=ollama
```

The generation override is passed to FastAPI and used for the missing-model pull.

The local Compose Ollama container has a configurable 4 GiB memory limit (and 6 GiB combined memory+swap limit) by default.
This leaves qwen3:4b room for its inference workspace beyond the approximately 3.2 GiB loaded model footprint;
set `OLLAMA_MEMORY_LIMIT` and `OLLAMA_MEMORY_SWAP_LIMIT` only for local runs when the host has capacity.
These settings are confined to `backend/environment/docker-compose.yml` and do not affect production or cloud services.

Changing generation alone does not require rebuilding vectors. Changing the
embedding model or dimensions does require a new collection/version and a full
reindex into that new target.

The 2560-dimension value is sourced, not guessed: the official Ollama model
metadata for `qwen3-embedding:4b-fp16` reports `qwen3.embedding_length=2560`,
and the Qwen official model card lists Qwen3-Embedding-4B as 2560 dimensions
(with configurable output dimensions up to 2560). Sources:

- https://ollama.com/library/qwen3-embedding:4b-fp16/blobs/e8b4e85c8fcc
- https://github.com/QwenLM/Qwen3-Embedding
- https://huggingface.co/Qwen/Qwen3-Embedding-4B

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

Model downloads can require several gigabytes; `qwen3:4b` needs more runtime
RAM than smaller generation models. Downloads are bounded to 15 minutes per model. Non-CV Ollama provider requests
keep the bounded 120-second FastAPI timeout, while existing synchronous NestJS
callers may retain their shorter client timeout. CV draft generation is separate
and worker-oriented: its FastAPI total deadline defaults to 600 seconds, with a
120-second core call, 45-second localization chunks, one 45-second repair call,
and a hard cap of 12 provider calls. A browser/client timeout does not cancel an
in-flight provider thread; the service still enforces its own per-call and total
deadlines. The local Qdrant initializer refuses an existing incompatible collection
or alias target; it never deletes data or repoints an alias. Qdrant and Ollama
data stay in Docker named volumes. Remove only those volumes, after confirmation,
when a full local AI reset is required; do not remove PostgreSQL data implicitly.

The current worktree's exact indexing bootstrap is not run automatically.
`--index-bootstrap` is an explicit, bounded opt-in for
`npm run index:jobs -- --environment=local --max-operations=100 --reconcile` after
application readiness. It writes only the new representation version and never
repoints the old alias or deletes old vectors. Repeat in bounded batches, or run
the same command with `--max-operations=10000 --reconcile` while the local profile
is running to backfill all canonical PostgreSQL jobs. The old collection
`jobs_ollama_1024_local_v1` and alias `jobs_current_local` remain untouched.

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
