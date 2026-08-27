import { ConfigService } from '@nestjs/config';
import {
  AiServiceError,
  AiServiceErrorCode,
} from '../ai-client/ai-client.errors';
import {
  AiIndexDispatcherService,
  createIndexIdempotencyKey,
  createIndexRequestId,
} from './services/ai-index-dispatcher.service';
import {
  AiIndexAggregateType,
  AiIndexOutbox,
  AiIndexOutboxOperation,
  AiIndexOutboxStatus,
  AiJobIndexState,
  AiJobIndexStateStatus,
} from './entities';

const OUTBOX_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const JOB_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const COMPANY_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const REQUEST_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function configValues(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = {
    AI_INDEX_WORKER_ID: 'worker-test',
    AI_INDEX_ENVIRONMENT: 'test',
    AI_INDEX_RETRY_JITTER_RATIO: 0,
    ...overrides,
  };
  return {
    get: jest.fn((key: string, fallback?: unknown) =>
      Object.prototype.hasOwnProperty.call(values, key)
        ? values[key]
        : fallback,
    ),
  } as never;
}

function createOutbox(overrides: Partial<AiIndexOutbox> = {}): AiIndexOutbox {
  return {
    _id: OUTBOX_ID,
    aggregateType: AiIndexAggregateType.JOB,
    aggregateId: JOB_ID,
    sourceVersion: '3',
    operation: AiIndexOutboxOperation.UPSERT,
    status: AiIndexOutboxStatus.PENDING,
    attempts: 0,
    maxAttempts: 3,
    nextRetryAt: new Date('2026-08-28T11:59:00.000Z'),
    lastAttemptAt: null,
    leasedAt: null,
    leaseExpiresAt: null,
    leaseOwner: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    lastErrorAt: null,
    processedAt: null,
    createdAt: new Date('2026-08-28T11:00:00.000Z'),
    updatedAt: new Date('2026-08-28T11:00:00.000Z'),
    ...overrides,
  } as AiIndexOutbox;
}

function createState(): AiJobIndexState {
  return {
    _id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    jobId: JOB_ID,
    environment: 'test',
    sourceVersion: '0',
    status: AiJobIndexStateStatus.PENDING,
    contentHash: null,
    metadataHash: null,
    embeddingProvider: null,
    embeddingModelVersion: null,
    embeddingDimensions: null,
    collectionName: null,
    collectionVersion: null,
    indexSchemaVersion: null,
    chunkingVersion: null,
    normalizationVersion: null,
    indexedPointIds: [],
    attempts: 0,
    nextRetryAt: null,
    lastAttemptAt: null,
    leasedAt: null,
    leaseExpiresAt: null,
    leaseOwner: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    lastErrorAt: null,
    indexedAt: null,
    createdAt: new Date('2026-08-28T11:00:00.000Z'),
    updatedAt: new Date('2026-08-28T11:00:00.000Z'),
  } as AiJobIndexState;
}

function chain(terminal: Record<string, any>): Record<string, any> {
  const methods = [
    'where',
    'andWhere',
    'setParameters',
    'orderBy',
    'addOrderBy',
    'take',
    'limit',
    'select',
    'setLock',
    'setOnLocked',
  ];
  for (const method of methods) {
    terminal[method] = jest.fn(() => terminal);
  }
  return terminal;
}

interface DispatcherHarness {
  service: AiIndexDispatcherService;
  outbox: AiIndexOutbox;
  managerOutboxRepository: Record<string, jest.Mock>;
  transaction: jest.Mock;
  aiClient: { indexJob: jest.Mock; deleteIndexedJob: jest.Mock };
  projection: {
    buildUpsertRequest: jest.Mock;
    projectCompanyJobs: jest.Mock;
    toIndexJobUpsertRequest: jest.Mock;
  };
  inTransaction: () => boolean;
}

function createHarness(
  outboxOverrides: Partial<AiIndexOutbox> = {},
  aiError?: AiServiceError,
): DispatcherHarness {
  const outbox = createOutbox(outboxOverrides);
  const state = createState();
  const transactionState = { active: false };
  const claimQuery = chain({
    getMany: jest.fn().mockResolvedValue([outbox]),
  });
  const latestQuery = chain({
    getRawOne: jest
      .fn()
      .mockResolvedValue({ sourceVersion: outbox.sourceVersion }),
  });
  const managerOutboxRepository: Record<string, jest.Mock> = {
    createQueryBuilder: jest.fn(() => claimQuery),
    save: jest.fn(async (value: AiIndexOutbox) => value),
    findOne: jest.fn(async () => outbox),
  };
  const stateRepository: Record<string, jest.Mock> = {
    findOne: jest.fn(async () => state),
    create: jest.fn((value: AiJobIndexState) => value),
    save: jest.fn(async (value: AiJobIndexState) => value),
  };
  const manager = {
    getRepository: jest.fn(
      (entity: typeof AiIndexOutbox | typeof AiJobIndexState) =>
        entity === AiIndexOutbox ? managerOutboxRepository : stateRepository,
    ),
  };
  const transaction = jest.fn(
    async (callback: (value: unknown) => Promise<unknown>) => {
      transactionState.active = true;
      try {
        return await callback(manager);
      } finally {
        transactionState.active = false;
      }
    },
  );
  const aiClient = {
    indexJob: jest.fn(async () => {
      expect(transactionState.active).toBe(false);
      if (aiError) throw aiError;
      return {
        request_id: REQUEST_ID,
        job_id: JOB_ID,
        operation: 'UPSERT',
        status: 'INDEXED',
        source_version: 3,
        point_ids: [],
        deleted_point_ids: [],
        chunk_count: 1,
        embedded: true,
      };
    }),
    deleteIndexedJob: jest.fn(async () => {
      expect(transactionState.active).toBe(false);
      if (aiError) throw aiError;
      return {
        request_id: REQUEST_ID,
        job_id: JOB_ID,
        operation: 'DELETE',
        status: 'DELETED',
        source_version: 3,
        point_ids: [],
        deleted_point_ids: [],
        chunk_count: 0,
        embedded: false,
      };
    }),
  };
  const projection = {
    buildUpsertRequest: jest.fn().mockResolvedValue({
      job: {
        job_id: JOB_ID,
        title: 'Engineer',
        description: '',
        skills: [],
        company_id: COMPANY_ID,
        company_name: 'Canonical Company',
        is_active: true,
        is_deleted: false,
        company_is_active: true,
        company_is_deleted: false,
      },
      source_version: 3,
      idempotency_key: 'key',
    }),
    projectCompanyJobs: jest.fn().mockResolvedValue([]),
    toIndexJobUpsertRequest: jest.fn(),
  };
  const rootRepository = {
    manager: { transaction },
    createQueryBuilder: jest.fn(() => latestQuery),
  };
  const service = new AiIndexDispatcherService(
    rootRepository as never,
    {} as never,
    projection as never,
    aiClient as never,
    configValues(),
  );

  return {
    service,
    outbox,
    managerOutboxRepository,
    transaction,
    aiClient,
    projection,
    inTransaction: () => transactionState.active,
  };
}

describe('AiIndexDispatcherService', () => {
  it('derives stable idempotency and request IDs from the outbox command', () => {
    const firstKey = createIndexIdempotencyKey(OUTBOX_ID, 'UPSERT');
    const secondKey = createIndexIdempotencyKey(OUTBOX_ID, 'UPSERT');
    const firstRequestId = createIndexRequestId(OUTBOX_ID);
    const secondRequestId = createIndexRequestId(OUTBOX_ID);

    expect(firstKey).toBe(secondKey);
    expect(firstRequestId).toBe(secondRequestId);
    expect(firstRequestId).toBe(OUTBOX_ID);
    expect(createIndexIdempotencyKey(OUTBOX_ID, 'DELETE')).not.toBe(firstKey);
    expect(createIndexRequestId(OUTBOX_ID, JOB_ID, 'DELETE')).not.toBe(
      firstRequestId,
    );
    expect(firstRequestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('claims with a short transaction, row lock, skip-locked semantics, lease, and attempt increment', async () => {
    const harness = createHarness();
    const claimed = await harness.service.claimBatch(
      1,
      new Date('2026-08-28T12:00:00.000Z'),
    );
    const claimQuery =
      harness.managerOutboxRepository.createQueryBuilder.mock.results[0].value;

    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatchObject({
      status: AiIndexOutboxStatus.PROCESSING,
      attempts: 1,
      leaseOwner: 'worker-test',
    });
    expect(claimed[0].leaseExpiresAt?.toISOString()).toBe(
      '2026-08-28T12:00:30.000Z',
    );
    expect(claimQuery.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(claimQuery.setOnLocked).toHaveBeenCalledWith('skip_locked');
    expect(harness.transaction).toHaveBeenCalledTimes(1);
  });

  it('does not hold the claim transaction around the AI network call', async () => {
    const harness = createHarness();
    const result = await harness.service.processOne();

    expect(result).toEqual({ outboxId: OUTBOX_ID, status: 'SUCCEEDED' });
    expect(harness.aiClient.indexJob).toHaveBeenCalledTimes(1);
    expect(harness.transaction).toHaveBeenCalledTimes(2);
    expect(harness.outbox.status).toBe(AiIndexOutboxStatus.SUCCEEDED);
    expect(harness.inTransaction()).toBe(false);
  });

  it('replays failed commands without resetting attempts or audit history', async () => {
    const lastAttemptAt = new Date('2026-08-28T11:45:00.000Z');
    const lastErrorAt = new Date('2026-08-28T11:46:00.000Z');
    const harness = createHarness({
      status: AiIndexOutboxStatus.FAILED,
      attempts: 2,
      maxAttempts: 3,
      lastAttemptAt,
      lastErrorCode: 'AI_PROVIDER_TIMEOUT',
      lastErrorMessage: 'timeout retained',
      lastErrorAt,
    });

    const replayed = await harness.service.replay(OUTBOX_ID);

    expect(replayed).toBe(true);
    expect(harness.outbox).toMatchObject({
      status: AiIndexOutboxStatus.PENDING,
      attempts: 2,
      maxAttempts: 3,
      lastAttemptAt,
      lastErrorCode: 'AI_PROVIDER_TIMEOUT',
      lastErrorMessage: 'timeout retained',
      lastErrorAt,
    });
    expect(harness.outbox.nextRetryAt).toBeInstanceOf(Date);
  });

  it('schedules retry for an AiServiceError marked retryable', async () => {
    const harness = createHarness(
      {},
      new AiServiceError(
        AiServiceErrorCode.AI_PROVIDER_TIMEOUT,
        'upstream timeout',
        504,
        true,
      ),
    );
    const result = await harness.service.processOne();

    expect(result).toEqual({ outboxId: OUTBOX_ID, status: 'RETRY_SCHEDULED' });
    expect(harness.outbox.status).toBe(AiIndexOutboxStatus.FAILED);
    expect(harness.outbox.lastErrorCode).toBe(
      AiServiceErrorCode.AI_PROVIDER_TIMEOUT,
    );
    expect(harness.outbox.nextRetryAt.getTime()).toBeGreaterThan(
      Date.now() - 5_000,
    );
  });

  it('moves terminal AiServiceError failures to the dead-letter state', async () => {
    const harness = createHarness(
      {},
      new AiServiceError(
        AiServiceErrorCode.AI_REQUEST_REJECTED,
        'invalid canonical request',
        502,
        false,
      ),
    );
    const result = await harness.service.processOne();

    expect(result).toEqual({ outboxId: OUTBOX_ID, status: 'DEAD_LETTER' });
    expect(harness.outbox.status).toBe(AiIndexOutboxStatus.DEAD_LETTER);
    expect(harness.outbox.lastErrorCode).toBe(
      AiServiceErrorCode.AI_REQUEST_REJECTED,
    );
    expect(harness.outbox.leaseOwner).toBeNull();
  });
});
