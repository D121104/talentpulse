import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveAiIndexEnvironment } from '../../config/ai-index-environment';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { validate as isUuid, v5 as uuidv5 } from 'uuid';
import { In, Repository } from 'typeorm';
import { AiServiceClient } from '../../ai-client/ai-client.service';
import {
  IndexMetadataScanResponse,
  IndexPointMetadata,
  MAX_INDEX_SCAN_LIMIT,
} from '../../ai-client/contracts/indexing.contracts';
import {
  AiServiceError,
  AiServiceErrorCode,
} from '../../ai-client/ai-client.errors';
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
  CanonicalJobProjection,
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
import {
  AiIndexBackfillOptions,
  boundedBatchSize,
} from './ai-index-backfill.service';

export interface AiIndexReconcileOptions extends AiIndexBackfillOptions {
  environment?: string;
  /** Stable UUID supplied when a Qdrant scan run is resumed. */
  scanRunId?: string;
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
  /** Number of Qdrant metadata points examined by an AI-backed scan. */
  orphanPointsChecked: number;
  orphanPoints: number;
  missingPoints: number;
  staleSource: number;
  representationMismatch: number;
  extraChunks: number;
}

export type AiIndexOrphanDetectionStatus =
  | 'NOT_PERFORMED_REQUIRES_AI_SCAN'
  | 'IN_PROGRESS'
  | 'COMPLETED';

export interface AiIndexReconcileResult extends AiIndexReconcileCounters {
  environment: string;
  cursor: string | null;
  nextCursor: string | null;
  hasMore: boolean;
  /** Qdrant orphan detection is completed only after the metadata scan ends. */
  orphanDetection: AiIndexOrphanDetectionStatus;
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

type AiIndexScanClient = Pick<AiServiceClient, 'scanIndexPoints'>;

interface QdrantReconcileContext {
  scheduledUpserts: Set<string>;
  scheduledDeletes: Set<string>;
  lifecycleJobs: Set<string>;
  missingStateJobs: Set<string>;
  staleStateJobs: Set<string>;
  seenPointIdsByJob: Map<string, Set<string>>;
}

interface QdrantScanCallOptions {
  requestId: string;
  operationAttemptId: string;
  attemptNumber: number;
}

const QDRANT_SCAN_OPERATION_NAMESPACE = uuidv5(
  'https://talentpulse.ai/indexing/reconcile-qdrant-scan',
  uuidv5.URL,
);

/**
 * PostgreSQL reconciliation plus an explicit, protected Qdrant metadata scan.
 *
 * PostgreSQL remains canonical. The AI scan is metadata-only and is used only
 * to prove facts about points that are actually present (or absent after a
 * complete scan); index state alone is never treated as proof that a point is
 * present or missing.
 */
@Injectable()
export class AiIndexReconcileService {
  constructor(
    @InjectRepository(AiJobIndexState)
    private readonly stateRepository: Repository<AiJobIndexState>,
    private readonly projectionService: CanonicalJobProjectionService,
    private readonly aiIndexingService: AiIndexingService,
    @Optional()
    @Inject(ConfigService)
    private readonly configService: ConfigService = new ConfigService(),
    @Optional()
    @Inject(AiServiceClient)
    private readonly aiServiceClient?: AiIndexScanClient,
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
        const repairNeeded =
          !state || !this.isCurrentState(state, projection.snapshot, expected);
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

  /** Runs all bounded canonical pages while keeping one deterministic clock. */
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
        throw new Error(
          'AI_INDEX_RECONCILE_CURSOR_INVALID: page did not advance',
        );
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

  /**
   * Reconciles one metadata-only Qdrant page. This method deliberately does
   * not classify canonical jobs with no point: that requires a full scan.
   */
  async reconcileQdrantPage(
    options: AiIndexReconcileOptions = {},
  ): Promise<AiIndexReconcileResult> {
    const now = options.now ?? new Date();
    const environment = this.resolveEnvironment(options.environment);
    const cursor = options.cursor ?? null;
    const scanRunId = resolveQdrantScanRunId(options.scanRunId);
    const response = await this.scanQdrantPage(
      cursor,
      boundedQdrantScanLimit(options.limit),
      createQdrantScanCallOptions(scanRunId, 0),
    );
    const counters = emptyReconcileCounters();
    const context = createQdrantReconcileContext();
    const expected = this.readConfiguredRepresentation();
    await this.reconcileQdrantScanPage(
      response,
      { now, environment },
      expected,
      counters,
      context,
    );

    const nextCursor = response.next_cursor ?? null;
    assertQdrantCursorAdvanced(cursor, nextCursor);
    return {
      ...counters,
      environment,
      cursor: nextCursor,
      nextCursor,
      hasMore: nextCursor !== null,
      orphanDetection:
        cursor === null && nextCursor === null ? 'COMPLETED' : 'IN_PROGRESS',
    };
  }

  /**
   * Runs the complete bounded Qdrant scan and then a bounded canonical scan.
   * The second pass is what proves a canonical active job (or expected chunk)
   * is missing; a partial Qdrant scan never reports that classification.
   */
  async reconcileQdrantAll(
    options: AiIndexReconcileOptions = {},
  ): Promise<AiIndexReconcileResult> {
    const now = options.now ?? new Date();
    const environment = this.resolveEnvironment(options.environment);
    const counters = emptyReconcileCounters();
    const context = createQdrantReconcileContext();
    const expected = this.readConfiguredRepresentation();
    const scanLimit = boundedQdrantScanLimit(options.limit);
    const canonicalLimit = boundedBatchSize(options.limit);
    const startedAtBeginning = (options.cursor ?? null) === null;
    const scanRunId = resolveQdrantScanRunId(options.scanRunId);
    let cursor = options.cursor ?? null;
    let pageNumber = 0;
    let hasMore = true;

    while (hasMore) {
      const response = await this.scanQdrantPage(
        cursor,
        scanLimit,
        createQdrantScanCallOptions(scanRunId, pageNumber),
      );
      pageNumber += 1;
      await this.reconcileQdrantScanPage(
        response,
        { now, environment },
        expected,
        counters,
        context,
      );
      const nextCursor = response.next_cursor ?? null;
      assertQdrantCursorAdvanced(cursor, nextCursor);
      cursor = nextCursor;
      hasMore = nextCursor !== null;
    }

    // Starting from a non-null Qdrant cursor only proves the suffix of the
    // collection. Do not claim missing-point detection for that partial run.
    if (startedAtBeginning) {
      await this.reconcileCanonicalAgainstQdrant(
        now,
        environment,
        canonicalLimit,
        expected,
        counters,
        context,
      );
    }

    return {
      ...counters,
      environment,
      cursor: null,
      nextCursor: null,
      hasMore: false,
      orphanDetection: startedAtBeginning ? 'COMPLETED' : 'IN_PROGRESS',
    };
  }

  private async reconcileQdrantScanPage(
    response: IndexMetadataScanResponse,
    options: { now: Date; environment: string },
    expected: ExpectedRepresentation,
    counters: AiIndexReconcileCounters,
    context: QdrantReconcileContext,
  ): Promise<void> {
    const jobIds = [...new Set(response.points.map((point) => point.job_id))];
    const states = await this.loadStates(jobIds, options.environment);
    const projections = await this.loadCanonicalProjections(
      jobIds,
      options.now,
    );

    counters.scanned += response.points.length;
    counters.orphanPointsChecked += response.points.length;
    for (const point of response.points) {
      const pointIds =
        context.seenPointIdsByJob.get(point.job_id) ?? new Set<string>();
      pointIds.add(point.point_id);
      context.seenPointIdsByJob.set(point.job_id, pointIds);

      await this.reconcileQdrantPoint(
        point,
        projections.get(point.job_id) ?? null,
        states.get(point.job_id),
        options.now,
        expected,
        counters,
        context,
      );
    }
  }

  private async reconcileQdrantPoint(
    point: IndexPointMetadata,
    projection: CanonicalJobProjection | null,
    state: AiJobIndexState | undefined,
    now: Date,
    expected: ExpectedRepresentation,
    counters: AiIndexReconcileCounters,
    context: QdrantReconcileContext,
  ): Promise<void> {
    if (
      !projection ||
      projection.job._id.toLowerCase() !== point.job_id.toLowerCase()
    ) {
      counters.orphanPoints += 1;
      await this.enqueueRepair(
        point.job_id,
        AiIndexOutboxOperation.DELETE,
        counters,
        context,
      );
      return;
    }

    const disposition = classifyCanonicalJob(projection, now);
    const active = disposition === 'ACTIVE' && Boolean(projection.snapshot);
    if (!context.lifecycleJobs.has(point.job_id)) {
      context.lifecycleJobs.add(point.job_id);
      if (active) counters.active += 1;
      else {
        counters.inactive += 1;
        this.recordDisposition(counters, disposition);
      }
    }

    if (!active) {
      await this.enqueueRepair(
        point.job_id,
        AiIndexOutboxOperation.DELETE,
        counters,
        context,
      );
      return;
    }

    const sourceVersion = parseSafeSourceVersion(state?.sourceVersion);
    const sourceDrift = Boolean(
      state &&
        (sourceVersion === null || sourceVersion !== point.source_version),
    );
    if (sourceVersion !== null && point.source_version < sourceVersion) {
      counters.staleSource += 1;
    } else if (sourceDrift) {
      countOnce(context.staleStateJobs, point.job_id, counters, 'staleState');
    }

    const expectedPointIds =
      state?.status === AiJobIndexStateStatus.INDEXED
        ? state.indexedPointIds ?? []
        : [];
    const extraChunk =
      state?.status === AiJobIndexStateStatus.INDEXED &&
      !expectedPointIds.some(
        (pointId) => pointId.toLowerCase() === point.point_id.toLowerCase(),
      );
    if (extraChunk) counters.extraChunks += 1;

    const pointRepresentationMismatch = !pointMatchesCanonicalRepresentation(
      point,
      projection.snapshot,
      expected,
    );
    if (pointRepresentationMismatch) counters.representationMismatch += 1;

    const stateRepresentationMismatch =
      state?.status === AiJobIndexStateStatus.INDEXED &&
      (!stateMatchesPoint(state, point) ||
        !representationMatchesExpected(state, expected));
    if (stateRepresentationMismatch) {
      countOnce(context.staleStateJobs, point.job_id, counters, 'staleState');
    }

    const needsRepair =
      !state ||
      state.status !== AiJobIndexStateStatus.INDEXED ||
      sourceDrift ||
      extraChunk ||
      pointRepresentationMismatch ||
      stateRepresentationMismatch;
    if (!needsRepair) return;

    if (!state) {
      countOnce(
        context.missingStateJobs,
        point.job_id,
        counters,
        'missingState',
      );
    }
    await this.enqueueRepair(
      point.job_id,
      AiIndexOutboxOperation.UPSERT,
      counters,
      context,
    );
  }

  private async reconcileCanonicalAgainstQdrant(
    now: Date,
    environment: string,
    limit: number,
    expected: ExpectedRepresentation,
    counters: AiIndexReconcileCounters,
    context: QdrantReconcileContext,
  ): Promise<void> {
    let cursor: string | null = null;
    let hasMore = true;
    while (hasMore) {
      const page = await this.projectionService.scanJobs(cursor, limit, now);
      const states = await this.loadStates(
        page.jobs.map((projection) => projection.job._id),
        environment,
      );
      for (const projection of page.jobs) {
        await this.reconcileCanonicalJobAfterFullQdrantScan(
          projection,
          states.get(projection.job._id),
          now,
          counters,
          context,
        );
      }

      const nextCursor = page.nextCursor ?? null;
      if (page.hasMore && (!nextCursor || nextCursor === cursor)) {
        throw new Error(
          'AI_INDEX_RECONCILE_CURSOR_INVALID: canonical page did not advance',
        );
      }
      cursor = nextCursor;
      hasMore = page.hasMore;
    }
  }

  private async reconcileCanonicalJobAfterFullQdrantScan(
    projection: CanonicalJobProjection,
    state: AiJobIndexState | undefined,
    now: Date,
    counters: AiIndexReconcileCounters,
    context: QdrantReconcileContext,
  ): Promise<void> {
    const jobId = projection.job._id;
    const disposition = classifyCanonicalJob(projection, now);
    const active = disposition === 'ACTIVE' && Boolean(projection.snapshot);
    if (!context.lifecycleJobs.has(jobId)) {
      context.lifecycleJobs.add(jobId);
      if (active) counters.active += 1;
      else {
        counters.inactive += 1;
        this.recordDisposition(counters, disposition);
      }
    }
    if (!active) return;

    const seenPointIds = context.seenPointIdsByJob.get(jobId);
    const expectedPointIds =
      state?.status === AiJobIndexStateStatus.INDEXED
        ? state.indexedPointIds ?? []
        : [];
    const normalizedSeenPointIds = seenPointIds
      ? new Set([...seenPointIds].map((pointId) => pointId.toLowerCase()))
      : undefined;
    const missingExpectedPointCount = expectedPointIds.filter(
      (pointId) => !normalizedSeenPointIds?.has(pointId.toLowerCase()),
    ).length;
    const missingPointCount = seenPointIds
      ? missingExpectedPointCount
      : Math.max(expectedPointIds.length, 1);

    if (missingPointCount === 0) return;
    counters.missingPoints += missingPointCount;
    if (!state) {
      countOnce(context.missingStateJobs, jobId, counters, 'missingState');
    } else if (state.status !== AiJobIndexStateStatus.INDEXED) {
      countOnce(context.staleStateJobs, jobId, counters, 'staleState');
    }
    // The complete Qdrant scan proved that the expected point(s) are absent;
    // enqueueing a canonical UPSERT is therefore safe and idempotent.
    await this.enqueueRepair(
      jobId,
      AiIndexOutboxOperation.UPSERT,
      counters,
      context,
    );
  }

  private async enqueueRepair(
    jobId: string,
    operation: AiIndexOutboxOperation.UPSERT | AiIndexOutboxOperation.DELETE,
    counters: AiIndexReconcileCounters,
    context: QdrantReconcileContext,
  ): Promise<void> {
    const scheduled =
      operation === AiIndexOutboxOperation.UPSERT
        ? context.scheduledUpserts
        : context.scheduledDeletes;
    if (scheduled.has(jobId)) return;
    scheduled.add(jobId);

    const result =
      await this.aiIndexingService.enqueueWithNextSourceVersionIfNeeded(
        {
          aggregateType: AiIndexAggregateType.JOB,
          aggregateId: jobId,
          operation,
        },
        undefined,
        { force: true },
      );
    if (operation === AiIndexOutboxOperation.UPSERT) {
      if (result.enqueued) counters.upsertEnqueued += 1;
      else counters.upsertSkipped += 1;
    } else if (result.enqueued) {
      counters.deleteEnqueued += 1;
    } else {
      counters.deleteSkipped += 1;
    }
  }

  private async scanQdrantPage(
    cursor: string | null,
    limit: number,
    options: QdrantScanCallOptions,
  ): Promise<IndexMetadataScanResponse> {
    const client = this.requireAiIndexScanClient();
    return client.scanIndexPoints({ cursor, limit }, options);
  }

  private requireAiIndexScanClient(): AiIndexScanClient {
    if (!this.aiServiceClient) {
      throw new AiServiceError(
        AiServiceErrorCode.AI_CLIENT_NOT_CONFIGURED,
        'AI index metadata scan client is not configured',
        503,
        false,
      );
    }
    return this.aiServiceClient;
  }

  private async loadCanonicalProjections(
    jobIds: string[],
    now: Date,
  ): Promise<Map<string, CanonicalJobProjection | null>> {
    const entries = await Promise.all(
      jobIds.map(async (jobId) => {
        const projection = await this.loadCanonicalJob(jobId, now);
        return [jobId, projection] as const;
      }),
    );
    return new Map(entries);
  }

  private async loadCanonicalJob(
    jobId: string,
    now: Date,
  ): Promise<CanonicalJobProjection | null> {
    const service = this.projectionService as CanonicalJobProjectionService & {
      loadCanonicalJob?: CanonicalJobProjectionService['loadCanonicalJob'];
    };
    if (typeof service.loadCanonicalJob === 'function') {
      return service.loadCanonicalJob(jobId, now, { withDeleted: true });
    }
    return service.projectJob(jobId, now, { withDeleted: true });
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
      return typeof value === 'string' && value.trim()
        ? value.trim()
        : undefined;
    };
    const rawDimensions = this.configService.get(
      'AI_INDEX_EMBEDDING_DIMENSIONS',
    );
    const dimensions =
      rawDimensions === undefined ||
      rawDimensions === null ||
      rawDimensions === ''
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
    return resolveAiIndexEnvironment(this.configService, value);
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

function parseSafeSourceVersion(
  value: string | number | bigint | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
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
    (!expected.collectionName ||
      state.collectionName === expected.collectionName) &&
    (!expected.collectionVersion ||
      state.collectionVersion === expected.collectionVersion)
  );
}

function pointMatchesCanonicalRepresentation(
  point: IndexPointMetadata,
  snapshot: NonNullable<CanonicalJobScanPage['jobs'][number]['snapshot']>,
  expected: ExpectedRepresentation,
): boolean {
  if (
    point.job_id.toLowerCase() !== snapshot.job_id.toLowerCase() ||
    point.company_id.toLowerCase() !== snapshot.company_id.toLowerCase() ||
    point.content_hash.toLowerCase() !== computeCanonicalContentHash(snapshot)
  ) {
    return false;
  }
  const versions: IndexRepresentationVersions = {
    embeddingModelVersion: point.embedding_model_version,
    embeddingDimensions: point.embedding_dimensions,
    normalizationVersion: point.normalization_version,
    chunkingVersion: point.chunking_version,
    indexSchemaVersion: point.index_schema_version,
  };
  if (
    !point.metadata_hash ||
    point.metadata_hash.toLowerCase() !==
      computeCanonicalMetadataHash(snapshot, point.source_version, versions)
  ) {
    return false;
  }
  if (
    expected.embeddingProvider !== undefined &&
    point.embedding_provider !== expected.embeddingProvider
  ) {
    return false;
  }
  if (
    expected.embeddingModelVersion !== undefined &&
    point.embedding_model_version !== expected.embeddingModelVersion
  ) {
    return false;
  }
  if (
    expected.embeddingDimensions !== undefined &&
    point.embedding_dimensions !== expected.embeddingDimensions
  ) {
    return false;
  }
  if (
    expected.normalizationVersion !== undefined &&
    point.normalization_version !== expected.normalizationVersion
  ) {
    return false;
  }
  if (
    expected.chunkingVersion !== undefined &&
    point.chunking_version !== expected.chunkingVersion
  ) {
    return false;
  }
  if (
    expected.indexSchemaVersion !== undefined &&
    point.index_schema_version !== expected.indexSchemaVersion
  ) {
    return false;
  }
  if (
    expected.collectionName !== undefined &&
    point.collection_name !== expected.collectionName
  ) {
    return false;
  }
  if (
    expected.collectionVersion !== undefined &&
    point.collection_version !== expected.collectionVersion
  ) {
    return false;
  }
  return true;
}

function stateMatchesPoint(
  state: AiJobIndexState,
  point: IndexPointMetadata,
): boolean {
  return (
    parseSafeSourceVersion(state.sourceVersion) === point.source_version &&
    state.contentHash?.toLowerCase() === point.content_hash.toLowerCase() &&
    (point.metadata_hash === undefined ||
      point.metadata_hash === null ||
      state.metadataHash?.toLowerCase() ===
        point.metadata_hash.toLowerCase()) &&
    (point.embedding_provider === undefined ||
      point.embedding_provider === null ||
      state.embeddingProvider === point.embedding_provider) &&
    state.embeddingModelVersion === point.embedding_model_version &&
    state.embeddingDimensions === point.embedding_dimensions &&
    state.normalizationVersion === point.normalization_version &&
    state.chunkingVersion === point.chunking_version &&
    state.indexSchemaVersion === point.index_schema_version
  );
}

function countOnce(
  seen: Set<string>,
  key: string,
  counters: AiIndexReconcileCounters,
  counter: 'missingState' | 'staleState',
): void {
  if (seen.has(key)) return;
  seen.add(key);
  counters[counter] += 1;
}

function createQdrantReconcileContext(): QdrantReconcileContext {
  return {
    scheduledUpserts: new Set(),
    scheduledDeletes: new Set(),
    lifecycleJobs: new Set(),
    missingStateJobs: new Set(),
    staleStateJobs: new Set(),
    seenPointIdsByJob: new Map(),
  };
}

export function createQdrantScanOperationAttemptId(
  scanRunId: string,
  pageNumber: number,
): string {
  if (!isUuid(scanRunId)) {
    throw new Error('AI_INDEX_QDRANT_SCAN_RUN_ID_INVALID: expected a UUID');
  }
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 0) {
    throw new Error(
      'AI_INDEX_QDRANT_SCAN_PAGE_INVALID: expected a non-negative safe integer',
    );
  }
  return uuidv5(
    `${scanRunId.toLowerCase()}:page:${pageNumber}`,
    QDRANT_SCAN_OPERATION_NAMESPACE,
  );
}

function resolveQdrantScanRunId(value?: string): string {
  const scanRunId = value ?? randomUUID();
  if (!isUuid(scanRunId)) {
    throw new Error('AI_INDEX_QDRANT_SCAN_RUN_ID_INVALID: expected a UUID');
  }
  return scanRunId.toLowerCase();
}

function createQdrantScanCallOptions(
  scanRunId: string,
  pageNumber: number,
): QdrantScanCallOptions {
  return {
    requestId: scanRunId,
    operationAttemptId: createQdrantScanOperationAttemptId(
      scanRunId,
      pageNumber,
    ),
    // Reconciliation has no outbox delivery. The page is the logical unit and
    // a caller retry creates a new provider/trace attempt for the same IDs.
    attemptNumber: 1,
  };
}

function boundedQdrantScanLimit(value: number | undefined): number {
  if (value === undefined) return Math.min(100, MAX_INDEX_SCAN_LIMIT);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(
      'AI_INDEX_QDRANT_SCAN_LIMIT must be a positive safe integer',
    );
  }
  return Math.min(value, MAX_INDEX_SCAN_LIMIT);
}

function assertQdrantCursorAdvanced(
  previous: string | null,
  next: string | null,
): void {
  if (next !== null && next === previous) {
    throw new AiServiceError(
      AiServiceErrorCode.AI_INVALID_MODEL_OUTPUT,
      'AI service metadata scan cursor did not advance',
      502,
      false,
    );
  }
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
    orphanPoints: 0,
    missingPoints: 0,
    staleSource: 0,
    representationMismatch: 0,
    extraChunks: 0,
  };
}

function addReconcileCounters(
  target: AiIndexReconcileCounters,
  source: AiIndexReconcileCounters,
): void {
  for (const key of Object.keys(target) as Array<
    keyof AiIndexReconcileCounters
  >) {
    target[key] += source[key];
  }
}
