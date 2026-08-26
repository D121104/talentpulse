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
