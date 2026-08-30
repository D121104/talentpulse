import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveAiIndexEnvironment } from '../../config/ai-index-environment';
import { AiIndexingService } from '../ai-indexing.service';
import {
  AiIndexAggregateType,
  AiIndexOutboxOperation,
} from '../entities/ai-index-outbox.entity';
import {
  CanonicalJobProjectionService,
  CanonicalJobScanPage,
} from './canonical-job-projection.service';
import {
  CanonicalJobDisposition,
  classifyCanonicalJob,
} from './canonical-job-lifecycle';

export const MAX_AI_INDEX_OPERATION_BATCH_SIZE = 100;

export interface AiIndexBackfillOptions {
  environment?: string;
  cursor?: string | null;
  limit?: number;
  now?: Date;
}

export interface AiIndexBackfillCounters {
  scanned: number;
  active: number;
  inactive: number;
  upsertEnqueued: number;
  deleteEnqueued: number;
  upsertSkipped: number;
  deleteSkipped: number;
  deleted: number;
  expired: number;
  missingCompany: number;
  inactiveCompany: number;
  inactiveJob: number;
  notStarted: number;
  invalidDates: number;
  otherInactive: number;
}

export interface AiIndexBackfillResult extends AiIndexBackfillCounters {
  cursor: string | null;
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Operational canonical-corpus backfill.
 *
 * This service only scans PostgreSQL and writes transactional outbox commands;
 * it never calls FastAPI or Qdrant. Re-running a drained backfill is safe at
 * the derived-index layer because commands use stable job IDs and the AI
 * service uses deterministic point IDs. Open commands are coalesced to avoid
 * producing duplicate work while a previous run is still being delivered.
 */
@Injectable()
export class AiIndexBackfillService {
  constructor(
    private readonly projectionService: CanonicalJobProjectionService,
    private readonly aiIndexingService: AiIndexingService,
    private readonly configService: ConfigService,
  ) {}

  /** Processes one bounded cursor page and returns the cursor for the caller. */
  async backfill(
    options: AiIndexBackfillOptions = {},
  ): Promise<AiIndexBackfillResult> {
    const now = options.now ?? new Date();
    this.resolveEnvironment(options.environment);
    const page = await this.projectionService.scanJobs(
      options.cursor ?? null,
      boundedBatchSize(options.limit),
      now,
    );
    return this.backfillPage(page, now);
  }

  /** Explicit page boundary useful for CLI orchestration and unit tests. */
  async backfillPage(
    page: CanonicalJobScanPage,
    now = new Date(),
  ): Promise<AiIndexBackfillResult> {
    this.resolveEnvironment();
    const counters = emptyBackfillCounters();

    for (const projection of page.jobs) {
      counters.scanned += 1;
      const disposition = classifyCanonicalJob(projection, now);
      this.recordDisposition(counters, disposition);

      const operation =
        disposition === 'ACTIVE'
          ? AiIndexOutboxOperation.UPSERT
          : AiIndexOutboxOperation.DELETE;
      const result =
        await this.aiIndexingService.enqueueWithNextSourceVersionIfNeeded({
          aggregateType: AiIndexAggregateType.JOB,
          aggregateId: projection.job._id,
          operation,
        });

      if (operation === AiIndexOutboxOperation.UPSERT) {
        if (result.enqueued) counters.upsertEnqueued += 1;
        else counters.upsertSkipped += 1;
      } else if (result.enqueued) {
        counters.deleteEnqueued += 1;
      } else {
        counters.deleteSkipped += 1;
      }
    }

    return {
      ...counters,
      cursor: page.nextCursor,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }

  /** Runs all bounded pages until the canonical cursor is exhausted. */
  async backfillAll(
    options: AiIndexBackfillOptions = {},
  ): Promise<AiIndexBackfillResult> {
    const now = options.now ?? new Date();
    this.resolveEnvironment(options.environment);
    const counters = emptyBackfillCounters();
    let cursor = options.cursor ?? null;
    let hasMore = true;

    while (hasMore) {
      const page = await this.projectionService.scanJobs(
        cursor,
        boundedBatchSize(options.limit),
        now,
      );
      const result = await this.backfillPage(page, now);
      addBackfillCounters(counters, result);
      cursor = page.nextCursor;
      hasMore = page.hasMore;
      if (hasMore && !cursor) {
        throw new Error(
          'AI_INDEX_BACKFILL_CURSOR_INVALID: page did not advance',
        );
      }
    }

    return {
      ...counters,
      cursor,
      nextCursor: cursor,
      hasMore: false,
    };
  }

  private resolveEnvironment(value?: string): string {
    return resolveAiIndexEnvironment(this.configService, value);
  }

  private recordDisposition(
    counters: AiIndexBackfillCounters,
    disposition: CanonicalJobDisposition,
  ): void {
    if (disposition === 'ACTIVE') {
      counters.active += 1;
      return;
    }
    counters.inactive += 1;
    switch (disposition) {
      case 'DELETED_JOB':
      case 'DELETED_COMPANY':
        counters.deleted += 1;
        break;
      case 'EXPIRED':
        counters.expired += 1;
        break;
      case 'MISSING_COMPANY':
        counters.missingCompany += 1;
        break;
      case 'INACTIVE_COMPANY':
        counters.inactiveCompany += 1;
        break;
      case 'INACTIVE_JOB':
        counters.inactiveJob += 1;
        break;
      case 'NOT_STARTED':
        counters.notStarted += 1;
        break;
      case 'MISSING_START_DATE':
      case 'MISSING_END_DATE':
      case 'INVALID_DATE_RANGE':
        counters.invalidDates += 1;
        break;
      default:
        counters.otherInactive += 1;
    }
  }
}

export function boundedBatchSize(value: number | undefined): number {
  if (value === undefined) return MAX_AI_INDEX_OPERATION_BATCH_SIZE;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error('AI_INDEX_BATCH_SIZE must be a positive safe integer');
  }
  return Math.min(value, MAX_AI_INDEX_OPERATION_BATCH_SIZE);
}

function emptyBackfillCounters(): AiIndexBackfillCounters {
  return {
    scanned: 0,
    active: 0,
    inactive: 0,
    upsertEnqueued: 0,
    deleteEnqueued: 0,
    upsertSkipped: 0,
    deleteSkipped: 0,
    deleted: 0,
    expired: 0,
    missingCompany: 0,
    inactiveCompany: 0,
    inactiveJob: 0,
    notStarted: 0,
    invalidDates: 0,
    otherInactive: 0,
  };
}

function addBackfillCounters(
  target: AiIndexBackfillCounters,
  source: AiIndexBackfillCounters,
): void {
  for (const key of Object.keys(target) as Array<
    keyof AiIndexBackfillCounters
  >) {
    target[key] += source[key];
  }
}
