import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  CanonicalJobSnapshot,
  IndexJobUpsertRequest,
  assertIndexJobUpsertRequest,
} from '../../ai-client/contracts/indexing.contracts';
import { isCanonicalActiveJob } from '../../active-jobs/active-job-query.service';
import { Company } from '../../companies/entities/company.entity';
import { Job } from '../../jobs/entities/job.entity';
import { In, Repository } from 'typeorm';
import { validate as isUuid } from 'uuid';

const MAX_DESCRIPTION_CHARS = 50_000;
const MAX_SKILLS = 50;
const MAX_SKILL_CHARS = 500;
const MAX_TEXT_CHARS = 500;

export interface CanonicalProjectionLookupOptions {
  /** Defaults to true so delete/deactivation events can see soft-deleted rows. */
  withDeleted?: boolean;
}

/**
 * The hydrated projection used by the dispatcher.
 *
 * `snapshot` is nullable because a delete does not need searchable content and
 * a job may outlive its canonical company row. PostgreSQL entities remain the
 * source of truth throughout this lookup.
 */
export interface CanonicalJobProjection {
  job: Job;
  company: Company | null;
  snapshot: CanonicalJobSnapshot | null;
  isCanonicalActive: boolean;
}

export interface CanonicalJobScanPage {
  jobs: CanonicalJobProjection[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CanonicalCompanyJobScanPage {
  jobs: CanonicalJobProjection[];
  nextCursor: string | null;
  hasMore: boolean;
}

export const MAX_CANONICAL_JOB_SCAN_SIZE = 100;
export const MAX_COMPANY_JOB_SCAN_SIZE = 1_000;

/** Error raised for malformed canonical data that cannot be sent to AI. */
export class CanonicalProjectionError extends Error {
  readonly name = 'CanonicalProjectionError';
  readonly retryable = false;
  readonly code: string;

  constructor(message: string, code = 'AI_CANONICAL_PROJECTION_INVALID') {
    super(message);
    this.code = code;
  }
}

/**
 * Builds the only job shape allowed to cross the NestJS → AI boundary.
 *
 * The `job.company` JSONB value is used only to locate the canonical company
 * row. Its name and lifecycle flags are never copied into the outgoing request.
 */
@Injectable()
export class CanonicalJobProjectionService {
  constructor(
    @InjectRepository(Job)
    private readonly jobRepository: Repository<Job>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
  ) {}

  async findJob(
    jobId: string,
    options: CanonicalProjectionLookupOptions = {},
  ): Promise<Job | null> {
    return this.jobRepository.findOne({
      where: { _id: jobId },
      withDeleted: options.withDeleted ?? true,
    });
  }

  async findNonDeletedJob(jobId: string): Promise<Job | null> {
    return this.findJob(jobId, { withDeleted: false });
  }

  async findCompany(
    companyId: string,
    options: CanonicalProjectionLookupOptions = {},
  ): Promise<Company | null> {
    return this.companyRepository.findOne({
      where: { _id: companyId },
      withDeleted: options.withDeleted ?? true,
    });
  }

  /**
   * Hydrates one job and its canonical company. This path intentionally uses
   * `withDeleted` by default because a delete event must be able to clean up
   * vectors after a soft delete.
   */
  async projectJob(
    jobId: string,
    now = new Date(),
    options: CanonicalProjectionLookupOptions = {},
  ): Promise<CanonicalJobProjection | null> {
    const job = await this.findJob(jobId, options);
    if (!job) return null;

    const companyId = job.company?._id;
    const company = companyId
      ? await this.findCompany(companyId, options)
      : null;
    return this.toProjection(job, company, now);
  }

  /**
   * Scans canonical jobs with a UUID keyset cursor.
   *
   * `withDeleted()` is intentional: backfill/reconcile must be able to enqueue
   * cleanup for soft-deleted jobs. Company status and names are hydrated from
   * the canonical Company table rather than trusted from Job JSONB.
   */
  async scanJobs(
    cursor: string | null = null,
    limit = MAX_CANONICAL_JOB_SCAN_SIZE,
    now = new Date(),
  ): Promise<CanonicalJobScanPage> {
    const boundedLimit = boundedScanLimit(limit);
    const normalizedCursor = normalizeCursor(cursor);
    const query = this.jobRepository.createQueryBuilder('job').withDeleted();

    if (normalizedCursor) {
      query.where('job."_id" > :jobCursor', { jobCursor: normalizedCursor });
    }

    const rows = await query
      .orderBy('job._id', 'ASC')
      .take(boundedLimit + 1)
      .getMany();
    const hasMore = rows.length > boundedLimit;
    const jobs = hasMore ? rows.slice(0, boundedLimit) : rows;
    const companyIds = [
      ...new Set(
        jobs
          .map((job) => job.company?._id)
          .filter((companyId): companyId is string => isUuid(companyId)),
      ),
    ];
    const companies = companyIds.length
      ? await this.companyRepository.find({
          where: { _id: In(companyIds) },
          withDeleted: true,
        })
      : [];
    const companyById = new Map(
      companies.map((company) => [company._id, company]),
    );
    const projections = jobs.map((job) =>
      this.toProjection(
        job,
        companyById.get(job.company?._id ?? '') ?? null,
        now,
      ),
    );
    const nextCursor = hasMore
      ? projections[projections.length - 1]?.job._id ?? normalizedCursor
      : null;

    return { jobs: projections, nextCursor, hasMore };
  }

  /** Alias kept explicit for callers that prefer the domain terminology. */
  async loadCanonicalJob(
    jobId: string,
    now = new Date(),
    options: CanonicalProjectionLookupOptions = {},
  ): Promise<CanonicalJobProjection | null> {
    return this.projectJob(jobId, now, options);
  }

  /**
   * Returns an upsert request only for a job that satisfies the canonical
   * active-job invariant. Inactive/missing jobs are represented by DELETE
   * commands in the dispatcher instead of by an invalid AI upsert request.
   */
  async buildUpsertRequest(
    jobId: string,
    sourceVersion: number,
    idempotencyKey: string,
    now = new Date(),
  ): Promise<IndexJobUpsertRequest | null> {
    const projection = await this.projectJob(jobId, now, {
      withDeleted: true,
    });
    if (!projection?.snapshot || !projection.isCanonicalActive) return null;

    return this.toIndexJobUpsertRequest(
      projection.snapshot,
      sourceVersion,
      idempotencyKey,
    );
  }

  /** Maps a validated canonical snapshot into the bounded wire request. */
  toIndexJobUpsertRequest(
    snapshot: CanonicalJobSnapshot,
    sourceVersion: number,
    idempotencyKey: string,
  ): IndexJobUpsertRequest {
    return assertIndexJobUpsertRequest({
      job: snapshot,
      source_version: sourceVersion,
      idempotency_key: idempotencyKey,
    });
  }

  /**
   * Enumerates company jobs with a bounded UUID keyset page.
   *
   * The page deliberately includes soft-deleted, inactive and expired jobs.
   * A company lifecycle event must remove every stale point, not only the
   * currently eligible jobs. Callers must continue with `nextCursor` while
   * `hasMore` is true; this method never loads the whole company into memory.
   */
  async projectCompanyJobs(
    companyId: string,
    cursor: string | null = null,
    limit = MAX_COMPANY_JOB_SCAN_SIZE,
    now = new Date(),
  ): Promise<CanonicalCompanyJobScanPage> {
    if (!isUuid(companyId)) {
      throw new CanonicalProjectionError(
        'companyId must be a UUID',
        'AI_INDEX_COMPANY_ID_INVALID',
      );
    }
    const boundedLimit = boundedCompanyScanLimit(limit);
    const normalizedCursor = normalizeCursor(cursor);
    const company = await this.findCompany(companyId, { withDeleted: true });
    const query = this.jobRepository
      .createQueryBuilder('job')
      .withDeleted()
      .where("job.company->>'_id' = :companyId", { companyId });

    if (normalizedCursor) {
      query.andWhere('job."_id" > :companyJobCursor', {
        companyJobCursor: normalizedCursor,
      });
    }

    const rows = await query
      .orderBy('job._id', 'ASC')
      .take(boundedLimit + 1)
      .getMany();
    const hasMore = rows.length > boundedLimit;
    const jobs = hasMore ? rows.slice(0, boundedLimit) : rows;
    const projections = jobs.map((job) => this.toProjection(job, company, now));
    const nextCursor = hasMore
      ? projections[projections.length - 1]?.job._id ?? normalizedCursor
      : null;

    return { jobs: projections, nextCursor, hasMore };
  }

  /** Alias for operational/reconcile callers. */
  async enumerateCompanyJobs(
    companyId: string,
    cursor: string | null = null,
    limit = MAX_COMPANY_JOB_SCAN_SIZE,
    now = new Date(),
  ): Promise<CanonicalCompanyJobScanPage> {
    return this.projectCompanyJobs(companyId, cursor, limit, now);
  }

  /**
   * Maps a Job plus canonical Company. This method is public to keep the
   * projection deterministic and straightforward to unit-test without a DB.
   */
  private toProjection(
    job: Job,
    company: Company | null,
    now: Date,
  ): CanonicalJobProjection {
    const isCanonicalActive = Boolean(
      company && isCanonicalActiveJob(job, company, now),
    );

    // A non-active job is going to the delete path. Avoid requiring searchable
    // text for that path, while still using the canonical company for status.
    const snapshot =
      company && isCanonicalActive
        ? this.toCanonicalJobSnapshot(job, company)
        : null;

    return { job, company, snapshot, isCanonicalActive };
  }

  toCanonicalJobSnapshot(job: Job, company: Company): CanonicalJobSnapshot {
    const salary = normalizeSalary(job.salary);
    const title = boundedRequiredText(job.name, 'job.name');
    const companyName = boundedRequiredText(company.name, 'company.name');

    return {
      job_id: job._id,
      title,
      description: boundedText(job.description, MAX_DESCRIPTION_CHARS) ?? '',
      skills: boundedSkills(job.skills),
      company_id: company._id,
      // Company.name is canonical authority. Never use job.company.name here.
      company_name: companyName,
      location: boundedOptionalText(job.location),
      level: boundedOptionalText(job.level),
      // The current Job entity stores salary as VND and has no currency field.
      salary,
      salary_currency: salary === null ? null : 'VND',
      start_date: toIsoDate(job.startDate, 'job.startDate'),
      end_date: toIsoDate(job.endDate, 'job.endDate'),
      updated_at: toIsoDate(job.updatedAt, 'job.updatedAt'),
      is_active: job.isActive === true,
      is_deleted: job.isDeleted === true,
      deleted_at: toIsoDate(job.deletedAt, 'job.deletedAt'),
      company_is_active: company.isActive === true,
      company_is_deleted: company.isDeleted === true,
      company_deleted_at: toIsoDate(company.deletedAt, 'company.deletedAt'),
    };
  }
}

function boundedRequiredText(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new CanonicalProjectionError(`${field} must be text`);
  }
  const bounded = value.slice(0, MAX_TEXT_CHARS);
  if (!bounded.trim()) {
    throw new CanonicalProjectionError(`${field} must not be blank`);
  }
  return bounded;
}

function boundedText(value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new CanonicalProjectionError('job text must be a string');
  }
  return value.slice(0, maxLength);
}

function boundedOptionalText(value: unknown): string | null {
  const bounded = boundedText(value, MAX_TEXT_CHARS);
  return bounded && bounded.trim() ? bounded : null;
}

function boundedSkills(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((skill): skill is string => typeof skill === 'string')
    .map((skill) => skill.slice(0, MAX_SKILL_CHARS))
    .filter((skill) => Boolean(skill.trim()))
    .slice(0, MAX_SKILLS);
}

function normalizeSalary(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric =
    typeof value === 'number' || typeof value === 'string'
      ? Number(value)
      : Number.NaN;
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 10 ** 12) {
    return null;
  }
  return numeric;
}

function toIsoDate(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new CanonicalProjectionError(`${field} is invalid`);
  }
  return date.toISOString();
}

function boundedCompanyScanLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new CanonicalProjectionError(
      'Company scan limit must be a positive safe integer',
      'AI_INDEX_COMPANY_SCAN_LIMIT_INVALID',
    );
  }
  return Math.min(value, MAX_COMPANY_JOB_SCAN_SIZE);
}

function boundedScanLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new CanonicalProjectionError(
      'Scan limit must be a positive safe integer',
      'AI_INDEX_SCAN_LIMIT_INVALID',
    );
  }
  return Math.min(value, MAX_CANONICAL_JOB_SCAN_SIZE);
}

function normalizeCursor(value: string | null): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (!isUuid(value)) {
    throw new CanonicalProjectionError(
      'Cursor must be a UUID',
      'AI_INDEX_CURSOR_INVALID',
    );
  }
  return value.toLowerCase();
}
