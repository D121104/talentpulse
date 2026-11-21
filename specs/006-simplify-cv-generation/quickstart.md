# Quickstart: Rút gọn quy trình tạo CV

## Prerequisites

- Python 3.12 or 3.13 and `uv` for the AI service.
- Node 24 first on `PATH` for the existing NestJS test suites, installed backend/frontend dependencies, and a disposable PostgreSQL test database for persistence integration cases.
- Deterministic provider doubles for routine tests. Do not load `.env`, print credentials, or use real CV data.
- Live hosted-model comparison is optional and may incur charges. It requires explicit authorization for the selected profiles, data processing terms, and any human review of outputs.

## 1. Run Deterministic CV Generation Tests

Run from `ai-service/`:

```bash
uv sync
uv run pytest tests/unit/cv_generator tests/unit/providers/test_provider_factory.py tests/integration/test_cv_api.py -q
uv run ruff check src/talentpulse_ai/modules/cv_generator tests/unit/cv_generator tests/integration/test_cv_api.py
uv run mypy
```

Expected: tests do not contact Gemini, Bedrock, Ollama, Qdrant or a live database. Assertions cover the unchanged draft/review contract, grounding, locale, source identity, partial/unsafe output, deadlines and finite provider calls.

## 2. Verify Existing Review and Persistence Boundaries

Run from the repository root:

```bash
npm --prefix backend test -- --runInBand tests/online-cvs/async-generation.service.spec.ts tests/online-cvs/async-generation.postgres.integration.spec.ts tests/online-cvs/online-cvs.service.spec.ts tests/online-cvs/legacy-generation-privacy.spec.ts
node --test frontend/src/pages/cv/CVEditorPage.test.mjs
```

Expected: generation still produces a pending editable draft; source CV/profile stay unchanged until explicit Save; Reject/Expire and stale approvals retain their existing behavior.

## 3. Compare a Candidate Change

1. Record the exact non-secret hosted generation profiles and the current code revision. Do not infer active production profiles from a local developer configuration.
2. After the feature adds journey filtering to the existing evaluator, run the opt-in synthetic evaluation only after explicit authorization. From `ai-service/`:

```bash
PYTHONPATH=src uv run python -m talentpulse_ai.scripts.evaluation.hosted_generation_eval \
  --provider all \
  --journey CV_GENERATION \
  --journey CV_LOCALIZATION \
  --dataset evals/datasets/generation_quality_eval_v1.json \
  --output /tmp/talentpulse-cv-generation-candidate.json
```

3. Compare with the recorded baseline per hosted profile. Confirm first-pass contract validity, completion/retry frequency, call/repair counts, latency, omissions and safety outcomes independently. Human-review at least 10 representative synthetic outputs per profile using relevance, factual accuracy, usefulness and grounding.
4. Do not run the command or start reviewer distribution until the user authorizes provider cost/data processing. No results from deterministic provider doubles count as hosted-quality evidence.

## Rollback

Restore the previous AI-service CV generation code/provider policy for the affected profile. Keep NestJS ownership/consent/approval enforcement and the editor's pending-draft lifecycle active. No database migration or persisted CV repair is required; do not delete or apply pending drafts as part of rollback. Re-run the deterministic CV API, provider and review lifecycle suites before restoring the candidate policy.
