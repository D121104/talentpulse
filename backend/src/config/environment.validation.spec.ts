import { validateEnvironment } from './environment.validation';

describe('validateEnvironment', () => {
  it('defaults development synchronization on and worker flags on', () => {
    expect(validateEnvironment({})).toMatchObject({
      NODE_ENV: 'development',
      DB_PORT: 5432,
      DB_SYNCHRONIZE: 'true',
      REDIS_ENABLED: 'true',
      RUN_BACKGROUND_JOBS: 'true',
    });
  });

  it('defaults the AI service subject and preserves a configured subject', () => {
    expect(validateEnvironment({}).AI_SERVICE_JWT_SUBJECT).toBe(
      'talentpulse-backend',
    );
    expect(
      validateEnvironment({
        NODE_ENV: 'demo',
        JWT_SECRET: 'access-secret',
        JWT_REFRESH_SECRET: 'refresh-secret',
        DB_SSL_CA_FILE: '/run/secrets/db-ca',
        AI_SERVICE_JWT_SUBJECT: 'configured-ai-client',
      }).AI_SERVICE_JWT_SUBJECT,
    ).toBe('configured-ai-client');
  });

  it('requires a nonblank bounded subject when AI service auth is configured', () => {
    const base = {
      NODE_ENV: 'demo',
      JWT_SECRET: 'access-secret',
      JWT_REFRESH_SECRET: 'refresh-secret',
      DB_SSL_CA_FILE: '/run/secrets/db-ca',
      AI_SERVICE_URL: 'https://ai.internal',
      AI_SERVICE_ISSUER: 'backend',
      AI_SERVICE_AUDIENCE: 'ai',
      AI_SERVICE_JWT_ALGORITHM: 'RS256',
      AI_SERVICE_JWT_TTL_SECONDS: '60',
      AI_SERVICE_JWT_PRIVATE_KEY: 'private-key',
    };

    expect(validateEnvironment(base).AI_SERVICE_JWT_SUBJECT).toBe(
      'talentpulse-backend',
    );
    expect(() =>
      validateEnvironment({ ...base, AI_SERVICE_JWT_SUBJECT: '   ' }),
    ).toThrow('AI_SERVICE_JWT_SUBJECT');
    expect(() =>
      validateEnvironment({
        ...base,
        AI_SERVICE_JWT_SUBJECT: 'a'.repeat(129),
      }),
    ).toThrow('AI_SERVICE_JWT_SUBJECT');
  });

  it('defaults and validates the dedicated job indexing scope', () => {
    expect(validateEnvironment({}).AI_JOB_INDEX_SCOPE).toBe('jobs:index');
    expect(
      validateEnvironment({
        NODE_ENV: 'development',
        AI_JOB_INDEX_SCOPE: 'internal:jobs-index',
      }).AI_JOB_INDEX_SCOPE,
    ).toBe('internal:jobs-index');
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'development',
        AI_JOB_INDEX_SCOPE: 'jobs index',
      }),
    ).toThrow('AI_JOB_INDEX_SCOPE');
  });

  it('defaults and validates the dedicated job indexing representation version', () => {
    expect(validateEnvironment({}).AI_JOB_INDEX_REPRESENTATION_VERSION).toBe(
      'demo-v1',
    );
    expect(
      validateEnvironment({
        AI_JOB_INDEX_REPRESENTATION_VERSION: 'local-ollama-v1',
      }).AI_JOB_INDEX_REPRESENTATION_VERSION,
    ).toBe('local-ollama-v1');
    expect(() =>
      validateEnvironment({ AI_JOB_INDEX_REPRESENTATION_VERSION: 'local v1' }),
    ).toThrow('AI_JOB_INDEX_REPRESENTATION_VERSION');
    expect(() =>
      validateEnvironment({
        AI_JOB_INDEX_REPRESENTATION_VERSION: 'a'.repeat(129),
      }),
    ).toThrow('AI_JOB_INDEX_REPRESENTATION_VERSION');
  });

  it('allows the extended AI timeout only for local runtimes', () => {
    expect(
      validateEnvironment({
        NODE_ENV: 'development',
        AI_SERVICE_TIMEOUT_MS: '180000',
      }).AI_SERVICE_TIMEOUT_MS,
    ).toBe(180000);
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'demo',
        JWT_SECRET: 'access-secret',
        JWT_REFRESH_SECRET: 'refresh-secret',
        DB_SSL_CA_FILE: '/run/secrets/db-ca',
        AI_SERVICE_TIMEOUT_MS: '180000',
      }),
    ).toThrow('between 100 and 30000');
  });

  it('keeps production synchronization disabled by default', () => {
    expect(
      validateEnvironment({
        NODE_ENV: 'production',
        JWT_SECRET: 'access-secret',
        JWT_REFRESH_SECRET: 'refresh-secret',
      }),
    ).toMatchObject({
      NODE_ENV: 'production',
      DB_SYNCHRONIZE: 'false',
    });
  });

  it.each(['staging', 'demo', 'production'])(
    'requires both JWT secrets in %s',
    (nodeEnv) => {
      expect(() =>
        validateEnvironment({
          NODE_ENV: nodeEnv,
          JWT_REFRESH_SECRET: 'refresh-secret',
        }),
      ).toThrow(
        'JWT_SECRET is required when NODE_ENV is staging, demo, or production',
      );

      expect(() =>
        validateEnvironment({
          NODE_ENV: nodeEnv,
          JWT_SECRET: 'access-secret',
        }),
      ).toThrow(
        'JWT_REFRESH_SECRET is required when NODE_ENV is staging, demo, or production',
      );
    },
  );

  it('rejects blank JWT secrets without exposing their values', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'demo',
        JWT_SECRET: '   ',
        JWT_REFRESH_SECRET: 'refresh-secret',
      }),
    ).toThrow(
      'JWT_SECRET is required when NODE_ENV is staging, demo, or production',
    );

    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        JWT_SECRET: 'access-secret',
        JWT_REFRESH_SECRET: '\t',
      }),
    ).toThrow(
      'JWT_REFRESH_SECRET is required when NODE_ENV is staging, demo, or production',
    );
  });

  it('keeps local and development secret omission behavior', () => {
    expect(validateEnvironment({ NODE_ENV: 'local' })).not.toHaveProperty(
      'JWT_SECRET',
    );
    expect(validateEnvironment({ NODE_ENV: 'development' })).not.toHaveProperty(
      'JWT_REFRESH_SECRET',
    );
  });

  it('rejects production synchronization when explicitly enabled', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        DB_SYNCHRONIZE: 'true',
        JWT_SECRET: 'access-secret',
        JWT_REFRESH_SECRET: 'refresh-secret',
      }),
    ).toThrow('DB_SYNCHRONIZE must be false in production');
  });
});
