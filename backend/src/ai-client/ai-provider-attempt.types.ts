export interface StartAiProviderAttemptInput {
  requestId: string;
  traceId: string;
  operationAttemptId?: string | null;
  outboxId?: string | null;
  jobId?: string | null;
  attemptNumber: number;
  provider: string;
  model: string;
}

export interface AiProviderAttemptHandle {
  providerAttemptId: string;
}

/** Completion metadata intentionally excludes prompts, documents and responses. */
export interface CompleteAiProviderAttemptInput {
  requestSent?: boolean;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  estimatedCost?: number | string | null;
  provider?: string;
  model?: string;
}

export interface AiProviderAttemptRecorderPort {
  start(input: StartAiProviderAttemptInput): Promise<AiProviderAttemptHandle>;
  markRequestSent(handle: AiProviderAttemptHandle): Promise<void>;
  succeed(
    handle: AiProviderAttemptHandle,
    input?: CompleteAiProviderAttemptInput,
  ): Promise<void>;
  fail(
    handle: AiProviderAttemptHandle,
    errorCode: string,
    input?: CompleteAiProviderAttemptInput,
  ): Promise<void>;
  unknown(
    handle: AiProviderAttemptHandle,
    errorCode: string,
    input?: CompleteAiProviderAttemptInput,
  ): Promise<void>;
}
