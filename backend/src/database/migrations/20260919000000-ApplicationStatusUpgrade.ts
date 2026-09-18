import { MigrationInterface, QueryRunner } from 'typeorm';

export class ApplicationStatusUpgrade20260919000000
  implements MigrationInterface
{
  name = 'ApplicationStatusUpgrade20260919000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add new enum values to applications_status_enum safely
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE "applications_status_enum" ADD VALUE IF NOT EXISTS 'INTERVIEWING';
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE "applications_status_enum" ADD VALUE IF NOT EXISTS 'SUITABLE';
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE "applications_status_enum" ADD VALUE IF NOT EXISTS 'WITHDRAWN';
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    // 2. Migrate legacy 'APPROVED' to 'SUITABLE'
    await queryRunner.query(`
      UPDATE "applications"
      SET "status" = 'SUITABLE'
      WHERE "status"::text = 'APPROVED';
    `);

    // 3. Add version column for optimistic locking
    await queryRunner.query(`
      ALTER TABLE "applications"
      ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1;
    `);

    // 4. Add withdrawal tracking columns
    await queryRunner.query(`
      ALTER TABLE "applications"
      ADD COLUMN IF NOT EXISTS "withdrawnAt" TIMESTAMP;
    `);

    await queryRunner.query(`
      ALTER TABLE "applications"
      ADD COLUMN IF NOT EXISTS "withdrawReason" text;
    `);

    // 5. Index for fast active application lookups
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_applications_user_job_active"
      ON "applications" ("userId", "jobId")
      WHERE "isDeleted" = false;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_applications_user_job_active";
    `);

    await queryRunner.query(`
      ALTER TABLE "applications"
      DROP COLUMN IF EXISTS "withdrawReason";
    `);

    await queryRunner.query(`
      ALTER TABLE "applications"
      DROP COLUMN IF EXISTS "withdrawnAt";
    `);

    await queryRunner.query(`
      ALTER TABLE "applications"
      DROP COLUMN IF EXISTS "version";
    `);
  }
}
