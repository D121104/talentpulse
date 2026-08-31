import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { resolveAiIndexEnvironment } from '../../config/ai-index-environment';
import {
  AiIndexSqsDefinitePublishError,
  AiIndexSqsPublisherPort,
  AiIndexSqsPublisherToken,
} from '../ai-index-sqs.publisher';
import { AiIndexOutbox, AiIndexOutboxStatus } from '../entities';

const MAX_BATCH_SIZE = 100;
const DEFAULT_BATCH_SIZE = 10;
const MAX_ERROR_MESSAGE_LENGTH = 1_000;

export interface AiIndexPublishOptions {
  environment?: string;
  batchSize?: number;
}

export interface AiIndexPublishResult {
  environment: string;
  claimed: number;
  published: number;
  failed: number;
  leaseLost: number;
  ambiguous: number;
}

export interface ClaimedAiIndexPublication extends AiIndexOutbox {
  publishLeaseOwner: string;
}

/**
 * Initial SQS notification publisher for the transactional indexing outbox.
 * Publication has an independent lease and retry history; the SQS consumer
 * remains exclusively responsible for AI attempts and business status changes.
 */
@Injectable()
export class AiIndexPublisherService {
  private readonly owner: string;

  constructor(
    @InjectRepository(AiIndexOutbox)
    private readonly outboxRepository: Repository<AiIndexOutbox>,
    private readonly configService: ConfigService,
    @Inject(AiIndexSqsPublisherToken)
    private readonly sqsPublisher: AiIndexSqsPublisherPort,
  ) {
    this.owner = buildOwner(
      configService.get<string>('AI_INDEX_PUBLISHER_ID', ''),
    );
  }

  async publish(
    options: AiIndexPublishOptions = {},
  ): Promise<AiIndexPublishResult> {
    const environment = resolveAiIndexEnvironment(
      this.configService,
      options.environment,
    );
    const claimed = await this.claimBatch(options.batchSize);
    const result: AiIndexPublishResult = {
      environment,
      claimed: claimed.length,
      published: 0,
      failed: 0,
      leaseLost: 0,
      ambiguous: 0,
    };

    for (const outbox of claimed) {
      try {
        await this.sqsPublisher.publish(outbox._id);
      } catch (error) {
        if (error instanceof AiIndexSqsDefinitePublishError) {
          if (await this.markFailure(outbox, error)) result.failed += 1;
          else result.leaseLost += 1;
        } else {
          // An unknown transport outcome may have reached SQS. Preserve the
          // lease until expiry so a later bounded invocation can safely duplicate.
          result.ambiguous += 1;
        }
        continue;
      }

      try {
        if (await this.markPublished(outbox)) result.published += 1;
        else result.leaseLost += 1;
      } catch {
        // The SQS send already succeeded. Do not mark failure; an expired lease
        // can republish safely if this finalization outcome is ambiguous.
        result.ambiguous += 1;
      }
    }
    return result;
  }

  async claimBatch(
    limit = DEFAULT_BATCH_SIZE,
    now = new Date(),
  ): Promise<ClaimedAiIndexPublication[]> {
    const batchSize = boundedBatchSize(limit);
    const leaseMs = this.readInteger(
      'AI_INDEX_PUBLISH_LEASE_MS',
      30_000,
      1_000,
      300_000,
    );
    return this.outboxRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(AiIndexOutbox);
      const rows = await repository
        .createQueryBuilder('outbox')
        .where('outbox.status = :status', {
          status: AiIndexOutboxStatus.PENDING,
        })
        .andWhere('outbox.publishedAt IS NULL')
        .andWhere('outbox.nextRetryAt <= :now', { now })
        .andWhere('outbox.publishNextRetryAt <= :now', { now })
        .andWhere(
          '(outbox.publishLeaseExpiresAt IS NULL OR outbox.publishLeaseExpiresAt <= :now)',
          { now },
        )
        .orderBy('outbox.createdAt', 'ASC')
        .addOrderBy('outbox._id', 'ASC')
        .take(batchSize)
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getMany();

      const claimed: ClaimedAiIndexPublication[] = [];
      for (const outbox of rows) {
        outbox.publishAttempts =
          safeNonNegativeInteger(outbox.publishAttempts) + 1;
        outbox.publishLeasedAt = now;
        outbox.publishLeaseExpiresAt = new Date(now.getTime() + leaseMs);
        outbox.publishLeaseOwner = createLeaseOwner(this.owner);
        await repository.save(outbox);
        claimed.push(outbox as ClaimedAiIndexPublication);
      }
      return claimed;
    });
  }

  private async markPublished(
    outbox: ClaimedAiIndexPublication,
  ): Promise<boolean> {
    const now = new Date();
    const result = await this.outboxRepository.update(
      {
        _id: outbox._id,
        status: AiIndexOutboxStatus.PENDING,
        publishedAt: IsNull(),
        publishLeaseOwner: outbox.publishLeaseOwner,
        publishLeaseExpiresAt: MoreThan(now),
      },
      {
        publishedAt: now,
        publishLeasedAt: null,
        publishLeaseExpiresAt: null,
        publishLeaseOwner: null,
        lastPublishErrorCode: null,
        lastPublishErrorMessage: null,
        lastPublishErrorAt: null,
      },
    );
    return result.affected === 1;
  }

  private async markFailure(
    outbox: ClaimedAiIndexPublication,
    error: AiIndexSqsDefinitePublishError,
  ): Promise<boolean> {
    const now = new Date();
    const attempts = safeNonNegativeInteger(outbox.publishAttempts);
    const delay = this.retryDelay(attempts);
    const result = await this.outboxRepository.update(
      {
        _id: outbox._id,
        status: AiIndexOutboxStatus.PENDING,
        publishedAt: IsNull(),
        publishLeaseOwner: outbox.publishLeaseOwner,
        publishLeaseExpiresAt: MoreThan(now),
      },
      {
        publishNextRetryAt: new Date(now.getTime() + delay),
        publishLeasedAt: null,
        publishLeaseExpiresAt: null,
        publishLeaseOwner: null,
        lastPublishErrorCode: safeErrorCode(error.code),
        lastPublishErrorMessage: safeErrorMessage(error.message),
        lastPublishErrorAt: now,
      },
    );
    return result.affected === 1;
  }

  private retryDelay(attempt: number): number {
    const base = this.readInteger(
      'AI_INDEX_PUBLISH_RETRY_BASE_MS',
      1_000,
      1,
      300_000,
    );
    const max = this.readInteger(
      'AI_INDEX_PUBLISH_RETRY_MAX_MS',
      60_000,
      base,
      3_600_000,
    );
    return Math.min(max, base * 2 ** Math.min(Math.max(attempt - 1, 0), 20));
  }

  private readInteger(
    key: string,
    fallback: number,
    min: number,
    max: number,
  ): number {
    const value = Number(this.configService.get(key, fallback));
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new Error(`${key} must be an integer between ${min} and ${max}`);
    }
    return value;
  }
}

function boundedBatchSize(value: number | undefined): number {
  if (value === undefined) return DEFAULT_BATCH_SIZE;
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_BATCH_SIZE) {
    throw new Error(
      `AI_INDEX_PUBLISH_BATCH_SIZE must be an integer between 1 and ${MAX_BATCH_SIZE}`,
    );
  }
  return value;
}

function buildOwner(value: string): string {
  const configured =
    String(value ?? '').trim() || `ai-index-publisher:${process.pid}`;
  return `${randomUUID()}:${configured.slice(0, 80)}`.slice(0, 128);
}

function createLeaseOwner(owner: string): string {
  return `${randomUUID()}:${owner.slice(0, 90)}`.slice(0, 128);
}

function safeNonNegativeInteger(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function safeErrorCode(value: string): string {
  return (
    value.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 80) ||
    'AI_INDEX_SQS_PUBLISH_FAILED'
  );
}

function safeErrorMessage(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').slice(0, MAX_ERROR_MESSAGE_LENGTH);
}
