import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { validate as isUuid } from 'uuid';
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
  ) {}

  async replayOutbox(outboxId: string): Promise<boolean> {
    if (!isUuid(outboxId)) return false;
    return this.outboxRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(AiIndexOutbox);
      const outbox = await repository.findOne({ where: { _id: outboxId } });
      if (!outbox || !prepareAiIndexOutboxReplay(outbox, new Date())) return false;
      await repository.save(outbox);
      return true;
    });
  }

  /** Replays only failed/dead commands belonging to one canonical job. */
  async replayJob(jobId: string, limit = 100): Promise<AiIndexReplayResult> {
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
    return this.replayRows(rows);
  }

  /** Replays a bounded deterministic batch of failed/dead commands. */
  async replayAll(limit = 100): Promise<AiIndexReplayResult> {
    const boundedLimit = boundReplayLimit(limit);
    const rows = await this.outboxRepository.find({
      where: { status: In([...REPLAYABLE_STATUSES]) },
      order: { createdAt: 'ASC', _id: 'ASC' },
      take: boundedLimit,
    });
    return this.replayRows(rows);
  }

  private async replayRows(rows: AiIndexOutbox[]): Promise<AiIndexReplayResult> {
    const result = emptyReplayResult();
    result.requested = rows.length;
    for (const row of rows) {
      if (await this.replayOutbox(row._id)) {
        result.replayed += 1;
        result.outboxIds.push(row._id);
      } else {
        result.skipped += 1;
      }
    }
    return result;
  }
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
