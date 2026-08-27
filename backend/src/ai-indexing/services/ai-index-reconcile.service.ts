import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AiIndexingService } from '../ai-indexing.service';
import {
  AiIndexAggregateType,
  AiIndexOutboxOperation,
} from '../entities/ai-index-outbox.entity';
import {
  AiJobIndexState,
  AiJobIndexStateStatus,
} from '../entities/ai-job-index-state.entity';
import {
  CanonicalJobProjectionService,
  CanonicalJobScanPage,
} from './canonical-job-projection.service';
import {
  CanonicalJobDisposition,
  classifyCanonicalJob,
} from './canonical-job-lifecycle';
import {
  IndexRepresentationVersions,
  computeCanonicalContentHash,
  computeCanonicalMetadataHash,
} from './index-representation';
import { AiIndexBackfillOptions, boundedBatchSize } from './ai-index-backfill.service';

export interface AiIndexReconcileOptions extends AiIndexBackfillOptions {
  environment?: string;
}

export interface AiIndexReconcilePageOptions {
  now?: Date;
  environment?: string;
}

export interface AiIndexReconcileCounters {
  scanned: number;
  active: number;
  inactive: number;
  missingState: number;
  staleState: number;
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
  orphanPointsChecked: number;
}

export interface AiIndexReconcileResult extends AiIndexReconcileCounters {
  environment: string;
  cursor: string | null;
  nextCursor: string | null;
  hasMore: boolean;
  /** Qdrant orphan detection belongs to the protected AI scan route. */
  orphanDetection: 'NOT_PERFORMED_REQUIRES_AI_SCAN';
}

interface ExpectedRepresentation {
  embeddingProvider?: string;
  embeddingModelVersion?: string;
  embeddingDimensions?: number;
  normalizationVersion?: string;
  chunkingVersion?: string;
  indexSchemaVersion?: string;
  collectionName?: string;
  collectionVersion?: string;
}

/**
 * PostgreSQL-only drift reconciliation for one configured index environment.
 *
 * It deliberately does not inspect Qdrant. It identifies canonical jobs
 * missing/stale in PostgreSQL state and enqueues repairs; orphan points
 * require the protected FastAPI metadata scan route. No result from this
 * service claims that orphan points were checked.
 */
@Injectable()
export class AiIndexReconcileService {
  constructor(
    @InjectRepository(AiJobIndexState)
    private readonly stateRepository: Repository<AiJobIndexState>,
    private readonly projectionService: CanonicalJobProjectionService,
    private readonly aiIndexingService: AiIndexingService,
    private readonly configService: ConfigService = new ConfigService(),
  ) {}

  /** Reconciles one bounded canonical cursor page. */
  async reconcile(
    options: AiIndexReconcileOptions = {},
  ): Promise<AiIndexReconcileResult> {
    const now = options.now ?? new Date();
    const environment = this.resolveEnvironment(options.environment);
    const page = await this.projectionService.scanJobs(
      options.cursor ?? null,
      boundedBatchSize(options.limit),
      now,
    );
    return this.reconcilePage(page, { now, environment });
  }

  /** Explicit page boundary; this is the unit-testable reconciliation API. */
  async reconcilePage(
    page: CanonicalJobScanPage,
    options: AiIndexReconcilePageOptions = {},
  ): Promise<AiIndexReconcileResult> {
    const now = options.now ?? new Date();
    const environment = this.resolveEnvironment(options.environment);
    const counters = emptyReconcileCounters();
    const states = await this.loadStates(
      page.jobs.map((projection) => projection.job._id),
      environment,
    );
    const expected = this.readConfiguredRepresentation();

    for (const projection of page.jobs) {
      counters.scanned += 1;
      const disposition = classifyCanonicalJob(projection, now);
      const state = states.get(projection.job._id);

      if (disposition === 'ACTIVE' && projection.snapshot) {
        counters.active += 1;
        const repairNeeded = !state || !this.isCurrentState(
          state,
          projection.snapshot,
          expected,
        );
        if (!repairNeeded) continue;
        if (!state) counters.missingState += 1;
        else counters.staleState += 1;

        const result =
          await this.aiIndexingService.enqueueWithNextSourceVersionIfNeeded(
            {
              aggregateType: AiIndexAggregateType.JOB,
              aggregateId: projection.job._id,
              operation: AiIndexOutboxOperation.UPSERT,
            },
            undefined,
            { force: true },
          );
        if (result.enqueued) counters.upsertEnqueued += 1;
        else counters.upsertSkipped += 1;
        continue;
      }

      counters.inactive += 1;
      this.recordDisposition(counters, disposition);
      // A missing state still needs a DELETE: the durable state may have been
      // lost while a Qdrant point survived. The AI delete endpoint is idempotent.
      if (state?.status === AiJobIndexStateStatus.DELETED) continue;
      const result =
        await this.aiIndexingService.enqueueWithNextSourceVersionIfNeeded(
          {
            aggregateType: AiIndexAggregateType.JOB,
            aggregateId: projection.job._id,
            operation: AiIndexOutboxOperation.DELETE,
          },
          undefined,
          {
            // A missing state plus an already-successful DELETE is already
            // converged from PostgreSQL's perspective. Force only when a
            // known non-deleted state says cleanup is still required.
            force: Boolean(state),
          },
        );
      if (result.enqueued) counters.deleteEnqueued += 1;
      else counters.deleteSkipped += 1;
    }

    return {
      ...counters,
      environment,
      cursor: page.nextCursor,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
      orphanDetection: 'NOT_PERFORMED_REQUIRES_AI_SCAN',
    };
  }

  /** Runs all bounded pages while keeping one deterministic reconciliation clock. */
  async reconcileAll(
    options: AiIndexReconcileOptions = {},
  ): Promise<AiIndexReconcileResult> {
    const now = options.now ?? new Date();
    const environment = this.resolveEnvironment(options.environment);
    const counters = emptyReconcileCounters();
    let cursor = options.cursor ?? null;
    let hasMore = true;

    while (hasMore) {
      const page = await this.projectionService.scanJobs(
        cursor,
        boundedBatchSize(options.limit),
        now,
      );
      const result = await this.reconcilePage(page, { now, environment });
      addReconcileCounters(counters, result);
      cursor = page.nextCursor;
      hasMore = page.hasMore;
      if (hasMore && !cursor) {
        throw new Error('AI_INDEX_RECONCILE_CURSOR_INVALID: page did not advance');
      }
    }

    return {
      ...counters,
      environment,
      cursor,
      nextCursor: cursor,
      hasMore: false,
      orphanDetection: 'NOT_PERFORMED_REQUIRES_AI_SCAN',
    };
  }

  private async loadStates(
    jobIds: string[],
    environment: string,
  ): Promise<Map<string, AiJobIndexState>> {
    if (jobIds.length === 0) return new Map();
    const rows = await this.stateRepository.find({
      where: { environment, jobId: In(jobIds) },
    });
    return new Map(rows.map((state) => [state.jobId, state]));
  }

  private isCurrentState(
    state: AiJobIndexState,
    snapshot: NonNullable<CanonicalJobScanPage['jobs'][number]['snapshot']>,
    expected: ExpectedRepresentation,
  ): boolean {
    if (state.status !== AiJobIndexStateStatus.INDEXED) return false;
    const sourceVersion = parseSafeSourceVersion(state.sourceVersion);
    if (sourceVersion === null) return false;
    if (
      !state.contentHash ||
      state.contentHash.toLowerCase() !== computeCanonicalContentHash(snapshot)
    ) {
      return false;
    }

    const versions = resolveRepresentationVersions(state, expected);
    return Boolean(
      versions &&
        representationMatchesExpected(state, expected) &&
        state.metadataHash &&
        state.metadataHash.toLowerCase() ===
          computeCanonicalMetadataHash(snapshot, sourceVersion, versions),
    );
  }

  private readConfiguredRepresentation(): ExpectedRepresentation {
    const getText = (key: string): string | undefined => {
      const value = this.configService.get<string>(key);
      return typeof value === 'string' && value.trim() ? value.trim() : undefined;
    };
    const rawDimensions = this.configService.get('AI_INDEX_EMBEDDING_DIMENSIONS');
    const dimensions =
      rawDimensions === undefined || rawDimensions === null || rawDimensions === ''
        ? undefined
        : Number(rawDimensions);
    if (
      dimensions !== undefined &&
      (!Number.isSafeInteger(dimensions) || dimensions < 1 || dimensions > 4096)
    ) {
      throw new Error(
        'AI_INDEX_EMBEDDING_DIMENSIONS must be an integer between 1 and 4096',
      );
    }

    return {
      embeddingProvider: getText('AI_INDEX_EMBEDDING_PROVIDER'),
      embeddingModelVersion: getText('AI_INDEX_EMBEDDING_MODEL_VERSION'),
      embeddingDimensions: dimensions,
      normalizationVersion: getText('AI_INDEX_NORMALIZATION_VERSION'),
      chunkingVersion: getText('AI_INDEX_CHUNKING_VERSION'),
      indexSchemaVersion: getText('AI_INDEX_SCHEMA_VERSION'),
      collectionName: getText('AI_INDEX_COLLECTION_NAME'),
      collectionVersion: getText('AI_INDEX_COLLECTION_VERSION'),
    };
  }

  private resolveEnvironment(value?: string): string {
    const configured =
      value ?? this.configService.get<string>('AI_INDEX_ENVIRONMENT', 'local');
    const environment = String(configured ?? '').trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,31}$/.test(environment)) {
      throw new Error(
        'AI_INDEX_ENVIRONMENT must contain 1 to 32 safe characters',
      );
    }
    return environment;
  }

  private recordDisposition(
    counters: AiIndexReconcileCounters,
    disposition: CanonicalJobDisposition,
  ): void {
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

function parseSafeSourceVersion(value: string | number | bigint): number | null {
  try {
    const parsed = BigInt(value);
    if (parsed < 1n || parsed > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return Number(parsed);
  } catch {
    return null;
  }
}

function resolveRepresentationVersions(
  state: AiJobIndexState,
  expected: ExpectedRepresentation,
): IndexRepresentationVersions | null {
  const embeddingModelVersion =
    expected.embeddingModelVersion ?? state.embeddingModelVersion;
  const embeddingDimensions =
    expected.embeddingDimensions ?? state.embeddingDimensions;
  const normalizationVersion =
    expected.normalizationVersion ?? state.normalizationVersion;
  const chunkingVersion = expected.chunkingVersion ?? state.chunkingVersion;
  const indexSchemaVersion =
    expected.indexSchemaVersion ?? state.indexSchemaVersion;

  if (
    !embeddingModelVersion ||
    !Number.isSafeInteger(embeddingDimensions) ||
    !normalizationVersion ||
    !chunkingVersion ||
    !indexSchemaVersion
  ) {
    return null;
  }
  return {
    embeddingModelVersion,
    embeddingDimensions,
    normalizationVersion,
    chunkingVersion,
    indexSchemaVersion,
  };
}

function representationMatchesExpected(
  state: AiJobIndexState,
  expected: ExpectedRepresentation,
): boolean {
  return (
    (!expected.embeddingProvider ||
      state.embeddingProvider === expected.embeddingProvider) &&
    (!expected.embeddingModelVersion ||
      state.embeddingModelVersion === expected.embeddingModelVersion) &&
    (expected.embeddingDimensions === undefined ||
      state.embeddingDimensions === expected.embeddingDimensions) &&
    (!expected.normalizationVersion ||
      state.normalizationVersion === expected.normalizationVersion) &&
    (!expected.chunkingVersion ||
      state.chunkingVersion === expected.chunkingVersion) &&
    (!expected.indexSchemaVersion ||
      state.indexSchemaVersion === expected.indexSchemaVersion) &&
    (!expected.collectionName || state.collectionName === expected.collectionName) &&
    (!expected.collectionVersion ||
      state.collectionVersion === expected.collectionVersion)
  );
}

function emptyReconcileCounters(): AiIndexReconcileCounters {
  return {
    scanned: 0,
    active: 0,
    inactive: 0,
    missingState: 0,
    staleState: 0,
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
    orphanPointsChecked: 0,
  };
}

function addReconcileCounters(
  target: AiIndexReconcileCounters,
  source: AiIndexReconcileCounters,
): void {
  for (const key of Object.keys(target) as Array<keyof AiIndexReconcileCounters>) {
    target[key] += source[key];
  }
}
