import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { validate as isUuid, v5 as uuidv5, NIL as UUID_NIL } from 'uuid';
import { EntityManager, Repository } from 'typeorm';
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
import { prepareAiIndexOutboxReplay } from './ai-index-replay.service';
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

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_LEASE_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_COMPANY_JOB_LIMIT = 500;
const DEFAULT_RETRY_BASE_MS = 1_000;
const DEFAULT_RETRY_MAX_MS = 60_000;
const DEFAULT_RETRY_JITTER_RATIO = 0.2;
const MAX_BATCH_SIZE = 100;
const MAX_COMPANY_JOB_LIMIT = 1_000;
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

  constructor(
    @InjectRepository(AiIndexOutbox)
    private readonly outboxRepository: Repository<AiIndexOutbox>,
    @InjectRepository(AiJobIndexState)
    private readonly stateRepository: Repository<AiJobIndexState>,
    private readonly projectionService: CanonicalJobProjectionService,
    private readonly aiServiceClient: AiServiceClient,
    private readonly configService: ConfigService,
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
  ): Promise<ClaimedAiIndexOutbox[]> {
    const boundedLimit = Math.min(
      Math.max(Math.trunc(limit), 1),
      MAX_BATCH_SIZE,
    );
    return this.runTransaction(async (manager) => {
      const repository = manager.getRepository(AiIndexOutbox);
      const candidates = await repository
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
        })
        .orderBy('outbox.createdAt', 'ASC')
        .addOrderBy('outbox._id', 'ASC')
        .take(boundedLimit)
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getMany();

      const claimed: ClaimedAiIndexOutbox[] = [];
      for (const outbox of candidates) {
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
        outbox.leaseOwner = this.owner;
        await repository.save(outbox);
        claimed.push(outbox as ClaimedAiIndexOutbox);
      }
      return claimed;
    });
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
    return this.runTransaction(async (manager) => {
      const repository = manager.getRepository(AiIndexOutbox);
      const outbox = await repository.findOne({ where: { _id: outboxId } });
      if (!outbox || !prepareAiIndexOutboxReplay(outbox, new Date())) {
        return false;
      }
      await repository.save(outbox);
      return true;
    });
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
    const results = await this.processBatch();
    if (results.length > 0) {
      this.logger.debug(
        `Processed ${results.length} AI indexing outbox command(s)`,
      );
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

      const outcomes =
        outbox.aggregateType === AiIndexAggregateType.JOB
          ? [await this.dispatchJob(outbox)]
          : await this.dispatchCompany(outbox);
      const finalized = await this.markSuccess(outbox, outcomes);
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
        { requestId: createIndexRequestId(outbox._id) },
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
      const response = await this.aiServiceClient.indexJob(request, {
        requestId: createIndexRequestId(outbox._id),
      });
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
      { requestId: createIndexRequestId(outbox._id, undefined, 'DELETE') },
    );
    assertIndexResponse(response, jobId, sourceVersion, 'DELETE');
    return { jobId, response, operation: 'DELETE' };
  }

  private async dispatchCompany(
    outbox: ClaimedAiIndexOutbox,
  ): Promise<JobDispatchOutcome[]> {
    if (outbox.operation !== AiIndexOutboxOperation.REINDEX_COMPANY) {
      throw terminalDispatchError(
        'AI_INDEX_OPERATION_INVALID',
        'Company outbox command has an invalid operation',
      );
    }

    const sourceVersion = toSafeSourceVersion(outbox.sourceVersion);
    const projections = await this.projectionService.projectCompanyJobs(
      outbox.aggregateId,
      this.options.companyJobLimit,
      new Date(),
    );
    const outcomes: JobDispatchOutcome[] = [];

    for (const projection of projections) {
      const jobId = projection.job._id;
      const effectiveOperation =
        projection.isCanonicalActive && projection.snapshot
          ? 'UPSERT'
          : 'DELETE';
      const requestId = createIndexRequestId(
        outbox._id,
        jobId,
        effectiveOperation,
      );
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
          { requestId },
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
          { requestId },
        );
        assertIndexResponse(response, jobId, sourceVersion, 'DELETE');
        outcomes.push({ jobId, response, operation: 'DELETE' });
      }
    }

    return outcomes;
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

  private async markSuccess(
    outbox: ClaimedAiIndexOutbox,
    outcomes: JobDispatchOutcome[],
  ): Promise<boolean> {
    const now = new Date();
    return this.runTransaction(async (manager) => {
      const repository = manager.getRepository(AiIndexOutbox);
      const current = await repository.findOne({ where: { _id: outbox._id } });
      if (!this.ownsLease(current, outbox)) return false;

      current.status = AiIndexOutboxStatus.SUCCEEDED;
      current.processedAt = now;
      current.nextRetryAt = now;
      current.leasedAt = null;
      current.leaseExpiresAt = null;
      current.leaseOwner = null;
      current.lastErrorCode = null;
      current.lastErrorMessage = null;
      current.lastErrorAt = null;
      await repository.save(current);

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
      if (!this.ownsLease(current, outbox)) return 'LEASE_LOST';

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
      current.status = terminal
        ? AiIndexOutboxStatus.DEAD_LETTER
        : AiIndexOutboxStatus.FAILED;
      current.nextRetryAt = nextRetryAt;
      current.lastErrorCode = details.code.slice(0, 80);
      current.lastErrorMessage = details.message.slice(
        0,
        MAX_ERROR_MESSAGE_LENGTH,
      );
      current.lastErrorAt = now;
      current.leasedAt = null;
      current.leaseExpiresAt = null;
      current.leaseOwner = null;
      await repository.save(current);

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

  private async persistIndexStateSuccess(
    manager: EntityManager,
    outbox: ClaimedAiIndexOutbox,
    outcome: JobDispatchOutcome,
    now: Date,
  ): Promise<void> {
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
    state.contentHash = outcome.response.content_hash ?? null;
    state.metadataHash = outcome.response.metadata_hash ?? null;
    state.embeddingModelVersion =
      outcome.response.embedding_model_version ??
      state.embeddingModelVersion ??
      null;
    state.embeddingDimensions =
      outcome.response.embedding_dimensions ??
      state.embeddingDimensions ??
      null;
    state.normalizationVersion =
      outcome.response.normalization_version ??
      state.normalizationVersion ??
      null;
    state.chunkingVersion =
      outcome.response.chunking_version ?? state.chunkingVersion ?? null;
    state.indexSchemaVersion =
      outcome.response.index_schema_version ?? state.indexSchemaVersion ?? null;
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
  ): current is AiIndexOutbox {
    return Boolean(
      current &&
        current.status === AiIndexOutboxStatus.PROCESSING &&
        current.leaseOwner === claimed.leaseOwner &&
        claimed.leaseOwner === this.owner,
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
  const owner =
    value.trim() ||
    `ai-index-worker:${process.pid}:${createIndexRequestId(UUID_NIL)}`;
  if (owner.length > 128) return owner.slice(0, 128);
  return owner;
}

function boundedEnvironment(value: string): string {
  const environment = value.trim();
  if (!environment || environment.length > 32) {
    throw new Error('AI_INDEX_ENVIRONMENT must be between 1 and 32 characters');
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
    retryable: false,
    code: 'AI_INDEX_DISPATCH_ERROR',
    message: safeErrorMessage(
      error instanceof Error ? error.message : 'Index dispatch failed',
    ),
  };
}

function safeErrorMessage(message: string): string {
  return message.replace(/[\r\n]+/g, ' ').slice(0, MAX_ERROR_MESSAGE_LENGTH);
}
