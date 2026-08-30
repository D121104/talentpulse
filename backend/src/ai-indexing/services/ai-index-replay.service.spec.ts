import { ConfigService } from '@nestjs/config';
import { FindOperator } from 'typeorm';
import {
  AiIndexAggregateType,
  AiIndexOutbox,
  AiIndexOutboxOperation,
  AiIndexOutboxStatus,
} from '../entities/ai-index-outbox.entity';
import {
  AiIndexReplayService,
  prepareAiIndexOutboxReplay,
} from './ai-index-replay.service';

const OUTBOX_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const JOB_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SECOND_OUTBOX_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function createOutbox(overrides: Partial<AiIndexOutbox> = {}): AiIndexOutbox {
  return {
    _id: OUTBOX_ID,
    aggregateType: AiIndexAggregateType.JOB,
    aggregateId: JOB_ID,
    sourceVersion: '3',
    operation: AiIndexOutboxOperation.UPSERT,
    status: AiIndexOutboxStatus.FAILED,
    attempts: 2,
    maxAttempts: 3,
    nextRetryAt: new Date('2026-08-29T12:00:00.000Z'),
    lastAttemptAt: new Date('2026-08-29T11:55:00.000Z'),
    leasedAt: new Date('2026-08-29T11:55:00.000Z'),
    leaseExpiresAt: new Date('2026-08-29T11:56:00.000Z'),
    leaseOwner: 'worker-1',
    lastErrorCode: 'AI_PROVIDER_TIMEOUT',
    lastErrorMessage: 'timeout retained',
    lastErrorAt: new Date('2026-08-29T11:56:00.000Z'),
    processedAt: null,
    createdAt: new Date('2026-08-29T11:00:00.000Z'),
    updatedAt: new Date('2026-08-29T11:00:00.000Z'),
    ...overrides,
  } as AiIndexOutbox;
}

function statusValues(value: unknown): unknown[] {
  if (!(value instanceof FindOperator)) return [];
  return Array.isArray(value.value) ? value.value : [];
}

function isReplayableUnderConditionalUpdate(row: AiIndexOutbox): boolean {
  if (row.attempts < row.maxAttempts) return true;
  return (
    row.status === AiIndexOutboxStatus.DEAD_LETTER && row.maxAttempts < 100
  );
}

function createHarness(
  rows: AiIndexOutbox[],
  config = new ConfigService({
    AI_INDEX_ENVIRONMENT: 'local',
    AI_INDEX_OUTBOX_ENVIRONMENT: 'local',
  }),
) {
  const update = jest.fn(
    async (where: unknown, changes: Partial<AiIndexOutbox>) => {
      const criteria = where as Record<string, unknown>;
      const row = rows.find(
        (candidate) =>
          candidate._id === criteria._id &&
          statusValues(criteria.status).includes(candidate.status) &&
          isReplayableUnderConditionalUpdate(candidate),
      );
      if (!row) return { affected: 0 };

      const maxAttempts =
        row.status === AiIndexOutboxStatus.DEAD_LETTER &&
        row.attempts >= row.maxAttempts
          ? row.attempts + 1
          : row.maxAttempts;
      Object.assign(row, changes, { maxAttempts });
      return { affected: 1 };
    },
  );
  const repository = {
    update,
    find: jest.fn(async (options: { take?: number } = {}) =>
      rows.slice(0, options.take ?? rows.length),
    ),
  };
  const manager = {
    getRepository: jest.fn(() => repository),
    transaction: jest.fn(
      async (callback: (transactionManager: unknown) => Promise<unknown>) =>
        callback(manager),
    ),
  };
  return {
    service: new AiIndexReplayService(
      {
        manager,
        find: repository.find,
      } as never,
      config,
    ),
    manager,
    repository,
    rows,
  };
}

describe('AiIndexReplayService', () => {
  it('rejects an unbound non-local outbox before updating rows', async () => {
    const row = createOutbox();
    const harness = createHarness(
      [row],
      new ConfigService({ AI_INDEX_ENVIRONMENT: 'staging' }),
    );

    await expect(
      harness.service.replayOutbox(OUTBOX_ID, 'staging'),
    ).rejects.toThrow('AI_INDEX_OUTBOX_ENVIRONMENT must be explicitly set');
    expect(harness.repository.update).not.toHaveBeenCalled();
  });

  it('replays failed rows while preserving outbox ID, attempts, and error history', async () => {
    const row = createOutbox();
    const harness = createHarness([row]);

    await expect(harness.service.replayOutbox(OUTBOX_ID)).resolves.toBe(true);

    expect(row).toMatchObject({
      _id: OUTBOX_ID,
      status: AiIndexOutboxStatus.PENDING,
      attempts: 2,
      maxAttempts: 3,
      lastErrorCode: 'AI_PROVIDER_TIMEOUT',
      lastErrorMessage: 'timeout retained',
    });
    expect(row.leasedAt).toBeNull();
    expect(row.leaseExpiresAt).toBeNull();
    expect(row.leaseOwner).toBeNull();
    expect(row.nextRetryAt).toBeInstanceOf(Date);
  });

  it('replays dead-letter rows with exactly one additional bounded attempt', async () => {
    const row = createOutbox({
      status: AiIndexOutboxStatus.DEAD_LETTER,
      attempts: 3,
      maxAttempts: 3,
    });
    const harness = createHarness([row]);

    await expect(harness.service.replayOutbox(OUTBOX_ID)).resolves.toBe(true);

    expect(row).toMatchObject({
      status: AiIndexOutboxStatus.PENDING,
      attempts: 3,
      maxAttempts: 4,
    });
    expect(row.attempts).toBeLessThanOrEqual(row.maxAttempts);
  });

  it('replays non-exhausted dead-letter rows without extending their budget', async () => {
    const row = createOutbox({
      status: AiIndexOutboxStatus.DEAD_LETTER,
      attempts: 2,
      maxAttempts: 3,
    });
    const harness = createHarness([row]);

    await expect(harness.service.replayOutbox(OUTBOX_ID)).resolves.toBe(true);

    expect(row).toMatchObject({
      status: AiIndexOutboxStatus.PENDING,
      attempts: 2,
      maxAttempts: 3,
    });
  });

  it('does not extend a failed row after its current delivery budget is exhausted', async () => {
    const row = createOutbox({ attempts: 3, maxAttempts: 3 });
    const harness = createHarness([row]);

    await expect(harness.service.replayOutbox(OUTBOX_ID)).resolves.toBe(false);

    expect(row).toMatchObject({
      status: AiIndexOutboxStatus.FAILED,
      attempts: 3,
      maxAttempts: 3,
    });
  });

  it('skips fully exhausted dead-letter rows at the database maximum', async () => {
    const row = createOutbox({
      status: AiIndexOutboxStatus.DEAD_LETTER,
      attempts: 100,
      maxAttempts: 100,
    });
    const harness = createHarness([row]);

    await expect(harness.service.replayOutbox(OUTBOX_ID)).resolves.toBe(false);

    expect(row.status).toBe(AiIndexOutboxStatus.DEAD_LETTER);
    expect(row.maxAttempts).toBe(100);
  });

  it.each([
    AiIndexOutboxStatus.SUCCEEDED,
    AiIndexOutboxStatus.PROCESSING,
    AiIndexOutboxStatus.PENDING,
  ])('skips %s without changing it', async (status) => {
    const row = createOutbox({
      status,
      leasedAt: null,
      leaseExpiresAt: null,
      leaseOwner: null,
    });
    const harness = createHarness([row]);

    await expect(harness.service.replayOutbox(OUTBOX_ID)).resolves.toBe(false);

    expect(row.status).toBe(status);
    expect(harness.repository.update).toHaveBeenCalledTimes(1);
  });

  it('returns false when a concurrent conditional update has already won', async () => {
    const row = createOutbox();
    const harness = createHarness([row]);
    harness.repository.update
      .mockResolvedValueOnce({ affected: 1 })
      .mockResolvedValueOnce({ affected: 0 });

    await expect(
      Promise.all([
        harness.service.replayOutbox(OUTBOX_ID),
        harness.service.replayOutbox(OUTBOX_ID),
      ]),
    ).resolves.toEqual([true, false]);
  });

  it('replays deterministic bounded candidates and counts concurrent skips', async () => {
    const first = createOutbox({ _id: OUTBOX_ID });
    const second = createOutbox({ _id: SECOND_OUTBOX_ID, sourceVersion: '4' });
    const harness = createHarness([first, second]);
    harness.repository.update
      .mockResolvedValueOnce({ affected: 1 })
      .mockResolvedValueOnce({ affected: 0 });

    await expect(harness.service.replayJob(JOB_ID, 2)).resolves.toEqual({
      requested: 2,
      replayed: 1,
      skipped: 1,
      outboxIds: [OUTBOX_ID],
    });
    expect(harness.repository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        order: { sourceVersion: 'ASC', _id: 'ASC' },
        take: 2,
      }),
    );
  });

  it('uses created-at and ID ordering for a bounded global replay batch', async () => {
    const first = createOutbox({ _id: OUTBOX_ID });
    const second = createOutbox({ _id: SECOND_OUTBOX_ID });
    const harness = createHarness([first, second]);

    await harness.service.replayAll(1);

    expect(harness.repository.find).toHaveBeenCalledWith({
      where: expect.anything(),
      order: { createdAt: 'ASC', _id: 'ASC' },
      take: 1,
    });
  });

  it('keeps the in-memory transition compatible with the database attempt invariant', () => {
    const row = createOutbox({
      status: AiIndexOutboxStatus.DEAD_LETTER,
      attempts: 3,
      maxAttempts: 3,
    });

    expect(prepareAiIndexOutboxReplay(row, new Date())).toBe(true);
    expect(row.attempts).toBeLessThanOrEqual(row.maxAttempts);
    expect(row.maxAttempts).toBe(4);
  });
});
