import type { Context, SQSEvent, SQSRecord } from 'aws-lambda';

const OUTBOX_ID = '11111111-1111-4111-8111-111111111111';

function sqsEvent(...bodies: string[]): SQSEvent {
  return {
    Records: bodies.map(
      (body, index) =>
        ({
          messageId: 'message-' + index,
          receiptHandle: 'receipt-handle',
          body,
          attributes: {},
          messageAttributes: {},
          md5OfBody: '',
          eventSource: 'aws:sqs',
          eventSourceARN: 'arn:aws:sqs:eu-west-1:123456789012:ai-index',
          awsRegion: 'eu-west-1',
        } as SQSRecord),
    ),
  };
}

describe('Lambda SQS indexing handler', () => {
  let handler: import('aws-lambda').SQSHandler;
  let createApplicationContext: jest.Mock;
  let processOutbox: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    createApplicationContext = jest.fn();
    processOutbox = jest.fn();

    jest.doMock('@nestjs/core', () => ({
      NestFactory: { createApplicationContext },
    }));
    jest.doMock('./scripts/ai-index-operational.module', () => ({
      AiIndexOperationalModule: class AiIndexOperationalModule {},
    }));
    jest.doMock('./ai-indexing/services/ai-index-dispatcher.service', () => ({
      AiIndexDispatcherService: class AiIndexDispatcherService {},
    }));

    ({ handler } = require('./lambda-sqs'));
  });

  it('initializes a cached operational context and processes an ID-only event', async () => {
    const applicationContext = {
      get: jest.fn(() => ({ processOutbox })),
    };
    createApplicationContext.mockResolvedValue(applicationContext);
    processOutbox.mockResolvedValue({
      outboxId: OUTBOX_ID,
      status: 'SUCCEEDED',
    });

    const results = await Promise.all([
      handler(
        sqsEvent(JSON.stringify({ outboxId: OUTBOX_ID })),
        {} as Context,
        jest.fn(),
      ),
      handler(
        sqsEvent(JSON.stringify({ outboxId: OUTBOX_ID })),
        {} as Context,
        jest.fn(),
      ),
    ]);

    expect(results).toEqual([
      { batchItemFailures: [] },
      { batchItemFailures: [] },
    ]);
    expect(createApplicationContext).toHaveBeenCalledTimes(1);
    expect(applicationContext.get).toHaveBeenCalledTimes(2);
    expect(processOutbox).toHaveBeenCalledWith(OUTBOX_ID);
  });

  it('returns a batch failure for malformed or content-bearing messages before initializing Nest', async () => {
    await expect(
      handler(
        sqsEvent(
          JSON.stringify({ outboxId: OUTBOX_ID, job: { title: 'secret' } }),
        ),
        {} as Context,
        jest.fn(),
      ),
    ).resolves.toEqual({
      batchItemFailures: [{ itemIdentifier: 'message-0' }],
    });

    expect(createApplicationContext).not.toHaveBeenCalled();
    expect(processOutbox).not.toHaveBeenCalled();
  });

  it('acknowledges a record already durably finalized in the application dead-letter state', async () => {
    const applicationContext = {
      get: jest.fn(() => ({ processOutbox })),
    };
    createApplicationContext.mockResolvedValue(applicationContext);
    processOutbox.mockResolvedValue({
      outboxId: OUTBOX_ID,
      status: 'DEAD_LETTER',
    });

    await expect(
      handler(
        sqsEvent(JSON.stringify({ outboxId: OUTBOX_ID })),
        {} as Context,
        jest.fn(),
      ),
    ).resolves.toEqual({ batchItemFailures: [] });
  });

  it('returns a batch failure when durable finalization did not succeed', async () => {
    const applicationContext = {
      get: jest.fn(() => ({ processOutbox })),
    };
    createApplicationContext.mockResolvedValue(applicationContext);
    processOutbox.mockResolvedValue({
      outboxId: OUTBOX_ID,
      status: 'RETRY_SCHEDULED',
    });

    await expect(
      handler(
        sqsEvent(JSON.stringify({ outboxId: OUTBOX_ID })),
        {} as Context,
        jest.fn(),
      ),
    ).resolves.toEqual({
      batchItemFailures: [{ itemIdentifier: 'message-0' }],
    });
  });
});
