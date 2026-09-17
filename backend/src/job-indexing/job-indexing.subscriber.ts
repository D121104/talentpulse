import {
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
  RemoveEvent,
  SoftRemoveEvent,
  UpdateEvent,
} from 'typeorm';
import { Company } from 'src/companies/entities/company.entity';
import { Job } from 'src/jobs/entities/job.entity';
import { JobIndexOutbox } from './entities/job-index-outbox.entity';
import { getJobIndexSourceVersion } from './job-indexing.normalization';
import { resolveJobIndexRepresentationVersion } from './job-indexing.constants';

const COMPANY_JOB_PAGE_SIZE = 100;
type Manager = InsertEvent<Job>['manager'];

export class JobIndexingSubscriber implements EntitySubscriberInterface {
  private isTarget(
    event: { metadata: { target: unknown } },
    entity: { name: string },
  ): boolean {
    return (
      event.metadata.target === entity || event.metadata.target === entity.name
    );
  }

  private async enqueueEvent(
    manager: Manager,
    aggregateId: string,
    sourceVersion: string,
  ): Promise<void> {
    const representationVersion = resolveJobIndexRepresentationVersion(
      process.env.AI_JOB_INDEX_REPRESENTATION_VERSION,
    );
    const outboxRepo = manager.getRepository(JobIndexOutbox);
    const existing = await outboxRepo.findOne({
      where: {
        aggregateId,
        sourceVersion,
        eventType: 'JOB_CHANGED',
        representationVersion,
      },
    });
    if (existing) return;

    try {
      await outboxRepo.insert({
        aggregateId,
        aggregateType: 'JOB',
        eventType: 'JOB_CHANGED',
        sourceVersion,
        representationVersion,
        status: 'PENDING',
        attemptCount: 0,
        availableAt: new Date(),
        leaseUntil: null,
        claimedAt: null,
        processedAt: null,
        lastError: null,
      });
    } catch (error) {
      // The unique constraint closes the race between concurrent subscribers.
      if (!this.isUniqueViolation(error)) throw error;
    }
  }

  private async enqueueJob(manager: Manager, jobId: string): Promise<void> {
    const job = await manager
      .getRepository(Job)
      .findOne({ where: { _id: jobId }, withDeleted: true });
    if (!job?.company?._id) return;

    const canonicalCompany = await manager
      .getRepository(Company)
      .createQueryBuilder('company')
      .withDeleted()
      .where('company."_id" = :companyId', { companyId: job.company._id })
      .getOne();
    if (!canonicalCompany) return;

    await this.enqueueEvent(
      manager,
      job._id,
      getJobIndexSourceVersion(job, canonicalCompany, new Date()),
    );
  }

  private async enqueueRemoval(
    manager: Manager,
    removal: Job,
    removedCompany?: Company,
    jobDeleted = true,
  ): Promise<void> {
    const jobId = removal?._id;
    const companyId = removal?.company?._id ?? removedCompany?._id;
    if (!jobId || !companyId) return;

    // A hard-deleted row cannot be loaded after the remove query. Build the
    // source version from the removal snapshot and force the deleted phase.
    const company = removedCompany
      ? cloneCompanyTombstone(removedCompany)
      : await this.loadCompanyOrSnapshot(manager, companyId, removal);
    const tombstone = jobDeleted ? cloneJobTombstone(removal) : removal;
    await this.enqueueEvent(
      manager,
      jobId,
      getJobIndexSourceVersion(tombstone, company, removal.updatedAt),
    );
  }

  private async loadCompanyOrSnapshot(
    manager: Manager,
    companyId: string,
    job: Job,
  ): Promise<Company> {
    const company = await manager
      .getRepository(Company)
      .createQueryBuilder('company')
      .withDeleted()
      .where('company."_id" = :companyId', { companyId })
      .getOne();
    if (company) return company;
    return Object.assign(new Company(), {
      _id: companyId,
      name: job.company?.name ?? '',
      isActive: job.company?.isActive ?? false,
      isDeleted: true,
      updatedAt: job.updatedAt,
    });
  }

  private async enqueueCompanyJobs(
    manager: Manager,
    companyId: string,
    removedCompany?: Company,
  ): Promise<void> {
    let afterId: string | null = null;
    while (true) {
      const query = manager
        .getRepository(Job)
        .createQueryBuilder('job')
        .withDeleted()
        .where("job.company->>'_id' = :companyId", { companyId })
        .orderBy('job."_id"', 'ASC')
        .take(COMPANY_JOB_PAGE_SIZE);
      if (afterId) {
        query.andWhere('job."_id" > :afterId', { afterId });
      }
      const page = await query.getMany();
      if (!page.length) break;

      // Work is bounded to one keyset page at a time; no unbounded find() or
      // serial promise chain can accumulate for a large company.
      await Promise.all(
        page.map((job) =>
          removedCompany
            ? this.enqueueRemoval(manager, job, removedCompany, false)
            : this.enqueueJob(manager, job._id),
        ),
      );
      afterId = page[page.length - 1]._id;
      if (page.length < COMPANY_JOB_PAGE_SIZE) break;
    }
  }

  async beforeRemove(event: RemoveEvent<Job | Company>): Promise<void> {
    if (!this.isTarget(event, Company)) return;
    const company = event.entity ?? event.databaseEntity;
    const companyId = company?._id ?? event.entityId;
    if (!companyId) return;

    // TypeORM may cascade the company remove and make the child rows
    // unavailable to afterRemove. Enqueue snapshot-based tombstones while the
    // rows still exist; afterRemove remains the fallback for direct events.
    await this.enqueueCompanyJobs(
      event.manager,
      companyId,
      cloneCompanyTombstone((company ?? { _id: companyId }) as Company),
    );
    event.queryRunner.data.jobIndexingCompanyTombstone = companyId;
  }

  async afterInsert(event: InsertEvent<Job>): Promise<void> {
    if (this.isTarget(event, Job) && event.entity?._id) {
      await this.enqueueJob(event.manager, event.entity._id);
    }
  }

  async afterUpdate(event: UpdateEvent<Job>): Promise<void> {
    if (this.isTarget(event, Job)) {
      const id = event.entity?._id ?? event.databaseEntity?._id;
      if (id) await this.enqueueJob(event.manager, id);
    }
    if (this.isTarget(event, Company)) {
      const companyId = event.entity?._id ?? event.databaseEntity?._id;
      if (companyId) await this.enqueueCompanyJobs(event.manager, companyId);
    }
  }

  async afterSoftRemove(event: SoftRemoveEvent<Job>): Promise<void> {
    if (this.isTarget(event, Job)) {
      const id = event.entity?._id ?? event.databaseEntity?._id;
      if (id) await this.enqueueJob(event.manager, id);
    }
    if (this.isTarget(event, Company)) {
      const companyId = event.entity?._id ?? event.databaseEntity?._id;
      if (companyId) await this.enqueueCompanyJobs(event.manager, companyId);
    }
  }

  async afterRemove(event: RemoveEvent<Job | Company>): Promise<void> {
    if (this.isTarget(event, Job)) {
      const removal = event.entity ?? event.databaseEntity;
      if (removal?._id)
        await this.enqueueRemoval(event.manager, removal as Job);
    }
    if (this.isTarget(event, Company)) {
      const company = event.entity ?? event.databaseEntity;
      const companyId = company?._id ?? event.entityId;
      if (companyId) {
        const preRemoveCompanyId =
          event.queryRunner?.data?.jobIndexingCompanyTombstone;
        if (preRemoveCompanyId === companyId) return;
        const removedCompany = cloneCompanyTombstone(
          (company ?? { _id: companyId }) as Company,
        );
        await this.enqueueCompanyJobs(event.manager, companyId, removedCompany);
      }
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return Boolean(
      error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: unknown }).code === '23505',
    );
  }
}

function cloneJobTombstone(job: Job): Job {
  return Object.assign(new Job(), job, { isDeleted: true });
}

function cloneCompanyTombstone(company: Company): Company {
  return Object.assign(new Company(), company, { isDeleted: true });
}

// Kept separate from the class declaration so TypeORM can discover this file
// from the CLI data source while Nest registers the same class at runtime.
EventSubscriber()(JobIndexingSubscriber);
