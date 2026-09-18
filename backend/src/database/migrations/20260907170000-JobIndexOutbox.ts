import { MigrationInterface, QueryRunner } from 'typeorm';

export class JobIndexOutbox20260907170000 implements MigrationInterface {
  name = 'JobIndexOutbox20260907170000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "job_index_outbox" (
        "_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "aggregateId" uuid NOT NULL,
        "aggregateType" varchar(40) NOT NULL,
        "eventType" varchar(40) NOT NULL,
        "sourceVersion" varchar(128) NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'PENDING',
        "attemptCount" integer NOT NULL DEFAULT 0,
        "availableAt" timestamptz NOT NULL DEFAULT now(),
        "leaseUntil" timestamptz NULL,
        "leaseToken" uuid NULL,
        "claimedAt" timestamptz NULL,
        "processedAt" timestamptz NULL,
        "lastError" text NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_job_index_outbox" PRIMARY KEY ("_id"),
        CONSTRAINT "UQ_job_index_outbox_event" UNIQUE ("aggregateId", "sourceVersion", "eventType")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_job_index_outbox_claim"
      ON "job_index_outbox" ("status", "availableAt", "leaseUntil", "createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_job_index_outbox_claim"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "job_index_outbox"`);
  }
}
