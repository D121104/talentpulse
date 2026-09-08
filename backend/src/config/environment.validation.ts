export interface ServiceJwtConfig {
  issuer: string;
  audience: string;
  algorithm: 'RS256' | 'ES256';
  ttlSeconds: number;
  keyId?: string;
  subject: string;
}

function parseBoolean(
  value: unknown,
  fallback: boolean,
  variableName: string,
): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error(`${variableName} must be true or false`);
}

function parsePort(value: unknown): number {
  if (value === undefined || value === null || value === '') return 5432;

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('DB_PORT must be an integer between 1 and 65535');
  }
  return port;
}

/**
 * Validates deployment configuration without loading or generating key material.
 * Phase 1 owns private-key storage, rotation and token signing.
 */
export function validateEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const nodeEnv = String(config.NODE_ENV ?? 'development')
    .trim()
    .toLowerCase();

  if (['staging', 'demo', 'production'].includes(nodeEnv)) {
    for (const secretName of ['JWT_SECRET', 'JWT_REFRESH_SECRET']) {
      if (!String(config[secretName] ?? '').trim()) {
        throw new Error(
          `${secretName} is required when NODE_ENV is staging, demo, or production`,
        );
      }
    }
  }

  const synchronize = parseBoolean(
    config.DB_SYNCHRONIZE,
    nodeEnv !== 'production',
    'DB_SYNCHRONIZE',
  );
  const redisEnabled = parseBoolean(
    config.REDIS_ENABLED,
    true,
    'REDIS_ENABLED',
  );
  const runBackgroundJobs = parseBoolean(
    config.RUN_BACKGROUND_JOBS,
    true,
    'RUN_BACKGROUND_JOBS',
  );
  const port = parsePort(config.DB_PORT);
  const consentVersion = String(
    config.AI_CV_CONSENT_VERSION ?? 'phase0-v1',
  ).trim();
  const consentPolicyHash = String(config.AI_CV_CONSENT_POLICY_HASH ?? '')
    .trim()
    .toLowerCase();

  if (nodeEnv === 'production' && synchronize) {
    throw new Error('DB_SYNCHRONIZE must be false in production');
  }

  if (
    ['staging', 'demo'].includes(nodeEnv) &&
    !String(config.DB_SSL_CA_FILE ?? '').trim()
  ) {
    throw new Error(
      'DB_SSL_CA_FILE is required when NODE_ENV is staging or demo',
    );
  }

  if (!/^\w[\w.-]{0,79}$/.test(consentVersion)) {
    throw new Error(
      'AI_CV_CONSENT_VERSION must be a simple version with at most 80 characters',
    );
  }
  if (consentPolicyHash && !/^[a-f0-9]{64}$/.test(consentPolicyHash)) {
    throw new Error('AI_CV_CONSENT_POLICY_HASH must be a SHA-256 hex digest');
  }

  const serviceAuthKeys = [
    'AI_SERVICE_URL',
    'AI_SERVICE_ISSUER',
    'AI_SERVICE_AUDIENCE',
    'AI_SERVICE_JWT_ALGORITHM',
    'AI_SERVICE_JWT_TTL_SECONDS',
    'AI_SERVICE_JWT_PRIVATE_KEY',
  ];
  const hasServiceAuthConfig = serviceAuthKeys.some(
    (key) => config[key] != null,
  );
  const configuredServiceSubject = String(
    config.AI_SERVICE_JWT_SUBJECT ?? 'talentpulse-backend',
  );
  const serviceSubject = configuredServiceSubject.trim();
  if (
    (hasServiceAuthConfig ||
      ['local', 'development', 'test'].includes(nodeEnv)) &&
    (!serviceSubject ||
      serviceSubject.length > 128 ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(serviceSubject))
  ) {
    throw new Error(
      'AI_SERVICE_JWT_SUBJECT must be a non-empty bounded service subject',
    );
  }

  if (hasServiceAuthConfig) {
    const serviceUrl = String(config.AI_SERVICE_URL ?? '').trim();
    const issuer = String(config.AI_SERVICE_ISSUER ?? '').trim();
    const audience = String(config.AI_SERVICE_AUDIENCE ?? '').trim();
    const algorithm = String(config.AI_SERVICE_JWT_ALGORITHM ?? '');
    const ttlSeconds = Number(config.AI_SERVICE_JWT_TTL_SECONDS);

    if (serviceUrl && !/^https:\/\/[^\s]+$/.test(serviceUrl)) {
      throw new Error('AI_SERVICE_URL must use HTTPS');
    }
    if (
      !issuer ||
      !audience ||
      !['RS256', 'ES256'].includes(algorithm) ||
      !String(config.AI_SERVICE_JWT_PRIVATE_KEY ?? '').trim()
    ) {
      throw new Error(
        'AI service JWT requires issuer, audience and RS256/ES256 algorithm',
      );
    }
    if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > 300) {
      throw new Error(
        'AI_SERVICE_JWT_TTL_SECONDS must be an integer between 1 and 300',
      );
    }
  }

  const jobIndexScope = String(
    config.AI_JOB_INDEX_SCOPE ?? 'jobs:index',
  ).trim();
  if (
    !jobIndexScope ||
    jobIndexScope.length > 128 ||
    /\s/.test(jobIndexScope)
  ) {
    throw new Error(
      'AI_JOB_INDEX_SCOPE must be a non-empty scope without whitespace',
    );
  }

  const timeoutMs =
    config.AI_SERVICE_TIMEOUT_MS == null
      ? 10000
      : Number(config.AI_SERVICE_TIMEOUT_MS);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) {
    throw new Error(
      'AI_SERVICE_TIMEOUT_MS must be an integer between 100 and 30000',
    );
  }

  return {
    ...config,
    NODE_ENV: nodeEnv,
    DB_PORT: port,
    DB_SYNCHRONIZE: String(synchronize),
    REDIS_ENABLED: String(redisEnabled),
    RUN_BACKGROUND_JOBS: String(runBackgroundJobs),
    AI_CV_CONSENT_VERSION: consentVersion,
    AI_SERVICE_JWT_SUBJECT: serviceSubject,
    AI_SERVICE_TIMEOUT_MS: timeoutMs,
    AI_JOB_INDEX_SCOPE: jobIndexScope,
    ...(consentPolicyHash
      ? { AI_CV_CONSENT_POLICY_HASH: consentPolicyHash }
      : {}),
  };
}
