import type { INestApplicationContext } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Handler } from 'aws-lambda';
import { AiIndexPublisherService } from './ai-indexing';
import { AiIndexOperationalModule } from './scripts/ai-index-operational.module';

let cachedContext: INestApplicationContext | undefined;
let initialization: Promise<INestApplicationContext> | undefined;
const logger = new Logger('AiIndexOutboxPublisherLambda');

type Publisher = Pick<AiIndexPublisherService, 'publish'>;
export interface AiIndexOutboxPublisherLambdaResult {
  claimed: number;
  published: number;
  failed: number;
  leaseLost: number;
  ambiguous: number;
}

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

/** Runs one bounded initial-publication batch for a scheduled Lambda trigger. */
export const handler: Handler<unknown, AiIndexOutboxPublisherLambdaResult> =
  async () => {
    const context = await getContext();
    const result = await context
      .get<Publisher>(AiIndexPublisherService)
      .publish();
    logger.log(
      `published=${result.published} failed=${result.failed} leaseLost=${result.leaseLost} ambiguous=${result.ambiguous}`,
    );
    return {
      claimed: result.claimed,
      published: result.published,
      failed: result.failed,
      leaseLost: result.leaseLost,
      ambiguous: result.ambiguous,
    };
  };
