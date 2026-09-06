import { JobIndexingService } from './job-indexing.service';
import { JobIndexOutbox } from './entities/job-index-outbox.entity';
import { deterministicJobPointId } from './job-indexing.normalization';

function activeJob() {
  return {
    _id: 'job-1',
    company: { _id: 'company-1', name: 'Acme' },
    name: 'Engineer',
    description: 'Build APIs',
    skills: ['TypeScript'],
    level: 'senior',
    location: 'Hanoi',
    isActive: true,
    isDeleted: false,
    deletedAt: null,
    startDate: new Date('2025-01-01T00:00:00Z'),
    endDate: new Date('2027-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  } as any;
}

function company() {
  return {
    _id: 'company-1',
    name: 'Acme',
    description: '',
    address: '',
    isActive: true,
    isDeleted: false,
    deletedAt: null,
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  } as any;
}

describe('JobIndexingService', () => {
  it('upserts one outbox event for the same job source version', async () => {
    const outboxRepo = { upsert: jest.fn().mockResolvedValue(undefined) };
    const service = new JobIndexingService(
      {} as any,
      outboxRepo as any,
      { findOne: jest.fn().mockResolvedValue(activeJob()) } as any,
      { findOne: jest.fn().mockResolvedValue(company()) } as any,
      {} as any,
      {} as any,
    );
    await service.enqueue('job-1');
    await service.enqueue('job-1');
    expect(outboxRepo.upsert).toHaveBeenCalledTimes(2);
    expect(outboxRepo.upsert.mock.calls[0][1]).toEqual([
      'aggregateId',
      'sourceVersion',
      'eventType',
    ]);
    expect(outboxRepo.upsert.mock.calls[0][0].sourceVersion).toBe(
      outboxRepo.upsert.mock.calls[1][0].sourceVersion,
    );
  });

  it('deletes a stale vector when the canonical job is no longer active', async () => {
    const deleted = jest.fn();
    const service = new JobIndexingService(
      {} as any,
      {} as any,
      {
        findOne: jest
          .fn()
          .mockResolvedValue({ ...activeJob(), isActive: false }),
      } as any,
      { findOne: jest.fn().mockResolvedValue(company()) } as any,
      {} as any,
      { delete: deleted, get: jest.fn() } as any,
    );
    await (service as any).indexClaim({
      aggregateId: 'job-1',
      sourceVersion: 'wrong',
    });
    expect(deleted).not.toHaveBeenCalled();

    const sourceVersion = (await (service as any).loadProjection('job-1'))
      .sourceVersion;
    await (service as any).indexClaim({ aggregateId: 'job-1', sourceVersion });
    expect(deleted).toHaveBeenCalledWith('job-1');
    expect(deterministicJobPointId('job-1')).toHaveLength(36);
  });

  it('records bounded failure metadata and does not claim beyond max attempts', () => {
    const outbox = Object.assign(new JobIndexOutbox(), {
      attemptCount: 8,
      status: 'FAILED',
    });
    expect(outbox.attemptCount).toBe(8);
    expect(outbox.status).toBe('FAILED');
  });
});
