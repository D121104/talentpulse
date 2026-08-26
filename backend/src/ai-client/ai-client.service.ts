import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
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
import { AiServiceError, AiServiceErrorCode } from './ai-client.errors';
import { AiCircuitBreaker } from './circuit-breaker';
import { AiServiceHttpTransport, mapAiClientError } from './http.transport';
import { ServiceJwtIssuer } from './service-jwt.provider';
import { ServiceJwtScope } from './contracts/service-jwt.contracts';

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

@Injectable()
export class AiServiceClient {
  private readonly config: AiClientConfig;

  constructor(
    private readonly configService: ConfigService,
    @Inject(AiServiceHttpTransportToken)
    private readonly transport: AiServiceHttpTransport,
    @Inject(AiServiceJwtIssuerToken) private readonly auth: ServiceJwtIssuer,
    @Inject(AiCircuitBreakerToken) private readonly circuit: AiCircuitBreaker,
    private readonly createTraceId: () => string = randomUUID,
    private readonly createOperationAttemptId: () => string = randomUUID,
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

  private async call<TRequest, TResponse>(
    path: string,
    scope: ServiceJwtScope,
    request: TRequest,
    validateResponse: (value: unknown) => TResponse,
  ): Promise<TResponse> {
    if (!this.config.baseUrl) {
      throw new AiServiceError(
        AiServiceErrorCode.AI_CLIENT_NOT_CONFIGURED,
        'AI service URL is not configured',
        503,
        false,
      );
    }
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
