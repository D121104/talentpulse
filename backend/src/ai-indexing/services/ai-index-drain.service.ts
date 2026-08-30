import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveAiIndexEnvironment } from '../../config/ai-index-environment';
import {
  AiIndexDispatchResultStatus,
  AiIndexDispatcherService,
} from './ai-index-dispatcher.service';

export const MAX_AI_INDEX_DRAIN_BATCH_SIZE = 100;
export const MAX_AI_INDEX_DRAIN_BATCHES = 1_000;

export interface AiIndexDrainOptions {
  environment?: string;
  batchSize?: number;
  maxBatches?: number;
}

export interface AiIndexDrainResult {
  environment: string;
  batchesProcessed: number;
  processed: number;
  status: 'COMPLETED' | 'IN_PROGRESS';
  results: Record<AiIndexDispatchResultStatus, number>;
}

type AiIndexBatchDispatcher = Pick<AiIndexDispatcherService, 'processBatch'>;

/**
 * Explicit bounded dispatcher runner for operational jobs. Network delivery is
 * delegated to the dispatcher, whose claim and finalization transactions are
 * intentionally separate from its AI calls.
 */
@Injectable()
export class AiIndexDrainService {
  constructor(
    private readonly dispatcher: AiIndexBatchDispatcher,
    private readonly configService: ConfigService,
  ) {}

  async drain(options: AiIndexDrainOptions = {}): Promise<AiIndexDrainResult> {
    const environment = resolveAiIndexEnvironment(
      this.configService,
      options.environment,
    );
    const batchSize = boundedDrainValue(
      options.batchSize,
      MAX_AI_INDEX_DRAIN_BATCH_SIZE,
      'AI_INDEX_DRAIN_BATCH_SIZE',
      10,
    );
    const maxBatches = boundedDrainValue(
      options.maxBatches,
      MAX_AI_INDEX_DRAIN_BATCHES,
      'AI_INDEX_DRAIN_MAX_BATCHES',
      1,
    );
    const results = emptyResultCounts();
    let batchesProcessed = 0;
    let processed = 0;

    for (let batchNumber = 0; batchNumber < maxBatches; batchNumber += 1) {
      const batch = await this.dispatcher.processBatch(batchSize);
      if (batch.length === 0) {
        return {
          environment,
          batchesProcessed,
          processed,
          status: 'COMPLETED',
          results,
        };
      }
      batchesProcessed += 1;
      processed += batch.length;
      for (const result of batch) results[result.status] += 1;
    }

    return {
      environment,
      batchesProcessed,
      processed,
      status: 'IN_PROGRESS',
      results,
    };
  }
}

function boundedDrainValue(
  value: number | undefined,
  max: number,
  name: string,
  fallback: number,
): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new Error(name + ' must be an integer between 1 and ' + max);
  }
  return value;
}

function emptyResultCounts(): Record<AiIndexDispatchResultStatus, number> {
  return {
    SUCCEEDED: 0,
    RETRY_SCHEDULED: 0,
    DEAD_LETTER: 0,
    LEASE_LOST: 0,
  };
}
