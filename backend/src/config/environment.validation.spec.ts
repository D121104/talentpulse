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

  it('keeps production synchronization disabled by default', () => {
    expect(validateEnvironment({ NODE_ENV: 'production' })).toMatchObject({
      NODE_ENV: 'production',
      DB_SYNCHRONIZE: 'false',
    });
  });

  it('rejects production synchronization when explicitly enabled', () => {
    expect(() =>
      validateEnvironment({ NODE_ENV: 'production', DB_SYNCHRONIZE: 'true' }),
    ).toThrow('DB_SYNCHRONIZE must be false in production');
  });
});
