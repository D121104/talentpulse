/**
 * Bull queue names monitored for queue depth and scrape error metrics.
 */
export const OBSERVABILITY_BULL_QUEUES = [
  'cv-processing',
  'job-sync-es',
  'mail-queue',
  'online-cv-generation',
  'user-cv-parse',
] as const;

export type ObservabilityBullQueue = typeof OBSERVABILITY_BULL_QUEUES[number];

/**
 * Bull queue job states exposed as Prometheus gauge labels.
 */
export const BULL_JOB_STATES = [
  'waiting',
  'active',
  'completed',
  'failed',
  'delayed',
  'paused',
] as const;

export type BullJobState = typeof BULL_JOB_STATES[number];

/**
 * Paths excluded from automatic pino-http request logging.
 */
export const LOG_IGNORED_PATHS = new Set([
  '/metrics',
  '/api/v1/health',
  '/api/v1/health/ready',
  '/favicon.ico',
]);

/**
 * Paths excluded from HTTP Prometheus metrics middleware.
 */
export const METRICS_EXCLUDED_PATHS = new Set(['/metrics', '/favicon.ico']);

export interface RoutePathRequest {
  baseUrl?: string;
  route?: { path?: unknown };
  originalUrl?: string;
  url?: string;
}

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const NUMERIC_SEGMENT_PATTERN = /\/\d+(?=\/|$)/g;

/**
 * Extracts the request pathname without query string.
 */
export function extractRequestPathname(req: RoutePathRequest): string {
  const rawUrl = req?.originalUrl || req?.url || '/';
  const pathname = rawUrl.split('?')[0];
  return pathname || '/';
}

/**
 * Normalizes an Express/HTTP request path into a low-cardinality route label.
 */
export function normalizeRoutePath(req: RoutePathRequest): string {
  const routePath = req?.route?.path;
  if (typeof routePath === 'string' && routePath.length > 0) {
    return `${req.baseUrl || ''}${routePath}`;
  }

  return extractRequestPathname(req)
    .replace(UUID_PATTERN, ':id')
    .replace(NUMERIC_SEGMENT_PATTERN, '/:id');
}
