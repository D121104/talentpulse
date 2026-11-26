import { validateEnvironment } from 'src/config/environment.validation';

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
        AI_JOB_INDEX_REPRESENTATION_VERSION:
          'local-ollama-qwen3-embedding-4b-2560-v2',
      }).AI_JOB_INDEX_REPRESENTATION_VERSION,
    ).toBe('local-ollama-qwen3-embedding-4b-2560-v2');
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

  it('defaults and validates observability logging variables', () => {
    const defaults = validateEnvironment({});
    expect(defaults).toMatchObject({
      LOG_LEVEL: 'info',
      LOG_FILE_ENABLED: 'true',
    });
    expect(defaults).not.toHaveProperty('LOG_DIR');
    expect(defaults).not.toHaveProperty('METRICS_BEARER_TOKEN');

    expect(
      validateEnvironment({
        LOG_LEVEL: ' WARN ',
        LOG_DIR: ' /var/log/talentpulse ',
        LOG_FILE_ENABLED: 'FALSE',
      }),
    ).toMatchObject({
      LOG_LEVEL: 'warn',
      LOG_DIR: '/var/log/talentpulse',
      LOG_FILE_ENABLED: 'false',
    });

    expect(() => validateEnvironment({ LOG_LEVEL: 'verbose' })).toThrow(
      'LOG_LEVEL must be one of:',
    );
    expect(() => validateEnvironment({ LOG_FILE_ENABLED: 'yes' })).toThrow(
      'LOG_FILE_ENABLED must be true or false',
    );
    expect(() => validateEnvironment({ LOG_DIR: 'a'.repeat(513) })).toThrow(
      'LOG_DIR must be a bounded directory path',
    );
    expect(() => validateEnvironment({ LOG_DIR: '/var/log\napp' })).toThrow(
      'LOG_DIR must be a bounded directory path',
    );
  });

  it('trims and validates METRICS_BEARER_TOKEN when provided', () => {
    expect(
      validateEnvironment({ METRICS_BEARER_TOKEN: '  scrape-secret-123  ' })
        .METRICS_BEARER_TOKEN,
    ).toBe('scrape-secret-123');

    expect(validateEnvironment({})).not.toHaveProperty('METRICS_BEARER_TOKEN');
    expect(() =>
      validateEnvironment({ METRICS_BEARER_TOKEN: '   ' }),
    ).not.toThrow();

    expect(() =>
      validateEnvironment({ METRICS_BEARER_TOKEN: 'invalid token' }),
    ).toThrow(
      'METRICS_BEARER_TOKEN must be a bounded token without whitespace',
    );

    expect(() =>
      validateEnvironment({ METRICS_BEARER_TOKEN: 't'.repeat(513) }),
    ).toThrow(
      'METRICS_BEARER_TOKEN must be a bounded token without whitespace',
    );
  });
});
