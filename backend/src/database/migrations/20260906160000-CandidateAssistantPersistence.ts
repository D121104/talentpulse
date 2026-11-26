import { MigrationInterface, QueryRunner } from 'typeorm';

export class CandidateAssistantPersistence20260906160000
  implements MigrationInterface
{
  name = 'CandidateAssistantPersistence20260906160000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await q.query(
      `CREATE TABLE IF NOT EXISTS "ai_candidate_assistant_consents" ("_id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "consentVersion" varchar(80) NOT NULL, "policyHash" varchar(128) NOT NULL, "status" varchar(16) NOT NULL, "grantedAt" timestamptz NULL, "revokedAt" timestamptz NULL, "source" varchar(80) NOT NULL, "sourceMetadata" jsonb NULL, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_ai_candidate_assistant_consents" PRIMARY KEY ("_id"), CONSTRAINT "FK_ai_candidate_assistant_consents_user" FOREIGN KEY ("userId") REFERENCES "users" ("_id") ON DELETE CASCADE)`,
    );
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ai_candidate_assistant_consents_active" ON "ai_candidate_assistant_consents" ("userId") WHERE "status" = 'GRANTED'`,
    );
    await q.query(
      `CREATE TABLE IF NOT EXISTS "ai_candidate_assistant_consent_events" ("_id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "consentId" uuid NULL, "consentVersion" varchar(80) NOT NULL, "policyHash" varchar(128) NOT NULL, "eventType" varchar(16) NOT NULL, "occurredAt" timestamptz NOT NULL DEFAULT now(), "source" varchar(80) NOT NULL, "sourceMetadata" jsonb NULL, CONSTRAINT "PK_ai_candidate_assistant_consent_events" PRIMARY KEY ("_id"), CONSTRAINT "FK_ai_candidate_assistant_consent_events_user" FOREIGN KEY ("userId") REFERENCES "users" ("_id") ON DELETE CASCADE)`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ai_candidate_assistant_consent_events_user_occurred" ON "ai_candidate_assistant_consent_events" ("userId", "occurredAt")`,
    );
    await q.query(
      `CREATE TABLE IF NOT EXISTS "ai_chat_sessions" ("_id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "mode" varchar(32) NOT NULL, "title" varchar(160) NULL, "archivedAt" timestamptz NULL, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_ai_chat_sessions" PRIMARY KEY ("_id"), CONSTRAINT "FK_ai_chat_sessions_user" FOREIGN KEY ("userId") REFERENCES "users" ("_id") ON DELETE CASCADE, CONSTRAINT "CHK_ai_chat_sessions_mode" CHECK ("mode" IN ('JOB_SEARCH','CV_ANALYSIS','CV_JOB_COMPARISON','ADVICE')))`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ai_chat_sessions_user_updated" ON "ai_chat_sessions" ("userId", "updatedAt")`,
    );
    await q.query(
      `CREATE TABLE IF NOT EXISTS "ai_chat_messages" ("_id" uuid NOT NULL DEFAULT uuid_generate_v4(), "sessionId" uuid NOT NULL, "parentMessageId" uuid NULL, "role" varchar(16) NOT NULL, "status" varchar(24) NOT NULL, "content" text NULL, "clientMessageId" varchar(160) NULL, "blocks" jsonb NULL, "citations" jsonb NULL, "filterState" jsonb NULL, "errorCode" varchar(64) NULL, "createdAt" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_ai_chat_messages" PRIMARY KEY ("_id"), CONSTRAINT "FK_ai_chat_messages_session" FOREIGN KEY ("sessionId") REFERENCES "ai_chat_sessions" ("_id") ON DELETE CASCADE, CONSTRAINT "FK_ai_chat_messages_parent" FOREIGN KEY ("parentMessageId") REFERENCES "ai_chat_messages" ("_id") ON DELETE SET NULL, CONSTRAINT "CHK_ai_chat_messages_role" CHECK ("role" IN ('USER','ASSISTANT')))`,
    );
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ai_chat_messages_client_id" ON "ai_chat_messages" ("sessionId", "clientMessageId") WHERE "clientMessageId" IS NOT NULL`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ai_chat_messages_session_created" ON "ai_chat_messages" ("sessionId", "createdAt")`,
    );
    await q.query(
      `CREATE TABLE IF NOT EXISTS "ai_chat_quota_ledger" ("_id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "quotaDate" date NOT NULL, "reservationKey" varchar(160) NOT NULL, "messageId" uuid NULL, "status" varchar(16) NOT NULL, "errorCode" varchar(64) NULL, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(), "finalizedAt" timestamptz NULL, CONSTRAINT "PK_ai_chat_quota_ledger" PRIMARY KEY ("_id"), CONSTRAINT "FK_ai_chat_quota_ledger_user" FOREIGN KEY ("userId") REFERENCES "users" ("_id") ON DELETE CASCADE)`,
    );
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ai_chat_quota_reservation" ON "ai_chat_quota_ledger" ("userId", "quotaDate", "reservationKey")`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ai_chat_quota_user_date_status" ON "ai_chat_quota_ledger" ("userId", "quotaDate", "status")`,
    );
    await q.query(
      `CREATE TABLE IF NOT EXISTS "application_ai_consent_events" ("_id" uuid NOT NULL DEFAULT uuid_generate_v4(), "applicationId" uuid NOT NULL, "userId" uuid NOT NULL, "granted" boolean NOT NULL, "consentVersion" varchar(80) NULL, "policyHash" varchar(128) NULL, "source" varchar(80) NULL, "occurredAt" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_application_ai_consent_events" PRIMARY KEY ("_id"), CONSTRAINT "FK_application_ai_consent_events_application" FOREIGN KEY ("applicationId") REFERENCES "applications" ("_id") ON DELETE CASCADE, CONSTRAINT "FK_application_ai_consent_events_user" FOREIGN KEY ("userId") REFERENCES "users" ("_id") ON DELETE CASCADE)`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_application_ai_consent_events_application_occurred" ON "application_ai_consent_events" ("applicationId", "occurredAt")`,
    );
    await q.query(
      `ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "aiRankingConsentGranted" boolean NULL, ADD COLUMN IF NOT EXISTS "aiRankingConsentVersion" varchar(80) NULL, ADD COLUMN IF NOT EXISTS "aiRankingConsentPolicyHash" varchar(128) NULL, ADD COLUMN IF NOT EXISTS "aiRankingConsentAt" timestamptz NULL`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "applications" DROP COLUMN IF EXISTS "aiRankingConsentAt", DROP COLUMN IF EXISTS "aiRankingConsentPolicyHash", DROP COLUMN IF EXISTS "aiRankingConsentVersion", DROP COLUMN IF EXISTS "aiRankingConsentGranted"`,
    );
    await q.query(`DROP TABLE IF EXISTS "application_ai_consent_events"`);
    await q.query(`DROP TABLE IF EXISTS "ai_chat_quota_ledger"`);
    await q.query(`DROP TABLE IF EXISTS "ai_chat_messages"`);
    await q.query(`DROP TABLE IF EXISTS "ai_chat_sessions"`);
    await q.query(
      `DROP TABLE IF EXISTS "ai_candidate_assistant_consent_events"`,
    );
    await q.query(`DROP TABLE IF EXISTS "ai_candidate_assistant_consents"`);
  }
}
