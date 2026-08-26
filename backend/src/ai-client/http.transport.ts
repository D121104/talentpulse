import { AiServiceError, AiServiceErrorCode } from './ai-client.errors';

export interface AiServiceHttpRequestOptions {
  timeoutMs: number;
  headers: Record<string, string>;
}

export interface AiServiceHttpTransport {
  post<TResponse>(
    url: string,
    body: unknown,
    options: AiServiceHttpRequestOptions,
  ): Promise<TResponse>;
}

export function mapAiServiceHttpStatus(status: number): AiServiceError {
  if (status === 400 || status === 422)
    return new AiServiceError(
      AiServiceErrorCode.AI_REQUEST_REJECTED,
      'AI service rejected the internal request',
      502,
      false,
    );
  if (status === 401 || status === 403)
    return new AiServiceError(
      AiServiceErrorCode.AI_SERVICE_UNAUTHORIZED,
      'AI service authentication failed',
      502,
      false,
    );
  if (status === 404)
    return new AiServiceError(
      AiServiceErrorCode.AI_ENDPOINT_NOT_FOUND,
      'AI service endpoint is unavailable',
      502,
      false,
    );
  if (status === 429)
    return new AiServiceError(
      AiServiceErrorCode.AI_DEPENDENCY_RATE_LIMITED,
      'AI service is rate limited',
      503,
      true,
    );
  return new AiServiceError(
    AiServiceErrorCode.AI_DEPENDENCY_UNAVAILABLE,
    'AI service is unavailable',
    503,
    true,
  );
}

export function mapAiServiceTransportError(error: unknown): AiServiceError {
  const code = (error as { code?: string })?.code;
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT')
    return new AiServiceError(
      AiServiceErrorCode.AI_PROVIDER_TIMEOUT,
      'AI service request timed out',
      504,
      true,
      error,
    );
  return new AiServiceError(
    AiServiceErrorCode.AI_DEPENDENCY_UNAVAILABLE,
    'AI service is unavailable',
    503,
    true,
    error,
  );
}

export function mapAiClientError(error: unknown): AiServiceError {
  if (error instanceof AiServiceError) return error;
  return mapAiServiceTransportError(error);
}
