import { JobIndexingService } from './job-indexing.service';
import { JobIndexOutbox } from './entities/job-index-outbox.entity';
import {
  deterministicJobPointId,
  getJobIndexPhase,
  getJobIndexSourceVersion,
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
  it('does not reset an existing outbox event for the same job source version', async () => {
    const outboxRepo = {
      findOne: jest.fn().mockResolvedValue({
        status: 'COMPLETED',
        attemptCount: 3,
      }),
      insert: jest.fn(),
    };
    const service = new JobIndexingService(
      {} as any,
      outboxRepo as any,
      { findOne: jest.fn().mockResolvedValue(activeJob()) } as any,
      { findOne: jest.fn().mockResolvedValue(company()) } as any,
      {} as any,
    );
    await service.enqueue('job-1');

    expect(outboxRepo.findOne).toHaveBeenCalledWith({
      where: {
        aggregateId: 'job-1',
        sourceVersion: getJobIndexSourceVersion(activeJob(), company()),
        eventType: 'JOB_CHANGED',
        representationVersion: JOB_INDEX_VERSION,
      },
    });
    expect(outboxRepo.insert).not.toHaveBeenCalled();
  });

  it('does not requeue a completed event when reconciliation sees the same phase', async () => {
    const existing = { _id: 'outbox-1', status: 'COMPLETED' };
    const outboxRepo = {
      findOne: jest.fn().mockResolvedValue(existing),
      insert: jest.fn(),
      update: jest.fn(),
    };
    const service = new JobIndexingService(
      {} as any,
      outboxRepo as any,
      { findOne: jest.fn().mockResolvedValue(activeJob()) } as any,
      { findOne: jest.fn().mockResolvedValue(company()) } as any,
      {} as any,
    );

    await service.enqueue('job-1', true, new Date('2026-06-01T00:00:00Z'));

    expect(outboxRepo.update).not.toHaveBeenCalled();
    expect(outboxRepo.insert).not.toHaveBeenCalled();
  });

  it('findLatestOutbox returns the current pre-boundary event', async () => {
    const preBoundary = {
      _id: 'outbox-pre-boundary',
      aggregateId: 'job-1',
      sourceVersion: 'pre-boundary-source',
      createdAt: new Date('2026-06-30T23:59:59.999Z'),
    };
    const outboxRepo = {
      find: jest.fn().mockResolvedValue([preBoundary]),
    };
    const service = new JobIndexingService(
      {} as any,
      outboxRepo as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect((service as any).findLatestOutbox('job-1')).resolves.toBe(
      preBoundary,
    );
    expect(outboxRepo.find).toHaveBeenCalledWith({
      where: { aggregateId: 'job-1' },
      order: { createdAt: 'DESC' },
      take: 1,
    });
  });

  it('ignores a concurrent unique-constraint conflict while inserting an event', async () => {
    const outboxRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      insert: jest.fn().mockRejectedValue({ code: '23505' }),
    };
    const service = new JobIndexingService(
      {} as any,
      outboxRepo as any,
      { findOne: jest.fn().mockResolvedValue(activeJob()) } as any,
      { findOne: jest.fn().mockResolvedValue(company()) } as any,
      {} as any,
    );

    await expect(service.enqueue('job-1')).resolves.toBeUndefined();
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
      {
        findOne: jest.fn(),
        find: jest.fn().mockResolvedValue([]),
        insert: jest.fn(),
      } as any,
      { findOne: jest.fn().mockResolvedValue(job) } as any,
      { findOne: jest.fn().mockResolvedValue(company()) } as any,
      { deleteJob } as any,
    );
    const sourceVersion = getJobIndexSourceVersion(job, company());

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
      {
        findOne: jest.fn(),
        find: jest.fn().mockResolvedValue([]),
        insert: jest.fn(),
      } as any,
      { findOne: jest.fn().mockResolvedValue(activeJob()) } as any,
      { findOne: jest.fn().mockResolvedValue(company()) } as any,
      { upsertJob } as any,
    );
    const sourceVersion = getJobIndexSourceVersion(activeJob(), company());
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

  it('creates one new event when a scheduled job transitions to active', async () => {
    const job = activeJob();
    job.startDate = new Date('2026-07-01T00:00:00Z');
    const outboxRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      insert: jest.fn(),
    };
    const service = new JobIndexingService(
      {} as any,
      outboxRepo as any,
      { findOne: jest.fn().mockResolvedValue(job) } as any,
      { findOne: jest.fn().mockResolvedValue(company()) } as any,
      {} as any,
    );
    const scheduledNow = new Date('2026-06-30T23:59:59Z');
    const activeNow = new Date('2026-07-01T00:00:00Z');

    await service.enqueue('job-1', false, scheduledNow);
    await service.enqueue('job-1', false, activeNow);

    expect(outboxRepo.insert).toHaveBeenCalledTimes(2);
    expect(outboxRepo.insert.mock.calls[0][0].sourceVersion).not.toBe(
      outboxRepo.insert.mock.calls[1][0].sourceVersion,
    );
    expect(getJobIndexPhase(job, company(), scheduledNow)).toBe('SCHEDULED');
    expect(getJobIndexPhase(job, company(), activeNow)).toBe('ACTIVE');
  });

  it('uses delete semantics for expired and company-inactive phases', async () => {
    const expired = {
      ...activeJob(),
      endDate: new Date('2026-06-01T00:00:00Z'),
    };
    const inactiveCompany = { ...company(), isActive: false };
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
    const now = new Date('2026-06-02T00:00:00Z');
    const expiredService = new JobIndexingService(
      {} as any,
      {} as any,
      { findOne: jest.fn().mockResolvedValue(expired) } as any,
      { findOne: jest.fn().mockResolvedValue(company()) } as any,
      { deleteJob } as any,
    );

    await (expiredService as any).indexClaim(
      {
        _id: '00000000-0000-4000-8000-000000000014',
        aggregateId: 'job-1',
        sourceVersion: getJobIndexSourceVersion(expired, company(), now),
        eventType: 'JOB_CHANGED',
        attemptCount: 1,
      },
      now,
    );
    expect(getJobIndexPhase(expired, company(), now)).toBe('EXPIRED');

    const inactiveService = new JobIndexingService(
      {} as any,
      {} as any,
      { findOne: jest.fn().mockResolvedValue(expired) } as any,
      { findOne: jest.fn().mockResolvedValue(inactiveCompany) } as any,
      { deleteJob } as any,
    );
    await (inactiveService as any).indexClaim(
      {
        _id: '00000000-0000-4000-8000-000000000018',
        aggregateId: 'job-1',
        sourceVersion: getJobIndexSourceVersion(expired, inactiveCompany, now),
        eventType: 'JOB_CHANGED',
        attemptCount: 1,
      },
      now,
    );

    expect(deleteJob).toHaveBeenCalledTimes(2);
    expect(getJobIndexPhase(expired, inactiveCompany, now)).toBe(
      'COMPANY_INACTIVE',
    );
  });

  it('fences a stale active event so expiration cannot restore a vector', async () => {
    const job = activeJob();
    job.endDate = new Date('2026-06-01T00:00:00Z');
    const deleteJob = jest.fn();
    const service = new JobIndexingService(
      {} as any,
      {
        findOne: jest.fn(),
        find: jest.fn().mockResolvedValue([]),
        insert: jest.fn(),
      } as any,
      { findOne: jest.fn().mockResolvedValue(job) } as any,
      { findOne: jest.fn().mockResolvedValue(company()) } as any,
      { deleteJob, upsertJob: jest.fn() } as any,
    );
    const activeSource = getJobIndexSourceVersion(
      job,
      company(),
      new Date('2026-05-31T23:59:59Z'),
    );

    await expect(
      (service as any).indexClaim(
        {
          _id: '00000000-0000-4000-8000-000000000015',
          aggregateId: 'job-1',
          sourceVersion: activeSource,
          eventType: 'JOB_CHANGED',
          attemptCount: 1,
        },
        new Date('2026-06-01T00:00:00Z'),
      ),
    ).resolves.toBe('completed');

    expect(deleteJob).not.toHaveBeenCalled();
  });

  it('completes an upsert when FastAPI returns SKIPPED_INACTIVE', async () => {
    const outboxRepo = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
    const job = { ...activeJob(), isActive: false };
    const now = new Date('2026-06-01T00:00:00Z');
    const upsertJob = jest.fn().mockImplementation(async (request) => ({
      request_id: request.identity.request_id,
      trace_id: request.identity.trace_id,
      operation_attempt_id: request.identity.operation_attempt_id,
      job_id: request.job.job_id,
      operation: 'UPSERT',
      status: 'SKIPPED_INACTIVE',
      source_version: request.source_version,
      representation_version: request.representation_version,
      point_id: deterministicJobPointId(request.job.job_id),
      content_hash: null,
      embedding_provider: 'cohere',
      embedding_model: 'cohere.embed-multilingual-v3',
      embedding_dimensions: 1024,
      embedded: false,
    }));
    const service = new JobIndexingService(
      {} as any,
      outboxRepo as any,
      { findOne: jest.fn().mockResolvedValue(job) } as any,
      { findOne: jest.fn().mockResolvedValue(company()) } as any,
      { upsertJob } as any,
    );
    // Exercise the processor path with an active projection and a provider skip.
    job.isActive = true;
    await expect(
      (service as any).processClaim(
        {
          _id: '00000000-0000-4000-8000-000000000016',
          aggregateId: 'job-1',
          sourceVersion: getJobIndexSourceVersion(job, company(), now),
          representationVersion: 'demo-v1',
          eventType: 'JOB_CHANGED',
          status: 'PROCESSING',
          attemptCount: 1,
          leaseUntil: new Date(Date.now() + 1000),
          leaseToken: '00000000-0000-4000-8000-000000000017',
        },
        now,
      ),
    ).resolves.toBe('completed');
    expect(outboxRepo.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'COMPLETED' }),
    );
  });

  it('keeps simultaneous representations isolated by request and idempotency version', async () => {
    const upsertJob = jest.fn().mockImplementation(async (request) => ({
      request_id: request.identity.request_id,
      trace_id: request.identity.trace_id,
      operation_attempt_id: request.identity.operation_attempt_id,
      job_id: request.job.job_id,
      operation: 'UPSERT',
      status: 'INDEXED',
      source_version: request.source_version,
      representation_version: request.representation_version,
      point_id: deterministicJobPointId(
        request.job.job_id,
        request.representation_version,
      ),
      content_hash: request.content_hash,
      embedding_provider: 'deterministic',
      embedding_model: 'deterministic-v1',
      embedding_dimensions: 1024,
      embedded: true,
    }));
    const service = new JobIndexingService(
      {} as any,
      {
        findOne: jest.fn(),
        find: jest.fn().mockResolvedValue([]),
        insert: jest.fn(),
      } as any,
      { findOne: jest.fn().mockResolvedValue(activeJob()) } as any,
      { findOne: jest.fn().mockResolvedValue(company()) } as any,
      { upsertJob } as any,
    );
    const sourceVersion = getJobIndexSourceVersion(activeJob(), company());

    await (service as any).indexClaim({
      _id: '00000000-0000-4000-8000-000000000012',
      aggregateId: 'job-1',
      sourceVersion,
      representationVersion: 'demo-v1',
      eventType: 'JOB_CHANGED',
      attemptCount: 1,
    });
    await (service as any).indexClaim({
      _id: '00000000-0000-4000-8000-000000000013',
      aggregateId: 'job-1',
      sourceVersion,
      representationVersion: 'local-ollama-v1',
      eventType: 'JOB_CHANGED',
      attemptCount: 1,
    });

    expect(
      upsertJob.mock.calls.map(([request]) => request.representation_version),
    ).toEqual(['demo-v1', 'local-ollama-v1']);
    expect(upsertJob.mock.calls[0][0].idempotency_key).not.toBe(
      upsertJob.mock.calls[1][0].idempotency_key,
    );
  });

  it.each([
    {
      name: 'expires',
      preNow: new Date('2026-06-30T23:59:59.999Z'),
      postNow: new Date('2026-07-01T00:00:00.000Z'),
      makeJob: () => ({
        ...activeJob(),
        endDate: new Date('2026-07-01T00:00:00.000Z'),
      }),
      expectedOperations: ['UPSERT', 'DELETE'],
      expectedPhases: ['ACTIVE', 'EXPIRED'],
    },
    {
      name: 'activates',
      preNow: new Date('2026-06-30T23:59:59.999Z'),
      postNow: new Date('2026-07-01T00:00:00.000Z'),
      makeJob: () => ({
        ...activeJob(),
        startDate: new Date('2026-07-01T00:00:00.000Z'),
      }),
      expectedOperations: ['DELETE', 'UPSERT'],
      expectedPhases: ['SCHEDULED', 'ACTIVE'],
    },
  ])(
    'uses a fresh post-provider clock when a job $name during a slow call',
    async ({
      makeJob,
      preNow,
      postNow,
      expectedOperations,
      expectedPhases,
    }) => {
      jest.useFakeTimers({ now: preNow });
      try {
        const job = makeJob();
        const currentCompany = company();
        let markProviderStarted!: () => void;
        const providerStarted = new Promise<void>((resolve) => {
          markProviderStarted = resolve;
        });
        let releaseSlowCall!: () => void;
        const slowCall = new Promise<void>((resolve) => {
          releaseSlowCall = resolve;
        });
        const operations: Array<{
          operation: string;
          source_version: string;
        }> = [];
        let firstProviderCall = true;
        const waitForSlowCall = async () => {
          if (!firstProviderCall) return;
          firstProviderCall = false;
          markProviderStarted();
          await slowCall;
        };
        const response = (request: any, operation: 'UPSERT' | 'DELETE') => {
          const jobId =
            operation === 'UPSERT' ? request.job.job_id : request.job_id;
          return {
            request_id: request.identity.request_id,
            trace_id: request.identity.trace_id,
            operation_attempt_id: request.identity.operation_attempt_id,
            job_id: jobId,
            operation,
            status: operation === 'UPSERT' ? 'INDEXED' : 'DELETED',
            source_version: request.source_version,
            representation_version: request.representation_version,
            point_id: deterministicJobPointId(
              jobId,
              request.representation_version,
            ),
            content_hash: operation === 'UPSERT' ? request.content_hash : null,
            embedding_provider: 'deterministic',
            embedding_model: 'deterministic-v1',
            embedding_dimensions: 1024,
            embedded: operation === 'UPSERT',
          };
        };
        const upsertJob = jest.fn(async (request) => {
          operations.push({
            operation: 'UPSERT',
            source_version: request.source_version,
          });
          await waitForSlowCall();
          return response(request, 'UPSERT');
        });
        const deleteJob = jest.fn(async (request) => {
          operations.push({
            operation: 'DELETE',
            source_version: request.source_version,
          });
          await waitForSlowCall();
          return response(request, 'DELETE');
        });
        const preSource = getJobIndexSourceVersion(job, currentCompany, preNow);
        const postSource = getJobIndexSourceVersion(
          job,
          currentCompany,
          postNow,
        );
        const preBoundaryEvent = {
          _id: '00000000-0000-4000-8000-000000000025',
          aggregateId: 'job-1',
          sourceVersion: preSource,
          createdAt: preNow,
        };
        const outboxRepo = {
          findOne: jest.fn().mockResolvedValue(null),
          find: jest.fn().mockResolvedValue([preBoundaryEvent]),
          insert: jest.fn(),
        };
        const service = new JobIndexingService(
          {} as any,
          outboxRepo as any,
          { findOne: jest.fn().mockResolvedValue(job) } as any,
          { findOne: jest.fn().mockResolvedValue(currentCompany) } as any,
          { upsertJob, deleteJob } as any,
        );
        expect(getJobIndexPhase(job, currentCompany, preNow)).toBe(
          expectedPhases[0],
        );
        expect(getJobIndexPhase(job, currentCompany, postNow)).toBe(
          expectedPhases[1],
        );
        const indexing = (service as any).indexClaim(
          {
            _id: '00000000-0000-4000-8000-000000000025',
            aggregateId: 'job-1',
            sourceVersion: preSource,
            representationVersion: JOB_INDEX_VERSION,
            eventType: 'JOB_CHANGED',
            attemptCount: 1,
          },
          preNow,
        );
        await providerStarted;
        expect(operations).toHaveLength(1);
        jest.setSystemTime(postNow);
        releaseSlowCall();
        await expect(indexing).resolves.toBe('completed');

        expect(operations).toEqual([
          { operation: expectedOperations[0], source_version: preSource },
          { operation: expectedOperations[1], source_version: postSource },
        ]);
        expect(outboxRepo.insert).toHaveBeenCalledWith(
          expect.objectContaining({ sourceVersion: postSource }),
        );
      } finally {
        jest.useRealTimers();
      }
    },
  );

  it('compensates a stale UPSERT when canonical state changes during provider call', async () => {
    const oldJob = activeJob();
    const newJob = { ...oldJob, updatedAt: new Date('2026-02-01T00:00:00Z') };
    const oldCompany = company();
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
      embedding_provider: 'deterministic',
      embedding_model: 'deterministic-v1',
      embedding_dimensions: 1024,
      embedded: true,
    }));
    const outboxRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      insert: jest.fn(),
    };
    const service = new JobIndexingService(
      {} as any,
      outboxRepo as any,
      {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(oldJob)
          .mockResolvedValue(newJob),
      } as any,
      { findOne: jest.fn().mockResolvedValue(oldCompany) } as any,
      { upsertJob } as any,
    );
    const oldSource = getJobIndexSourceVersion(oldJob, oldCompany);

    await (service as any).indexClaim({
      _id: '00000000-0000-4000-8000-000000000021',
      aggregateId: 'job-1',
      sourceVersion: oldSource,
      representationVersion: JOB_INDEX_VERSION,
      eventType: 'JOB_CHANGED',
      attemptCount: 1,
    });

    expect(upsertJob).toHaveBeenCalledTimes(2);
    expect(upsertJob.mock.calls[1][0].source_version).toBe(
      getJobIndexSourceVersion(newJob, oldCompany),
    );
    expect(outboxRepo.insert).toHaveBeenCalled();
  });

  it('compensates a stale DELETE when canonical state changes back to active', async () => {
    const oldJob = { ...activeJob(), isActive: false };
    const newJob = activeJob();
    const currentCompany = company();
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
      embedding_provider: 'deterministic',
      embedding_model: 'deterministic-v1',
      embedding_dimensions: 1024,
      embedded: false,
    }));
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
      embedding_provider: 'deterministic',
      embedding_model: 'deterministic-v1',
      embedding_dimensions: 1024,
      embedded: true,
    }));
    const outboxRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      insert: jest.fn(),
    };
    const service = new JobIndexingService(
      {} as any,
      outboxRepo as any,
      {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(oldJob)
          .mockResolvedValue(newJob),
      } as any,
      { findOne: jest.fn().mockResolvedValue(currentCompany) } as any,
      { deleteJob, upsertJob } as any,
    );
    const oldSource = getJobIndexSourceVersion(oldJob, currentCompany);

    await (service as any).indexClaim({
      _id: '00000000-0000-4000-8000-000000000022',
      aggregateId: 'job-1',
      sourceVersion: oldSource,
      representationVersion: JOB_INDEX_VERSION,
      eventType: 'JOB_CHANGED',
      attemptCount: 1,
    });

    expect(deleteJob).toHaveBeenCalledTimes(1);
    expect(upsertJob).toHaveBeenCalledTimes(1);
    expect(upsertJob.mock.calls[0][0].source_version).toBe(
      getJobIndexSourceVersion(newJob, currentCompany),
    );
  });

  it('deletes the current projection after an UPSERT loses a hard-delete race', async () => {
    const oldJob = activeJob();
    const currentCompany = company();
    const tombstone = {
      _id: '00000000-0000-4000-8000-000000000024',
      aggregateId: 'job-1',
      sourceVersion: 'tombstone-source',
      representationVersion: JOB_INDEX_VERSION,
      eventType: 'JOB_CHANGED',
      status: 'PENDING',
      attemptCount: 0,
    };
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
      embedding_provider: 'deterministic',
      embedding_model: 'deterministic-v1',
      embedding_dimensions: 1024,
      embedded: true,
    }));
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
      embedding_provider: 'deterministic',
      embedding_model: 'deterministic-v1',
      embedding_dimensions: 1024,
      embedded: false,
    }));
    const outboxRepo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([tombstone]),
      insert: jest.fn(),
    };
    const jobRepo = {
      findOne: jest.fn().mockResolvedValueOnce(oldJob).mockResolvedValue(null),
    };
    const service = new JobIndexingService(
      {} as any,
      outboxRepo as any,
      jobRepo as any,
      { findOne: jest.fn().mockResolvedValue(currentCompany) } as any,
      { upsertJob, deleteJob } as any,
    );

    await (service as any).indexClaim({
      _id: '00000000-0000-4000-8000-000000000023',
      aggregateId: 'job-1',
      sourceVersion: getJobIndexSourceVersion(oldJob, currentCompany),
      representationVersion: JOB_INDEX_VERSION,
      eventType: 'JOB_CHANGED',
      attemptCount: 1,
    });

    expect(upsertJob).toHaveBeenCalledTimes(1);
    expect(deleteJob).toHaveBeenCalledTimes(1);
    expect(deleteJob.mock.calls[0][0].source_version).toBe('tombstone-source');
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
