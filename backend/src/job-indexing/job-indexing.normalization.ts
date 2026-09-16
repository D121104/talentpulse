import { createHash } from 'crypto';
import { decodeHTML } from 'entities';
import { Job } from 'src/jobs/entities/job.entity';
import { Company } from 'src/companies/entities/company.entity';
import { isCanonicalActiveJob } from 'src/active-jobs/active-job-query.service';
import { JOB_INDEX_VERSION } from './job-indexing.constants';
import {
  CanonicalJobProjection,
  CanonicalJobSourceVersionProjection,
} from './job-indexing.types';

function decodeHtmlEntities(value: string): string {
  return decodeHTML(value);
}

export function normalizeJobText(value: unknown): string {
  // Keep this order identical to FastAPI normalize_job_text(): decode entities,
  // remove bounded tags, then collapse whitespace.
  const decoded = decodeHtmlEntities(String(value ?? ''));
  return decoded
    .replace(/<[^>]{0,256}>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSkills(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => normalizeJobText(item))
        .filter(Boolean)
        .sort()
    : [];
}

function normalizeSalary(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'number' ? value : Number(value);
}

export function buildCanonicalJobSnapshot(
  job: Job,
  company: Company,
): import('./job-indexing.types').CanonicalJobSnapshot {
  return {
    job_id: job._id,
    title: normalizeJobText(job.name),
    description: normalizeJobText(job.description),
    skills: normalizeSkills(job.skills),
    company_id: company._id,
    company_name: normalizeJobText(company.name),
    location: job.location ? normalizeJobText(job.location) : null,
    level: job.level ? normalizeJobText(job.level) : null,
    work_mode: null,
    employment_type: null,
    // PostgreSQL `numeric` columns are hydrated by TypeORM as strings. The
    // external contract is strict and requires a JSON number.
    salary: normalizeSalary(job.salary),
    salary_currency: null,
    start_date: job.startDate?.toISOString() ?? null,
    end_date: job.endDate?.toISOString() ?? null,
    is_active: Boolean(job.isActive),
    is_deleted: Boolean(job.isDeleted),
    company_is_active: Boolean(company.isActive),
    company_is_deleted: Boolean(company.isDeleted),
  };
}

export function buildJobRepresentationFromSnapshot(
  snapshot: Pick<
    import('./job-indexing.types').CanonicalJobSnapshot,
    | 'title'
    | 'description'
    | 'skills'
    | 'company_name'
    | 'location'
    | 'level'
    | 'work_mode'
    | 'employment_type'
  >,
): string {
  const parts = [
    ['title', snapshot.title],
    ['description', snapshot.description],
    [
      'skills',
      snapshot.skills
        .map((skill) => normalizeJobText(skill))
        .sort()
        .join(', '),
    ],
    ['company', snapshot.company_name],
    ['location', snapshot.location ?? ''],
    ['level', snapshot.level ?? ''],
    ['work_mode', snapshot.work_mode ?? ''],
    ['employment_type', snapshot.employment_type ?? ''],
  ];
  return parts
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `${key}: ${normalizeJobText(value)}`)
    .join('\n');
}

export function buildJobRepresentation(job: Job, company: Company): string {
  return buildJobRepresentationFromSnapshot(
    buildCanonicalJobSnapshot(job, company),
  );
}

export function computeJobContentHashFromSnapshot(
  snapshot: Pick<
    import('./job-indexing.types').CanonicalJobSnapshot,
    | 'title'
    | 'description'
    | 'skills'
    | 'company_name'
    | 'location'
    | 'level'
    | 'work_mode'
    | 'employment_type'
  >,
): string {
  return createHash('sha256')
    .update(buildJobRepresentationFromSnapshot(snapshot), 'utf8')
    .digest('hex');
}

export function computeJobContentHash(job: Job, company: Company): string {
  return computeJobContentHashFromSnapshot(
    buildCanonicalJobSnapshot(job, company),
  );
}

/**
 * Canonical source state for indexing and CV-job freshness fencing.
 *
 * The current entities use their UpdateDateColumn timestamps as the source
 * state. Business mutations therefore remain fenced by the persisted
 * timestamps, while contentHash and JOB_INDEX_VERSION retain independent
 * meanings. Non-canonical entity metadata is deliberately excluded.
 */
export function buildCanonicalJobSourceVersionProjection(
  job: Job,
  company: Company,
): CanonicalJobSourceVersionProjection {
  return {
    job_updated_at: job.updatedAt?.toISOString() ?? '',
    company_updated_at: company.updatedAt?.toISOString() ?? '',
  };
}

export function serializeCanonicalJobSourceVersion(
  projection: CanonicalJobSourceVersionProjection,
): string {
  return `${projection.job_updated_at}|${projection.company_updated_at}`;
}

export function getJobSourceVersion(job: Job, company: Company): string {
  return createHash('sha256')
    .update(
      serializeCanonicalJobSourceVersion(
        buildCanonicalJobSourceVersionProjection(job, company),
      ),
      'utf8',
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

export function buildJobPayload(
  projection: CanonicalJobProjection,
  representationVersion = JOB_INDEX_VERSION,
) {
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
    representation_version: representationVersion,
    index_version: representationVersion,
    source_version: projection.sourceVersion,
  };
}

export function deterministicJobPointId(
  jobId: string,
  representationVersion = JOB_INDEX_VERSION,
): string {
  const digest = createHash('sha256')
    .update(`talentpulse:${representationVersion}:job:${jobId}`)
    .digest('hex');
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(
    13,
    16,
  )}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}
