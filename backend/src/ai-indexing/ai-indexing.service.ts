import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, FindOptionsWhere, Repository } from 'typeorm';
import {
  AiIndexAggregateType,
  AiIndexOutbox,
  AiIndexOutboxOperation,
  AiIndexOutboxStatus,
} from './entities/ai-index-outbox.entity';

export interface EnqueueAiIndexEventInput {
  aggregateType: AiIndexAggregateType;
  aggregateId: string;
  sourceVersion: string | number | bigint;
  operation: AiIndexOutboxOperation;
  maxAttempts?: number;
}

export type EnqueueAiIndexEventWithoutSourceVersionInput = Omit<
  EnqueueAiIndexEventInput,
  'sourceVersion'
>;

export interface EnqueueAiIndexEventIfNeededOptions {
  /** Force a new version when the latest completed command is no longer enough. */
  force?: boolean;
}

export interface EnqueueAiIndexEventIfNeededResult {
  outbox: AiIndexOutbox;
  enqueued: boolean;
}

/**
 * Persistence boundary for indexing commands.
 *
 * Business services should pass their current EntityManager so the outbox row
 * commits or rolls back with the canonical mutation. The standalone path is
 * useful for explicit backfill/replay tooling and opens its own transaction.
 */
@Injectable()
export class AiIndexingService {
  constructor(
    @InjectRepository(AiIndexOutbox)
    private readonly outboxRepository: Repository<AiIndexOutbox>,
  ) {}

  async enqueue(
    input: EnqueueAiIndexEventInput,
    manager?: EntityManager,
  ): Promise<AiIndexOutbox> {
    const sourceVersion = normalizeSourceVersion(input.sourceVersion);
    const maxAttempts = input.maxAttempts ?? 10;
    validateEnqueueInput(input, sourceVersion, maxAttempts);

    if (manager) {
      return this.enqueueWithManager(
        manager,
        input,
        sourceVersion,
        maxAttempts,
      );
    }

    return this.outboxRepository.manager.transaction((transactionManager) =>
      this.enqueueWithManager(
        transactionManager,
        input,
        sourceVersion,
        maxAttempts,
      ),
    );
  }

  /**
   * Allocates a monotonic source version from PostgreSQL's sequence and writes
   * the event with the supplied transaction manager. The sequence allocation
   * happens after the aggregate advisory lock in `enqueueWithManager`, so two
   * concurrent mutations of one aggregate cannot be rejected merely because
   * their application transactions were scheduled in a different order.
   */
  async enqueueWithNextSourceVersionIfNeeded(
    input: EnqueueAiIndexEventWithoutSourceVersionInput,
    manager?: EntityManager,
    options: EnqueueAiIndexEventIfNeededOptions = {},
  ): Promise<EnqueueAiIndexEventIfNeededResult> {
    const maxAttempts = input.maxAttempts ?? 10;
    validateEnqueueShape(input, maxAttempts);

    const enqueue = async (
      transactionManager: EntityManager,
    ): Promise<EnqueueAiIndexEventIfNeededResult> => {
      // Serialize the read-and-allocate decision with the same aggregate lock
      // used by enqueueWithManager. Without this lock two repeated operational
      // scans could both observe no latest row and allocate duplicate work.
      await transactionManager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`ai-index:${input.aggregateType}:${input.aggregateId}`],
      );
      const repository = transactionManager.getRepository(AiIndexOutbox);
      const latest = await findLatestOutbox(repository, input);
      if (
        latest &&
        latest.operation === input.operation &&
        shouldCoalesceLatest(latest, options.force === true)
      ) {
        return { outbox: latest, enqueued: false };
      }

      return {
        outbox: await this.enqueueWithNextSourceVersion(
          input,
          transactionManager,
        ),
        enqueued: true,
      };
    };

    if (manager) return enqueue(manager);
    return this.outboxRepository.manager.transaction(enqueue);
  }

  async enqueueWithNextSourceVersion(
    input: EnqueueAiIndexEventWithoutSourceVersionInput,
    manager?: EntityManager,
  ): Promise<AiIndexOutbox> {
    const maxAttempts = input.maxAttempts ?? 10;
    validateEnqueueShape(input, maxAttempts);

    const enqueue = (transactionManager: EntityManager) =>
      this.enqueueWithManager(
        transactionManager,
        input,
        undefined,
        maxAttempts,
      );

    if (manager) return enqueue(manager);
    return this.outboxRepository.manager.transaction(enqueue);
  }

  enqueueJobUpsert(
    jobId: string,
    sourceVersion: string | number | bigint,
    manager?: EntityManager,
  ): Promise<AiIndexOutbox> {
    return this.enqueue(
      {
        aggregateType: AiIndexAggregateType.JOB,
        aggregateId: jobId,
        sourceVersion,
        operation: AiIndexOutboxOperation.UPSERT,
      },
      manager,
    );
  }

  enqueueJobDelete(
    jobId: string,
    sourceVersion: string | number | bigint,
    manager?: EntityManager,
  ): Promise<AiIndexOutbox> {
    return this.enqueue(
      {
        aggregateType: AiIndexAggregateType.JOB,
        aggregateId: jobId,
        sourceVersion,
        operation: AiIndexOutboxOperation.DELETE,
      },
      manager,
    );
  }

  enqueueCompanyReindex(
    companyId: string,
    sourceVersion: string | number | bigint,
    manager?: EntityManager,
  ): Promise<AiIndexOutbox> {
    return this.enqueue(
      {
        aggregateType: AiIndexAggregateType.COMPANY,
        aggregateId: companyId,
        sourceVersion,
        operation: AiIndexOutboxOperation.REINDEX_COMPANY,
      },
      manager,
    );
  }

  private async enqueueWithManager(
    manager: EntityManager,
    input:
      | EnqueueAiIndexEventInput
      | EnqueueAiIndexEventWithoutSourceVersionInput,
    sourceVersion: string | undefined,
    maxAttempts: number,
  ): Promise<AiIndexOutbox> {
    // A transaction-scoped advisory lock closes the first-event race where no
    // row exists yet to lock with SELECT ... FOR UPDATE.
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`ai-index:${input.aggregateType}:${input.aggregateId}`],
    );

    const effectiveSourceVersion =
      sourceVersion ?? (await nextSourceVersion(manager));
    const versionedInput = input as EnqueueAiIndexEventInput;
    validateEnqueueInput(versionedInput, effectiveSourceVersion, maxAttempts);

    const repository = manager.getRepository(AiIndexOutbox);
    const where: FindOptionsWhere<AiIndexOutbox> = {
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      sourceVersion: effectiveSourceVersion,
    };
    const existing = await repository.findOne({ where });
    if (existing) {
      if (existing.operation !== input.operation) {
        throw new Error(
          'AI_INDEX_SOURCE_VERSION_CONFLICT: source version already has another operation',
        );
      }
      return existing;
    }

    const latest = await repository
      .createQueryBuilder('outbox')
      .select('outbox.sourceVersion', 'sourceVersion')
      .where('outbox.aggregateType = :aggregateType', {
        aggregateType: input.aggregateType,
      })
      .andWhere('outbox.aggregateId = :aggregateId', {
        aggregateId: input.aggregateId,
      })
      .orderBy('outbox.sourceVersion', 'DESC')
      .limit(1)
      .setLock('pessimistic_write')
      .getRawOne<{ sourceVersion?: string }>();

    if (latest?.sourceVersion !== undefined) {
      const latestVersion = BigInt(latest.sourceVersion);
      if (BigInt(effectiveSourceVersion) <= latestVersion) {
        throw new Error(
          'AI_INDEX_SOURCE_VERSION_REGRESSION: source version must be monotonic',
        );
      }
    }

    return repository.save(
      repository.create({
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        sourceVersion: effectiveSourceVersion,
        operation: input.operation,
        status: AiIndexOutboxStatus.PENDING,
        attempts: 0,
        maxAttempts,
        nextRetryAt: new Date(),
        lastAttemptAt: null,
        leasedAt: null,
        leaseExpiresAt: null,
        leaseOwner: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        lastErrorAt: null,
        processedAt: null,
      }),
    );
  }
}

async function nextSourceVersion(manager: EntityManager): Promise<string> {
  const rows = (await manager.query(
    `SELECT nextval('ai_index_source_version_seq'::regclass) AS source_version`,
  )) as Array<{
    source_version?: string | number | bigint;
    sourceVersion?: string | number | bigint;
  }>;
  const value = rows[0]?.source_version ?? rows[0]?.sourceVersion;
  if (value === undefined || value === null) {
    throw new Error(
      'AI_INDEX_SOURCE_VERSION_UNAVAILABLE: PostgreSQL did not return a source version',
    );
  }
  return normalizeSourceVersion(value);
}

function normalizeSourceVersion(value: string | number | bigint): string {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(
        'AI_INDEX_INVALID_SOURCE_VERSION: expected a positive integer',
      );
    }
    return String(value);
  }

  const normalized = String(value).trim();
  if (!/^[0-9]+$/.test(normalized)) {
    throw new Error(
      'AI_INDEX_INVALID_SOURCE_VERSION: expected a positive integer',
    );
  }
  const parsed = BigInt(normalized);
  if (parsed < 1n) {
    throw new Error(
      'AI_INDEX_INVALID_SOURCE_VERSION: expected a positive integer',
    );
  }
  if (parsed > 9223372036854775807n) {
    throw new Error(
      'AI_INDEX_INVALID_SOURCE_VERSION: value exceeds PostgreSQL bigint',
    );
  }
  return parsed.toString();
}

function validateEnqueueInput(
  input: EnqueueAiIndexEventInput,
  sourceVersion: string,
  maxAttempts: number,
): void {
  validateEnqueueShape(input, maxAttempts);
  if (BigInt(sourceVersion) < 1n) {
    throw new Error(
      'AI_INDEX_INVALID_SOURCE_VERSION: expected a positive integer',
    );
  }
}

function validateEnqueueShape(
  input:
    | EnqueueAiIndexEventInput
    | EnqueueAiIndexEventWithoutSourceVersionInput,
  maxAttempts: number,
): void {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      input.aggregateId,
    )
  ) {
    throw new Error('AI_INDEX_INVALID_AGGREGATE_ID: expected a UUID');
  }
  const validOperation =
    (input.aggregateType === AiIndexAggregateType.JOB &&
      (input.operation === AiIndexOutboxOperation.UPSERT ||
        input.operation === AiIndexOutboxOperation.DELETE)) ||
    (input.aggregateType === AiIndexAggregateType.COMPANY &&
      input.operation === AiIndexOutboxOperation.REINDEX_COMPANY);
  if (!validOperation) {
    throw new Error(
      'AI_INDEX_INVALID_OPERATION: operation does not match aggregate type',
    );
  }
  if (
    !Number.isSafeInteger(maxAttempts) ||
    maxAttempts < 1 ||
    maxAttempts > 100
  ) {
    throw new Error(
      'AI_INDEX_INVALID_MAX_ATTEMPTS: expected an integer from 1 to 100',
    );
  }
}


async function findLatestOutbox(
  repository: Repository<AiIndexOutbox>,
  input: EnqueueAiIndexEventWithoutSourceVersionInput,
): Promise<AiIndexOutbox | null> {
  const rows = await repository.find({
    where: {
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
    },
    order: {
      sourceVersion: 'DESC',
      createdAt: 'DESC',
      _id: 'DESC',
    },
    take: 1,
  });
  return rows[0] ?? null;
}

function shouldCoalesceLatest(
  latest: AiIndexOutbox,
  force: boolean,
): boolean {
  switch (latest.status) {
    case AiIndexOutboxStatus.PENDING:
    case AiIndexOutboxStatus.PROCESSING:
      return true;
    case AiIndexOutboxStatus.SUCCEEDED:
    case AiIndexOutboxStatus.FAILED:
    case AiIndexOutboxStatus.DEAD_LETTER:
      return !force;
    case AiIndexOutboxStatus.CANCELLED:
      return false;
    default:
      return false;
  }
}
