import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { validate as isUuid, v5 as uuidv5 } from 'uuid';
import { EntityManager, MoreThan, Repository } from 'typeorm';
import { AiServiceClient } from '../../ai-client/ai-client.service';
import {
  AiServiceError,
  AiServiceErrorCode,
} from '../../ai-client/ai-client.errors';
import { IndexJobResponse } from '../../ai-client/contracts/indexing.contracts';
import { isIndexingWorkerEnabled } from '../../config/runtime-flags';
import {
  CanonicalJobProjectionService,
  CanonicalProjectionError,
} from './canonical-job-projection.service';
import { replayAiIndexOutboxAtomically } from './ai-index-replay.service';
import { AiIndexLifecycleSweepService } from './ai-index-lifecycle-sweep.service';
import {
  AiIndexAggregateType,
  AiIndexOutbox,
  AiIndexOutboxOperation,
  AiIndexOutboxStatus,
  AiJobIndexState,
  AiJobIndexStateStatus,
} from '../entities';

const STABLE_REQUEST_NAMESPACE = uuidv5(
  'https://talentpulse.ai/indexing/dispatcher',
  uuidv5.URL,
);
const STABLE_OPERATION_ATTEMPT_NAMESPACE = uuidv5(
  'https://talentpulse.ai/indexing/dispatcher-operation-attempt',
  uuidv5.URL,
);

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_LEASE_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_COMPANY_JOB_LIMIT = 500;
const DEFAULT_RETRY_BASE_MS = 1_000;
const DEFAULT_RETRY_MAX_MS = 60_000;
const DEFAULT_RETRY_JITTER_RATIO = 0.2;
const MAX_BATCH_SIZE = 100;
const MAX_COMPANY_JOB_LIMIT = 1_000;
// Continuation is intentionally process-local until the schema has a durable
// cursor. Bound one delivery attempt so a malformed or unexpectedly huge
// company cannot hold a worker forever; a retry safely starts at page one.
const MAX_COMPANY_REINDEX_JOBS_PER_ATTEMPT = 100_000;
const MAX_COMPANY_REINDEX_PAGES_PER_ATTEMPT = 1_000;
const MAX_ERROR_MESSAGE_LENGTH = 1_000;

export interface AiIndexDispatcherOptions {
  batchSize: number;
  leaseMs: number;
  pollIntervalMs: number;
  companyJobLimit: number;
  retryBaseMs: number;
  retryMaxMs: number;
  retryJitterRatio: number;
}

export interface ClaimedAiIndexOutbox extends AiIndexOutbox {
  /** The worker owner that acquired this lease. */
  leaseOwner: string;
}

export type AiIndexDispatchResultStatus =
  | 'SUCCEEDED'
  | 'RETRY_SCHEDULED'
  | 'DEAD_LETTER'
  | 'LEASE_LOST';

export interface AiIndexDispatchResult {
  outboxId: string;
  status: AiIndexDispatchResultStatus;
}

interface JobDispatchOutcome {
  jobId: string;
  response: IndexJobResponse;
  operation: 'UPSERT' | 'DELETE';
}

interface DispatchErrorDetails {
  retryable: boolean;
  code: string;
  message: string;
}

/**
 * Transactional-outbox dispatcher for the derived job index.
 *
 * Claim/finalize operations are short PostgreSQL transactions. Projection
 * hydration and all AiServiceClient calls happen after claim commits, so an AI
 * timeout never holds a database transaction or row lock open.
 */
@Injectable()
export class AiIndexDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiIndexDispatcherService.name);
  private readonly options: AiIndexDispatcherOptions;
  private readonly owner: string;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private pollInFlight = false;
  private lifecycleCursor: string | null = null;
  private lifecycleNow: Date | null = null;

  constructor(
    @InjectRepository(AiIndexOutbox)
    private readonly outboxRepository: Repository<AiIndexOutbox>,
    @InjectRepository(AiJobIndexState)
    private readonly stateRepository: Repository<AiJobIndexState>,
    private readonly projectionService: CanonicalJobProjectionService,
    private readonly aiServiceClient: AiServiceClient,
    private readonly configService: ConfigService,
    @Optional()
    private readonly lifecycleSweep?: AiIndexLifecycleSweepService,
  ) {
    this.options = readDispatcherOptions(configService);
    this.owner = boundedWorkerOwner(
      configService.get<string>('AI_INDEX_WORKER_ID', '') || '',
    );
  }

  /**
   * Starts only when the dedicated flag is explicitly enabled. The existing
   * RUN_BACKGROUND_JOBS default therefore does not unexpectedly turn this
   * worker on in an API process.
   */
  onModuleInit(): void {
    if (this.configService.get<boolean>('AI_INDEX_OPERATIONAL_MODE', false)) {
      return;
    }
    if (
      !isIndexingWorkerEnabled({
        RUN_BACKGROUND_JOBS: this.configService.get(
          'RUN_BACKGROUND_JOBS',
          process.env.RUN_BACKGROUND_JOBS,
        ),
        RUN_INDEXING_WORKER: this.configService.get(
          'RUN_INDEXING_WORKER',
          process.env.RUN_INDEXING_WORKER,
        ),
      })
    ) {
      return;
    }

    assertSingleOutboxEnvironment(this.configService);
    if (this.pollTimer) return;
    void this.runPoll().catch((error) => this.logWorkerError(error));
    this.pollTimer = setInterval(() => {
      void this.runPoll().catch((error) => this.logWorkerError(error));
    }, this.options.pollIntervalMs);
    // Do not keep a test/API process alive solely because the optional worker
    // was enabled.
    this.pollTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (!this.pollTimer) return;
    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  /** Claims up to a bounded number of outbox rows with PostgreSQL row locks. */
  async claimBatch(
    limit = this.options.batchSize,
    now = new Date(),
    outboxId?: string,
  ): Promise<ClaimedAiIndexOutbox[]> {
    const boundedLimit = Math.min(
      Math.max(Math.trunc(limit), 1),
      MAX_BATCH_SIZE,
    );
    return this.runTransaction(async (manager) => {
      const repository = manager.getRepository(AiIndexOutbox);
      const candidates = repository
        .createQueryBuilder('outbox')
        .where(
          `(
            (
              outbox.status IN (:...claimableStatuses)
              AND outbox.nextRetryAt <= :claimNow
            )
            OR (
              outbox.status = :processingStatus
              AND outbox.leaseExpiresAt <= :claimNow
            )
          )
          AND outbox.attempts <= outbox.maxAttempts`,
        )
        .setParameters({
          claimableStatuses: [
            AiIndexOutboxStatus.PENDING,
            AiIndexOutboxStatus.FAILED,
          ],
          processingStatus: AiIndexOutboxStatus.PROCESSING,
          claimNow: now,
        });

      if (outboxId) {
        candidates.andWhere('outbox._id = :outboxId', { outboxId });
      }

      const rows = await candidates
        .orderBy('outbox.createdAt', 'ASC')
        .addOrderBy('outbox._id', 'ASC')
        .take(boundedLimit)
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getMany();

      const claimed: ClaimedAiIndexOutbox[] = [];
      for (const outbox of rows) {
        const attempts = integerOrZero(outbox.attempts);
        const maxAttempts = Math.max(integerOrZero(outbox.maxAttempts), 1);
        if (attempts >= maxAttempts) {
          outbox.status = AiIndexOutboxStatus.DEAD_LETTER;
          outbox.lastErrorCode = 'AI_INDEX_MAX_ATTEMPTS';
          outbox.lastErrorMessage = 'Maximum indexing attempts reached';
          outbox.lastErrorAt = now;
          outbox.leaseOwner = null;
          outbox.leasedAt = null;
          outbox.leaseExpiresAt = null;
          await repository.save(outbox);
          continue;
        }

        outbox.status = AiIndexOutboxStatus.PROCESSING;
        outbox.attempts = attempts + 1;
        outbox.lastAttemptAt = now;
        outbox.leasedAt = now;
        outbox.leaseExpiresAt = new Date(now.getTime() + this.options.leaseMs);
        outbox.leaseOwner = createClaimLeaseOwner(this.owner);
        await repository.save(outbox);
        claimed.push(outbox as ClaimedAiIndexOutbox);
      }
      return claimed;
    });
  }

  /** Claims and processes the exact outbox command signaled by SQS. */
  async processOutbox(outboxId: string): Promise<AiIndexDispatchResult | null> {
    if (!isUuid(outboxId)) return null;

    const claimed = await this.claimBatch(
      1,
      new Date(),
      outboxId.toLowerCase(),
    );
    if (claimed.length > 0) return this.processClaimed(claimed[0]);

    // SQS is at-least-once. A truly durable success from a previous
    // delivery may be acknowledged without dispatching the provider again.
    const outbox = await this.outboxRepository.findOne({
      where: { _id: outboxId.toLowerCase() },
    });
    if (outbox?.status === AiIndexOutboxStatus.SUCCEEDED) {
      return { outboxId: outbox._id, status: 'SUCCEEDED' };
    }
    if (outbox?.status === AiIndexOutboxStatus.DEAD_LETTER) {
      return { outboxId: outbox._id, status: 'DEAD_LETTER' };
    }
    return null;
  }

  /** Claims and processes one command, if one is available. */
  async processOne(): Promise<AiIndexDispatchResult | null> {
    const claimed = await this.claimBatch(1);
    if (claimed.length === 0) return null;
    return this.processClaimed(claimed[0]);
  }

  /** Claims and processes a bounded batch without holding a DB transaction. */
  async processBatch(
    limit = this.options.batchSize,
  ): Promise<AiIndexDispatchResult[]> {
    const claimed = await this.claimBatch(limit);
    const results: AiIndexDispatchResult[] = [];
    for (const outbox of claimed) {
      results.push(await this.processClaimed(outbox));
    }
    return results;
  }

  /** Re-queues only failed/dead commands and preserves delivery history. */
  async replay(outboxId: string): Promise<boolean> {
    if (!isUuid(outboxId)) return false;
    return this.runTransaction((manager) =>
      replayAiIndexOutboxAtomically(manager, outboxId, new Date()),
    );
  }

  /** Alias used by future operator tooling. */
  replayOutbox(outboxId: string): Promise<boolean> {
    return this.replay(outboxId);
  }

  /** Stable key used for one outbox command and its effective operation. */
  static idempotencyKey(
    outboxId: string,
    operation: 'UPSERT' | 'DELETE',
    jobId?: string,
  ): string {
    return createIndexIdempotencyKey(outboxId, operation, jobId);
  }

  /** Stable UUID used as X-Request-ID across retries of one logical call. */
  static requestId(
    outboxId: string,
    jobId?: string,
    operation?: string,
  ): string {
    return createIndexRequestId(outboxId, jobId, operation);
  }

  private async runPoll(): Promise<void> {
    if (this.pollInFlight) return;
    this.pollInFlight = true;
    try {
      const results = await this.processBatch();
      if (results.length > 0) {
        this.logger.debug(
          `Processed ${results.length} AI indexing outbox command(s)`,
        );
      }
      await this.runLifecycleSweep();
    } finally {
      this.pollInFlight = false;
    }
  }

  private async runLifecycleSweep(): Promise<void> {
    if (!this.lifecycleSweep) return;
    const now = this.lifecycleNow ?? new Date();
    try {
      const result = await this.lifecycleSweep.sweepPage({
        cursor: this.lifecycleCursor,
        limit: this.options.batchSize,
        now,
      });
      this.lifecycleCursor = result.nextCursor;
      if (!result.hasMore) {
        this.lifecycleCursor = null;
        this.lifecycleNow = null;
      } else {
        this.lifecycleNow = now;
      }
    } catch (error) {
      this.lifecycleCursor = null;
      this.lifecycleNow = null;
      this.logWorkerError(error);
    }
  }

  private async processClaimed(
    outbox: ClaimedAiIndexOutbox,
  ): Promise<AiIndexDispatchResult> {
    try {
      if (!(await this.isLatestSourceVersion(outbox))) {
        const finalized = await this.markSuccess(outbox, []);
        return {
          outboxId: outbox._id,
          status: finalized ? 'SUCCEEDED' : 'LEASE_LOST',
        };
      }

      if (outbox.aggregateType === AiIndexAggregateType.JOB) {
        const outcome = await this.dispatchJob(outbox);
        const finalized = await this.markSuccess(outbox, [outcome]);
        return {
          outboxId: outbox._id,
          status: finalized ? 'SUCCEEDED' : 'LEASE_LOST',
        };
      }

      // Company commands are processed one bounded keyset page at a time. Each
      // page is persisted only after its AI calls have completed, while the
      // parent outbox row remains PROCESSING until the final page finishes.
      // A crash restarts the page from its cursor, and stable per-job request
      // IDs make that replay idempotent.
      const completed = await this.dispatchCompany(outbox);
      if (!completed) {
        return { outboxId: outbox._id, status: 'LEASE_LOST' };
      }
      const finalized = await this.markSuccess(outbox, []);
      return {
        outboxId: outbox._id,
        status: finalized ? 'SUCCEEDED' : 'LEASE_LOST',
      };
    } catch (error) {
      const status = await this.markFailure(outbox, error);
      return { outboxId: outbox._id, status };
    }
  }

  private async dispatchJob(
    outbox: ClaimedAiIndexOutbox,
  ): Promise<JobDispatchOutcome> {
    const sourceVersion = toSafeSourceVersion(outbox.sourceVersion);
    const jobId = outbox.aggregateId;

    if (outbox.operation === AiIndexOutboxOperation.DELETE) {
      const response = await this.aiServiceClient.deleteIndexedJob(
        {
          job_id: jobId,
          source_version: sourceVersion,
          idempotency_key: createIndexIdempotencyKey(outbox._id, 'DELETE'),
        },
        createIndexCallOptions(outbox, jobId, 'DELETE'),
      );
      assertIndexResponse(response, jobId, sourceVersion, 'DELETE');
      return { jobId, response, operation: 'DELETE' };
    }

    const request = await this.projectionService.buildUpsertRequest(
      jobId,
      sourceVersion,
      createIndexIdempotencyKey(outbox._id, 'UPSERT'),
      new Date(),
    );

    if (request) {
      const response = await this.aiServiceClient.indexJob(
        request,
        createIndexCallOptions(outbox, jobId, 'UPSERT'),
      );
      assertIndexResponse(response, jobId, sourceVersion, 'UPSERT');
      return { jobId, response, operation: 'UPSERT' };
    }

    // An UPSERT event may be observed after the job expires, is deactivated,
    // or its company is deleted. Convert it into an idempotent delete at the
    // same source version rather than sending an invalid inactive projection.
    const response = await this.aiServiceClient.deleteIndexedJob(
      {
        job_id: jobId,
        source_version: sourceVersion,
        idempotency_key: createIndexIdempotencyKey(outbox._id, 'DELETE'),
      },
      createIndexCallOptions(outbox, jobId, 'DELETE'),
    );
    assertIndexResponse(response, jobId, sourceVersion, 'DELETE');
    return { jobId, response, operation: 'DELETE' };
  }

  private async dispatchCompany(
    outbox: ClaimedAiIndexOutbox,
  ): Promise<boolean> {
    if (outbox.operation !== AiIndexOutboxOperation.REINDEX_COMPANY) {
      throw terminalDispatchError(
        'AI_INDEX_OPERATION_INVALID',
        'Company outbox command has an invalid operation',
      );
    }

    const sourceVersion = toSafeSourceVersion(outbox.sourceVersion);
    const now = new Date();
    let cursor: string | null = null;
    let hasMore = true;
    let processedJobs = 0;
    let processedPages = 0;

    while (hasMore) {
      if (processedPages >= MAX_COMPANY_REINDEX_PAGES_PER_ATTEMPT) {
        throw retryableDispatchError(
          'AI_INDEX_COMPANY_REINDEX_BUDGET_EXCEEDED',
          'Company reindex exceeded the per-attempt page budget',
        );
      }

      // The cursor is intentionally process-local until company continuation
      // receives a durable schema of its own. Renewing before hydration and
      // before each external call keeps the parent claim valid; every replay
      // starts at page one and uses stable per-job request/idempotency IDs.
      if (!(await this.renewLease(outbox))) return false;

      const page = await this.projectionService.projectCompanyJobs(
        outbox.aggregateId,
        cursor,
        this.options.companyJobLimit,
        now,
      );
      assertCompanyPage(page, cursor);
      processedPages += 1;
      if (
        processedJobs + page.jobs.length >
        MAX_COMPANY_REINDEX_JOBS_PER_ATTEMPT
      ) {
        throw retryableDispatchError(
          'AI_INDEX_COMPANY_REINDEX_BUDGET_EXCEEDED',
          'Company reindex exceeded the per-attempt job budget',
        );
      }

      const previousCursor = cursor;
      if (page.hasMore && page.nextCursor === previousCursor) {
        throw terminalDispatchError(
          'AI_INDEX_COMPANY_CURSOR_INVALID',
          'Company projection page did not advance its cursor',
        );
      }
      const outcomes: JobDispatchOutcome[] = [];

      for (const projection of page.jobs) {
        if (!(await this.renewLease(outbox))) return false;

        const jobId = projection.job._id;
        const effectiveOperation =
          projection.isCanonicalActive && projection.snapshot
            ? 'UPSERT'
            : 'DELETE';
        const idempotencyKey = createIndexIdempotencyKey(
          outbox._id,
          effectiveOperation,
          jobId,
        );

        if (effectiveOperation === 'UPSERT') {
          const response = await this.aiServiceClient.indexJob(
            this.projectionService.toIndexJobUpsertRequest(
              projection.snapshot,
              sourceVersion,
              idempotencyKey,
            ),
            createIndexCallOptions(outbox, jobId, effectiveOperation),
          );
          assertIndexResponse(response, jobId, sourceVersion, 'UPSERT');
          outcomes.push({ jobId, response, operation: 'UPSERT' });
        } else {
          const response = await this.aiServiceClient.deleteIndexedJob(
            {
              job_id: jobId,
              source_version: sourceVersion,
              idempotency_key: idempotencyKey,
            },
            createIndexCallOptions(outbox, jobId, effectiveOperation),
          );
          assertIndexResponse(response, jobId, sourceVersion, 'DELETE');
          outcomes.push({ jobId, response, operation: 'DELETE' });
        }
      }

      if (!(await this.markCompanyPage(outbox, outcomes))) return false;

      processedJobs += page.jobs.length;
      hasMore = page.hasMore;
      if (!hasMore) break;
      cursor = page.nextCursor;
    }

    return true;
  }

  /** Best-effort stale suppression before hydrating/calling the AI service. */
  private async isLatestSourceVersion(
    outbox: ClaimedAiIndexOutbox,
  ): Promise<boolean> {
    const createQueryBuilder = this.outboxRepository.createQueryBuilder;
    if (typeof createQueryBuilder !== 'function') return true;

    const queryBuilder = createQueryBuilder.call(
      this.outboxRepository,
      'latestOutbox',
    );
    if (typeof queryBuilder.getRawOne !== 'function') return true;

    const latest = (await queryBuilder
      .select('latestOutbox.sourceVersion', 'sourceVersion')
      .where('latestOutbox.aggregateType = :aggregateType', {
        aggregateType: outbox.aggregateType,
      })
      .andWhere('latestOutbox.aggregateId = :aggregateId', {
        aggregateId: outbox.aggregateId,
      })
      .orderBy('latestOutbox.sourceVersion', 'DESC')
      .limit(1)
      .getRawOne()) as { sourceVersion?: string | number } | undefined;

    if (!latest?.sourceVersion) return true;
    return BigInt(String(latest.sourceVersion)) <= BigInt(outbox.sourceVersion);
  }

  private async markCompanyPage(
    outbox: ClaimedAiIndexOutbox,
    outcomes: JobDispatchOutcome[],
  ): Promise<boolean> {
    const now = new Date();
    return this.runTransaction(async (manager) => {
      // Fence and renew before writing any page state. The conditional update
      // locks the outbox row until commit, so an expired claim cannot write a
      // page after another worker has acquired the same command.
      const renewed = await this.updateClaimedOutbox(manager, outbox, now, {
        leasedAt: now,
        leaseExpiresAt: new Date(now.getTime() + this.options.leaseMs),
      });
      if (!renewed) return false;

      for (const outcome of outcomes) {
        await this.persistIndexStateSuccess(manager, outbox, outcome, now);
      }
      return true;
    });
  }

  private async markSuccess(
    outbox: ClaimedAiIndexOutbox,
    outcomes: JobDispatchOutcome[],
  ): Promise<boolean> {
    const now = new Date();
    return this.runTransaction(async (manager) => {
      const finalized = await this.updateClaimedOutbox(manager, outbox, now, {
        status: AiIndexOutboxStatus.SUCCEEDED,
        processedAt: now,
        nextRetryAt: now,
        leasedAt: null,
        leaseExpiresAt: null,
        leaseOwner: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        lastErrorAt: null,
      });
      if (!finalized) return false;

      for (const outcome of outcomes) {
        await this.persistIndexStateSuccess(manager, outbox, outcome, now);
      }
      return true;
    });
  }

  private async markFailure(
    outbox: ClaimedAiIndexOutbox,
    error: unknown,
  ): Promise<'RETRY_SCHEDULED' | 'DEAD_LETTER' | 'LEASE_LOST'> {
    const details = classifyDispatchError(error);
    const now = new Date();
    return this.runTransaction(async (manager) => {
      const repository = manager.getRepository(AiIndexOutbox);
      const current = await repository.findOne({ where: { _id: outbox._id } });
      if (!this.ownsLease(current, outbox, now)) return 'LEASE_LOST';

      const terminal =
        !details.retryable || current.attempts >= current.maxAttempts;
      const nextRetryAt = terminal
        ? now
        : new Date(
            now.getTime() +
              computeRetryDelay(
                current.attempts,
                this.options.retryBaseMs,
                this.options.retryMaxMs,
                this.options.retryJitterRatio,
              ),
          );
      const updated = await this.updateClaimedOutbox(manager, outbox, now, {
        status: terminal
          ? AiIndexOutboxStatus.DEAD_LETTER
          : AiIndexOutboxStatus.FAILED,
        nextRetryAt,
        lastErrorCode: details.code.slice(0, 80),
        lastErrorMessage: details.message.slice(0, MAX_ERROR_MESSAGE_LENGTH),
        lastErrorAt: now,
        leasedAt: null,
        leaseExpiresAt: null,
        leaseOwner: null,
      });
      if (!updated) return 'LEASE_LOST';

      if (outbox.aggregateType === AiIndexAggregateType.JOB) {
        await this.persistIndexStateFailure(
          manager,
          outbox,
          details,
          now,
          terminal,
        );
      }
      return terminal ? 'DEAD_LETTER' : 'RETRY_SCHEDULED';
    });
  }

  private async renewLease(
    outbox: ClaimedAiIndexOutbox,
    now = new Date(),
  ): Promise<boolean> {
    return this.runTransaction((manager) =>
      this.updateClaimedOutbox(manager, outbox, now, {
        leasedAt: now,
        leaseExpiresAt: new Date(now.getTime() + this.options.leaseMs),
      }),
    );
  }

  /**
   * Conditionally changes a claimed outbox row. A lease owner is a fencing
   * token, not merely a worker label; checking expiry in the UPDATE prevents a
   * late completion from overwriting a newer claim.
   */
  private async updateClaimedOutbox(
    manager: EntityManager,
    outbox: ClaimedAiIndexOutbox,
    now: Date,
    changes: Partial<AiIndexOutbox>,
  ): Promise<boolean> {
    const repository = manager.getRepository(AiIndexOutbox);
    // PostgreSQL's conditional UPDATE is the fencing point. Do not fall back
    // to read-then-save: that would let a late completion race a reclaimed
    // claim when an adapter does not implement atomic update semantics.
    const result = await repository.update(
      {
        _id: outbox._id,
        status: AiIndexOutboxStatus.PROCESSING,
        leaseOwner: outbox.leaseOwner,
        leaseExpiresAt: MoreThan(now),
      },
      changes,
    );
    if (result.affected !== 1) return false;
    Object.assign(outbox, changes);
    return true;
  }

  private async persistIndexStateSuccess(
    manager: EntityManager,
    outbox: ClaimedAiIndexOutbox,
    outcome: JobDispatchOutcome,
    now: Date,
  ): Promise<void> {
    await this.lockIndexState(manager, outcome.jobId);
    const repository = manager.getRepository(AiJobIndexState);
    const state = await this.findOrCreateState(
      repository,
      outcome.jobId,
      outbox.sourceVersion,
    );
    if (
      state.sourceVersion &&
      BigInt(String(state.sourceVersion)) > BigInt(outbox.sourceVersion)
    ) {
      return;
    }

    if (outcome.response.status === 'STALE_IGNORED') return;

    state.sourceVersion = String(outcome.response.source_version);
    state.status =
      outcome.operation === 'DELETE'
        ? AiJobIndexStateStatus.DELETED
        : AiJobIndexStateStatus.INDEXED;
    if (hasResponseField(outcome.response, 'content_hash')) {
      state.contentHash = outcome.response.content_hash ?? null;
    }
    if (hasResponseField(outcome.response, 'metadata_hash')) {
      state.metadataHash = outcome.response.metadata_hash ?? null;
    }
    if (hasResponseField(outcome.response, 'embedding_provider')) {
      state.embeddingProvider = outcome.response.embedding_provider ?? null;
    }
    if (hasResponseField(outcome.response, 'embedding_model_version')) {
      state.embeddingModelVersion =
        outcome.response.embedding_model_version ?? null;
    }
    if (hasResponseField(outcome.response, 'embedding_dimensions')) {
      state.embeddingDimensions = outcome.response.embedding_dimensions ?? null;
    }
    if (hasResponseField(outcome.response, 'normalization_version')) {
      state.normalizationVersion =
        outcome.response.normalization_version ?? null;
    }
    if (hasResponseField(outcome.response, 'chunking_version')) {
      state.chunkingVersion = outcome.response.chunking_version ?? null;
    }
    if (hasResponseField(outcome.response, 'index_schema_version')) {
      state.indexSchemaVersion = outcome.response.index_schema_version ?? null;
    }
    if (hasResponseField(outcome.response, 'collection_name')) {
      state.collectionName = outcome.response.collection_name ?? null;
    }
    if (hasResponseField(outcome.response, 'collection_version')) {
      state.collectionVersion = outcome.response.collection_version ?? null;
    }
    state.indexedPointIds =
      outcome.operation === 'DELETE' ? [] : [...outcome.response.point_ids];
    state.attempts = outbox.attempts;
    state.nextRetryAt = null;
    state.lastAttemptAt = outbox.lastAttemptAt ?? now;
    state.leasedAt = null;
    state.leaseExpiresAt = null;
    state.leaseOwner = null;
    state.lastErrorCode = null;
    state.lastErrorMessage = null;
    state.lastErrorAt = null;
    state.indexedAt = now;
    await repository.save(state);
  }

  private async persistIndexStateFailure(
    manager: EntityManager,
    outbox: ClaimedAiIndexOutbox,
    details: DispatchErrorDetails,
    now: Date,
    terminal: boolean,
  ): Promise<void> {
    await this.lockIndexState(manager, outbox.aggregateId);
    const repository = manager.getRepository(AiJobIndexState);
    const state = await this.findOrCreateState(
      repository,
      outbox.aggregateId,
      outbox.sourceVersion,
    );
    if (
      state.sourceVersion &&
      BigInt(String(state.sourceVersion)) > BigInt(outbox.sourceVersion)
    ) {
      return;
    }
    state.sourceVersion = String(outbox.sourceVersion);
    state.status = AiJobIndexStateStatus.FAILED;
    state.attempts = outbox.attempts;
    state.nextRetryAt = terminal ? null : new Date(outbox.nextRetryAt);
    state.lastAttemptAt = outbox.lastAttemptAt ?? now;
    state.leasedAt = null;
    state.leaseExpiresAt = null;
    state.leaseOwner = null;
    state.lastErrorCode = details.code.slice(0, 80);
    state.lastErrorMessage = details.message.slice(0, MAX_ERROR_MESSAGE_LENGTH);
    state.lastErrorAt = now;
    await repository.save(state);
  }

  private async lockIndexState(
    manager: EntityManager,
    jobId: string,
  ): Promise<void> {
    if (typeof manager.query !== 'function') return;
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`ai-index-state:${jobId}:${this.environment}`],
    );
  }

  private async findOrCreateState(
    repository: Repository<AiJobIndexState>,
    jobId: string,
    sourceVersion: string,
  ): Promise<AiJobIndexState> {
    const existing = await repository.findOne({
      where: {
        jobId,
        environment: this.environment,
      },
    });
    if (existing) return existing;

    return repository.create({
      jobId,
      environment: this.environment,
      sourceVersion: String(sourceVersion),
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
    });
  }

  private get environment(): string {
    return boundedEnvironment(
      this.configService.get<string>('AI_INDEX_ENVIRONMENT', 'local') ||
        'local',
    );
  }

  private ownsLease(
    current: AiIndexOutbox | null,
    claimed: ClaimedAiIndexOutbox,
    now = new Date(),
  ): current is AiIndexOutbox {
    return Boolean(
      current &&
        current.status === AiIndexOutboxStatus.PROCESSING &&
        current.leaseOwner === claimed.leaseOwner &&
        current.leaseExpiresAt &&
        current.leaseExpiresAt > now,
    );
  }

  private runTransaction<T>(
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.outboxRepository.manager.transaction(work);
  }

  private logWorkerError(error: unknown): void {
    const details = classifyDispatchError(error);
    this.logger.error(`${details.code}: ${details.message}`);
  }
}

/** Stable, bounded idempotency key for a logical indexing call. */
export function createIndexIdempotencyKey(
  outboxId: string,
  operation: 'UPSERT' | 'DELETE',
  jobId?: string,
): string {
  const suffix = jobId ? `:${jobId}` : '';
  return `ai-index:${outboxId}:${operation}${suffix}`.slice(0, 128);
}

/** Stable UUID for a logical call; retries must reuse this request ID. */
export function createIndexRequestId(
  outboxId: string,
  jobId?: string,
  operation?: string,
): string {
  if (!jobId && !operation && isUuid(outboxId)) return outboxId.toLowerCase();
  return uuidv5(
    `${outboxId}:${jobId ?? ''}:${operation ?? ''}`,
    STABLE_REQUEST_NAMESPACE,
  );
}

/** Stable UUID for one outbox/job/operation delivery across HTTP retries. */
export function createIndexOperationAttemptId(
  outboxId: string,
  jobId: string,
  operation: 'UPSERT' | 'DELETE',
): string {
  return uuidv5(
    `${outboxId}:${jobId}:${operation}`,
    STABLE_OPERATION_ATTEMPT_NAMESPACE,
  );
}

function createIndexCallOptions(
  outbox: ClaimedAiIndexOutbox,
  jobId: string,
  operation: 'UPSERT' | 'DELETE',
): {
  requestId: string;
  operationAttemptId: string;
  outboxId: string;
  jobId: string;
  attemptNumber: number;
} {
  return {
    requestId: createIndexRequestId(outbox._id, jobId, operation),
    operationAttemptId: createIndexOperationAttemptId(
      outbox._id,
      jobId,
      operation,
    ),
    outboxId: outbox._id,
    jobId,
    attemptNumber: outbox.attempts,
  };
}

export function computeRetryDelay(
  attempt: number,
  baseMs: number,
  maxMs: number,
  jitterRatio = DEFAULT_RETRY_JITTER_RATIO,
  random = Math.random,
): number {
  const exponent = Math.max(Math.trunc(attempt) - 1, 0);
  const exponential = Math.min(maxMs, baseMs * 2 ** exponent);
  const jitter = exponential * Math.min(Math.max(jitterRatio, 0), 1) * random();
  return Math.min(maxMs, Math.max(0, Math.round(exponential + jitter)));
}

function readDispatcherOptions(
  config: ConfigService,
): AiIndexDispatcherOptions {
  const batchSize = readInteger(
    config,
    'AI_INDEX_BATCH_SIZE',
    DEFAULT_BATCH_SIZE,
    1,
    MAX_BATCH_SIZE,
  );
  const leaseMs = readInteger(
    config,
    'AI_INDEX_LEASE_MS',
    DEFAULT_LEASE_MS,
    1_000,
    300_000,
  );
  const pollIntervalMs = readInteger(
    config,
    'AI_INDEX_POLL_INTERVAL_MS',
    DEFAULT_POLL_INTERVAL_MS,
    100,
    300_000,
  );
  const companyJobLimit = readInteger(
    config,
    'AI_INDEX_COMPANY_JOB_LIMIT',
    DEFAULT_COMPANY_JOB_LIMIT,
    1,
    MAX_COMPANY_JOB_LIMIT,
  );
  const retryBaseMs = readInteger(
    config,
    'AI_INDEX_RETRY_BASE_MS',
    DEFAULT_RETRY_BASE_MS,
    1,
    300_000,
  );
  const retryMaxMs = readInteger(
    config,
    'AI_INDEX_RETRY_MAX_MS',
    DEFAULT_RETRY_MAX_MS,
    retryBaseMs,
    3_600_000,
  );
  const retryJitterRatio = readNumber(
    config,
    'AI_INDEX_RETRY_JITTER_RATIO',
    DEFAULT_RETRY_JITTER_RATIO,
    0,
    1,
  );
  return {
    batchSize,
    leaseMs,
    pollIntervalMs,
    companyJobLimit,
    retryBaseMs,
    retryMaxMs,
    retryJitterRatio,
  };
}

function readInteger(
  config: ConfigService,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = Number(config.get(key, fallback));
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${key} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function readNumber(
  config: ConfigService,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = Number(config.get(key, fallback));
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${key} must be between ${min} and ${max}`);
  }
  return value;
}

function boundedWorkerOwner(value: string): string {
  const configured =
    String(value ?? '').trim() || `ai-index-worker:${process.pid}`;
  // Leave room for a complete per-claim UUID. The claim token is the actual
  // fencing value; the worker UUID only identifies the process that created it.
  return `${randomUUID()}:${configured.slice(0, 80)}`.slice(0, 128);
}

function createClaimLeaseOwner(workerOwner: string): string {
  return `${randomUUID()}:${workerOwner.slice(0, 90)}`.slice(0, 128);
}

function assertSingleOutboxEnvironment(config: ConfigService): void {
  const environment = boundedEnvironment(
    config.get<string>('AI_INDEX_ENVIRONMENT', 'local') || 'local',
  );
  const rawOutboxEnvironment = config.get<string>(
    'AI_INDEX_OUTBOX_ENVIRONMENT',
  );
  if (rawOutboxEnvironment === undefined || rawOutboxEnvironment === null) {
    if (environment !== 'local') {
      throw new Error(
        'AI_INDEX_OUTBOX_ENVIRONMENT must be explicitly set for a non-local unscoped outbox',
      );
    }
    return;
  }

  const outboxEnvironment = boundedEnvironment(rawOutboxEnvironment);
  // ai_index_outbox is intentionally unscoped in the current migration. Each
  // deployment must therefore use a database dedicated to one environment and
  // declare the same value on both sides; staging/production are never allowed
  // to silently claim a differently configured outbox.
  if (environment !== outboxEnvironment) {
    throw new Error(
      'AI_INDEX_OUTBOX_ENVIRONMENT must match AI_INDEX_ENVIRONMENT for the unscoped outbox',
    );
  }
}

function boundedEnvironment(value: unknown): string {
  const environment = String(value ?? '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,31}$/.test(environment)) {
    throw new Error(
      'AI_INDEX_ENVIRONMENT must contain 1 to 32 safe characters',
    );
  }
  return environment;
}

function integerOrZero(value: unknown): number {
  const numberValue = Number(value);
  return Number.isSafeInteger(numberValue) && numberValue >= 0
    ? numberValue
    : 0;
}

function toSafeSourceVersion(value: string | number | bigint): number {
  let parsed: bigint;
  try {
    parsed = BigInt(value);
  } catch {
    throw terminalDispatchError(
      'AI_INDEX_SOURCE_VERSION_INVALID',
      'Index source version is invalid',
    );
  }
  if (parsed < 1n || parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw terminalDispatchError(
      'AI_INDEX_SOURCE_VERSION_UNSAFE',
      'Index source version is outside the AI contract range',
    );
  }
  return Number(parsed);
}

function hasResponseField(
  response: IndexJobResponse,
  field: keyof IndexJobResponse,
): boolean {
  return Object.prototype.hasOwnProperty.call(response, field);
}

function assertCompanyPage(
  page: unknown,
  cursor: string | null,
): asserts page is {
  jobs: Array<{ job: { _id: string } }>;
  nextCursor: string | null;
  hasMore: boolean;
} {
  if (!page || typeof page !== 'object') {
    throw terminalDispatchError(
      'AI_INDEX_COMPANY_PAGE_INVALID',
      'Company projection page is invalid',
    );
  }
  const candidate = page as {
    jobs?: unknown;
    nextCursor?: unknown;
    hasMore?: unknown;
  };
  if (
    !Array.isArray(candidate.jobs) ||
    typeof candidate.hasMore !== 'boolean' ||
    (candidate.nextCursor !== null &&
      (typeof candidate.nextCursor !== 'string' ||
        !isUuid(candidate.nextCursor)))
  ) {
    throw terminalDispatchError(
      'AI_INDEX_COMPANY_PAGE_INVALID',
      'Company projection page is invalid',
    );
  }
  if (candidate.hasMore && !candidate.nextCursor) {
    throw terminalDispatchError(
      'AI_INDEX_COMPANY_CURSOR_INVALID',
      'Company projection page is missing its next cursor',
    );
  }
  if (!candidate.hasMore && candidate.nextCursor !== null) {
    throw terminalDispatchError(
      'AI_INDEX_COMPANY_CURSOR_INVALID',
      'Final company projection page must not have a next cursor',
    );
  }
  if (candidate.hasMore && candidate.nextCursor === cursor) {
    throw terminalDispatchError(
      'AI_INDEX_COMPANY_CURSOR_INVALID',
      'Company projection page did not advance its cursor',
    );
  }
  for (const projection of candidate.jobs) {
    if (
      !projection ||
      typeof projection !== 'object' ||
      !('job' in projection) ||
      !projection.job ||
      typeof projection.job !== 'object' ||
      typeof (projection.job as { _id?: unknown })._id !== 'string' ||
      !isUuid((projection.job as { _id: string })._id)
    ) {
      throw terminalDispatchError(
        'AI_INDEX_COMPANY_PAGE_INVALID',
        'Company projection page contains an invalid job',
      );
    }
  }
}

function assertIndexResponse(
  response: IndexJobResponse,
  jobId: string,
  sourceVersion: number,
  operation: 'UPSERT' | 'DELETE',
): void {
  if (
    response.job_id !== jobId ||
    response.source_version !== sourceVersion ||
    response.operation !== operation
  ) {
    throw terminalDispatchError(
      AiServiceErrorCode.AI_INVALID_MODEL_OUTPUT,
      'AI service indexing response does not match the claimed command',
    );
  }
}

function terminalDispatchError(code: string, message: string): AiServiceError {
  return new AiServiceError(code as AiServiceErrorCode, message, 422, false);
}

function retryableDispatchError(code: string, message: string): AiServiceError {
  return new AiServiceError(code as AiServiceErrorCode, message, 503, true);
}

function classifyDispatchError(error: unknown): DispatchErrorDetails {
  if (error instanceof AiServiceError) {
    return {
      retryable: error.retryable,
      code: error.code,
      message: safeErrorMessage(error.message),
    };
  }
  if (error instanceof CanonicalProjectionError) {
    return {
      retryable: false,
      code: error.code,
      message: safeErrorMessage(error.message),
    };
  }
  return {
    // Unknown errors are generally database/network/infrastructure failures.
    // Retry them with the bounded outbox policy; malformed contract errors are
    // represented by AiServiceError/CanonicalProjectionError above.
    retryable: true,
    code: 'AI_INDEX_DISPATCH_ERROR',
    message: safeErrorMessage(
      error instanceof Error ? error.message : 'Index dispatch failed',
    ),
  };
}

function safeErrorMessage(message: string): string {
  return message.replace(/[\r\n]+/g, ' ').slice(0, MAX_ERROR_MESSAGE_LENGTH);
}
