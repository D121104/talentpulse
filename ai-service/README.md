# TalentPulse AI service

This service owns bounded CV parsing, deterministic CV-to-job matching, and the stateless retrieval/grounded-generation slice. NestJS remains responsible for authorization, canonical job hydration, quota, conversation state, and persistence.

## Run

```bash
uv sync
uv run uvicorn app.main:app --app-dir . --host 0.0.0.0 --port 8001
```

The internal endpoints require a bearer JWT with an endpoint-specific configured scope: `cv:parse`, `cv:match`, `rag:retrieve`, `rag:generate`, or `jobs:index` (configured with `AI_CV_PARSE_SCOPE`, `AI_CV_MATCH_SCOPE`, `AI_RAG_RETRIEVE_SCOPE`, `AI_RAG_GENERATE_SCOPE`, and `AI_JOB_INDEX_SCOPE`). In non-local environments, the token must also use the configured issuer, audience, and exact service subject. Configure `AI_JWT_PUBLIC_KEY`, `AI_JWT_ALGORITHMS`, `AI_JWT_ISSUER`, `AI_JWT_AUDIENCE`, and `AI_JWT_SUBJECT` for the NestJS service token issuer; the backend default subject is `talentpulse-backend`. `AI_AUTH_REQUIRED=false` is accepted only for local/development/test environments; non-local startup and readiness fail closed when authentication is not configured.

Health endpoints are unauthenticated: `GET /health/live` is a process-only liveness check, `GET /health/ready` validates non-local configuration and provider/Qdrant object wiring without network or paid-provider calls and returns `503` with a sanitized `not_ready` response on failure, and `GET /health` remains a compatibility alias for the basic health response.

For deployed non-local readiness, configure `AI_EMBEDDING_PROVIDER=cohere`, `AI_COHERE_MODEL`, `AI_COHERE_DIMENSIONS`, `AI_VECTOR_STORE_PROVIDER=qdrant`, `AI_QDRANT_URL` (HTTPS), `AI_QDRANT_COLLECTION`, `AI_QDRANT_ALIAS`, `AI_QDRANT_INDEX_VERSION`, `AI_GENERATION_PROVIDER=bedrock`, `AI_BEDROCK_REGION`, and `AI_BEDROCK_MODEL`.

CV uploads are JSON requests with base64-encoded PDF/DOCX bytes. Encoded and decoded files are bounded before parsing, PDF magic/page counts and DOCX OOXML structure, ZIP member count, per-member/aggregate decompression, paths, and nested archives are checked, and raw CV content is never logged. The parse response includes extracted text for the internal caller; callers must apply their own access control and retention policy.

## RAG provider wiring

`JOB_SEARCH`, `CV_ANALYSIS`, `CV_JOB_COMPARISON`, and `ADVICE` are exposed through the internal `/internal/v1/rag/retrieve` and `/internal/v1/rag/generate` routes. The application accepts provider-boundary overrides through `create_app(...)` for deterministic tests. Otherwise, production settings select `AI_EMBEDDING_PROVIDER=cohere`, `AI_VECTOR_STORE_PROVIDER=qdrant`, and `AI_GENERATION_PROVIDER=bedrock`, and the factory builds the Bedrock Runtime and Qdrant Cloud adapters from the typed settings. Required cloud configuration is validated before client construction; startup never performs embedding, retrieval, generation, or collection calls. Deterministic embedding, in-memory retrieval, and deterministic generation are only used automatically in local/development/test environments.
