import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { createPrivateKey, createSign, randomUUID } from 'crypto';

const DEFAULT_CV_PARSE_SCOPE = 'cv:parse';
const DEFAULT_CV_MATCH_SCOPE = 'cv:match';
const DEFAULT_CV_GENERATE_SCOPE = 'cv:generate';
const DEFAULT_RAG_RETRIEVE_SCOPE = 'rag:retrieve';
const DEFAULT_RAG_GENERATE_SCOPE = 'rag:generate';
const DEFAULT_JOB_INDEX_SCOPE = 'jobs:index';
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

export interface CvDraftCandidateExperience {
  company_name: string | null;
  position: string | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
}
export interface CvDraftCandidateEducation {
  school_name: string | null;
  degree: string | null;
  major: string | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
}
export interface CvDraftCandidateProject {
  project_name: string;
  role: string | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
  technologies: string[];
}
export interface CvDraftProject extends CvDraftCandidateProject {
  source_index: number;
  bullets: string[];
}

function ownedSkillVariants(literal: string): string[] {
  const pairs = [
    ['Good communication', 'Giao tiếp tốt'],
    ['Problem Solving', 'Giải quyết vấn đề'],
    ['Team collaboration', 'Hợp tác nhóm'],
    ['English', 'Tiếng Anh'],
  ];
  const key = (value: string) =>
    value.trim().replace(/\s+/g, ' ').toLowerCase();
  const parts = literal.match(/^(\s*)([^()]*?)(\s*\([^()]*\))?(\s*)$/);
  if (!parts) return [literal];
  const [, leading, label, suffix = '', trailing] = parts;
  const pair = pairs.find((values) =>
    values.some((value) => key(value) === key(label)),
  );
  if (!pair) return [literal];
  const sourceIndex = pair.findIndex((value) => key(value) === key(label));
  return [literal, `${leading}${pair[1 - sourceIndex]}${suffix}${trailing}`];
}

export function matchOwnedSkillMembers(
  text: string,
  owned: string[],
  translatable: string[] = owned,
): string[] | null {
  const literals = [...new Set(owned)]
    .filter(Boolean)
    .flatMap((original) =>
      (translatable.includes(original)
        ? ownedSkillVariants(original)
        : [original]
      ).map((display) => ({ original, display })),
    )
    .sort((a, b) => b.display.length - a.display.length);
  const memo = new Map<number, string[] | null>();
  const match = (offset: number): string[] | null => {
    if (offset === text.length) return [];
    if (memo.has(offset)) return memo.get(offset) ?? null;
    for (const { original, display } of literals) {
      if (!text.startsWith(display, offset)) continue;
      const end = offset + display.length;
      if (end === text.length) return [original];
      if (!text.startsWith('; ', end)) continue;
      const rest = match(end + 2);
      if (rest) return [original, ...rest];
    }
    memo.set(offset, null);
    return null;
  };
  return match(0);
}

export function ownedSkillLiterals(candidate: CvDraftCandidate): string[] {
  return [
    ...candidate.skills,
    ...candidate.certificates.filter((value) =>
      /\b(?:toeic|ielts|toefl)\b/i.test(value),
    ),
  ];
}
export interface CvDraftCandidate {
  candidate_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  link: string | null;
  address: string | null;
  headline: string | null;
  career_objective: string | null;
  skills: string[];
  experience: CvDraftCandidateExperience[];
  education: CvDraftCandidateEducation[];
  projects: CvDraftCandidateProject[];
  certificates: string[];
  activities: string[];
  awards: string[];
}
export interface CvDraftJob {
  job_id: string;
  title: string;
  company_name: string | null;
  description: string | null;
  location: string | null;
  work_mode: string | null;
  level: string | null;
  required_skills: string[];
  preferred_skills: string[];
}
export interface CvDraftRequest {
  identity: JobIndexIdentity;
  candidate: CvDraftCandidate;
  job: CvDraftJob;
  template_type: 'template1' | 'template2';
  locale: string;
  source_version: string;
  content_version: number;
  consent_version?: string | null;
}
export interface CvDraftResponse {
  request_id: string;
  trace_id: string;
  operation_attempt_id: string;
  candidate_id: string;
  target_job_id: string;
  template_type: 'template1' | 'template2';
  generation_mode: 'EDITOR_ONLY';
  full_name: string;
  title: string;
  position: string | null;
  email: string | null;
  phone: string | null;
  link: string | null;
  address: string | null;
  career_objective: string | null;
  education: CvDraftCandidateEducation[];
  projects: CvDraftProject[];
  work_experience: Array<
    CvDraftCandidateExperience & { source_index: number; bullets: string[] }
  >;
  skills: Array<{ name: string; description: string | null }>;
  activities: string[];
  certificates: string[];
  awards: string[];
  section_order: string[];
  warnings: string[];
  generated_by: string;
  source_version: string;
  content_version: number;
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

export interface JobIndexIdentity {
  request_id: string;
  trace_id: string;
  operation_attempt_id: string;
}

export type MatchIdentity = JobIndexIdentity;

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

export type AiServiceErrorCode =
  | 'AI_SERVICE_NOT_CONFIGURED'
  | 'AI_SERVICE_UNAVAILABLE'
  | 'AI_SERVICE_TIMEOUT'
  | 'AI_SERVICE_AUTH_FAILED'
  | 'AI_SERVICE_REJECTED'
  | 'AI_SERVICE_RATE_LIMITED'
  | 'AI_INVALID_RESPONSE';
export class AiServiceError extends Error {
  constructor(
    public readonly code: AiServiceErrorCode,
    message: string = code,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'AiServiceError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isString(value: unknown): value is string {
  return typeof value === 'string';
}
function isSafeString(
  value: unknown,
  min: number,
  max: number,
): value is string {
  return (
    isString(value) &&
    value.length >= min &&
    value.length <= max &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  );
}
function isVersion(value: unknown): value is string {
  return (
    isString(value) &&
    value.length >= 1 &&
    value.length <= 128 &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
  );
}
function isOptionalText(value: unknown, maxLength: number): boolean {
  return (
    value === null ||
    (isString(value) && value.length <= maxLength && value.trim().length > 0)
  );
}
function isOptionalIsoDate(value: unknown): value is string | null {
  return (
    value === null ||
    (isString(value) &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value) &&
      !Number.isNaN(Date.parse(value)))
  );
}

function isOptionalEpochMs(value: unknown): value is number | null {
  return (
    value === null || (typeof value === 'number' && Number.isSafeInteger(value))
  );
}

function datesMatchEpoch(date: string | null, epochMs: number | null): boolean {
  return date === null ? epochMs === null : epochMs === Date.parse(date);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
function isScore(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}
function assertExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): void {
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new AiServiceError(
      'AI_INVALID_RESPONSE',
      'AI response contains unsupported fields',
    );
  }
}
function assertStringArray(
  value: unknown,
  max: number,
): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    value.length > max ||
    value.some((item) => !isString(item))
  ) {
    throw new AiServiceError(
      'AI_INVALID_RESPONSE',
      'AI response contains an invalid list',
    );
  }
}
function assertParseStringArray(
  value: unknown,
  maxItems: number,
  maxItemLength = 500,
): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    value.length > maxItems ||
    value.some((item) => !isSafeString(item, 1, maxItemLength))
  ) {
    throw new AiServiceError('AI_INVALID_RESPONSE', 'Invalid parse response');
  }
}

function base64Url(value: Buffer | string): string {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}
function ecdsaDerToJose(signature: Buffer): Buffer {
  let offset = 2;
  if (signature[1] & 0x80) offset += signature[1] & 0x7f;
  if (signature[offset] !== 0x02) throw new Error('Invalid ECDSA signature');
  const rLength = signature[offset + 1];
  const r = signature.subarray(offset + 2, offset + 2 + rLength);
  offset += 2 + rLength;
  if (signature[offset] !== 0x02) throw new Error('Invalid ECDSA signature');
  const sLength = signature[offset + 1];
  const s = signature.subarray(offset + 2, offset + 2 + sLength);
  const pad = (part: Buffer) => {
    const unpadded = part[0] === 0 ? part.subarray(1) : part;
    return Buffer.concat([
      Buffer.alloc(Math.max(0, 32 - unpadded.length)),
      unpadded,
    ]);
  };
  return Buffer.concat([pad(r), pad(s)]);
}
function providerErrorCode(data: unknown): string | undefined {
  if (!isRecord(data) || !isRecord(data.detail) || !isString(data.detail.code))
    return undefined;
  return /^[a-z0-9_]{1,64}$/.test(data.detail.code)
    ? data.detail.code
    : undefined;
}

@Injectable()
export class AiServiceClient implements JobIndexingClient {
  private readonly logger = new Logger(AiServiceClient.name);
  private readonly baseUrl?: string;
  private readonly timeoutMs: number;
  private readonly issuer?: string;
  private readonly audience?: string;
  private readonly algorithm?: 'RS256' | 'ES256';
  private readonly ttlSeconds: number;
  private readonly privateKey?: string;
  private readonly keyId?: string;
  private readonly subject: string;
  private readonly scopes: {
    parse: string;
    match: string;
    generateCv: string;
    retrieve: string;
    generate: string;
    jobsIndex: string;
  };
  private readonly tokens = new Map<
    string,
    { value: string; expiresAt: number }
  >();

  constructor(private readonly config: ConfigService) {
    this.baseUrl =
      config.get<string>('AI_SERVICE_URL')?.trim().replace(/\/$/, '') ||
      undefined;
    const nodeEnv = config.get<string>('NODE_ENV')?.trim().toLowerCase();
    const maxTimeoutMs = ['local', 'development', 'test'].includes(
      nodeEnv ?? '',
    )
      ? 180000
      : 30000;
    this.timeoutMs = this.boundedNumber(
      'AI_SERVICE_TIMEOUT_MS',
      10000,
      100,
      maxTimeoutMs,
    );
    this.issuer = config.get<string>('AI_SERVICE_ISSUER')?.trim() || undefined;
    this.audience =
      config.get<string>('AI_SERVICE_AUDIENCE')?.trim() || undefined;
    const algorithm = config.get<string>('AI_SERVICE_JWT_ALGORITHM')?.trim();
    this.algorithm =
      algorithm === 'RS256' || algorithm === 'ES256' ? algorithm : undefined;
    this.ttlSeconds = this.boundedNumber(
      'AI_SERVICE_JWT_TTL_SECONDS',
      60,
      1,
      300,
    );
    this.privateKey = config.get<string>('AI_SERVICE_JWT_PRIVATE_KEY');
    this.keyId =
      config.get<string>('AI_SERVICE_JWT_KEY_ID')?.trim() || undefined;
    this.subject =
      config.get<string>('AI_SERVICE_JWT_SUBJECT')?.trim() ||
      'talentpulse-backend';
    this.scopes = {
      parse: this.configuredScope('AI_CV_PARSE_SCOPE', DEFAULT_CV_PARSE_SCOPE),
      match: this.configuredScope('AI_CV_MATCH_SCOPE', DEFAULT_CV_MATCH_SCOPE),
      generateCv: this.configuredScope(
        'AI_CV_GENERATE_SCOPE',
        DEFAULT_CV_GENERATE_SCOPE,
      ),
      retrieve: this.configuredScope(
        'AI_RAG_RETRIEVE_SCOPE',
        DEFAULT_RAG_RETRIEVE_SCOPE,
      ),
      generate: this.configuredScope(
        'AI_RAG_GENERATE_SCOPE',
        DEFAULT_RAG_GENERATE_SCOPE,
      ),
      jobsIndex: this.configuredScope(
        'AI_JOB_INDEX_SCOPE',
        DEFAULT_JOB_INDEX_SCOPE,
      ),
    };
  }

  async checkReadiness(timeoutMs = 1000): Promise<boolean> {
    if (!this.baseUrl) return false;

    const boundedTimeout =
      Number.isInteger(timeoutMs) && timeoutMs >= 100 && timeoutMs <= 5000
        ? timeoutMs
        : 1000;

    try {
      const response = await axios.request({
        method: 'GET',
        url: `${this.baseUrl}/health`,
        timeout: boundedTimeout,
        validateStatus: () => true,
      });
      return response.status >= 200 && response.status < 300;
    } catch {
      return false;
    }
  }

  async parseCv(request: CVParseRequest): Promise<CVParseResponse> {
    this.validateParseRequest(request);
    return this.validateParseResponse(
      await this.post('/internal/v1/cv/parse', request, this.scopes.parse),
      request,
    );
  }

  async matchCv(request: MatchRequest): Promise<MatchResponse> {
    this.validateMatchRequest(request);
    return this.validateMatchResponse(
      await this.post('/internal/v1/cv/match', request, this.scopes.match),
      request,
    );
  }

  async generateCvDraft(
    request: CvDraftRequest,
    options?: { timeoutMs?: number },
  ): Promise<CvDraftResponse> {
    this.validateCvDraftRequest(request);
    return this.validateCvDraftResponse(
      await this.post(
        '/internal/v1/cv/draft',
        request,
        this.scopes.generateCv,
        options?.timeoutMs,
      ),
      request,
    );
  }

  /**
   * The candidate assistant owns the RAG request/response schema. Keeping the
   * transport here reuses the existing signed, timed and sanitized AI boundary
   * without coupling this client to Python implementation details.
   */
  async retrieveRag(request: unknown): Promise<unknown> {
    return this.post(
      '/internal/v1/rag/retrieve',
      request,
      this.scopes.retrieve,
    );
  }

  async generateRag(request: unknown): Promise<unknown> {
    return this.post(
      '/internal/v1/rag/generate',
      request,
      this.scopes.generate,
    );
  }

  async upsertJob(request: JobIndexUpsertRequest): Promise<JobIndexResponse> {
    this.validateJobUpsertRequest(request);
    return this.validateJobIndexResponse(
      await this.post(
        '/internal/v1/index/jobs/upsert',
        request,
        this.scopes.jobsIndex,
      ),
      request,
      'UPSERT',
    );
  }

  async deleteJob(request: JobIndexDeleteRequest): Promise<JobIndexResponse> {
    this.validateJobDeleteRequest(request);
    return this.validateJobIndexResponse(
      await this.post(
        '/internal/v1/index/jobs/delete',
        request,
        this.scopes.jobsIndex,
      ),
      request,
      'DELETE',
    );
  }

  private configuredScope(name: string, fallback: string): string {
    return this.config.get<string>(name)?.trim() || fallback;
  }

  private boundedNumber(
    name: string,
    fallback: number,
    min: number,
    max: number,
  ): number {
    const raw = this.config.get<string | number>(name);
    const value = Number(raw);
    return raw === undefined || raw === ''
      ? fallback
      : Number.isInteger(value) && value >= min && value <= max
      ? value
      : fallback;
  }

  private async post(
    path: string,
    data: unknown,
    scope: string,
    timeoutMs = this.timeoutMs,
  ): Promise<unknown> {
    if (!this.baseUrl)
      throw new AiServiceError(
        'AI_SERVICE_NOT_CONFIGURED',
        'AI service is not configured',
      );
    const request: AxiosRequestConfig = {
      method: 'POST',
      url: `${this.baseUrl}${path}`,
      data,
      timeout:
        Number.isInteger(timeoutMs) && timeoutMs >= 100
          ? timeoutMs
          : this.timeoutMs,
      maxContentLength: 2 * 1024 * 1024,
      maxBodyLength: 8 * 1024 * 1024,
      validateStatus: () => true,
      headers: {
        Authorization: `Bearer ${this.createServiceToken(scope)}`,
        'Content-Type': 'application/json',
      },
    };
    let response: AxiosResponse<unknown>;
    try {
      response = await axios.request(request);
    } catch (error) {
      if (
        (axios.isAxiosError(error) || isRecord(error)) &&
        (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT')
      ) {
        throw new AiServiceError(
          'AI_SERVICE_TIMEOUT',
          'AI service request timed out',
          true,
        );
      }
      throw new AiServiceError(
        'AI_SERVICE_UNAVAILABLE',
        'AI service is unavailable',
        true,
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new AiServiceError(
        'AI_SERVICE_AUTH_FAILED',
        'AI service authentication failed',
      );
    }
    if (response.status === 429) {
      throw new AiServiceError(
        'AI_SERVICE_RATE_LIMITED',
        'AI service rate limit reached',
        true,
      );
    }
    if (response.status < 200 || response.status >= 300) {
      const code = providerErrorCode(response.data);
      this.logger.warn(
        `AI service rejected request (${response.status}${
          code ? `, ${code}` : ''
        })`,
      );
      throw new AiServiceError(
        'AI_SERVICE_REJECTED',
        'AI service rejected the request',
        response.status >= 500,
      );
    }
    return response.data;
  }

  private createServiceToken(scope: string): string {
    if (!this.issuer || !this.audience || !this.algorithm || !this.privateKey) {
      throw new AiServiceError(
        'AI_SERVICE_NOT_CONFIGURED',
        'AI service authentication is not configured',
      );
    }
    const now = Math.floor(Date.now() / 1000);
    const cached = this.tokens.get(scope);
    if (cached && cached.expiresAt > now + 5) return cached.value;
    const header = {
      alg: this.algorithm,
      typ: 'JWT',
      ...(this.keyId ? { kid: this.keyId } : {}),
    };
    const payload = {
      iss: this.issuer,
      aud: this.audience,
      sub: this.subject,
      scope,
      iat: now,
      exp: now + this.ttlSeconds,
      jti: randomUUID(),
    };
    const input = `${base64Url(JSON.stringify(header))}.${base64Url(
      JSON.stringify(payload),
    )}`;
    try {
      const signature = createSign('SHA256')
        .update(input)
        .sign(createPrivateKey(this.privateKey));
      const jose =
        this.algorithm === 'ES256' ? ecdsaDerToJose(signature) : signature;
      const value = `${input}.${base64Url(jose)}`;
      this.tokens.set(scope, { value, expiresAt: payload.exp });
      return value;
    } catch {
      throw new AiServiceError(
        'AI_SERVICE_NOT_CONFIGURED',
        'AI service signing is not configured',
      );
    }
  }

  private validateJobUpsertRequest(request: JobIndexUpsertRequest): void {
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

  private validateJobDeleteRequest(request: JobIndexDeleteRequest): void {
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

  private validateJobIndexResponse(
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

  private validateParseRequest(request: CVParseRequest): void {
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
      (request.media_type === 'application/pdf' &&
        !extension.endsWith('.pdf')) ||
      (request.media_type ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' &&
        !extension.endsWith('.docx'))
    ) {
      throw new AiServiceError('AI_INVALID_RESPONSE', 'Invalid parse request');
    }
  }

  private validateCvDraftRequest(request: CvDraftRequest): void {
    if (
      !isRecord(request) ||
      !isRecord(request.identity) ||
      !isRecord(request.candidate) ||
      !isRecord(request.job)
    ) {
      throw new AiServiceError(
        'AI_INVALID_RESPONSE',
        'Invalid CV draft request',
      );
    }
    assertExactKeys(request, [
      'identity',
      'candidate',
      'job',
      'template_type',
      'locale',
      'source_version',
      'content_version',
      'consent_version',
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
      !['template1', 'template2'].includes(request.template_type) ||
      !isString(request.locale) ||
      !/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{2,8})?$/.test(request.locale) ||
      !isVersion(request.source_version) ||
      !Number.isInteger(request.content_version) ||
      request.content_version < 1 ||
      request.content_version > 2147483647 ||
      (request.consent_version != null && !isVersion(request.consent_version))
    ) {
      throw new AiServiceError(
        'AI_INVALID_RESPONSE',
        'Invalid CV draft request',
      );
    }
    this.validateCvDraftCandidate(request.candidate, 'request');
    this.validateCvDraftJob(request.job);
  }

  private validateCvDraftCandidate(value: unknown, context: string): void {
    if (!isRecord(value))
      throw new AiServiceError(
        'AI_INVALID_RESPONSE',
        `Invalid CV draft ${context}`,
      );
    assertExactKeys(value, [
      'candidate_id',
      'full_name',
      'email',
      'phone',
      'link',
      'address',
      'headline',
      'career_objective',
      'skills',
      'experience',
      'education',
      'projects',
      'certificates',
      'activities',
      'awards',
    ]);
    if (!isUuid(value.candidate_id) || !isSafeString(value.full_name, 1, 500))
      throw new AiServiceError(
        'AI_INVALID_RESPONSE',
        `Invalid CV draft ${context}`,
      );
    for (const field of [
      'email',
      'phone',
      'link',
      'address',
      'headline',
      'career_objective',
    ] as const) {
      if (
        !isOptionalText(value[field], field === 'career_objective' ? 2000 : 500)
      )
        throw new AiServiceError(
          'AI_INVALID_RESPONSE',
          `Invalid CV draft ${context}`,
        );
    }
    for (const field of [
      'skills',
      'certificates',
      'activities',
      'awards',
    ] as const) {
      const entries = value[field];
      if (
        !Array.isArray(entries) ||
        entries.length > (field === 'skills' ? 100 : 50) ||
        entries.some((item) => !isSafeString(item, 1, 500))
      )
        throw new AiServiceError(
          'AI_INVALID_RESPONSE',
          `Invalid CV draft ${context}`,
        );
    }
    const validateEntries = (
      field: string,
      keys: string[],
      maxItems: number,
    ) => {
      const entries = value[field];
      if (!Array.isArray(entries) || entries.length > maxItems)
        throw new AiServiceError(
          'AI_INVALID_RESPONSE',
          `Invalid CV draft ${context}`,
        );
      for (const entry of entries) {
        if (!isRecord(entry))
          throw new AiServiceError(
            'AI_INVALID_RESPONSE',
            `Invalid CV draft ${context}`,
          );
        assertExactKeys(entry, keys);
        if (
          Object.values(entry).some(
            (item) => item !== null && !isSafeString(item, 1, 2000),
          )
        )
          throw new AiServiceError(
            'AI_INVALID_RESPONSE',
            `Invalid CV draft ${context}`,
          );
      }
    };
    validateEntries(
      'experience',
      ['company_name', 'position', 'start_date', 'end_date', 'description'],
      50,
    );
    validateEntries(
      'education',
      [
        'school_name',
        'degree',
        'major',
        'start_date',
        'end_date',
        'description',
      ],
      50,
    );
    const projects = value.projects;
    if (!Array.isArray(projects) || projects.length > 50) {
      throw new AiServiceError(
        'AI_INVALID_RESPONSE',
        `Invalid CV draft ${context}`,
      );
    }
    for (const project of projects) {
      if (!isRecord(project)) {
        throw new AiServiceError(
          'AI_INVALID_RESPONSE',
          `Invalid CV draft ${context}`,
        );
      }
      assertExactKeys(project, [
        'project_name',
        'role',
        'start_date',
        'end_date',
        'description',
        'technologies',
      ]);
      if (
        Object.entries(project).some(([key, item]) =>
          key === 'technologies'
            ? !Array.isArray(item) ||
              item.length > 30 ||
              item.some((technology) => !isSafeString(technology, 1, 500))
            : key === 'project_name'
            ? !isSafeString(item, 1, 500)
            : item !== null && !isSafeString(item, 1, 2000),
        )
      ) {
        throw new AiServiceError(
          'AI_INVALID_RESPONSE',
          `Invalid CV draft ${context}`,
        );
      }
    }
  }

  private validateCvDraftJob(value: unknown): void {
    if (!isRecord(value))
      throw new AiServiceError(
        'AI_INVALID_RESPONSE',
        'Invalid CV draft request',
      );
    assertExactKeys(value, [
      'job_id',
      'title',
      'company_name',
      'description',
      'location',
      'work_mode',
      'level',
      'required_skills',
      'preferred_skills',
    ]);
    if (!isUuid(value.job_id) || !isSafeString(value.title, 1, 500))
      throw new AiServiceError(
        'AI_INVALID_RESPONSE',
        'Invalid CV draft request',
      );
    for (const field of [
      'company_name',
      'description',
      'location',
      'work_mode',
      'level',
    ] as const)
      if (!isOptionalText(value[field], 8000))
        throw new AiServiceError(
          'AI_INVALID_RESPONSE',
          'Invalid CV draft request',
        );
    for (const field of ['required_skills', 'preferred_skills'] as const) {
      const skills = value[field];
      if (
        !Array.isArray(skills) ||
        skills.length > 100 ||
        skills.some((item) => !isSafeString(item, 1, 500))
      )
        throw new AiServiceError(
          'AI_INVALID_RESPONSE',
          'Invalid CV draft request',
        );
    }
  }

  private validateCvDraftResponse(
    value: unknown,
    request: CvDraftRequest,
  ): CvDraftResponse {
    if (!isRecord(value))
      throw new AiServiceError(
        'AI_INVALID_RESPONSE',
        'Invalid CV draft response',
      );
    assertExactKeys(value, [
      'request_id',
      'trace_id',
      'operation_attempt_id',
      'candidate_id',
      'target_job_id',
      'template_type',
      'generation_mode',
      'full_name',
      'title',
      'position',
      'email',
      'phone',
      'link',
      'address',
      'career_objective',
      'education',
      'projects',
      'work_experience',
      'skills',
      'activities',
      'certificates',
      'awards',
      'section_order',
      'warnings',
      'generated_by',
      'source_version',
      'content_version',
    ]);
    if (
      value.request_id !== request.identity.request_id ||
      value.trace_id !== request.identity.trace_id ||
      value.operation_attempt_id !== request.identity.operation_attempt_id ||
      value.candidate_id !== request.candidate.candidate_id ||
      value.target_job_id !== request.job.job_id ||
      value.template_type !== request.template_type ||
      value.generation_mode !== 'EDITOR_ONLY' ||
      value.source_version !== request.source_version ||
      value.content_version !== request.content_version ||
      !isUuid(value.request_id) ||
      !isUuid(value.trace_id) ||
      !isUuid(value.operation_attempt_id) ||
      !isUuid(value.candidate_id) ||
      !isUuid(value.target_job_id) ||
      !isSafeString(value.full_name, 1, 500) ||
      !isSafeString(value.title, 1, 500) ||
      !isOptionalText(value.position, 500) ||
      !isOptionalText(value.email, 500) ||
      !isOptionalText(value.phone, 500) ||
      !isOptionalText(value.link, 500) ||
      !isOptionalText(value.address, 500) ||
      !isOptionalText(value.career_objective, 2000) ||
      !isVersion(value.source_version) ||
      !isSafeString(value.generated_by, 1, 128) ||
      !Number.isInteger(value.content_version) ||
      !Array.isArray(value.section_order) ||
      value.section_order.length > 8 ||
      value.section_order.some((item) => !isString(item)) ||
      !Array.isArray(value.warnings) ||
      value.warnings.length > 20 ||
      value.warnings.some((warning) => !isSafeString(warning, 1, 500))
    )
      throw new AiServiceError(
        'AI_INVALID_RESPONSE',
        'Invalid CV draft response',
      );
    this.validateCvDraftCandidate(
      {
        candidate_id: value.candidate_id,
        full_name: value.full_name,
        email: value.email,
        phone: value.phone,
        link: value.link,
        address: value.address,
        headline: value.position,
        career_objective: value.career_objective,
        skills: (value.skills as unknown[]).map((skill) =>
          isRecord(skill) ? skill.name : null,
        ),
        experience: (value.work_experience as unknown[]).map((experience) => {
          if (!isRecord(experience)) return experience;
          const {
            bullets: _bullets,
            source_index: _sourceIndex,
            ...source
          } = experience;
          return source;
        }),
        education: value.education,
        projects: (value.projects as unknown[]).map((project) => {
          if (!isRecord(project)) return project;
          const {
            bullets: _bullets,
            source_index: _sourceIndex,
            ...source
          } = project;
          return source;
        }),
        certificates: value.certificates,
        activities: value.activities,
        awards: value.awards,
      },
      'response',
    );
    for (const skill of value.skills as unknown[]) {
      if (
        !isRecord(skill) ||
        !isSafeString(skill.name, 1, 500) ||
        !isOptionalText(skill.description, 2000)
      )
        throw new AiServiceError(
          'AI_INVALID_RESPONSE',
          'Invalid CV draft response',
        );
      assertExactKeys(skill, ['name', 'description']);
      if (skill.description) {
        if (
          !matchOwnedSkillMembers(
            skill.description as string,
            ownedSkillLiterals(request.candidate),
            request.candidate.skills,
          )
        ) {
          throw new AiServiceError(
            'AI_INVALID_RESPONSE',
            'Invalid CV draft skill membership',
          );
        }
      } else if (ownedSkillLiterals(request.candidate).length) {
        throw new AiServiceError(
          'AI_INVALID_RESPONSE',
          'Invalid CV draft skill membership',
        );
      }
    }
    for (const [entries, sourceCount] of [
      [value.work_experience, request.candidate.experience.length],
      [value.projects, request.candidate.projects.length],
    ] as Array<[unknown[], number]>) {
      const indices = new Set<number>();
      if (entries.length > 3)
        throw new AiServiceError(
          'AI_INVALID_RESPONSE',
          'Invalid CV draft selection',
        );
      for (const entry of entries) {
        if (
          !isRecord(entry) ||
          !Number.isInteger(entry.source_index) ||
          (entry.source_index as number) < 0 ||
          (entry.source_index as number) >= sourceCount ||
          indices.has(entry.source_index as number)
        ) {
          throw new AiServiceError(
            'AI_INVALID_RESPONSE',
            'Invalid CV draft selection',
          );
        }
        indices.add(entry.source_index as number);
      }
    }
    for (const experience of value.work_experience as unknown[]) {
      if (
        !isRecord(experience) ||
        !Array.isArray(experience.bullets) ||
        experience.bullets.length > 10 ||
        experience.bullets.some((item) => !isSafeString(item, 1, 2000))
      )
        throw new AiServiceError(
          'AI_INVALID_RESPONSE',
          'Invalid CV draft response',
        );
      assertExactKeys(experience, [
        'source_index',
        'company_name',
        'position',
        'start_date',
        'end_date',
        'description',
        'bullets',
      ]);
    }
    for (const project of value.projects as unknown[]) {
      if (
        !isRecord(project) ||
        !Array.isArray(project.bullets) ||
        project.bullets.length > 10 ||
        project.bullets.some((item) => !isSafeString(item, 1, 2000))
      )
        throw new AiServiceError(
          'AI_INVALID_RESPONSE',
          'Invalid CV draft response',
        );
      assertExactKeys(project, [
        'source_index',
        'project_name',
        'role',
        'start_date',
        'end_date',
        'description',
        'technologies',
        'bullets',
      ]);
    }
    return value as unknown as CvDraftResponse;
  }

  private validateMatchRequest(request: MatchRequest): void {
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
    this.validateProfile(request.candidate, false);
    this.validateProfile(request.job, true);
  }

  private validateProfile(value: unknown, isJob: boolean): void {
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

  private validateParseResponse(
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

  private validateMatchResponse(
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
}
