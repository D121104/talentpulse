import { MigrationInterface, QueryRunner } from 'typeorm';

export class CandidateCareerProfile20260920010000
  implements MigrationInterface
{
  name = 'CandidateCareerProfile20260920010000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "candidate_career_profiles" (
        "_id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "contact" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "headline" varchar(500),
        "objective" text,
        "experience" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "education" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "projects" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "certificates" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "skills" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "activities" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "awards" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "contentVersion" integer NOT NULL DEFAULT 1,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_candidate_career_profiles_user" UNIQUE ("userId"),
        CONSTRAINT "FK_candidate_career_profiles_user" FOREIGN KEY ("userId") REFERENCES "users"("_id") ON DELETE CASCADE,
        CONSTRAINT "CHK_candidate_career_profiles_content_version" CHECK ("contentVersion" >= 1)
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "online_cvs"
        ADD COLUMN IF NOT EXISTS "projects" jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS "sourceProfileId" uuid,
        ADD COLUMN IF NOT EXISTS "sourceProfileVersion" integer,
        ADD COLUMN IF NOT EXISTS "generationSnapshot" jsonb
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_online_cvs_source_profile"
      ON "online_cvs" ("sourceProfileId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_online_cvs_source_profile"`,
    );
    await queryRunner.query(`
      ALTER TABLE "online_cvs"
        DROP COLUMN IF EXISTS "generationSnapshot",
        DROP COLUMN IF EXISTS "sourceProfileVersion",
        DROP COLUMN IF EXISTS "sourceProfileId",
        DROP COLUMN IF EXISTS "projects"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "candidate_career_profiles"`);
  }
}
