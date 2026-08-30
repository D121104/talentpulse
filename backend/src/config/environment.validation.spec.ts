import { ConfigService } from '@nestjs/config';
import { assertAiIndexOperationalEnvironment } from './ai-index-environment';
import { validateEnvironment } from './environment.validation';

describe('validateEnvironment', () => {
  it('defaults development synchronization on and worker flags on', () => {
    expect(validateEnvironment({})).toMatchObject({
      NODE_ENV: 'development',
      DB_PORT: 5432,
      DB_SYNCHRONIZE: 'true',
      REDIS_ENABLED: 'true',
      RUN_BACKGROUND_JOBS: 'true',
      RUN_INDEXING_WORKER: 'false',
      AI_INDEX_ENVIRONMENT: 'local',
      AI_INDEX_OUTBOX_ENVIRONMENT: 'local',
    });
  });

  it.each(['staging', 'production'])(
    'defaults %s synchronization off',
    (nodeEnv) => {
      expect(validateEnvironment({ NODE_ENV: nodeEnv })).toMatchObject({
        NODE_ENV: nodeEnv,
        DB_SYNCHRONIZE: 'false',
      });
    },
  );

  it.each(['staging', 'production'])(
    'rejects explicit synchronization in %s',
    (nodeEnv) => {
      expect(() =>
        validateEnvironment({ NODE_ENV: nodeEnv, DB_SYNCHRONIZE: 'true' }),
      ).toThrow('DB_SYNCHRONIZE must be false outside development');
    },
  );

  it('requires a matching explicit outbox environment for a non-local worker', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        RUN_INDEXING_WORKER: 'true',
      }),
    ).toThrow('AI_INDEX_OUTBOX_ENVIRONMENT must be explicitly set');

    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        RUN_INDEXING_WORKER: 'true',
        AI_INDEX_ENVIRONMENT: 'production',
        AI_INDEX_OUTBOX_ENVIRONMENT: 'staging',
      }),
    ).toThrow('AI_INDEX_OUTBOX_ENVIRONMENT must match');
  });

  it('rejects a non-local operational outbox that is absent or mismatched', () => {
    expect(() =>
      assertAiIndexOperationalEnvironment(
        new ConfigService({ AI_INDEX_ENVIRONMENT: 'staging' }),
      ),
    ).toThrow('AI_INDEX_OUTBOX_ENVIRONMENT must be explicitly set');
    expect(() =>
      assertAiIndexOperationalEnvironment(
        new ConfigService({
          AI_INDEX_ENVIRONMENT: 'staging',
          AI_INDEX_OUTBOX_ENVIRONMENT: 'production',
        }),
      ),
    ).toThrow('AI_INDEX_OUTBOX_ENVIRONMENT must match');
  });

  it('normalizes matching indexing environment values', () => {
    expect(
      validateEnvironment({
        NODE_ENV: 'staging',
        AI_INDEX_ENVIRONMENT: 'staging',
        AI_INDEX_OUTBOX_ENVIRONMENT: 'staging',
      }),
    ).toMatchObject({
      AI_INDEX_ENVIRONMENT: 'staging',
      AI_INDEX_OUTBOX_ENVIRONMENT: 'staging',
    });
  });
});
