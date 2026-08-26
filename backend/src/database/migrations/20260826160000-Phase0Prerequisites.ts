import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase0Prerequisites20260826160000 implements MigrationInterface {
  name = 'Phase0Prerequisites20260826160000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`
      ALTER TABLE "jobs"
      ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "companies"
      ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "user_cvs"
      ADD COLUMN IF NOT EXISTS "parseStatus" varchar(20) NOT NULL DEFAULT 'PENDING',
      ADD COLUMN IF NOT EXISTS "contentHash" varchar(64) NULL,
       ADD COLUMN IF NOT EXISTS "parsedAt" TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS "parseErrorCode" varchar(80) NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_cvs_parse_status"
      ON "user_cvs" ("parseStatus")
      WHERE "isDeleted" = false
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ai_cv_consents" (
        "_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "scope" varchar(80) NOT NULL,
        "consentVersion" varchar(80) NOT NULL,
        "policyHash" varchar(128) NOT NULL,
        "status" varchar(16) NOT NULL,
        "grantedAt" TIMESTAMP NULL,
        "revokedAt" TIMESTAMP NULL,
        "source" varchar(80) NOT NULL,
        "sourceMetadata" jsonb NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_cv_consents" PRIMARY KEY ("_id"),
        CONSTRAINT "FK_ai_cv_consents_user" FOREIGN KEY ("userId") REFERENCES "users" ("_id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ai_cv_consents_active_scope"
      ON "ai_cv_consents" ("userId", "scope")
      WHERE "status" = 'GRANTED'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ai_cv_consents_user_scope"
      ON "ai_cv_consents" ("userId", "scope")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ai_cv_consent_events" (
        "_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "consentId" uuid NULL,
        "scope" varchar(80) NOT NULL,
        "consentVersion" varchar(80) NOT NULL,
        "policyHash" varchar(128) NOT NULL,
        "eventType" varchar(16) NOT NULL,
        "occurredAt" TIMESTAMP NOT NULL DEFAULT now(),
        "source" varchar(80) NOT NULL,
        "sourceMetadata" jsonb NULL,
        CONSTRAINT "PK_ai_cv_consent_events" PRIMARY KEY ("_id"),
        CONSTRAINT "FK_ai_cv_consent_events_user" FOREIGN KEY ("userId") REFERENCES "users" ("_id") ON DELETE CASCADE,
        CONSTRAINT "FK_ai_cv_consent_events_consent" FOREIGN KEY ("consentId") REFERENCES "ai_cv_consents" ("_id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ai_cv_consent_events_user_scope"
      ON "ai_cv_consent_events" ("userId", "scope", "occurredAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_cv_consent_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_cv_consents"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_cvs_parse_status"`);
    await queryRunner.query(`ALTER TABLE "user_cvs" DROP COLUMN IF EXISTS "parseErrorCode"`);
    await queryRunner.query(`ALTER TABLE "user_cvs" DROP COLUMN IF EXISTS "parsedAt"`);
    await queryRunner.query(`ALTER TABLE "user_cvs" DROP COLUMN IF EXISTS "contentHash"`);
    await queryRunner.query(`ALTER TABLE "user_cvs" DROP COLUMN IF EXISTS "parseStatus"`);
  }
}
