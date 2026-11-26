import { MigrationInterface, QueryRunner } from 'typeorm';

export class AiCvGenerationAndOnlineCvMetadata20260919010000
  implements MigrationInterface
{
  name = 'AiCvGenerationAndOnlineCvMetadata20260919010000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "online_cvs"
        ADD COLUMN IF NOT EXISTS "generationMode" varchar(32) NOT NULL DEFAULT 'MANUAL',
        ADD COLUMN IF NOT EXISTS "contentVersion" integer NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS "sourceVersion" varchar(128),
        ADD COLUMN IF NOT EXISTS "generatedBy" varchar(32),
        ADD COLUMN IF NOT EXISTS "targetJobId" uuid,
        ADD COLUMN IF NOT EXISTS "revision" jsonb
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_online_cvs_target_job"
      ON "online_cvs" ("targetJobId")
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'CHK_online_cvs_generation_mode'
        ) THEN
          ALTER TABLE "online_cvs" ADD CONSTRAINT "CHK_online_cvs_generation_mode"
            CHECK ("generationMode" IN ('MANUAL', 'EDITOR_ONLY')) NOT VALID;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'CHK_online_cvs_content_version'
        ) THEN
          ALTER TABLE "online_cvs" ADD CONSTRAINT "CHK_online_cvs_content_version"
            CHECK ("contentVersion" >= 1) NOT VALID;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      ALTER TABLE "ai_cv_consents"
        DROP CONSTRAINT IF EXISTS "CHK_ai_cv_consents_scope"
    `);
    await queryRunner.query(`
      ALTER TABLE "ai_cv_consent_events"
        DROP CONSTRAINT IF EXISTS "CHK_ai_cv_consent_events_scope"
    `);
    await queryRunner.query(`
      ALTER TABLE "ai_cv_consents"
        ADD CONSTRAINT "CHK_ai_cv_consents_scope"
        CHECK ("scope" IN ('cv_matching', 'cv_generation')) NOT VALID
    `);
    await queryRunner.query(`
      ALTER TABLE "ai_cv_consent_events"
        ADD CONSTRAINT "CHK_ai_cv_consent_events_scope"
        CHECK ("scope" IN ('cv_matching', 'cv_generation')) NOT VALID
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ai_cv_consent_events" DROP CONSTRAINT IF EXISTS "CHK_ai_cv_consent_events_scope"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_cv_consents" DROP CONSTRAINT IF EXISTS "CHK_ai_cv_consents_scope"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_online_cvs_target_job"`);
    await queryRunner.query(
      `ALTER TABLE "online_cvs" DROP CONSTRAINT IF EXISTS "CHK_online_cvs_generation_mode"`,
    );
    await queryRunner.query(
      `ALTER TABLE "online_cvs" DROP CONSTRAINT IF EXISTS "CHK_online_cvs_content_version"`,
    );
    await queryRunner.query(`
      ALTER TABLE "online_cvs"
        DROP COLUMN IF EXISTS "revision",
        DROP COLUMN IF EXISTS "targetJobId",
        DROP COLUMN IF EXISTS "generatedBy",
        DROP COLUMN IF EXISTS "sourceVersion",
        DROP COLUMN IF EXISTS "contentVersion",
        DROP COLUMN IF EXISTS "generationMode"
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'CHK_ai_cv_consents_scope'
        ) THEN
          ALTER TABLE "ai_cv_consents" ADD CONSTRAINT "CHK_ai_cv_consents_scope"
            CHECK ("scope" = 'cv_matching') NOT VALID;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'CHK_ai_cv_consent_events_scope'
        ) THEN
          ALTER TABLE "ai_cv_consent_events" ADD CONSTRAINT "CHK_ai_cv_consent_events_scope"
            CHECK ("scope" = 'cv_matching') NOT VALID;
        END IF;
      END $$;
    `);
  }
}
