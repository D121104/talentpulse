export interface ServiceJwtConfig {
  issuer: string;
  audience: string;
  algorithm: 'RS256' | 'ES256';
  ttlSeconds: number;
  keyId?: string;
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

const INDEX_ENVIRONMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,31}$/;

function parseIndexEnvironment(value: unknown, variableName: string): string {
  const environment = String(value ?? '').trim();
  if (!INDEX_ENVIRONMENT_PATTERN.test(environment)) {
    throw new Error(`${variableName} must contain 1 to 32 safe characters`);
  }
  return environment;
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
  const synchronize = parseBoolean(
    config.DB_SYNCHRONIZE,
    nodeEnv !== 'staging' && nodeEnv !== 'production',
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
  const runIndexingWorker = parseBoolean(
    config.RUN_INDEXING_WORKER,
    false,
    'RUN_INDEXING_WORKER',
  );
  // The outbox table is intentionally unscoped. A non-local worker must name
  // both its logical index environment and the environment of its dedicated
  // outbox database; otherwise it could claim another deployment's commands.
  const indexingEnvironment = parseIndexEnvironment(
    config.AI_INDEX_ENVIRONMENT ??
      (nodeEnv === 'development' ? 'local' : nodeEnv),
    'AI_INDEX_ENVIRONMENT',
  );
  const rawOutboxEnvironment = config.AI_INDEX_OUTBOX_ENVIRONMENT;
  const hasOutboxEnvironment = !(
    rawOutboxEnvironment === undefined ||
    rawOutboxEnvironment === null ||
    String(rawOutboxEnvironment).trim() === ''
  );
  const outboxEnvironment = hasOutboxEnvironment
    ? parseIndexEnvironment(rawOutboxEnvironment, 'AI_INDEX_OUTBOX_ENVIRONMENT')
    : undefined;

  if (outboxEnvironment && outboxEnvironment !== indexingEnvironment) {
    throw new Error(
      'AI_INDEX_OUTBOX_ENVIRONMENT must match AI_INDEX_ENVIRONMENT for the unscoped outbox',
    );
  }
  if (
    runIndexingWorker &&
    !outboxEnvironment &&
    indexingEnvironment !== 'local'
  ) {
    throw new Error(
      'AI_INDEX_OUTBOX_ENVIRONMENT must be explicitly set for a non-local indexing worker',
    );
  }

  const port = parsePort(config.DB_PORT);
  const consentVersion = String(
    config.AI_CV_CONSENT_VERSION ?? 'phase0-v1',
  ).trim();
  const consentPolicyHash = String(config.AI_CV_CONSENT_POLICY_HASH ?? '')
    .trim()
    .toLowerCase();

  if ((nodeEnv === 'staging' || nodeEnv === 'production') && synchronize) {
    throw new Error('DB_SYNCHRONIZE must be false outside development');
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
    'AI_SERVICE_ISSUER',
    'AI_SERVICE_AUDIENCE',
    'AI_SERVICE_JWT_ALGORITHM',
    'AI_SERVICE_JWT_TTL_SECONDS',
    'AI_SERVICE_JWT_KID',
    'AI_SERVICE_JWT_PRIVATE_KEY',
    'AI_SERVICE_JWT_PRIVATE_KEY_FILE',
  ];
  const hasServiceAuthConfig = serviceAuthKeys.some(
    (key) => config[key] != null,
  );

  if (hasServiceAuthConfig) {
    const issuer = String(config.AI_SERVICE_ISSUER ?? '').trim();
    const audience = String(config.AI_SERVICE_AUDIENCE ?? '').trim();
    const algorithm = String(config.AI_SERVICE_JWT_ALGORITHM ?? '');
    const ttlSeconds = Number(config.AI_SERVICE_JWT_TTL_SECONDS);

    const keyId = String(config.AI_SERVICE_JWT_KID ?? '').trim();
    const privateKey = String(config.AI_SERVICE_JWT_PRIVATE_KEY ?? '').trim();
    const privateKeyFile = String(
      config.AI_SERVICE_JWT_PRIVATE_KEY_FILE ?? '',
    ).trim();

    if (
      !issuer ||
      !audience ||
      !keyId ||
      !['RS256', 'ES256'].includes(algorithm) ||
      (privateKey && privateKeyFile) ||
      (!privateKey && !privateKeyFile)
    ) {
      throw new Error(
        'AI service JWT requires issuer, audience, kid, and exactly one private key source',
      );
    }
    if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > 300) {
      throw new Error(
        'AI_SERVICE_JWT_TTL_SECONDS must be an integer between 1 and 300',
      );
    }
  }

  return {
    ...config,
    NODE_ENV: nodeEnv,
    DB_PORT: port,
    DB_SYNCHRONIZE: String(synchronize),
    REDIS_ENABLED: String(redisEnabled),
    RUN_BACKGROUND_JOBS: String(runBackgroundJobs),
    RUN_INDEXING_WORKER: String(runIndexingWorker),
    AI_INDEX_ENVIRONMENT: indexingEnvironment,
    ...(outboxEnvironment
      ? { AI_INDEX_OUTBOX_ENVIRONMENT: outboxEnvironment }
      : indexingEnvironment === 'local'
      ? { AI_INDEX_OUTBOX_ENVIRONMENT: 'local' }
      : {}),
    AI_CV_CONSENT_VERSION: consentVersion,
    ...(consentPolicyHash
      ? { AI_CV_CONSENT_POLICY_HASH: consentPolicyHash }
      : {}),
  };
}
