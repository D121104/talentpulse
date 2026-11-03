import {
  AiServiceError,
  JobIndexIdentity,
  assertExactKeys,
  datesMatchEpoch,
  isOptionalEpochMs,
  isOptionalIsoDate,
  isOptionalText,
  isRecord,
  isString,
  isUuid,
  isVersion,
} from './ai-service.common';

export interface CanonicalJobSnapshot {
  job_id: string;
  title: string;
  description: string;
  skills: string[];
  company_id: string;
  company_name: string;
  location: string | null;
  level: string | null;
  work_mode: string | null;
  employment_type: string | null;
  salary: number | null;
  salary_currency: string | null;
  start_date: string | null;
  end_date: string | null;
  start_date_epoch_ms: number | null;
  end_date_epoch_ms: number | null;
  is_active: boolean;
  is_deleted: boolean;
  company_is_active: boolean;
  company_is_deleted: boolean;
}

export interface JobIndexUpsertRequest {
  identity: JobIndexIdentity;
  job: CanonicalJobSnapshot;
  idempotency_key: string;
  source_version: string;
  representation_version: string;
  content_hash: string;
}
export interface JobIndexDeleteRequest {
  identity: JobIndexIdentity;
  job_id: string;
  idempotency_key: string;
  source_version: string;
  representation_version: string;
}
export type JobIndexOperation = 'UPSERT' | 'DELETE';
export type JobIndexStatus =
  | 'INDEXED'
  | 'DELETED'
  | 'ALREADY_DELETED'
  | 'STALE_IGNORED'
  | 'SKIPPED_INACTIVE';
export interface JobIndexResponse {
  request_id: string;
  trace_id: string;
  operation_attempt_id: string;
  job_id: string;
  operation: JobIndexOperation;
  status: JobIndexStatus;
  source_version: string;
  representation_version: string;
  point_id: string;
  content_hash: string | null;
  embedding_provider: string;
  embedding_model: string;
  embedding_dimensions: number;
  embedded: boolean;
}
export interface JobIndexingClient {
  upsertJob(request: JobIndexUpsertRequest): Promise<JobIndexResponse>;
  deleteJob(request: JobIndexDeleteRequest): Promise<JobIndexResponse>;
}

export function validateJobUpsertRequest(request: JobIndexUpsertRequest): void {
  const job = request?.job;
  if (!isRecord(request) || !isRecord(request.identity) || !isRecord(job)) {
    throw new AiServiceError(
      'AI_INVALID_RESPONSE',
      'Invalid job index request',
    );
  }
  assertExactKeys(request, [
    'identity',
    'job',
    'idempotency_key',
    'source_version',
    'representation_version',
    'content_hash',
  ]);
  assertExactKeys(request.identity, [
    'request_id',
    'trace_id',
    'operation_attempt_id',
  ]);
  assertExactKeys(job, [
    'job_id',
    'title',
    'description',
    'skills',
    'company_id',
    'company_name',
    'location',
    'level',
    'work_mode',
    'employment_type',
    'salary',
    'salary_currency',
    'start_date',
    'end_date',
    'start_date_epoch_ms',
    'end_date_epoch_ms',
    'is_active',
    'is_deleted',
    'company_is_active',
    'company_is_deleted',
  ]);
  if (
    !isUuid(request.identity.request_id) ||
    !isUuid(request.identity.trace_id) ||
    !isUuid(request.identity.operation_attempt_id) ||
    !isUuid(job.job_id) ||
    !isUuid(job.company_id) ||
    !isString(request.idempotency_key) ||
    request.idempotency_key.length < 1 ||
    request.idempotency_key.length > 128 ||
    request.idempotency_key !== request.idempotency_key.trim() ||
    !isVersion(request.source_version) ||
    !isVersion(request.representation_version) ||
    !isString(request.content_hash) ||
    !/^[0-9a-f]{64}$/.test(request.content_hash) ||
    !isString(job.title) ||
    job.title.length < 1 ||
    job.title.length > 500 ||
    job.title !== job.title.trim() ||
    !isString(job.description) ||
    job.description.length > 50000 ||
    job.description !== job.description.trim() ||
    !Array.isArray(job.skills) ||
    job.skills.length > 50 ||
    job.skills.some(
      (item) =>
        !isString(item) ||
        item.length < 1 ||
        item.length > 500 ||
        item !== item.trim(),
    ) ||
    !isString(job.company_name) ||
    job.company_name.length < 1 ||
    job.company_name.length > 500 ||
    job.company_name !== job.company_name.trim() ||
    !isOptionalText(job.location, 500) ||
    !isOptionalText(job.level, 500) ||
    !isOptionalText(job.work_mode, 500) ||
    !isOptionalText(job.employment_type, 500) ||
    (job.salary !== null &&
      (typeof job.salary !== 'number' ||
        !Number.isFinite(job.salary) ||
        job.salary < 0 ||
        job.salary > 10 ** 12)) ||
    (job.salary_currency !== null &&
      (!isString(job.salary_currency) ||
        job.salary_currency.length < 1 ||
        job.salary_currency.length > 16 ||
        !job.salary_currency.trim())) ||
    !isOptionalIsoDate(job.start_date) ||
    !isOptionalIsoDate(job.end_date) ||
    !isOptionalEpochMs(job.start_date_epoch_ms) ||
    !isOptionalEpochMs(job.end_date_epoch_ms) ||
    (job.start_date === null) !== (job.end_date === null) ||
    (job.start_date === null
      ? job.start_date_epoch_ms !== null || job.end_date_epoch_ms !== null
      : job.start_date_epoch_ms === null || job.end_date_epoch_ms === null) ||
    !datesMatchEpoch(job.start_date, job.start_date_epoch_ms) ||
    !datesMatchEpoch(job.end_date, job.end_date_epoch_ms) ||
    typeof job.is_active !== 'boolean' ||
    typeof job.is_deleted !== 'boolean' ||
    typeof job.company_is_active !== 'boolean' ||
    typeof job.company_is_deleted !== 'boolean'
  ) {
    throw new AiServiceError(
      'AI_INVALID_RESPONSE',
      'Invalid job index request',
    );
  }
  if (
    job.start_date &&
    job.end_date &&
    Date.parse(job.start_date) >= Date.parse(job.end_date)
  ) {
    throw new AiServiceError(
      'AI_INVALID_RESPONSE',
      'Invalid job index request',
    );
  }
}

export function validateJobDeleteRequest(request: JobIndexDeleteRequest): void {
  if (!isRecord(request) || !isRecord(request.identity)) {
    throw new AiServiceError(
      'AI_INVALID_RESPONSE',
      'Invalid job index request',
    );
  }
  assertExactKeys(request, [
    'identity',
    'job_id',
    'idempotency_key',
    'source_version',
    'representation_version',
  ]);
  assertExactKeys(request.identity, [
    'request_id',
    'trace_id',
    'operation_attempt_id',
  ]);
  if (
    !isUuid(request.identity.request_id) ||
    !isUuid(request.identity.trace_id) ||
    !isUuid(request.identity.operation_attempt_id) ||
    !isUuid(request.job_id) ||
    !isString(request.idempotency_key) ||
    request.idempotency_key.length < 1 ||
    request.idempotency_key.length > 128 ||
    request.idempotency_key !== request.idempotency_key.trim() ||
    !isVersion(request.source_version) ||
    !isVersion(request.representation_version)
  ) {
    throw new AiServiceError(
      'AI_INVALID_RESPONSE',
      'Invalid job index request',
    );
  }
}

export function validateJobIndexResponse(
  value: unknown,
  request: JobIndexUpsertRequest | JobIndexDeleteRequest,
  operation: JobIndexOperation,
): JobIndexResponse {
  if (!isRecord(value))
    throw new AiServiceError(
      'AI_INVALID_RESPONSE',
      'Invalid job index response',
    );
  assertExactKeys(value, [
    'request_id',
    'trace_id',
    'operation_attempt_id',
    'job_id',
    'operation',
    'status',
    'source_version',
    'representation_version',
    'point_id',
    'content_hash',
    'embedding_provider',
    'embedding_model',
    'embedding_dimensions',
    'embedded',
  ]);
  const expectedJobId =
    'job_id' in request ? request.job_id : request.job.job_id;
  const validStatus =
    operation === 'UPSERT'
      ? value.status === 'INDEXED' || value.status === 'SKIPPED_INACTIVE'
      : value.status === 'DELETED' ||
        value.status === 'ALREADY_DELETED' ||
        value.status === 'SKIPPED_INACTIVE';
  if (
    value.request_id !== request.identity.request_id ||
    value.trace_id !== request.identity.trace_id ||
    value.operation_attempt_id !== request.identity.operation_attempt_id ||
    value.job_id !== expectedJobId ||
    value.operation !== operation ||
    !validStatus ||
    value.source_version !== request.source_version ||
    value.representation_version !== request.representation_version ||
    !isUuid(value.request_id) ||
    !isUuid(value.trace_id) ||
    !isUuid(value.operation_attempt_id) ||
    !isUuid(value.job_id) ||
    !isUuid(value.point_id) ||
    (value.content_hash !== null &&
      (!isString(value.content_hash) ||
        !/^[0-9a-f]{64}$/.test(value.content_hash))) ||
    !isString(value.embedding_provider) ||
    !isString(value.embedding_model) ||
    typeof value.embedding_dimensions !== 'number' ||
    !Number.isInteger(value.embedding_dimensions) ||
    value.embedding_dimensions < 1 ||
    value.embedding_dimensions > 4096 ||
    typeof value.embedded !== 'boolean'
  ) {
    throw new AiServiceError(
      'AI_INVALID_RESPONSE',
      'Invalid job index response',
    );
  }
  const skippedInactive = value.status === 'SKIPPED_INACTIVE';
  if (
    (operation === 'UPSERT' &&
      (skippedInactive
        ? value.content_hash !== null || value.embedded !== false
        : value.content_hash !==
            (request as JobIndexUpsertRequest).content_hash ||
          value.embedded !== true)) ||
    (operation === 'DELETE' &&
      (value.content_hash !== null || value.embedded !== false))
  ) {
    throw new AiServiceError(
      'AI_INVALID_RESPONSE',
      'Invalid job index response',
    );
  }
  return value as unknown as JobIndexResponse;
}
