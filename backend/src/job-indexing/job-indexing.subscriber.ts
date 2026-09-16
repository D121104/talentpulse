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
import { getJobSourceVersion } from './job-indexing.normalization';
import { resolveJobIndexRepresentationVersion } from './job-indexing.constants';

export class JobIndexingSubscriber implements EntitySubscriberInterface {
  private isTarget(
    event: { metadata: { target: unknown } },
    entity: { name: string },
  ): boolean {
    return (
      event.metadata.target === entity || event.metadata.target === entity.name
    );
  }

  private async enqueueJob(
    manager: InsertEvent<Job>['manager'],
    jobId: string,
  ): Promise<void> {
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

    const sourceVersion = getJobSourceVersion(job, canonicalCompany);
    const representationVersion = resolveJobIndexRepresentationVersion(
      process.env.AI_JOB_INDEX_REPRESENTATION_VERSION,
    );
    const outboxRepo = manager.getRepository(JobIndexOutbox);
    const existing = await outboxRepo.findOne({
      where: {
        aggregateId: job._id,
        sourceVersion,
        eventType: 'JOB_CHANGED',
        representationVersion,
      },
    });
    if (existing) return;

    try {
      await outboxRepo.insert({
        aggregateId: job._id,
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

  private isUniqueViolation(error: unknown): boolean {
    return Boolean(
      error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: unknown }).code === '23505',
    );
  }

  private async enqueueCompanyJobs(
    manager: InsertEvent<Job>['manager'],
    companyId: string,
  ): Promise<void> {
    const jobs = await manager.getRepository(Job).find({ withDeleted: true });
    for (const job of jobs.filter((item) => item.company?._id === companyId)) {
      await this.enqueueJob(manager, job._id);
    }
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

  async afterRemove(event: RemoveEvent<Job>): Promise<void> {
    if (this.isTarget(event, Job)) {
      const id = event.entity?._id ?? event.databaseEntity?._id;
      if (id) await this.enqueueJob(event.manager, id);
    }
    if (this.isTarget(event, Company)) {
      const companyId = event.entity?._id ?? event.databaseEntity?._id;
      if (companyId) await this.enqueueCompanyJobs(event.manager, companyId);
    }
  }
}

// Kept separate from the class declaration so TypeORM can discover this file
// from the CLI data source while Nest registers the same class at runtime.
EventSubscriber()(JobIndexingSubscriber);
