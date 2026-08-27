import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { SelectQueryBuilder, Repository } from 'typeorm';
import { Company } from 'src/companies/entities/company.entity';
import { Job } from 'src/jobs/entities/job.entity';

export interface CanonicalCompanyState {
  _id: string;
  isActive: boolean;
  isDeleted: boolean;
  deletedAt?: Date | null;
}

export interface ActiveJobState {
  isActive: boolean;
  isDeleted: boolean;
  deletedAt?: Date | null;
  startDate?: Date | null;
  endDate?: Date | null;
  company?: { _id?: string } | null;
}

export function isCanonicalActiveJob(
  job: ActiveJobState,
  company: CanonicalCompanyState | null | undefined,
  now: Date,
): boolean {
  return Boolean(
    company &&
      job.isActive === true &&
      job.isDeleted === false &&
      !job.deletedAt &&
      company.isActive === true &&
      company.isDeleted === false &&
      !company.deletedAt &&
      (!job.startDate || job.startDate <= now) &&
      (!job.endDate || now < job.endDate) &&
      job.company?._id === company._id,
  );
}

@Injectable()
export class ActiveJobQueryService {
  constructor(
    @InjectRepository(Job)
    private readonly jobRepo: Repository<Job>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
  ) {}

  /**
   * Applies the canonical active-job invariant. The JSONB company snapshot is
   * used only to join to the canonical company row; its status is never trusted.
   */
  applyActivePredicate(
    queryBuilder: SelectQueryBuilder<Job>,
    now = new Date(),
  ): SelectQueryBuilder<Job> {
    return queryBuilder
      .innerJoin(
        Company,
        'canonical_company',
        `canonical_company."_id"::text = job.company->>'_id'`,
      )
      .andWhere('job."isActive" = true')
      .andWhere('job."isDeleted" = false')
      .andWhere('job."deletedAt" IS NULL')
      .andWhere('canonical_company."isActive" = true')
      .andWhere('canonical_company."isDeleted" = false')
      .andWhere('canonical_company."deletedAt" IS NULL')
      .andWhere('(job."startDate" IS NULL OR job."startDate" <= :activeJobNow)')
      .andWhere('(job."endDate" IS NULL OR job."endDate" > :activeJobNow)')
      .setParameter('activeJobNow', now);
  }

  createActiveQuery(now = new Date()): SelectQueryBuilder<Job> {
    return this.applyActivePredicate(this.jobRepo.createQueryBuilder('job'), now);
  }

  createNonDeletedQuery(): SelectQueryBuilder<Job> {
    return this.jobRepo
      .createQueryBuilder('job')
      .where('job."isDeleted" = false')
      .andWhere('job."deletedAt" IS NULL');
  }

  async findActiveById(id: string, now = new Date()): Promise<Job | null> {
    return this.createActiveQuery(now)
      .andWhere('job."_id" = :jobId', { jobId: id })
      .getOne();
  }

  /**
   * Loads a non-deleted job for authenticated internal workflows. Active
   * dates are deliberately not part of this lookup: expired and scheduled
   * jobs still need to be editable and their applications still need to be
   * reviewable by authorized staff.
   */
  async findNonDeletedById(id: string): Promise<Job | null> {
    return this.createNonDeletedQuery()
      .andWhere('job."_id" = :jobId', { jobId: id })
      .getOne();
  }

  async getLegacyReport(now = new Date()): Promise<
    Array<{ reasonCode: string; count: number }>
  > {
    const jobs = await this.jobRepo.find({ withDeleted: true });
    const companies = await this.companyRepo.find({ withDeleted: true });
    const companyById = new Map(companies.map((company) => [company._id, company]));
    const counts = new Map<string, number>();

    for (const job of jobs) {
      if (isCanonicalActiveJob(job, companyById.get(job.company?._id), now)) {
        continue;
      }
      const reasonCode = !job.startDate
        ? 'MISSING_START_DATE'
        : !job.endDate
          ? 'MISSING_END_DATE'
          : job.startDate >= job.endDate
            ? 'INVALID_DATE_RANGE'
            : job.isDeleted || job.deletedAt
              ? 'DELETED_JOB'
              : !job.isActive
                ? 'INACTIVE_JOB'
                : !job.company?._id || !companyById.has(job.company._id)
                  ? 'MISSING_CANONICAL_COMPANY'
                  : !companyById.get(job.company._id)?.isActive ||
                      companyById.get(job.company._id)?.isDeleted ||
                      companyById.get(job.company._id)?.deletedAt
                    ? 'INACTIVE_CANONICAL_COMPANY'
                    : job.startDate > now
                      ? 'NOT_STARTED'
                      : 'EXPIRED';
      counts.set(reasonCode, (counts.get(reasonCode) ?? 0) + 1);
    }

    return [...counts.entries()].map(([reasonCode, count]) => ({
      reasonCode,
      count,
    }));
  }
}

