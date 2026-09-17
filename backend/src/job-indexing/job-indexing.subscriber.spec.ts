import { Company } from 'src/companies/entities/company.entity';
import { Job } from 'src/jobs/entities/job.entity';
import { JobIndexOutbox } from './entities/job-index-outbox.entity';
import { JobIndexingSubscriber } from './job-indexing.subscriber';
import { JOB_INDEX_VERSION } from './job-indexing.constants';
import { getJobIndexSourceVersion } from './job-indexing.normalization';

function managerFor(job: any, company: any) {
  const insert = jest.fn().mockResolvedValue(undefined);
  const jobQuery = {
    withDeleted: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValueOnce([job]).mockResolvedValueOnce([]),
  };
  const jobRepository = {
    findOne: jest.fn().mockResolvedValue(job),
    find: jest.fn().mockResolvedValue([job]),
    createQueryBuilder: jest.fn(() => jobQuery),
  };
  const companyRepository = {
    createQueryBuilder: jest.fn(() => ({
      withDeleted: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(company),
    })),
  };
  const outboxRepository = {
    findOne: jest.fn().mockResolvedValue(null),
    insert,
  };
  return {
    manager: {
      getRepository(entity: unknown) {
        if (entity === Job) return jobRepository;
        if (entity === Company) return companyRepository;
        if (entity === JobIndexOutbox) return outboxRepository;
        throw new Error('unexpected repository');
      },
    } as any,
    insert,
  };
}

const job = {
  _id: 'job-1',
  company: { _id: 'company-1' },
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};
const company = {
  _id: 'company-1',
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

describe('JobIndexingSubscriber', () => {
  it('enqueues inserts using the transaction manager and idempotency key', async () => {
    const { manager, insert } = managerFor(job, company);
    const subscriber = new JobIndexingSubscriber();
    await subscriber.afterInsert({
      manager,
      entity: job,
      metadata: { target: Job },
    } as any);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateId: 'job-1',
        eventType: 'JOB_CHANGED',
        sourceVersion: expect.any(String),
        representationVersion: JOB_INDEX_VERSION,
      }),
    );
  });

  it('enqueues every job when the canonical company changes', async () => {
    const { manager, insert } = managerFor(job, company);
    const subscriber = new JobIndexingSubscriber();
    await subscriber.afterUpdate({
      manager,
      entity: { _id: 'company-1' },
      databaseEntity: { _id: 'company-1' },
      metadata: { target: Company },
    } as any);
    expect(insert).toHaveBeenCalledTimes(1);
  });
  it('enqueues a deterministic tombstone from a hard-deleted job snapshot', async () => {
    const { manager, insert } = managerFor(job, company);
    const subscriber = new JobIndexingSubscriber();
    const removed = { ...job, isDeleted: false, deletedAt: null };

    await subscriber.afterRemove({
      manager,
      entity: removed,
      databaseEntity: removed,
      metadata: { target: Job },
    } as any);

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateId: 'job-1',
        sourceVersion: expect.any(String),
        status: 'PENDING',
      }),
    );
  });

  it('enqueues deletes for jobs when their company is hard-deleted', async () => {
    const { manager, insert } = managerFor(job, company);
    const subscriber = new JobIndexingSubscriber();

    await subscriber.afterRemove({
      manager,
      entity: company,
      databaseEntity: company,
      metadata: { target: Company },
    } as any);

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateId: 'job-1',
        status: 'PENDING',
        // Company deletion changes only the company lifecycle component. The
        // job itself must not be rewritten as DELETED.
        sourceVersion: getJobIndexSourceVersion(
          job as any,
          {
            ...company,
            isDeleted: true,
          } as any,
        ),
      }),
    );
    expect(insert.mock.calls[0][0].sourceVersion).not.toBe(
      getJobIndexSourceVersion(
        { ...job, isDeleted: true } as any,
        { ...company, isDeleted: true } as any,
      ),
    );
  });

  it('reconciles company jobs with bounded keyset pages', async () => {
    const jobs = Array.from({ length: 101 }, (_, index) => ({
      ...job,
      _id: `job-${String(index + 1).padStart(3, '0')}`,
    }));
    const jobQuery = {
      withDeleted: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest
        .fn()
        .mockResolvedValueOnce(jobs.slice(0, 100))
        .mockResolvedValueOnce(jobs.slice(100))
        .mockResolvedValueOnce([]),
    };
    const insert = jest.fn().mockResolvedValue(undefined);
    const jobRepository = {
      findOne: jest
        .fn()
        .mockImplementation(({ where: { _id } }) =>
          Promise.resolve(jobs.find((item) => item._id === _id)),
        ),
      createQueryBuilder: jest.fn(() => jobQuery),
    };
    const companyRepository = {
      createQueryBuilder: jest.fn(() => ({
        withDeleted: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(company),
      })),
    };
    const outboxRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      insert,
    };
    const manager = {
      getRepository(entity: unknown) {
        if (entity === Job) return jobRepository;
        if (entity === Company) return companyRepository;
        if (entity === JobIndexOutbox) return outboxRepository;
        throw new Error('unexpected repository');
      },
    } as any;
    const subscriber = new JobIndexingSubscriber();

    await subscriber.afterUpdate({
      manager,
      entity: { _id: 'company-1' },
      databaseEntity: { _id: 'company-1' },
      metadata: { target: Company },
    } as any);

    expect(jobQuery.take).toHaveBeenCalledTimes(2);
    expect(jobQuery.andWhere).toHaveBeenCalledWith('job."_id" > :afterId', {
      afterId: 'job-100',
    });
    expect(insert).toHaveBeenCalledTimes(101);
  });
});
