export enum AiServiceErrorCode {
  AI_PROVIDER_TIMEOUT = 'AI_PROVIDER_TIMEOUT',
  AI_DEPENDENCY_UNAVAILABLE = 'AI_DEPENDENCY_UNAVAILABLE',
  AI_INVALID_MODEL_OUTPUT = 'AI_INVALID_MODEL_OUTPUT',
  AI_REQUEST_REJECTED = 'AI_REQUEST_REJECTED',
  AI_SERVICE_UNAUTHORIZED = 'AI_SERVICE_UNAUTHORIZED',
  AI_ENDPOINT_NOT_FOUND = 'AI_ENDPOINT_NOT_FOUND',
  AI_DEPENDENCY_RATE_LIMITED = 'AI_DEPENDENCY_RATE_LIMITED',
  AI_CLIENT_NOT_CONFIGURED = 'AI_CLIENT_NOT_CONFIGURED',
  AI_CIRCUIT_OPEN = 'AI_CIRCUIT_OPEN',
}

export class AiServiceError extends Error {
  readonly name = 'AiServiceError';

  constructor(
    public readonly code: AiServiceErrorCode,
    message: string,
    public readonly status: number,
    public readonly retryable: boolean,
    public readonly cause?: unknown,
  ) {
    super(message);
  }
}
