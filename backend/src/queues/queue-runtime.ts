import { getQueueToken } from '@nestjs/bull';

/**
 * API-only deployments still construct services that know how to enqueue work.
 * This provider keeps those services bootable without opening a Redis
 * connection. Durable work must be handled by a worker deployment.
 */
export const NOOP_QUEUE = Object.freeze({
  add: async (): Promise<void> => undefined,
});

export function createNoopQueueProvider(queueName: string) {
  return {
    provide: getQueueToken(queueName),
    useValue: NOOP_QUEUE,
  };
}
