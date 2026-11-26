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

## 2a. Roll Back Hosted CV Analysis or Prompt Changes

If hosted narrative generation must be disabled, roll back the AI-service release to the preceding implementation of `modules/cv_analysis/analysis.py`, which rejects non-Ollama analysis providers. Keep the NestJS `cv_matching` consent gate in place so no CV-derived facts are dispatched without a current applicant grant. If the full feature release must be rolled back, restore the preceding versions of the changed RAG prompt/dispatch and Gemini schema-projection files as well, then redeploy the previous frontend/backend release as a coordinated version.

This rollback changes code only. It requires no database migration, consent-record deletion, or persisted-data repair. Existing grants/revocations remain valid; do not remove the consent check as part of selectively disabling hosted analysis.

## 3. Run the Opt-In Generation Quality Evaluation

The CLI runs the real application generation services, not raw provider schema probes. It validates all fixtures before creating hosted clients and rejects the run unless every journey has at least 30 synthetic, schema-valid `request` objects. From `ai-service/`, run:

```bash
PYTHONPATH=src uv run python -m talentpulse_ai.scripts.evaluation.hosted_generation_eval \
  --provider all \
  --dataset evals/datasets/generation_quality_eval_v1.json \
  --output /tmp/talentpulse-generation-quality.json
```

The command is opt-in and may incur provider charges. It sends only the explicit synthetic application requests in the dataset. The sanitized report separates service completion from first-pass contract validity and includes up to all successful responses in the reviewer sheet. A successful process exit means a report was written; it does not mean quality gates passed or that the feature is release-ready. The CLI must be run against only the currently approved provider profiles.

For each provider/journey group, the report must contain at least 30 cases, first-pass contract validity must be at least 95%, and at least 10 responses must receive human ratings. Reviewers set `relevance`, `factual_accuracy`, `usefulness`, and `grounding` to JSON booleans for each reviewed row; a row passes only if all four are `true`. After saving the reviewed report to a separate file, aggregate those ratings without repeating provider calls:

```bash
PYTHONPATH=src uv run python -m talentpulse_ai.scripts.evaluation.hosted_generation_eval \
  --provider all \
  --dataset evals/datasets/generation_quality_eval_v1.json \
  --output /tmp/talentpulse-generation-quality-reviewed.json \
  --reviewed-report /tmp/talentpulse-generation-quality-reviewed-input.json
```

The human gate requires at least 90% passing responses among at least 10 complete ratings per journey/provider. Service-level evaluation does not cover API authorization, canonical retrieval, or persistence, so `release_ready` remains false. Do not interpret scripted-provider tests as hosted quality evidence. The evaluation is not part of routine tests.

## References

- Provider request and response expectations: [AI generation and consent contract](./contracts/ai-generation-and-consent.md)
- Existing consent entities and lifecycle: [Data model](./data-model.md)
- Provider capability and schema decisions: [Research](./research.md)
