import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSavedJobsAndJobApplicantViews20260915173000
  implements MigrationInterface
{
  name = 'AddSavedJobsAndJobApplicantViews20260915173000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // 1. Create table saved_jobs
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "saved_jobs" (
        "_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "jobId" uuid NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_saved_jobs_id" PRIMARY KEY ("_id"),
        CONSTRAINT "UQ_saved_jobs_userId_jobId" UNIQUE ("userId", "jobId"),
        CONSTRAINT "FK_saved_jobs_user" FOREIGN KEY ("userId") REFERENCES "users" ("_id") ON DELETE CASCADE,
        CONSTRAINT "FK_saved_jobs_job" FOREIGN KEY ("jobId") REFERENCES "jobs" ("_id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_saved_jobs_userId" ON "saved_jobs" ("userId");
      CREATE INDEX IF NOT EXISTS "IDX_saved_jobs_jobId" ON "saved_jobs" ("jobId");
    `);

    // 2. Create table job_applicant_views (for candidate premium view quota tracking)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "job_applicant_views" (
        "_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "jobId" uuid NOT NULL,
        "unlockedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_job_applicant_views_id" PRIMARY KEY ("_id"),
        CONSTRAINT "FK_job_applicant_views_user" FOREIGN KEY ("userId") REFERENCES "users" ("_id") ON DELETE CASCADE,
        CONSTRAINT "FK_job_applicant_views_job" FOREIGN KEY ("jobId") REFERENCES "jobs" ("_id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_job_applicant_views_userId_jobId" ON "job_applicant_views" ("userId", "jobId");
      CREATE INDEX IF NOT EXISTS "IDX_job_applicant_views_userId_unlockedAt" ON "job_applicant_views" ("userId", "unlockedAt");
      CREATE INDEX IF NOT EXISTS "IDX_job_applicant_views_userId" ON "job_applicant_views" ("userId");
      CREATE INDEX IF NOT EXISTS "IDX_job_applicant_views_jobId" ON "job_applicant_views" ("jobId");
      CREATE INDEX IF NOT EXISTS "IDX_job_applicant_views_unlockedAt" ON "job_applicant_views" ("unlockedAt");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "job_applicant_views"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "saved_jobs"`);
  }
}
