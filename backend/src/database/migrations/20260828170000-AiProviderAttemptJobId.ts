import { MigrationInterface, QueryRunner } from 'typeorm';

/** Adds the optional canonical job correlation to provider-attempt audit rows. */
export class AiProviderAttemptJobId20260828170000
  implements MigrationInterface
{
  name = 'AiProviderAttemptJobId20260828170000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "ai_provider_attempts"
      ADD COLUMN IF NOT EXISTS "job_id" uuid NULL
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_ai_provider_attempts_job'
            AND conrelid = '"ai_provider_attempts"'::regclass
        ) THEN
          ALTER TABLE "ai_provider_attempts"
          ADD CONSTRAINT "FK_ai_provider_attempts_job"
          FOREIGN KEY ("job_id") REFERENCES "jobs" ("_id") ON DELETE SET NULL;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ai_provider_attempts_job"
      ON "ai_provider_attempts" ("job_id", "created_at")
      WHERE "job_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_ai_provider_attempts_job"`,
    );
    await queryRunner.query(`
      ALTER TABLE "ai_provider_attempts"
      DROP CONSTRAINT IF EXISTS "FK_ai_provider_attempts_job"
    `);
    await queryRunner.query(`
      ALTER TABLE "ai_provider_attempts"
      DROP COLUMN IF EXISTS "job_id"
    `);
  }
}
