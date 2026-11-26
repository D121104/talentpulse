import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInterviewTables20260919000001
  implements MigrationInterface
{
  name = 'CreateInterviewTables20260919000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // 1. Create Enums
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "interview_round_type_enum" AS ENUM ('TECHNICAL', 'HR', 'CULTURE', 'FINAL');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "interview_round_status_enum" AS ENUM (
          'PENDING_CONFIRMATION',
          'CONFIRMED',
          'DECLINED',
          'RESCHEDULED',
          'IN_PROGRESS',
          'COMPLETED',
          'CANCELLED',
          'NO_SHOW'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "interview_round_result_enum" AS ENUM ('PENDING', 'PASSED', 'FAILED', 'ON_HOLD');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    // Add INTERVIEW to notifications enum if notifications type enum exists
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE "notifications_type_enum" ADD VALUE IF NOT EXISTS 'INTERVIEW';
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE "notifications_targettype_enum" ADD VALUE IF NOT EXISTS 'interview';
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    // 2. Create interview_rounds table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "interview_rounds" (
        "_id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "applicationId" uuid NOT NULL REFERENCES "applications"("_id") ON DELETE CASCADE,
        "companyId" uuid NOT NULL REFERENCES "companies"("_id") ON DELETE CASCADE,
        "roundNumber" integer NOT NULL DEFAULT 1,
        "title" character varying(255) NOT NULL,
        "roundType" "interview_round_type_enum" NOT NULL DEFAULT 'TECHNICAL',
        "status" "interview_round_status_enum" NOT NULL DEFAULT 'PENDING_CONFIRMATION',
        "scheduledAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "scheduledEndAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "durationMinutes" integer NOT NULL DEFAULT 60,
        "roomId" character varying(100) NOT NULL UNIQUE,
        "roomPassword" character varying(50),
        "meetingLink" character varying(500),
        "location" text,
        "isOnline" boolean NOT NULL DEFAULT true,
        "notes" text,
        "result" "interview_round_result_enum" NOT NULL DEFAULT 'PENDING',
        "candidateFeedback" text,
        "interviewerFeedback" text,
        "score" integer,
        "inviteSentAt" TIMESTAMP WITH TIME ZONE,
        "confirmedAt" TIMESTAMP WITH TIME ZONE,
        "declinedAt" TIMESTAMP WITH TIME ZONE,
        "startedAt" TIMESTAMP WITH TIME ZONE,
        "endedAt" TIMESTAMP WITH TIME ZONE,
        "version" integer NOT NULL DEFAULT 1,
        "isDeleted" boolean NOT NULL DEFAULT false,
        "deletedAt" TIMESTAMP,
        "createdBy" jsonb,
        "updatedBy" jsonb,
        "deletedBy" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    // 3. Create interview_participants table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "interview_participants" (
        "_id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "roundId" uuid NOT NULL REFERENCES "interview_rounds"("_id") ON DELETE CASCADE,
        "userId" uuid NOT NULL REFERENCES "users"("_id") ON DELETE CASCADE,
        "role" character varying(50) NOT NULL DEFAULT 'INTERVIEWER',
        "joinedAt" TIMESTAMP WITH TIME ZONE,
        "leftAt" TIMESTAMP WITH TIME ZONE,
        "feedback" text,
        "rating" integer,
        "isDeleted" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    // 4. Indexes for query optimization & scheduling collision detection
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_interview_rounds_company_schedule"
      ON "interview_rounds" ("companyId", "scheduledAt", "scheduledEndAt")
      WHERE "isDeleted" = false;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_interview_rounds_application"
      ON "interview_rounds" ("applicationId")
      WHERE "isDeleted" = false;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_interview_rounds_status"
      ON "interview_rounds" ("status")
      WHERE "isDeleted" = false;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_interview_rounds_room"
      ON "interview_rounds" ("roomId");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_interview_participants_round_user"
      ON "interview_participants" ("roundId", "userId");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "interview_participants";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "interview_rounds";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "interview_round_result_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "interview_round_status_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "interview_round_type_enum";`);
  }
}
