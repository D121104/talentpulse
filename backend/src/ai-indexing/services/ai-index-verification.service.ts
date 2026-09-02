import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiServiceClient } from '../../ai-client/ai-client.service';
import { Company } from '../../companies/entities/company.entity';
import { Job } from '../../jobs/entities/job.entity';
import {
  AiIndexAggregateType,
  AiIndexOutbox,
  AiIndexOutboxStatus,
} from '../entities/ai-index-outbox.entity';
import { isAiIndexReplayableStatus } from './ai-index-replay.service';

const DEFAULT_QDRANT_LIMIT = 10;

export type AiIndexVerificationErrorCode =
  | 'AI_INDEX_VERIFY_TARGET_NOT_FOUND_OR_MISMATCH'
  | 'AI_INDEX_VERIFY_QDRANT_UNAVAILABLE';

export class AiIndexVerificationError extends Error {
  constructor(public readonly code: AiIndexVerificationErrorCode) {
    super(code);
  }
}

export interface AiIndexVerificationInput {
  outboxId: string;
  jobId: string;
  companyId: string;
  verifyQdrant?: boolean;
  qdrantLimit?: number;
}

interface TargetRow {
  outbox_status: AiIndexOutboxStatus;
  outbox_operation: string;
  source_version: string;
  attempts: number | string;
  max_attempts: number | string;
  publisher_eligible: boolean;
}

/** Read-only operational view over one canonical job indexing command. */
@Injectable()
export class AiIndexVerificationService {
  constructor(
    @InjectRepository(AiIndexOutbox)
    private readonly outboxRepository: Repository<AiIndexOutbox>,
    private readonly aiClient: AiServiceClient,
  ) {}

  async verify(
    input: AiIndexVerificationInput,
  ): Promise<Record<string, unknown>> {
    const now = new Date();
    const target = await this.findTarget(input, now);
    if (!target) {
      throw new AiIndexVerificationError(
        'AI_INDEX_VERIFY_TARGET_NOT_FOUND_OR_MISMATCH',
      );
    }
    const eligibleCount = await this.countPublisherEligible(now);

    const result: Record<string, unknown> = {
      target: {
        found: true,
        relationshipMatches: true,
        outboxStatus: target.outbox_status,
        operation: target.outbox_operation,
        sourceVersion: String(target.source_version),
        attempts: boundedNumber(target.attempts),
        maxAttempts: boundedNumber(target.max_attempts),
        replayable: isAiIndexReplayableStatus(target.outbox_status),
        publisherEligible: Boolean(target.publisher_eligible),
      },
      publisher: { eligibleCount },
      qdrant: { checked: false },
    };

    if (input.verifyQdrant) {
      result.qdrant = await this.verifyQdrant(input);
    }
    return result;
  }

  private async findTarget(
    input: AiIndexVerificationInput,
    now: Date,
  ): Promise<TargetRow | undefined> {
    return this.outboxRepository
      .createQueryBuilder('outbox')
      .withDeleted()
      .select('outbox.status', 'outbox_status')
      .addSelect('outbox.operation', 'outbox_operation')
      .addSelect('outbox.sourceVersion', 'source_version')
      .addSelect('outbox.attempts', 'attempts')
      .addSelect('outbox.maxAttempts', 'max_attempts')
      .addSelect(
        `CASE WHEN outbox.status = :pendingStatus
          AND outbox.publishedAt IS NULL
          AND outbox.nextRetryAt <= :now
          AND outbox.publishNextRetryAt <= :now
          AND (outbox.publishLeaseExpiresAt IS NULL OR outbox.publishLeaseExpiresAt <= :now)
          THEN TRUE ELSE FALSE END`,
        'publisher_eligible',
      )
      .innerJoin(Job, 'job', 'job._id = outbox.aggregateId')
      .innerJoin(Company, 'company', "company._id::text = job.company->>'_id'")
      .where('outbox._id = :outboxId', { outboxId: input.outboxId })
      .andWhere('outbox.aggregateType = :aggregateType', {
        aggregateType: AiIndexAggregateType.JOB,
      })
      .andWhere('job._id = :jobId', { jobId: input.jobId })
      .andWhere('company._id = :companyId', { companyId: input.companyId })
      .setParameters({ pendingStatus: AiIndexOutboxStatus.PENDING, now })
      .getRawOne<TargetRow>();
  }

  private async countPublisherEligible(now: Date): Promise<number> {
    const result = await this.outboxRepository
      .createQueryBuilder('outbox')
      .select('COUNT(*)', 'eligible_count')
      .where('outbox.status = :pendingStatus', {
        pendingStatus: AiIndexOutboxStatus.PENDING,
      })
      .andWhere('outbox.publishedAt IS NULL')
      .andWhere('outbox.nextRetryAt <= :now', { now })
      .andWhere('outbox.publishNextRetryAt <= :now', { now })
      .andWhere(
        '(outbox.publishLeaseExpiresAt IS NULL OR outbox.publishLeaseExpiresAt <= :now)',
        { now },
      )
      .getRawOne<{ eligible_count: string }>();
    return boundedNumber(result?.eligible_count);
  }

  private async verifyQdrant(
    input: AiIndexVerificationInput,
  ): Promise<Record<string, unknown>> {
    try {
      const response = await this.aiClient.scanIndexPoints(
        {
          job_id: input.jobId,
          limit: input.qdrantLimit ?? DEFAULT_QDRANT_LIMIT,
        },
        { readOnly: true },
      );
      const points = response.points;
      return {
        checked: true,
        status: 'VERIFIED',
        pointCount: points.length,
        hasMore: response.next_cursor != null,
        allPointsMatchTargetJob: points.every(
          (point) => point.job_id === input.jobId,
        ),
        allPointsMatchTargetCompany: points.every(
          (point) => point.company_id === input.companyId,
        ),
        sourceVersions: sortedUnique(
          points.map((point) => point.source_version),
        ),
        collections: uniqueCollections(points),
        embeddingProviders: sortedUnique(
          points.map((point) => point.embedding_provider).filter(isString),
        ),
        embeddingModelVersions: sortedUnique(
          points.map((point) => point.embedding_model_version),
        ),
        embeddingDimensions: sortedUnique(
          points.map((point) => point.embedding_dimensions),
        ),
        normalizationVersions: sortedUnique(
          points.map((point) => point.normalization_version),
        ),
        chunkingVersions: sortedUnique(
          points.map((point) => point.chunking_version),
        ),
        indexSchemaVersions: sortedUnique(
          points.map((point) => point.index_schema_version),
        ),
      };
    } catch {
      throw new AiIndexVerificationError('AI_INDEX_VERIFY_QDRANT_UNAVAILABLE');
    }
  }
}

function boundedNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function sortedUnique<T extends string | number>(values: T[]): T[] {
  return [...new Set(values)].sort((left, right) =>
    String(left).localeCompare(String(right), 'en'),
  );
}

function uniqueCollections(
  points: Array<{
    collection_name?: string | null;
    collection_version?: string | null;
  }>,
): Array<{ name: string | null; version: string | null }> {
  const collections = new Map<
    string,
    { name: string | null; version: string | null }
  >();
  for (const point of points) {
    const name = point.collection_name ?? null;
    const version = point.collection_version ?? null;
    collections.set(`${name ?? ''}|${version ?? ''}`, { name, version });
  }
  return [...collections.values()].sort((left, right) =>
    `${left.name ?? ''}|${left.version ?? ''}`.localeCompare(
      `${right.name ?? ''}|${right.version ?? ''}`,
      'en',
    ),
  );
}
