import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';

export interface AiIndexSqsPublisherPort {
  publish(outboxId: string): Promise<void>;
}

export const AiIndexSqsPublisherToken = Symbol('AiIndexSqsPublisher');

/** A definite rejection means SQS confirmed that it did not accept the message. */
export class AiIndexSqsDefinitePublishError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'AiIndexSqsDefinitePublishError';
  }
}

@Injectable()
export class AiIndexSqsPublisherAdapter implements AiIndexSqsPublisherPort {
  private readonly client = new SQSClient({});

  constructor(private readonly configService: ConfigService) {}

  async publish(outboxId: string): Promise<void> {
    const queueUrl = String(
      this.configService.get<string>('AI_INDEX_QUEUE_URL', '') ?? '',
    ).trim();
    if (!queueUrl) {
      throw new AiIndexSqsDefinitePublishError(
        'AI_INDEX_QUEUE_URL_MISSING',
        'AI_INDEX_QUEUE_URL is required to publish indexing notifications',
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs());
    try {
      await this.client.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: createAiIndexSqsMessage(outboxId),
        }),
        { abortSignal: controller.signal },
      );
    } catch (error) {
      const details = error as {
        name?: unknown;
        $metadata?: { httpStatusCode?: unknown };
      };
      const httpStatus = Number(details.$metadata?.httpStatusCode);
      if (
        Number.isInteger(httpStatus) &&
        httpStatus >= 400 &&
        httpStatus < 500 &&
        httpStatus !== 429
      ) {
        throw new AiIndexSqsDefinitePublishError(
          safeErrorCode(details.name, 'AI_INDEX_SQS_REJECTED'),
          'SQS rejected the indexing notification',
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private timeoutMs(): number {
    const value = Number(
      this.configService.get('AI_INDEX_PUBLISH_TIMEOUT_MS', 5_000),
    );
    if (!Number.isInteger(value) || value < 100 || value > 60_000) {
      throw new Error(
        'AI_INDEX_PUBLISH_TIMEOUT_MS must be an integer between 100 and 60000',
      );
    }
    return value;
  }
}

function safeErrorCode(value: unknown, fallback: string): string {
  const code = String(value ?? '')
    .replace(/[^A-Za-z0-9_.-]/g, '')
    .slice(0, 80);
  return code || fallback;
}

/** Exact compatibility contract consumed by lambda-sqs.ts. */
export function createAiIndexSqsMessage(outboxId: string): string {
  return JSON.stringify({ outboxId: outboxId.toLowerCase() });
}
