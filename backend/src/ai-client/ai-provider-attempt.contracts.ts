import { randomUUID } from 'crypto';
import type {
  AiProviderAttemptHandle,
  AiProviderAttemptRecorderPort,
  CompleteAiProviderAttemptInput,
  StartAiProviderAttemptInput,
} from './ai-provider-attempt.types';

export type {
  AiProviderAttemptHandle,
  AiProviderAttemptRecorderPort,
  CompleteAiProviderAttemptInput,
  StartAiProviderAttemptInput,
} from './ai-provider-attempt.types';

/** Stable injection token owned by the client boundary. */
export const AiProviderAttemptRecorderToken = Symbol(
  'AiProviderAttemptRecorder',
);

export const AiProviderAttemptIdFactoryToken = Symbol(
  'AiProviderAttemptIdFactory',
);
export const AiProviderAttemptNowFactoryToken = Symbol(
  'AiProviderAttemptNowFactory',
);

/** No-op fallback preserves callers that construct AiServiceClient directly. */
export class NoopAiProviderAttemptRecorder
  implements AiProviderAttemptRecorderPort
{
  async start(
    _input: StartAiProviderAttemptInput,
  ): Promise<AiProviderAttemptHandle> {
    return { providerAttemptId: randomUUID() };
  }

  async markRequestSent(_handle: AiProviderAttemptHandle): Promise<void> {}

  async succeed(
    _handle: AiProviderAttemptHandle,
    _input?: CompleteAiProviderAttemptInput,
  ): Promise<void> {}

  async fail(
    _handle: AiProviderAttemptHandle,
    _errorCode: string,
    _input?: CompleteAiProviderAttemptInput,
  ): Promise<void> {}

  async unknown(
    _handle: AiProviderAttemptHandle,
    _errorCode: string,
    _input?: CompleteAiProviderAttemptInput,
  ): Promise<void> {}
}
