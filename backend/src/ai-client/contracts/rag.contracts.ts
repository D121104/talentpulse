import { validate as isUuid } from 'uuid';
import { AiServiceError, AiServiceErrorCode } from '../ai-client.errors';

export const MAX_RECENT_HISTORY_ITEMS = 8;
export const MAX_RECENT_HISTORY_CHARS = 6000;
export const MAX_NORMALIZED_MESSAGE_LENGTH = 4000;
export const MAX_CV_SNAPSHOT_CHARS = 12000;
export const MAX_RETRIEVAL_ITEMS = 20;
export const MAX_CONTEXT_JOBS = 8;
export const MAX_FILTER_ITEMS = 30;
export const MAX_CLAIM_VALUE_KEYS = 20;

export enum RagDataScope {
  PublicActiveJobs = 'PUBLIC_ACTIVE_JOBS',
}

// These values are the literals accepted by ai-service/app/schemas/contracts.py.
export type RagIntent =
  | 'JOB_SEARCH'
  | 'CV_ANALYSIS'
  | 'CV_JOB_COMPARISON'
  | 'ADVICE';
export type AnswerStatus = 'COMPLETE' | 'DEGRADED' | 'NO_EVIDENCE';
export type AnswerBlockKind = 'ADVICE' | 'INFERENCE' | 'REFUSAL';

export interface IdentityFields {
  request_id: string;
  trace_id: string;
  operation_attempt_id: string;
  client_message_id: string;
  user_id: string;
  session_id: string;
}

export interface StructuredFilterState {
  company?: string | null;
  location?: string | null;
  level?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  skills: string[];
}

export interface ExplicitFilters {
  company_ids?: string[];
  locations?: string[];
  levels?: string[];
  skills_any?: string[];
  skills_all?: string[];
  salary_gte?: number | null;
  salary_lte?: number | null;
}

export interface ServicePolicy {
  data_scope: RagDataScope;
  max_candidates: 20;
  max_context_jobs?: 8 | null;
}

export interface RagRetrieveRequest {
  identity: IdentityFields;
  normalized_user_message: string;
  locale: string;
  recent_history: string[];
  filter_state: StructuredFilterState;
  explicit_filters: ExplicitFilters;
  filter_provenance: Record<string, string>;
  policy: ServicePolicy;
}

export interface RetrievalMetadata {
  [key: string]: string;
}

export interface RetrievalItem {
  job_id: string;
  rank: number;
  score: number;
  metadata: RetrievalMetadata;
}

export interface RagRetrieveResponse {
  request_id: string;
  trace_id: string;
  job_ids: string[];
  results: RetrievalItem[];
  applied_filters: Record<string, string>;
  unsupported_filters: string[];
}

export interface AuthorizedCvSnapshot {
  cv_id: string;
  content_hash: string;
  title?: string | null;
  target?: string | null;
  skills: string[];
  education: string[];
  experience: string[];
  certificates: string[];
  sanitized_text: string;
  consent_version?: string | null;
}

export interface CanonicalJobContext {
  job_id: string;
  title: string;
  company_name: string;
  location?: string | null;
  level?: string | null;
  salary?: { amount: number; currency: string } | null;
  skills: string[];
  start_date?: string | null;
  end_date?: string | null;
}

export interface RetrievalEvidence {
  job_id: string;
  rank: number;
  score: number;
  citation_key: string;
}

export interface RagGenerateRequest {
  identity: IdentityFields;
  normalized_user_message: string;
  intent: RagIntent;
  locale: string;
  filter_state: StructuredFilterState;
  authorized_cv_snapshot?: AuthorizedCvSnapshot | null;
  canonical_active_job_context: CanonicalJobContext[];
  retrieval_evidence: RetrievalEvidence[];
  explicit_filters: ExplicitFilters;
  policy: ServicePolicy;
  consent_version?: string | null;
}

export interface AnswerBlock {
  kind: AnswerBlockKind;
  text: string;
}

export type ClaimType =
  | 'JOB_TITLE'
  | 'COMPANY_NAME'
  | 'LOCATION'
  | 'SALARY'
  | 'LEVEL'
  | 'SKILL'
  | 'JOB_DATE'
  | 'CV_SKILL'
  | 'CV_EXPERIENCE'
  | 'CV_EDUCATION'
  | 'ADVICE'
  | 'INFERENCE';

export type ClaimValue =
  | Record<string, string | number | boolean | null>
  | string;

export interface TypedClaim {
  claim_id: string;
  type: ClaimType;
  subject_id?: string | null;
  value: ClaimValue;
  citation_keys: string[];
}

export interface RagGenerateResponse {
  request_id: string;
  trace_id: string;
  client_message_id: string;
  answer_status: AnswerStatus;
  answer_blocks: AnswerBlock[];
  claims: TypedClaim[];
  citation_keys: string[];
  referenced_job_ids: string[];
  filters: StructuredFilterState;
  state_delta: Record<string, unknown>;
  degraded: boolean;
}

const FILTER_STATE_KEYS = new Set([
  'company',
  'location',
  'level',
  'salary_min',
  'salary_max',
  'skills',
]);
const EXPLICIT_FILTER_KEYS = new Set([
  'company_ids',
  'locations',
  'levels',
  'skills_any',
  'skills_all',
  'salary_gte',
  'salary_lte',
]);
const CV_SNAPSHOT_KEYS = new Set([
  'cv_id',
  'content_hash',
  'title',
  'target',
  'skills',
  'education',
  'experience',
  'certificates',
  'sanitized_text',
  'consent_version',
]);
const JOB_CONTEXT_KEYS = new Set([
  'job_id',
  'title',
  'company_name',
  'location',
  'level',
  'salary',
  'skills',
  'start_date',
  'end_date',
]);
const EVIDENCE_KEYS = new Set(['job_id', 'rank', 'score', 'citation_key']);

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
    (response ? invalidResponse : invalidRequest)(`${field} is invalid`);
  }
  return value as Record<string, unknown>;
}

function ensureKeys(
  value: Record<string, unknown>,
  allowed: Set<string>,
  field: string,
  response = false,
): void {
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    (response ? invalidResponse : invalidRequest)(
      `${field} contains unknown fields`,
    );
  }
}

function ensureString(
  value: unknown,
  field: string,
  maxLength: number,
  response = false,
): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maxLength
  ) {
    (response ? invalidResponse : invalidRequest)(`${field} is invalid`);
  }
  return value as string;
}

function ensureNullableString(
  value: unknown,
  field: string,
  maxLength: number,
  response = false,
): string | null | undefined {
  if (value === undefined || value === null) return value as null | undefined;
  return ensureString(value, field, maxLength, response);
}

function ensurePlainString(
  value: unknown,
  field: string,
  response = false,
): string {
  if (typeof value !== 'string') {
    (response ? invalidResponse : invalidRequest)(`${field} is invalid`);
  }
  return value as string;
}

function ensureUuid(value: unknown, field: string, response = false): string {
  const stringValue = ensureString(value, field, 36, response);
  if (!isUuid(stringValue))
    (response ? invalidResponse : invalidRequest)(`${field} must be a UUID`);
  return stringValue;
}

function ensureHash(value: unknown, field: string, response = false): string {
  const hash = ensureString(value, field, 128, response);
  if (!/^[A-Fa-f0-9]{64,128}$/.test(hash)) {
    (response ? invalidResponse : invalidRequest)(`${field} is invalid`);
  }
  return hash;
}

function ensureIsoDate(
  value: unknown,
  field: string,
  response = false,
): string {
  const date = ensureString(value, field, 64, response);
  if (date.length < 10 || Number.isNaN(Date.parse(date))) {
    (response ? invalidResponse : invalidRequest)(`${field} is invalid`);
  }
  return date;
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
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    (response ? invalidResponse : invalidRequest)(`${field} is invalid`);
  }
  return value as number;
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
    (response ? invalidResponse : invalidRequest)(`${field} is invalid`);
  }
  return value as number;
}

function ensureClaimValue(
  value: unknown,
  field: string,
  response = false,
): Record<string, string | number | boolean | null> | string {
  if (typeof value === 'string') return value;
  const record = ensureBoundedRecord(
    value,
    field,
    MAX_CLAIM_VALUE_KEYS,
    response,
  );
  for (const [key, item] of Object.entries(record)) {
    if (
      typeof item !== 'string' &&
      typeof item !== 'number' &&
      typeof item !== 'boolean' &&
      item !== null
    ) {
      (response ? invalidResponse : invalidRequest)(
        `${field}.${key} is invalid`,
      );
    }
    if (typeof item === 'number' && !Number.isFinite(item)) {
      (response ? invalidResponse : invalidRequest)(
        `${field}.${key} is invalid`,
      );
    }
  }
  return record as Record<string, string | number | boolean | null>;
}

function ensureStringArray(
  value: unknown,
  field: string,
  maxItems: number,
  maxLength: number,
  response = false,
): string[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    (response ? invalidResponse : invalidRequest)(`${field} is invalid`);
  }
  return (value as unknown[]).map((item, index) =>
    ensureString(item, `${field}[${index}]`, maxLength, response),
  );
}

function ensureUuidArray(
  value: unknown,
  field: string,
  maxItems: number,
  response = false,
): string[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    (response ? invalidResponse : invalidRequest)(`${field} is invalid`);
  }
  return (value as unknown[]).map((item, index) =>
    ensureUuid(item, `${field}[${index}]`, response),
  );
}

function ensureBoundedRecord(
  value: unknown,
  field: string,
  maxKeys: number,
  response = false,
): Record<string, unknown> {
  const result = ensureRecord(value, field, response);
  if (Object.keys(result).length > maxKeys) {
    (response ? invalidResponse : invalidRequest)(`${field} is too large`);
  }
  return result;
}

function validateIdentity(value: unknown, response = false): IdentityFields {
  const identity = ensureRecord(value, 'identity', response);
  const required = [
    'request_id',
    'trace_id',
    'operation_attempt_id',
    'client_message_id',
    'user_id',
    'session_id',
  ];
  if (
    Object.keys(identity).length !== required.length ||
    required.some((key) => !(key in identity))
  ) {
    (response ? invalidResponse : invalidRequest)('identity is invalid');
  }
  return {
    request_id: ensureUuid(
      identity.request_id,
      'identity.request_id',
      response,
    ),
    trace_id: ensureUuid(identity.trace_id, 'identity.trace_id', response),
    operation_attempt_id: ensureUuid(
      identity.operation_attempt_id,
      'identity.operation_attempt_id',
      response,
    ),
    client_message_id: ensureUuid(
      identity.client_message_id,
      'identity.client_message_id',
      response,
    ),
    user_id: ensureUuid(identity.user_id, 'identity.user_id', response),
    session_id: ensureUuid(
      identity.session_id,
      'identity.session_id',
      response,
    ),
  };
}

function validateFilterState(
  value: unknown,
  field: string,
  response = false,
): StructuredFilterState {
  const filterState = ensureRecord(value, field, response);
  ensureKeys(filterState, FILTER_STATE_KEYS, field, response);
  ensureNullableString(filterState.company, `${field}.company`, 500, response);
  ensureNullableString(
    filterState.location,
    `${field}.location`,
    500,
    response,
  );
  ensureNullableString(filterState.level, `${field}.level`, 500, response);
  if (filterState.salary_min !== undefined && filterState.salary_min !== null)
    ensureNumber(
      filterState.salary_min,
      `${field}.salary_min`,
      0,
      10 ** 12,
      response,
    );
  if (filterState.salary_max !== undefined && filterState.salary_max !== null)
    ensureNumber(
      filterState.salary_max,
      `${field}.salary_max`,
      0,
      10 ** 12,
      response,
    );
  if (
    typeof filterState.salary_min === 'number' &&
    typeof filterState.salary_max === 'number' &&
    filterState.salary_min > filterState.salary_max
  ) {
    (response ? invalidResponse : invalidRequest)(
      `${field} salary range is invalid`,
    );
  }
  if (filterState.skills === null)
    (response ? invalidResponse : invalidRequest)(`${field}.skills is invalid`);
  const skills = ensureStringArray(
    filterState.skills === undefined ? [] : filterState.skills,
    `${field}.skills`,
    MAX_FILTER_ITEMS,
    500,
    response,
  );
  return { ...filterState, skills } as StructuredFilterState;
}

function validateExplicitFilters(
  value: unknown,
  response = false,
): ExplicitFilters {
  const filters = ensureBoundedRecord(
    value,
    'explicit_filters',
    MAX_FILTER_ITEMS,
    response,
  );
  ensureKeys(filters, EXPLICIT_FILTER_KEYS, 'explicit_filters', response);
  if (filters.company_ids !== undefined)
    ensureUuidArray(
      filters.company_ids,
      'explicit_filters.company_ids',
      MAX_FILTER_ITEMS,
      response,
    );
  for (const key of ['locations', 'levels', 'skills_any', 'skills_all']) {
    if (filters[key] !== undefined)
      ensureStringArray(
        filters[key],
        `explicit_filters.${key}`,
        MAX_FILTER_ITEMS,
        500,
        response,
      );
  }
  if (filters.salary_gte !== undefined && filters.salary_gte !== null)
    ensureNumber(
      filters.salary_gte,
      'explicit_filters.salary_gte',
      0,
      10 ** 12,
      response,
    );
  if (filters.salary_lte !== undefined && filters.salary_lte !== null)
    ensureNumber(
      filters.salary_lte,
      'explicit_filters.salary_lte',
      0,
      10 ** 12,
      response,
    );
  if (
    typeof filters.salary_gte === 'number' &&
    typeof filters.salary_lte === 'number' &&
    filters.salary_gte > filters.salary_lte
  ) {
    (response ? invalidResponse : invalidRequest)(
      'explicit_filters salary range is invalid',
    );
  }
  return filters as ExplicitFilters;
}

function validatePolicy(value: unknown, response = false): ServicePolicy {
  const policy = ensureRecord(value, 'policy', response);
  ensureKeys(
    policy,
    new Set(['data_scope', 'max_candidates', 'max_context_jobs']),
    'policy',
    response,
  );
  if (
    policy.data_scope !== RagDataScope.PublicActiveJobs ||
    policy.max_candidates !== 20 ||
    (policy.max_context_jobs !== undefined &&
      policy.max_context_jobs !== null &&
      policy.max_context_jobs !== 8)
  ) {
    (response ? invalidResponse : invalidRequest)('policy is invalid');
  }
  return {
    data_scope: RagDataScope.PublicActiveJobs,
    max_candidates: 20,
    ...(policy.max_context_jobs === undefined
      ? {}
      : {
          max_context_jobs:
            policy.max_context_jobs === null ? null : (8 as const),
        }),
  };
}

function validateRequestCommon(value: Record<string, unknown>): {
  identity: IdentityFields;
  normalized: string;
  locale: string;
  filterState: StructuredFilterState;
  explicitFilters: ExplicitFilters;
  policy: ServicePolicy;
  filterProvenance: Record<string, string>;
} {
  const identity = validateIdentity(value.identity);
  const normalized = ensureString(
    value.normalized_user_message,
    'normalized_user_message',
    MAX_NORMALIZED_MESSAGE_LENGTH,
  );
  const locale = ensureString(value.locale, 'locale', 16);
  if (locale.length < 2) invalidRequest('locale is invalid');
  const filterState = validateFilterState(value.filter_state, 'filter_state');
  const explicitFilters = validateExplicitFilters(
    value.explicit_filters,
    false,
  );
  const policy = validatePolicy(value.policy, false);
  const provenance = ensureBoundedRecord(
    value.filter_provenance === undefined ? {} : value.filter_provenance,
    'filter_provenance',
    MAX_FILTER_ITEMS,
  );
  for (const [key, item] of Object.entries(provenance))
    ensurePlainString(key, 'filter_provenance key');
  for (const [key, item] of Object.entries(provenance))
    ensureString(item, `filter_provenance.${key}`, 500);
  return {
    identity,
    normalized,
    locale,
    filterState,
    explicitFilters,
    policy,
    filterProvenance: provenance as Record<string, string>,
  };
}

export function assertRagRetrieveRequest(value: unknown): RagRetrieveRequest {
  const request = ensureRecord(value, 'request');
  const allowed = new Set([
    'identity',
    'normalized_user_message',
    'locale',
    'recent_history',
    'filter_state',
    'explicit_filters',
    'filter_provenance',
    'policy',
  ]);
  ensureKeys(request, allowed, 'request');
  const common = validateRequestCommon(request);
  const history = ensureStringArray(
    request.recent_history,
    'recent_history',
    MAX_RECENT_HISTORY_ITEMS,
    MAX_NORMALIZED_MESSAGE_LENGTH,
  );
  if (history.join('').length > MAX_RECENT_HISTORY_CHARS)
    invalidRequest('recent_history is too large');
  return {
    identity: common.identity,
    normalized_user_message: common.normalized,
    locale: common.locale,
    recent_history: history,
    filter_state: common.filterState,
    explicit_filters: common.explicitFilters,
    filter_provenance: common.filterProvenance,
    policy: common.policy,
  };
}

export function serializeRagRetrieveRequest(
  request: RagRetrieveRequest,
  traceId = request.identity.trace_id,
  operationAttemptId = request.identity.operation_attempt_id,
): RagRetrieveRequest {
  const validated = assertRagRetrieveRequest(request);
  return {
    identity: {
      ...validated.identity,
      trace_id: ensureUuid(traceId, 'identity.trace_id'),
      operation_attempt_id: ensureUuid(
        operationAttemptId,
        'identity.operation_attempt_id',
      ),
    },
    normalized_user_message: validated.normalized_user_message,
    locale: validated.locale,
    recent_history: [...validated.recent_history],
    filter_state: {
      ...validated.filter_state,
      skills: [...validated.filter_state.skills],
    },
    explicit_filters: { ...validated.explicit_filters },
    filter_provenance: { ...validated.filter_provenance },
    policy: { ...validated.policy },
  };
}

export function assertRagRetrieveResponse(value: unknown): RagRetrieveResponse {
  const response = ensureRecord(value, 'response', true);
  const allowed = new Set([
    'request_id',
    'trace_id',
    'job_ids',
    'results',
    'applied_filters',
    'unsupported_filters',
  ]);
  ensureKeys(response, allowed, 'response', true);
  const requestId = ensureUuid(response.request_id, 'request_id', true);
  const traceId = ensureUuid(response.trace_id, 'trace_id', true);
  const jobIds = ensureUuidArray(
    response.job_ids,
    'job_ids',
    MAX_RETRIEVAL_ITEMS,
    true,
  );
  if (
    !Array.isArray(response.results) ||
    response.results.length > MAX_RETRIEVAL_ITEMS
  )
    invalidResponse('results is invalid');
  const results = response.results.map((raw, index) => {
    const item = ensureRecord(raw, `results[${index}]`, true);
    ensureKeys(
      item,
      new Set(['job_id', 'rank', 'score', 'metadata']),
      `results[${index}]`,
      true,
    );
    const metadata = ensureBoundedRecord(
      item.metadata === undefined ? {} : item.metadata,
      `results[${index}].metadata`,
      20,
      true,
    );
    Object.entries(metadata).forEach(([key, itemValue]) =>
      ensurePlainString(itemValue, `results[${index}].metadata.${key}`, true),
    );
    return {
      job_id: ensureUuid(item.job_id, `results[${index}].job_id`, true),
      rank: ensureInteger(item.rank, `results[${index}].rank`, 1, 50, true),
      score: ensureNumber(item.score, `results[${index}].score`, -1, 1, true),
      metadata: metadata as RetrievalMetadata,
    };
  });
  const applied = ensureBoundedRecord(
    response.applied_filters === undefined ? {} : response.applied_filters,
    'applied_filters',
    30,
    true,
  );
  Object.entries(applied).forEach(([key, item]) =>
    ensurePlainString(item, `applied_filters.${key}`, true),
  );
  const unsupported = ensureStringArray(
    response.unsupported_filters === undefined
      ? []
      : response.unsupported_filters,
    'unsupported_filters',
    30,
    500,
    true,
  );
  return {
    request_id: requestId,
    trace_id: traceId,
    job_ids: jobIds,
    results,
    applied_filters: applied as Record<string, string>,
    unsupported_filters: unsupported,
  };
}

function validateCvSnapshot(value: unknown): AuthorizedCvSnapshot {
  const snapshot = ensureRecord(value, 'authorized_cv_snapshot');
  ensureKeys(snapshot, CV_SNAPSHOT_KEYS, 'authorized_cv_snapshot');
  const sanitizedText = ensureString(
    snapshot.sanitized_text,
    'authorized_cv_snapshot.sanitized_text',
    MAX_CV_SNAPSHOT_CHARS,
  );
  const skills = ensureStringArray(
    snapshot.skills,
    'authorized_cv_snapshot.skills',
    MAX_FILTER_ITEMS,
    500,
  );
  const education = ensureStringArray(
    snapshot.education,
    'authorized_cv_snapshot.education',
    MAX_FILTER_ITEMS,
    500,
  );
  const experience = ensureStringArray(
    snapshot.experience,
    'authorized_cv_snapshot.experience',
    MAX_FILTER_ITEMS,
    500,
  );
  const certificates = ensureStringArray(
    snapshot.certificates,
    'authorized_cv_snapshot.certificates',
    MAX_FILTER_ITEMS,
    500,
  );
  return {
    cv_id: ensureUuid(snapshot.cv_id, 'authorized_cv_snapshot.cv_id'),
    content_hash: ensureHash(
      snapshot.content_hash,
      'authorized_cv_snapshot.content_hash',
    ),
    ...(snapshot.title === undefined
      ? {}
      : {
          title:
            snapshot.title === null
              ? null
              : ensureString(
                  snapshot.title,
                  'authorized_cv_snapshot.title',
                  500,
                ),
        }),
    ...(snapshot.target === undefined
      ? {}
      : {
          target:
            snapshot.target === null
              ? null
              : ensureString(
                  snapshot.target,
                  'authorized_cv_snapshot.target',
                  500,
                ),
        }),
    skills,
    education,
    experience,
    certificates,
    sanitized_text: sanitizedText,
    ...(snapshot.consent_version === undefined
      ? {}
      : {
          consent_version:
            snapshot.consent_version === null
              ? null
              : ensureString(
                  snapshot.consent_version,
                  'authorized_cv_snapshot.consent_version',
                  80,
                ),
        }),
  };
}

function validateCanonicalJob(
  value: unknown,
  index: number,
): CanonicalJobContext {
  const job = ensureRecord(value, `canonical_active_job_context[${index}]`);
  ensureKeys(job, JOB_CONTEXT_KEYS, `canonical_active_job_context[${index}]`);
  if (job.salary !== undefined && job.salary !== null) {
    const salary = ensureRecord(
      job.salary,
      `canonical_active_job_context[${index}].salary`,
    );
    ensureKeys(
      salary,
      new Set(['amount', 'currency']),
      `canonical_active_job_context[${index}].salary`,
    );
    ensureNumber(
      salary.amount,
      `canonical_active_job_context[${index}].salary.amount`,
      0,
      10 ** 12,
    );
    ensureString(
      salary.currency,
      `canonical_active_job_context[${index}].salary.currency`,
      16,
    );
  }
  return {
    job_id: ensureUuid(
      job.job_id,
      `canonical_active_job_context[${index}].job_id`,
    ),
    title: ensureString(
      job.title,
      `canonical_active_job_context[${index}].title`,
      500,
    ),
    company_name: ensureString(
      job.company_name,
      `canonical_active_job_context[${index}].company_name`,
      500,
    ),
    ...(job.location === undefined
      ? {}
      : {
          location:
            job.location === null
              ? null
              : ensureString(
                  job.location,
                  `canonical_active_job_context[${index}].location`,
                  500,
                ),
        }),
    ...(job.level === undefined
      ? {}
      : {
          level:
            job.level === null
              ? null
              : ensureString(
                  job.level,
                  `canonical_active_job_context[${index}].level`,
                  500,
                ),
        }),
    ...(job.salary === undefined
      ? {}
      : {
          salary:
            job.salary === null
              ? null
              : (job.salary as { amount: number; currency: string }),
        }),
    skills: ensureStringArray(
      job.skills,
      `canonical_active_job_context[${index}].skills`,
      MAX_FILTER_ITEMS,
      500,
    ),
    ...(job.start_date === undefined
      ? {}
      : {
          start_date:
            job.start_date === null
              ? null
              : ensureIsoDate(
                  job.start_date,
                  `canonical_active_job_context[${index}].start_date`,
                ),
        }),
    ...(job.end_date === undefined
      ? {}
      : {
          end_date:
            job.end_date === null
              ? null
              : ensureIsoDate(
                  job.end_date,
                  `canonical_active_job_context[${index}].end_date`,
                ),
        }),
  };
}

function validateEvidence(value: unknown, index: number): RetrievalEvidence {
  const evidence = ensureRecord(value, `retrieval_evidence[${index}]`);
  ensureKeys(evidence, EVIDENCE_KEYS, `retrieval_evidence[${index}]`);
  return {
    job_id: ensureUuid(evidence.job_id, `retrieval_evidence[${index}].job_id`),
    rank: ensureInteger(
      evidence.rank,
      `retrieval_evidence[${index}].rank`,
      1,
      50,
    ),
    score: ensureNumber(
      evidence.score,
      `retrieval_evidence[${index}].score`,
      -1,
      1,
    ),
    citation_key: ensureString(
      evidence.citation_key,
      `retrieval_evidence[${index}].citation_key`,
      64,
    ),
  };
}

export function assertRagGenerateRequest(value: unknown): RagGenerateRequest {
  const request = ensureRecord(value, 'request');
  const allowed = new Set([
    'identity',
    'normalized_user_message',
    'intent',
    'locale',
    'filter_state',
    'authorized_cv_snapshot',
    'canonical_active_job_context',
    'retrieval_evidence',
    'explicit_filters',
    'policy',
    'consent_version',
  ]);
  ensureKeys(request, allowed, 'request');
  const common = validateRequestCommon(request);
  if (
    !['JOB_SEARCH', 'CV_ANALYSIS', 'CV_JOB_COMPARISON', 'ADVICE'].includes(
      String(request.intent),
    )
  )
    invalidRequest('intent is invalid');
  const intent = request.intent as RagIntent;
  const requiresCv = intent === 'CV_ANALYSIS' || intent === 'CV_JOB_COMPARISON';
  if (
    requiresCv &&
    (request.authorized_cv_snapshot === undefined ||
      request.authorized_cv_snapshot === null ||
      request.consent_version === undefined ||
      request.consent_version === null)
  )
    invalidRequest('consented CV snapshot is required');
  if (
    !requiresCv &&
    ((request.authorized_cv_snapshot !== undefined &&
      request.authorized_cv_snapshot !== null) ||
      (request.consent_version !== undefined &&
        request.consent_version !== null))
  )
    invalidRequest('CV context is not allowed for this intent');
  const cv =
    request.authorized_cv_snapshot === undefined ||
    request.authorized_cv_snapshot === null
      ? undefined
      : validateCvSnapshot(request.authorized_cv_snapshot);
  const consent =
    request.consent_version === undefined || request.consent_version === null
      ? undefined
      : ensureString(request.consent_version, 'consent_version', 80);
  if (
    cv !== undefined &&
    cv.consent_version !== undefined &&
    cv.consent_version !== null &&
    cv.consent_version !== consent
  )
    invalidRequest('consent_version must match the CV snapshot');
  if (
    !Array.isArray(request.canonical_active_job_context) ||
    request.canonical_active_job_context.length > MAX_CONTEXT_JOBS
  )
    invalidRequest('canonical_active_job_context is invalid');
  if (
    !Array.isArray(request.retrieval_evidence) ||
    request.retrieval_evidence.length > MAX_RETRIEVAL_ITEMS
  )
    invalidRequest('retrieval_evidence is invalid');
  return {
    identity: common.identity,
    normalized_user_message: common.normalized,
    intent,
    locale: common.locale,
    filter_state: common.filterState,
    ...(cv === undefined ? {} : { authorized_cv_snapshot: cv }),
    canonical_active_job_context:
      request.canonical_active_job_context.map(validateCanonicalJob),
    retrieval_evidence: request.retrieval_evidence.map(validateEvidence),
    explicit_filters: common.explicitFilters,
    policy: common.policy,
    ...(consent === undefined ? {} : { consent_version: consent }),
  };
}

export function serializeRagGenerateRequest(
  request: RagGenerateRequest,
  traceId = request.identity.trace_id,
  operationAttemptId = request.identity.operation_attempt_id,
): RagGenerateRequest {
  const validated = assertRagGenerateRequest(request);
  return {
    ...validated,
    identity: {
      ...validated.identity,
      trace_id: ensureUuid(traceId, 'identity.trace_id'),
      operation_attempt_id: ensureUuid(
        operationAttemptId,
        'identity.operation_attempt_id',
      ),
    },
    canonical_active_job_context: validated.canonical_active_job_context.map(
      (job) => ({ ...job, skills: [...job.skills] }),
    ),
    retrieval_evidence: validated.retrieval_evidence.map((item) => ({
      ...item,
    })),
    explicit_filters: { ...validated.explicit_filters },
    policy: { ...validated.policy },
  };
}

export function assertRagGenerateResponse(value: unknown): RagGenerateResponse {
  const response = ensureRecord(value, 'response', true);
  const allowed = new Set([
    'request_id',
    'trace_id',
    'client_message_id',
    'answer_status',
    'answer_blocks',
    'claims',
    'citation_keys',
    'referenced_job_ids',
    'filters',
    'state_delta',
    'degraded',
  ]);
  ensureKeys(response, allowed, 'response', true);
  const required = [
    'request_id',
    'trace_id',
    'client_message_id',
    'answer_status',
    'answer_blocks',
    'claims',
    'citation_keys',
    'referenced_job_ids',
    'filters',
    'degraded',
  ];
  if (required.some((key) => !(key in response)))
    invalidResponse('response is invalid');
  const answerStatus = String(response.answer_status);
  if (!['COMPLETE', 'DEGRADED', 'NO_EVIDENCE'].includes(answerStatus))
    invalidResponse('answer_status is invalid');
  if (
    !Array.isArray(response.answer_blocks) ||
    response.answer_blocks.length > 20
  )
    invalidResponse('answer_blocks is invalid');
  const answerBlocks = response.answer_blocks.map((raw, index) => {
    const block = ensureRecord(raw, `answer_blocks[${index}]`, true);
    ensureKeys(
      block,
      new Set(['kind', 'text']),
      `answer_blocks[${index}]`,
      true,
    );
    if (!['ADVICE', 'INFERENCE', 'REFUSAL'].includes(String(block.kind)))
      invalidResponse('answer block kind is invalid');
    return {
      kind: block.kind as AnswerBlockKind,
      text: ensureString(
        block.text,
        `answer_blocks[${index}].text`,
        2000,
        true,
      ),
    };
  });
  if (!Array.isArray(response.claims) || response.claims.length > 50)
    invalidResponse('claims is invalid');
  const claims = response.claims.map((raw, index) => {
    const claim = ensureRecord(raw, `claims[${index}]`, true);
    ensureKeys(
      claim,
      new Set(['claim_id', 'type', 'subject_id', 'value', 'citation_keys']),
      `claims[${index}]`,
      true,
    );
    const claimType = String(claim.type);
    const claimTypes: ClaimType[] = [
      'JOB_TITLE',
      'COMPANY_NAME',
      'LOCATION',
      'SALARY',
      'LEVEL',
      'SKILL',
      'JOB_DATE',
      'CV_SKILL',
      'CV_EXPERIENCE',
      'CV_EDUCATION',
      'ADVICE',
      'INFERENCE',
    ];
    if (!claimTypes.includes(claimType as ClaimType))
      invalidResponse('claim type is invalid');
    const claimValue = ensureClaimValue(
      claim.value,
      `claims[${index}].value`,
      true,
    );
    return {
      claim_id: ensureString(
        claim.claim_id,
        `claims[${index}].claim_id`,
        64,
        true,
      ),
      type: claimType as ClaimType,
      ...(claim.subject_id === undefined || claim.subject_id === null
        ? {}
        : {
            subject_id: ensureUuid(
              claim.subject_id,
              `claims[${index}].subject_id`,
              true,
            ),
          }),
      value: claimValue,
      citation_keys: ensureStringArray(
        claim.citation_keys,
        `claims[${index}].citation_keys`,
        10,
        64,
        true,
      ),
    };
  });
  const citationKeys = ensureStringArray(
    response.citation_keys ?? [],
    'citation_keys',
    50,
    64,
    true,
  );
  const referencedJobIds = ensureUuidArray(
    response.referenced_job_ids ?? [],
    'referenced_job_ids',
    MAX_RETRIEVAL_ITEMS,
    true,
  );
  const filters = validateFilterState(response.filters, 'filters', true);
  const stateDelta = ensureBoundedRecord(
    response.state_delta ?? {},
    'state_delta',
    MAX_FILTER_ITEMS,
    true,
  );
  if (typeof response.degraded !== 'boolean')
    invalidResponse('degraded is invalid');
  return {
    request_id: ensureUuid(response.request_id, 'request_id', true),
    trace_id: ensureUuid(response.trace_id, 'trace_id', true),
    client_message_id: ensureUuid(
      response.client_message_id,
      'client_message_id',
      true,
    ),
    answer_status: answerStatus as AnswerStatus,
    answer_blocks: answerBlocks,
    claims,
    citation_keys: citationKeys,
    referenced_job_ids: referencedJobIds,
    filters,
    state_delta: stateDelta,
    degraded: response.degraded,
  };
}
