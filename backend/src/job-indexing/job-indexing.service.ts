import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Company } from 'src/companies/entities/company.entity';
import { Job } from 'src/jobs/entities/job.entity';
import { JobIndexOutbox } from './entities/job-index-outbox.entity';
import {
  JOB_INDEX_MAX_ATTEMPTS,
  JOB_INDEX_LEASE_SECONDS,
  JOB_INDEX_MAX_BACKFILL_OPERATIONS,
  resolveJobIndexRepresentationVersion,
} from './job-indexing.constants';
import {
  buildCanonicalJobSnapshot,
  buildCanonicalProjection,
  getJobSourceVersion,
} from './job-indexing.normalization';
import { JobIndexingClient } from 'src/ai-matching/ai-service.client';
import { CanonicalJobProjection } from './job-indexing.types';

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
    @Inject('JOB_INDEXING_CLIENT')
    private readonly indexingClient: JobIndexingClient,
  ) {}

  async initializeIndex(): Promise<void> {
    // FastAPI owns provider/index initialization; NestJS only dispatches jobs.
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
      for (const job of jobs) await this.enqueue(job._id, true);
    } else {
      const jobs = await this.jobRepo.find({
        where: { isDeleted: false },
        take: maxOperations,
      });
      for (const job of jobs) await this.enqueue(job._id);
    }
    return this.drain(maxOperations);
  }

  async enqueue(jobId: string, requeueCompleted = false): Promise<void> {
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
    const sourceVersion = getJobSourceVersion(job, company);
    const representationVersion = resolveJobIndexRepresentationVersion(
      process.env.AI_JOB_INDEX_REPRESENTATION_VERSION,
    );
    const event = {
      aggregateId: job._id,
      aggregateType: 'JOB' as const,
      eventType: 'JOB_CHANGED' as const,
      sourceVersion,
      representationVersion,
      status: 'PENDING' as const,
      attemptCount: 0,
      availableAt: new Date(),
      leaseUntil: null,
      claimedAt: null,
      processedAt: null,
      lastError: null,
    };
    const existing = await this.outboxRepo.findOne({
      where: {
        aggregateId: event.aggregateId,
        sourceVersion: event.sourceVersion,
        eventType: event.eventType,
        representationVersion: event.representationVersion,
      },
    });
    if (existing) {
      if (requeueCompleted && existing.status === 'COMPLETED') {
        // Reconciliation repairs a false completion without creating a second
        // idempotency key or bypassing the unique outbox event constraint.
        await this.outboxRepo.update(
          { _id: existing._id, status: 'COMPLETED' },
          {
            status: 'PENDING',
            attemptCount: 0,
            availableAt: new Date(),
            leaseUntil: null,
            leaseToken: null,
            claimedAt: null,
            processedAt: null,
            lastError: null,
          },
        );
      }
      return;
    }

    try {
      await this.outboxRepo.insert(event);
    } catch (error) {
      // The unique constraint closes the race between concurrent enqueuers.
      if (!isUniqueViolation(error)) throw error;
    }
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
          leaseToken: null,
        },
      );
      return updated.affected ? 'completed' : 'lease_lost';
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown indexing error';
      const updated = await this.outboxRepo.update(
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
          leaseToken: null,
          lastError: message.slice(0, 1000),
        },
      );
      if (updated.affected === 0) {
        this.logger.warn(`Job index outbox ${outbox._id} lease was lost`);
        return 'lease_lost';
      }
      this.logger.error(`Job index outbox ${outbox._id} failed: ${message}`);
      return 'failed';
    }
  }

  private async indexClaim(
    outbox: JobIndexOutbox,
  ): Promise<'completed' | 'lease_lost'> {
    const representationVersion = resolveJobIndexRepresentationVersion(
      outbox.representationVersion,
    );
    const projection = await this.loadProjection(outbox.aggregateId);
    const currentSourceVersion = projection
      ? getJobSourceVersion(projection.job, projection.company)
      : null;
    if (currentSourceVersion !== outbox.sourceVersion) return 'completed';

    const identity = {
      request_id: deterministicJobIndexOperationId('request', outbox),
      trace_id: deterministicJobIndexOperationId('trace', outbox),
      operation_attempt_id: deterministicJobIndexOperationId('attempt', outbox),
    };
    const idempotencyKey = deterministicJobIndexIdempotencyKey(outbox);

    if (!projection || !projection.active) {
      const response = await this.indexingClient.deleteJob({
        identity,
        job_id: outbox.aggregateId,
        idempotency_key: idempotencyKey,
        source_version: outbox.sourceVersion,
        representation_version: representationVersion,
      });
      assertSuccessfulJobIndexResponse(response, 'DELETE', outbox, identity);
      return 'completed';
    }

    const response = await this.indexingClient.upsertJob({
      identity,
      job: buildCanonicalJobSnapshot(projection.job, projection.company),
      idempotency_key: idempotencyKey,
      source_version: outbox.sourceVersion,
      representation_version: representationVersion,
      content_hash: projection.contentHash,
    });
    assertSuccessfulJobIndexResponse(response, 'UPSERT', outbox, identity);

    const latest = await this.loadProjection(outbox.aggregateId);
    if (
      latest &&
      getJobSourceVersion(latest.job, latest.company) !== outbox.sourceVersion
    ) {
      return 'completed';
    }
    return 'completed';
  }

  // Projection loading remains a NestJS/PostgreSQL concern.

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

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === '23505',
  );
}

function deterministicJobIndexOperationId(
  kind: 'request' | 'trace' | 'attempt',
  outbox: JobIndexOutbox,
): string {
  return deterministicUuid(
    `talentpulse:job-index:${kind}:${outbox._id}:${outbox.sourceVersion}:${
      kind === 'request' ? 'stable' : outbox.attemptCount
    }`,
  );
}

function deterministicJobIndexIdempotencyKey(outbox: JobIndexOutbox): string {
  const representationVersion = resolveJobIndexRepresentationVersion(
    outbox.representationVersion,
  );
  const versionFingerprint = createHash('sha256')
    .update(`${outbox.sourceVersion}:${representationVersion}`)
    .digest('hex');
  return `job-index:${outbox.eventType}:${outbox.aggregateId}:${versionFingerprint}`;
}

function deterministicUuid(value: string): string {
  const digest = createHash('sha256').update(value).digest('hex');
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(
    13,
    16,
  )}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

function assertSuccessfulJobIndexResponse(
  response: {
    operation: string;
    status: string;
    job_id: string;
    source_version: string;
    representation_version: string;
    request_id: string;
    trace_id: string;
    operation_attempt_id: string;
  },
  operation: 'UPSERT' | 'DELETE',
  outbox: JobIndexOutbox,
  identity: {
    request_id: string;
    trace_id: string;
    operation_attempt_id: string;
  },
): void {
  const validStatus =
    operation === 'UPSERT'
      ? response.status === 'INDEXED'
      : response.status === 'DELETED' || response.status === 'ALREADY_DELETED';
  if (
    response.operation !== operation ||
    !validStatus ||
    response.job_id !== outbox.aggregateId ||
    response.source_version !== outbox.sourceVersion ||
    response.representation_version !==
      resolveJobIndexRepresentationVersion(outbox.representationVersion) ||
    response.request_id !== identity.request_id ||
    response.trace_id !== identity.trace_id ||
    response.operation_attempt_id !== identity.operation_attempt_id
  ) {
    throw new Error('AI service returned an invalid job index response');
  }
}
