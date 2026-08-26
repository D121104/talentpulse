import { AIMatchingService } from './ai-matching.service';

describe('AIMatchingService.onModuleInit', () => {
  const originalRedisEnabled = process.env.REDIS_ENABLED;
  const originalBackgroundJobs = process.env.RUN_BACKGROUND_JOBS;

  afterEach(() => {
    if (originalRedisEnabled === undefined) {
      delete process.env.REDIS_ENABLED;
    } else {
      process.env.REDIS_ENABLED = originalRedisEnabled;
    }

    if (originalBackgroundJobs === undefined) {
      delete process.env.RUN_BACKGROUND_JOBS;
    } else {
      process.env.RUN_BACKGROUND_JOBS = originalBackgroundJobs;
    }
  });

  it.each([
    ['Redis is disabled', 'false', 'true'],
    ['background jobs are disabled', 'true', 'false'],
  ])('does not preload parsers or the Xenova model when %s', async (_reason, redisEnabled, backgroundJobs) => {
    process.env.REDIS_ENABLED = redisEnabled;
    process.env.RUN_BACKGROUND_JOBS = backgroundJobs;

    const service = new AIMatchingService();
    const loadModel = jest.spyOn(service as any, 'loadModel');
    const loadPdfParser = jest.spyOn(service as any, 'loadPdfParser');
    const loadMammoth = jest.spyOn(service as any, 'loadMammoth');

    await service.onModuleInit();

    expect(loadModel).not.toHaveBeenCalled();
    expect(loadPdfParser).not.toHaveBeenCalled();
    expect(loadMammoth).not.toHaveBeenCalled();
  });

  it('preloads the model and parsers when workers are enabled', async () => {
    process.env.REDIS_ENABLED = 'true';
    process.env.RUN_BACKGROUND_JOBS = 'true';

    const service = new AIMatchingService();
    const loadModel = jest
      .spyOn(service as any, 'loadModel')
      .mockResolvedValue(undefined);
    const loadPdfParser = jest
      .spyOn(service as any, 'loadPdfParser')
      .mockResolvedValue(undefined);
    const loadMammoth = jest
      .spyOn(service as any, 'loadMammoth')
      .mockResolvedValue(undefined);

    await service.onModuleInit();

    expect(loadModel).toHaveBeenCalledTimes(1);
    expect(loadPdfParser).toHaveBeenCalledTimes(1);
    expect(loadMammoth).toHaveBeenCalledTimes(1);
  });
});
