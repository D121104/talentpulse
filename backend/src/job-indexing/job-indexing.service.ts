import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Company } from 'src/companies/entities/company.entity';
import { Job } from 'src/jobs/entities/job.entity';
import { JobIndexOutbox } from './entities/job-index-outbox.entity';
import {
  JOB_INDEX_MAX_ATTEMPTS,
  JOB_INDEX_LEASE_SECONDS,
  JOB_INDEX_MAX_BACKFILL_OPERATIONS,
} from './job-indexing.constants';
import {
  buildCanonicalProjection,
  buildJobPayload,
  deterministicJobPointId,
  getJobSourceVersion,
} from './job-indexing.normalization';
import { JobEmbeddingProvider, JobVectorIndex } from './job-vector-index';
import { JobIndexOutboxStatus } from './job-indexing.types';

export interface JobIndexDrainResult {
  claimed: number;
  completed: number;
  failed: number;
  leaseLost: number;
}

@Injectable()
export class JobIndexingService {
  private readonly logger = new Logger(JobIndexingService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(JobIndexOutbox)
    private readonly outboxRepo: Repository<JobIndexOutbox>,
    @InjectRepository(Job) private readonly jobRepo: Repository<Job>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @Inject('JOB_EMBEDDING_PROVIDER')
    private readonly embeddingProvider: JobEmbeddingProvider,
    @Inject('JOB_VECTOR_INDEX')
    private readonly vectorIndex: JobVectorIndex,
  ) {}

  async initializeIndex(): Promise<void> {
    await this.vectorIndex.initialize();
  }

  async backfill(
    maxOperations: number,
    reconcile = false,
  ): Promise<JobIndexDrainResult> {
    if (
      !Number.isInteger(maxOperations) ||
      maxOperations < 1 ||
      maxOperations > JOB_INDEX_MAX_BACKFILL_OPERATIONS
    ) {
      throw new Error('maxOperations must be a positive integer');
    }
    if (reconcile) {
      const jobs = await this.jobRepo.find({
        withDeleted: true,
        take: maxOperations,
      });
      for (const job of jobs) await this.enqueue(job._id);
    } else {
      const jobs = await this.jobRepo.find({
        where: { isDeleted: false },
        take: maxOperations,
      });
      for (const job of jobs) await this.enqueue(job._id);
    }
    return this.drain(maxOperations);
  }

  async enqueue(jobId: string): Promise<void> {
    const job = await this.jobRepo.findOne({
      where: { _id: jobId },
      withDeleted: true,
    });
    if (!job?.company?._id) return;
    const company = await this.companyRepo.findOne({
      where: { _id: job.company._id },
      withDeleted: true,
    });
    if (!company) return;
    await this.outboxRepo.upsert(
      {
        aggregateId: job._id,
        aggregateType: 'JOB',
        eventType: 'JOB_CHANGED',
        sourceVersion: getJobSourceVersion(job, company),
        status: 'PENDING',
        attemptCount: 0,
        availableAt: new Date(),
        leaseUntil: null,
        claimedAt: null,
        processedAt: null,
        lastError: null,
      },
      ['aggregateId', 'sourceVersion', 'eventType'],
    );
  }

  async drain(maxOperations: number): Promise<JobIndexDrainResult> {
    const result: JobIndexDrainResult = {
      claimed: 0,
      completed: 0,
      failed: 0,
      leaseLost: 0,
    };
    for (let operation = 0; operation < maxOperations; operation += 1) {
      const outbox = await this.claimOne();
      if (!outbox) break;
      result.claimed += 1;
      const outcome = await this.processClaim(outbox);
      result.completed += outcome === 'completed' ? 1 : 0;
      result.failed += outcome === 'failed' ? 1 : 0;
      result.leaseLost += outcome === 'lease_lost' ? 1 : 0;
    }
    return result;
  }

  private async claimOne(): Promise<JobIndexOutbox | null> {
    return this.dataSource.transaction(async (manager) => {
      const candidate = await manager
        .getRepository(JobIndexOutbox)
        .createQueryBuilder('outbox')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .where(
          '(outbox.status IN (:...readyStatuses) OR (outbox.status = :processing AND outbox.leaseUntil < :now))',
          {
            readyStatuses: ['PENDING', 'FAILED'],
            processing: 'PROCESSING',
            now: new Date(),
          },
        )
        .andWhere('outbox.attemptCount < :maxAttempts', {
          maxAttempts: JOB_INDEX_MAX_ATTEMPTS,
        })
        .andWhere('outbox.availableAt <= :now', { now: new Date() })
        .orderBy('outbox.createdAt', 'ASC')
        .getOne();
      if (!candidate) return null;
      candidate.status = 'PROCESSING';
      candidate.attemptCount += 1;
      candidate.claimedAt = new Date();
      candidate.leaseToken = randomUUID();
      candidate.leaseUntil = new Date(
        Date.now() + JOB_INDEX_LEASE_SECONDS * 1000,
      );
      candidate.lastError = null;
      return manager.getRepository(JobIndexOutbox).save(candidate);
    });
  }

  private async processClaim(
    outbox: JobIndexOutbox,
  ): Promise<'completed' | 'failed' | 'lease_lost'> {
    try {
      const outcome = await this.indexClaim(outbox);
      if (outcome === 'lease_lost') return outcome;
      const updated = await this.outboxRepo.update(
        {
          _id: outbox._id,
          status: 'PROCESSING',
          leaseUntil: outbox.leaseUntil,
          leaseToken: outbox.leaseToken,
        },
        {
          status: 'COMPLETED',
          processedAt: new Date(),
          leaseUntil: null,
        },
      );
      return updated.affected ? 'completed' : 'lease_lost';
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown indexing error';
      this.logger.error(`Job index outbox ${outbox._id} failed: ${message}`);
      await this.outboxRepo.update(
        {
          _id: outbox._id,
          status: 'PROCESSING',
          leaseUntil: outbox.leaseUntil,
          leaseToken: outbox.leaseToken,
        },
        {
          status: 'FAILED',
          availableAt: new Date(
            Date.now() + Math.min(300, 2 ** outbox.attemptCount) * 1000,
          ),
          leaseUntil: null,
          lastError: message.slice(0, 1000),
        },
      );
      return 'failed';
    }
  }

  private async indexClaim(
    outbox: JobIndexOutbox,
  ): Promise<'completed' | 'lease_lost'> {
    const projection = await this.loadProjection(outbox.aggregateId);
    const currentSourceVersion = projection
      ? getJobSourceVersion(projection.job, projection.company)
      : null;
    if (currentSourceVersion !== outbox.sourceVersion) return 'completed';

    if (!projection || !projection.active) {
      await this.vectorIndex.delete(outbox.aggregateId);
      return 'completed';
    }

    const existing = await this.vectorIndex.get(outbox.aggregateId);
    const payload = buildJobPayload(projection);
    if (
      existing &&
      existing.payload.content_hash === payload.content_hash &&
      existing.payload.representation_version ===
        payload.representation_version &&
      existing.payload.source_version === payload.source_version
    ) {
      return 'completed';
    }

    const vector = await this.embeddingProvider.embed(projection.text);
    if (vector.length !== 1024)
      throw new Error(
        'Embedding provider returned an invalid vector dimension',
      );
    const latest = await this.loadProjection(outbox.aggregateId);
    if (!latest) {
      await this.vectorIndex.delete(outbox.aggregateId);
      return 'completed';
    }
    if (!latest.active) {
      await this.vectorIndex.delete(outbox.aggregateId);
      return 'completed';
    }
    if (
      getJobSourceVersion(latest.job, latest.company) !== outbox.sourceVersion
    ) {
      return 'completed';
    }
    await this.vectorIndex.upsert({
      id: deterministicJobPointId(outbox.aggregateId),
      vector,
      payload,
    });
    return 'completed';
  }

  private async loadProjection(jobId: string) {
    const job = await this.jobRepo.findOne({
      where: { _id: jobId },
      withDeleted: true,
    });
    if (!job?.company?._id) return null;
    const company = await this.companyRepo.findOne({
      where: { _id: job.company._id },
      withDeleted: true,
    });
    return company ? buildCanonicalProjection(job, company) : null;
  }
}
