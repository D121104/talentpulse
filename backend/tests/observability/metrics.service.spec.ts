import { MetricValueWithName, Registry } from '@prometheus-io/client';
import { MetricsService } from 'src/observability/metrics.service';
import { BULL_JOB_STATES } from 'src/observability/observability.constants';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(() => {
    service = new MetricsService();
  });

  async function getMetricValue(
    metricName: string,
    expectedLabels: Record<string, string>,
  ): Promise<number | undefined> {
    const metrics = await service.getRegistry().getMetricsAsJSON();
    const metric = metrics.find((entry) => entry.name === metricName);
    if (!metric || !Array.isArray(metric.values)) {
      return undefined;
    }

    const match = metric.values.find((sample) =>
      Object.entries(expectedLabels).every(
        ([key, value]) => String(sample.labels?.[key]) === value,
      ),
    );
    return match?.value;
  }

  it('registers default Node.js metrics on an isolated registry with service label', async () => {
    expect(service.getRegistry()).toBeInstanceOf(Registry);

    const output = await service.getMetrics();
    expect(output).toContain('service="talentpulse-backend"');
    expect(output).toContain('process_resident_memory_bytes');
    expect(output).toContain('nodejs_version_info');
  });

  it('records HTTP request counters and latency histogram observations', async () => {
    service.recordHttpRequest('post', '/api/v1/jobs', 201, 0.125);
    service.recordHttpRequest('POST', '/api/v1/jobs', 201, -0.5);

    expect(
      await getMetricValue('http_requests_total', {
        service: 'talentpulse-backend',
        method: 'POST',
        route: '/api/v1/jobs',
        status_code: '201',
      }),
    ).toBe(2);

    expect(
      await getMetricValue('http_request_duration_seconds', {
        service: 'talentpulse-backend',
        method: 'POST',
        route: '/api/v1/jobs',
        status_code: '201',
        le: '0.25',
      }),
    ).toBe(2);

    const metrics = await service.getRegistry().getMetricsAsJSON();
    const durationMetric = metrics.find(
      (entry) => entry.name === 'http_request_duration_seconds',
    );
    const values = (durationMetric?.values ??
      []) as MetricValueWithName<string>[];
    const sumSample = values.find((sample) =>
      sample.metricName?.endsWith('_sum'),
    );
    const countSample = values.find((sample) =>
      sample.metricName?.endsWith('_count'),
    );
    expect(sumSample?.value).toBeCloseTo(0.125, 6);
    expect(countSample?.value).toBe(2);
  });

  it('tracks in-flight HTTP requests gauge by uppercased method', async () => {
    service.incInFlight('get');
    service.incInFlight('GET');

    expect(
      await getMetricValue('http_requests_in_flight', {
        method: 'GET',
      }),
    ).toBe(2);

    service.decInFlight('get');
    expect(
      await getMetricValue('http_requests_in_flight', {
        method: 'GET',
      }),
    ).toBe(1);

    service.decInFlight('GET');
    expect(
      await getMetricValue('http_requests_in_flight', {
        method: 'GET',
      }),
    ).toBe(0);
  });

  it('updates Bull queue job gauges for all states and increments scrape errors', async () => {
    service.setBullQueueCounts('cv-processing', {
      waiting: 4,
      active: 2,
      failed: 1,
    });

    const expectedCounts: Record<string, number> = {
      waiting: 4,
      active: 2,
      completed: 0,
      failed: 1,
      delayed: 0,
      paused: 0,
    };

    for (const state of BULL_JOB_STATES) {
      expect(
        await getMetricValue('bull_queue_jobs', {
          queue: 'cv-processing',
          state,
        }),
      ).toBe(expectedCounts[state]);
    }

    service.incBullScrapeError('cv-processing');
    service.incBullScrapeError('cv-processing');

    expect(
      await getMetricValue('bull_queue_scrape_errors_total', {
        queue: 'cv-processing',
      }),
    ).toBe(2);
  });

  it('records dependency availability gauge and probe latency histogram', async () => {
    service.setDependencyStatus('postgres', true, 0.012);
    service.setDependencyStatus('redis', false, -1);
    service.setDependencyStatus('elasticsearch', 1);
    service.setDependencyStatus('postgres', true, Number.NaN);

    expect(
      await getMetricValue('backend_dependency_up', { dependency: 'postgres' }),
    ).toBe(1);
    expect(
      await getMetricValue('backend_dependency_up', { dependency: 'redis' }),
    ).toBe(0);
    expect(
      await getMetricValue('backend_dependency_up', {
        dependency: 'elasticsearch',
      }),
    ).toBe(1);

    const metrics = await service.getRegistry().getMetricsAsJSON();
    const checkDuration = metrics.find(
      (entry) => entry.name === 'backend_dependency_check_duration_seconds',
    );
    const checkValues = (checkDuration?.values ??
      []) as MetricValueWithName<string>[];
    const postgresCount = checkValues.find(
      (sample) =>
        sample.metricName?.endsWith('_count') &&
        sample.labels?.dependency === 'postgres',
    );
    const redisSum = checkValues.find(
      (sample) =>
        sample.metricName?.endsWith('_sum') &&
        sample.labels?.dependency === 'redis',
    );
    const elasticsearchCount = checkValues.find(
      (sample) =>
        sample.metricName?.endsWith('_count') &&
        sample.labels?.dependency === 'elasticsearch',
    );

    expect(postgresCount?.value).toBe(1);
    expect(redisSum?.value).toBe(0);
    expect(elasticsearchCount).toBeUndefined();
  });

  it('exports Prometheus exposition text format and content type', async () => {
    service.recordHttpRequest('GET', '/api/v1/jobs', 200, 0.03);
    service.setBullQueueCounts('mail-queue', { waiting: 3 });
    service.setDependencyStatus('postgres', true, 0.004);

    const contentType = service.getContentType();
    const body = await service.getMetrics();

    expect(contentType).toContain('text/plain');
    expect(body).toContain('# HELP http_requests_total');
    expect(body).toContain('# TYPE http_requests_total counter');
    expect(body).toContain(
      'http_requests_total{method="GET",route="/api/v1/jobs",status_code="200",service="talentpulse-backend"} 1',
    );
    expect(body).toContain(
      'bull_queue_jobs{queue="mail-queue",state="waiting",service="talentpulse-backend"} 3',
    );
    expect(body).toContain(
      'backend_dependency_up{dependency="postgres",service="talentpulse-backend"} 1',
    );
  });
});
