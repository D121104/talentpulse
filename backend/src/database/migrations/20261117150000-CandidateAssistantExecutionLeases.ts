import { MigrationInterface, QueryRunner } from 'typeorm';

export class CandidateAssistantExecutionLeases20261117150000
  implements MigrationInterface
{
  name = 'CandidateAssistantExecutionLeases20261117150000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "ai_chat_quota_ledger"
        ADD COLUMN IF NOT EXISTS "executionOwner" uuid NULL,
        ADD COLUMN IF NOT EXISTS "leaseExpiresAt" timestamptz NULL,
        ADD COLUMN IF NOT EXISTS "executionSessionId" uuid NULL,
        ADD COLUMN IF NOT EXISTS "executionUserMessageId" uuid NULL,
        ADD COLUMN IF NOT EXISTS "executionAssistantMessageId" uuid NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ai_chat_quota_lease_expiry"
      ON "ai_chat_quota_ledger" ("leaseExpiresAt", "_id")
      WHERE "status" = 'RESERVED' AND "leaseExpiresAt" IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const active = await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM "ai_chat_quota_ledger"
        WHERE "status" = 'RESERVED' AND "executionOwner" IS NOT NULL
      ) AS has_active_leases
    `);
    if (active[0]?.has_active_leases) {
      throw new Error(
        'Reconcile active candidate assistant leases before rollback.',
      );
    }
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_ai_chat_quota_lease_expiry"`,
    );
    await queryRunner.query(`
      ALTER TABLE "ai_chat_quota_ledger"
        DROP COLUMN IF EXISTS "executionAssistantMessageId",
        DROP COLUMN IF EXISTS "executionUserMessageId",
        DROP COLUMN IF EXISTS "executionSessionId",
        DROP COLUMN IF EXISTS "leaseExpiresAt",
        DROP COLUMN IF EXISTS "executionOwner"
    `);
  }
}
