import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource, EntityManager } from 'typeorm';
import { Company } from '../companies/entities/company.entity';
import { Job } from '../jobs/entities/job.entity';
import { createDataSourceOptions } from '../database/data-source-options';

dotenv.config();

export const LOCAL_COMPANY_ID = '20000000-0000-4000-8000-000000000001';

const SYSTEM_ACTOR = {
  _id: 'local-seed',
  email: 'local-seed@talentpulse.invalid',
};

export const LOCAL_JOBS = [
  {
    id: '20000000-0000-4000-8000-000000000101',
    name: 'Local Backend API Engineer',
    skills: ['TypeScript', 'NestJS', 'PostgreSQL', 'REST APIs', 'Docker'],
    salary: 38000000,
    level: 'MID',
    location: 'Ho Chi Minh City (hybrid)',
    description:
      'Synthetic local fixture for backend API search, PostgreSQL persistence, and service integration tests.',
  },
  {
    id: '20000000-0000-4000-8000-000000000102',
    name: 'Local Machine Learning Platform Engineer',
    skills: ['Python', 'FastAPI', 'Embeddings', 'Qdrant', 'Ollama'],
    salary: 46000000,
    level: 'SENIOR',
    location: 'Hanoi (remote)',
    description:
      'Synthetic local fixture for semantic retrieval over machine learning platforms, vector search, and model serving.',
  },
  {
    id: '20000000-0000-4000-8000-000000000103',
    name: 'Local Frontend Accessibility Engineer',
    skills: ['React', 'TypeScript', 'Vite', 'Accessibility', 'Testing'],
    salary: 34000000,
    level: 'MID',
    location: 'Da Nang (onsite)',
    description:
      'Synthetic local fixture for frontend search with accessible React interfaces, browser testing, and design systems.',
  },
  {
    id: '20000000-0000-4000-8000-000000000104',
    name: 'Local Data Platform Engineer',
    skills: ['Python', 'SQL', 'PostgreSQL', 'ETL', 'Data Quality'],
    salary: 41000000,
    level: 'SENIOR',
    location: 'Ho Chi Minh City (onsite)',
    description:
      'Synthetic local fixture for data engineering retrieval, reliable ETL pipelines, SQL, and data quality monitoring.',
  },
  {
    id: '20000000-0000-4000-8000-000000000105',
    name: 'Local Site Reliability Engineer',
    skills: ['Linux', 'Docker', 'Kubernetes', 'Observability', 'CI/CD'],
    salary: 43000000,
    level: 'SENIOR',
    location: 'Hanoi (hybrid)',
    description:
      'Synthetic local fixture for reliability search, container operations, deployment automation, and monitoring.',
  },
] as const;

const COMPANY_NAME = 'TalentPulse Local Search Fixtures';
const COMPANY_DESCRIPTION =
  'Synthetic local-only company for Candidate Assistant retrieval checks.';
const START_DATE = new Date('2026-01-01T00:00:00.000Z');
const END_DATE = new Date('2099-12-31T00:00:00.000Z');

function sameValue(left: unknown, right: unknown): boolean {
  const numericPair =
    (typeof left === 'number' && typeof right === 'string') ||
    (typeof left === 'string' && typeof right === 'number');
  if (numericPair && String(left).trim() && String(right).trim()) {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
      return leftNumber === rightNumber;
    }
  }
  if (left instanceof Date || right instanceof Date) {
    return (
      left instanceof Date &&
      right instanceof Date &&
      left.getTime() === right.getTime()
    );
  }
  if (left === right) return true;
  if (
    !left ||
    !right ||
    typeof left !== 'object' ||
    typeof right !== 'object'
  ) {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => sameValue(value, right[index]))
    );
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(rightRecord, key) &&
        sameValue(leftRecord[key], rightRecord[key]),
    )
  );
}

function isOwnedByLocalSeed(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const actor = value as { _id?: unknown; email?: unknown };
  return actor._id === SYSTEM_ACTOR._id && actor.email === SYSTEM_ACTOR.email;
}

function hasDrift<T extends object>(entity: T, desired: Partial<T>): boolean {
  const current = entity as unknown as Record<string, unknown>;
  return Object.entries(desired).some(
    ([key, value]) => !sameValue(current[key], value),
  );
}

export function assertLocalRuntime(
  config: Record<string, unknown> = process.env as Record<string, unknown>,
): void {
  const nodeEnv = String(config.NODE_ENV ?? 'development')
    .trim()
    .toLowerCase();
  const host = String(config.DB_HOST ?? 'localhost')
    .trim()
    .toLowerCase();
  const port = String(config.DB_PORT ?? '5432').trim();
  const database = String(config.DB_DATABASE ?? 'recruitment_db').trim();

  if (nodeEnv !== 'development')
    throw new Error('local job seed requires NODE_ENV=development');
  if (!['localhost', '127.0.0.1', '::1'].includes(host))
    throw new Error('local job seed requires a loopback DB_HOST');
  if (port !== '5432') throw new Error('local job seed requires DB_PORT=5432');
  if (database !== 'recruitment_db')
    throw new Error('local job seed requires DB_DATABASE=recruitment_db');
}

export async function seed(manager: EntityManager): Promise<{
  companyCreated: boolean;
  jobsCreated: number;
  jobsUpdated: number;
}> {
  const companyRepo = manager.getRepository(Company);
  const jobRepo = manager.getRepository(Job);
  let company = await companyRepo.findOne({
    where: { _id: LOCAL_COMPANY_ID },
    withDeleted: true,
  });

  if (
    company &&
    (!isOwnedByLocalSeed(company.createdBy) || company.name !== COMPANY_NAME)
  ) {
    throw new Error(
      `local seed company ID is already occupied: ${LOCAL_COMPANY_ID}`,
    );
  }
  if (!company) {
    const conflictingCompany = await companyRepo.findOne({
      where: { name: COMPANY_NAME },
      withDeleted: true,
    });
    if (conflictingCompany) {
      throw new Error(
        `local seed company name is already occupied: ${COMPANY_NAME}`,
      );
    }
    company = companyRepo.create({ _id: LOCAL_COMPANY_ID, name: COMPANY_NAME });
  }

  const companyValues: Partial<Company> = {
    name: COMPANY_NAME,
    description: COMPANY_DESCRIPTION,
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
    createdBy: SYSTEM_ACTOR,
  };
  const companyCreated = !company.createdAt;
  if (hasDrift(company, companyValues)) {
    Object.assign(company, companyValues);
    company = await companyRepo.save(company);
  }

  let jobsCreated = 0;
  let jobsUpdated = 0;
  for (const fixture of LOCAL_JOBS) {
    let job = await jobRepo.findOne({
      where: { _id: fixture.id },
      withDeleted: true,
    });
    if (
      job &&
      (!isOwnedByLocalSeed(job.createdBy) ||
        job.name !== fixture.name ||
        job.company?._id !== company._id)
    ) {
      throw new Error(`local seed job ID is already occupied: ${fixture.id}`);
    }
    const wasCreated = !job;
    if (!job) {
      job = jobRepo.create({ _id: fixture.id, name: fixture.name });
      jobsCreated += 1;
    }

    const jobValues: Partial<Job> = {
      name: fixture.name,
      description: fixture.description,
      skills: [...fixture.skills],
      company: {
        _id: company._id,
        name: company.name,
        logo: null,
        isActive: true,
      },
      salary: fixture.salary,
      level: fixture.level,
      location: fixture.location,
      quantity: 1,
      startDate: START_DATE,
      endDate: END_DATE,
      isActive: true,
      isDeleted: false,
      deletedAt: null,
      isHot: false,
      isFeatured: false,
      isUrgent: false,
      boostedAt: null,
      createdBy: SYSTEM_ACTOR,
    };
    if (hasDrift(job, jobValues)) {
      Object.assign(job, jobValues);
      await jobRepo.save(job);
      if (!wasCreated) jobsUpdated += 1;
    }
  }

  return { companyCreated, jobsCreated, jobsUpdated };
}

export async function main(): Promise<void> {
  assertLocalRuntime();
  const dataSource = new DataSource(createDataSourceOptions());
  await dataSource.initialize();
  try {
    const result = await dataSource.transaction((manager) => seed(manager));
    process.stdout.write(
      JSON.stringify({
        seeded: true,
        company: { id: LOCAL_COMPANY_ID, name: COMPANY_NAME },
        jobs: LOCAL_JOBS.map(({ id, name, location, level }) => ({
          id,
          name,
          location,
          level,
        })),
        ...result,
      }) + '\n',
    );
  } finally {
    await dataSource.destroy();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
