import { ConfigService } from '@nestjs/config';
import {
  AiServiceError,
  AiServiceErrorCode,
} from '../ai-client/ai-client.errors';
import {
  AiIndexDispatcherService,
  createIndexOperationAttemptId,
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
const POINT_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const SECOND_JOB_ID = '11111111-1111-4111-8111-111111111112';
const THIRD_JOB_ID = '11111111-1111-4111-8111-111111111114';

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
  state: AiJobIndexState;
  stateRepository: Record<string, jest.Mock>;
  inTransaction: () => boolean;
}

function matchesClaimUpdate(where: unknown, outbox: AiIndexOutbox): boolean {
  if (!where || typeof where !== 'object') return false;
  const criteria = where as Record<string, unknown>;
  const leaseExpiresAt = criteria.leaseExpiresAt as
    | { type?: unknown; value?: unknown }
    | undefined;
  return (
    criteria._id === outbox._id &&
    criteria.status === outbox.status &&
    criteria.leaseOwner === outbox.leaseOwner &&
    leaseExpiresAt?.type === 'moreThan' &&
    leaseExpiresAt.value instanceof Date &&
    outbox.leaseExpiresAt instanceof Date &&
    outbox.leaseExpiresAt > leaseExpiresAt.value
  );
}

function createHarness(
  outboxOverrides: Partial<AiIndexOutbox> = {},
  aiError?: unknown,
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
    update: jest.fn(async (where: unknown, changes: Partial<AiIndexOutbox>) => {
      if (matchesClaimUpdate(where, outbox)) {
        Object.assign(outbox, changes);
        return { affected: 1 };
      }
      const criteria = where as Record<string, unknown>;
      const statuses = criteria.status as { value?: unknown } | undefined;
      const replayable = Array.isArray(statuses?.value)
        ? statuses.value.includes(outbox.status)
        : false;
      const replayableUnderConditionalUpdate =
        outbox.attempts < outbox.maxAttempts ||
        (outbox.status === AiIndexOutboxStatus.DEAD_LETTER &&
          outbox.maxAttempts < 100);
      if (
        criteria._id !== outbox._id ||
        !replayable ||
        !replayableUnderConditionalUpdate
      ) {
        return { affected: 0 };
      }
      const maxAttempts =
        outbox.status === AiIndexOutboxStatus.DEAD_LETTER &&
        outbox.attempts >= outbox.maxAttempts
          ? outbox.attempts + 1
          : outbox.maxAttempts;
      Object.assign(outbox, changes, { maxAttempts });
      return { affected: 1 };
    }),
  };
  const stateRepository: Record<string, jest.Mock> = {
    findOne: jest.fn(async () => state),
    create: jest.fn((value: AiJobIndexState) => value),
    save: jest.fn(async (value: AiJobIndexState) => value),
  };
  const managerQuery = jest.fn().mockResolvedValue([]);
  const manager = {
    query: managerQuery,
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
    indexJob: jest.fn(
      async (request: { job: { job_id: string }; source_version: number }) => {
        expect(transactionState.active).toBe(false);
        if (aiError) throw aiError;
        return {
          request_id: REQUEST_ID,
          job_id: request.job.job_id,
          operation: 'UPSERT',
          status: 'INDEXED',
          source_version: request.source_version,
          point_ids: [POINT_ID],
          deleted_point_ids: [],
          content_hash: 'a'.repeat(64),
          metadata_hash: 'b'.repeat(64),
          chunk_count: 1,
          embedded: true,
          embedding_provider: 'fake',
          embedding_model_version: 'fake-v1',
          embedding_dimensions: 4,
          normalization_version: 'normalization-v1',
          chunking_version: 'chunking-v1',
          index_schema_version: 'schema-v1',
          collection_name: 'jobs_test',
          collection_version: 'collection-v1',
        };
      },
    ),
    deleteIndexedJob: jest.fn(
      async (request: { job_id: string; source_version: number }) => {
        expect(transactionState.active).toBe(false);
        if (aiError) throw aiError;
        return {
          request_id: REQUEST_ID,
          job_id: request.job_id,
          operation: 'DELETE',
          status: 'DELETED',
          source_version: request.source_version,
          point_ids: [],
          deleted_point_ids: [],
          chunk_count: 0,
          embedded: false,
        };
      },
    ),
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
    projectCompanyJobs: jest
      .fn()
      .mockResolvedValue({ jobs: [], nextCursor: null, hasMore: false }),
    toIndexJobUpsertRequest: jest.fn(
      (snapshot: unknown, sourceVersion: number, idempotencyKey: string) => ({
        job: snapshot,
        source_version: sourceVersion,
        idempotency_key: idempotencyKey,
      }),
    ),
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
    state,
    stateRepository,
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
    });
    expect(claimed[0].leaseOwner).toEqual(expect.any(String));
    expect(claimed[0].leaseOwner).not.toBe('worker-test');
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

  it('passes complete audit context for a job upsert', async () => {
    const harness = createHarness({ attempts: 2 });

    await harness.service.processOne();

    expect(harness.aiClient.indexJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        requestId: createIndexRequestId(OUTBOX_ID, JOB_ID, 'UPSERT'),
        operationAttemptId: createIndexOperationAttemptId(
          OUTBOX_ID,
          JOB_ID,
          'UPSERT',
        ),
        outboxId: OUTBOX_ID,
        jobId: JOB_ID,
        attemptNumber: harness.outbox.attempts,
      }),
    );
    expect(harness.aiClient.indexJob.mock.calls[0][1]).not.toHaveProperty(
      'traceId',
    );
  });

  it('passes complete audit context for a job delete', async () => {
    const harness = createHarness({
      attempts: 2,
      operation: AiIndexOutboxOperation.DELETE,
    });

    await harness.service.processOne();

    expect(harness.aiClient.deleteIndexedJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        requestId: createIndexRequestId(OUTBOX_ID, JOB_ID, 'DELETE'),
        operationAttemptId: createIndexOperationAttemptId(
          OUTBOX_ID,
          JOB_ID,
          'DELETE',
        ),
        outboxId: OUTBOX_ID,
        jobId: JOB_ID,
        attemptNumber: harness.outbox.attempts,
      }),
    );
    expect(
      harness.aiClient.deleteIndexedJob.mock.calls[0][1],
    ).not.toHaveProperty('traceId');
  });

  it('processes every company page before finalizing the parent command', async () => {
    const harness = createHarness({
      aggregateType: AiIndexAggregateType.COMPANY,
      aggregateId: COMPANY_ID,
      operation: AiIndexOutboxOperation.REINDEX_COMPANY,
    });
    const firstJob = {
      job: { _id: JOB_ID },
      snapshot: { job_id: JOB_ID },
      isCanonicalActive: true,
    };
    const secondJob = {
      job: { _id: SECOND_JOB_ID },
      snapshot: null,
      isCanonicalActive: false,
    };
    const firstCursor = '11111111-1111-4111-8111-111111111113';
    harness.projection.projectCompanyJobs
      .mockResolvedValueOnce({
        jobs: [firstJob],
        nextCursor: firstCursor,
        hasMore: true,
      })
      .mockResolvedValueOnce({
        jobs: [secondJob],
        nextCursor: null,
        hasMore: false,
      });
    harness.aiClient.indexJob.mockImplementation(
      async (request: { job: { job_id: string }; source_version: number }) => ({
        request_id: REQUEST_ID,
        job_id: request.job.job_id,
        operation: 'UPSERT',
        status: 'INDEXED',
        source_version: request.source_version,
        point_ids: [POINT_ID],
        deleted_point_ids: [],
        chunk_count: 1,
        embedded: true,
      }),
    );

    const result = await harness.service.processOne();

    expect(result).toEqual({ outboxId: OUTBOX_ID, status: 'SUCCEEDED' });
    expect(harness.projection.projectCompanyJobs).toHaveBeenNthCalledWith(
      1,
      COMPANY_ID,
      null,
      500,
      expect.any(Date),
    );
    expect(harness.projection.projectCompanyJobs).toHaveBeenNthCalledWith(
      2,
      COMPANY_ID,
      firstCursor,
      500,
      expect.any(Date),
    );
    expect(harness.aiClient.indexJob).toHaveBeenCalledTimes(1);
    expect(harness.aiClient.deleteIndexedJob).toHaveBeenCalledTimes(1);
    expect(harness.aiClient.indexJob.mock.calls[0][1]).toMatchObject({
      requestId: createIndexRequestId(OUTBOX_ID, JOB_ID, 'UPSERT'),
      operationAttemptId: createIndexOperationAttemptId(
        OUTBOX_ID,
        JOB_ID,
        'UPSERT',
      ),
      outboxId: OUTBOX_ID,
      jobId: JOB_ID,
      attemptNumber: harness.outbox.attempts,
    });
    expect(harness.aiClient.deleteIndexedJob.mock.calls[0][1]).toMatchObject({
      requestId: createIndexRequestId(OUTBOX_ID, SECOND_JOB_ID, 'DELETE'),
      operationAttemptId: createIndexOperationAttemptId(
        OUTBOX_ID,
        SECOND_JOB_ID,
        'DELETE',
      ),
      outboxId: OUTBOX_ID,
      jobId: SECOND_JOB_ID,
      attemptNumber: harness.outbox.attempts,
    });
    expect(harness.outbox.status).toBe(AiIndexOutboxStatus.SUCCEEDED);
    expect(harness.stateRepository.save).toHaveBeenCalledTimes(2);
  });

  it('renews the claim before each company-page network phase', async () => {
    const harness = createHarness({
      aggregateType: AiIndexAggregateType.COMPANY,
      aggregateId: COMPANY_ID,
      operation: AiIndexOutboxOperation.REINDEX_COMPANY,
    });
    const firstCursor = '11111111-1111-4111-8111-111111111113';
    harness.projection.projectCompanyJobs
      .mockResolvedValueOnce({
        jobs: [
          {
            job: { _id: JOB_ID },
            snapshot: { job_id: JOB_ID },
            isCanonicalActive: true,
          },
        ],
        nextCursor: firstCursor,
        hasMore: true,
      })
      .mockResolvedValueOnce({
        jobs: [
          {
            job: { _id: THIRD_JOB_ID },
            snapshot: null,
            isCanonicalActive: false,
          },
        ],
        nextCursor: null,
        hasMore: false,
      });
    const update = harness.managerOutboxRepository.update;

    await harness.service.processOne();

    // One claim renewal before each page, one before each job, one page-state
    // fence per page, and the final claim fence.
    expect(update).toHaveBeenCalledTimes(7);
  });

  it('does not persist a company page after its lease is lost during finalization', async () => {
    const harness = createHarness({
      aggregateType: AiIndexAggregateType.COMPANY,
      aggregateId: COMPANY_ID,
      operation: AiIndexOutboxOperation.REINDEX_COMPANY,
    });
    harness.projection.projectCompanyJobs.mockResolvedValueOnce({
      jobs: [
        {
          job: { _id: JOB_ID },
          snapshot: { job_id: JOB_ID },
          isCanonicalActive: true,
        },
      ],
      nextCursor: null,
      hasMore: false,
    });

    const update = harness.managerOutboxRepository.update;
    const defaultUpdate = update.getMockImplementation()!;
    update
      .mockImplementationOnce(defaultUpdate)
      .mockImplementationOnce(defaultUpdate)
      .mockResolvedValueOnce({ affected: 0 });

    const result = await harness.service.processOne();

    expect(result).toEqual({ outboxId: OUTBOX_ID, status: 'LEASE_LOST' });
    expect(harness.aiClient.indexJob).toHaveBeenCalledTimes(1);
    expect(harness.stateRepository.save).not.toHaveBeenCalled();
    expect(harness.outbox.status).toBe(AiIndexOutboxStatus.PROCESSING);
  });

  it('does not finalize a company command when its claim is lost between pages', async () => {
    const harness = createHarness({
      aggregateType: AiIndexAggregateType.COMPANY,
      aggregateId: COMPANY_ID,
      operation: AiIndexOutboxOperation.REINDEX_COMPANY,
    });
    harness.projection.projectCompanyJobs.mockResolvedValueOnce({
      jobs: [
        {
          job: { _id: JOB_ID },
          snapshot: { job_id: JOB_ID },
          isCanonicalActive: true,
        },
      ],
      nextCursor: '11111111-1111-4111-8111-111111111113',
      hasMore: true,
    });
    const update = harness.managerOutboxRepository.update;
    const defaultUpdate = update.getMockImplementation()!;
    update
      .mockImplementationOnce(defaultUpdate)
      .mockImplementationOnce(defaultUpdate)
      .mockImplementationOnce(defaultUpdate)
      .mockResolvedValueOnce({ affected: 0 });

    const result = await harness.service.processOne();

    expect(result).toEqual({ outboxId: OUTBOX_ID, status: 'LEASE_LOST' });
    expect(harness.projection.projectCompanyJobs).toHaveBeenCalledTimes(1);
    expect(harness.aiClient.indexJob).toHaveBeenCalledTimes(1);
    expect(harness.stateRepository.save).toHaveBeenCalledTimes(1);
    expect(harness.outbox.status).toBe(AiIndexOutboxStatus.PROCESSING);
  });

  it('does not finalize after a claim was reclaimed by another worker', async () => {
    const harness = createHarness();
    const now = new Date('2026-08-28T12:00:00.000Z');
    const claimed = await harness.service.claimBatch(1, now);
    const claim = { ...claimed[0] };
    harness.outbox.leaseOwner = 'reclaimed-claim-token';
    harness.outbox.leaseExpiresAt = new Date('2026-08-28T12:01:00.000Z');

    const result = await (
      harness.service as unknown as {
        markSuccess: (
          value: typeof claim,
          outcomes: never[],
        ) => Promise<boolean>;
      }
    ).markSuccess(claim, []);

    expect(result).toBe(false);
    expect(harness.outbox.status).toBe(AiIndexOutboxStatus.PROCESSING);
    expect(harness.managerOutboxRepository.update).toHaveBeenCalled();
  });

  it('persists successful provider metadata and point IDs in index state', async () => {
    const harness = createHarness();

    const result = await harness.service.processOne();

    expect(result).toEqual({ outboxId: OUTBOX_ID, status: 'SUCCEEDED' });
    expect(harness.stateRepository.save).toHaveBeenCalledTimes(1);
    expect(harness.state).toMatchObject({
      sourceVersion: '3',
      status: AiJobIndexStateStatus.INDEXED,
      contentHash: 'a'.repeat(64),
      metadataHash: 'b'.repeat(64),
      embeddingProvider: 'fake',
      embeddingModelVersion: 'fake-v1',
      embeddingDimensions: 4,
      normalizationVersion: 'normalization-v1',
      chunkingVersion: 'chunking-v1',
      indexSchemaVersion: 'schema-v1',
      collectionName: 'jobs_test',
      collectionVersion: 'collection-v1',
      indexedPointIds: [POINT_ID],
      attempts: 1,
    });
  });

  it('does not overwrite newer index state from an older outbox command', async () => {
    const harness = createHarness();
    harness.state.sourceVersion = '4';
    const originalStatus = harness.state.status;

    const result = await harness.service.processOne();

    expect(result).toEqual({ outboxId: OUTBOX_ID, status: 'SUCCEEDED' });
    expect(harness.stateRepository.save).not.toHaveBeenCalled();
    expect(harness.state.sourceVersion).toBe('4');
    expect(harness.state.status).toBe(originalStatus);
  });

  it.each(['DELETED', 'ALREADY_DELETED'] as const)(
    'finalizes a replayed job delete as DELETED after an %s provider response',
    async (providerStatus) => {
      const harness = createHarness({
        attempts: 2,
        operation: AiIndexOutboxOperation.DELETE,
      });
      harness.aiClient.deleteIndexedJob.mockResolvedValueOnce({
        request_id: REQUEST_ID,
        job_id: JOB_ID,
        operation: 'DELETE',
        status: providerStatus,
        source_version: 3,
        point_ids: [],
        deleted_point_ids: [],
        chunk_count: 0,
        embedded: false,
      });

      const result = await harness.service.processOne();

      expect(result).toEqual({ outboxId: OUTBOX_ID, status: 'SUCCEEDED' });
      expect(harness.outbox).toMatchObject({
        status: AiIndexOutboxStatus.SUCCEEDED,
        attempts: 3,
      });
      expect(harness.state).toMatchObject({
        jobId: JOB_ID,
        status: AiJobIndexStateStatus.DELETED,
        attempts: 3,
        indexedPointIds: [],
      });
      expect(harness.aiClient.deleteIndexedJob).toHaveBeenCalledWith(
        expect.objectContaining({
          job_id: JOB_ID,
          idempotency_key: createIndexIdempotencyKey(OUTBOX_ID, 'DELETE'),
        }),
        expect.objectContaining({
          requestId: createIndexRequestId(OUTBOX_ID, JOB_ID, 'DELETE'),
          operationAttemptId: createIndexOperationAttemptId(
            OUTBOX_ID,
            JOB_ID,
            'DELETE',
          ),
          outboxId: OUTBOX_ID,
          jobId: JOB_ID,
          attemptNumber: 3,
        }),
      );
    },
  );

  it('retries the outbox without a provider call when audit creation fails closed', async () => {
    const harness = createHarness(
      { operation: AiIndexOutboxOperation.DELETE },
      new AiServiceError(
        AiServiceErrorCode.AI_PROVIDER_AUDIT_PERSISTENCE_FAILED,
        'AI provider-attempt audit persistence is unavailable',
        503,
        true,
      ),
    );

    const result = await harness.service.processOne();

    expect(result).toEqual({ outboxId: OUTBOX_ID, status: 'RETRY_SCHEDULED' });
    expect(harness.outbox).toMatchObject({
      status: AiIndexOutboxStatus.FAILED,
      attempts: 1,
      lastErrorCode: AiServiceErrorCode.AI_PROVIDER_AUDIT_PERSISTENCE_FAILED,
    });
    expect(harness.state).toMatchObject({
      status: AiJobIndexStateStatus.FAILED,
      attempts: 1,
      lastErrorCode: AiServiceErrorCode.AI_PROVIDER_AUDIT_PERSISTENCE_FAILED,
    });
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

  it('schedules retry for an unknown dispatch error and persists failure state', async () => {
    const harness = createHarness({}, new Error('temporary network failure'));

    const result = await harness.service.processOne();

    expect(result).toEqual({ outboxId: OUTBOX_ID, status: 'RETRY_SCHEDULED' });
    expect(harness.outbox.status).toBe(AiIndexOutboxStatus.FAILED);
    expect(harness.outbox.lastErrorCode).toBe('AI_INDEX_DISPATCH_ERROR');
    expect(harness.outbox.lastErrorMessage).toBe('temporary network failure');
    expect(harness.stateRepository.save).toHaveBeenCalledTimes(1);
    expect(harness.state).toMatchObject({
      sourceVersion: '3',
      status: AiJobIndexStateStatus.FAILED,
      attempts: 1,
      lastErrorCode: 'AI_INDEX_DISPATCH_ERROR',
      lastErrorMessage: 'temporary network failure',
    });
    expect(harness.state.nextRetryAt).toBeInstanceOf(Date);
  });

  it('does not overwrite newer index state while recording an older failure', async () => {
    const harness = createHarness({}, new Error('temporary network failure'));
    harness.state.sourceVersion = '4';
    const originalStatus = harness.state.status;

    const result = await harness.service.processOne();

    expect(result).toEqual({ outboxId: OUTBOX_ID, status: 'RETRY_SCHEDULED' });
    expect(harness.stateRepository.save).not.toHaveBeenCalled();
    expect(harness.state.sourceVersion).toBe('4');
    expect(harness.state.status).toBe(originalStatus);
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
