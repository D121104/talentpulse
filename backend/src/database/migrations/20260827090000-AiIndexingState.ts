import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Persists the PostgreSQL side of the derived job-index workflow.
 *
 * PostgreSQL remains the source of truth for source versions and lifecycle
 * state. Qdrant point IDs are retained only as rebuild/delete metadata; no
 * prompt, CV/JD body, or raw provider response is stored here.
 */
export class AiIndexingState20260827090000 implements MigrationInterface {
  name = 'AiIndexingState20260827090000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ai_index_outbox" (
        "_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "aggregate_type" varchar(24) NOT NULL,
        "aggregate_id" uuid NOT NULL,
        "source_version" bigint NOT NULL,
        "operation" varchar(32) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "attempts" integer NOT NULL DEFAULT 0,
        "max_attempts" integer NOT NULL DEFAULT 10,
        "next_retry_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "last_attempt_at" TIMESTAMPTZ NULL,
        "leased_at" TIMESTAMPTZ NULL,
        "lease_expires_at" TIMESTAMPTZ NULL,
        "lease_owner" varchar(128) NULL,
        "last_error_code" varchar(80) NULL,
        "last_error_message" varchar(1000) NULL,
        "last_error_at" TIMESTAMPTZ NULL,
        "processed_at" TIMESTAMPTZ NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_index_outbox" PRIMARY KEY ("_id"),
        CONSTRAINT "UQ_ai_index_outbox_aggregate_version"
          UNIQUE ("aggregate_type", "aggregate_id", "source_version"),
        CONSTRAINT "CHK_ai_index_outbox_aggregate_type"
          CHECK ("aggregate_type" IN ('JOB', 'COMPANY')),
        CONSTRAINT "CHK_ai_index_outbox_source_version"
          CHECK ("source_version" > 0),
        CONSTRAINT "CHK_ai_index_outbox_operation"
          CHECK ("operation" IN ('UPSERT', 'DELETE', 'REINDEX_COMPANY')),
        CONSTRAINT "CHK_ai_index_outbox_status"
          CHECK ("status" IN ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'DEAD_LETTER', 'CANCELLED')),
        CONSTRAINT "CHK_ai_index_outbox_attempts"
          CHECK ("attempts" >= 0 AND "max_attempts" BETWEEN 1 AND 100 AND "attempts" <= "max_attempts")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ai_index_outbox_dispatch"
      ON "ai_index_outbox" ("status", "next_retry_at", "created_at")
      WHERE "status" IN ('PENDING', 'FAILED')
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ai_index_outbox_lease"
      ON "ai_index_outbox" ("lease_expires_at")
      WHERE "status" = 'PROCESSING'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ai_index_outbox_aggregate"
      ON "ai_index_outbox" ("aggregate_type", "aggregate_id", "source_version" DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ai_job_index_state" (
        "_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "job_id" uuid NOT NULL,
        "source_version" bigint NOT NULL DEFAULT 0,
        "status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "content_hash" varchar(64) NULL,
        "metadata_hash" varchar(64) NULL,
        "embedding_provider" varchar(80) NULL,
        "embedding_model_version" varchar(256) NULL,
        "embedding_dimensions" integer NULL,
        "collection_name" varchar(255) NULL,
        "collection_version" varchar(128) NULL,
        "index_schema_version" varchar(64) NULL,
        "chunking_version" varchar(64) NULL,
        "normalization_version" varchar(64) NULL,
        "indexed_point_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "attempts" integer NOT NULL DEFAULT 0,
        "next_retry_at" TIMESTAMPTZ NULL,
        "last_attempt_at" TIMESTAMPTZ NULL,
        "leased_at" TIMESTAMPTZ NULL,
        "lease_expires_at" TIMESTAMPTZ NULL,
        "lease_owner" varchar(128) NULL,
        "last_error_code" varchar(80) NULL,
        "last_error_message" varchar(1000) NULL,
        "last_error_at" TIMESTAMPTZ NULL,
        "indexed_at" TIMESTAMPTZ NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_job_index_state" PRIMARY KEY ("_id"),
        CONSTRAINT "UQ_ai_job_index_state_job" UNIQUE ("job_id"),
        CONSTRAINT "FK_ai_job_index_state_job"
          FOREIGN KEY ("job_id") REFERENCES "jobs" ("_id") ON DELETE CASCADE,
        CONSTRAINT "CHK_ai_job_index_state_source_version"
          CHECK ("source_version" >= 0),
        CONSTRAINT "CHK_ai_job_index_state_status"
          CHECK ("status" IN ('PENDING', 'PROCESSING', 'INDEXED', 'DELETED', 'FAILED', 'STALE')),
        CONSTRAINT "CHK_ai_job_index_state_indexed_point_ids"
          CHECK (jsonb_typeof("indexed_point_ids") = 'array'),
        CONSTRAINT "CHK_ai_job_index_state_attempts"
          CHECK ("attempts" >= 0),
        CONSTRAINT "CHK_ai_job_index_state_embedding_dimensions"
          CHECK ("embedding_dimensions" IS NULL OR "embedding_dimensions" BETWEEN 1 AND 4096)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ai_job_index_state_status_retry"
      ON "ai_job_index_state" ("status", "next_retry_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ai_job_index_state_lease"
      ON "ai_job_index_state" ("lease_expires_at")
      WHERE "status" = 'PROCESSING'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ai_job_index_state_collection_model"
      ON "ai_job_index_state" ("collection_name", "embedding_model_version")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ai_provider_attempts" (
        "provider_attempt_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "request_id" uuid NOT NULL,
        "trace_id" uuid NOT NULL,
        "outbox_id" uuid NULL,
        "attempt_number" integer NOT NULL DEFAULT 1,
        "provider" varchar(80) NOT NULL,
        "model" varchar(256) NOT NULL,
        "request_sent" boolean NOT NULL DEFAULT false,
        "status" varchar(16) NOT NULL DEFAULT 'STARTED',
        "input_tokens" integer NULL,
        "output_tokens" integer NULL,
        "total_tokens" integer NULL,
        "estimated_cost" numeric(18, 8) NULL,
        "error_code" varchar(80) NULL,
        "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "completed_at" TIMESTAMPTZ NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_provider_attempts" PRIMARY KEY ("provider_attempt_id"),
        CONSTRAINT "FK_ai_provider_attempts_outbox"
          FOREIGN KEY ("outbox_id") REFERENCES "ai_index_outbox" ("_id") ON DELETE SET NULL,
        CONSTRAINT "CHK_ai_provider_attempts_number"
          CHECK ("attempt_number" > 0),
        CONSTRAINT "CHK_ai_provider_attempts_status"
          CHECK ("status" IN ('STARTED', 'SUCCEEDED', 'FAILED', 'UNKNOWN')),
        CONSTRAINT "CHK_ai_provider_attempts_token_counts"
          CHECK (
            ("input_tokens" IS NULL OR "input_tokens" >= 0)
            AND ("output_tokens" IS NULL OR "output_tokens" >= 0)
            AND ("total_tokens" IS NULL OR "total_tokens" >= 0)
          ),
        CONSTRAINT "CHK_ai_provider_attempts_cost"
          CHECK ("estimated_cost" IS NULL OR "estimated_cost" >= 0)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ai_provider_attempts_request"
      ON "ai_provider_attempts" ("request_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ai_provider_attempts_trace"
      ON "ai_provider_attempts" ("trace_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ai_provider_attempts_status_created"
      ON "ai_provider_attempts" ("status", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ai_provider_attempts_outbox"
      ON "ai_provider_attempts" ("outbox_id", "created_at")
      WHERE "outbox_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_provider_attempts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_job_index_state"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_index_outbox"`);
  }
}
