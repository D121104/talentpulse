import { Company } from 'src/companies/entities/company.entity';
import { Job } from 'src/jobs/entities/job.entity';
import { JobIndexOutbox } from './entities/job-index-outbox.entity';
import { JobIndexingSubscriber } from './job-indexing.subscriber';

function managerFor(job: any, company: any) {
  const upsert = jest.fn().mockResolvedValue(undefined);
  const jobRepository = {
    findOne: jest.fn().mockResolvedValue(job),
    find: jest.fn().mockResolvedValue([job]),
  };
  const companyRepository = {
    createQueryBuilder: jest.fn(() => ({
      withDeleted: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(company),
    })),
  };
  const outboxRepository = { upsert };
  return {
    manager: {
      getRepository(entity: unknown) {
        if (entity === Job) return jobRepository;
        if (entity === Company) return companyRepository;
        if (entity === JobIndexOutbox) return outboxRepository;
        throw new Error('unexpected repository');
      },
    } as any,
    upsert,
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
    const { manager, upsert } = managerFor(job, company);
    const subscriber = new JobIndexingSubscriber();
    await subscriber.afterInsert({
      manager,
      entity: job,
      metadata: { target: Job },
    } as any);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateId: 'job-1',
        eventType: 'JOB_CHANGED',
      }),
      ['aggregateId', 'sourceVersion', 'eventType'],
    );
  });

  it('enqueues every job when the canonical company changes', async () => {
    const { manager, upsert } = managerFor(job, company);
    const subscriber = new JobIndexingSubscriber();
    await subscriber.afterUpdate({
      manager,
      entity: { _id: 'company-1' },
      databaseEntity: { _id: 'company-1' },
      metadata: { target: Company },
    } as any);
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
