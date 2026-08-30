import { BadRequestException } from '@nestjs/common';
import { Job } from './entities/job.entity';
import { JobsService } from './jobs.service';
import { IUser } from '../users/users.interface';
import { Role } from '../decorator/customize';
import {
  AiIndexAggregateType,
  AiIndexOutboxOperation,
} from '../ai-indexing/entities';

const JOB_ID = '11111111-1111-4111-8111-111111111111';
const HR_ID = '22222222-2222-4222-8222-222222222222';
const COMPANY_A_ID = '33333333-3333-4333-8333-333333333333';
const COMPANY_B_ID = '44444444-4444-4444-8444-444444444444';
const HR_EMAIL = 'hr@example.test';

type JobMutation = 'update' | 'remove' | 'boost';

interface JobsHarness {
  service: JobsService;
  manager: Record<string, jest.Mock>;
  preflightJob: Job;
  lockedJob: Job;
  jobRepository: Record<string, jest.Mock>;
  companyRepository: Record<string, jest.Mock>;
  usersService: Record<string, jest.Mock>;
  redisService: Record<string, jest.Mock>;
  cvProcessingService: Record<string, jest.Mock>;
  aiIndexingService: Record<string, jest.Mock>;
}

function companySnapshot(_id: string, name = _id) {
  return { _id, name, logo: `${name}.png`, isActive: true };
}

function makeJob(companyId: string): Job {
  return {
    _id: JOB_ID,
    name: 'Original job',
    description: 'Original description',
    skills: ['TypeScript'],
    company: companySnapshot(companyId),
    isDeleted: false,
    deletedAt: null,
    isActive: true,
    isHot: false,
    boostedAt: null,
  } as Job;
}

function makeUser(role: Role, companyId?: string): IUser {
  return {
    _id: HR_ID,
    email: HR_EMAIL,
    name: role === Role.ADMIN ? 'Admin' : 'HR',
    role,
    age: 30,
    ...(companyId ? { company: companySnapshot(companyId) } : {}),
  };
}

function createHarness(
  userInDb = makeUser(Role.HR, COMPANY_A_ID),
): JobsHarness {
  const preflightJob = makeJob(COMPANY_B_ID);
  const lockedJob = makeJob(COMPANY_B_ID);

  const jobRepository: Record<string, jest.Mock> = {
    create: jest.fn((value: Partial<Job>) => value),
    findOne: jest.fn(async () => lockedJob),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    save: jest.fn(async (job: Job) => job),
    softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const companyRepository: Record<string, jest.Mock> = {
    findOne: jest.fn(async ({ where }: { where: { _id: string } }) => ({
      _id: where._id,
      name: where._id === COMPANY_A_ID ? 'Company A' : 'Company B',
      logo: 'company.png',
      isActive: true,
      usersFollow: [],
    })),
  };
  const usersService: Record<string, jest.Mock> = {
    findOneByEmail: jest.fn().mockResolvedValue(userInDb),
    isHrPremium: jest.fn().mockReturnValue(false),
    getUserMaxActiveJobs: jest.fn().mockReturnValue(6),
  };
  const redisService: Record<string, jest.Mock> = {
    invalidateJobsCache: jest.fn().mockResolvedValue(undefined),
  };
  const cvProcessingService: Record<string, jest.Mock> = {
    reprocessAllCVsForJob: jest.fn().mockResolvedValue(undefined),
  };
  const aiIndexingService: Record<string, jest.Mock> = {
    enqueueWithNextSourceVersion: jest.fn().mockResolvedValue({}),
  };

  const manager: Record<string, jest.Mock> = {
    getRepository: jest.fn(() => jobRepository),
  };
  const transaction = jest.fn(
    async (callback: (transactionManager: unknown) => Promise<unknown>) =>
      callback(manager),
  );
  const activeJobQueryService = {
    findNonDeletedById: jest.fn().mockResolvedValue(preflightJob),
  };

  const service = new JobsService(
    {} as never,
    redisService as never,
    companyRepository as never,
    {} as never,
    usersService as never,
    { createBulk: jest.fn() } as never,
    cvProcessingService as never,
    activeJobQueryService as never,
    { transaction } as never,
    aiIndexingService as never,
  );

  return {
    service,
    manager,
    preflightJob,
    lockedJob,
    jobRepository,
    companyRepository,
    usersService,
    redisService,
    cvProcessingService,
    aiIndexingService,
  };
}

async function invokeMutation(
  service: JobsService,
  mutation: JobMutation,
  user: IUser,
  dto: Record<string, unknown> = {},
) {
  if (mutation === 'update') return service.update(JOB_ID, dto as never, user);
  if (mutation === 'remove') return service.remove(JOB_ID, user);
  return service.boostJob(JOB_ID, user);
}

function expectNoMutationOrPostCommitSideEffects(harness: JobsHarness) {
  expect(harness.jobRepository.update).not.toHaveBeenCalled();
  expect(harness.jobRepository.save).not.toHaveBeenCalled();
  expect(harness.jobRepository.softDelete).not.toHaveBeenCalled();
  expect(
    harness.aiIndexingService.enqueueWithNextSourceVersion,
  ).not.toHaveBeenCalled();
  expect(harness.redisService.invalidateJobsCache).not.toHaveBeenCalled();
  expect(
    harness.cvProcessingService.reprocessAllCVsForJob,
  ).not.toHaveBeenCalled();
}

describe('JobsService job mutation authorization', () => {
  it.each(['update', 'remove', 'boost'] as JobMutation[])(
    'rejects an HR without a company attempting to %s a foreign job',
    async (mutation) => {
      const harness = createHarness(makeUser(Role.HR));
      harness.usersService.isHrPremium.mockReturnValue(true);

      await expect(
        invokeMutation(
          harness.service,
          mutation,
          makeUser(Role.HR),
          mutation === 'update' ? { description: 'tampered' } : undefined,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expectNoMutationOrPostCommitSideEffects(harness);
    },
  );

  it.each(['update', 'remove', 'boost'] as JobMutation[])(
    'rejects a company A HR attempting to %s a company B job without a company DTO',
    async (mutation) => {
      const harness = createHarness(makeUser(Role.HR, COMPANY_A_ID));
      harness.usersService.isHrPremium.mockReturnValue(true);

      await expect(
        invokeMutation(
          harness.service,
          mutation,
          makeUser(Role.HR, COMPANY_A_ID),
          mutation === 'update' ? { description: 'tampered' } : undefined,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expectNoMutationOrPostCommitSideEffects(harness);
    },
  );

  it('rejects an HR from reassigning a company B job to company A', async () => {
    const harness = createHarness(makeUser(Role.HR, COMPANY_A_ID));
    harness.companyRepository.findOne.mockResolvedValue({
      _id: COMPANY_A_ID,
      name: 'Company A',
      logo: 'company-a.png',
      isActive: true,
    });

    await expect(
      harness.service.update(
        JOB_ID,
        { company: companySnapshot(COMPANY_A_ID) } as never,
        makeUser(Role.HR, COMPANY_A_ID),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expectNoMutationOrPostCommitSideEffects(harness);
  });

  it.each([
    ['update', AiIndexOutboxOperation.UPSERT],
    ['remove', AiIndexOutboxOperation.DELETE],
    ['boost', AiIndexOutboxOperation.UPSERT],
  ] as Array<[JobMutation, AiIndexOutboxOperation]>)(
    'allows an authorized company A HR to %s its company A job and enqueue indexing',
    async (mutation, operation) => {
      const harness = createHarness(makeUser(Role.HR, COMPANY_A_ID));
      harness.preflightJob.company = companySnapshot(COMPANY_A_ID, 'Company A');
      harness.lockedJob.company = companySnapshot(COMPANY_A_ID, 'Company A');
      harness.usersService.isHrPremium.mockReturnValue(true);

      await expect(
        invokeMutation(
          harness.service,
          mutation,
          makeUser(Role.HR, COMPANY_A_ID),
          mutation === 'update' ? { name: 'Updated job' } : undefined,
        ),
      ).resolves.toBeDefined();

      expect(
        harness.aiIndexingService.enqueueWithNextSourceVersion,
      ).toHaveBeenCalledWith(
        {
          aggregateType: AiIndexAggregateType.JOB,
          aggregateId: JOB_ID,
          operation,
        },
        harness.manager,
      );
      expect(harness.redisService.invalidateJobsCache).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['update', 'remove', 'boost'] as JobMutation[])(
    'allows an admin to %s a foreign job even when the admin has another company',
    async (mutation) => {
      const admin = makeUser(Role.ADMIN, COMPANY_A_ID);
      const harness = createHarness(admin);
      harness.usersService.isHrPremium.mockReturnValue(false);

      await expect(
        invokeMutation(
          harness.service,
          mutation,
          admin,
          mutation === 'update' ? { name: 'Admin update' } : undefined,
        ),
      ).resolves.toBeDefined();

      expect(
        harness.aiIndexingService.enqueueWithNextSourceVersion,
      ).toHaveBeenCalledTimes(1);
      expect(harness.redisService.invalidateJobsCache).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['update', 'remove', 'boost'] as JobMutation[])(
    'rejects %s when the locked job company differs from the authorized preflight row',
    async (mutation) => {
      const harness = createHarness(makeUser(Role.HR, COMPANY_A_ID));
      harness.preflightJob.company = companySnapshot(COMPANY_A_ID, 'Company A');
      harness.lockedJob.company = companySnapshot(COMPANY_B_ID, 'Company B');
      harness.usersService.isHrPremium.mockReturnValue(true);

      await expect(
        invokeMutation(
          harness.service,
          mutation,
          makeUser(Role.HR, COMPANY_A_ID),
          mutation === 'update' ? { name: 'tampered' } : undefined,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expectNoMutationOrPostCommitSideEffects(harness);
    },
  );

  it('does not create a job for an unassigned non-admin HR', async () => {
    const harness = createHarness(makeUser(Role.HR));
    const createDto = {
      name: 'Foreign job',
      description: 'Should not persist',
      skills: ['TypeScript'],
      company: companySnapshot(COMPANY_B_ID),
      salary: 1000,
      level: 'Senior',
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T00:00:00.000Z'),
      quantity: 1,
      location: 'Remote',
      isActive: true,
    };

    await expect(
      harness.service.create(createDto as never, makeUser(Role.HR)),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(harness.jobRepository.save).not.toHaveBeenCalled();
    expect(
      harness.aiIndexingService.enqueueWithNextSourceVersion,
    ).not.toHaveBeenCalled();
    expect(harness.redisService.invalidateJobsCache).not.toHaveBeenCalled();
  });
});
