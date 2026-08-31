import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Raw, Repository } from 'typeorm';
import { validate as isUuid } from 'uuid';
import { resolveAiIndexEnvironment } from '../../config/ai-index-environment';
import {
  AiIndexAggregateType,
  AiIndexOutbox,
  AiIndexOutboxStatus,
} from '../entities/ai-index-outbox.entity';

const MAX_REPLAY_ATTEMPTS = 100;
const REPLAYABLE_STATUSES = [
  AiIndexOutboxStatus.FAILED,
  AiIndexOutboxStatus.DEAD_LETTER,
] as const;

export interface AiIndexReplayResult {
  requested: number;
  replayed: number;
  skipped: number;
  outboxIds: string[];
}

/**
 * Re-queues failed/dead outbox rows without contacting the AI service.
 *
 * Replay keeps the original outbox UUID, so dispatcher-derived idempotency and
 * request IDs remain stable. It also keeps `attempts` and last-error audit
 * fields. A dead row receives exactly one additional delivery budget by
 * increasing maxAttempts, rather than hiding history by resetting attempts.
 */
@Injectable()
export class AiIndexReplayService {
  constructor(
    @InjectRepository(AiIndexOutbox)
    private readonly outboxRepository: Repository<AiIndexOutbox>,
    private readonly configService: ConfigService = new ConfigService({
      AI_INDEX_ENVIRONMENT: 'local',
      AI_INDEX_OUTBOX_ENVIRONMENT: 'local',
    }),
  ) {}

  async replayOutbox(outboxId: string, environment?: string): Promise<boolean> {
    this.resolveEnvironment(environment);
    if (!isUuid(outboxId)) return false;
    return this.outboxRepository.manager.transaction((manager) =>
      replayAiIndexOutboxAtomically(manager, outboxId, new Date()),
    );
  }

  /** Replays only failed/dead commands belonging to one canonical job. */
  async replayJob(
    jobId: string,
    limit = 100,
    environment?: string,
  ): Promise<AiIndexReplayResult> {
    this.resolveEnvironment(environment);
    if (!isUuid(jobId)) return emptyReplayResult();
    const boundedLimit = boundReplayLimit(limit);
    const rows = await this.outboxRepository.find({
      where: {
        aggregateType: AiIndexAggregateType.JOB,
        aggregateId: jobId,
        status: In([...REPLAYABLE_STATUSES]),
      },
      order: { sourceVersion: 'ASC', _id: 'ASC' },
      take: boundedLimit,
    });
    return this.replayRows(rows, environment);
  }

  /** Replays a bounded deterministic batch of failed/dead commands. */
  async replayAll(
    limit = 100,
    environment?: string,
  ): Promise<AiIndexReplayResult> {
    this.resolveEnvironment(environment);
    const boundedLimit = boundReplayLimit(limit);
    const rows = await this.outboxRepository.find({
      where: { status: In([...REPLAYABLE_STATUSES]) },
      order: { createdAt: 'ASC', _id: 'ASC' },
      take: boundedLimit,
    });
    return this.replayRows(rows, environment);
  }

  private async replayRows(
    rows: AiIndexOutbox[],
    environment?: string,
  ): Promise<AiIndexReplayResult> {
    const result = emptyReplayResult();
    result.requested = rows.length;
    for (const row of rows) {
      if (await this.replayOutbox(row._id, environment)) {
        result.replayed += 1;
        result.outboxIds.push(row._id);
      } else {
        result.skipped += 1;
      }
    }
    return result;
  }

  private resolveEnvironment(value?: string): string {
    return resolveAiIndexEnvironment(this.configService, value);
  }
}

/**
 * Atomically returns one failed/dead command to the dispatcher. The conditional
 * UPDATE is the concurrency boundary: only the caller that changes a currently
 * replayable row receives true; all others receive false without a network
 * call. It preserves consumer attempts and error audit fields while resetting
 * independent publisher state so the replay can produce a fresh SQS notification.
 */
export async function replayAiIndexOutboxAtomically(
  manager: EntityManager,
  outboxId: string,
  now: Date,
): Promise<boolean> {
  const repository = manager.getRepository(AiIndexOutbox);
  const result = await repository.update(
    {
      _id: outboxId,
      status: In([...REPLAYABLE_STATUSES]),
      // A fully exhausted row at the database maximum cannot receive another
      // bounded delivery. PostgreSQL's outbox constraint also guarantees
      // attempts <= max_attempts for all persisted rows.
      attempts: Raw(
        (attempts) =>
          `(${attempts} < "max_attempts" OR ("status" = 'DEAD_LETTER' AND "max_attempts" < :maxReplayAttempts))`,
        { maxReplayAttempts: MAX_REPLAY_ATTEMPTS },
      ),
    },
    {
      status: AiIndexOutboxStatus.PENDING,
      nextRetryAt: now,
      leasedAt: null,
      leaseExpiresAt: null,
      leaseOwner: null,
      processedAt: null,
      // Replay must re-arm initial SQS publication even when a previous
      // notification was sent but the consumer later failed or dead-lettered.
      // Keep publishAttempts as independent publication audit history.
      publishedAt: null,
      publishNextRetryAt: now,
      publishLeasedAt: null,
      publishLeaseExpiresAt: null,
      publishLeaseOwner: null,
      lastPublishErrorCode: null,
      lastPublishErrorMessage: null,
      lastPublishErrorAt: null,
      // Only a dead-letter command that exhausted its current delivery budget
      // gets exactly one additional attempt, capped by max_attempts <= 100.
      // Rows with remaining budget keep their existing delivery ceiling.
      maxAttempts: () =>
        `CASE WHEN "status" = 'DEAD_LETTER' AND "attempts" >= "max_attempts" THEN "attempts" + 1 ELSE "max_attempts" END`,
    },
  );
  return result.affected === 1;
}

/** Shared state transition used by both the operational service and dispatcher. */
export function prepareAiIndexOutboxReplay(
  outbox: AiIndexOutbox,
  now: Date,
): boolean {
  if (!isAiIndexReplayableStatus(outbox.status)) return false;

  const attempts = safeNonNegativeInteger(outbox.attempts);
  const maxAttempts = Math.max(safeNonNegativeInteger(outbox.maxAttempts), 1);
  if (attempts >= maxAttempts) {
    if (maxAttempts >= MAX_REPLAY_ATTEMPTS) return false;
    // Grant one new attempt while retaining the complete cumulative attempt
    // count. The database constraint requires attempts <= max_attempts.
    outbox.maxAttempts = Math.min(MAX_REPLAY_ATTEMPTS, attempts + 1);
  }

  outbox.status = AiIndexOutboxStatus.PENDING;
  outbox.nextRetryAt = now;
  outbox.leasedAt = null;
  outbox.leaseExpiresAt = null;
  outbox.leaseOwner = null;
  outbox.processedAt = null;
  // Re-arm publication independently of the consumer state. publishAttempts
  // remains cumulative audit history, while a replay deliberately discards a
  // prior publication success, lease, and error state.
  outbox.publishedAt = null;
  outbox.publishNextRetryAt = now;
  outbox.publishLeasedAt = null;
  outbox.publishLeaseExpiresAt = null;
  outbox.publishLeaseOwner = null;
  outbox.lastPublishErrorCode = null;
  outbox.lastPublishErrorMessage = null;
  outbox.lastPublishErrorAt = null;
  // lastAttemptAt and lastError* intentionally remain as audit history.
  return true;
}

export function isAiIndexReplayableStatus(
  status: AiIndexOutboxStatus,
): boolean {
  return (
    status === AiIndexOutboxStatus.FAILED ||
    status === AiIndexOutboxStatus.DEAD_LETTER
  );
}

function boundReplayLimit(limit: number): number {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error('AI_INDEX_REPLAY_LIMIT must be a positive safe integer');
  }
  return Math.min(limit, MAX_REPLAY_ATTEMPTS);
}

function safeNonNegativeInteger(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function emptyReplayResult(): AiIndexReplayResult {
  return { requested: 0, replayed: 0, skipped: 0, outboxIds: [] };
}
