# Local AI infrastructure

This runbook covers the Phase 1 local infrastructure only. It does not enable
Bedrock, Qdrant Cloud, Phase 2 indexing/outbox workflows, or public RAG APIs.

## Prerequisites

- Docker Desktop with Compose v2
- Node.js 18+ (for the key bootstrap script)
- Ollama running on the host
- The local chat model pulled in Ollama, for example:

```bash
ollama pull qwen3:8b
```

The chat provider/model, embedding provider/model/dimensions, collection, alias,
and JWT issuer/audience/key ID are configured in `ai-service/.env.local`, which is
the single source of truth for local AI settings. Compose intentionally overrides
only container topology (`OLLAMA_BASE_URL`, `QDRANT_URL`), the mounted public-key
path, and `QDRANT_AUTO_INITIALIZE=true`; it does not override provider/model or JWT
identity values. Copy the example and change values there when needed:

```bash
cp ai-service/.env.example ai-service/.env.local
```

On PowerShell:

```powershell
Copy-Item ai-service/.env.example ai-service/.env.local
```

Changing the embedding model or dimensions requires a separate local collection
and a complete reindex; local vectors must not be mixed with another model-space.
Phase 1 does not implement job indexing, but readiness still rejects an
existing collection whose dimensions, distance, model metadata, or alias target
do not match this policy.

## Bootstrap local service authentication

Compose does not generate credentials during startup. Generate the development
RSA key pair once from the repository root:

```bash
node scripts/bootstrap-local-ai-auth.mjs
```

Use `--force` only when intentionally replacing the pair. The script writes:

- `.secrets/ai-service-dev-private.pem` — read by host-run NestJS
- `.secrets/ai-service-dev-public.pem` — mounted read-only into AI service
  as `/run/secrets/ai-service-public-key`

`.secrets/` is Git-ignored. Never copy either key into Compose, source code,
an image, or a committed environment file. Configure the host NestJS process
with the private-key file source in `backend/.env` (when started from
`backend/`, use `AI_SERVICE_JWT_PRIVATE_KEY_FILE=../.secrets/ai-service-dev-private.pem`).
The fixed Phase 1 contract is issuer `talentpulse-api`, audience
`talentpulse-ai`, key ID `dev-key-1`, and operation scopes:
`rag:retrieve`, `rag:generate`, and `jobs:index`.

## Local Compose credentials and host bindings

Compose reads interpolation variables from a project-root `.env` file. The
optional root example documents the local values:

```powershell
Copy-Item .env.example .env
```

The Compose file also has disposable local-only fallbacks so `docker compose up`
continues to work when the root `.env` file is absent. The variables are
`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `REDIS_PASSWORD`,
`GRAFANA_ADMIN_USER`, and `GRAFANA_ADMIN_PASSWORD`. These defaults and any
values in a local `.env` file are for development only and must never be used in
production. If PostgreSQL or Redis values are overridden, keep the corresponding
`backend/.env` values (`DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`, and
`REDIS_PASSWORD`) in sync for a host-run NestJS API.

All host-published stateful and monitoring ports are loopback-only: PostgreSQL
`127.0.0.1:5432`, Redis `127.0.0.1:6379`, Elasticsearch
`127.0.0.1:9200`/`127.0.0.1:9300`, Prometheus `127.0.0.1:9090`, Grafana
`127.0.0.1:3001`, Loki `127.0.0.1:3100`, Qdrant
`127.0.0.1:6333`/`127.0.0.1:6334`, and AI service `127.0.0.1:8001`.
They remain reachable by service name and container port from the Compose
network; no LAN access is required for this local stack.

## Configure and start

From the repository root:

```bash
node scripts/bootstrap-local-ai-auth.mjs
docker compose -f backend/environment/docker-compose.yml config --quiet
docker compose -f backend/environment/docker-compose.yml up -d
```

The public-key file must exist before `docker compose config`/`up`; Compose
validates the local secret source and will not create it. The stack keeps the
existing PostgreSQL, Redis, Elasticsearch and monitoring services, and adds:

- Qdrant at `http://127.0.0.1:6333` with persistent `qdrant_data` storage.
- AI service at `http://127.0.0.1:8001`, listening on port `8000` inside
  Compose, with persistent `hf_cache` model storage.

The host port is `8001` so a host-run NestJS API can continue using its existing
port `8000`. From another Compose service, use `http://ai-service:8000`; do not
use `localhost` for container-to-container connections. The AI service uses
`http://qdrant:6333` for Qdrant internally.

## Verify readiness

```bash
docker compose -f backend/environment/docker-compose.yml ps
curl http://127.0.0.1:6333/collections
curl http://127.0.0.1:8001/health/live
curl http://127.0.0.1:8001/health/ready
```

`/health/ready` is the Phase 1 healthcheck. It verifies the mounted public
service-auth key and Qdrant connectivity, creates the configured collection and alias only when they are absent and
`QDRANT_AUTO_INITIALIZE=true`, and rejects mismatched dimensions, cosine
distance, embedding model metadata, foundation metadata, or alias target. It
does not call Ollama or paid Bedrock, so local readiness does not require a
chat provider or AWS credentials. The first start can still download the local
embedding model into `hf_cache` before readiness becomes healthy.

If the NestJS API runs on the host, set its local AI service URL to
`http://127.0.0.1:8001`. If NestJS is later run in the same Compose network,
use `AI_SERVICE_URL=http://ai-service:8000` instead.

## Stop or inspect the stack

```bash
docker compose -f backend/environment/docker-compose.yml logs qdrant ai-service
docker compose -f backend/environment/docker-compose.yml down
```

Do not use `down -v` for normal shutdown: named volumes preserve local
PostgreSQL, Qdrant and model-cache data.
