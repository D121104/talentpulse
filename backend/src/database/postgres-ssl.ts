import { readFileSync } from 'fs';

const TLS_ENVIRONMENTS = new Set(['production', 'staging', 'demo']);

/**
 * Build fail-closed PostgreSQL TLS options. A CA file is explicit so the
 * server certificate is verified instead of falling back to trust-any-cert.
 */
export function createPostgresSslOptions(
  config: Record<string, unknown>,
): false | { rejectUnauthorized: true; ca?: string } {
  const nodeEnv = String(config.NODE_ENV ?? 'development')
    .trim()
    .toLowerCase();
  const caFile = String(config.DB_SSL_CA_FILE ?? '').trim();

  if (!caFile && ['staging', 'demo'].includes(nodeEnv)) {
    throw new Error(
      'DB_SSL_CA_FILE is required when NODE_ENV is staging or demo',
    );
  }
  if (!caFile) {
    return TLS_ENVIRONMENTS.has(nodeEnv) ? { rejectUnauthorized: true } : false;
  }

  let ca: string;
  try {
    ca = readFileSync(caFile, 'utf8');
  } catch {
    throw new Error('DB_SSL_CA_FILE could not be read');
  }
  if (!ca.trim()) throw new Error('DB_SSL_CA_FILE is empty');
  return { rejectUnauthorized: true, ca };
}
