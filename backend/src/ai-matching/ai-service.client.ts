import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { createPrivateKey, createSign, randomUUID } from 'crypto';

const DEFAULT_CV_PARSE_SCOPE = 'cv:parse';
const DEFAULT_CV_MATCH_SCOPE = 'cv:match';
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
  | 'STALE_IGNORED';

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
    value === null || (isString(value) && !Number.isNaN(Date.parse(value)))
  );
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
      timeout: this.timeoutMs,
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
        ? value.status === 'INDEXED'
        : value.status === 'DELETED' || value.status === 'ALREADY_DELETED';
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
    if (
      (operation === 'UPSERT' &&
        (value.content_hash !==
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
