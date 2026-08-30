import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type {
  SQSBatchResponse,
  SQSEvent,
  SQSHandler,
  SQSRecord,
} from 'aws-lambda';
import { validate as isUuid } from 'uuid';
import { AiIndexDispatcherService } from './ai-indexing/services/ai-index-dispatcher.service';
import type { AiIndexDispatchResult } from './ai-indexing/services/ai-index-dispatcher.service';
import { AiIndexOperationalModule } from './scripts/ai-index-operational.module';

export const MAX_SQS_INDEX_RECORDS = 10;

/** Identity-only command for the durable indexing outbox. */
export interface AiIndexSqsEventPayload {
  outboxId: string;
}

type IndexDispatcher = Pick<AiIndexDispatcherService, 'processOutbox'>;

let cachedContext: INestApplicationContext | undefined;
let initialization: Promise<INestApplicationContext> | undefined;

async function getContext(): Promise<INestApplicationContext> {
  if (!cachedContext) {
    initialization ??= NestFactory.createApplicationContext(
      AiIndexOperationalModule,
      { logger: ['error', 'warn'] },
    );
    try {
      cachedContext = await initialization;
    } catch (error) {
      initialization = undefined;
      throw error;
    }
  }

  return cachedContext;
}

export function parseAiIndexSqsEvent(body: string): AiIndexSqsEventPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error('AI index SQS message must be valid JSON');
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    Object.keys(parsed).length !== 1 ||
    !Object.prototype.hasOwnProperty.call(parsed, 'outboxId')
  ) {
    throw new Error('AI index SQS message must contain only outboxId');
  }

  const { outboxId } = parsed as { outboxId?: unknown };
  if (typeof outboxId !== 'string' || !isUuid(outboxId)) {
    throw new Error('AI index SQS outboxId must be a UUID');
  }

  return { outboxId: outboxId.toLowerCase() };
}

async function processRecord(record: SQSRecord): Promise<void> {
  const payload = parseAiIndexSqsEvent(record.body);
  const context = await getContext();
  const dispatcher = context.get<IndexDispatcher>(AiIndexDispatcherService);
  const result = await dispatcher.processOutbox(payload.outboxId);
  assertDurablyFinalized(payload.outboxId, result);
}

function assertDurablyFinalized(
  outboxId: string,
  result: AiIndexDispatchResult | null,
): void {
  if (result?.status !== 'SUCCEEDED' && result?.status !== 'DEAD_LETTER') {
    throw new Error(
      'AI index outbox ' + outboxId + ' is not durably finalized',
    );
  }
}

export const handler: SQSHandler = async (
  event: SQSEvent,
): Promise<SQSBatchResponse> => {
  const records = event.Records.slice(0, MAX_SQS_INDEX_RECORDS);
  const settled = await Promise.allSettled(records.map(processRecord));
  const batchItemFailures = settled.flatMap((result, index) =>
    result.status === 'rejected'
      ? [{ itemIdentifier: records[index].messageId }]
      : [],
  );

  if (event.Records.length > MAX_SQS_INDEX_RECORDS) {
    batchItemFailures.push(
      ...event.Records.slice(MAX_SQS_INDEX_RECORDS).map((record) => ({
        itemIdentifier: record.messageId,
      })),
    );
  }

  return { batchItemFailures };
};
