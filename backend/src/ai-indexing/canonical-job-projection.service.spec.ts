import { CanonicalJobProjectionService } from './services/canonical-job-projection.service';
import { Company } from '../companies/entities/company.entity';
import { Job } from '../jobs/entities/job.entity';

const JOB_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_ID = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-08-28T12:00:00.000Z');

function createJob(overrides: Partial<Job> = {}): Job {
  return {
    _id: JOB_ID,
    name: 'Backend Engineer',
    description: '<p>Build APIs</p>',
    skills: ['TypeScript', 'NestJS'],
    company: {
      _id: COMPANY_ID,
      name: 'Stale JSONB Company',
      isActive: false,
    },
    salary: 30_000_000,
    level: 'MID',
    startDate: new Date('2026-08-01T00:00:00.000Z'),
    quantity: 1,
    location: 'Ha Noi',
    endDate: new Date('2026-09-30T00:00:00.000Z'),
    isActive: true,
    isHot: false,
    boostedAt: null,
    isFeatured: false,
    isUrgent: false,
    isDeleted: false,
    createdBy: null,
    updatedBy: null,
    deletedBy: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-27T11:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  } as Job;
}

function createCompany(overrides: Partial<Company> = {}): Company {
  return {
    _id: COMPANY_ID,
    name: 'Canonical Company',
    description: null,
    address: null,
    logo: null,
    usersFollow: [],
    taxCode: null,
    scale: null,
    pendingHrs: [],
    isActive: true,
    isPremium: false,
    premiumExpiresAt: null,
    isDeleted: false,
    createdBy: null,
    updatedBy: null,
    deletedBy: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-27T11:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  } as Company;
}

describe('CanonicalJobProjectionService', () => {
  it('uses canonical company name/status and emits bounded ISO/numeric fields', async () => {
    const jobRepository = {
      findOne: jest.fn().mockResolvedValue(createJob()),
    };
    const companyRepository = {
      findOne: jest.fn().mockResolvedValue(createCompany()),
    };
    const service = new CanonicalJobProjectionService(
      jobRepository as never,
      companyRepository as never,
    );

    const request = await service.buildUpsertRequest(
      JOB_ID,
      7,
      'ai-index:event-7:UPSERT',
      NOW,
    );

    expect(request).toMatchObject({
      source_version: 7,
      idempotency_key: 'ai-index:event-7:UPSERT',
      job: {
        job_id: JOB_ID,
        company_id: COMPANY_ID,
        company_name: 'Canonical Company',
        company_is_active: true,
        company_is_deleted: false,
        salary: 30_000_000,
        salary_currency: 'VND',
        start_date: '2026-08-01T00:00:00.000Z',
        end_date: '2026-09-30T00:00:00.000Z',
        updated_at: '2026-08-27T11:00:00.000Z',
      },
    });
    expect(request?.job.company_name).not.toBe('Stale JSONB Company');
    expect(jobRepository.findOne).toHaveBeenCalledWith({
      where: { _id: JOB_ID },
      withDeleted: true,
    });
    expect(companyRepository.findOne).toHaveBeenCalledWith({
      where: { _id: COMPANY_ID },
      withDeleted: true,
    });
  });

  it('keeps delete hydration available for soft-deleted jobs and exposes a non-deleted path', async () => {
    const job = createJob({
      isActive: false,
      isDeleted: true,
      deletedAt: new Date('2026-08-28T10:00:00.000Z'),
    });
    const jobRepository = {
      findOne: jest.fn().mockResolvedValue(job),
    };
    const companyRepository = {
      findOne: jest.fn().mockResolvedValue(createCompany()),
    };
    const service = new CanonicalJobProjectionService(
      jobRepository as never,
      companyRepository as never,
    );

    const projection = await service.projectJob(JOB_ID, NOW);
    const nonDeleted = await service.findNonDeletedJob(JOB_ID);

    expect(projection).toMatchObject({
      job,
      isCanonicalActive: false,
      snapshot: null,
    });
    expect(nonDeleted).toBe(job);
    expect(jobRepository.findOne).toHaveBeenNthCalledWith(2, {
      where: { _id: JOB_ID },
      withDeleted: false,
    });
  });

  it('normalizes a database numeric string and null salary without using JSONB values', () => {
    const service = new CanonicalJobProjectionService({} as never, {} as never);
    const snapshot = service.toCanonicalJobSnapshot(
      createJob({ salary: '45000000' as unknown as number }),
      createCompany({ name: 'Authoritative Co' }),
    );

    expect(snapshot.salary).toBe(45_000_000);
    expect(snapshot.company_name).toBe('Authoritative Co');
    expect(
      service.toCanonicalJobSnapshot(
        createJob({ salary: null }),
        createCompany(),
      ).salary,
    ).toBeNull();
  });
});
