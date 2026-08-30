import { ConfigService } from '@nestjs/config';
import { AiIndexDrainService } from './ai-index-drain.service';

function config(
  environment = 'local',
  outboxEnvironment?: string,
): ConfigService {
  const hasExplicitOutboxEnvironment = arguments.length > 1;
  return {
    get: jest.fn((key: string, fallback?: unknown) => {
      if (key === 'AI_INDEX_ENVIRONMENT') return environment;
      if (key === 'AI_INDEX_OUTBOX_ENVIRONMENT') {
        return hasExplicitOutboxEnvironment ? outboxEnvironment : environment;
      }
      return fallback;
    }),
  } as never;
}

describe('AiIndexDrainService', () => {
  it('stops after the first empty batch and aggregates dispatcher statuses', async () => {
    const processBatch = jest
      .fn()
      .mockResolvedValueOnce([
        { outboxId: 'first', status: 'SUCCEEDED' },
        { outboxId: 'second', status: 'RETRY_SCHEDULED' },
      ])
      .mockResolvedValueOnce([]);
    const service = new AiIndexDrainService(
      { processBatch } as never,
      config(),
    );

    await expect(
      service.drain({ environment: 'local', batchSize: 2, maxBatches: 4 }),
    ).resolves.toEqual({
      environment: 'local',
      batchesProcessed: 1,
      processed: 2,
      status: 'COMPLETED',
      results: {
        SUCCEEDED: 1,
        RETRY_SCHEDULED: 1,
        DEAD_LETTER: 0,
        LEASE_LOST: 0,
      },
    });
    expect(processBatch).toHaveBeenCalledTimes(2);
    expect(processBatch).toHaveBeenCalledWith(2);
  });

  it('returns IN_PROGRESS when its configured batch budget is exhausted', async () => {
    const processBatch = jest
      .fn()
      .mockResolvedValue([{ outboxId: 'first', status: 'SUCCEEDED' }]);
    const service = new AiIndexDrainService(
      { processBatch } as never,
      config(),
    );

    await expect(
      service.drain({ environment: 'local', batchSize: 1, maxBatches: 2 }),
    ).resolves.toMatchObject({
      batchesProcessed: 2,
      processed: 2,
      status: 'IN_PROGRESS',
      results: { SUCCEEDED: 2 },
    });
    expect(processBatch).toHaveBeenCalledTimes(2);
  });

  it('rejects a command environment that differs from the configured environment', async () => {
    const service = new AiIndexDrainService(
      { processBatch: jest.fn() } as never,
      config('staging'),
    );

    await expect(service.drain({ environment: 'production' })).rejects.toThrow(
      'AI_INDEX_ENVIRONMENT_MISMATCH',
    );
  });

  it('does not dispatch when a non-local outbox environment is absent', async () => {
    const processBatch = jest.fn();
    const service = new AiIndexDrainService(
      { processBatch } as never,
      config('staging', undefined),
    );

    await expect(service.drain({ environment: 'staging' })).rejects.toThrow(
      'AI_INDEX_OUTBOX_ENVIRONMENT must be explicitly set',
    );
    expect(processBatch).not.toHaveBeenCalled();
  });
});
