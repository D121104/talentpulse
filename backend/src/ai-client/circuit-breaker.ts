import { AiServiceError, AiServiceErrorCode } from './ai-client.errors';

export interface AiCircuitBreakerOptions {
  failureThreshold: number;
  resetTimeoutMs: number;
}

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class AiCircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private consecutiveFailures = 0;
  private openedAt = 0;

  constructor(private readonly options: AiCircuitBreakerOptions) {
    if (
      !Number.isInteger(options.failureThreshold) ||
      options.failureThreshold < 1
    ) {
      throw new Error(
        'AI circuit failure threshold must be a positive integer',
      );
    }
    if (
      !Number.isFinite(options.resetTimeoutMs) ||
      options.resetTimeoutMs < 1
    ) {
      throw new Error('AI circuit reset timeout must be positive');
    }
  }

  get currentState(): CircuitState {
    return this.state;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.openedAt < this.options.resetTimeoutMs) {
        throw new AiServiceError(
          AiServiceErrorCode.AI_CIRCUIT_OPEN,
          'AI service circuit is open',
          503,
          true,
        );
      }
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await operation();
      this.consecutiveFailures = 0;
      this.state = 'CLOSED';
      return result;
    } catch (error) {
      if (this.isDependencyFailure(error)) this.recordFailure();
      throw error;
    }
  }

  private recordFailure(): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.options.failureThreshold) {
      this.state = 'OPEN';
      this.openedAt = Date.now();
    }
  }

  private isDependencyFailure(error: unknown): boolean {
    return (
      error instanceof AiServiceError &&
      (error.retryable ||
        error.code === AiServiceErrorCode.AI_DEPENDENCY_UNAVAILABLE ||
        error.code === AiServiceErrorCode.AI_PROVIDER_TIMEOUT)
    );
  }
}
