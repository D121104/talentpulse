import { AiIndexLifecycleSweepService } from './services/ai-index-lifecycle-sweep.service';
import {
  AiIndexAggregateType,
  AiIndexOutboxOperation,
} from './entities/ai-index-outbox.entity';
import { CanonicalJobProjection } from './services/canonical-job-projection.service';
import { Company } from '../companies/entities/company.entity';
import { Job } from '../jobs/entities/job.entity';

const COMPANY_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const EXPIRED_JOB_ID = '11111111-1111-4111-8111-111111111111';
const FUTURE_JOB_ID = '11111111-1111-4111-8111-111111111112';
const INACTIVE_JOB_ID = '11111111-1111-4111-8111-111111111113';
const DELETED_JOB_ID = '11111111-1111-4111-8111-111111111114';
const ACTIVE_JOB_ID = '22222222-2222-4222-8222-222222222222';
const PAGE_CURSOR = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-08-28T12:00:00.000Z');

function createProjection(
  jobId: string,
  overrides: {
    active?: boolean;
    isActive?: boolean;
    isDeleted?: boolean;
    deletedAt?: Date | null;
    companyActive?: boolean;
    companyDeleted?: boolean;
    companyDeletedAt?: Date | null;
    startDate?: Date | null;
    endDate?: Date | null;
  } = {},
): CanonicalJobProjection {
  const active = overrides.active ?? true;
  const job = {
    _id: jobId,
    isActive: overrides.isActive ?? true,
    isDeleted: overrides.isDeleted ?? false,
    deletedAt: overrides.deletedAt ?? null,
    company: { _id: COMPANY_ID },
    startDate: overrides.startDate ?? new Date('2026-08-01T00:00:00.000Z'),
    endDate: overrides.endDate ?? new Date('2026-09-01T00:00:00.000Z'),
  } as Job;
  const company = {
    _id: COMPANY_ID,
    isActive: overrides.companyActive ?? true,
    isDeleted: overrides.companyDeleted ?? false,
    deletedAt: overrides.companyDeletedAt ?? null,
  } as Company;

  return {
    job,
    company,
    snapshot: active ? ({} as never) : null,
    isCanonicalActive: active,
  };
}

describe('AiIndexLifecycleSweepService', () => {
  it('uses one fixed clock and bounded cursors for every lifecycle disposition', async () => {
    const scanJobs = jest
      .fn()
      .mockResolvedValueOnce({
        jobs: [
          createProjection(EXPIRED_JOB_ID, {
            active: false,
            endDate: NOW,
          }),
          createProjection(FUTURE_JOB_ID, {
            active: false,
            startDate: new Date('2026-08-29T00:00:00.000Z'),
          }),
          createProjection(INACTIVE_JOB_ID, {
            active: false,
            isActive: false,
          }),
        ],
        nextCursor: PAGE_CURSOR,
        hasMore: true,
      })
      .mockResolvedValueOnce({
        jobs: [
          createProjection(DELETED_JOB_ID, {
            active: false,
            isDeleted: true,
            deletedAt: new Date('2026-08-28T10:00:00.000Z'),
          }),
          createProjection(ACTIVE_JOB_ID),
        ],
        nextCursor: null,
        hasMore: false,
      });
    const enqueueWithNextSourceVersionIfNeeded = jest
      .fn()
      .mockResolvedValue({ outbox: {}, enqueued: true });
    const service = new AiIndexLifecycleSweepService(
      { scanJobs } as never,
      { enqueueWithNextSourceVersionIfNeeded } as never,
    );

    const result = await service.sweepAll({ limit: 3, now: NOW });

    expect(scanJobs).toHaveBeenNthCalledWith(1, null, 3, NOW);
    expect(scanJobs).toHaveBeenNthCalledWith(2, PAGE_CURSOR, 3, NOW);
    expect(
      enqueueWithNextSourceVersionIfNeeded.mock.calls.map(([input]) => [
        input.aggregateId,
        input.operation,
      ]),
    ).toEqual([
      [EXPIRED_JOB_ID, AiIndexOutboxOperation.DELETE],
      [FUTURE_JOB_ID, AiIndexOutboxOperation.DELETE],
      [INACTIVE_JOB_ID, AiIndexOutboxOperation.DELETE],
      [DELETED_JOB_ID, AiIndexOutboxOperation.DELETE],
      [ACTIVE_JOB_ID, AiIndexOutboxOperation.UPSERT],
    ]);
    expect(result).toMatchObject({
      scanned: 5,
      active: 1,
      inactive: 4,
      expired: 1,
      notStarted: 1,
      inactiveJob: 1,
      deleted: 1,
      upsertEnqueued: 1,
      deleteEnqueued: 4,
      cursor: null,
      nextCursor: null,
      hasMore: false,
    });
  });
});
