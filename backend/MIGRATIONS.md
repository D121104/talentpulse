# Backend database workflow

The application must not change production schemas through TypeORM synchronize. Production requires `DB_SYNCHRONIZE=false` and applies reviewed migrations:

```powershell
npm run migration:show
npm run migration:run
npm run migration:revert # only for an explicitly reviewed rollback
```

The CLI uses `src/database/data-source.ts`, discovers entities and migrations, and sets the PostgreSQL session timezone to UTC. Generate a migration only after reviewing the entity/schema diff, then inspect the generated SQL before applying it:

```powershell
npm run migration:generate -- src/database/migrations/DescriptiveName
```

Local development keeps the existing `DB_SYNCHRONIZE=true` default for compatibility. Set it to `false` locally when exercising migrations. No migration in this phase invents legacy job dates; the active-job report is read-only.

## Staging AI-index operational commands

The AI-index outbox table has **no environment column**. It is not structurally
scoped by database rows. Every non-local staging operation therefore requires a
dedicated outbox database; `AI_INDEX_OUTBOX_ENVIRONMENT` is a deployment
assertion, not a row filter or a substitute for database isolation.

Before running any mutating command (`backfill`, `reconcile`,
`reconcile-qdrant`, `drain`, or `replay`) in staging:

1. Use the dedicated staging database; never point a staging command at the
   production outbox database.
2. Set `NODE_ENV=staging` and `DB_SYNCHRONIZE=false`. Staging and production
   default synchronization to false and reject an explicit true value.
3. Set both `AI_INDEX_ENVIRONMENT=staging` and
   `AI_INDEX_OUTBOX_ENVIRONMENT=staging`. The command also requires the
   explicit `--environment staging` argument and rejects a mismatch.
4. Do not switch a staging deployment to a `production` environment alias to
   operate production data. Run production operations from the production
   deployment and its dedicated database.
5. Resume `reconcile-qdrant` only with both the returned cursor and the same
   `--scan-run-id`; its cursor may be a UUID or canonical numeric Qdrant offset.

Examples (from `backend/`):

```bash
npm run ai-index -- backfill --environment staging --limit 100
npm run ai-index -- drain --environment staging --batch-size 10 --max-batches 20
npm run ai-index -- replay --environment staging --job-id <canonical-job-uuid> --limit 100
```
