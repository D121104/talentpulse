import { MigrationInterface, QueryRunner } from 'typeorm';

export class ActiveJobLegacyReport20260826160100 implements MigrationInterface {
  name = 'ActiveJobLegacyReport20260826160100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "active_job_legacy_reports" (
        "_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "jobId" uuid NOT NULL,
        "reasonCode" varchar(80) NOT NULL,
        "reportedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_active_job_legacy_reports" PRIMARY KEY ("_id"),
        CONSTRAINT "UQ_active_job_legacy_report" UNIQUE ("jobId", "reasonCode"),
        CONSTRAINT "FK_active_job_legacy_report_job" FOREIGN KEY ("jobId") REFERENCES "jobs" ("_id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      INSERT INTO "active_job_legacy_reports" ("jobId", "reasonCode")
      SELECT j."_id", CASE
        WHEN j."startDate" IS NULL THEN 'MISSING_START_DATE'
        WHEN j."endDate" IS NULL THEN 'MISSING_END_DATE'
        WHEN j."startDate" >= j."endDate" THEN 'INVALID_DATE_RANGE'
        WHEN j."isDeleted" = true OR j."deletedAt" IS NOT NULL THEN 'DELETED_JOB'
        WHEN j."isActive" = false THEN 'INACTIVE_JOB'
        WHEN c."_id" IS NULL THEN 'MISSING_CANONICAL_COMPANY'
        WHEN c."isActive" = false OR c."isDeleted" = true OR c."deletedAt" IS NOT NULL THEN 'INACTIVE_CANONICAL_COMPANY'
        WHEN j."startDate" > now() THEN 'NOT_STARTED'
        WHEN j."endDate" <= now() THEN 'EXPIRED'
        ELSE 'REVIEW_REQUIRED'
      END
      FROM "jobs" j
      LEFT JOIN "companies" c ON c."_id"::text = j."company"->>'_id'
      WHERE j."startDate" IS NULL
         OR j."endDate" IS NULL
         OR j."startDate" >= j."endDate"
         OR j."isActive" = false
         OR j."isDeleted" = true
         OR j."deletedAt" IS NOT NULL
         OR c."_id" IS NULL
         OR c."isActive" = false
         OR c."isDeleted" = true
         OR c."deletedAt" IS NOT NULL
         OR j."startDate" > now()
         OR j."endDate" <= now()
      ON CONFLICT ("jobId", "reasonCode") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "active_job_legacy_reports"`);
  }
}
