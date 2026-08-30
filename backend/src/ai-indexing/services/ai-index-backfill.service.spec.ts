import { ConfigService } from '@nestjs/config';
import {
  AiIndexAggregateType,
  AiIndexOutboxOperation,
} from '../entities/ai-index-outbox.entity';
import { AiIndexBackfillService } from './ai-index-backfill.service';

const ACTIVE_JOB_ID = '11111111-1111-4111-8111-111111111111';
const INACTIVE_JOB_ID = '11111111-1111-4111-8111-111111111112';
const DELETED_JOB_ID = '11111111-1111-4111-8111-111111111113';
const START_CURSOR = '11111111-1111-4111-8111-111111111110';
const NEXT_CURSOR = '11111111-1111-4111-8111-111111111114';
const COMPANY_ID = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-08-30T05:00:00.000Z');

function config(
  environment = 'local',
  outboxEnvironment: string | undefined = environment,
): ConfigService {
  return {
    get: jest.fn((key: string, fallback?: unknown) => {
      if (key === 'AI_INDEX_ENVIRONMENT') return environment;
      if (key === 'AI_INDEX_OUTBOX_ENVIRONMENT') return outboxEnvironment;
      return fallback;
    }),
  } as never;
}

function projection(jobId: string, overrides: Record<string, unknown> = {}) {
  return {
    job: {
      _id: jobId,
      isActive: true,
      isDeleted: false,
      deletedAt: null,
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-09-30T00:00:00.000Z'),
      company: { _id: COMPANY_ID },
      ...overrides,
    },
    company: {
      _id: COMPANY_ID,
      isActive: true,
      isDeleted: false,
      deletedAt: null,
    },
    snapshot: null,
    isCanonicalActive: jobId === ACTIVE_JOB_ID,
  };
}

describe('AiIndexBackfillService dry run', () => {
  it('plans active UPSERTs and inactive/deleted DELETEs without enqueueing', async () => {
    const scanJobs = jest.fn().mockResolvedValue({
      jobs: [
        projection(ACTIVE_JOB_ID),
        projection(INACTIVE_JOB_ID, { isActive: false }),
        projection(DELETED_JOB_ID, { isDeleted: true }),
      ],
      nextCursor: NEXT_CURSOR,
      hasMore: true,
    });
    const enqueueWithNextSourceVersionIfNeeded = jest.fn();
    const service = new AiIndexBackfillService(
      { scanJobs } as never,
      { enqueueWithNextSourceVersionIfNeeded } as never,
      config(),
    );

    await expect(
      service.backfill({
        environment: 'local',
        dryRun: true,
        limit: 10,
        now: NOW,
      }),
    ).resolves.toMatchObject({
      dryRun: true,
      scanned: 3,
      active: 1,
      inactive: 2,
      deleted: 1,
      inactiveJob: 1,
      upsertPlanned: 1,
      deletePlanned: 2,
      upsertEnqueued: 0,
      deleteEnqueued: 0,
      upsertSkipped: 0,
      deleteSkipped: 0,
      cursor: NEXT_CURSOR,
      nextCursor: NEXT_CURSOR,
      hasMore: true,
    });
    expect(scanJobs).toHaveBeenCalledWith(null, 10, NOW);
    expect(enqueueWithNextSourceVersionIfNeeded).not.toHaveBeenCalled();
  });

  it('continues a supplied cursor through all dry-run pages', async () => {
    const scanJobs = jest
      .fn()
      .mockResolvedValueOnce({
        jobs: [projection(ACTIVE_JOB_ID)],
        nextCursor: NEXT_CURSOR,
        hasMore: true,
      })
      .mockResolvedValueOnce({
        jobs: [projection(DELETED_JOB_ID, { isDeleted: true })],
        nextCursor: null,
        hasMore: false,
      });
    const enqueueWithNextSourceVersionIfNeeded = jest.fn();
    const service = new AiIndexBackfillService(
      { scanJobs } as never,
      { enqueueWithNextSourceVersionIfNeeded } as never,
      config(),
    );

    await expect(
      service.backfillAll({
        environment: 'local',
        cursor: START_CURSOR,
        dryRun: true,
        limit: 1,
        now: NOW,
      }),
    ).resolves.toMatchObject({
      dryRun: true,
      scanned: 2,
      upsertPlanned: 1,
      deletePlanned: 1,
      cursor: null,
      nextCursor: null,
      hasMore: false,
    });
    expect(scanJobs).toHaveBeenNthCalledWith(1, START_CURSOR, 1, NOW);
    expect(scanJobs).toHaveBeenNthCalledWith(2, NEXT_CURSOR, 1, NOW);
    expect(enqueueWithNextSourceVersionIfNeeded).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'rejects a non-advancing cursor during %s backfill',
    async (dryRun) => {
      const scanJobs = jest
        .fn()
        .mockResolvedValueOnce({
          jobs: [projection(ACTIVE_JOB_ID)],
          nextCursor: START_CURSOR,
          hasMore: true,
        })
        .mockImplementation(() => {
          throw new Error('scan invoked after non-advancing cursor');
        });
      const enqueueWithNextSourceVersionIfNeeded = jest
        .fn()
        .mockResolvedValue({ enqueued: true });
      const service = new AiIndexBackfillService(
        { scanJobs } as never,
        { enqueueWithNextSourceVersionIfNeeded } as never,
        config(),
      );

      await expect(
        service.backfillAll({
          environment: 'local',
          cursor: START_CURSOR,
          dryRun,
          now: NOW,
        }),
      ).rejects.toThrow(
        'AI_INDEX_BACKFILL_CURSOR_INVALID: page did not advance',
      );
      expect(scanJobs).toHaveBeenCalledTimes(1);
    },
  );

  it('preserves normal backfill enqueue operations without dry-run counters', async () => {
    const scanJobs = jest.fn().mockResolvedValue({
      jobs: [
        projection(ACTIVE_JOB_ID),
        projection(INACTIVE_JOB_ID, { isActive: false }),
        projection(DELETED_JOB_ID, { isDeleted: true }),
      ],
      nextCursor: null,
      hasMore: false,
    });
    const enqueueWithNextSourceVersionIfNeeded = jest
      .fn()
      .mockResolvedValue({ enqueued: true });
    const service = new AiIndexBackfillService(
      { scanJobs } as never,
      { enqueueWithNextSourceVersionIfNeeded } as never,
      config(),
    );

    const result = await service.backfill({
      environment: 'local',
      limit: 10,
      now: NOW,
    });

    expect(enqueueWithNextSourceVersionIfNeeded).toHaveBeenNthCalledWith(1, {
      aggregateType: AiIndexAggregateType.JOB,
      aggregateId: ACTIVE_JOB_ID,
      operation: AiIndexOutboxOperation.UPSERT,
    });
    expect(enqueueWithNextSourceVersionIfNeeded).toHaveBeenNthCalledWith(2, {
      aggregateType: AiIndexAggregateType.JOB,
      aggregateId: INACTIVE_JOB_ID,
      operation: AiIndexOutboxOperation.DELETE,
    });
    expect(enqueueWithNextSourceVersionIfNeeded).toHaveBeenNthCalledWith(3, {
      aggregateType: AiIndexAggregateType.JOB,
      aggregateId: DELETED_JOB_ID,
      operation: AiIndexOutboxOperation.DELETE,
    });
    expect(result).toMatchObject({
      scanned: 3,
      active: 1,
      inactive: 2,
      upsertEnqueued: 1,
      deleteEnqueued: 2,
    });
    expect(result).not.toHaveProperty('dryRun');
    expect(result).not.toHaveProperty('upsertPlanned');
    expect(result).not.toHaveProperty('deletePlanned');
  });

  it('enforces the operational environment guard before dry-run scanning', async () => {
    const scanJobs = jest.fn();
    const service = new AiIndexBackfillService(
      { scanJobs } as never,
      {} as never,
      config('staging', ''),
    );

    await expect(
      service.backfill({ environment: 'staging', dryRun: true }),
    ).rejects.toThrow('AI_INDEX_OUTBOX_ENVIRONMENT must be explicitly set');
    expect(scanJobs).not.toHaveBeenCalled();
  });
});

describe('AiIndexBackfillService operation budget', () => {
  it('reduces each scan page to the remaining operation budget and returns a resumable cursor', async () => {
    const scanJobs = jest
      .fn()
      .mockResolvedValueOnce({
        jobs: [
          projection(ACTIVE_JOB_ID),
          projection(INACTIVE_JOB_ID, { isActive: false }),
        ],
        nextCursor: NEXT_CURSOR,
        hasMore: true,
      })
      .mockResolvedValueOnce({
        jobs: [projection(DELETED_JOB_ID, { isDeleted: true })],
        nextCursor: DELETED_JOB_ID,
        hasMore: true,
      });
    const enqueueWithNextSourceVersionIfNeeded = jest
      .fn()
      .mockResolvedValue({ enqueued: true });
    const service = new AiIndexBackfillService(
      { scanJobs } as never,
      { enqueueWithNextSourceVersionIfNeeded } as never,
      config(),
    );

    await expect(
      service.backfillAll({
        environment: 'local',
        limit: 2,
        maxOperations: 3,
        now: NOW,
      }),
    ).resolves.toMatchObject({
      scanned: 3,
      upsertEnqueued: 1,
      deleteEnqueued: 2,
      cursor: DELETED_JOB_ID,
      nextCursor: DELETED_JOB_ID,
      hasMore: true,
      operationBudgetExhausted: true,
    });
    expect(scanJobs).toHaveBeenNthCalledWith(1, null, 2, NOW);
    expect(scanJobs).toHaveBeenNthCalledWith(2, NEXT_CURSOR, 1, NOW);
    expect(scanJobs).toHaveBeenCalledTimes(2);
    expect(enqueueWithNextSourceVersionIfNeeded).toHaveBeenCalledTimes(3);
  });

  it('does not enqueue while dry-running a budgeted backfill', async () => {
    const scanJobs = jest.fn().mockResolvedValue({
      jobs: [
        projection(ACTIVE_JOB_ID),
        projection(DELETED_JOB_ID, { isDeleted: true }),
      ],
      nextCursor: NEXT_CURSOR,
      hasMore: true,
    });
    const enqueueWithNextSourceVersionIfNeeded = jest.fn();
    const service = new AiIndexBackfillService(
      { scanJobs } as never,
      { enqueueWithNextSourceVersionIfNeeded } as never,
      config(),
    );

    await expect(
      service.backfillAll({
        environment: 'local',
        limit: 10,
        maxOperations: 2,
        dryRun: true,
        now: NOW,
      }),
    ).resolves.toMatchObject({
      dryRun: true,
      scanned: 2,
      upsertPlanned: 1,
      deletePlanned: 1,
      hasMore: true,
      operationBudgetExhausted: true,
    });
    expect(scanJobs).toHaveBeenCalledWith(null, 2, NOW);
    expect(enqueueWithNextSourceVersionIfNeeded).not.toHaveBeenCalled();
  });

  it('does not report budget exhaustion when the final page exactly drains the corpus', async () => {
    const scanJobs = jest
      .fn()
      .mockResolvedValueOnce({
        jobs: [
          projection(ACTIVE_JOB_ID),
          projection(INACTIVE_JOB_ID, { isActive: false }),
        ],
        nextCursor: NEXT_CURSOR,
        hasMore: true,
      })
      .mockResolvedValueOnce({
        jobs: [projection(DELETED_JOB_ID, { isDeleted: true })],
        nextCursor: null,
        hasMore: false,
      });
    const service = new AiIndexBackfillService(
      { scanJobs } as never,
      {
        enqueueWithNextSourceVersionIfNeeded: jest
          .fn()
          .mockResolvedValue({ enqueued: true }),
      } as never,
      config(),
    );

    const result = await service.backfillAll({
      environment: 'local',
      limit: 2,
      maxOperations: 3,
      now: NOW,
    });

    expect(result).toMatchObject({
      scanned: 3,
      cursor: null,
      nextCursor: null,
      hasMore: false,
    });
    expect(result).not.toHaveProperty('operationBudgetExhausted');
    expect(scanJobs).toHaveBeenNthCalledWith(1, null, 2, NOW);
    expect(scanJobs).toHaveBeenNthCalledWith(2, NEXT_CURSOR, 1, NOW);
  });

  it.each([0, 1.5, Number.MAX_SAFE_INTEGER + 1, 100001])(
    'rejects invalid maxOperations value %p before scanning',
    async (maxOperations) => {
      const scanJobs = jest.fn();
      const service = new AiIndexBackfillService(
        { scanJobs } as never,
        {} as never,
        config(),
      );

      await expect(
        service.backfillAll({ environment: 'local', maxOperations }),
      ).rejects.toThrow(
        'AI_INDEX_MAX_OPERATIONS must be an integer between 1 and 100000',
      );
      expect(scanJobs).not.toHaveBeenCalled();
    },
  );
});
