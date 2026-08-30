import {
  AiProviderAttempt,
  AiProviderAttemptStatus,
} from '../entities/ai-provider-attempt.entity';
import { AiProviderAttemptRecorder } from './ai-provider-attempt-recorder.service';

const IDS = {
  providerAttemptOne: '11111111-1111-4111-8111-111111111111',
  providerAttemptTwo: '22222222-2222-4222-8222-222222222222',
  request: '33333333-3333-4333-8333-333333333333',
  trace: '44444444-4444-4444-8444-444444444444',
  operation: '55555555-5555-4555-8555-555555555555',
  outbox: '66666666-6666-4666-8666-666666666666',
  job: '77777777-7777-4777-8777-777777777777',
};

function createHarness() {
  const rows = new Map<string, AiProviderAttempt>();
  // Mirror the two nullable FK constraints in the PostgreSQL migration so the
  // audit fixture cannot accidentally accept an aggregate ID as a job ID.
  const canonicalJobIds = new Set([IDS.job]);
  const outboxIds = new Set([IDS.outbox]);
  const repository = {
    create: jest.fn(
      (value: Partial<AiProviderAttempt>) => value as AiProviderAttempt,
    ),
    save: jest.fn(async (value: AiProviderAttempt) => {
      if (value.outboxId && !outboxIds.has(value.outboxId)) {
        throw new Error('FK_ai_provider_attempts_outbox');
      }
      if (value.jobId && !canonicalJobIds.has(value.jobId)) {
        throw new Error('FK_ai_provider_attempts_job');
      }
      rows.set(value.providerAttemptId, value);
      return value;
    }),
    update: jest.fn(
      async (
        where: {
          providerAttemptId: string;
          status: AiProviderAttemptStatus;
          requestSent?: boolean;
        },
        changes: Partial<AiProviderAttempt>,
      ) => {
        const row = rows.get(where.providerAttemptId);
        if (
          !row ||
          row.status !== where.status ||
          (where.requestSent !== undefined &&
            row.requestSent !== where.requestSent)
        )
          return { affected: 0 };
        Object.assign(row, changes);
        return { affected: 1 };
      },
    ),
  };
  const now = new Date('2026-08-28T15:00:00.000Z');
  const recorder = new AiProviderAttemptRecorder(
    repository as never,
    jest
      .fn()
      .mockReturnValueOnce(IDS.providerAttemptOne)
      .mockReturnValueOnce(IDS.providerAttemptTwo),
    () => now,
  );
  return { recorder, repository, rows, now, canonicalJobIds, outboxIds };
}

function startInput(attemptNumber: number) {
  return {
    requestId: IDS.request,
    traceId: IDS.trace,
    operationAttemptId: IDS.operation,
    outboxId: IDS.outbox,
    jobId: IDS.job,
    attemptNumber,
    provider: ' bedrock_cohere\n',
    model: ' cohere.embed-multilingual-v3 ',
  };
}

describe('AiProviderAttemptRecorder', () => {
  it('persists a complete lifecycle without holding a transaction across the provider call', async () => {
    const harness = createHarness();

    const handle = await harness.recorder.start(startInput(1));
    const started = harness.rows.get(handle.providerAttemptId);
    expect(started).toMatchObject({
      providerAttemptId: IDS.providerAttemptOne,
      requestId: IDS.request,
      traceId: IDS.trace,
      operationAttemptId: IDS.operation,
      outboxId: IDS.outbox,
      jobId: IDS.job,
      attemptNumber: 1,
      provider: 'bedrock_cohere',
      model: 'cohere.embed-multilingual-v3',
      requestSent: false,
      status: AiProviderAttemptStatus.STARTED,
      startedAt: harness.now,
    });

    await harness.recorder.markRequestSent(handle);
    expect(started?.requestSent).toBe(true);
    expect(started?.status).toBe(AiProviderAttemptStatus.STARTED);

    await harness.recorder.succeed(handle, {
      inputTokens: 12,
      outputTokens: 3,
      totalTokens: 15,
      estimatedCost: 0.123456789,
      provider: 'bedrock_cohere',
      model: 'cohere.embed-multilingual-v3',
    });

    expect(started).toMatchObject({
      status: AiProviderAttemptStatus.SUCCEEDED,
      requestSent: true,
      inputTokens: 12,
      outputTokens: 3,
      totalTokens: 15,
      estimatedCost: '0.12345679',
      completedAt: harness.now,
    });
    expect(harness.repository.update).toHaveBeenCalledTimes(2);
  });

  it('uses existing canonical job and outbox IDs for a delete attempt lifecycle', async () => {
    const harness = createHarness();
    const handle = await harness.recorder.start(startInput(3));

    await harness.recorder.markRequestSent(handle);
    await harness.recorder.succeed(handle, { requestSent: true });

    expect(harness.canonicalJobIds).toContain(IDS.job);
    expect(harness.outboxIds).toContain(IDS.outbox);
    expect(harness.rows.get(handle.providerAttemptId)).toMatchObject({
      outboxId: IDS.outbox,
      jobId: IDS.job,
      attemptNumber: 3,
      requestSent: true,
      status: AiProviderAttemptStatus.SUCCEEDED,
    });
  });

  it('closes an UNKNOWN report before handoff as a non-sent failure', async () => {
    const harness = createHarness();
    const handle = await harness.recorder.start(startInput(1));

    await harness.recorder.unknown(handle, 'AI_PROVIDER_TIMEOUT');

    expect(harness.rows.get(handle.providerAttemptId)).toMatchObject({
      status: AiProviderAttemptStatus.FAILED,
      requestSent: false,
      errorCode: 'AI_PROVIDER_UNKNOWN_BEFORE_SEND',
      completedAt: harness.now,
    });
  });

  it('records ambiguous network outcomes as UNKNOWN with a stable bounded error code', async () => {
    const harness = createHarness();
    const handle = await harness.recorder.start(startInput(2));

    // The local handoff is supplied as completion metadata; the recorder must
    // atomically promote the still-unsent STARTED row.
    await harness.recorder.unknown(handle, 'AI_PROVIDER_TIMEOUT', {
      requestSent: true,
    });

    expect(harness.rows.get(handle.providerAttemptId)).toMatchObject({
      status: AiProviderAttemptStatus.UNKNOWN,
      requestSent: true,
      errorCode: 'AI_PROVIDER_TIMEOUT',
      completedAt: harness.now,
    });
  });

  it('keeps audit input bounded and excludes prompt, CV, raw response, and token data', async () => {
    const harness = createHarness();
    const sensitiveInput = {
      ...startInput(1),
      prompt: 'PRIVATE PROMPT',
      cvText: 'PRIVATE CV TEXT',
      rawProviderResponse: 'PRIVATE PROVIDER RESPONSE',
      token: 'secret-token',
    };

    await harness.recorder.start(sensitiveInput as never);

    const persisted = harness.repository.create.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(JSON.stringify(persisted)).not.toContain('PRIVATE');
    expect(Object.keys(persisted)).not.toEqual(
      expect.arrayContaining([
        'prompt',
        'cvText',
        'rawProviderResponse',
        'token',
      ]),
    );
    expect(String(persisted.provider).length).toBeLessThanOrEqual(80);
    expect(String(persisted.model).length).toBeLessThanOrEqual(256);
  });

  it('retains logical request identity while assigning unique provider IDs and delivery attempt numbers', async () => {
    const harness = createHarness();

    const first = await harness.recorder.start(startInput(1));
    const second = await harness.recorder.start(startInput(2));

    expect(second.providerAttemptId).not.toBe(first.providerAttemptId);
    expect(harness.rows.get(first.providerAttemptId)?.requestId).toBe(
      IDS.request,
    );
    expect(harness.rows.get(second.providerAttemptId)?.requestId).toBe(
      IDS.request,
    );
    expect(harness.rows.get(first.providerAttemptId)?.attemptNumber).toBe(1);
    expect(harness.rows.get(second.providerAttemptId)?.attemptNumber).toBe(2);
  });
});
