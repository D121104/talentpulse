import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { validate as isUuid } from 'uuid';
import {
  assertRagGenerateRequest,
  assertRagGenerateResponse,
  RagGenerateRequest,
  RagGenerateResponse,
  assertRagRetrieveRequest,
  assertRagRetrieveResponse,
  RagRetrieveRequest,
  RagRetrieveResponse,
  serializeRagGenerateRequest,
  serializeRagRetrieveRequest,
} from './contracts/rag.contracts';
import {
  assertIndexJobDeleteRequest,
  assertIndexJobDeleteResponse,
  assertIndexJobUpsertRequest,
  assertIndexJobUpsertResponse,
  IndexJobDeleteRequest,
  IndexJobDeleteResponse,
  IndexJobUpsertRequest,
  IndexJobUpsertResponse,
  IndexMetadataScanRequest,
  IndexMetadataScanResponse,
  assertIndexMetadataScanRequest,
  assertIndexMetadataScanResponse,
  serializeIndexJobDeleteRequest,
  serializeIndexJobUpsertRequest,
  serializeIndexMetadataScanRequest,
} from './contracts/indexing.contracts';
import { AiServiceError, AiServiceErrorCode } from './ai-client.errors';
import { AiCircuitBreaker } from './circuit-breaker';
import { AiServiceHttpTransport, mapAiClientError } from './http.transport';
import { ServiceJwtIssuer } from './service-jwt.provider';
import { ServiceJwtScope } from './contracts/service-jwt.contracts';
import {
  AI_PROVIDER_ATTEMPT_MODEL_MAX_LENGTH,
  AI_PROVIDER_ATTEMPT_PROVIDER_MAX_LENGTH,
  normalizeAiProviderAttemptLabel,
} from './ai-provider-attempt.validation';
import {
  AiProviderAttemptRecorderToken,
  NoopAiProviderAttemptRecorder,
} from './ai-provider-attempt.contracts';
import type {
  AiProviderAttemptHandle,
  AiProviderAttemptRecorderPort,
  CompleteAiProviderAttemptInput,
  StartAiProviderAttemptInput,
} from './ai-provider-attempt.types';

export const AiServiceHttpTransportToken = Symbol('AiServiceHttpTransport');
export const AiServiceJwtIssuerToken = Symbol('AiServiceJwtIssuer');
export const AiCircuitBreakerToken = Symbol('AiCircuitBreaker');
export const AiTraceIdFactoryToken = Symbol('AiTraceIdFactory');
export const AiOperationAttemptIdFactoryToken = Symbol(
  'AiOperationAttemptIdFactory',
);

export interface AiClientConfig {
  baseUrl: string;
  timeoutMs: number;
}

export interface AiIndexCallOptions {
  /** Stable UUID request ID supplied by an outbox/worker when available. */
  requestId?: string;
  /** UUID trace ID for this HTTP attempt; generated when omitted. */
  traceId?: string;
  /** Stable operation identity for grouping provider attempts, when available. */
  operationAttemptId?: string;
  /** Logical outbox command owning this provider call. */
  outboxId?: string;
  /** Canonical job identity, when the indexing call targets one job. */
  jobId?: string;
  /** Delivery attempt number allocated by the outbox dispatcher. */
  attemptNumber?: number;
  /** Provider/model labels used only for bounded audit metadata. */
  provider?: string;
  model?: string;
}

@Injectable()
export class AiServiceClient {
  private readonly config: AiClientConfig;
  private readonly logger = new Logger(AiServiceClient.name);
  constructor(
    private readonly configService: ConfigService,
    @Inject(AiServiceHttpTransportToken)
    private readonly transport: AiServiceHttpTransport,
    @Inject(AiServiceJwtIssuerToken) private readonly auth: ServiceJwtIssuer,
    @Inject(AiCircuitBreakerToken) private readonly circuit: AiCircuitBreaker,
    @Inject(AiTraceIdFactoryToken)
    private readonly createTraceId: () => string = randomUUID,
    @Inject(AiOperationAttemptIdFactoryToken)
    private readonly createOperationAttemptId: () => string = randomUUID,
    @Inject(AiProviderAttemptRecorderToken)
    private readonly providerAttemptRecorder: AiProviderAttemptRecorderPort = new NoopAiProviderAttemptRecorder(),
  ) {
    const baseUrl = configService
      .get<string>('AI_SERVICE_URL', '')
      .trim()
      .replace(/\/$/, '');
    const timeoutMs = Number(
      configService.get('AI_SERVICE_TIMEOUT_MS', 15_000),
    );
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) {
      throw new AiServiceError(
        AiServiceErrorCode.AI_CLIENT_NOT_CONFIGURED,
        'AI service timeout is invalid',
        503,
        false,
      );
    }
    this.config = { baseUrl, timeoutMs };
  }

  async retrieve(request: RagRetrieveRequest): Promise<RagRetrieveResponse> {
    assertRagRetrieveRequest(request);
    return this.call(
      '/internal/v1/rag/retrieve',
      ServiceJwtScope.RagRetrieve,
      serializeRagRetrieveRequest(
        request,
        this.createTraceId(),
        this.createOperationAttemptId(),
      ),
      assertRagRetrieveResponse,
    );
  }

  async generate(request: RagGenerateRequest): Promise<RagGenerateResponse> {
    assertRagGenerateRequest(request);
    return this.call(
      '/internal/v1/rag/generate',
      ServiceJwtScope.RagGenerate,
      serializeRagGenerateRequest(
        request,
        this.createTraceId(),
        this.createOperationAttemptId(),
      ),
      assertRagGenerateResponse,
    );
  }

  async indexJob(
    request: IndexJobUpsertRequest,
    options?: AiIndexCallOptions,
  ): Promise<IndexJobUpsertResponse> {
    assertIndexJobUpsertRequest(request);
    return this.callIndexing(
      '/internal/v1/index/jobs/upsert',
      ServiceJwtScope.JobsIndex,
      serializeIndexJobUpsertRequest(request),
      assertIndexJobUpsertResponse,
      options,
    );
  }

  async deleteIndexedJob(
    request: IndexJobDeleteRequest,
    options?: AiIndexCallOptions,
  ): Promise<IndexJobDeleteResponse> {
    assertIndexJobDeleteRequest(request);
    return this.callIndexing(
      '/internal/v1/index/jobs/delete',
      ServiceJwtScope.JobsIndex,
      serializeIndexJobDeleteRequest(request),
      assertIndexJobDeleteResponse,
      options,
    );
  }

  async scanIndexPoints(
    request: IndexMetadataScanRequest,
    options?: AiIndexCallOptions,
  ): Promise<IndexMetadataScanResponse> {
    assertIndexMetadataScanRequest(request);
    return this.callIndexing(
      '/internal/v1/index/points/scan',
      ServiceJwtScope.JobsIndex,
      serializeIndexMetadataScanRequest(request),
      assertIndexMetadataScanResponse,
      options,
    );
  }

  private async call<TRequest, TResponse>(
    path: string,
    scope: ServiceJwtScope,
    request: TRequest,
    validateResponse: (value: unknown) => TResponse,
  ): Promise<TResponse> {
    this.assertConfigured();
    const requestId = this.requestId(request);
    const traceId = this.traceId(request);

    return this.circuit.execute(async () => {
      try {
        const token = await this.auth.issue(scope);
        const response = await this.transport.post<unknown>(
          `${this.config.baseUrl}${path}`,
          request,
          {
            timeoutMs: this.config.timeoutMs,
            headers: {
              Authorization: `Bearer ${token.token}`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
              'X-Request-ID': requestId,
              'X-Trace-ID': traceId,
            },
          },
        );
        const validated = validateResponse(response);
        this.assertResponseCorrelation(validated, request, requestId, traceId);
        return validated;
      } catch (error) {
        throw mapAiClientError(error);
      }
    });
  }

  /**
   * Indexing deliberately uses a specialized call because its wire request has
   * no RAG `identity` object and its current FastAPI response has no `trace_id`.
   * The service still receives both correlation headers; FastAPI currently
   * echoes only the UUID in `X-Request-ID` as `request_id`.
   */
  private async callIndexing<TRequest, TResponse>(
    path: string,
    scope: ServiceJwtScope,
    request: TRequest,
    validateResponse: (value: unknown) => TResponse,
    options?: AiIndexCallOptions,
  ): Promise<TResponse> {
    const requestId = this.indexCorrelationId(
      options?.requestId ?? this.createOperationAttemptId(),
      'request_id',
    );
    const traceId = this.indexCorrelationId(
      options?.traceId ?? this.createTraceId(),
      'trace_id',
    );
    const operationAttemptId = this.indexCorrelationId(
      options?.operationAttemptId ?? this.createOperationAttemptId(),
      'operation_attempt_id',
    );
    const auditInput: StartAiProviderAttemptInput = {
      requestId,
      traceId,
      operationAttemptId,
      outboxId: options?.outboxId,
      jobId: options?.jobId ?? this.indexJobId(request),
      attemptNumber: options?.attemptNumber ?? 1,
      provider:
        normalizeAiProviderAttemptLabel(
          options?.provider ?? 'ai-service',
          AI_PROVIDER_ATTEMPT_PROVIDER_MAX_LENGTH,
        ) ?? 'ai-service',
      model:
        normalizeAiProviderAttemptLabel(
          options?.model ?? path,
          AI_PROVIDER_ATTEMPT_MODEL_MAX_LENGTH,
        ) ?? 'indexing',
    };
    const audit = await this.startAuditAttempt(auditInput);
    let requestSent = false;
    let auditFinalized = false;

    const finalizeFailure = async (error: AiServiceError): Promise<void> => {
      if (auditFinalized) return;
      auditFinalized = true;
      await this.recordAuditFailure(audit, error, requestSent);
    };

    try {
      // Configuration failures are part of the pre-send audit lifecycle too.
      this.assertConfigured();
      return await this.circuit.execute(async () => {
        try {
          const token = await this.auth.issue(scope);
          await this.recordAuditMarkSent(audit);
          // This is the local handoff boundary. The assignment deliberately
          // sits immediately before transport invocation so HTTP failures after
          // this point are treated as potentially provider-visible.
          requestSent = true;
          const response = await this.transport.post<unknown>(
            `${this.config.baseUrl}${path}`,
            request,
            {
              timeoutMs: this.config.timeoutMs,
              headers: {
                Authorization: `Bearer ${token.token}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'X-Request-ID': requestId,
                'X-Trace-ID': traceId,
              },
            },
          );
          // A malformed 2xx response is definitive for this client. The
          // operation is protected by its idempotency key, so only transport
          // uncertainty is recorded as UNKNOWN.
          const validated = validateResponse(response);
          this.assertIndexResponseCorrelation(validated, requestId);
          // Do not subsequently write FAILED if the terminal SUCCESS audit
          // write is ambiguous. The stale-attempt sweep can safely classify a
          // sent STARTED row while the outbox replays this idempotent command.
          auditFinalized = true;
          await this.recordAuditSuccess(audit, {
            ...this.auditCompletion(validated),
            requestSent: true,
          });
          return validated;
        } catch (error) {
          const mapped = mapAiClientError(error);
          await finalizeFailure(mapped);
          throw mapped;
        }
      });
    } catch (error) {
      const mapped = mapAiClientError(error);
      await finalizeFailure(mapped);
      throw mapped;
    }
  }

  private async startAuditAttempt(input: StartAiProviderAttemptInput): Promise<{
    recorder: AiProviderAttemptRecorderPort;
    handle: AiProviderAttemptHandle;
  }> {
    try {
      return {
        recorder: this.providerAttemptRecorder,
        handle: await this.providerAttemptRecorder.start(input),
      };
    } catch {
      // Phase 2 treats provider-attempt persistence as a delivery invariant: a
      // call without a durable STARTED row cannot be reconciled after a crash.
      // Fail before auth/HTTP so the outbox records a bounded retry instead of
      // reporting a provider success that has no audit trail.
      throw this.auditPersistenceError('start');
    }
  }

  private async recordAuditMarkSent(audit: {
    recorder: AiProviderAttemptRecorderPort;
    handle: AiProviderAttemptHandle;
  }): Promise<void> {
    try {
      await audit.recorder.markRequestSent(audit.handle);
    } catch {
      // The handoff bit must be durable before transport. Otherwise a process
      // crash could leave a false  record for a request
      // the provider received. Fail before HTTP and let the outbox retry.
      throw this.auditPersistenceError('mark_request_sent', audit.handle);
    }
  }

  private async recordAuditSuccess(
    audit: {
      recorder: AiProviderAttemptRecorderPort;
      handle: AiProviderAttemptHandle;
    },
    input: CompleteAiProviderAttemptInput,
  ): Promise<void> {
    try {
      await audit.recorder.succeed(audit.handle, input);
    } catch {
      // The provider may already have completed, but this worker must not mark
      // its outbox command successful without a durable terminal audit row.
      // The stable idempotency key makes the resulting retry safe.
      throw this.auditPersistenceError('succeed', audit.handle);
    }
  }

  private async recordAuditFailure(
    audit: {
      recorder: AiProviderAttemptRecorderPort;
      handle: AiProviderAttemptHandle;
    },
    error: AiServiceError,
    requestSent: boolean,
  ): Promise<void> {
    try {
      const input: CompleteAiProviderAttemptInput = { requestSent };
      if (isAmbiguousProviderOutcome(error, requestSent)) {
        await audit.recorder.unknown(audit.handle, error.code, input);
      } else {
        await audit.recorder.fail(audit.handle, error.code, input);
      }
    } catch {
      // Preserve a retryable outbox result rather than dead-lettering a provider
      // call whose durable terminal audit state could not be recorded.
      throw this.auditPersistenceError('failure', audit.handle);
    }
  }

  private auditPersistenceError(
    action: string,
    handle?: AiProviderAttemptHandle,
  ): AiServiceError {
    this.logAuditPersistenceFailure(action, handle);
    return new AiServiceError(
      AiServiceErrorCode.AI_PROVIDER_AUDIT_PERSISTENCE_FAILED,
      'AI provider-attempt audit persistence is unavailable',
      503,
      true,
    );
  }

  private logAuditPersistenceFailure(
    action: string,
    handle?: AiProviderAttemptHandle,
    category?: unknown,
  ): void {
    const providerAttemptId = handle?.providerAttemptId;
    const suffix =
      typeof providerAttemptId === 'string' && isUuid(providerAttemptId)
        ? ` providerAttemptId=${providerAttemptId}`
        : '';
    const safeCategory = isKnownAiServiceErrorCode(category)
      ? ` category=${category}`
      : '';
    this.logger.warn(
      `AI provider-attempt audit ${action} failed${safeCategory}${suffix}`,
    );
  }

  private indexJobId(request: unknown): string | undefined {
    const candidate = request as {
      job?: { job_id?: unknown };
      job_id?: unknown;
    };
    const value = candidate.job?.job_id ?? candidate.job_id;
    return typeof value === 'string' && isUuid(value)
      ? value.toLowerCase()
      : undefined;
  }

  private auditCompletion(value: unknown): CompleteAiProviderAttemptInput {
    const response = value as {
      input_tokens?: unknown;
      output_tokens?: unknown;
      total_tokens?: unknown;
      estimated_cost?: unknown;
      embedding_provider?: unknown;
      embedding_model_version?: unknown;
    };
    return {
      inputTokens: numberOrNull(response.input_tokens),
      outputTokens: numberOrNull(response.output_tokens),
      totalTokens: numberOrNull(response.total_tokens),
      estimatedCost: numberOrStringOrNull(response.estimated_cost),
      provider: normalizeAiProviderAttemptLabel(
        response.embedding_provider,
        AI_PROVIDER_ATTEMPT_PROVIDER_MAX_LENGTH,
      ),
      model: normalizeAiProviderAttemptLabel(
        response.embedding_model_version,
        AI_PROVIDER_ATTEMPT_MODEL_MAX_LENGTH,
      ),
    };
  }

  private assertConfigured(): void {
    if (!this.config.baseUrl) {
      throw new AiServiceError(
        AiServiceErrorCode.AI_CLIENT_NOT_CONFIGURED,
        'AI service URL is not configured',
        503,
        false,
      );
    }
  }

  private requestId(request: unknown): string {
    const identity = (request as { identity?: { request_id?: unknown } })
      ?.identity;
    if (
      typeof identity?.request_id !== 'string' ||
      identity.request_id.length === 0
    ) {
      throw new AiServiceError(
        AiServiceErrorCode.AI_REQUEST_REJECTED,
        'identity.request_id is required',
        400,
        false,
      );
    }
    return identity.request_id;
  }

  private traceId(request: unknown): string {
    const identity = (request as { identity?: { trace_id?: unknown } })
      ?.identity;
    if (
      typeof identity?.trace_id !== 'string' ||
      identity.trace_id.length === 0
    ) {
      throw new AiServiceError(
        AiServiceErrorCode.AI_REQUEST_REJECTED,
        'identity.trace_id is required',
        400,
        false,
      );
    }
    return identity.trace_id;
  }

  private indexCorrelationId(value: unknown, field: string): string {
    if (typeof value !== 'string' || !isUuid(value)) {
      throw new AiServiceError(
        AiServiceErrorCode.AI_REQUEST_REJECTED,
        `${field} must be a UUID`,
        400,
        false,
      );
    }
    return value.toLowerCase();
  }

  private assertIndexResponseCorrelation(
    response: unknown,
    requestId: string,
  ): void {
    const correlated = response as { request_id?: unknown };
    if (correlated.request_id !== requestId) {
      throw new AiServiceError(
        AiServiceErrorCode.AI_INVALID_MODEL_OUTPUT,
        'AI service indexing response correlation is invalid',
        502,
        false,
      );
    }
  }

  private assertResponseCorrelation(
    response: unknown,
    request: unknown,
    requestId: string,
    traceId: string,
  ): void {
    const correlated = response as {
      request_id?: unknown;
      trace_id?: unknown;
      client_message_id?: unknown;
    };
    if (
      correlated.request_id !== requestId ||
      correlated.trace_id !== traceId
    ) {
      throw new AiServiceError(
        AiServiceErrorCode.AI_INVALID_MODEL_OUTPUT,
        'AI service response correlation is invalid',
        502,
        false,
      );
    }

    const requestIdentity = (
      request as { identity?: { client_message_id?: unknown } }
    )?.identity;
    if (
      'client_message_id' in correlated &&
      correlated.client_message_id !== requestIdentity?.client_message_id
    ) {
      throw new AiServiceError(
        AiServiceErrorCode.AI_INVALID_MODEL_OUTPUT,
        'AI service response correlation is invalid',
        502,
        false,
      );
    }
  }
}

function numberOrNull(value: unknown): number | null | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value)
    ? value
    : undefined;
}

function numberOrStringOrNull(
  value: unknown,
): number | string | null | undefined {
  if (typeof value === 'number' || typeof value === 'string') return value;
  if (value === null) return null;
  return undefined;
}

function isAmbiguousProviderOutcome(
  error: AiServiceError,
  requestSent: boolean,
): boolean {
  if (!requestSent) return false;
  if (error.code === AiServiceErrorCode.AI_PROVIDER_TIMEOUT) return true;

  // A transport category is deliberately retained instead of the raw Axios
  // error. HTTP 5xx and contract validation failures have no category and are
  // treated as definitive FAILED outcomes by policy.
  return isProviderTransportError(error.transportCode);
}

function isProviderTransportError(code: unknown): boolean {
  return (
    typeof code === 'string' &&
    [
      'ECONNRESET',
      'ECONNABORTED',
      'ETIMEDOUT',
      'EPIPE',
      'ENETUNREACH',
      'EHOSTUNREACH',
      'ENOTFOUND',
      'EAI_AGAIN',
      'ECONNREFUSED',
    ].includes(code)
  );
}

function isKnownAiServiceErrorCode(
  value: unknown,
): value is AiServiceErrorCode {
  return (
    typeof value === 'string' &&
    Object.values(AiServiceErrorCode).includes(value as AiServiceErrorCode)
  );
}
