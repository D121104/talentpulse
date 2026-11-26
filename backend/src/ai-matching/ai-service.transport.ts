import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { createPrivateKey, createSign, randomUUID } from 'crypto';
import {
  AiServiceError,
  isRecord,
  isString,
  isUuid,
} from './ai-service.common';

const DEFAULT_CV_PARSE_SCOPE = 'cv:parse';
const DEFAULT_CV_MATCH_SCOPE = 'cv:match';
const DEFAULT_CV_GENERATE_SCOPE = 'cv:generate';
const DEFAULT_RAG_RETRIEVE_SCOPE = 'rag:retrieve';
const DEFAULT_RAG_GENERATE_SCOPE = 'rag:generate';
const DEFAULT_JOB_INDEX_SCOPE = 'jobs:index';

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
  if (!isRecord(data)) return undefined;
  const nestedCode = isRecord(data.detail) ? data.detail.code : undefined;
  const code = isString(nestedCode) ? nestedCode : data.code;
  return isString(code) && /^[a-z0-9_]{1,64}$/.test(code) ? code : undefined;
}

function safeCvRequestIdentity(data: unknown, path: string) {
  if (
    path !== '/internal/v1/cv/draft' ||
    !isRecord(data) ||
    !isRecord(data.identity)
  )
    return {};
  const { request_id, trace_id, operation_attempt_id } = data.identity;
  return {
    request_id: isUuid(request_id) ? request_id : 'none',
    trace_id: isUuid(trace_id) ? trace_id : 'none',
    operation_attempt_id: isUuid(operation_attempt_id)
      ? operation_attempt_id
      : 'none',
  };
}

export class AiServiceTransport {
  private readonly logger = new Logger('AiServiceClient');
  private readonly baseUrl?: string;
  private readonly timeoutMs: number;
  private readonly issuer?: string;
  private readonly audience?: string;
  private readonly algorithm?: 'RS256' | 'ES256';
  private readonly ttlSeconds: number;
  private readonly privateKey?: string;
  private readonly keyId?: string;
  private readonly subject: string;
  readonly scopes: {
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

  async post(
    path: string,
    data: unknown,
    scope: string,
    timeoutMs = this.timeoutMs,
    signal?: AbortSignal,
    reviewMetadataOptIn = false,
  ): Promise<unknown> {
    if (!this.baseUrl)
      throw new AiServiceError(
        'AI_SERVICE_NOT_CONFIGURED',
        'AI service is not configured',
      );
    const cvTimeout =
      path === '/internal/v1/cv/draft'
        ? Math.min(
            Number.isInteger(timeoutMs) && timeoutMs > 0
              ? timeoutMs
              : this.timeoutMs,
            300_000,
          )
        : undefined;
    const controller = cvTimeout ? new AbortController() : undefined;
    const abort = () => controller?.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const cancellationTimer = cvTimeout
      ? setTimeout(abort, cvTimeout)
      : undefined;
    const request: AxiosRequestConfig = {
      method: 'POST',
      url: `${this.baseUrl}${path}`,
      data,
      signal: controller?.signal || signal,
      timeout:
        cvTimeout ??
        (Number.isInteger(timeoutMs) && timeoutMs >= 100
          ? timeoutMs
          : this.timeoutMs),
      maxContentLength: 2 * 1024 * 1024,
      maxBodyLength: 8 * 1024 * 1024,
      validateStatus: () => true,
      headers: {
        Authorization: `Bearer ${this.createServiceToken(scope)}`,
        'Content-Type': 'application/json',
        ...(reviewMetadataOptIn ? { 'X-Cv-Review-Metadata': 'true' } : {}),
        ...(cvTimeout
          ? { 'X-Cv-Generation-Timeout-Ms': String(cvTimeout) }
          : {}),
      },
    };
    let response: AxiosResponse<unknown>;
    try {
      response = await axios.request(request);
    } catch (error) {
      if (path === '/internal/v1/cv/draft') {
        this.logger.warn(
          JSON.stringify({
            event: 'cv_ai_transport_failed',
            ...safeCvRequestIdentity(data, path),
            error_code:
              axios.isAxiosError(error) &&
              ['ECONNABORTED', 'ETIMEDOUT', 'ERR_CANCELED'].includes(
                error.code || '',
              )
                ? 'AI_SERVICE_TIMEOUT'
                : 'AI_SERVICE_UNAVAILABLE',
            error_type:
              error instanceof Error &&
              /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(error.name)
                ? error.name
                : 'UnknownError',
          }),
        );
      }
      if (
        (axios.isAxiosError(error) || isRecord(error)) &&
        (error.code === 'ECONNABORTED' ||
          error.code === 'ETIMEDOUT' ||
          (cvTimeout && error.code === 'ERR_CANCELED'))
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
    } finally {
      clearTimeout(cancellationTimer);
      signal?.removeEventListener('abort', abort);
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
      if (path === '/internal/v1/cv/draft') {
        this.logger.warn(
          JSON.stringify({
            event: 'cv_ai_service_rejected',
            ...safeCvRequestIdentity(data, path),
            status: response.status,
            provider_error_code: code || 'none',
          }),
        );
      } else {
        this.logger.warn(
          `AI service rejected request (${response.status}${
            code ? `, ${code}` : ''
          })`,
        );
      }
      throw new AiServiceError(
        path === '/internal/v1/cv/match-analysis' &&
        code === 'invalid_analysis_output'
          ? 'AI_INVALID_RESPONSE'
          : 'AI_SERVICE_REJECTED',
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
}
