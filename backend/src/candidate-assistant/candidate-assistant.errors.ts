import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
export type CandidateAssistantProviderErrorCode =
  | 'TIMEOUT'
  | 'UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'INVALID_RESPONSE'
  | 'UNKNOWN';
export class CandidateAssistantProviderError extends Error {
  constructor(
    public readonly code: CandidateAssistantProviderErrorCode,
    message = code,
  ) {
    super(message);
    this.name = 'CandidateAssistantProviderError';
  }
}
export function mapCandidateAssistantProviderError(
  error: unknown,
): HttpException {
  const code =
    error instanceof CandidateAssistantProviderError ? error.code : 'UNKNOWN';
  if (code === 'TIMEOUT')
    return new GatewayTimeoutException({
      code: 'AI_TIMEOUT',
      message: 'AI service timed out',
    });
  if (code === 'RATE_LIMITED')
    return new HttpException(
      { code: 'AI_RATE_LIMITED', message: 'AI service rate limit reached' },
      429,
    );
  if (code === 'UNAVAILABLE')
    return new ServiceUnavailableException({
      code: 'AI_UNAVAILABLE',
      message: 'AI service is unavailable',
    });
  return new BadGatewayException({
    code:
      code === 'INVALID_RESPONSE' ? 'AI_INVALID_RESPONSE' : 'AI_PROVIDER_ERROR',
    message: 'AI service request failed',
  });
}
