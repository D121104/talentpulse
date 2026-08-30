import {
  areBackgroundJobsEnabled,
  areQueueWorkersEnabled,
  isIndexingWorkerEnabled,
  isRedisEnabled,
} from './runtime-flags';

describe('runtime flags', () => {
  it('defaults local runtime to enabled Redis workers', () => {
    expect(isRedisEnabled({})).toBe(true);
    expect(areBackgroundJobsEnabled({})).toBe(true);
    expect(areQueueWorkersEnabled({})).toBe(true);
  });

  it('disables workers when either Redis or background jobs is disabled', () => {
    expect(
      areQueueWorkersEnabled({
        REDIS_ENABLED: 'false',
        RUN_BACKGROUND_JOBS: 'true',
      }),
    ).toBe(false);
    expect(
      areQueueWorkersEnabled({
        REDIS_ENABLED: 'true',
        RUN_BACKGROUND_JOBS: 'false',
      }),
    ).toBe(false);
  });

  it('keeps the indexing worker opt-in and dependent on background jobs', () => {
    expect(isIndexingWorkerEnabled({})).toBe(false);
    expect(
      isIndexingWorkerEnabled({
        RUN_INDEXING_WORKER: 'true',
        RUN_BACKGROUND_JOBS: 'true',
      }),
    ).toBe(true);
    expect(
      isIndexingWorkerEnabled({
        RUN_INDEXING_WORKER: 'true',
        RUN_BACKGROUND_JOBS: 'false',
      }),
    ).toBe(false);
  });
});
