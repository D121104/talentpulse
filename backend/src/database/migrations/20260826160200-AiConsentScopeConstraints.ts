import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Protects existing deployments from accepting new arbitrary consent rows.
 * NOT VALID keeps the migration deployable when an older database contains
 * legacy rows; all new writes and updates are still checked by PostgreSQL.
 */
export class AiConsentScopeConstraints20260826160200 implements MigrationInterface {
  name = 'AiConsentScopeConstraints20260826160200';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'CHK_ai_cv_consents_scope'
        ) THEN
          ALTER TABLE "ai_cv_consents"
          ADD CONSTRAINT "CHK_ai_cv_consents_scope"
          CHECK ("scope" = 'cv_matching') NOT VALID;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'CHK_ai_cv_consent_events_scope'
        ) THEN
          ALTER TABLE "ai_cv_consent_events"
          ADD CONSTRAINT "CHK_ai_cv_consent_events_scope"
          CHECK ("scope" = 'cv_matching') NOT VALID;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "ai_cv_consent_events" DROP CONSTRAINT IF EXISTS "CHK_ai_cv_consent_events_scope"',
    );
    await queryRunner.query(
      'ALTER TABLE "ai_cv_consents" DROP CONSTRAINT IF EXISTS "CHK_ai_cv_consents_scope"',
    );
  }
}
