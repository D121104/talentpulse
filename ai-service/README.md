# TalentPulse AI service

This service owns bounded CV parsing, deterministic CV-to-job matching, and the stateless retrieval/grounded-generation slice. NestJS remains responsible for authorization, canonical job hydration, quota, conversation state, and persistence.

## Run

```bash
uv sync
uv run uvicorn app.main:app --app-dir . --host 0.0.0.0 --port 8001
```

The internal endpoints require a bearer JWT with an endpoint-specific configured scope: `cv:parse`, `cv:match`, `rag:retrieve`, or `rag:generate` (configured with `AI_CV_PARSE_SCOPE`, `AI_CV_MATCH_SCOPE`, `AI_RAG_RETRIEVE_SCOPE`, and `AI_RAG_GENERATE_SCOPE`). Configure `AI_JWT_PUBLIC_KEY` and `AI_JWT_ALGORITHMS` for the NestJS service token issuer in deployed environments. `AI_AUTH_REQUIRED=false` is accepted only for local/development/test environments; production startup fails closed when authentication is disabled.

CV uploads are JSON requests with base64-encoded PDF/DOCX bytes. Encoded and decoded files are bounded before parsing, PDF magic/page counts and DOCX OOXML structure, ZIP member count, per-member/aggregate decompression, paths, and nested archives are checked, and raw CV content is never logged. The parse response includes extracted text for the internal caller; callers must apply their own access control and retention policy.

## RAG provider wiring

`JOB_SEARCH`, `CV_ANALYSIS`, `CV_JOB_COMPARISON`, and `ADVICE` are exposed through the internal `/internal/v1/rag/retrieve` and `/internal/v1/rag/generate` routes. The application accepts provider adapters through `create_app(...)`; deterministic embedding, in-memory retrieval, and deterministic generation are only used automatically in local/development/test environments. Production settings must select `AI_EMBEDDING_PROVIDER=cohere`, `AI_VECTOR_STORE_PROVIDER=qdrant`, and `AI_GENERATION_PROVIDER=bedrock`, then inject the configured Cohere, Qdrant, and Bedrock adapter instances into `create_app(...)`; startup fails instead of silently falling back to local providers.
