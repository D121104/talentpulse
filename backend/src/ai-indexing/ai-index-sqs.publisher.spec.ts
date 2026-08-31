const mockSend = jest.fn();
const mockSqsClient = jest.fn(() => ({ send: mockSend }));
const mockSendMessageCommand = jest.fn((input) => ({ input }));

jest.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: mockSqsClient,
  SendMessageCommand: mockSendMessageCommand,
}));

import { ConfigService } from '@nestjs/config';
import {
  AiIndexSqsPublisherAdapter,
  createAiIndexSqsMessage,
} from './ai-index-sqs.publisher';

describe('AiIndexSqsPublisherAdapter', () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockSqsClient.mockClear();
    mockSendMessageCommand.mockClear();
  });

  it('sends the exact ID-only notification to the configured queue URL', async () => {
    const adapter = new AiIndexSqsPublisherAdapter(
      new ConfigService({
        AI_INDEX_QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/123/indexing',
      }),
    );
    mockSend.mockResolvedValue({});

    await expect(
      adapter.publish('AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'),
    ).resolves.toBeUndefined();

    expect(mockSendMessageCommand).toHaveBeenCalledWith({
      QueueUrl: 'https://sqs.us-east-1.amazonaws.com/123/indexing',
      MessageBody: '{"outboxId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}',
    });
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          QueueUrl: 'https://sqs.us-east-1.amazonaws.com/123/indexing',
          MessageBody: '{"outboxId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}',
        },
      }),
      expect.objectContaining({ abortSignal: expect.any(AbortSignal) }),
    );
  });
});

describe('createAiIndexSqsMessage', () => {
  it('serializes exactly one lower-case outboxId property', () => {
    expect(
      createAiIndexSqsMessage('AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'),
    ).toBe('{"outboxId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}');
  });
});
