import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds integrity guarantees that cannot be added to the initial migration
 * without making replay against older databases unsafe. NOT VALID preserves
 * existing data while enforcing these rules for new rows and updates.
 */
export class CandidateAssistantIntegrity20260908100000
  implements MigrationInterface
{
  name = 'CandidateAssistantIntegrity20260908100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ai_chat_messages_session_id"
      ON "ai_chat_messages" ("sessionId", "_id")
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'ai_chat_messages'::regclass
            AND conname = 'FK_ai_chat_messages_parent_same_session'
        ) THEN
          ALTER TABLE "ai_chat_messages"
          ADD CONSTRAINT "FK_ai_chat_messages_parent_same_session"
          FOREIGN KEY ("sessionId", "parentMessageId")
          REFERENCES "ai_chat_messages" ("sessionId", "_id")
          NOT VALID;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'ai_chat_messages'::regclass
            AND conname = 'CHK_ai_chat_messages_status'
        ) THEN
          ALTER TABLE "ai_chat_messages"
          ADD CONSTRAINT "CHK_ai_chat_messages_status"
          CHECK ("status" IN ('PROCESSING', 'COMPLETED', 'FAILED'))
          NOT VALID;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'ai_chat_messages'::regclass
            AND conname = 'CHK_ai_chat_messages_user_content'
        ) THEN
          ALTER TABLE "ai_chat_messages"
          ADD CONSTRAINT "CHK_ai_chat_messages_user_content"
          CHECK (
            "role" <> 'USER'
            OR ("content" IS NOT NULL AND length(btrim("content")) > 0)
          )
          NOT VALID;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'ai_chat_messages'::regclass
            AND conname = 'CHK_ai_chat_messages_parent_not_self'
        ) THEN
          ALTER TABLE "ai_chat_messages"
          ADD CONSTRAINT "CHK_ai_chat_messages_parent_not_self"
          CHECK ("parentMessageId" IS NULL OR "parentMessageId" <> "_id")
          NOT VALID;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'ai_chat_messages'::regclass
            AND conname = 'CHK_ai_chat_messages_client_id_role'
        ) THEN
          ALTER TABLE "ai_chat_messages"
          ADD CONSTRAINT "CHK_ai_chat_messages_client_id_role"
          CHECK (
            ("role" = 'USER' AND "clientMessageId" IS NOT NULL)
            OR ("role" = 'ASSISTANT' AND "clientMessageId" IS NULL)
          )
          NOT VALID;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'ai_chat_messages'::regclass
            AND conname = 'CHK_ai_chat_messages_failed_error'
        ) THEN
          ALTER TABLE "ai_chat_messages"
          ADD CONSTRAINT "CHK_ai_chat_messages_failed_error"
          CHECK ("status" <> 'FAILED' OR "errorCode" IS NOT NULL)
          NOT VALID;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ai_chat_quota_message"
      ON "ai_chat_quota_ledger" ("messageId")
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'ai_chat_quota_ledger'::regclass
            AND conname = 'FK_ai_chat_quota_ledger_message'
        ) THEN
          ALTER TABLE "ai_chat_quota_ledger"
          ADD CONSTRAINT "FK_ai_chat_quota_ledger_message"
          FOREIGN KEY ("messageId")
          REFERENCES "ai_chat_messages" ("_id")
          ON DELETE SET NULL
          NOT VALID;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'ai_chat_quota_ledger'::regclass
            AND conname = 'CHK_ai_chat_quota_status'
        ) THEN
          ALTER TABLE "ai_chat_quota_ledger"
          ADD CONSTRAINT "CHK_ai_chat_quota_status"
          CHECK ("status" IN ('RESERVED', 'COMMITTED', 'RELEASED'))
          NOT VALID;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'ai_chat_quota_ledger'::regclass
            AND conname = 'CHK_ai_chat_quota_reservation_state'
        ) THEN
          ALTER TABLE "ai_chat_quota_ledger"
          ADD CONSTRAINT "CHK_ai_chat_quota_reservation_state"
          CHECK (
            ("status" = 'RESERVED' AND "finalizedAt" IS NULL AND "errorCode" IS NULL AND "messageId" IS NULL)
            OR ("status" = 'COMMITTED' AND "finalizedAt" IS NOT NULL AND "errorCode" IS NULL AND "messageId" IS NOT NULL)
            OR ("status" = 'RELEASED' AND "finalizedAt" IS NOT NULL AND "errorCode" IS NOT NULL AND "messageId" IS NULL)
          )
          NOT VALID;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ai_candidate_assistant_consents_id_user"
      ON "ai_candidate_assistant_consents" ("_id", "userId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ai_candidate_assistant_consent_events_consent"
      ON "ai_candidate_assistant_consent_events" ("consentId")
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'ai_candidate_assistant_consent_events'::regclass
            AND conname = 'FK_ai_candidate_assistant_consent_events_consent'
        ) THEN
          ALTER TABLE "ai_candidate_assistant_consent_events"
          ADD CONSTRAINT "FK_ai_candidate_assistant_consent_events_consent"
          FOREIGN KEY ("consentId")
          REFERENCES "ai_candidate_assistant_consents" ("_id")
          ON DELETE SET NULL
          NOT VALID;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'ai_candidate_assistant_consent_events'::regclass
            AND conname = 'FK_ai_candidate_assistant_consent_events_consent_owner'
        ) THEN
          ALTER TABLE "ai_candidate_assistant_consent_events"
          ADD CONSTRAINT "FK_ai_candidate_assistant_consent_events_consent_owner"
          FOREIGN KEY ("consentId", "userId")
          REFERENCES "ai_candidate_assistant_consents" ("_id", "userId")
          NOT VALID;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'ai_candidate_assistant_consents'::regclass
            AND conname = 'CHK_ai_candidate_assistant_consents_status'
        ) THEN
          ALTER TABLE "ai_candidate_assistant_consents"
          ADD CONSTRAINT "CHK_ai_candidate_assistant_consents_status"
          CHECK ("status" IN ('GRANTED', 'REVOKED'))
          NOT VALID;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'ai_candidate_assistant_consents'::regclass
            AND conname = 'CHK_ai_candidate_assistant_consents_timestamps'
        ) THEN
          ALTER TABLE "ai_candidate_assistant_consents"
          ADD CONSTRAINT "CHK_ai_candidate_assistant_consents_timestamps"
          CHECK (
            ("status" = 'GRANTED' AND "grantedAt" IS NOT NULL AND "revokedAt" IS NULL)
            OR ("status" = 'REVOKED' AND "grantedAt" IS NOT NULL AND "revokedAt" IS NOT NULL)
          )
          NOT VALID;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'ai_candidate_assistant_consent_events'::regclass
            AND conname = 'CHK_ai_candidate_assistant_consent_events_type'
        ) THEN
          ALTER TABLE "ai_candidate_assistant_consent_events"
          ADD CONSTRAINT "CHK_ai_candidate_assistant_consent_events_type"
          CHECK ("eventType" IN ('GRANTED', 'REVOKED'))
          NOT VALID;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_applications_id_user"
      ON "applications" ("_id", "userId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_application_ai_consent_events_application_user"
      ON "application_ai_consent_events" ("applicationId", "userId")
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'application_ai_consent_events'::regclass
            AND conname = 'FK_application_ai_consent_events_application_user'
        ) THEN
          ALTER TABLE "application_ai_consent_events"
          ADD CONSTRAINT "FK_application_ai_consent_events_application_user"
          FOREIGN KEY ("applicationId", "userId")
          REFERENCES "applications" ("_id", "userId")
          ON DELETE CASCADE
          NOT VALID;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'application_ai_consent_events'::regclass
            AND conname = 'CHK_application_ai_consent_events_snapshot'
        ) THEN
          ALTER TABLE "application_ai_consent_events"
          ADD CONSTRAINT "CHK_application_ai_consent_events_snapshot"
          CHECK (
            NOT "granted"
            OR ("consentVersion" IS NOT NULL AND "policyHash" IS NOT NULL)
          )
          NOT VALID;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'applications'::regclass
            AND conname = 'CHK_applications_ai_consent_snapshot'
        ) THEN
          ALTER TABLE "applications"
          ADD CONSTRAINT "CHK_applications_ai_consent_snapshot"
          CHECK (
            "aiRankingConsentGranted" IS DISTINCT FROM TRUE
            OR (
              "aiRankingConsentVersion" IS NOT NULL
              AND "aiRankingConsentPolicyHash" IS NOT NULL
              AND "aiRankingConsentAt" IS NOT NULL
            )
          )
          NOT VALID;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "applications" DROP CONSTRAINT IF EXISTS "CHK_applications_ai_consent_snapshot"`,
    );
    await queryRunner.query(
      `ALTER TABLE "application_ai_consent_events" DROP CONSTRAINT IF EXISTS "CHK_application_ai_consent_events_snapshot"`,
    );
    await queryRunner.query(
      `ALTER TABLE "application_ai_consent_events" DROP CONSTRAINT IF EXISTS "FK_application_ai_consent_events_application_user"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_application_ai_consent_events_application_user"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_applications_id_user"`);

    await queryRunner.query(
      `ALTER TABLE "ai_candidate_assistant_consent_events" DROP CONSTRAINT IF EXISTS "CHK_ai_candidate_assistant_consent_events_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_candidate_assistant_consents" DROP CONSTRAINT IF EXISTS "CHK_ai_candidate_assistant_consents_timestamps"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_candidate_assistant_consents" DROP CONSTRAINT IF EXISTS "CHK_ai_candidate_assistant_consents_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_candidate_assistant_consent_events" DROP CONSTRAINT IF EXISTS "FK_ai_candidate_assistant_consent_events_consent_owner"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_candidate_assistant_consent_events" DROP CONSTRAINT IF EXISTS "FK_ai_candidate_assistant_consent_events_consent"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_ai_candidate_assistant_consent_events_consent"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_ai_candidate_assistant_consents_id_user"`,
    );

    await queryRunner.query(
      `ALTER TABLE "ai_chat_quota_ledger" DROP CONSTRAINT IF EXISTS "CHK_ai_chat_quota_reservation_state"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_chat_quota_ledger" DROP CONSTRAINT IF EXISTS "CHK_ai_chat_quota_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_chat_quota_ledger" DROP CONSTRAINT IF EXISTS "FK_ai_chat_quota_ledger_message"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ai_chat_quota_message"`);

    await queryRunner.query(
      `ALTER TABLE "ai_chat_messages" DROP CONSTRAINT IF EXISTS "CHK_ai_chat_messages_client_id_role"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_chat_messages" DROP CONSTRAINT IF EXISTS "CHK_ai_chat_messages_parent_not_self"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_chat_messages" DROP CONSTRAINT IF EXISTS "CHK_ai_chat_messages_failed_error"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_chat_messages" DROP CONSTRAINT IF EXISTS "CHK_ai_chat_messages_user_content"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_chat_messages" DROP CONSTRAINT IF EXISTS "CHK_ai_chat_messages_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_chat_messages" DROP CONSTRAINT IF EXISTS "FK_ai_chat_messages_parent_same_session"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_ai_chat_messages_session_id"`);
  }
}
