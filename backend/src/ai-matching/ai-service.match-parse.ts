import {
  AiServiceError,
  JobIndexIdentity,
  assertExactKeys,
  assertParseStringArray,
  assertStringArray,
  isRecord,
  isSafeString,
  isScore,
  isString,
  isUuid,
  isVersion,
} from './ai-service.common';

export type AiMediaType =
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export interface CVParseRequest {
  cv_id: string;
  filename: string;
  media_type: AiMediaType;
  content_base64: string;
  content_version: number;
}
export interface CVParseResponse {
  cv_id: string;
  content_version: number;
  media_type: AiMediaType;
  content_sha256: string;
  extracted_text: string;
  text_char_count: number;
  skills?: string[];
  education?: string[];
  experience?: string[];
  certificates?: string[];
  warnings?: string[];
  parser_version: string;
}
export type AiExperienceLevel =
  | 'intern'
  | 'junior'
  | 'mid'
  | 'senior'
  | 'lead'
  | 'principal';
export type AiWorkMode = 'onsite' | 'hybrid' | 'remote';
export interface CVProfileSnapshot {
  skills: string[];
  years_experience: number | null;
  level: AiExperienceLevel | null;
  location: string | null;
  work_modes: AiWorkMode[];
}
export interface JobProfileSnapshot {
  required_skills: string[];
  preferred_skills: string[];
  min_years_experience: number | null;
  max_years_experience: number | null;
  level: AiExperienceLevel | null;
  location: string | null;
  work_modes: AiWorkMode[];
}
export type MatchIdentity = JobIndexIdentity;
export interface MatchRequest {
  identity: MatchIdentity;
  cv_id: string;
  job_id: string;
  content_hash: string;
  content_version: string;
  job_source_version: string;
  idempotency_key: string;
  locale: string;
  candidate: CVProfileSnapshot;
  job: JobProfileSnapshot;
}
export interface MatchComponent {
  score: number;
  weight: number;
  available: boolean;
  evidence: string[];
}
export interface MatchResponse {
  request_id: string;
  trace_id: string;
  operation_attempt_id: string;
  cv_id: string;
  job_id: string;
  content_hash: string;
  content_version: string;
  job_source_version: string;
  idempotency_key: string;
  locale: string;
  overall_score: number;
  components: Record<string, MatchComponent>;
  matched_skills: string[];
  missing_required_skills: string[];
  strengths: string[];
  gaps: string[];
  explanation: string;
  degraded: boolean;
  scoring_version: string;
  semantic_component_version: string;
}

export function validateParseRequest(request: CVParseRequest): void {
  const extension = isString(request?.filename)
    ? request.filename.toLowerCase()
    : '';
  if (
    !request ||
    !isUuid(request.cv_id) ||
    !isString(request.filename) ||
    request.filename.length < 1 ||
    request.filename.length > 255 ||
    !isString(request.content_base64) ||
    request.content_base64.length < 4 ||
    request.content_base64.length > 7000000 ||
    !Number.isInteger(request.content_version) ||
    request.content_version < 1 ||
    request.content_version > 2147483647 ||
    (request.media_type === 'application/pdf' && !extension.endsWith('.pdf')) ||
    (request.media_type ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' &&
      !extension.endsWith('.docx'))
  ) {
    throw new AiServiceError('AI_INVALID_RESPONSE', 'Invalid parse request');
  }
}

export function validateMatchRequest(request: MatchRequest): void {
  if (
    !request ||
    !isRecord(request) ||
    !isRecord(request.identity) ||
    !isUuid(request.cv_id) ||
    !isUuid(request.job_id)
  ) {
    throw new AiServiceError('AI_INVALID_RESPONSE', 'Invalid match request');
  }
  assertExactKeys(request, [
    'identity',
    'cv_id',
    'job_id',
    'content_hash',
    'content_version',
    'job_source_version',
    'idempotency_key',
    'locale',
    'candidate',
    'job',
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
    !isString(request.content_hash) ||
    !/^[0-9a-f]{64}$/.test(request.content_hash) ||
    !isVersion(request.content_version) ||
    !isVersion(request.job_source_version) ||
    !isString(request.idempotency_key) ||
    request.idempotency_key.length < 1 ||
    request.idempotency_key.length > 128 ||
    request.idempotency_key !== request.idempotency_key.trim() ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(request.idempotency_key) ||
    !isString(request.locale) ||
    request.locale.length < 2 ||
    request.locale.length > 16 ||
    !/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{2,8})?$/.test(request.locale)
  ) {
    throw new AiServiceError('AI_INVALID_RESPONSE', 'Invalid match request');
  }
  validateProfile(request.candidate, false);
  validateProfile(request.job, true);
}

function validateProfile(value: unknown, isJob: boolean): void {
  if (!isRecord(value))
    throw new AiServiceError('AI_INVALID_RESPONSE', 'Invalid match request');
  const keys = isJob
    ? [
        'required_skills',
        'preferred_skills',
        'min_years_experience',
        'max_years_experience',
        'level',
        'location',
        'work_modes',
      ]
    : ['skills', 'years_experience', 'level', 'location', 'work_modes'];
  assertExactKeys(value, keys);
  const skillValues = isJob
    ? [value.required_skills, value.preferred_skills]
    : [value.skills];
  for (const item of skillValues) assertStringArray(item, 200);
  const years = isJob
    ? [value.min_years_experience, value.max_years_experience]
    : [value.years_experience];
  if (
    years.some(
      (item) =>
        item !== null &&
        (typeof item !== 'number' ||
          !Number.isFinite(item) ||
          item < 0 ||
          item > 80),
    )
  ) {
    throw new AiServiceError('AI_INVALID_RESPONSE', 'Invalid match request');
  }
  if (
    isJob &&
    years[0] !== null &&
    years[1] !== null &&
    (years[1] as number) < (years[0] as number)
  ) {
    throw new AiServiceError('AI_INVALID_RESPONSE', 'Invalid match request');
  }
  if (
    value.level !== null &&
    !['intern', 'junior', 'mid', 'senior', 'lead', 'principal'].includes(
      String(value.level),
    )
  ) {
    throw new AiServiceError('AI_INVALID_RESPONSE', 'Invalid match request');
  }
  if (
    value.location !== null &&
    (!isString(value.location) ||
      value.location.length < 1 ||
      value.location.length > 160)
  ) {
    throw new AiServiceError('AI_INVALID_RESPONSE', 'Invalid match request');
  }
  if (
    !Array.isArray(value.work_modes) ||
    value.work_modes.length > 3 ||
    value.work_modes.some(
      (item) => !['onsite', 'hybrid', 'remote'].includes(String(item)),
    )
  ) {
    throw new AiServiceError('AI_INVALID_RESPONSE', 'Invalid match request');
  }
}

export function validateParseResponse(
  value: unknown,
  request: CVParseRequest,
): CVParseResponse {
  if (!isRecord(value))
    throw new AiServiceError('AI_INVALID_RESPONSE', 'Invalid parse response');
  assertExactKeys(value, [
    'cv_id',
    'content_version',
    'media_type',
    'content_sha256',
    'extracted_text',
    'text_char_count',
    'skills',
    'education',
    'experience',
    'certificates',
    'warnings',
    'parser_version',
  ]);
  if (
    value.cv_id !== request.cv_id ||
    !isUuid(value.cv_id) ||
    value.content_version !== request.content_version ||
    value.media_type !== request.media_type ||
    !isString(value.content_sha256) ||
    !/^[0-9a-f]{64}$/.test(value.content_sha256) ||
    !isSafeString(value.extracted_text, 0, 100000) ||
    typeof value.text_char_count !== 'number' ||
    !Number.isInteger(value.text_char_count) ||
    value.text_char_count < 0 ||
    value.text_char_count > 100000 ||
    value.text_char_count !== value.extracted_text.length ||
    !isSafeString(value.parser_version, 1, 80)
  ) {
    throw new AiServiceError('AI_INVALID_RESPONSE', 'Invalid parse response');
  }
  for (const field of [
    'skills',
    'education',
    'experience',
    'certificates',
  ] as const) {
    if (field in value) assertParseStringArray(value[field], 100);
  }
  if ('warnings' in value) assertParseStringArray(value.warnings, 20, 1000);
  return value as unknown as CVParseResponse;
}

export function validateMatchResponse(
  value: unknown,
  request: MatchRequest,
): MatchResponse {
  if (!isRecord(value))
    throw new AiServiceError('AI_INVALID_RESPONSE', 'Invalid match response');
  assertExactKeys(value, [
    'request_id',
    'trace_id',
    'operation_attempt_id',
    'cv_id',
    'job_id',
    'content_hash',
    'content_version',
    'job_source_version',
    'idempotency_key',
    'locale',
    'overall_score',
    'components',
    'matched_skills',
    'missing_required_skills',
    'strengths',
    'gaps',
    'explanation',
    'degraded',
    'scoring_version',
    'semantic_component_version',
  ]);
  if (
    value.request_id !== request.identity.request_id ||
    value.trace_id !== request.identity.trace_id ||
    value.operation_attempt_id !== request.identity.operation_attempt_id ||
    value.cv_id !== request.cv_id ||
    value.job_id !== request.job_id ||
    value.content_hash !== request.content_hash ||
    value.content_version !== request.content_version ||
    value.job_source_version !== request.job_source_version ||
    value.idempotency_key !== request.idempotency_key ||
    value.locale !== request.locale ||
    !isUuid(value.request_id) ||
    !isUuid(value.trace_id) ||
    !isUuid(value.operation_attempt_id) ||
    !isUuid(value.cv_id) ||
    !isUuid(value.job_id) ||
    !isString(value.content_hash) ||
    !/^[0-9a-f]{64}$/.test(value.content_hash) ||
    !isVersion(value.content_version) ||
    !isVersion(value.job_source_version) ||
    !isString(value.idempotency_key) ||
    value.idempotency_key.length < 1 ||
    value.idempotency_key.length > 128 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value.idempotency_key) ||
    !isString(value.locale) ||
    !/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{2,8})?$/.test(value.locale) ||
    !isScore(value.overall_score) ||
    !isRecord(value.components) ||
    Object.keys(value.components).length > 20
  )
    throw new AiServiceError('AI_INVALID_RESPONSE', 'Invalid match response');
  for (const component of Object.values(value.components)) {
    if (!isRecord(component))
      throw new AiServiceError(
        'AI_INVALID_RESPONSE',
        'Invalid match component',
      );
    assertExactKeys(component, ['score', 'weight', 'available', 'evidence']);
    if (
      !isScore(component.score) ||
      !isScore(component.weight) ||
      typeof component.available !== 'boolean'
    )
      throw new AiServiceError(
        'AI_INVALID_RESPONSE',
        'Invalid match component',
      );
    assertStringArray(component.evidence, 20);
  }
  assertStringArray(value.matched_skills, 200);
  assertStringArray(value.missing_required_skills, 200);
  assertStringArray(value.strengths, 20);
  assertStringArray(value.gaps, 20);
  if (
    !isString(value.explanation) ||
    value.explanation.length > 2000 ||
    typeof value.degraded !== 'boolean' ||
    !isString(value.scoring_version) ||
    !isString(value.semantic_component_version)
  )
    throw new AiServiceError('AI_INVALID_RESPONSE', 'Invalid match response');
  return value as unknown as MatchResponse;
}
