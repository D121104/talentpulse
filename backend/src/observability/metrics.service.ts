import { Injectable } from '@nestjs/common';
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from '@prometheus-io/client';
import { BULL_JOB_STATES, BullJobState } from './observability.constants';

const HTTP_DURATION_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];

const DEPENDENCY_CHECK_DURATION_BUCKETS = [
  0.002, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5,
];

/**
 * Owns the dedicated Prometheus metric registry and exposes helper recorders
 * for HTTP requests, Bull queues, and backend dependency health probes.
 */
@Injectable()
export class MetricsService {
  private readonly registry: Registry;
  private readonly httpRequestsTotal: Counter<
    'method' | 'route' | 'status_code'
  >;
  private readonly httpRequestDurationSeconds: Histogram<
    'method' | 'route' | 'status_code'
  >;
  private readonly httpRequestsInFlight: Gauge<'method'>;
  private readonly bullQueueJobs: Gauge<'queue' | 'state'>;
  private readonly bullQueueScrapeErrorsTotal: Counter<'queue'>;
  private readonly backendDependencyUp: Gauge<'dependency'>;
  private readonly backendDependencyCheckDurationSeconds: Histogram<'dependency'>;

  constructor() {
    this.registry = new Registry();
    this.registry.setDefaultLabels({ service: 'talentpulse-backend' });
    collectDefaultMetrics({ register: this.registry });

    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of completed HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    this.httpRequestDurationSeconds = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: HTTP_DURATION_BUCKETS,
      registers: [this.registry],
    });

    this.httpRequestsInFlight = new Gauge({
      name: 'http_requests_in_flight',
      help: 'Current number of in-flight HTTP requests',
      labelNames: ['method'],
      registers: [this.registry],
    });

    this.bullQueueJobs = new Gauge({
      name: 'bull_queue_jobs',
      help: 'Number of jobs in Bull queues by queue and state',
      labelNames: ['queue', 'state'],
      registers: [this.registry],
    });

    this.bullQueueScrapeErrorsTotal = new Counter({
      name: 'bull_queue_scrape_errors_total',
      help: 'Total number of failed Bull queue metric scrapes',
      labelNames: ['queue'],
      registers: [this.registry],
    });

    this.backendDependencyUp = new Gauge({
      name: 'backend_dependency_up',
      help: 'Availability of backend infrastructure dependencies (1 = up, 0 = down)',
      labelNames: ['dependency'],
      registers: [this.registry],
    });

    this.backendDependencyCheckDurationSeconds = new Histogram({
      name: 'backend_dependency_check_duration_seconds',
      help: 'Duration of backend dependency health checks in seconds',
      labelNames: ['dependency'],
      buckets: DEPENDENCY_CHECK_DURATION_BUCKETS,
      registers: [this.registry],
    });
  }

  /**
   * Records a completed HTTP request count and observed latency.
   */
  recordHttpRequest(
    method: string,
    route: string,
    statusCode: number | string,
    durationSeconds: number,
  ): void {
    const labels = {
      method: method.toUpperCase(),
      route,
      status_code: String(statusCode),
    };
    this.httpRequestsTotal.inc(labels);
    this.httpRequestDurationSeconds.observe(
      labels,
      Math.max(0, durationSeconds),
    );
  }

  /**
   * Increments the active HTTP requests gauge for a method.
   */
  incInFlight(method: string): void {
    this.httpRequestsInFlight.inc({ method: method.toUpperCase() });
  }

  /**
   * Decrements the active HTTP requests gauge for a method.
   */
  decInFlight(method: string): void {
    this.httpRequestsInFlight.dec({ method: method.toUpperCase() });
  }

  /**
   * Sets Bull queue job counts across all tracked states.
   */
  setBullQueueCounts(
    queue: string,
    counts: Partial<Record<BullJobState, number>>,
  ): void {
    for (const state of BULL_JOB_STATES) {
      this.bullQueueJobs.set({ queue, state }, Number(counts[state] ?? 0));
    }
  }

  /**
   * Increments the scrape error counter for a Bull queue.
   */
  incBullScrapeError(queue: string): void {
    this.bullQueueScrapeErrorsTotal.inc({ queue });
  }

  /**
   * Records availability and probe latency for an infrastructure dependency.
   */
  setDependencyStatus(
    dependency: string,
    up: boolean | number,
    durationSeconds?: number,
  ): void {
    this.backendDependencyUp.set({ dependency }, up ? 1 : 0);
    if (
      typeof durationSeconds === 'number' &&
      Number.isFinite(durationSeconds)
    ) {
      this.backendDependencyCheckDurationSeconds.observe(
        { dependency },
        Math.max(0, durationSeconds),
      );
    }
  }

  /**
   * Serializes all registered metrics in Prometheus exposition text format.
   */
  getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /**
   * Returns the Prometheus registry HTTP Content-Type header value.
   */
  getContentType(): string {
    return this.registry.contentType;
  }

  /**
   * Returns the underlying Prometheus registry instance.
   */
  getRegistry(): Registry {
    return this.registry;
  }
}
