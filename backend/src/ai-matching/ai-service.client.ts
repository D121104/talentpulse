import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { createPrivateKey, createSign, randomUUID } from 'crypto';

export const AI_SERVICE_SCOPE = 'ai:cv';
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
export interface MatchRequest {
  cv_id: string;
  job_id: string;
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
  cv_id: string;
  job_id: string;
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
export class AiServiceClient {
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
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: ConfigService) {
    this.baseUrl =
      config.get<string>('AI_SERVICE_URL')?.trim().replace(/\/$/, '') ||
      undefined;
    this.timeoutMs = this.boundedNumber(
      'AI_SERVICE_TIMEOUT_MS',
      10000,
      100,
      30000,
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
  }

  async parseCv(request: CVParseRequest): Promise<CVParseResponse> {
    this.validateParseRequest(request);
    return this.validateParseResponse(
      await this.post('/internal/v1/cv/parse', request),
      request,
    );
  }

  async matchCv(request: MatchRequest): Promise<MatchResponse> {
    this.validateMatchRequest(request);
    return this.validateMatchResponse(
      await this.post('/internal/v1/cv/match', request),
      request,
    );
  }

  /**
   * The candidate assistant owns the RAG request/response schema. Keeping the
   * transport here reuses the existing signed, timed and sanitized AI boundary
   * without coupling this client to Python implementation details.
   */
  async retrieveRag(request: unknown): Promise<unknown> {
    return this.post('/internal/v1/rag/retrieve', request);
  }

  async generateRag(request: unknown): Promise<unknown> {
    return this.post('/internal/v1/rag/generate', request);
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

  private async post(path: string, data: unknown): Promise<unknown> {
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
        Authorization: `Bearer ${this.createServiceToken()}`,
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

  private createServiceToken(): string {
    if (!this.issuer || !this.audience || !this.algorithm || !this.privateKey) {
      throw new AiServiceError(
        'AI_SERVICE_NOT_CONFIGURED',
        'AI service authentication is not configured',
      );
    }
    const now = Math.floor(Date.now() / 1000);
    if (this.token && this.token.expiresAt > now + 5) return this.token.value;
    const header = {
      alg: this.algorithm,
      typ: 'JWT',
      ...(this.keyId ? { kid: this.keyId } : {}),
    };
    const payload = {
      iss: this.issuer,
      aud: this.audience,
      sub: this.subject,
      scope: AI_SERVICE_SCOPE,
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
      this.token = { value, expiresAt: payload.exp };
      return value;
    } catch {
      throw new AiServiceError(
        'AI_SERVICE_NOT_CONFIGURED',
        'AI service signing is not configured',
      );
    }
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
    if (!request || !isUuid(request.cv_id) || !isUuid(request.job_id)) {
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
      'parser_version',
    ]);
    if (
      value.cv_id !== request.cv_id ||
      !isUuid(value.cv_id) ||
      value.content_version !== request.content_version ||
      value.media_type !== request.media_type ||
      !isString(value.content_sha256) ||
      !/^[0-9a-f]{64}$/.test(value.content_sha256) ||
      !isString(value.extracted_text) ||
      value.extracted_text.length > 100000 ||
      typeof value.text_char_count !== 'number' ||
      !Number.isInteger(value.text_char_count) ||
      value.text_char_count < 0 ||
      !isString(value.parser_version)
    ) {
      throw new AiServiceError('AI_INVALID_RESPONSE', 'Invalid parse response');
    }
    return value as unknown as CVParseResponse;
  }

  private validateMatchResponse(
    value: unknown,
    request: MatchRequest,
  ): MatchResponse {
    if (!isRecord(value))
      throw new AiServiceError('AI_INVALID_RESPONSE', 'Invalid match response');
    assertExactKeys(value, [
      'cv_id',
      'job_id',
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
      value.cv_id !== request.cv_id ||
      value.job_id !== request.job_id ||
      !isUuid(value.cv_id) ||
      !isUuid(value.job_id) ||
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
