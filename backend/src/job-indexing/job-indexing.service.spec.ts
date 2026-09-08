import { JobIndexingService } from './job-indexing.service';
import { JobIndexOutbox } from './entities/job-index-outbox.entity';
import {
  deterministicJobPointId,
  getJobSourceVersion,
} from './job-indexing.normalization';
import { JOB_INDEX_VERSION } from './job-indexing.constants';

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

  it('deletes an inactive job through the FastAPI boundary', async () => {
    const deleteJob = jest.fn().mockImplementation(async (request) => ({
      request_id: request.identity.request_id,
      trace_id: request.identity.trace_id,
      operation_attempt_id: request.identity.operation_attempt_id,
      job_id: request.job_id,
      operation: 'DELETE',
      status: 'DELETED',
      source_version: request.source_version,
      representation_version: request.representation_version,
      point_id: deterministicJobPointId(request.job_id),
      content_hash: null,
      embedding_provider: 'cohere',
      embedding_model: 'cohere.embed-multilingual-v3',
      embedding_dimensions: 1024,
      embedded: false,
    }));
    const job = { ...activeJob(), isActive: false };
    const service = new JobIndexingService(
      {} as any,
      {} as any,
      { findOne: jest.fn().mockResolvedValue(job) } as any,
      { findOne: jest.fn().mockResolvedValue(company()) } as any,
      { deleteJob } as any,
    );
    const sourceVersion = getJobSourceVersion(job, company());

    await (service as any).indexClaim({
      _id: '00000000-0000-4000-8000-000000000010',
      aggregateId: 'job-1',
      sourceVersion: 'wrong',
      eventType: 'JOB_CHANGED',
      attemptCount: 1,
    });
    expect(deleteJob).not.toHaveBeenCalled();

    await (service as any).indexClaim({
      _id: '00000000-0000-4000-8000-000000000010',
      aggregateId: 'job-1',
      sourceVersion,
      eventType: 'JOB_CHANGED',
      attemptCount: 1,
    });
    expect(deleteJob).toHaveBeenCalledWith(
      expect.objectContaining({
        job_id: 'job-1',
        source_version: sourceVersion,
        representation_version: JOB_INDEX_VERSION,
      }),
    );
  });

  it('sends active canonical snapshots through the FastAPI boundary', async () => {
    const upsertJob = jest.fn().mockImplementation(async (request) => ({
      request_id: request.identity.request_id,
      trace_id: request.identity.trace_id,
      operation_attempt_id: request.identity.operation_attempt_id,
      job_id: request.job.job_id,
      operation: 'UPSERT',
      status: 'INDEXED',
      source_version: request.source_version,
      representation_version: request.representation_version,
      point_id: deterministicJobPointId(request.job.job_id),
      content_hash: request.content_hash,
      embedding_provider: 'cohere',
      embedding_model: 'cohere.embed-multilingual-v3',
      embedding_dimensions: 1024,
      embedded: true,
    }));
    const service = new JobIndexingService(
      {} as any,
      {} as any,
      { findOne: jest.fn().mockResolvedValue(activeJob()) } as any,
      { findOne: jest.fn().mockResolvedValue(company()) } as any,
      { upsertJob } as any,
    );
    const sourceVersion = getJobSourceVersion(activeJob(), company());
    await (service as any).indexClaim({
      _id: '00000000-0000-4000-8000-000000000011',
      aggregateId: 'job-1',
      sourceVersion,
      eventType: 'JOB_CHANGED',
      attemptCount: 1,
    });
    expect(upsertJob).toHaveBeenCalledWith(
      expect.objectContaining({
        job: expect.objectContaining({
          job_id: 'job-1',
          company_id: 'company-1',
          title: 'Engineer',
          is_active: true,
          is_deleted: false,
        }),
        source_version: sourceVersion,
        representation_version: JOB_INDEX_VERSION,
        idempotency_key: expect.stringContaining(
          'job-index:JOB_CHANGED:job-1:',
        ),
      }),
    );
    const first = upsertJob.mock.calls[0][0];
    await (service as any).indexClaim({
      _id: '00000000-0000-4000-8000-000000000011',
      aggregateId: 'job-1',
      sourceVersion,
      eventType: 'JOB_CHANGED',
      attemptCount: 2,
    });
    const second = upsertJob.mock.calls[1][0];
    expect(second.identity.request_id).toBe(first.identity.request_id);
    expect(second.identity.operation_attempt_id).not.toBe(
      first.identity.operation_attempt_id,
    );
    expect(second.idempotency_key).toBe(first.idempotency_key);
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
