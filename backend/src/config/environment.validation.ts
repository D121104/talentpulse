export interface ServiceJwtConfig {
  issuer: string;
  audience: string;
  algorithm: 'RS256' | 'ES256';
  ttlSeconds: number;
  keyId?: string;
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error('DB_SYNCHRONIZE must be true or false');
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
  const nodeEnv = String(config.NODE_ENV ?? 'development').trim().toLowerCase();
  const synchronize = parseBoolean(config.DB_SYNCHRONIZE, nodeEnv !== 'production');
  const port = parsePort(config.DB_PORT);

  if (nodeEnv === 'production' && synchronize) {
    throw new Error('DB_SYNCHRONIZE must be false in production');
  }

  const serviceAuthKeys = [
    'AI_SERVICE_ISSUER',
    'AI_SERVICE_AUDIENCE',
    'AI_SERVICE_JWT_ALGORITHM',
    'AI_SERVICE_JWT_TTL_SECONDS',
  ];
  const hasServiceAuthConfig = serviceAuthKeys.some((key) => config[key] != null);

  if (hasServiceAuthConfig) {
    const issuer = String(config.AI_SERVICE_ISSUER ?? '').trim();
    const audience = String(config.AI_SERVICE_AUDIENCE ?? '').trim();
    const algorithm = String(config.AI_SERVICE_JWT_ALGORITHM ?? '');
    const ttlSeconds = Number(config.AI_SERVICE_JWT_TTL_SECONDS);

    if (!issuer || !audience || !['RS256', 'ES256'].includes(algorithm)) {
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

  return {
    ...config,
    NODE_ENV: nodeEnv,
    DB_PORT: port,
    DB_SYNCHRONIZE: String(synchronize),
  };
}

