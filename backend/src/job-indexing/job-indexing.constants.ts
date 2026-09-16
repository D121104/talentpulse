export const JOB_INDEX_COLLECTION = 'jobs_cohere_multilingual_v3_1024_demo_v1';
export const JOB_INDEX_ALIAS = 'jobs_current_demo';
export const JOB_INDEX_VERSION = 'demo-v1';
export const LOCAL_OLLAMA_INDEX_VERSION = 'local-ollama-v1';
export const JOB_EMBEDDING_DIMENSIONS = 1024;
export const JOB_INDEX_MAX_ATTEMPTS = 8;
export const JOB_INDEX_LEASE_SECONDS = 120;
export const JOB_INDEX_MAX_BACKFILL_OPERATIONS = 10000;

export function resolveJobIndexRepresentationVersion(value: unknown): string {
  if (typeof value !== 'string') return JOB_INDEX_VERSION;
  const normalized = value.trim();
  return normalized && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(normalized)
    ? normalized
    : JOB_INDEX_VERSION;
}
