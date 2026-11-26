export type RuntimeEnvironment = Record<string, unknown>;

export function parseRuntimeBoolean(
  value: unknown,
  fallback: boolean,
): boolean {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error('Runtime flag must be true or false');
}

export function isRedisEnabled(
  env: RuntimeEnvironment = process.env as RuntimeEnvironment,
): boolean {
  return parseRuntimeBoolean(env.REDIS_ENABLED, true);
}

export function areBackgroundJobsEnabled(
  env: RuntimeEnvironment = process.env as RuntimeEnvironment,
): boolean {
  return parseRuntimeBoolean(env.RUN_BACKGROUND_JOBS, true);
}

export function areQueueWorkersEnabled(
  env: RuntimeEnvironment = process.env as RuntimeEnvironment,
): boolean {
  return isRedisEnabled(env) && areBackgroundJobsEnabled(env);
}
