import { Injectable } from '@nestjs/common';
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
import {
  AiIndexBackfillCounters,
  AiIndexBackfillOptions,
  AiIndexBackfillResult,
  boundedBatchSize,
} from './ai-index-backfill.service';

/**
 * A worker-owned bounded lifecycle sweep. It intentionally uses the same
 * canonical cursor and outbox path as backfill, so expiration/deactivation
 * cleanup is durable while the external AI service remains outside any DB
 * transaction.
 */
@Injectable()
export class AiIndexLifecycleSweepService {
  constructor(
    private readonly projectionService: CanonicalJobProjectionService,
    private readonly aiIndexingService: AiIndexingService,
  ) {}

  async sweepPage(
    options: AiIndexBackfillOptions = {},
  ): Promise<AiIndexBackfillResult> {
    const now = options.now ?? new Date();
    const page = await this.projectionService.scanJobs(
      options.cursor ?? null,
      boundedBatchSize(options.limit),
      now,
    );
    return this.sweepCanonicalPage(page, now);
  }

  async sweepAll(
    options: AiIndexBackfillOptions = {},
  ): Promise<AiIndexBackfillResult> {
    const now = options.now ?? new Date();
    const counters = emptySweepCounters();
    let cursor = options.cursor ?? null;
    let hasMore = true;

    while (hasMore) {
      const pageCursor = cursor;
      const page = await this.projectionService.scanJobs(
        pageCursor,
        boundedBatchSize(options.limit),
        now,
      );
      const result = await this.sweepCanonicalPage(page, now);
      addSweepCounters(counters, result);
      cursor = page.nextCursor;
      hasMore = page.hasMore;
      if (hasMore && (!cursor || cursor === pageCursor)) {
        throw new Error(
          'AI_INDEX_LIFECYCLE_CURSOR_INVALID: page did not advance',
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

  private async sweepCanonicalPage(
    page: CanonicalJobScanPage,
    now: Date,
  ): Promise<AiIndexBackfillResult> {
    const counters = emptySweepCounters();

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

function emptySweepCounters(): AiIndexBackfillCounters {
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

function addSweepCounters(
  target: AiIndexBackfillCounters,
  source: AiIndexBackfillResult,
): void {
  for (const key of Object.keys(target) as Array<
    keyof AiIndexBackfillCounters
  >) {
    target[key] += source[key];
  }
}
