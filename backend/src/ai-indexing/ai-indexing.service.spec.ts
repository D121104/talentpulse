import { AiIndexingService } from './ai-indexing.service';
import {
  AiIndexAggregateType,
  AiIndexOutbox,
  AiIndexOutboxOperation,
} from './entities/ai-index-outbox.entity';

const JOB_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_ID = '22222222-2222-4222-8222-222222222222';

interface OutboxHarness {
  service: AiIndexingService;
  transaction: jest.Mock;
  managerQuery: jest.Mock;
  repository: Record<string, jest.Mock>;
}

function createHarness(): OutboxHarness {
  let persisted: AiIndexOutbox | undefined;
  const latestQuery = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    setLock: jest.fn().mockReturnThis(),
    getRawOne: jest.fn(async () =>
      persisted ? { sourceVersion: persisted.sourceVersion } : undefined,
    ),
  };
  const repository: Record<string, jest.Mock> = {
    findOne: jest.fn(
      async ({ where }: { where?: Record<string, unknown> } = {}) => {
        if (!persisted) return undefined;
        if (
          where &&
          Object.entries(where).some(
            ([key, value]) => persisted?.[key as keyof AiIndexOutbox] !== value,
          )
        ) {
          return undefined;
        }
        return persisted;
      },
    ),
    createQueryBuilder: jest.fn(() => latestQuery),
    create: jest.fn((value: Partial<AiIndexOutbox>) => value),
    save: jest.fn(async (value: AiIndexOutbox) => {
      persisted = value;
      return value;
    }),
    find: jest.fn(async () => (persisted ? [persisted] : [])),
  };
  const managerQuery = jest.fn().mockResolvedValue([]);
  const manager = {
    query: managerQuery,
    getRepository: jest.fn(() => repository),
  };
  const transaction = jest.fn(
    async (callback: (transactionManager: unknown) => Promise<unknown>) =>
      callback(manager),
  );
  const service = new AiIndexingService({
    manager: { transaction },
  } as never);

  return { service, transaction, managerQuery, repository };
}

function jobUpsert(sourceVersion: string | number) {
  return {
    aggregateType: AiIndexAggregateType.JOB,
    aggregateId: JOB_ID,
    sourceVersion,
    operation: AiIndexOutboxOperation.UPSERT,
  };
}

describe('AiIndexingService', () => {
  it('is idempotent for the same aggregate, source version, and operation', async () => {
    const harness = createHarness();

    const first = await harness.service.enqueue(jobUpsert('0007'));
    const second = await harness.service.enqueue(jobUpsert(7));

    expect(second).toBe(first);
    expect(harness.repository.save).toHaveBeenCalledTimes(1);
    expect(first.sourceVersion).toBe('7');
  });

  it('rejects an operation that does not belong to its aggregate type', async () => {
    const harness = createHarness();

    await expect(
      harness.service.enqueue({
        aggregateType: AiIndexAggregateType.COMPANY,
        aggregateId: COMPANY_ID,
        sourceVersion: 1,
        operation: AiIndexOutboxOperation.UPSERT,
      }),
    ).rejects.toThrow('AI_INDEX_INVALID_OPERATION');
    expect(harness.transaction).not.toHaveBeenCalled();
  });

  it('rejects a source version regression for an aggregate', async () => {
    const harness = createHarness();
    await harness.service.enqueue(jobUpsert(7));

    await expect(harness.service.enqueue(jobUpsert(6))).rejects.toThrow(
      'AI_INDEX_SOURCE_VERSION_REGRESSION',
    );
    expect(harness.repository.save).toHaveBeenCalledTimes(1);
  });

  it('rejects a different operation at an already-used source version', async () => {
    const harness = createHarness();
    await harness.service.enqueue(jobUpsert(7));

    await expect(
      harness.service.enqueue({
        aggregateType: AiIndexAggregateType.JOB,
        aggregateId: JOB_ID,
        sourceVersion: 7,
        operation: AiIndexOutboxOperation.DELETE,
      }),
    ).rejects.toThrow('AI_INDEX_SOURCE_VERSION_CONFLICT');
    expect(harness.repository.save).toHaveBeenCalledTimes(1);
  });
});

describe('AiIndexingService operational enqueue', () => {
  it('coalesces a repeated same-operation scan without allocating another source version', async () => {
    const harness = createHarness();
    harness.managerQuery
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ source_version: '7' }])
      .mockResolvedValue([]);

    const first = await harness.service.enqueueWithNextSourceVersionIfNeeded({
      aggregateType: AiIndexAggregateType.JOB,
      aggregateId: JOB_ID,
      operation: AiIndexOutboxOperation.UPSERT,
    });
    const second = await harness.service.enqueueWithNextSourceVersionIfNeeded({
      aggregateType: AiIndexAggregateType.JOB,
      aggregateId: JOB_ID,
      operation: AiIndexOutboxOperation.UPSERT,
    });

    expect(first.enqueued).toBe(true);
    expect(second).toMatchObject({ enqueued: false, outbox: first.outbox });
    expect(first.outbox.sourceVersion).toBe('7');
    expect(harness.repository.save).toHaveBeenCalledTimes(1);
    expect(harness.managerQuery).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`ai-index:${AiIndexAggregateType.JOB}:${JOB_ID}`],
    );
  });
});
