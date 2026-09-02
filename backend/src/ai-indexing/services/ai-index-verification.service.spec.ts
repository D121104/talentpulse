import { AiServiceClient } from '../../ai-client/ai-client.service';
import {
  AiIndexAggregateType,
  AiIndexOutbox,
  AiIndexOutboxStatus,
} from '../entities/ai-index-outbox.entity';
import { Company } from '../../companies/entities/company.entity';
import { Job } from '../../jobs/entities/job.entity';
import { AiIndexVerificationService } from './ai-index-verification.service';

const OUTBOX_ID = '11111111-1111-4111-8111-111111111111';
const JOB_ID = '22222222-2222-4222-8222-222222222222';
const COMPANY_ID = '33333333-3333-4333-8333-333333333333';

function queryReturning(row: unknown) {
  return {
    withDeleted: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    setParameters: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue(row),
  };
}

function createHarness(
  overrides: { target?: unknown; eligibleCount?: string } = {},
) {
  const targetRow = Object.prototype.hasOwnProperty.call(overrides, 'target')
    ? overrides.target
    : {
        outbox_status: AiIndexOutboxStatus.FAILED,
        outbox_operation: 'UPSERT',
        source_version: '7',
        attempts: 2,
        max_attempts: 3,
        publisher_eligible: false,
      };
  const targetQuery = queryReturning(targetRow);
  const countQuery = queryReturning({
    eligible_count: overrides.eligibleCount ?? '4',
  });
  const outboxRepository = {
    createQueryBuilder: jest
      .fn()
      .mockReturnValueOnce(targetQuery)
      .mockReturnValueOnce(countQuery),
    save: jest.fn(),
    update: jest.fn(),
    insert: jest.fn(),
    delete: jest.fn(),
  };
  const scanIndexPoints = jest.fn().mockResolvedValue({
    points: [
      {
        point_id: '44444444-4444-4444-8444-444444444444',
        job_id: JOB_ID,
        company_id: COMPANY_ID,
        source_version: 7,
        content_hash: 'a'.repeat(64),
        metadata_hash: 'b'.repeat(64),
        embedding_provider: 'cohere',
        embedding_model_version: 'embed-v3',
        embedding_dimensions: 1024,
        normalization_version: 'v1',
        chunking_version: 'v2',
        index_schema_version: 'v3',
        collection_name: 'jobs-staging',
        collection_version: '2026-09',
      },
    ],
    next_cursor: null,
    request_id: '55555555-5555-4555-8555-555555555555',
  });
  const service = new AiIndexVerificationService(
    outboxRepository as never,
    { scanIndexPoints } as never,
  );
  return {
    service,
    targetQuery,
    countQuery,
    outboxRepository,
    scanIndexPoints,
  };
}

describe('AiIndexVerificationService', () => {
  it('uses SELECT-only exact canonical relationship queries and returns sanitized status', async () => {
    const harness = createHarness();

    await expect(
      harness.service.verify({
        outboxId: OUTBOX_ID,
        jobId: JOB_ID,
        companyId: COMPANY_ID,
      }),
    ).resolves.toEqual({
      target: {
        found: true,
        relationshipMatches: true,
        outboxStatus: 'FAILED',
        operation: 'UPSERT',
        sourceVersion: '7',
        attempts: 2,
        maxAttempts: 3,
        replayable: true,
        publisherEligible: false,
      },
      publisher: { eligibleCount: 4 },
      qdrant: { checked: false },
    });

    expect(harness.targetQuery.select).toHaveBeenCalled();
    expect(harness.targetQuery.innerJoin).toHaveBeenCalledWith(
      Job,
      'job',
      'job._id = outbox.aggregateId',
    );
    expect(harness.targetQuery.innerJoin).toHaveBeenCalledWith(
      Company,
      'company',
      "company._id::text = job.company->>'_id'",
    );
    expect(harness.targetQuery.andWhere).toHaveBeenCalledWith(
      'outbox.aggregateType = :aggregateType',
      { aggregateType: AiIndexAggregateType.JOB },
    );
    expect(harness.targetQuery.andWhere).toHaveBeenCalledWith(
      'job._id = :jobId',
      { jobId: JOB_ID },
    );
    expect(harness.targetQuery.andWhere).toHaveBeenCalledWith(
      'company._id = :companyId',
      { companyId: COMPANY_ID },
    );
    expect(harness.outboxRepository.save).not.toHaveBeenCalled();
    expect(harness.outboxRepository.update).not.toHaveBeenCalled();
    expect(harness.outboxRepository.insert).not.toHaveBeenCalled();
    expect(harness.outboxRepository.delete).not.toHaveBeenCalled();
  });

  it('returns only aggregate Qdrant metadata through the read-only client path', async () => {
    const harness = createHarness();

    const result = await harness.service.verify({
      outboxId: OUTBOX_ID,
      jobId: JOB_ID,
      companyId: COMPANY_ID,
      verifyQdrant: true,
      qdrantLimit: 10,
    });

    expect(harness.scanIndexPoints).toHaveBeenCalledWith(
      { job_id: JOB_ID, limit: 10 },
      { readOnly: true },
    );
    expect(result.qdrant).toEqual({
      checked: true,
      status: 'VERIFIED',
      pointCount: 1,
      hasMore: false,
      allPointsMatchTargetJob: true,
      allPointsMatchTargetCompany: true,
      sourceVersions: [7],
      collections: [{ name: 'jobs-staging', version: '2026-09' }],
      embeddingProviders: ['cohere'],
      embeddingModelVersions: ['embed-v3'],
      embeddingDimensions: [1024],
      normalizationVersions: ['v1'],
      chunkingVersions: ['v2'],
      indexSchemaVersions: ['v3'],
    });
    expect(JSON.stringify(result)).not.toContain(OUTBOX_ID);
    expect(JSON.stringify(result)).not.toContain(JOB_ID);
    expect(JSON.stringify(result)).not.toContain('point_id');
    expect(JSON.stringify(result)).not.toContain('content_hash');
  });

  it('fails closed without calling Qdrant when the exact canonical target is absent or mismatched', async () => {
    const harness = createHarness({ target: undefined });

    await expect(
      harness.service.verify({
        outboxId: OUTBOX_ID,
        jobId: JOB_ID,
        companyId: COMPANY_ID,
        verifyQdrant: true,
      }),
    ).rejects.toMatchObject({
      code: 'AI_INDEX_VERIFY_TARGET_NOT_FOUND_OR_MISMATCH',
    });
    expect(harness.scanIndexPoints).not.toHaveBeenCalled();
  });

  it('fails closed with a safe code when Qdrant verification is unavailable', async () => {
    const harness = createHarness();
    harness.scanIndexPoints.mockRejectedValue(new Error('connection reset'));

    await expect(
      harness.service.verify({
        outboxId: OUTBOX_ID,
        jobId: JOB_ID,
        companyId: COMPANY_ID,
        verifyQdrant: true,
      }),
    ).rejects.toMatchObject({
      code: 'AI_INDEX_VERIFY_QDRANT_UNAVAILABLE',
    });
  });
});
