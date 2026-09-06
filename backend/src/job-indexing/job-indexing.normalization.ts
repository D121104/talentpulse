import { createHash } from 'crypto';
import { Job } from 'src/jobs/entities/job.entity';
import { Company } from 'src/companies/entities/company.entity';
import { isCanonicalActiveJob } from 'src/active-jobs/active-job-query.service';
import { JOB_INDEX_VERSION } from './job-indexing.constants';
import { CanonicalJobProjection } from './job-indexing.types';

function normalize(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeSkills(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => normalize(item))
        .filter(Boolean)
        .sort()
    : [];
}

export function buildJobRepresentation(job: Job, company: Company): string {
  const representation = {
    title: normalize(job.name),
    description: normalize(job.description),
    skills: normalizeSkills(job.skills),
    level: normalize(job.level),
    location: normalize(job.location),
    company: normalize(company.name),
    companyDescription: normalize(company.description),
    companyAddress: normalize(company.address),
  };
  return [
    representation.title,
    representation.description,
    representation.skills.join(', '),
    representation.level,
    representation.location,
    representation.company,
    representation.companyDescription,
    representation.companyAddress,
  ]
    .filter(Boolean)
    .join('\n');
}

export function computeJobContentHash(job: Job, company: Company): string {
  const representation = buildJobRepresentation(job, company);
  return createHash('sha256').update(representation, 'utf8').digest('hex');
}

export function getJobSourceVersion(job: Job, company: Company): string {
  return createHash('sha256')
    .update(
      `${job.updatedAt?.toISOString() ?? ''}|${
        company.updatedAt?.toISOString() ?? ''
      }`,
    )
    .digest('hex');
}

export function buildCanonicalProjection(
  job: Job,
  company: Company,
  now = new Date(),
): CanonicalJobProjection {
  const active = isCanonicalActiveJob(job, company, now);
  return {
    job,
    company,
    active,
    contentHash: computeJobContentHash(job, company),
    sourceVersion: getJobSourceVersion(job, company),
    text: buildJobRepresentation(job, company),
  };
}

export function buildJobPayload(projection: CanonicalJobProjection) {
  return {
    job_id: projection.job._id,
    company_id: projection.company._id,
    status: 'ACTIVE' as const,
    is_active: true as const,
    is_deleted: false as const,
    company_is_active: true as const,
    location: projection.job.location ?? null,
    level: projection.job.level ?? null,
    salary: projection.job.salary ?? null,
    content_hash: projection.contentHash,
    representation_version: JOB_INDEX_VERSION,
    index_version: JOB_INDEX_VERSION,
    source_version: projection.sourceVersion,
  };
}

export function deterministicJobPointId(jobId: string): string {
  const digest = createHash('sha256')
    .update(`talentpulse:${JOB_INDEX_VERSION}:job:${jobId}`)
    .digest('hex');
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(
    13,
    16,
  )}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}
