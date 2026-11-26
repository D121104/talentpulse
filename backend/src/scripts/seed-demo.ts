import 'reflect-metadata';
import { readFileSync, statSync } from 'fs';
import * as bcrypt from 'bcryptjs';
import { DataSource, EntityManager } from 'typeorm';
import { Company } from '../companies/entities/company.entity';
import { Job } from '../jobs/entities/job.entity';
import { User, PremiumPlan } from '../users/entities/user.entity';
import { Role } from '../decorator/customize';
import { createDataSourceOptions } from '../database/data-source';

const DEMO_COMPANY_ID = '10000000-0000-4000-8000-000000000001';
const DEMO_HR_ID = '10000000-0000-4000-8000-000000000002';
const DEMO_JOB_IDS = [
  '10000000-0000-4000-8000-000000000101',
  '10000000-0000-4000-8000-000000000102',
  '10000000-0000-4000-8000-000000000103',
];
const DEFAULT_COMPANY_NAME = 'TalentPulse Demo Labs';
const DEFAULT_HR_EMAIL = 'demo.hr@talentpulse.invalid';
const JOBS = [
  {
    name: 'Demo Senior Fullstack Engineer',
    skills: ['TypeScript', 'NestJS', 'React', 'PostgreSQL', 'Docker'],
    salary: 45000000,
    level: 'SENIOR',
    location: 'Ho Chi Minh City (hybrid)',
    description:
      'Synthetic demo role for bounded job indexing and retrieval checks.',
  },
  {
    name: 'Demo AI Platform Engineer',
    skills: ['Python', 'FastAPI', 'Qdrant', 'Embeddings', 'AWS'],
    salary: 50000000,
    level: 'SENIOR',
    location: 'Hanoi (remote)',
    description:
      'Synthetic demo role for semantic retrieval and provider readiness checks.',
  },
  {
    name: 'Demo Platform Reliability Engineer',
    skills: ['Linux', 'Docker', 'PostgreSQL', 'CloudFront', 'Observability'],
    salary: 42000000,
    level: 'MID',
    location: 'Da Nang (onsite)',
    description:
      'Synthetic demo role for deterministic filters and reconciliation checks.',
  },
] as const;

function requiredSecret(): string {
  const direct = process.env.DEMO_SEED_PASSWORD;
  const file = process.env.DEMO_SEED_PASSWORD_FILE;
  if (direct && file)
    throw new Error('use only one protected demo seed password input');
  if (direct) return direct;
  if (!file)
    throw new Error(
      'DEMO_SEED_PASSWORD or DEMO_SEED_PASSWORD_FILE is required',
    );
  const mode = statSync(file).mode & 0o777;
  if ((mode & 0o077) !== 0)
    throw new Error('DEMO_SEED_PASSWORD_FILE must not be group/world readable');
  const value = readFileSync(file, 'utf8').replace(/\r?\n$/, '');
  if (!value) throw new Error('DEMO_SEED_PASSWORD_FILE is empty');
  return value;
}

function assertRuntime(): void {
  if (process.env.NODE_ENV !== 'demo')
    throw new Error('NODE_ENV must be exactly demo');
  if (process.env.DB_DATABASE !== 'talentpulse_demo')
    throw new Error('DB_DATABASE must be exactly talentpulse_demo');
  if (process.env.DB_SYNCHRONIZE !== 'false')
    throw new Error('DB_SYNCHRONIZE must be exactly false');
  if (!process.env.DB_SSL_CA_FILE)
    throw new Error('DB_SSL_CA_FILE is required');
}

async function seed(manager: EntityManager, password: string): Promise<void> {
  const companyRepo = manager.getRepository(Company);
  const userRepo = manager.getRepository(User);
  const jobRepo = manager.getRepository(Job);
  const companyName =
    process.env.DEMO_SEED_COMPANY_NAME?.trim() || DEFAULT_COMPANY_NAME;
  const hrEmail =
    process.env.DEMO_SEED_HR_EMAIL?.trim().toLowerCase() || DEFAULT_HR_EMAIL;
  if (!companyName || !hrEmail)
    throw new Error('demo seed identity is invalid');

  let company = await companyRepo.findOne({ where: { _id: DEMO_COMPANY_ID } });
  if (!company)
    company = await companyRepo.findOne({ where: { name: companyName } });
  if (!company) {
    company = companyRepo.create({ _id: DEMO_COMPANY_ID, name: companyName });
  }
  Object.assign(company, {
    name: companyName,
    description: 'Synthetic TalentPulse demo company. Not production data.',
    address: 'Demo region',
    logo: null,
    usersFollow: [],
    taxCode: 'DEMO-ONLY',
    scale: '1-10',
    pendingHrs: [],
    isActive: true,
    isPremium: false,
    isDeleted: false,
    createdBy: { _id: 'system', email: 'system@talentpulse.invalid' },
  });
  company = await companyRepo.save(company);

  let hr = await userRepo.findOne({ where: { _id: DEMO_HR_ID } });
  if (!hr) hr = await userRepo.findOne({ where: { email: hrEmail } });
  if (!hr) hr = userRepo.create({ _id: DEMO_HR_ID, email: hrEmail });
  Object.assign(hr, {
    email: hrEmail,
    password: await bcrypt.hash(password, 12),
    name: 'TalentPulse Demo HR',
    role: Role.HR,
    premiumPlan: PremiumPlan.HR_PREMIUM,
    isPremium: true,
    isApproved: true,
    isVerified: true,
    isLocked: false,
    isDeleted: false,
    company: { _id: company._id, name: company.name, isActive: true },
    createdBy: { _id: 'system', email: 'system@talentpulse.invalid' },
  });
  hr = await userRepo.save(hr);

  const startDate = new Date('2026-01-01T00:00:00.000Z');
  const endDate = new Date('2099-12-31T00:00:00.000Z');
  for (let index = 0; index < JOBS.length; index += 1) {
    const data = JOBS[index];
    let job = await jobRepo.findOne({ where: { _id: DEMO_JOB_IDS[index] } });
    if (!job) job = await jobRepo.findOne({ where: { name: data.name } });
    if (!job)
      job = jobRepo.create({ _id: DEMO_JOB_IDS[index], name: data.name });
    Object.assign(job, {
      name: data.name,
      description: data.description,
      skills: [...data.skills],
      company: {
        _id: company._id,
        name: company.name,
        logo: null,
        isActive: true,
      },
      salary: data.salary,
      level: data.level,
      location: data.location,
      quantity: 1,
      startDate,
      endDate,
      isActive: true,
      isDeleted: false,
      isHot: false,
      isFeatured: false,
      isUrgent: false,
      createdBy: { _id: hr._id, email: hr.email },
    });
    await jobRepo.save(job);
  }
}

async function main(): Promise<void> {
  assertRuntime();
  const maxJobs = Number(process.env.DEMO_SEED_MAX_JOBS ?? JOBS.length);
  if (!Number.isInteger(maxJobs) || maxJobs < JOBS.length || maxJobs > 100) {
    throw new Error(
      `DEMO_SEED_MAX_JOBS must be an integer between ${JOBS.length} and 100`,
    );
  }
  const password = requiredSecret();
  const dataSource = new DataSource(createDataSourceOptions());
  await dataSource.initialize();
  try {
    await dataSource.transaction((manager) => seed(manager, password));
    process.stdout.write(
      JSON.stringify({ seeded: true, company: 'demo', jobs: JOBS.length }) +
        '\n',
    );
  } finally {
    await dataSource.destroy();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
