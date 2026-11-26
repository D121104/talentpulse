import { EventEmitter } from 'events';
import { Request, Response } from 'express';
import { HttpMetricsMiddleware } from 'src/observability/http-metrics.middleware';
import { MetricsService } from 'src/observability/metrics.service';
import {
  extractRequestPathname,
  normalizeRoutePath,
} from 'src/observability/observability.constants';

type MockResponse = EventEmitter & { statusCode: number };

function createMockResponse(statusCode = 200): MockResponse {
  const emitter = new EventEmitter() as MockResponse;
  emitter.statusCode = statusCode;
  return emitter;
}

describe('observability route normalization', () => {
  it('extracts pathname without query parameters', () => {
    expect(
      extractRequestPathname({
        originalUrl: '/api/v1/jobs?page=1&limit=10',
      }),
    ).toBe('/api/v1/jobs');

    expect(extractRequestPathname({ url: '/metrics?format=prom' })).toBe(
      '/metrics',
    );
    expect(extractRequestPathname({})).toBe('/');
  });

  it('uses matched Express route templates when available', () => {
    expect(
      normalizeRoutePath({
        baseUrl: '/api/v1/jobs',
        route: { path: '/:id' },
        originalUrl: '/api/v1/jobs/550e8400-e29b-41d4-a716-446655440000',
      }),
    ).toBe('/api/v1/jobs/:id');

    expect(
      normalizeRoutePath({
        route: { path: '/api/v1/ping' },
        originalUrl: '/api/v1/ping',
      }),
    ).toBe('/api/v1/ping');
  });

  it('normalizes UUID and numeric path segments to :id on unmatched routes', () => {
    expect(
      normalizeRoutePath({
        originalUrl:
          '/api/v1/jobs/550E8400-E29B-41D4-A716-446655440000/applications/12345?tab=ai',
      }),
    ).toBe('/api/v1/jobs/:id/applications/:id');

    expect(
      normalizeRoutePath({
        originalUrl: '/api/v1/orders/42/items/99',
      }),
    ).toBe('/api/v1/orders/:id/items/:id');

    expect(
      normalizeRoutePath({
        originalUrl:
          '/api/v1/users/123e4567-e89b-12d3-a456-426614174000/cvs/98765432-1111-2222-3333-1234567890ab',
      }),
    ).toBe('/api/v1/users/:id/cvs/:id');

    expect(
      normalizeRoutePath({
        originalUrl: '/api/v1/jobs/123abc/health',
      }),
    ).toBe('/api/v1/jobs/123abc/health');
  });
});

describe('HttpMetricsMiddleware', () => {
  let metricsService: MetricsService;
  let middleware: HttpMetricsMiddleware;

  beforeEach(() => {
    metricsService = new MetricsService();
    middleware = new HttpMetricsMiddleware(metricsService);
  });

  async function getGaugeValue(
    name: string,
    labels: Record<string, string>,
  ): Promise<number | undefined> {
    const metrics = await metricsService.getRegistry().getMetricsAsJSON();
    const metric = metrics.find((entry) => entry.name === name);
    const sample = metric?.values.find((entry) =>
      Object.entries(labels).every(
        ([key, value]) => String(entry.labels?.[key]) === value,
      ),
    );
    return sample?.value;
  }

  it.each(['/metrics', '/metrics?verbose=1', '/favicon.ico'])(
    'skips metrics collection for %s',
    (originalUrl) => {
      const incSpy = jest.spyOn(metricsService, 'incInFlight');
      const decSpy = jest.spyOn(metricsService, 'decInFlight');
      const recordSpy = jest.spyOn(metricsService, 'recordHttpRequest');
      const next = jest.fn();
      const res = createMockResponse(200);

      middleware.use(
        { method: 'GET', originalUrl } as Request,
        res as unknown as Response,
        next,
      );
      res.emit('finish');

      expect(next).toHaveBeenCalledTimes(1);
      expect(incSpy).not.toHaveBeenCalled();
      expect(decSpy).not.toHaveBeenCalled();
      expect(recordSpy).not.toHaveBeenCalled();
    },
  );

  it('tracks in-flight requests and records route, status code, and duration on finish', async () => {
    const recordSpy = jest.spyOn(metricsService, 'recordHttpRequest');
    const next = jest.fn();
    const res = createMockResponse(201);
    const req = {
      method: 'post',
      originalUrl:
        '/api/v1/applications/550e8400-e29b-41d4-a716-446655440000?source=web',
    } as Request;

    middleware.use(req, res as unknown as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(
      await getGaugeValue('http_requests_in_flight', { method: 'POST' }),
    ).toBe(1);

    res.emit('finish');
    res.emit('close');

    expect(
      await getGaugeValue('http_requests_in_flight', { method: 'POST' }),
    ).toBe(0);
    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(recordSpy).toHaveBeenCalledWith(
      'POST',
      '/api/v1/applications/:id',
      201,
      expect.any(Number),
    );
    const recordedDuration = recordSpy.mock.calls[0][3];
    expect(Number.isFinite(recordedDuration)).toBe(true);
    expect(recordedDuration).toBeGreaterThanOrEqual(0);

    expect(
      await getGaugeValue('http_requests_total', {
        method: 'POST',
        route: '/api/v1/applications/:id',
        status_code: '201',
      }),
    ).toBe(1);
  });

  it('returns in-flight gauge to 0 on premature close without recording a completed request', async () => {
    const recordSpy = jest.spyOn(metricsService, 'recordHttpRequest');
    const next = jest.fn();
    const res = createMockResponse(499);
    const req = {
      originalUrl: '/api/v1/jobs/42',
    } as Request;

    middleware.use(req, res as unknown as Response, next);

    expect(
      await getGaugeValue('http_requests_in_flight', { method: 'GET' }),
    ).toBe(1);

    res.emit('close');
    res.emit('close');

    expect(
      await getGaugeValue('http_requests_in_flight', { method: 'GET' }),
    ).toBe(0);
    expect(recordSpy).not.toHaveBeenCalled();
  });
});
