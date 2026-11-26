import { ConfigService } from '@nestjs/config';
import { BullMetricsService } from 'src/observability/bull-metrics.service';
import { MetricsService } from 'src/observability/metrics.service';
import {
  BULL_JOB_STATES,
  OBSERVABILITY_BULL_QUEUES,
} from 'src/observability/observability.constants';

describe('BullMetricsService', () => {
  let metricsService: MetricsService;

  beforeEach(() => {
    metricsService = new MetricsService();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  async function getMetricValue(
    metricName: string,
    expectedLabels: Record<string, string>,
  ): Promise<number | undefined> {
    const metrics = await metricsService.getRegistry().getMetricsAsJSON();
    const metric = metrics.find((entry) => entry.name === metricName);
    const sample = metric?.values.find((entry) =>
      Object.entries(expectedLabels).every(
        ([key, value]) => String(entry.labels?.[key]) === value,
      ),
    );
    return sample?.value;
  }

  it('handles missing optional queues and dependencies without throwing', async () => {
    const service = new BullMetricsService(
      metricsService,
      new ConfigService({ NODE_ENV: 'test' }),
    );

    await expect(service.collectAll()).resolves.toBeUndefined();

    expect(
      await getMetricValue('backend_dependency_up', { dependency: 'postgres' }),
    ).toBe(0);
    expect(
      await getMetricValue('backend_dependency_up', { dependency: 'redis' }),
    ).toBe(0);
    expect(
      await getMetricValue('backend_dependency_up', {
        dependency: 'elasticsearch',
      }),
    ).toBe(0);

    const metrics = await metricsService.getRegistry().getMetricsAsJSON();
    const dependencyMetric = metrics.find(
      (entry) => entry.name === 'backend_dependency_up',
    );
    const recordedDependencies = (dependencyMetric?.values ?? []).map(
      (sample) => sample.labels?.dependency,
    );
    expect(recordedDependencies.sort()).toEqual([
      'elasticsearch',
      'postgres',
      'redis',
    ]);
  });

  it('scrapes configured Bull queues and records scrape errors on queue failures', async () => {
    const healthyQueue = {
      getJobCounts: jest.fn().mockResolvedValue({
        waiting: 5,
        active: 2,
        completed: 12,
        failed: 1,
        delayed: 3,
        paused: 0,
      }),
    };
    const failingQueue = {
      getJobCounts: jest.fn().mockRejectedValue(new Error('Redis ECONNRESET')),
    };
    const malformedQueue = {};

    const service = new BullMetricsService(
      metricsService,
      new ConfigService({ NODE_ENV: 'test' }),
      undefined,
      undefined,
      undefined,
      healthyQueue as any,
      failingQueue as any,
      malformedQueue as any,
      undefined,
      {
        getJobCounts: jest.fn().mockResolvedValue({ waiting: 1 }),
      } as any,
    );

    await service.collectQueueMetrics();

    expect(
      await getMetricValue('bull_queue_jobs', {
        queue: 'cv-processing',
        state: 'waiting',
      }),
    ).toBe(5);
    expect(
      await getMetricValue('bull_queue_jobs', {
        queue: 'cv-processing',
        state: 'completed',
      }),
    ).toBe(12);
    expect(
      await getMetricValue('bull_queue_scrape_errors_total', {
        queue: 'job-sync-es',
      }),
    ).toBe(1);
    expect(
      await getMetricValue('bull_queue_scrape_errors_total', {
        queue: 'cv-processing',
      }),
    ).toBeUndefined();

    for (const state of BULL_JOB_STATES) {
      expect(
        await getMetricValue('bull_queue_jobs', {
          queue: 'user-cv-parse',
          state,
        }),
      ).toBe(state === 'waiting' ? 1 : 0);
    }

    expect(OBSERVABILITY_BULL_QUEUES).toHaveLength(5);
  });

  it('updates dependency up gauges for postgres, redis, and elasticsearch without probing AI service', async () => {
    const dataSource = {
      isInitialized: true,
      query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    const redisService = {
      getValue: jest.fn().mockResolvedValue(null),
    };
    const esPing = jest.fn().mockResolvedValue(true);
    const elasticsearchService = {
      getClient: jest.fn(() => ({ ping: esPing })),
    };

    const service = new BullMetricsService(
      metricsService,
      new ConfigService({ NODE_ENV: 'test', REDIS_ENABLED: 'true' }),
      dataSource as any,
      redisService as any,
      elasticsearchService as any,
    );

    await service.collectDependencyMetrics();

    expect(dataSource.query).toHaveBeenCalledWith('SELECT 1');
    expect(redisService.getValue).toHaveBeenCalledWith(
      '__observability_health_probe__',
    );
    expect(esPing).toHaveBeenCalledTimes(1);

    expect(
      await getMetricValue('backend_dependency_up', { dependency: 'postgres' }),
    ).toBe(1);
    expect(
      await getMetricValue('backend_dependency_up', { dependency: 'redis' }),
    ).toBe(1);
    expect(
      await getMetricValue('backend_dependency_up', {
        dependency: 'elasticsearch',
      }),
    ).toBe(1);

    const output = await metricsService.getMetrics();
    expect(output).not.toContain('dependency="ai');
    expect(output).not.toContain('dependency="fastapi');
  });

  it('marks individual dependencies down when disabled, uninitialized, false, or throwing', async () => {
    const dataSource = {
      isInitialized: false,
      query: jest.fn(),
    };
    const redisService = {
      getValue: jest.fn(),
    };
    const elasticsearchService = {
      getClient: jest.fn(() => ({
        ping: jest.fn().mockResolvedValue(false),
      })),
    };

    const service = new BullMetricsService(
      metricsService,
      new ConfigService({ NODE_ENV: 'test', REDIS_ENABLED: 'false' }),
      dataSource as any,
      redisService as any,
      elasticsearchService as any,
    );

    await service.collectDependencyMetrics();

    expect(dataSource.query).not.toHaveBeenCalled();
    expect(redisService.getValue).not.toHaveBeenCalled();
    expect(
      await getMetricValue('backend_dependency_up', { dependency: 'postgres' }),
    ).toBe(0);
    expect(
      await getMetricValue('backend_dependency_up', { dependency: 'redis' }),
    ).toBe(0);
    expect(
      await getMetricValue('backend_dependency_up', {
        dependency: 'elasticsearch',
      }),
    ).toBe(0);

    dataSource.isInitialized = true;
    dataSource.query.mockRejectedValue(new Error('Connection terminated'));
    const throwingEs = {
      getClient: jest.fn(() => ({
        ping: jest.fn().mockRejectedValue(new Error('ES down')),
      })),
    };
    const throwingRedis = {
      getValue: jest.fn().mockRejectedValue(new Error('Redis timeout')),
    };

    const failingService = new BullMetricsService(
      metricsService,
      new ConfigService({ NODE_ENV: 'test', REDIS_ENABLED: 'true' }),
      dataSource as any,
      throwingRedis as any,
      throwingEs as any,
    );

    await failingService.collectDependencyMetrics();

    expect(
      await getMetricValue('backend_dependency_up', { dependency: 'postgres' }),
    ).toBe(0);
    expect(
      await getMetricValue('backend_dependency_up', { dependency: 'redis' }),
    ).toBe(0);
    expect(
      await getMetricValue('backend_dependency_up', {
        dependency: 'elasticsearch',
      }),
    ).toBe(0);
  });

  it('records scrape errors and dependency downtime when probes exceed the timeout', async () => {
    jest.useFakeTimers();

    const hangingQueue = {
      getJobCounts: jest.fn(() => new Promise(() => undefined)),
    };
    const hangingDb = {
      isInitialized: true,
      query: jest.fn(() => new Promise(() => undefined)),
    };

    const service = new BullMetricsService(
      metricsService,
      new ConfigService({ NODE_ENV: 'test' }),
      hangingDb as any,
      undefined,
      undefined,
      hangingQueue as any,
    );

    const collectionPromise = service.collectAll();
    await jest.advanceTimersByTimeAsync(1_500);
    await collectionPromise;

    expect(
      await getMetricValue('bull_queue_scrape_errors_total', {
        queue: 'cv-processing',
      }),
    ).toBe(1);
    expect(
      await getMetricValue('backend_dependency_up', { dependency: 'postgres' }),
    ).toBe(0);
  });

  it('starts periodic scraping outside test env and clears interval on destroy', async () => {
    jest.useFakeTimers();

    const configService = {
      get: jest.fn((key: string) =>
        key === 'NODE_ENV' ? 'development' : undefined,
      ),
    } as unknown as ConfigService;

    const service = new BullMetricsService(metricsService, configService);
    const collectSpy = jest
      .spyOn(service, 'collectAll')
      .mockResolvedValue(undefined);

    service.onModuleInit();
    expect(collectSpy).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(15_000);
    expect(collectSpy).toHaveBeenCalledTimes(2);

    service.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(30_000);
    expect(collectSpy).toHaveBeenCalledTimes(2);
  });
});
