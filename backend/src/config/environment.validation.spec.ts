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
