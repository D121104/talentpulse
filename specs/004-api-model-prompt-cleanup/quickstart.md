# Quickstart: API Model Prompt and Schema Cleanup

## Prerequisites

- Python 3.12 or 3.13 and `uv` for the AI service.
- Node.js and installed dependencies for the existing backend and frontend.
- For an explicit live evaluation only: the currently enabled hosted provider profiles must be configured in the local environment. Do not print credentials, load real CVs into fixtures, or commit provider outputs containing personal data.
- PostgreSQL and the existing backend dependencies are needed for the consent-boundary integration scenario. No migration is expected.

## 1. Run Deterministic AI-Service Checks

Run from `ai-service/`:

```bash
uv sync
uv run pytest tests -q
uv run ruff check src/talentpulse_ai tests
uv run ruff format --check src/talentpulse_ai tests
uv run mypy src/talentpulse_ai
```

Expected: all tests pass without contacting Gemini, Bedrock, Ollama, Qdrant, or a live database; Ruff and mypy report no findings. Provider tests assert Gemini's schema projection is in the supported subset, Bedrock Nova Lite requests do not include native structured-output fields, and Ollama continues to receive its `format` schema.

## 2. Verify Consent and Hosted CV Analysis

Run from the repository root:

```bash
npm --prefix backend test -- --runInBand
npm --prefix backend run lint
npm --prefix frontend test -- --run
npm --prefix frontend run build
npm --prefix frontend run lint
```

Expected integration scenario:

1. Sign in as an applicant and load the existing `cv_matching` policy and current-consent endpoints from the CV consent UI.
2. Grant consent through the existing route; confirm the stored status is `GRANTED` and a grant event is recorded.
3. Request CV match analysis as an authorized HR user; confirm NestJS sends only the existing derived narrative facts to AI-service and returns the unchanged narrative contract.
4. Revoke consent and repeat; confirm the result is a controlled denial and no AI-service/provider call occurs.

The policy text and version, consent scope, endpoints, and database schema remain unchanged. The frontend test command is enabled by the minimal Vitest/React Testing Library setup required for the grant/revoke interaction; it does not add a broad testing framework.

## 3. Run the Opt-In Generation Quality Evaluation

After the feature adds its synthetic evaluation set and runner, run from `ai-service/`:

```bash
uv run python -m talentpulse_ai.scripts.evaluation.hosted_generation_eval \
  --provider all \
  --dataset evals/datasets/generation_quality_eval_v1.json \
  --output /tmp/talentpulse-generation-quality.json
```

Expected: a sanitized report contains at least 30 cases for each in-scope journey/provider, at least 95% first-pass contract-valid responses, and a reviewer sheet for at least 10 responses per journey/provider. Reviewers score relevance, factual accuracy, usefulness, and grounding; at least 90% of reviewed responses must pass. A provider/schema rejection, blocked/incomplete response, JSON parse failure, application-validation failure, and consent denial are reported as distinct outcomes. The evaluation uses synthetic or explicitly approved inputs and is opt-in; it is not part of routine tests.

## References

- Provider request and response expectations: [AI generation and consent contract](./contracts/ai-generation-and-consent.md)
- Existing consent entities and lifecycle: [Data model](./data-model.md)
- Provider capability and schema decisions: [Research](./research.md)
