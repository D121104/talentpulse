import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { validate as isUuid } from 'uuid';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import {
  AiProviderAttemptIdFactoryToken,
  AiProviderAttemptNowFactoryToken,
} from '../../ai-client/ai-provider-attempt.contracts';
import type {
  AiProviderAttemptHandle,
  AiProviderAttemptRecorderPort,
  CompleteAiProviderAttemptInput,
  StartAiProviderAttemptInput,
} from '../../ai-client/ai-provider-attempt.types';
import {
  AI_PROVIDER_ATTEMPT_MODEL_MAX_LENGTH,
  AI_PROVIDER_ATTEMPT_PROVIDER_MAX_LENGTH,
  normalizeAiProviderAttemptErrorCode,
  normalizeAiProviderAttemptLabel,
  requireAiProviderAttemptLabel,
} from '../../ai-client/ai-provider-attempt.validation';
import {
  AiProviderAttempt,
  AiProviderAttemptStatus,
} from '../entities/ai-provider-attempt.entity';

export {
  AI_PROVIDER_ATTEMPT_ERROR_CODE_MAX_LENGTH,
  AI_PROVIDER_ATTEMPT_MODEL_MAX_LENGTH,
  AI_PROVIDER_ATTEMPT_PROVIDER_MAX_LENGTH,
} from '../../ai-client/ai-provider-attempt.validation';

export const AI_PROVIDER_ATTEMPT_SWEEP_MAX_LIMIT = 100;

@Injectable()
export class AiProviderAttemptRecorder
  implements AiProviderAttemptRecorderPort
{
  constructor(
    @InjectRepository(AiProviderAttempt)
    private readonly repository: Repository<AiProviderAttempt>,
    @Inject(AiProviderAttemptIdFactoryToken)
    private readonly createProviderAttemptId: () => string = randomUUID,
    @Inject(AiProviderAttemptNowFactoryToken)
    private readonly now: () => Date = () => new Date(),
  ) {}

  async start(
    input: StartAiProviderAttemptInput,
  ): Promise<AiProviderAttemptHandle> {
    const providerAttemptId = this.requireUuid(
      this.createProviderAttemptId(),
      'providerAttemptId',
    );
    const startedAt = this.now();
    const entity = this.repository.create({
      providerAttemptId,
      requestId: this.requireUuid(input.requestId, 'requestId'),
      traceId: this.requireUuid(input.traceId, 'traceId'),
      operationAttemptId: this.optionalUuid(
        input.operationAttemptId,
        'operationAttemptId',
      ),
      outboxId: this.optionalUuid(input.outboxId, 'outboxId'),
      jobId: this.optionalUuid(input.jobId, 'jobId'),
      attemptNumber: this.requireAttemptNumber(input.attemptNumber),
      provider: requireAiProviderAttemptLabel(
        input.provider,
        AI_PROVIDER_ATTEMPT_PROVIDER_MAX_LENGTH,
        'provider',
      ),
      model: requireAiProviderAttemptLabel(
        input.model,
        AI_PROVIDER_ATTEMPT_MODEL_MAX_LENGTH,
        'model',
      ),
      requestSent: false,
      status: AiProviderAttemptStatus.STARTED,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      estimatedCost: null,
      errorCode: null,
      startedAt,
      completedAt: null,
    });
    await this.repository.save(entity);
    return { providerAttemptId };
  }

  /** Marks the handoff point immediately before invoking HTTP transport. */
  async markRequestSent(handle: AiProviderAttemptHandle): Promise<void> {
    await this.updateStarted(handle, { requestSent: true });
  }

  async succeed(
    handle: AiProviderAttemptHandle,
    input: CompleteAiProviderAttemptInput = {},
  ): Promise<void> {
    await this.updateStarted(handle, {
      status: AiProviderAttemptStatus.SUCCEEDED,
      completedAt: this.now(),
      ...this.completionChanges(input),
    });
  }

  async fail(
    handle: AiProviderAttemptHandle,
    errorCode: string,
    input: CompleteAiProviderAttemptInput = {},
  ): Promise<void> {
    await this.updateStarted(handle, {
      status: AiProviderAttemptStatus.FAILED,
      errorCode: normalizeAiProviderAttemptErrorCode(errorCode),
      completedAt: this.now(),
      ...this.completionChanges(input),
    });
  }

  async unknown(
    handle: AiProviderAttemptHandle,
    errorCode: string,
    input: CompleteAiProviderAttemptInput = {},
  ): Promise<void> {
    const requestedRequestSent = input.requestSent === true;

    if (requestedRequestSent) {
      // The local handoff flag is authoritative when the persistence of
      // markRequestSent itself failed. Atomically promote the row to UNKNOWN
      // and set request_sent=true in the same UPDATE, without requiring the
      // old request_sent value to be true.
      await this.updateStarted(handle, {
        status: AiProviderAttemptStatus.UNKNOWN,
        errorCode: normalizeAiProviderAttemptErrorCode(errorCode),
        completedAt: this.now(),
        ...this.completionChanges(input),
        requestSent: true,
      });
      return;
    }

    // UNKNOWN is never valid before handoff. Restrict the predicate to an
    // unsent STARTED row so a concurrent mark or terminal callback wins.
    await this.updateStarted(
      handle,
      {
        status: AiProviderAttemptStatus.FAILED,
        errorCode: AI_PROVIDER_ATTEMPT_UNKNOWN_BEFORE_SEND,
        completedAt: this.now(),
        ...this.completionChanges({ ...input, requestSent: false }),
        requestSent: false,
      },
      false,
    );
  }

  /**
   * Bounded recovery for rows left STARTED by a process crash or audit outage.
   * It is intentionally explicit; callers decide when to invoke it.
   */
  async terminalizeStaleStartedAttempts(
    cutoff: Date,
    limit = AI_PROVIDER_ATTEMPT_SWEEP_MAX_LIMIT,
  ): Promise<number> {
    if (!(cutoff instanceof Date) || Number.isNaN(cutoff.getTime())) {
      throw new Error('AI_PROVIDER_ATTEMPT_CUTOFF_INVALID');
    }
    const boundedLimit = boundedSweepLimit(limit);
    const staleRows = await this.repository.find({
      where: {
        status: AiProviderAttemptStatus.STARTED,
        startedAt: LessThan(cutoff),
      },
      order: { startedAt: 'ASC', providerAttemptId: 'ASC' },
      take: boundedLimit,
    });

    let terminalized = 0;
    for (const row of staleRows.slice(0, boundedLimit)) {
      const requestSent = row.requestSent === true;
      const completedAt = this.completionTime(row.startedAt);
      const result = await this.repository.update(
        {
          providerAttemptId: row.providerAttemptId,
          status: AiProviderAttemptStatus.STARTED,
          requestSent,
        },
        {
          status: requestSent
            ? AiProviderAttemptStatus.UNKNOWN
            : AiProviderAttemptStatus.FAILED,
          requestSent,
          errorCode: requestSent
            ? AI_PROVIDER_ATTEMPT_STALE_AFTER_SEND
            : AI_PROVIDER_ATTEMPT_STALE_BEFORE_SEND,
          completedAt,
        },
      );
      if (result.affected === 1) terminalized += 1;
    }
    return terminalized;
  }

  private async updateStarted(
    handle: AiProviderAttemptHandle,
    changes: Partial<AiProviderAttempt>,
    requestSent?: boolean,
  ): Promise<number> {
    const providerAttemptId = this.requireUuid(
      handle.providerAttemptId,
      'providerAttemptId',
    );
    const result = await this.repository.update(
      {
        providerAttemptId,
        status: AiProviderAttemptStatus.STARTED,
        ...(requestSent === undefined ? {} : { requestSent }),
      },
      changes,
    );
    if (result.affected !== 1) {
      // A duplicate terminal callback must not overwrite an already finalized
      // audit row. The provider call itself remains the source of truth.
      return 0;
    }
    return 1;
  }

  private completionChanges(
    input: CompleteAiProviderAttemptInput,
  ): Partial<AiProviderAttempt> {
    const changes: Partial<AiProviderAttempt> = {};
    if (typeof input.requestSent === 'boolean') {
      changes.requestSent = input.requestSent;
    }
    if (input.inputTokens !== undefined) {
      const value = boundedCount(input.inputTokens);
      if (value !== undefined) changes.inputTokens = value;
    }
    if (input.outputTokens !== undefined) {
      const value = boundedCount(input.outputTokens);
      if (value !== undefined) changes.outputTokens = value;
    }
    if (input.totalTokens !== undefined) {
      const value = boundedCount(input.totalTokens);
      if (value !== undefined) changes.totalTokens = value;
    }
    if (input.estimatedCost !== undefined) {
      const value = boundedCost(input.estimatedCost);
      if (value !== undefined) changes.estimatedCost = value;
    }
    if (input.provider !== undefined) {
      const value = normalizeAiProviderAttemptLabel(
        input.provider,
        AI_PROVIDER_ATTEMPT_PROVIDER_MAX_LENGTH,
      );
      if (value !== undefined) changes.provider = value;
    }
    if (input.model !== undefined) {
      const value = normalizeAiProviderAttemptLabel(
        input.model,
        AI_PROVIDER_ATTEMPT_MODEL_MAX_LENGTH,
      );
      if (value !== undefined) changes.model = value;
    }
    return changes;
  }

  private completionTime(startedAt: Date): Date {
    const now = this.now();
    return now < startedAt ? startedAt : now;
  }

  private requireUuid(value: unknown, field: string): string {
    if (typeof value !== 'string' || !isUuid(value)) {
      throw new Error(`AI_PROVIDER_ATTEMPT_${field.toUpperCase()}_INVALID`);
    }
    return value.toLowerCase();
  }

  private optionalUuid(value: unknown, field: string): string | null {
    if (value === undefined || value === null || value === '') return null;
    return this.requireUuid(value, field);
  }

  private requireAttemptNumber(value: unknown): number {
    if (!Number.isSafeInteger(value) || Number(value) < 1) {
      throw new Error('AI_PROVIDER_ATTEMPT_NUMBER_INVALID');
    }
    return Number(value);
  }
}

const AI_PROVIDER_ATTEMPT_UNKNOWN_BEFORE_SEND =
  'AI_PROVIDER_UNKNOWN_BEFORE_SEND';
const AI_PROVIDER_ATTEMPT_STALE_BEFORE_SEND =
  'AI_PROVIDER_ATTEMPT_STALE_BEFORE_SEND';
const AI_PROVIDER_ATTEMPT_STALE_AFTER_SEND =
  'AI_PROVIDER_ATTEMPT_STALE_AFTER_SEND';

function boundedSweepLimit(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new Error('AI_PROVIDER_ATTEMPT_SWEEP_LIMIT_INVALID');
  }
  return Math.min(Number(value), AI_PROVIDER_ATTEMPT_SWEEP_MAX_LIMIT);
}

function boundedCount(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || Number(value) < 0) return undefined;
  return Number(value);
}

function boundedCost(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;

  const normalized = String(value).trim();
  if (!/^(?:0|[0-9]+)(?:\.[0-9]+)?$/.test(normalized)) return undefined;
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 10 ** 10) {
    return undefined;
  }
  return numeric.toFixed(8);
}
