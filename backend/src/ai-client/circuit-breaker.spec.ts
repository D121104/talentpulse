import { AiServiceError, AiServiceErrorCode } from './ai-client.errors';

describe('AiCircuitBreaker', () => {
  it('opens after retryable dependency failures and allows a later probe', async () => {
    const { AiCircuitBreaker } =
      require('./circuit-breaker') as typeof import('./circuit-breaker');
    const breaker = new AiCircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 50,
    });
    const failing = () =>
      Promise.reject(
        new AiServiceError(
          AiServiceErrorCode.AI_PROVIDER_TIMEOUT,
          'timeout',
          504,
          true,
        ),
      );

    await expect(breaker.execute(failing)).rejects.toMatchObject({
      code: AiServiceErrorCode.AI_PROVIDER_TIMEOUT,
    });
    await expect(breaker.execute(failing)).rejects.toMatchObject({
      code: AiServiceErrorCode.AI_CIRCUIT_OPEN,
    });
    await new Promise((resolve) => setTimeout(resolve, 60));
    await expect(breaker.execute(async () => 'healthy')).resolves.toBe(
      'healthy',
    );
  });
});
