describe('Lambda outbox publisher handler', () => {
  let handler: import('aws-lambda').Handler;
  let createApplicationContext: jest.Mock;
  let publish: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    createApplicationContext = jest.fn();
    publish = jest.fn();
    jest.doMock('@nestjs/core', () => ({
      NestFactory: { createApplicationContext },
    }));
    jest.doMock('./scripts/ai-index-operational.module', () => ({
      AiIndexOperationalModule: class AiIndexOperationalModule {},
    }));
    jest.doMock('./ai-indexing', () => ({
      AiIndexPublisherService: class AiIndexPublisherService {},
    }));
    ({ handler } = require('./lambda-outbox-publisher'));
  });

  it('retries Nest context initialization after an initialization failure', async () => {
    const result = {
      claimed: 1,
      published: 1,
      failed: 0,
      leaseLost: 0,
      ambiguous: 0,
    };
    createApplicationContext
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce({
        get: jest.fn(() => ({ publish: publish.mockResolvedValue(result) })),
      });

    await expect(handler({}, {} as never, jest.fn())).rejects.toThrow(
      'database unavailable',
    );
    await expect(handler({}, {} as never, jest.fn())).resolves.toEqual(result);

    expect(createApplicationContext).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('caches the operational Nest context and returns bounded publication counts', async () => {
    const result = {
      claimed: 1,
      published: 1,
      failed: 0,
      leaseLost: 0,
      ambiguous: 0,
    };
    createApplicationContext.mockResolvedValue({
      get: jest.fn(() => ({ publish })),
    });
    publish.mockResolvedValue({ ...result, environment: 'staging' });

    await expect(
      Promise.all([
        handler({}, {} as never, jest.fn()),
        handler({}, {} as never, jest.fn()),
      ]),
    ).resolves.toEqual([result, result]);
    expect(createApplicationContext).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenCalledWith();
  });
});
