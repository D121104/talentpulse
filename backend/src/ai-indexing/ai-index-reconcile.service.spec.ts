import { ConfigService } from '@nestjs/config';
import { IndexPointMetadata } from '../ai-client/contracts/indexing.contracts';
import { AiJobIndexStateStatus } from './entities/ai-job-index-state.entity';
import {
  computeCanonicalContentHash,
  computeCanonicalMetadataHash,
} from './services/index-representation';

import {
  AiIndexReconcileService,
  createQdrantScanOperationAttemptId,
} from './services/ai-index-reconcile.service';

const SCAN_RUN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const QDRANT_CURSOR = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const JOB_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_ID = '22222222-2222-4222-8222-222222222222';
const POINT_ID = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-08-28T12:00:00.000Z');

const VERSIONS = {
  embeddingModelVersion: 'model-v1',
  embeddingDimensions: 1024,
  normalizationVersion: 'normalization-v1',
  chunkingVersion: 'chunking-v1',
  indexSchemaVersion: 'schema-v1',
};

function activeProjection() {
  const snapshot = {
    job_id: JOB_ID,
    title: 'Backend Engineer',
    description: 'Build APIs',
    skills: ['TypeScript', 'NestJS'],
    company_id: COMPANY_ID,
    company_name: 'Acme Labs',
    is_active: true,
    is_deleted: false,
    company_is_active: true,
    company_is_deleted: false,
    start_date: '2026-08-01T00:00:00.000Z',
    end_date: '2026-09-30T00:00:00.000Z',
  };
  return {
    job: {
      _id: JOB_ID,
      isActive: true,
      isDeleted: false,
      deletedAt: null,
      startDate: new Date(snapshot.start_date),
      endDate: new Date(snapshot.end_date),
      company: { _id: COMPANY_ID },
    },
    company: {
      _id: COMPANY_ID,
      isActive: true,
      isDeleted: false,
      deletedAt: null,
    },
    snapshot,
    isCanonicalActive: true,
  };
}

function scanPoint(
  collection = { name: 'jobs_current', version: 'collection-v1' },
): IndexPointMetadata {
  const snapshot = activeProjection().snapshot;
  return {
    point_id: POINT_ID,
    job_id: JOB_ID,
    company_id: COMPANY_ID,
    source_version: 7,
    content_hash: computeCanonicalContentHash(snapshot),
    metadata_hash: computeCanonicalMetadataHash(snapshot, 7, VERSIONS),
    embedding_provider: 'local',
    embedding_model_version: VERSIONS.embeddingModelVersion,
    embedding_dimensions: VERSIONS.embeddingDimensions,
    normalization_version: VERSIONS.normalizationVersion,
    chunking_version: VERSIONS.chunkingVersion,
    index_schema_version: VERSIONS.indexSchemaVersion,
    collection_name: collection.name,
    collection_version: collection.version,
  };
}

function indexedState(
  collection = { name: 'jobs_current', version: 'collection-v1' },
) {
  return {
    jobId: JOB_ID,
    sourceVersion: '7',
    status: AiJobIndexStateStatus.INDEXED,
    contentHash: computeCanonicalContentHash(activeProjection().snapshot),
    metadataHash: computeCanonicalMetadataHash(
      activeProjection().snapshot,
      7,
      VERSIONS,
    ),
    embeddingProvider: 'local',
    embeddingModelVersion: VERSIONS.embeddingModelVersion,
    embeddingDimensions: VERSIONS.embeddingDimensions,
    normalizationVersion: VERSIONS.normalizationVersion,
    chunkingVersion: VERSIONS.chunkingVersion,
    indexSchemaVersion: VERSIONS.indexSchemaVersion,
    collectionName: collection.name,
    collectionVersion: collection.version,
    indexedPointIds: [POINT_ID],
  };
}

function configuredValues(
  values: Record<string, string | number>,
): ConfigService {
  return {
    get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
  } as never;
}

function configValues(): ConfigService {
  return {
    get: jest.fn((key: string, fallback?: unknown) => {
      if (key === 'AI_INDEX_ENVIRONMENT') return 'test';
      if (key === 'AI_INDEX_OUTBOX_ENVIRONMENT') return 'test';
      return fallback;
    }),
  } as never;
}

describe('AiIndexReconcileService Qdrant scan representation', () => {
  const expectedConfig = {
    AI_INDEX_EMBEDDING_PROVIDER: 'local',
    AI_INDEX_EMBEDDING_MODEL_VERSION: VERSIONS.embeddingModelVersion,
    AI_INDEX_EMBEDDING_DIMENSIONS: VERSIONS.embeddingDimensions,
    AI_INDEX_NORMALIZATION_VERSION: VERSIONS.normalizationVersion,
    AI_INDEX_CHUNKING_VERSION: VERSIONS.chunkingVersion,
    AI_INDEX_SCHEMA_VERSION: VERSIONS.indexSchemaVersion,
    AI_INDEX_COLLECTION_NAME: 'jobs_current',
    AI_INDEX_COLLECTION_VERSION: 'collection-v1',
    AI_INDEX_ENVIRONMENT: 'test',
    AI_INDEX_OUTBOX_ENVIRONMENT: 'test',
  };

  function createReconcileHarness(
    point = scanPoint(),
    config: Record<string, string | number> = expectedConfig,
  ) {
    const state = indexedState();
    const enqueueWithNextSourceVersionIfNeeded = jest
      .fn()
      .mockResolvedValue({ enqueued: true });
    const service = new AiIndexReconcileService(
      { find: jest.fn().mockResolvedValue([state]) } as never,
      {
        loadCanonicalJob: jest.fn().mockResolvedValue(activeProjection()),
      } as never,
      { enqueueWithNextSourceVersionIfNeeded } as never,
      configuredValues(config),
      {
        scanIndexPoints: jest.fn().mockResolvedValue({
          points: [point],
          next_cursor: null,
          request_id: SCAN_RUN_ID,
        }),
      } as never,
    );
    return { service, enqueueWithNextSourceVersionIfNeeded };
  }

  it('repairs a point whose configured collection metadata differs', async () => {
    const harness = createReconcileHarness(
      scanPoint({ name: 'jobs_previous', version: 'collection-v1' }),
    );

    await expect(
      harness.service.reconcileQdrantPage({
        environment: 'test',
        now: NOW,
        scanRunId: SCAN_RUN_ID,
      }),
    ).resolves.toMatchObject({
      representationMismatch: 1,
      upsertEnqueued: 1,
    });
    expect(harness.enqueueWithNextSourceVersionIfNeeded).toHaveBeenCalledWith(
      expect.objectContaining({ aggregateId: JOB_ID, operation: 'UPSERT' }),
      undefined,
      { force: true },
    );
  });

  it('repairs a point missing configured collection metadata', async () => {
    const point = scanPoint();
    delete point.collection_name;
    const harness = createReconcileHarness(point);

    await expect(
      harness.service.reconcileQdrantPage({
        environment: 'test',
        now: NOW,
        scanRunId: SCAN_RUN_ID,
      }),
    ).resolves.toMatchObject({
      representationMismatch: 1,
      upsertEnqueued: 1,
    });
  });

  it('preserves legacy behavior when collection expectations are unset', async () => {
    const point = scanPoint();
    delete point.collection_name;
    delete point.collection_version;
    const legacyConfig = { ...expectedConfig };
    delete legacyConfig.AI_INDEX_COLLECTION_NAME;
    delete legacyConfig.AI_INDEX_COLLECTION_VERSION;
    const harness = createReconcileHarness(point, legacyConfig);

    await expect(
      harness.service.reconcileQdrantPage({
        environment: 'test',
        now: NOW,
        scanRunId: SCAN_RUN_ID,
      }),
    ).resolves.toMatchObject({
      representationMismatch: 0,
      upsertEnqueued: 0,
    });
    expect(harness.enqueueWithNextSourceVersionIfNeeded).not.toHaveBeenCalled();
  });

  it('accepts valid configured collection metadata without a repair', async () => {
    const harness = createReconcileHarness();

    await expect(
      harness.service.reconcileQdrantPage({
        environment: 'test',
        now: NOW,
        scanRunId: SCAN_RUN_ID,
      }),
    ).resolves.toMatchObject({
      representationMismatch: 0,
      upsertEnqueued: 0,
    });
    expect(harness.enqueueWithNextSourceVersionIfNeeded).not.toHaveBeenCalled();
  });
});

describe('AiIndexReconcileService Qdrant scan context', () => {
  it('passes stable run and page audit context without cursor data', async () => {
    const scanIndexPoints = jest
      .fn()
      .mockResolvedValueOnce({
        points: [],
        next_cursor: QDRANT_CURSOR,
        request_id: SCAN_RUN_ID,
      })
      .mockResolvedValueOnce({
        points: [],
        next_cursor: null,
        request_id: SCAN_RUN_ID,
      });
    const projection = {
      scanJobs: jest.fn().mockResolvedValue({
        jobs: [],
        nextCursor: null,
        hasMore: false,
      }),
    };
    const service = new AiIndexReconcileService(
      { find: jest.fn().mockResolvedValue([]) } as never,
      projection as never,
      {} as never,
      configValues(),
      { scanIndexPoints } as never,
    );

    await expect(
      service.reconcileQdrantAll({
        environment: 'test',
        limit: 2,
        now: new Date('2026-08-28T12:00:00.000Z'),
        scanRunId: SCAN_RUN_ID,
      }),
    ).resolves.toMatchObject({
      orphanDetection: 'COMPLETED',
      orphanPointsChecked: 0,
    });

    expect(scanIndexPoints).toHaveBeenNthCalledWith(
      1,
      { cursor: null, limit: 2 },
      {
        requestId: SCAN_RUN_ID,
        operationAttemptId: createQdrantScanOperationAttemptId(SCAN_RUN_ID, 0),
        attemptNumber: 1,
      },
    );
    expect(scanIndexPoints).toHaveBeenNthCalledWith(
      2,
      { cursor: QDRANT_CURSOR, limit: 2 },
      {
        requestId: SCAN_RUN_ID,
        operationAttemptId: createQdrantScanOperationAttemptId(SCAN_RUN_ID, 1),
        attemptNumber: 1,
      },
    );
    for (const [, options] of scanIndexPoints.mock.calls) {
      expect(options).not.toHaveProperty('outboxId');
      expect(options).not.toHaveProperty('jobId');
      expect(options).not.toHaveProperty('cursor');
      expect(options).not.toHaveProperty('rawData');
      expect(options).not.toHaveProperty('traceId');
    }
  });
});
