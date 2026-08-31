import { MigrationInterface, QueryRunner } from 'typeorm';

/** Adds durable, independently fenced initial-SQS publication metadata. */
export class AiIndexOutboxPublication20260831113000
  implements MigrationInterface
{
  name = 'AiIndexOutboxPublication20260831113000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "ai_index_outbox"
        ADD COLUMN IF NOT EXISTS "published_at" TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS "publish_attempts" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "publish_next_retry_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        ADD COLUMN IF NOT EXISTS "publish_leased_at" TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS "publish_lease_expires_at" TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS "publish_lease_owner" varchar(128) NULL,
        ADD COLUMN IF NOT EXISTS "last_publish_error_code" varchar(80) NULL,
        ADD COLUMN IF NOT EXISTS "last_publish_error_message" varchar(1000) NULL,
        ADD COLUMN IF NOT EXISTS "last_publish_error_at" TIMESTAMPTZ NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ai_index_outbox_publish"
      ON "ai_index_outbox" ("status", "next_retry_at", "publish_next_retry_at", "created_at")
      WHERE "status" = 'PENDING' AND "published_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ai_index_outbox_publish_lease"
      ON "ai_index_outbox" ("publish_lease_expires_at")
      WHERE "status" = 'PENDING' AND "published_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_ai_index_outbox_publish_lease"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_ai_index_outbox_publish"`,
    );
    await queryRunner.query(`
      ALTER TABLE "ai_index_outbox"
        DROP COLUMN IF EXISTS "last_publish_error_at",
        DROP COLUMN IF EXISTS "last_publish_error_message",
        DROP COLUMN IF EXISTS "last_publish_error_code",
        DROP COLUMN IF EXISTS "publish_lease_owner",
        DROP COLUMN IF EXISTS "publish_lease_expires_at",
        DROP COLUMN IF EXISTS "publish_leased_at",
        DROP COLUMN IF EXISTS "publish_next_retry_at",
        DROP COLUMN IF EXISTS "publish_attempts",
        DROP COLUMN IF EXISTS "published_at"
    `);
  }
}
