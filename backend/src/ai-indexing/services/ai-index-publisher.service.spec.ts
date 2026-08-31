import { ConfigService } from '@nestjs/config';
import {
  AiIndexSqsDefinitePublishError,
  AiIndexSqsPublisherPort,
} from '../ai-index-sqs.publisher';
import {
  AiIndexAggregateType,
  AiIndexOutbox,
  AiIndexOutboxOperation,
  AiIndexOutboxStatus,
} from '../entities';
import { AiIndexPublisherService } from './ai-index-publisher.service';
import { prepareAiIndexOutboxReplay } from './ai-index-replay.service';

const OUTBOX_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const JOB_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function createOutbox(overrides: Partial<AiIndexOutbox> = {}): AiIndexOutbox {
  return {
    _id: OUTBOX_ID,
    aggregateType: AiIndexAggregateType.JOB,
    aggregateId: JOB_ID,
    sourceVersion: '1',
    operation: AiIndexOutboxOperation.UPSERT,
    status: AiIndexOutboxStatus.PENDING,
    attempts: 3,
    maxAttempts: 10,
    nextRetryAt: new Date('2026-08-31T10:00:00.000Z'),
    lastAttemptAt: new Date('2026-08-31T09:00:00.000Z'),
    leasedAt: new Date('2026-08-31T09:00:00.000Z'),
    leaseExpiresAt: new Date('2026-08-31T09:01:00.000Z'),
    leaseOwner: 'consumer-owner',
    lastErrorCode: 'AI_FAILURE',
    lastErrorMessage: 'consumer audit history',
    lastErrorAt: new Date('2026-08-31T09:01:00.000Z'),
    processedAt: null,
    publishedAt: null,
    publishAttempts: 0,
    publishNextRetryAt: new Date('2026-08-31T10:00:00.000Z'),
    publishLeasedAt: null,
    publishLeaseExpiresAt: null,
    publishLeaseOwner: null,
    lastPublishErrorCode: null,
    lastPublishErrorMessage: null,
    lastPublishErrorAt: null,
    createdAt: new Date('2026-08-31T08:00:00.000Z'),
    updatedAt: new Date('2026-08-31T08:00:00.000Z'),
    ...overrides,
  } as AiIndexOutbox;
}

function createHarness(row: AiIndexOutbox, publisher: AiIndexSqsPublisherPort) {
  const query = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    setLock: jest.fn().mockReturnThis(),
    setOnLocked: jest.fn().mockReturnThis(),
    getMany: jest.fn(async () => {
      const now = new Date();
      const publisherEligible =
        row.status === AiIndexOutboxStatus.PENDING &&
        row.publishedAt === null &&
        row.nextRetryAt <= now &&
        row.publishNextRetryAt <= now &&
        (row.publishLeaseExpiresAt === null ||
          row.publishLeaseExpiresAt <= now);
      return publisherEligible ? [row] : [];
    }),
  };
  const transactionalRepository = {
    createQueryBuilder: jest.fn(() => query),
    save: jest.fn(async (value: AiIndexOutbox) => value),
  };
  const update = jest.fn(async (criteria, changes) => {
    const expected = criteria as { publishLeaseOwner?: string };
    if (row.publishLeaseOwner !== expected.publishLeaseOwner)
      return { affected: 0 };
    Object.assign(row, changes);
    return { affected: 1 };
  });
  const manager = {
    getRepository: jest.fn(() => transactionalRepository),
    transaction: jest.fn((work) => work(manager)),
  };
  const repository = { manager, update };
  const config = new ConfigService({
    AI_INDEX_ENVIRONMENT: 'local',
    AI_INDEX_OUTBOX_ENVIRONMENT: 'local',
    AI_INDEX_PUBLISH_LEASE_MS: '30000',
  });
  return {
    service: new AiIndexPublisherService(
      repository as never,
      config,
      publisher,
    ),
    row,
    query,
    transactionalRepository,
    update,
  };
}

describe('AiIndexPublisherService', () => {
  it('claims, sends exactly one ID-only message, and finalizes publication without consumer mutations', async () => {
    const publish = jest.fn().mockResolvedValue(undefined);
    const row = createOutbox();
    const harness = createHarness(row, { publish });
    const consumerFields = {
      status: row.status,
      attempts: row.attempts,
      nextRetryAt: row.nextRetryAt,
      leasedAt: row.leasedAt,
      leaseExpiresAt: row.leaseExpiresAt,
      leaseOwner: row.leaseOwner,
      lastErrorCode: row.lastErrorCode,
      lastErrorMessage: row.lastErrorMessage,
      lastErrorAt: row.lastErrorAt,
      processedAt: row.processedAt,
    };

    await expect(
      harness.service.publish({ batchSize: 1 }),
    ).resolves.toMatchObject({
      claimed: 1,
      published: 1,
      failed: 0,
    });

    expect(publish).toHaveBeenCalledWith(OUTBOX_ID);
    expect(harness.query.andWhere).toHaveBeenCalledWith(
      'outbox.nextRetryAt <= :now',
      expect.anything(),
    );
    expect(harness.query.andWhere).toHaveBeenCalledWith(
      'outbox.publishNextRetryAt <= :now',
      expect.anything(),
    );
    expect(harness.query.setOnLocked).toHaveBeenCalledWith('skip_locked');
    expect(row.publishedAt).toBeInstanceOf(Date);
    expect(row.publishAttempts).toBe(1);
    expect(row.publishLeaseOwner).toBeNull();
    expect(consumerFields).toEqual({
      status: row.status,
      attempts: row.attempts,
      nextRetryAt: row.nextRetryAt,
      leasedAt: row.leasedAt,
      leaseExpiresAt: row.leaseExpiresAt,
      leaseOwner: row.leaseOwner,
      lastErrorCode: row.lastErrorCode,
      lastErrorMessage: row.lastErrorMessage,
      lastErrorAt: row.lastErrorAt,
      processedAt: row.processedAt,
    });
  });

  it('claims and publishes a replayed row after publication state is re-armed', async () => {
    const now = new Date();
    const row = createOutbox({
      status: AiIndexOutboxStatus.FAILED,
      publishedAt: new Date(now.getTime() - 3_600_000),
      publishAttempts: 4,
      publishNextRetryAt: new Date(now.getTime() + 600_000),
      publishLeasedAt: new Date(now.getTime() - 3_600_000),
      publishLeaseExpiresAt: new Date(now.getTime() + 300_000),
      publishLeaseOwner: 'previous-publisher',
      lastPublishErrorCode: 'SQS_TIMEOUT',
      lastPublishErrorMessage: 'timeout',
      lastPublishErrorAt: new Date(now.getTime() - 3_540_000),
    });
    expect(prepareAiIndexOutboxReplay(row, now)).toBe(true);

    const publish = jest.fn().mockResolvedValue(undefined);
    const harness = createHarness(row, { publish });

    await expect(
      harness.service.publish({ batchSize: 1 }),
    ).resolves.toMatchObject({
      claimed: 1,
      published: 1,
      failed: 0,
    });

    expect(publish).toHaveBeenCalledWith(OUTBOX_ID);
    expect(row.publishedAt).toBeInstanceOf(Date);
    expect(row.publishAttempts).toBe(5);
    expect(row.publishLeaseOwner).toBeNull();
  });

  it('clears publication lease and schedules bounded publication retry after a definite send failure', async () => {
    const row = createOutbox();
    const harness = createHarness(row, {
      publish: jest
        .fn()
        .mockRejectedValue(
          new AiIndexSqsDefinitePublishError(
            'SQS.AccessDenied',
            'denied\nsecret',
          ),
        ),
    });

    await expect(harness.service.publish()).resolves.toMatchObject({
      failed: 1,
      published: 0,
    });

    expect(row.publishedAt).toBeNull();
    expect(row.publishLeaseOwner).toBeNull();
    expect(row.publishLeaseExpiresAt).toBeNull();
    expect(row.lastPublishErrorCode).toBe('SQS.AccessDenied');
    expect(row.lastPublishErrorMessage).toBe('denied secret');
    expect(row.publishNextRetryAt.getTime()).toBeGreaterThan(
      Date.now() - 1_000,
    );
    expect(row.attempts).toBe(3);
    expect(row.status).toBe(AiIndexOutboxStatus.PENDING);
  });

  it('does not finalize after lease fencing rejects a late publisher', async () => {
    const row = createOutbox();
    const harness = createHarness(row, {
      publish: jest.fn().mockResolvedValue(undefined),
    });
    harness.update.mockResolvedValue({ affected: 0 });

    await expect(harness.service.publish()).resolves.toMatchObject({
      leaseLost: 1,
      published: 0,
    });
    expect(row.publishedAt).toBeNull();
  });

  it('holds its publication lease after an ambiguous send outcome for safe duplicate publication', async () => {
    const row = createOutbox();
    const harness = createHarness(row, {
      publish: jest.fn().mockRejectedValue(new Error('socket reset')),
    });

    await expect(harness.service.publish()).resolves.toMatchObject({
      ambiguous: 1,
      failed: 0,
    });
    expect(row.publishedAt).toBeNull();
    expect(row.publishLeaseOwner).toEqual(expect.any(String));
  });
});
