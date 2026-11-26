import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { MetricsService } from './metrics.service';
import {
  extractRequestPathname,
  METRICS_EXCLUDED_PATHS,
  normalizeRoutePath,
} from './observability.constants';

const NANOSECONDS_PER_SECOND = 1_000_000_000;

/**
 * Records HTTP request counts, latency histograms, and in-flight gauges.
 */
@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(private readonly metricsService: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const pathname = extractRequestPathname(req);
    if (METRICS_EXCLUDED_PATHS.has(pathname)) {
      next();
      return;
    }

    const method = (req.method || 'GET').toUpperCase();
    const startedAt = process.hrtime.bigint();
    let settled = false;

    this.metricsService.incInFlight(method);

    const settleInFlight = () => {
      if (settled) return;
      settled = true;
      this.metricsService.decInFlight(method);
    };

    res.once('finish', () => {
      settleInFlight();
      const durationSeconds =
        Number(process.hrtime.bigint() - startedAt) / NANOSECONDS_PER_SECOND;
      const route = normalizeRoutePath(req);
      this.metricsService.recordHttpRequest(
        method,
        route,
        res.statusCode,
        durationSeconds,
      );
    });

    res.once('close', () => {
      settleInFlight();
    });

    next();
  }
}
