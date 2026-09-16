import { EntityManager } from 'typeorm';
import { Company } from '../companies/entities/company.entity';
import { Job } from '../jobs/entities/job.entity';
import {
  assertLocalRuntime,
  LOCAL_COMPANY_ID,
  LOCAL_JOBS,
  seed,
} from './seed-local-jobs';
import { getJobSourceVersion } from '../job-indexing/job-indexing.normalization';

describe('local job seed', () => {
  it('accepts only the loopback development database contract', () => {
    expect(() =>
      assertLocalRuntime({
        NODE_ENV: 'development',
        DB_HOST: '127.0.0.1',
        DB_PORT: '5432',
        DB_DATABASE: 'recruitment_db',
      }),
    ).not.toThrow();

    expect(() =>
      assertLocalRuntime({
        NODE_ENV: 'staging',
        DB_HOST: '127.0.0.1',
        DB_PORT: '5432',
        DB_DATABASE: 'recruitment_db',
      }),
    ).toThrow();
    expect(() =>
      assertLocalRuntime({
        NODE_ENV: 'development',
        DB_HOST: 'remote.example',
        DB_PORT: '5432',
        DB_DATABASE: 'recruitment_db',
      }),
    ).toThrow();
  });

  it('defines five stable synthetic job identities', () => {
    expect(LOCAL_COMPANY_ID).toMatch(/^20000000-0000-4000-8000-/);
    expect(LOCAL_JOBS).toHaveLength(5);
    expect(new Set(LOCAL_JOBS.map((job) => job.id)).size).toBe(5);
    expect(
      LOCAL_JOBS.every((job) =>
        job.description.includes('Synthetic local fixture'),
      ),
    ).toBe(true);
  });
});

describe('local job seed persistence behavior', () => {
  const actor = {
    _id: 'local-seed',
    email: 'local-seed@talentpulse.invalid',
  };
  const timestamp = new Date('2026-02-01T00:00:00.000Z');

  function persistedCompany(): Company {
    return {
      _id: LOCAL_COMPANY_ID,
      name: 'TalentPulse Local Search Fixtures',
      description:
        'Synthetic local-only company for Candidate Assistant retrieval checks.',
      address: 'Local development fixture',
      logo: null,
      usersFollow: [],
      taxCode: 'LOCAL-SEED-ONLY',
      scale: '1-10',
      pendingHrs: [],
      isActive: true,
      isPremium: false,
      isDeleted: false,
      deletedAt: null,
      createdBy: actor,
      createdAt: timestamp,
      updatedAt: timestamp,
    } as Company;
  }

  function persistedJob(fixture: typeof LOCAL_JOBS[number]): Job {
    return {
      _id: fixture.id,
      name: fixture.name,
      description: fixture.description,
      skills: [...fixture.skills],
      // JSONB hydration does not guarantee object key insertion order.
      company: {
        _id: LOCAL_COMPANY_ID,
        logo: null,
        name: 'TalentPulse Local Search Fixtures',
        isActive: true,
      },
      // PostgreSQL's numeric hydration returns a string.
      salary: String(fixture.salary) as unknown as number,
      level: fixture.level,
      location: fixture.location,
      quantity: 1,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2099-12-31T00:00:00.000Z'),
      isActive: true,
      isHot: false,
      isFeatured: false,
      isUrgent: false,
      boostedAt: null,
      isDeleted: false,
      deletedAt: null,
      createdBy: actor,
      createdAt: timestamp,
      updatedAt: timestamp,
    } as Job;
  }

  function managerFor(
    company: Company,
    jobs: Job[],
  ): {
    manager: EntityManager;
    companyRepo: Record<string, jest.Mock>;
    jobRepo: Record<string, jest.Mock>;
  } {
    const companyRepo = {
      findOne: jest.fn().mockResolvedValue(company),
      create: jest.fn(),
      save: jest.fn().mockResolvedValue(company),
    };
    const jobRepo = {
      findOne: jest.fn(({ where }: { where: { _id: string } }) =>
        Promise.resolve(jobs.find((job) => job._id === where._id) ?? null),
      ),
      create: jest.fn(),
      save: jest.fn().mockImplementation(async (job: Job) => job),
    };
    const manager = {
      getRepository: jest.fn((entity: unknown) =>
        entity === Company ? companyRepo : jobRepo,
      ),
    } as unknown as EntityManager;
    return { manager, companyRepo, jobRepo };
  }

  it('treats a second run with numeric salary strings as a no-op', async () => {
    const company = persistedCompany();
    const jobs = LOCAL_JOBS.map(persistedJob);
    const { manager, companyRepo, jobRepo } = managerFor(company, jobs);
    const initialJobVersions = jobs.map((job) =>
      getJobSourceVersion(job, company),
    );
    const initialUpdatedAt = jobs.map((job) => job.updatedAt.getTime());

    const first = await seed(manager);
    const second = await seed(manager);

    expect(first).toEqual({
      companyCreated: false,
      jobsCreated: 0,
      jobsUpdated: 0,
    });
    expect(second).toEqual(first);
    expect(companyRepo.save).not.toHaveBeenCalled();
    expect(jobRepo.save).not.toHaveBeenCalled();
    expect(jobs.map((job) => getJobSourceVersion(job, company))).toEqual(
      initialJobVersions,
    );
    expect(jobs.map((job) => job.updatedAt.getTime())).toEqual(
      initialUpdatedAt,
    );
  });

  it('rejects a company fixed-ID collision owned by another row', async () => {
    const company = persistedCompany();
    company.createdBy = {
      _id: 'unrelated-row',
      email: 'other@example.invalid',
    };
    const { manager, companyRepo } = managerFor(company, []);

    await expect(seed(manager)).rejects.toThrow(
      `local seed company ID is already occupied: ${LOCAL_COMPANY_ID}`,
    );
    expect(companyRepo.save).not.toHaveBeenCalled();
  });

  it('rejects a job fixed-ID collision owned by another row', async () => {
    const company = persistedCompany();
    const job = persistedJob(LOCAL_JOBS[0]);
    job.createdBy = { _id: 'unrelated-row', email: 'other@example.invalid' };
    const { manager, companyRepo, jobRepo } = managerFor(company, [job]);

    await expect(seed(manager)).rejects.toThrow(
      `local seed job ID is already occupied: ${LOCAL_JOBS[0].id}`,
    );
    expect(companyRepo.save).not.toHaveBeenCalled();
    expect(jobRepo.save).not.toHaveBeenCalled();
  });
});
