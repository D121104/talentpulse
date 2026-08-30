import { MigrationInterface, QueryRunner } from 'typeorm';

/** Prevents UNKNOWN audit rows from claiming that no request was sent. */
export class AiProviderAttemptRequestSentInvariant20260829100000
  implements MigrationInterface
{
  name = 'AiProviderAttemptRequestSentInvariant20260829100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'CHK_ai_provider_attempts_unknown_request_sent'
            AND conrelid = '"ai_provider_attempts"'::regclass
        ) THEN
          ALTER TABLE "ai_provider_attempts"
          ADD CONSTRAINT "CHK_ai_provider_attempts_unknown_request_sent"
          CHECK ("status" <> 'UNKNOWN' OR "request_sent" = true);
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "ai_provider_attempts"
      DROP CONSTRAINT IF EXISTS "CHK_ai_provider_attempts_unknown_request_sent"
    `);
  }
}
