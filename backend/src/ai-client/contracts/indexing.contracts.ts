import { validate as isUuid } from 'uuid';
import { AiServiceError, AiServiceErrorCode } from '../ai-client.errors';

/**
 * Wire-level indexing contract. Callers must pass a bounded canonical
 * projection rather than a TypeORM entity or another persistence object.
 */
export type IndexingDateValue = string | Date;
export type Sha256Hash = string;

export const MAX_INDEX_JOB_DESCRIPTION_CHARS = 50_000;
export const MAX_INDEX_JOB_SKILLS = 50;
export const MAX_INDEX_POINT_IDS = 128;
export const MAX_INDEX_IDEMPOTENCY_KEY_CHARS = 128;
export const MAX_INDEX_EMBEDDING_MODEL_VERSION_CHARS = 256;
export const MAX_INDEX_VERSION_CHARS = 64;
export const MAX_INDEX_EMBEDDING_DIMENSIONS = 4096;
export const MAX_INDEX_CHUNK_COUNT = 128;
export const MAX_INDEX_SAFE_SOURCE_VERSION = Number.MAX_SAFE_INTEGER;
export const MAX_INDEX_SCAN_LIMIT = 256;
export const MAX_INDEX_SCAN_CURSOR_CHARS = 128;
export const MAX_INDEX_EMBEDDING_PROVIDER_CHARS = 64;
export const MAX_INDEX_COLLECTION_NAME_CHARS = 255;
export const MAX_INDEX_COLLECTION_VERSION_CHARS = 128;

export interface CanonicalCompanySnapshot {
  company_id: string;
  name: string;
  is_active: boolean;
  is_deleted: boolean;
  deleted_at?: IndexingDateValue | null;
}

export interface CanonicalCompanySnapshotProjection {
  company_id?: string;
  _id?: string;
  name?: string;
  company_name?: string;
  is_active?: boolean;
  isActive?: boolean;
  is_deleted?: boolean;
  isDeleted?: boolean;
  deleted_at?: IndexingDateValue | null;
  deletedAt?: IndexingDateValue | null;
}

export interface CanonicalSalary {
  amount: number;
  currency: string;
}

export type CanonicalSalaryValue = CanonicalSalary | number;

export interface CanonicalJobSnapshot {
  job_id: string;
  title: string;
  description?: string | null;
  skills?: string[];
  company_id: string;
  company_name: string;
  location?: string | null;
  level?: string | null;
  work_mode?: string | null;
  employment_type?: string | null;
  salary?: CanonicalSalaryValue | null;
  salary_currency?: string | null;
  start_date?: IndexingDateValue | null;
  end_date?: IndexingDateValue | null;
  updated_at?: IndexingDateValue | null;
  is_active: boolean;
  is_deleted: boolean;
  deleted_at?: IndexingDateValue | null;
  company_is_active: boolean;
  company_is_deleted: boolean;
  company_deleted_at?: IndexingDateValue | null;
  company?: CanonicalCompanySnapshotProjection;
}

export interface CanonicalJobSnapshotProjection
  extends Partial<CanonicalJobSnapshot> {
  _id?: string;
  name?: string;
  companyId?: string;
  companyName?: string;
  startDate?: IndexingDateValue | null;
  endDate?: IndexingDateValue | null;
  updatedAt?: IndexingDateValue | null;
  isActive?: boolean;
  isDeleted?: boolean;
  deletedAt?: IndexingDateValue | null;
  companyIsActive?: boolean;
  companyIsDeleted?: boolean;
  companyDeletedAt?: IndexingDateValue | null;
  salaryCurrency?: string | null;
  workMode?: string | null;
  employmentType?: string | null;
  company?: CanonicalCompanySnapshotProjection | null;
}

export type CanonicalJobSnapshotInput =
  | CanonicalJobSnapshot
  | CanonicalJobSnapshotProjection;

export interface IndexJobUpsertRequest {
  job: CanonicalJobSnapshotInput;
  idempotency_key: string;
  source_version: number;
  content_hash?: Sha256Hash | null;
  metadata_hash?: Sha256Hash | null;
  embedding_model_version?: string | null;
  embedding_dimensions?: number | null;
  normalization_version?: string | null;
  chunking_version?: string | null;
  index_schema_version?: string | null;
}

export interface IndexJobDeleteRequest {
  job_id: string;
  idempotency_key: string;
  source_version: number;
}

export type IndexOperation = 'UPSERT' | 'DELETE';
export type IndexOperationStatus =
  | 'INDEXED'
  | 'UPDATED'
  | 'SKIPPED'
  | 'STALE_IGNORED'
  | 'DELETED'
  | 'ALREADY_DELETED';

export interface IndexJobResponse {
  /** Echo of the X-Request-ID generated/supplied by the NestJS client. */
  request_id?: string | null;
  job_id: string;
  operation: IndexOperation;
  status: IndexOperationStatus;
  source_version: number;
  point_ids: string[];
  deleted_point_ids: string[];
  content_hash?: Sha256Hash | null;
  metadata_hash?: Sha256Hash | null;
  chunk_count: number;
  embedded: boolean;
  embedding_model_version?: string | null;
  embedding_dimensions?: number | null;
  normalization_version?: string | null;
  chunking_version?: string | null;
  index_schema_version?: string | null;
  embedding_provider?: string | null;
  collection_name?: string | null;
  collection_version?: string | null;
}

export interface IndexMetadataScanRequest {
  /** Opaque Qdrant cursor; UUID and canonical numeric offsets are supported. */
  cursor?: string | null;
  /** FastAPI defaults this to MAX_INDEX_SCAN_LIMIT when omitted. */
  limit?: number;
}

export interface IndexPointMetadata {
  point_id: string;
  job_id: string;
  company_id: string;
  source_version: number;
  content_hash: Sha256Hash;
  metadata_hash?: Sha256Hash | null;
  embedding_provider?: string | null;
  embedding_model_version: string;
  embedding_dimensions: number;
  normalization_version: string;
  chunking_version: string;
  index_schema_version: string;
  collection_name?: string | null;
  collection_version?: string | null;
}

export interface IndexMetadataScanResponse {
  points: IndexPointMetadata[];
  next_cursor?: string | null;
  request_id: string;
}

export type IndexJobUpsertResponse = IndexJobResponse;
export type IndexJobDeleteResponse = IndexJobResponse;

const SHA256_PATTERN = /^[A-Fa-f0-9]{64}$/;
const ISO_DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}(?:[Tt ]\d{2}(?::\d{2}(?::\d{2}(?:[.,]\d{1,6})?)?)?(?:[Zz]|[+-]\d{2}:?\d{2})?)?$/;

const COMPANY_KEYS = new Set([
  'company_id',
  'name',
  'is_active',
  'is_deleted',
  'deleted_at',
]);

const COMPANY_PROJECTION_KEYS = new Set([
  ...COMPANY_KEYS,
  '_id',
  'company_name',
  'isActive',
  'isDeleted',
  'deletedAt',
]);

const JOB_KEYS = new Set([
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
  'updated_at',
  'is_active',
  'is_deleted',
  'deleted_at',
  'company_is_active',
  'company_is_deleted',
  'company_deleted_at',
  'company',
  '_id',
  'name',
  'companyId',
  'companyName',
  'startDate',
  'endDate',
  'updatedAt',
  'isActive',
  'isDeleted',
  'deletedAt',
  'companyIsActive',
  'companyIsDeleted',
  'companyDeletedAt',
  'salaryCurrency',
  'workMode',
  'employmentType',
]);

const UPSERT_REQUEST_KEYS = new Set([
  'job',
  'idempotency_key',
  'source_version',
  'content_hash',
  'metadata_hash',
  'embedding_model_version',
  'embedding_dimensions',
  'normalization_version',
  'chunking_version',
  'index_schema_version',
]);

const DELETE_REQUEST_KEYS = new Set([
  'job_id',
  'idempotency_key',
  'source_version',
]);

const SCAN_REQUEST_KEYS = new Set(['cursor', 'limit']);
const SCAN_POINT_KEYS = new Set([
  'point_id',
  'job_id',
  'company_id',
  'source_version',
  'content_hash',
  'metadata_hash',
  'embedding_provider',
  'embedding_model_version',
  'embedding_dimensions',
  'normalization_version',
  'chunking_version',
  'index_schema_version',
  'collection_name',
  'collection_version',
]);
const SCAN_RESPONSE_KEYS = new Set(['points', 'next_cursor', 'request_id']);

const RESPONSE_KEYS = new Set([
  'job_id',
  'operation',
  'status',
  'source_version',
  'point_ids',
  'deleted_point_ids',
  'content_hash',
  'metadata_hash',
  'chunk_count',
  'embedded',
  'request_id',
  'embedding_model_version',
  'embedding_dimensions',
  'normalization_version',
  'chunking_version',
  'index_schema_version',
  'embedding_provider',
  'collection_name',
  'collection_version',
]);

function invalidRequest(message: string): never {
  throw new AiServiceError(
    AiServiceErrorCode.AI_REQUEST_REJECTED,
    message,
    400,
    false,
  );
}

function invalidResponse(message: string): never {
  throw new AiServiceError(
    AiServiceErrorCode.AI_INVALID_MODEL_OUTPUT,
    message,
    502,
    false,
  );
}

function ensureRecord(
  value: unknown,
  field: string,
  response = false,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    (response ? invalidResponse : invalidRequest)(field + ' is invalid');
  }
  return value as Record<string, unknown>;
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function ensureKeys(
  value: Record<string, unknown>,
  allowed: Set<string>,
  field: string,
  response = false,
): void {
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    (response ? invalidResponse : invalidRequest)(
      field + ' contains unknown fields',
    );
  }
}

function ensureString(
  value: unknown,
  field: string,
  maxLength: number,
  response = false,
  allowEmpty = false,
): string {
  if (
    typeof value !== 'string' ||
    (!allowEmpty && value.length === 0) ||
    value.length > maxLength
  ) {
    (response ? invalidResponse : invalidRequest)(field + ' is invalid');
  }
  return value as string;
}

function ensureNonBlankString(
  value: unknown,
  field: string,
  maxLength: number,
  response = false,
): string {
  const stringValue = ensureString(value, field, maxLength, response);
  if (!stringValue.trim()) {
    (response ? invalidResponse : invalidRequest)(field + ' is invalid');
  }
  return stringValue;
}

/** Qdrant metadata parsing rejects leading/trailing whitespace. */
function ensureMetadataString(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  const stringValue = ensureNonBlankString(value, field, maxLength, true);
  if (stringValue !== stringValue.trim()) {
    invalidResponse(field + ' is invalid');
  }
  return stringValue;
}

/** Matches the current FastAPI optional text validators: blank text is null. */
function ensureOptionalText(
  value: unknown,
  field: string,
  maxLength: number,
  response = false,
): string | null | undefined {
  if (value === undefined || value === null) return value as null | undefined;
  const stringValue = ensureString(value, field, maxLength, response, true);
  return stringValue.trim() ? stringValue : null;
}

function ensureOptionalString(
  value: unknown,
  field: string,
  maxLength: number,
  response = false,
): string | null | undefined {
  if (value === undefined || value === null) return value as null | undefined;
  return ensureString(value, field, maxLength, response);
}

function ensureUuid(value: unknown, field: string, response = false): string {
  const stringValue = ensureString(value, field, 36, response);
  if (!isUuid(stringValue)) {
    (response ? invalidResponse : invalidRequest)(field + ' must be a UUID');
  }
  return stringValue.toLowerCase();
}

function ensureScanCursor(
  value: unknown,
  field: string,
  response = false,
): string | null | undefined {
  if (value === undefined || value === null) return value as null | undefined;
  const cursor = ensureString(
    value,
    field,
    MAX_INDEX_SCAN_CURSOR_CHARS,
    response,
  );
  if (isUuid(cursor)) return cursor.toLowerCase();
  if (!/^\d+$/.test(cursor)) {
    (response ? invalidResponse : invalidRequest)(
      field + ' must be a UUID or canonical numeric offset',
    );
  }
  try {
    const numeric = BigInt(cursor);
    if (
      numeric < 0n ||
      numeric > 18446744073709551615n ||
      String(numeric) !== cursor
    ) {
      (response ? invalidResponse : invalidRequest)(field + ' is invalid');
    }
  } catch {
    (response ? invalidResponse : invalidRequest)(field + ' is invalid');
  }
  return cursor;
}

function ensureHash(value: unknown, field: string, response = false): string {
  const hash = ensureString(value, field, 64, response);
  if (!SHA256_PATTERN.test(hash)) {
    (response ? invalidResponse : invalidRequest)(field + ' is invalid');
  }
  return hash;
}

function ensureOptionalHash(
  value: unknown,
  field: string,
  response = false,
): string | null | undefined {
  if (value === undefined || value === null) return value as null | undefined;
  return ensureHash(value, field, response);
}

function ensureBoolean(
  value: unknown,
  field: string,
  response = false,
): boolean {
  if (typeof value !== 'boolean') {
    (response ? invalidResponse : invalidRequest)(field + ' is invalid');
  }
  return value as boolean;
}

function ensureNumber(
  value: unknown,
  field: string,
  min: number,
  max: number,
  response = false,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  ) {
    (response ? invalidResponse : invalidRequest)(field + ' is invalid');
  }
  return value as number;
}

function ensureInteger(
  value: unknown,
  field: string,
  min: number,
  max: number,
  response = false,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  ) {
    (response ? invalidResponse : invalidRequest)(field + ' is invalid');
  }
  return value as number;
}

function ensureStringArray(
  value: unknown,
  field: string,
  maxItems: number,
  maxLength: number,
  response = false,
): string[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    (response ? invalidResponse : invalidRequest)(field + ' is invalid');
  }
  return (value as unknown[]).map((item, index) =>
    ensureString(item, field + '[' + index + ']', maxLength, response),
  );
}

function ensureUuidArray(
  value: unknown,
  field: string,
  maxItems: number,
  response = false,
): string[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    (response ? invalidResponse : invalidRequest)(field + ' is invalid');
  }
  return (value as unknown[]).map((item, index) =>
    ensureUuid(item, field + '[' + index + ']', response),
  );
}

function normalizeDate(
  value: unknown,
  field: string,
  response = false,
): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      (response ? invalidResponse : invalidRequest)(field + ' is invalid');
    }
    return value.toISOString();
  }

  const stringValue = ensureString(value, field, 64, response);
  if (stringValue.length < 10 || !ISO_DATE_PATTERN.test(stringValue)) {
    (response ? invalidResponse : invalidRequest)(field + ' is invalid');
  }

  const datePart = stringValue.slice(0, 10);
  const [year, month, day] = datePart.split('-').map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) {
    (response ? invalidResponse : invalidRequest)(field + ' is invalid');
  }

  const dateOnly = stringValue.length === 10;
  const hasTimezone = /(?:[Zz]|[+-]\d{2}:?\d{2})$/.test(stringValue);
  const parseValue = dateOnly
    ? stringValue + 'T00:00:00.000Z'
    : hasTimezone
    ? stringValue
    : stringValue + 'Z';
  const timestamp = Date.parse(parseValue);
  if (!Number.isFinite(timestamp)) {
    (response ? invalidResponse : invalidRequest)(field + ' is invalid');
  }
  return new Date(timestamp).toISOString();
}

function ensureOptionalDate(
  value: unknown,
  field: string,
  response = false,
): string | null | undefined {
  if (value === undefined || value === null) return value as null | undefined;
  return normalizeDate(value, field, response);
}

function ensureOptionalVersion(
  value: unknown,
  field: string,
  maxLength: number,
  response = false,
): string | null | undefined {
  return ensureOptionalString(value, field, maxLength, response);
}

function ensureOptionalDimensions(
  value: unknown,
  field: string,
  response = false,
): number | null | undefined {
  if (value === undefined || value === null) return value as null | undefined;
  return ensureInteger(
    value,
    field,
    1,
    MAX_INDEX_EMBEDDING_DIMENSIONS,
    response,
  );
}

function resolveAliasedValue(
  value: Record<string, unknown>,
  target: string,
  aliases: string[],
  field: string,
  response = false,
  nestedValue?: unknown,
): unknown {
  const targetPresent = hasOwn(value, target);
  const alias = aliases.find((candidate) => hasOwn(value, candidate));
  if (nestedValue !== undefined && nestedValue !== null) {
    if (targetPresent && value[target] !== nestedValue) {
      (response ? invalidResponse : invalidRequest)(
        field + ' does not match the nested company projection',
      );
    }
    // The FastAPI model fills the canonical field from the nested projection;
    // an additional camelCase alias would then be an unknown root field.
    if (!targetPresent && alias !== undefined) {
      (response ? invalidResponse : invalidRequest)(
        field + ' contains duplicate aliases',
      );
    }
    return targetPresent ? value[target] : nestedValue;
  }
  if (targetPresent && alias !== undefined) {
    (response ? invalidResponse : invalidRequest)(
      field + ' contains duplicate aliases',
    );
  }
  return targetPresent
    ? value[target]
    : alias === undefined
    ? undefined
    : value[alias];
}

function nestedCompanyValue(
  company: Record<string, unknown> | undefined,
  canonical: string,
  aliases: string[],
): unknown {
  if (!company) return undefined;
  if (hasOwn(company, canonical)) return company[canonical];
  const alias = aliases.find((candidate) => hasOwn(company, candidate));
  return alias === undefined ? undefined : company[alias];
}

function validateCompanySnapshot(
  value: unknown,
  field: string,
  response = false,
  allowProjectionExtras = false,
): CanonicalCompanySnapshot {
  const company = ensureRecord(value, field, response);
  if (!allowProjectionExtras)
    ensureKeys(company, COMPANY_KEYS, field, response);
  return {
    company_id: ensureUuid(company.company_id, field + '.company_id', response),
    name: ensureString(company.name, field + '.name', 500, response),
    is_active: ensureBoolean(company.is_active, field + '.is_active', response),
    is_deleted: ensureBoolean(
      company.is_deleted,
      field + '.is_deleted',
      response,
    ),
    ...(hasOwn(company, 'deleted_at')
      ? {
          deleted_at: ensureOptionalDate(
            company.deleted_at,
            field + '.deleted_at',
            response,
          ),
        }
      : {}),
  };
}

function validateNestedCompany(
  value: unknown,
  field: string,
  response = false,
): Record<string, unknown> | undefined {
  if (value === undefined || value === null) return undefined;
  const company = ensureRecord(value, field, response);
  ensureKeys(company, COMPANY_PROJECTION_KEYS, field, response);
  return company;
}

function validateSalary(
  value: unknown,
  field: string,
  response = false,
): CanonicalSalaryValue | null | undefined {
  if (value === undefined || value === null) return value as null | undefined;
  if (typeof value === 'number')
    return ensureNumber(value, field, 0, 10 ** 12, response);
  const salary = ensureRecord(value, field, response);
  ensureKeys(salary, new Set(['amount', 'currency']), field, response);
  return {
    amount: ensureNumber(
      salary.amount,
      field + '.amount',
      0,
      10 ** 12,
      response,
    ),
    currency: ensureString(salary.currency, field + '.currency', 16, response),
  };
}

function validateJobSnapshot(
  value: unknown,
  field: string,
  response = false,
): CanonicalJobSnapshot {
  const raw = ensureRecord(value, field, response);
  ensureKeys(raw, JOB_KEYS, field, response);
  const nested = validateNestedCompany(
    raw.company,
    field + '.company',
    response,
  );

  const companyIdFromNested = nestedCompanyValue(nested, 'company_id', ['_id']);
  const companyNameFromNested = nestedCompanyValue(nested, 'company_name', [
    'name',
  ]);
  const companyIsActiveFromNested = nestedCompanyValue(
    nested,
    'company_is_active',
    ['is_active', 'isActive'],
  );
  const companyIsDeletedFromNested = nestedCompanyValue(
    nested,
    'company_is_deleted',
    ['is_deleted', 'isDeleted'],
  );
  const companyDeletedAtFromNested = nestedCompanyValue(
    nested,
    'company_deleted_at',
    ['deleted_at', 'deletedAt'],
  );

  const jobId = resolveAliasedValue(
    raw,
    'job_id',
    ['_id'],
    field + '.job_id',
    response,
  );
  const title = resolveAliasedValue(
    raw,
    'title',
    ['name'],
    field + '.title',
    response,
  );
  const companyId = resolveAliasedValue(
    raw,
    'company_id',
    ['companyId'],
    field + '.company_id',
    response,
    companyIdFromNested,
  );
  const companyName = resolveAliasedValue(
    raw,
    'company_name',
    ['companyName'],
    field + '.company_name',
    response,
    companyNameFromNested,
  );
  const startDate = resolveAliasedValue(
    raw,
    'start_date',
    ['startDate'],
    field + '.start_date',
    response,
  );
  const endDate = resolveAliasedValue(
    raw,
    'end_date',
    ['endDate'],
    field + '.end_date',
    response,
  );
  const updatedAt = resolveAliasedValue(
    raw,
    'updated_at',
    ['updatedAt'],
    field + '.updated_at',
    response,
  );
  const workMode = resolveAliasedValue(
    raw,
    'work_mode',
    ['workMode'],
    field + '.work_mode',
    response,
  );
  const employmentType = resolveAliasedValue(
    raw,
    'employment_type',
    ['employmentType'],
    field + '.employment_type',
    response,
  );
  const salaryCurrency = resolveAliasedValue(
    raw,
    'salary_currency',
    ['salaryCurrency'],
    field + '.salary_currency',
    response,
  );
  const isActive = resolveAliasedValue(
    raw,
    'is_active',
    ['isActive'],
    field + '.is_active',
    response,
  );
  const isDeleted = resolveAliasedValue(
    raw,
    'is_deleted',
    ['isDeleted'],
    field + '.is_deleted',
    response,
  );
  const deletedAt = resolveAliasedValue(
    raw,
    'deleted_at',
    ['deletedAt'],
    field + '.deleted_at',
    response,
  );
  const companyIsActive = resolveAliasedValue(
    raw,
    'company_is_active',
    ['companyIsActive'],
    field + '.company_is_active',
    response,
    companyIsActiveFromNested,
  );
  const companyIsDeleted = resolveAliasedValue(
    raw,
    'company_is_deleted',
    ['companyIsDeleted'],
    field + '.company_is_deleted',
    response,
    companyIsDeletedFromNested,
  );
  const companyDeletedAt = resolveAliasedValue(
    raw,
    'company_deleted_at',
    ['companyDeletedAt'],
    field + '.company_deleted_at',
    response,
    companyDeletedAtFromNested,
  );

  return {
    job_id: ensureUuid(jobId, field + '.job_id', response),
    title: ensureNonBlankString(title, field + '.title', 500, response),
    description:
      raw.description === undefined || raw.description === null
        ? ''
        : ensureString(
            raw.description,
            field + '.description',
            MAX_INDEX_JOB_DESCRIPTION_CHARS,
            response,
            true,
          ),
    skills:
      raw.skills === undefined
        ? []
        : ensureStringArray(
            raw.skills,
            field + '.skills',
            MAX_INDEX_JOB_SKILLS,
            500,
            response,
          ),
    company_id: ensureUuid(companyId, field + '.company_id', response),
    company_name: ensureNonBlankString(
      companyName,
      field + '.company_name',
      500,
      response,
    ),
    ...(raw.location === undefined
      ? {}
      : {
          location: ensureOptionalText(
            raw.location,
            field + '.location',
            500,
            response,
          ),
        }),
    ...(raw.level === undefined
      ? {}
      : {
          level: ensureOptionalText(raw.level, field + '.level', 500, response),
        }),
    ...(workMode === undefined
      ? {}
      : {
          work_mode: ensureOptionalText(
            workMode,
            field + '.work_mode',
            500,
            response,
          ),
        }),
    ...(employmentType === undefined
      ? {}
      : {
          employment_type: ensureOptionalText(
            employmentType,
            field + '.employment_type',
            500,
            response,
          ),
        }),
    ...(raw.salary === undefined || raw.salary === null
      ? raw.salary === null
        ? { salary: null }
        : {}
      : { salary: validateSalary(raw.salary, field + '.salary', response) }),
    ...(salaryCurrency === undefined
      ? {}
      : {
          salary_currency: ensureOptionalText(
            salaryCurrency,
            field + '.salary_currency',
            16,
            response,
          ),
        }),
    ...(startDate === undefined
      ? {}
      : {
          start_date:
            startDate === null
              ? null
              : normalizeDate(startDate, field + '.start_date', response),
        }),
    ...(endDate === undefined
      ? {}
      : {
          end_date:
            endDate === null
              ? null
              : normalizeDate(endDate, field + '.end_date', response),
        }),
    ...(updatedAt === undefined
      ? {}
      : {
          updated_at:
            updatedAt === null
              ? null
              : normalizeDate(updatedAt, field + '.updated_at', response),
        }),
    is_active: ensureBoolean(isActive, field + '.is_active', response),
    is_deleted: ensureBoolean(isDeleted, field + '.is_deleted', response),
    ...(deletedAt === undefined
      ? {}
      : {
          deleted_at:
            deletedAt === null
              ? null
              : normalizeDate(deletedAt, field + '.deleted_at', response),
        }),
    company_is_active: ensureBoolean(
      companyIsActive,
      field + '.company_is_active',
      response,
    ),
    company_is_deleted: ensureBoolean(
      companyIsDeleted,
      field + '.company_is_deleted',
      response,
    ),
    ...(companyDeletedAt === undefined
      ? {}
      : {
          company_deleted_at:
            companyDeletedAt === null
              ? null
              : normalizeDate(
                  companyDeletedAt,
                  field + '.company_deleted_at',
                  response,
                ),
        }),
  };
}

function validateOptionalRequestFields(
  value: Record<string, unknown>,
): Pick<
  IndexJobUpsertRequest,
  | 'content_hash'
  | 'metadata_hash'
  | 'embedding_model_version'
  | 'embedding_dimensions'
  | 'normalization_version'
  | 'chunking_version'
  | 'index_schema_version'
> {
  return {
    ...(hasOwn(value, 'content_hash')
      ? { content_hash: ensureOptionalHash(value.content_hash, 'content_hash') }
      : {}),
    ...(hasOwn(value, 'metadata_hash')
      ? {
          metadata_hash: ensureOptionalHash(
            value.metadata_hash,
            'metadata_hash',
          ),
        }
      : {}),
    ...(hasOwn(value, 'embedding_model_version')
      ? {
          embedding_model_version: ensureOptionalVersion(
            value.embedding_model_version,
            'embedding_model_version',
            MAX_INDEX_EMBEDDING_MODEL_VERSION_CHARS,
          ),
        }
      : {}),
    ...(hasOwn(value, 'embedding_dimensions')
      ? {
          embedding_dimensions: ensureOptionalDimensions(
            value.embedding_dimensions,
            'embedding_dimensions',
          ),
        }
      : {}),
    ...(hasOwn(value, 'normalization_version')
      ? {
          normalization_version: ensureOptionalVersion(
            value.normalization_version,
            'normalization_version',
            MAX_INDEX_VERSION_CHARS,
          ),
        }
      : {}),
    ...(hasOwn(value, 'chunking_version')
      ? {
          chunking_version: ensureOptionalVersion(
            value.chunking_version,
            'chunking_version',
            MAX_INDEX_VERSION_CHARS,
          ),
        }
      : {}),
    ...(hasOwn(value, 'index_schema_version')
      ? {
          index_schema_version: ensureOptionalVersion(
            value.index_schema_version,
            'index_schema_version',
            MAX_INDEX_VERSION_CHARS,
          ),
        }
      : {}),
  };
}

export function assertCanonicalCompanySnapshot(
  value: unknown,
): CanonicalCompanySnapshot {
  return validateCompanySnapshot(value, 'company');
}

export function assertCanonicalJobSnapshot(
  value: unknown,
): CanonicalJobSnapshot {
  return validateJobSnapshot(value, 'job');
}

export function assertIndexJobUpsertRequest(
  value: unknown,
): IndexJobUpsertRequest {
  const request = ensureRecord(value, 'request');
  ensureKeys(request, UPSERT_REQUEST_KEYS, 'request');
  if (
    !hasOwn(request, 'job') ||
    !hasOwn(request, 'idempotency_key') ||
    !hasOwn(request, 'source_version')
  ) {
    invalidRequest('request is invalid');
  }
  return {
    job: validateJobSnapshot(request.job, 'job'),
    idempotency_key: ensureNonBlankString(
      request.idempotency_key,
      'idempotency_key',
      MAX_INDEX_IDEMPOTENCY_KEY_CHARS,
    ),
    source_version: ensureInteger(
      request.source_version,
      'source_version',
      1,
      MAX_INDEX_SAFE_SOURCE_VERSION,
    ),
    ...validateOptionalRequestFields(request),
  };
}

export function serializeIndexJobUpsertRequest(
  value: IndexJobUpsertRequest,
): IndexJobUpsertRequest {
  const validated = assertIndexJobUpsertRequest(value);
  return {
    ...validated,
    job: {
      ...validated.job,
      skills: [...(validated.job.skills || [])],
      ...(validated.job.salary && typeof validated.job.salary === 'object'
        ? { salary: { ...validated.job.salary } }
        : {}),
    },
  };
}

export function assertIndexJobDeleteRequest(
  value: unknown,
): IndexJobDeleteRequest {
  const request = ensureRecord(value, 'request');
  ensureKeys(request, DELETE_REQUEST_KEYS, 'request');
  if (
    !hasOwn(request, 'job_id') ||
    !hasOwn(request, 'idempotency_key') ||
    !hasOwn(request, 'source_version')
  ) {
    invalidRequest('request is invalid');
  }
  return {
    job_id: ensureUuid(request.job_id, 'job_id'),
    idempotency_key: ensureNonBlankString(
      request.idempotency_key,
      'idempotency_key',
      MAX_INDEX_IDEMPOTENCY_KEY_CHARS,
    ),
    source_version: ensureInteger(
      request.source_version,
      'source_version',
      1,
      MAX_INDEX_SAFE_SOURCE_VERSION,
    ),
  };
}

export function serializeIndexJobDeleteRequest(
  value: IndexJobDeleteRequest,
): IndexJobDeleteRequest {
  return { ...assertIndexJobDeleteRequest(value) };
}

export function assertIndexJobResponse(value: unknown): IndexJobResponse {
  const response = ensureRecord(value, 'response', true);
  ensureKeys(response, RESPONSE_KEYS, 'response', true);
  for (const key of [
    'job_id',
    'operation',
    'status',
    'source_version',
    'chunk_count',
    'embedded',
  ]) {
    if (!hasOwn(response, key)) invalidResponse('response is invalid');
  }
  if (response.operation !== 'UPSERT' && response.operation !== 'DELETE') {
    invalidResponse('operation is invalid');
  }
  const statuses: IndexOperationStatus[] = [
    'INDEXED',
    'UPDATED',
    'SKIPPED',
    'STALE_IGNORED',
    'DELETED',
    'ALREADY_DELETED',
  ];
  if (!statuses.includes(response.status as IndexOperationStatus)) {
    invalidResponse('status is invalid');
  }
  return {
    job_id: ensureUuid(response.job_id, 'job_id', true),
    operation: response.operation as IndexOperation,
    status: response.status as IndexOperationStatus,
    source_version: ensureInteger(
      response.source_version,
      'source_version',
      1,
      MAX_INDEX_SAFE_SOURCE_VERSION,
      true,
    ),
    point_ids: ensureUuidArray(
      response.point_ids === undefined ? [] : response.point_ids,
      'point_ids',
      MAX_INDEX_POINT_IDS,
      true,
    ),
    deleted_point_ids: ensureUuidArray(
      response.deleted_point_ids === undefined
        ? []
        : response.deleted_point_ids,
      'deleted_point_ids',
      MAX_INDEX_POINT_IDS,
      true,
    ),
    chunk_count: ensureInteger(
      response.chunk_count,
      'chunk_count',
      0,
      MAX_INDEX_CHUNK_COUNT,
      true,
    ),
    embedded: ensureBoolean(response.embedded, 'embedded', true),
    ...(hasOwn(response, 'content_hash')
      ? {
          content_hash: ensureOptionalHash(
            response.content_hash,
            'content_hash',
            true,
          ),
        }
      : {}),
    ...(hasOwn(response, 'metadata_hash')
      ? {
          metadata_hash: ensureOptionalHash(
            response.metadata_hash,
            'metadata_hash',
            true,
          ),
        }
      : {}),
    ...(hasOwn(response, 'request_id')
      ? {
          request_id:
            response.request_id === null
              ? null
              : ensureUuid(response.request_id, 'request_id', true),
        }
      : {}),
    ...(hasOwn(response, 'embedding_model_version')
      ? {
          embedding_model_version: ensureOptionalVersion(
            response.embedding_model_version,
            'embedding_model_version',
            MAX_INDEX_EMBEDDING_MODEL_VERSION_CHARS,
            true,
          ),
        }
      : {}),
    ...(hasOwn(response, 'embedding_dimensions')
      ? {
          embedding_dimensions: ensureOptionalDimensions(
            response.embedding_dimensions,
            'embedding_dimensions',
            true,
          ),
        }
      : {}),
    ...(hasOwn(response, 'normalization_version')
      ? {
          normalization_version: ensureOptionalVersion(
            response.normalization_version,
            'normalization_version',
            MAX_INDEX_VERSION_CHARS,
            true,
          ),
        }
      : {}),
    ...(hasOwn(response, 'chunking_version')
      ? {
          chunking_version: ensureOptionalVersion(
            response.chunking_version,
            'chunking_version',
            MAX_INDEX_VERSION_CHARS,
            true,
          ),
        }
      : {}),
    ...(hasOwn(response, 'index_schema_version')
      ? {
          index_schema_version: ensureOptionalVersion(
            response.index_schema_version,
            'index_schema_version',
            MAX_INDEX_VERSION_CHARS,
            true,
          ),
        }
      : {}),
    ...(hasOwn(response, 'embedding_provider')
      ? {
          embedding_provider: ensureOptionalVersion(
            response.embedding_provider,
            'embedding_provider',
            MAX_INDEX_EMBEDDING_PROVIDER_CHARS,
            true,
          ),
        }
      : {}),
    ...(hasOwn(response, 'collection_name')
      ? {
          collection_name: ensureOptionalVersion(
            response.collection_name,
            'collection_name',
            MAX_INDEX_COLLECTION_NAME_CHARS,
            true,
          ),
        }
      : {}),
    ...(hasOwn(response, 'collection_version')
      ? {
          collection_version: ensureOptionalVersion(
            response.collection_version,
            'collection_version',
            MAX_INDEX_COLLECTION_VERSION_CHARS,
            true,
          ),
        }
      : {}),
  };
}

export function assertIndexMetadataScanRequest(
  value: unknown,
): IndexMetadataScanRequest {
  const request = ensureRecord(value, 'request');
  ensureKeys(request, SCAN_REQUEST_KEYS, 'request');
  return {
    ...(hasOwn(request, 'cursor')
      ? { cursor: ensureScanCursor(request.cursor, 'cursor') }
      : {}),
    limit: hasOwn(request, 'limit')
      ? ensureInteger(request.limit, 'limit', 1, MAX_INDEX_SCAN_LIMIT)
      : MAX_INDEX_SCAN_LIMIT,
  };
}

export function serializeIndexMetadataScanRequest(
  value: IndexMetadataScanRequest,
): IndexMetadataScanRequest {
  return { ...assertIndexMetadataScanRequest(value) };
}

function assertIndexPointMetadata(value: unknown): IndexPointMetadata {
  const point = ensureRecord(value, 'point', true);
  ensureKeys(point, SCAN_POINT_KEYS, 'point', true);
  for (const key of [
    'point_id',
    'job_id',
    'company_id',
    'source_version',
    'content_hash',
    'embedding_model_version',
    'embedding_dimensions',
    'normalization_version',
    'chunking_version',
    'index_schema_version',
  ]) {
    if (!hasOwn(point, key)) invalidResponse('point is invalid');
  }
  return {
    point_id: ensureUuid(point.point_id, 'point.point_id', true),
    job_id: ensureUuid(point.job_id, 'point.job_id', true),
    company_id: ensureUuid(point.company_id, 'point.company_id', true),
    source_version: ensureInteger(
      point.source_version,
      'point.source_version',
      1,
      MAX_INDEX_SAFE_SOURCE_VERSION,
      true,
    ),
    content_hash: ensureHash(point.content_hash, 'point.content_hash', true),
    ...(hasOwn(point, 'metadata_hash')
      ? {
          metadata_hash: ensureOptionalHash(
            point.metadata_hash,
            'point.metadata_hash',
            true,
          ),
        }
      : {}),
    ...(hasOwn(point, 'embedding_provider')
      ? {
          embedding_provider:
            point.embedding_provider === null
              ? null
              : ensureMetadataString(
                  point.embedding_provider,
                  'point.embedding_provider',
                  MAX_INDEX_EMBEDDING_PROVIDER_CHARS,
                ),
        }
      : {}),
    embedding_model_version: ensureMetadataString(
      point.embedding_model_version,
      'point.embedding_model_version',
      MAX_INDEX_EMBEDDING_MODEL_VERSION_CHARS,
    ),
    embedding_dimensions: ensureInteger(
      point.embedding_dimensions,
      'point.embedding_dimensions',
      1,
      MAX_INDEX_EMBEDDING_DIMENSIONS,
      true,
    ),
    normalization_version: ensureMetadataString(
      point.normalization_version,
      'point.normalization_version',
      MAX_INDEX_VERSION_CHARS,
    ),
    chunking_version: ensureMetadataString(
      point.chunking_version,
      'point.chunking_version',
      MAX_INDEX_VERSION_CHARS,
    ),
    index_schema_version: ensureMetadataString(
      point.index_schema_version,
      'point.index_schema_version',
      MAX_INDEX_VERSION_CHARS,
    ),
    ...(hasOwn(point, 'collection_name')
      ? {
          collection_name:
            point.collection_name === null
              ? null
              : ensureMetadataString(
                  point.collection_name,
                  'point.collection_name',
                  MAX_INDEX_COLLECTION_NAME_CHARS,
                ),
        }
      : {}),
    ...(hasOwn(point, 'collection_version')
      ? {
          collection_version:
            point.collection_version === null
              ? null
              : ensureMetadataString(
                  point.collection_version,
                  'point.collection_version',
                  MAX_INDEX_COLLECTION_VERSION_CHARS,
                ),
        }
      : {}),
  };
}

export function assertIndexMetadataScanResponse(
  value: unknown,
): IndexMetadataScanResponse {
  const response = ensureRecord(value, 'response', true);
  ensureKeys(response, SCAN_RESPONSE_KEYS, 'response', true);
  if (!hasOwn(response, 'points') || !hasOwn(response, 'request_id')) {
    invalidResponse('response is invalid');
  }
  if (
    !Array.isArray(response.points) ||
    response.points.length > MAX_INDEX_SCAN_LIMIT
  ) {
    invalidResponse('response.points is invalid');
  }
  return {
    points: (response.points as unknown[]).map(assertIndexPointMetadata),
    ...(hasOwn(response, 'next_cursor')
      ? {
          next_cursor: ensureScanCursor(
            response.next_cursor,
            'response.next_cursor',
            true,
          ),
        }
      : {}),
    request_id: ensureUuid(response.request_id, 'response.request_id', true),
  };
}

export function assertIndexJobUpsertResponse(
  value: unknown,
): IndexJobUpsertResponse {
  const response = assertIndexJobResponse(value);
  if (response.operation !== 'UPSERT')
    invalidResponse('upsert response operation is invalid');
  return response;
}

export function assertIndexJobDeleteResponse(
  value: unknown,
): IndexJobDeleteResponse {
  const response = assertIndexJobResponse(value);
  if (response.operation !== 'DELETE')
    invalidResponse('delete response operation is invalid');
  return response;
}
