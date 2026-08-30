import 'reflect-metadata';

import { getMetadataArgsStorage, QueryRunner } from 'typeorm';
import {
  AiIndexAggregateType,
  AiIndexOutbox,
  AiIndexOutboxOperation,
  AiIndexOutboxStatus,
} from './entities/ai-index-outbox.entity';
import {
  AiJobIndexState,
  AiJobIndexStateStatus,
} from './entities/ai-job-index-state.entity';
import {
  AiProviderAttempt,
  AiProviderAttemptStatus,
} from './entities/ai-provider-attempt.entity';
import { Phase2AiIndexingPersistence20260827160000 } from '../database/migrations/20260827160000-Phase2AiIndexingPersistence';
import { AiProviderAttemptJobId20260828170000 } from '../database/migrations/20260828170000-AiProviderAttemptJobId';
import { AiProviderAttemptRequestSentInvariant20260829100000 } from '../database/migrations/20260829100000-AiProviderAttemptRequestSentInvariant';

type IndexingEntity =
  | typeof AiIndexOutbox
  | typeof AiJobIndexState
  | typeof AiProviderAttempt;

const storage = getMetadataArgsStorage();

function columnsFor(target: IndexingEntity) {
  return storage.columns.filter((column) => column.target === target);
}

function columnFor(target: IndexingEntity, propertyName: string) {
  const column = columnsFor(target).find(
    (candidate) => candidate.propertyName === propertyName,
  );
  if (!column) {
    throw new Error(`${target.name}.${propertyName} metadata is missing`);
  }
  return column;
}

describe('AI indexing persistence metadata', () => {
  it('uses UUID identities and bounded enum state columns', () => {
    for (const [target, propertyName] of [
      [AiIndexOutbox, '_id'],
      [AiJobIndexState, '_id'],
      [AiProviderAttempt, 'providerAttemptId'],
    ] as const) {
      const generation = storage.generations.find(
        (candidate) => candidate.target === target,
      );
      expect(generation?.strategy).toBe('uuid');
      expect(generation?.propertyName).toBe(propertyName);
    }

    expect(columnFor(AiIndexOutbox, 'aggregateType').options.enum).toEqual(
      AiIndexAggregateType,
    );
    expect(columnFor(AiIndexOutbox, 'operation').options.enum).toEqual(
      AiIndexOutboxOperation,
    );
    expect(columnFor(AiIndexOutbox, 'status').options.enum).toEqual(
      AiIndexOutboxStatus,
    );
    expect(columnFor(AiJobIndexState, 'status').options.enum).toEqual(
      AiJobIndexStateStatus,
    );
    expect(columnFor(AiProviderAttempt, 'status').options.enum).toEqual(
      AiProviderAttemptStatus,
    );
  });

  it('isolates one mutable index state row per job and environment', () => {
    expect(columnFor(AiJobIndexState, 'environment').options).toMatchObject({
      name: 'environment',
      type: 'varchar',
      length: 32,
    });

    const uniqueIndex = storage.indices.find(
      (index) =>
        index.target === AiJobIndexState &&
        index.name === 'UQ_ai_job_index_state_job_environment',
    );
    expect(uniqueIndex).toMatchObject({
      columns: ['jobId', 'environment'],
      unique: true,
    });

    const leaseIndex = storage.indices.find(
      (index) =>
        index.target === AiJobIndexState &&
        index.name === 'IDX_ai_job_index_state_lease',
    );
    expect(leaseIndex).toMatchObject({
      columns: ['leaseExpiresAt'],
      where: `"status" = 'PROCESSING'`,
    });
  });

  it('uses UTC-aware timestamps and a PostgreSQL UUID array for point IDs', () => {
    for (const target of [AiIndexOutbox, AiJobIndexState, AiProviderAttempt]) {
      expect(columnFor(target, 'createdAt').options.type).toBe('timestamptz');
      expect(columnFor(target, 'updatedAt').options.type).toBe('timestamptz');
    }

    expect(columnFor(AiJobIndexState, 'indexedPointIds').options).toMatchObject(
      {
        name: 'indexed_point_ids',
        type: 'uuid',
        array: true,
      },
    );
  });

  it('includes representation metadata without persistence of sensitive content', () => {
    for (const propertyName of [
      'contentHash',
      'metadataHash',
      'embeddingModelVersion',
      'embeddingDimensions',
      'collectionName',
      'collectionVersion',
      'indexSchemaVersion',
      'chunkingVersion',
      'normalizationVersion',
      'jobId',
    ]) {
      expect(() => columnFor(AiJobIndexState, propertyName)).not.toThrow();
    }

    const persistedNames = [AiIndexOutbox, AiJobIndexState, AiProviderAttempt]
      .flatMap(columnsFor)
      .map((column) => `${column.propertyName} ${column.options.name ?? ''}`)
      .join(' ')
      .toLowerCase();

    expect(persistedNames).not.toMatch(
      /prompt|raw.*response|provider.*response/,
    );
  });

  it('correlates provider attempts to jobs without deleting audit rows with the job', async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
        return [];
      }),
    } as unknown as QueryRunner;
    const migration = new AiProviderAttemptJobId20260828170000();

    await migration.up(queryRunner);
    const upSql = queries.join('\n');
    expect(upSql).toContain('ADD COLUMN IF NOT EXISTS "job_id" uuid NULL');
    expect(upSql).toContain(
      'FOREIGN KEY ("job_id") REFERENCES "jobs" ("_id") ON DELETE SET NULL',
    );
    expect(upSql).toContain(
      'CREATE INDEX IF NOT EXISTS "IDX_ai_provider_attempts_job"',
    );

    const providerJobIndex = storage.indices.find(
      (index) =>
        index.target === AiProviderAttempt &&
        index.name === 'IDX_ai_provider_attempts_job',
    );
    expect(providerJobIndex).toMatchObject({
      columns: ['jobId', 'createdAt'],
      where: '"job_id" IS NOT NULL',
    });
    expect(columnFor(AiProviderAttempt, 'jobId').options).toMatchObject({
      name: 'job_id',
      type: 'uuid',
      nullable: true,
    });

    queries.length = 0;
    await migration.down(queryRunner);
    const downSql = queries.join('\n');
    expect(downSql).toContain(
      'DROP INDEX IF EXISTS "IDX_ai_provider_attempts_job"',
    );
    expect(downSql).toContain(
      'DROP CONSTRAINT IF EXISTS "FK_ai_provider_attempts_job"',
    );
    expect(downSql).toContain('DROP COLUMN IF EXISTS "job_id"');
  });

  it('enforces request_sent for UNKNOWN provider-attempt rows', async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
        return [];
      }),
    } as unknown as QueryRunner;
    const migration = new AiProviderAttemptRequestSentInvariant20260829100000();

    await migration.up(queryRunner);
    const upSql = queries.join('\n');
    expect(upSql).toContain(
      'ADD CONSTRAINT "CHK_ai_provider_attempts_unknown_request_sent"',
    );
    expect(upSql).toContain(
      'CHECK ("status" <> \'UNKNOWN\' OR "request_sent" = true)',
    );

    queries.length = 0;
    await migration.down(queryRunner);
    expect(queries.join('\n')).toContain(
      'DROP CONSTRAINT IF EXISTS "CHK_ai_provider_attempts_unknown_request_sent"',
    );
  });

  it('defines an idempotent reversible migration for the three persistence tables', async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
        return [];
      }),
    } as unknown as QueryRunner;
    const migration = new Phase2AiIndexingPersistence20260827160000();

    await migration.up(queryRunner);
    const upSql = queries.join('\n');

    expect(upSql).toContain(
      'CREATE SEQUENCE IF NOT EXISTS "ai_index_source_version_seq"',
    );
    for (const table of [
      'ai_index_outbox',
      'ai_job_index_state',
      'ai_provider_attempts',
    ]) {
      expect(upSql).toContain(`CREATE TABLE IF NOT EXISTS "${table}"`);
    }
    expect(upSql).toContain('"source_version" bigint');
    expect(upSql).toContain(
      'ADD COLUMN IF NOT EXISTS "environment" varchar(32)',
    );
    expect(upSql).toContain('ALTER COLUMN "environment" SET NOT NULL');
    expect(upSql).toContain('"indexed_point_ids" jsonb');
    expect(upSql).toMatch(/"indexed_point_ids_v2" uuid\[\]/);
    expect(upSql).toMatch(
      /ALTER COLUMN "indexed_point_ids"\s+SET DEFAULT '\{\}'::uuid\[\]/,
    );
    expect(upSql).toContain('UNIQUE ("job_id", "environment")');
    expect(upSql).toContain('FOREIGN KEY');
    expect(upSql).toContain('TIMESTAMPTZ');
    expect(upSql).toContain('CREATE INDEX IF NOT EXISTS');
    expect(upSql).not.toMatch(/prompt|raw[_ ]?provider[_ ]?response/i);

    queries.length = 0;
    await migration.down(queryRunner);
    const downSql = queries.join('\n');
    expect(downSql).toContain('DROP TABLE IF EXISTS "ai_provider_attempts"');
    expect(downSql).toContain('DROP TABLE IF EXISTS "ai_job_index_state"');
    expect(downSql).toContain('DROP TABLE IF EXISTS "ai_index_outbox"');
    expect(downSql).toContain(
      'DROP SEQUENCE IF EXISTS "ai_index_source_version_seq"',
    );
  });
});
