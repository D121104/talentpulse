import { AiServiceClient } from './ai-client.service';
import { AiCircuitBreaker } from './circuit-breaker';
import { AiServiceHttpTransport } from './http.transport';
import { ServiceJwtIssuer } from './service-jwt.provider';
import { RagDataScope, RagRetrieveRequest } from './contracts/rag.contracts';
import { ServiceJwtScope } from './contracts/service-jwt.contracts';
import {
  IndexJobDeleteRequest,
  IndexJobUpsertRequest,
} from './contracts/indexing.contracts';

const request: RagRetrieveRequest = {
  identity: {
    request_id: '11111111-1111-4111-8111-111111111111',
    trace_id: '22222222-2222-4222-8222-222222222222',
    operation_attempt_id: '33333333-3333-4333-8333-333333333333',
    client_message_id: '44444444-4444-4444-8444-444444444444',
    user_id: '55555555-5555-4555-8555-555555555555',
    session_id: '66666666-6666-4666-8666-666666666666',
  },
  normalized_user_message: 'find backend jobs',
  locale: 'en-US',
  recent_history: [],
  filter_state: { skills: [] },
  explicit_filters: {},
  filter_provenance: {},
  policy: {
    data_scope: RagDataScope.PublicActiveJobs,
    max_candidates: 20,
    max_context_jobs: 8,
  },
};

const config = {
  get: jest.fn((key: string, fallback?: unknown) =>
    key === 'AI_SERVICE_URL' ? 'http://ai-service:8000' : fallback,
  ),
};

const indexJobRequest: IndexJobUpsertRequest = {
  job: {
    job_id: '77777777-7777-4777-8777-777777777777',
    title: 'Backend Engineer',
    description: 'Build APIs',
    skills: ['TypeScript'],
    company_id: '88888888-8888-4888-8888-888888888888',
    company_name: 'Acme Labs',
    location: 'Ha Noi',
    level: 'MID',
    salary: 30_000_000,
    salary_currency: 'VND',
    start_date: '2026-08-01T00:00:00Z',
    end_date: '2026-09-30T00:00:00Z',
    updated_at: '2026-08-27T11:00:00Z',
    is_active: true,
    is_deleted: false,
    company_is_active: true,
    company_is_deleted: false,
  },
  idempotency_key: 'outbox-event-1',
  source_version: 3,
};

const indexJobDeleteRequest: IndexJobDeleteRequest = {
  job_id: indexJobRequest.job.job_id,
  idempotency_key: 'outbox-delete-1',
  source_version: 4,
};

function createAuditRecorder() {
  const handles = [
    { providerAttemptId: '11111111-1111-4111-8111-111111111111' },
    { providerAttemptId: '22222222-2222-4222-8222-222222222222' },
    { providerAttemptId: '33333333-3333-4333-8333-333333333333' },
  ];
  return {
    handles,
    start: jest.fn().mockImplementation(async () => handles.shift()),
    markRequestSent: jest.fn().mockResolvedValue(undefined),
    succeed: jest.fn().mockResolvedValue(undefined),
    fail: jest.fn().mockResolvedValue(undefined),
    unknown: jest.fn().mockResolvedValue(undefined),
  };
}

function createPersistentAuditRecorder() {
  const rows = new Map<
    string,
    {
      requestId: string;
      traceId: string;
      operationAttemptId?: string | null;
      outboxId?: string | null;
      jobId?: string | null;
      attemptNumber: number;
      requestSent: boolean;
      status: 'STARTED' | 'SUCCEEDED';
    }
  >();
  const providerAttemptId = '12121212-1212-4121-8121-121212121212';
  return {
    rows,
    start: jest.fn(async (input) => {
      rows.set(providerAttemptId, {
        ...input,
        requestSent: false,
        status: 'STARTED',
      });
      return { providerAttemptId };
    }),
    markRequestSent: jest.fn(async () => {
      const row = rows.get(providerAttemptId);
      if (row) row.requestSent = true;
    }),
    succeed: jest.fn(async () => {
      const row = rows.get(providerAttemptId);
      if (row) row.status = 'SUCCEEDED';
    }),
    fail: jest.fn(),
    unknown: jest.fn(),
  };
}

describe('AiServiceClient', () => {
  it('sends canonical JSON, service auth, and correlation headers', async () => {
    const transport: AiServiceHttpTransport = {
      post: jest.fn().mockResolvedValue({
        request_id: request.identity.request_id,
        trace_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        job_ids: [],
        results: [],
        applied_filters: {},
        unsupported_filters: [],
      }),
    };
    const auth: ServiceJwtIssuer = {
      issue: jest
        .fn()
        .mockResolvedValue({ token: 'service-token', claims: {} as never }),
    };
    const client = new AiServiceClient(
      config as never,
      transport,
      auth,
      new AiCircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1000 }),
      () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      () => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    );
    await client.retrieve(request);

    expect(auth.issue).toHaveBeenCalledWith(ServiceJwtScope.RagRetrieve);
    expect(transport.post).toHaveBeenCalledWith(
      'http://ai-service:8000/internal/v1/rag/retrieve',
      expect.objectContaining({
        identity: expect.objectContaining({
          request_id: request.identity.request_id,
          trace_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          operation_attempt_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        }),
        normalized_user_message: 'find backend jobs',
      }),
      expect.objectContaining({
        timeoutMs: expect.any(Number),
        headers: expect.objectContaining({
          Authorization: 'Bearer service-token',
          'X-Request-ID': request.identity.request_id,
          'X-Trace-ID': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        }),
      }),
    );
  });

  it('maps timeout and then stops calling the dependency when the circuit opens', async () => {
    const transport: AiServiceHttpTransport = {
      post: jest.fn().mockRejectedValue({ code: 'ECONNABORTED' }),
    };
    const auth: ServiceJwtIssuer = {
      issue: jest
        .fn()
        .mockResolvedValue({ token: 'service-token', claims: {} as never }),
    };
    const client = new AiServiceClient(
      config as never,
      transport,
      auth,
      new AiCircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 60_000 }),
    );

    await expect(client.retrieve(request)).rejects.toMatchObject({
      code: 'AI_PROVIDER_TIMEOUT',
      status: 504,
    });
    await expect(client.retrieve(request)).rejects.toMatchObject({
      code: 'AI_CIRCUIT_OPEN',
      status: 503,
    });
    expect(transport.post).toHaveBeenCalledTimes(1);
    expect(auth.issue).toHaveBeenCalledTimes(1);
  });

  it('issues the generate-specific scope', async () => {
    const transport: AiServiceHttpTransport = {
      post: jest.fn().mockResolvedValue({
        request_id: request.identity.request_id,
        trace_id: request.identity.trace_id,
        client_message_id: request.identity.client_message_id,
        answer_status: 'NO_EVIDENCE',
        answer_blocks: [],
        claims: [],
        citation_keys: [],
        referenced_job_ids: [],
        filters: { skills: [] },
        state_delta: {},
        degraded: false,
      }),
    };
    const auth: ServiceJwtIssuer = {
      issue: jest
        .fn()
        .mockResolvedValue({ token: 'service-token', claims: {} as never }),
    };
    const client = new AiServiceClient(
      config as never,
      transport,
      auth,
      new AiCircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1000 }),
      () => request.identity.trace_id,
    );
    await client.generate({
      identity: request.identity,
      normalized_user_message: request.normalized_user_message,
      intent: 'JOB_SEARCH',
      locale: request.locale,
      filter_state: request.filter_state,
      canonical_active_job_context: [],
      retrieval_evidence: [],
      explicit_filters: request.explicit_filters,
      policy: request.policy,
    });
    expect(auth.issue).toHaveBeenCalledWith(ServiceJwtScope.RagGenerate);
  });

  it('upserts through the JobsIndex endpoint with stable body idempotency and current response correlation', async () => {
    const requestId = '99999999-9999-4999-8999-999999999999';
    const traceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const transport: AiServiceHttpTransport = {
      post: jest.fn().mockResolvedValue({
        request_id: requestId,
        job_id: indexJobRequest.job.job_id,
        operation: 'UPSERT',
        status: 'INDEXED',
        source_version: indexJobRequest.source_version,
        chunk_count: 1,
        embedded: true,
      }),
    };
    const auth: ServiceJwtIssuer = {
      issue: jest
        .fn()
        .mockResolvedValue({ token: 'service-token', claims: {} as never }),
    };
    const client = new AiServiceClient(
      config as never,
      transport,
      auth,
      new AiCircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1000 }),
      () => traceId,
      () => requestId,
    );

    await client.indexJob(indexJobRequest);
    await client.indexJob(indexJobRequest);

    expect(auth.issue).toHaveBeenCalledWith(ServiceJwtScope.JobsIndex);
    expect(transport.post).toHaveBeenNthCalledWith(
      1,
      'http://ai-service:8000/internal/v1/index/jobs/upsert',
      expect.objectContaining({
        job: expect.objectContaining({
          job_id: indexJobRequest.job.job_id,
          company_id: indexJobRequest.job.company_id,
        }),
        idempotency_key: indexJobRequest.idempotency_key,
        source_version: indexJobRequest.source_version,
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer service-token',
          'X-Request-ID': requestId,
          'X-Trace-ID': traceId,
        }),
      }),
    );
    const firstBody = (transport.post as jest.Mock).mock.calls[0][1] as Record<
      string,
      unknown
    >;
    const secondBody = (transport.post as jest.Mock).mock.calls[1][1] as Record<
      string,
      unknown
    >;
    expect(firstBody).not.toHaveProperty('identity');
    expect(secondBody).toEqual(firstBody);
    expect((secondBody.job as Record<string, unknown>).description).toBe(
      'Build APIs',
    );
  });

  it('records one successful provider attempt while keeping logical IDs stable and traces fresh', async () => {
    const requestId = '99999999-9999-4999-8999-999999999999';
    const operationAttemptId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const traceIds = [
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    ];
    const transport: AiServiceHttpTransport = {
      post: jest.fn().mockImplementation(async () => ({
        request_id: requestId,
        job_id: indexJobRequest.job.job_id,
        operation: 'UPSERT',
        status: 'INDEXED',
        source_version: indexJobRequest.source_version,
        chunk_count: 1,
        embedded: true,
      })),
    };
    const auth: ServiceJwtIssuer = {
      issue: jest
        .fn()
        .mockResolvedValue({ token: 'service-token', claims: {} as never }),
    };
    const audit = createAuditRecorder();
    const client = new AiServiceClient(
      config as never,
      transport,
      auth,
      new AiCircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1000 }),
      jest.fn(() => traceIds.shift() as string),
      jest.fn(() => operationAttemptId),
      audit as never,
    );

    await client.indexJob(indexJobRequest, {
      requestId,
      operationAttemptId,
      jobId: indexJobRequest.job.job_id,
      attemptNumber: 2,
    });
    await client.indexJob(indexJobRequest, {
      requestId,
      operationAttemptId,
      jobId: indexJobRequest.job.job_id,
      attemptNumber: 3,
    });

    expect(audit.start).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        requestId,
        operationAttemptId,
        jobId: indexJobRequest.job.job_id,
        attemptNumber: 2,
      }),
    );
    expect(audit.start).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        requestId,
        operationAttemptId,
        jobId: indexJobRequest.job.job_id,
        attemptNumber: 3,
      }),
    );
    expect(audit.start.mock.calls[0][0].traceId).not.toBe(
      audit.start.mock.calls[1][0].traceId,
    );
    expect(audit.markRequestSent).toHaveBeenCalledTimes(2);
    expect(audit.succeed).toHaveBeenCalledTimes(2);
    expect(audit.fail).not.toHaveBeenCalled();
    expect(audit.unknown).not.toHaveBeenCalled();
  });

  it('closes pre-transport auth failures as FAILED and transport timeouts as UNKNOWN', async () => {
    const requestId = '99999999-9999-4999-8999-999999999999';
    const traceId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const authFailureAudit = createAuditRecorder();
    const authFailureClient = new AiServiceClient(
      config as never,
      { post: jest.fn() },
      { issue: jest.fn().mockRejectedValue({ code: 'ECONNREFUSED' }) } as never,
      new AiCircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1000 }),
      () => traceId,
      () => requestId,
      authFailureAudit as never,
    );

    await expect(
      authFailureClient.indexJob(indexJobRequest, { requestId, traceId }),
    ).rejects.toMatchObject({ code: 'AI_DEPENDENCY_UNAVAILABLE' });
    expect(authFailureAudit.fail).toHaveBeenCalledWith(
      expect.anything(),
      'AI_DEPENDENCY_UNAVAILABLE',
      { requestSent: false },
    );
    expect(authFailureAudit.unknown).not.toHaveBeenCalled();

    const timeoutAudit = createAuditRecorder();
    const timeoutClient = new AiServiceClient(
      config as never,
      { post: jest.fn().mockRejectedValue({ code: 'ECONNABORTED' }) },
      {
        issue: jest
          .fn()
          .mockResolvedValue({ token: 'service-token', claims: {} as never }),
      },
      new AiCircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1000 }),
      () => traceId,
      () => requestId,
      timeoutAudit as never,
    );

    await expect(
      timeoutClient.indexJob(indexJobRequest, { requestId, traceId }),
    ).rejects.toMatchObject({ code: 'AI_PROVIDER_TIMEOUT' });
    expect(timeoutAudit.unknown).toHaveBeenCalledWith(
      expect.anything(),
      'AI_PROVIDER_TIMEOUT',
      { requestSent: true },
    );
    expect(timeoutAudit.fail).not.toHaveBeenCalled();
  });

  it('scans metadata through the JobsIndex endpoint with auth, timeout, and correlation headers', async () => {
    const requestId = '99999999-9999-4999-8999-999999999999';
    const traceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const transport: AiServiceHttpTransport = {
      post: jest.fn().mockResolvedValue({
        points: [],
        next_cursor: null,
        request_id: requestId,
      }),
    };
    const auth: ServiceJwtIssuer = {
      issue: jest
        .fn()
        .mockResolvedValue({ token: 'service-token', claims: {} as never }),
    };
    const client = new AiServiceClient(
      config as never,
      transport,
      auth,
      new AiCircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1000 }),
      () => traceId,
      () => requestId,
    );

    await expect(
      client.scanIndexPoints(
        { cursor: '7', limit: 2, job_id: indexJobRequest.job.job_id },
        { requestId, traceId },
      ),
    ).resolves.toMatchObject({
      points: [],
      next_cursor: null,
      request_id: requestId,
    });

    expect(auth.issue).toHaveBeenCalledWith(ServiceJwtScope.JobsIndex);
    expect(transport.post).toHaveBeenCalledWith(
      'http://ai-service:8000/internal/v1/index/points/scan',
      { cursor: '7', limit: 2, job_id: indexJobRequest.job.job_id },
      expect.objectContaining({
        timeoutMs: expect.any(Number),
        headers: expect.objectContaining({
          Authorization: 'Bearer service-token',
          'X-Request-ID': requestId,
          'X-Trace-ID': traceId,
        }),
      }),
    );
  });

  it('scans read-only metadata without creating provider-attempt audit rows', async () => {
    const requestId = '99999999-9999-4999-8999-999999999999';
    const traceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const audit = createAuditRecorder();
    const client = new AiServiceClient(
      config as never,
      {
        post: jest.fn().mockResolvedValue({
          points: [],
          next_cursor: null,
          request_id: requestId,
        }),
      },
      {
        issue: jest
          .fn()
          .mockResolvedValue({ token: 'service-token', claims: {} as never }),
      },
      new AiCircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1000 }),
      () => traceId,
      () => requestId,
      audit,
    );

    await expect(
      client.scanIndexPoints(
        { job_id: indexJobRequest.job.job_id, limit: 2 },
        { readOnly: true, requestId, traceId },
      ),
    ).resolves.toMatchObject({ points: [], request_id: requestId });
    expect(audit.start).not.toHaveBeenCalled();
    expect(audit.markRequestSent).not.toHaveBeenCalled();
    expect(audit.succeed).not.toHaveBeenCalled();
  });

  it('rejects a metadata scan response correlated to a different request', async () => {
    const requestId = '99999999-9999-4999-8999-999999999999';
    const transport: AiServiceHttpTransport = {
      post: jest.fn().mockResolvedValue({
        points: [],
        next_cursor: null,
        request_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      }),
    };
    const auth: ServiceJwtIssuer = {
      issue: jest
        .fn()
        .mockResolvedValue({ token: 'service-token', claims: {} as never }),
    };
    const client = new AiServiceClient(
      config as never,
      transport,
      auth,
      new AiCircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1000 }),
      () => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      () => requestId,
    );

    await expect(
      client.scanIndexPoints({}, { requestId }),
    ).rejects.toMatchObject({
      code: 'AI_INVALID_MODEL_OUTPUT',
      status: 502,
    });
  });

  it.each(['DELETED', 'ALREADY_DELETED'] as const)(
    'persists the %s delete-attempt lifecycle with canonical job and outbox correlation',
    async (status) => {
      const requestId = '99999999-9999-4999-8999-999999999999';
      const traceId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
      const operationAttemptId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      const outboxId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
      const audit = createPersistentAuditRecorder();
      const transport: AiServiceHttpTransport = {
        post: jest.fn().mockResolvedValue({
          request_id: requestId,
          job_id: indexJobDeleteRequest.job_id,
          operation: 'DELETE',
          status,
          source_version: indexJobDeleteRequest.source_version,
          point_ids: [],
          deleted_point_ids: [],
          chunk_count: 0,
          embedded: false,
        }),
      };
      const client = new AiServiceClient(
        config as never,
        transport,
        {
          issue: jest
            .fn()
            .mockResolvedValue({ token: 'service-token', claims: {} as never }),
        },
        new AiCircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1000 }),
        () => traceId,
        () => operationAttemptId,
        audit as never,
      );

      await expect(
        client.deleteIndexedJob(indexJobDeleteRequest, {
          requestId,
          operationAttemptId,
          outboxId,
          jobId: indexJobDeleteRequest.job_id,
          attemptNumber: 2,
        }),
      ).resolves.toMatchObject({ status });

      expect(audit.rows.get('12121212-1212-4121-8121-121212121212')).toEqual(
        expect.objectContaining({
          requestId,
          traceId,
          operationAttemptId,
          outboxId,
          jobId: indexJobDeleteRequest.job_id,
          attemptNumber: 2,
          requestSent: true,
          status: 'SUCCEEDED',
        }),
      );
      expect(audit.markRequestSent).toHaveBeenCalledTimes(1);
      expect(audit.succeed).toHaveBeenCalledTimes(1);
    },
  );

  it('fails closed before HTTP when the audit handoff update is unavailable', async () => {
    const transport: AiServiceHttpTransport = { post: jest.fn() };
    const auth: ServiceJwtIssuer = {
      issue: jest
        .fn()
        .mockResolvedValue({ token: 'service-token', claims: {} as never }),
    };
    const audit = createAuditRecorder();
    audit.markRequestSent.mockRejectedValueOnce(
      new Error('database unavailable'),
    );
    const client = new AiServiceClient(
      config as never,
      transport,
      auth,
      new AiCircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1000 }),
      () => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      audit as never,
    );

    await expect(
      client.deleteIndexedJob(indexJobDeleteRequest),
    ).rejects.toMatchObject({
      code: 'AI_PROVIDER_AUDIT_PERSISTENCE_FAILED',
      status: 503,
      retryable: true,
    });
    expect(transport.post).not.toHaveBeenCalled();
    expect(audit.fail).toHaveBeenCalledWith(
      expect.anything(),
      'AI_PROVIDER_AUDIT_PERSISTENCE_FAILED',
      { requestSent: false },
    );
  });

  it('surfaces a retryable audit error when a sent request cannot be terminalized', async () => {
    const requestId = '99999999-9999-4999-8999-999999999999';
    const audit = createAuditRecorder();
    audit.fail.mockRejectedValueOnce(new Error('database unavailable'));
    const transport: AiServiceHttpTransport = {
      post: jest.fn().mockRejectedValue({ response: { status: 422 } }),
    };
    const client = new AiServiceClient(
      config as never,
      transport,
      {
        issue: jest
          .fn()
          .mockResolvedValue({ token: 'service-token', claims: {} as never }),
      },
      new AiCircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1000 }),
      () => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      () => requestId,
      audit as never,
    );

    await expect(
      client.deleteIndexedJob(indexJobDeleteRequest, { requestId }),
    ).rejects.toMatchObject({
      code: 'AI_PROVIDER_AUDIT_PERSISTENCE_FAILED',
      status: 503,
      retryable: true,
    });
    expect(audit.fail).toHaveBeenCalledWith(
      expect.anything(),
      'AI_DEPENDENCY_UNAVAILABLE',
      { requestSent: true },
    );
  });

  it('fails closed before HTTP when provider-attempt audit creation is unavailable', async () => {
    const transport: AiServiceHttpTransport = { post: jest.fn() };
    const auth: ServiceJwtIssuer = { issue: jest.fn() } as never;
    const audit = createAuditRecorder();
    audit.start.mockRejectedValueOnce(new Error('foreign key violation'));
    const client = new AiServiceClient(
      config as never,
      transport,
      auth,
      new AiCircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1000 }),
      () => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      audit as never,
    );

    await expect(
      client.deleteIndexedJob(indexJobDeleteRequest),
    ).rejects.toMatchObject({
      code: 'AI_PROVIDER_AUDIT_PERSISTENCE_FAILED',
      status: 503,
      retryable: true,
    });
    expect(auth.issue).not.toHaveBeenCalled();
    expect(transport.post).not.toHaveBeenCalled();
  });

  it('deletes through the JobsIndex endpoint without adding a RAG identity body', async () => {
    const requestId = '99999999-9999-4999-8999-999999999999';
    const traceId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const transport: AiServiceHttpTransport = {
      post: jest.fn().mockResolvedValue({
        request_id: requestId,
        job_id: indexJobDeleteRequest.job_id,
        operation: 'DELETE',
        status: 'DELETED',
        source_version: indexJobDeleteRequest.source_version,
        chunk_count: 0,
        embedded: false,
        deleted_point_ids: [],
      }),
    };
    const auth: ServiceJwtIssuer = {
      issue: jest
        .fn()
        .mockResolvedValue({ token: 'service-token', claims: {} as never }),
    };
    const client = new AiServiceClient(
      config as never,
      transport,
      auth,
      new AiCircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1000 }),
      () => traceId,
      () => requestId,
    );

    await client.deleteIndexedJob(indexJobDeleteRequest, {
      requestId,
      traceId,
    });

    expect(auth.issue).toHaveBeenCalledWith(ServiceJwtScope.JobsIndex);
    expect(transport.post).toHaveBeenCalledWith(
      'http://ai-service:8000/internal/v1/index/jobs/delete',
      {
        job_id: indexJobDeleteRequest.job_id,
        idempotency_key: indexJobDeleteRequest.idempotency_key,
        source_version: indexJobDeleteRequest.source_version,
      },
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Request-ID': requestId,
          'X-Trace-ID': traceId,
        }),
      }),
    );
  });

  it('rejects an indexing response correlated to a different request', async () => {
    const transport: AiServiceHttpTransport = {
      post: jest.fn().mockResolvedValue({
        request_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        job_id: indexJobRequest.job.job_id,
        operation: 'UPSERT',
        status: 'INDEXED',
        source_version: indexJobRequest.source_version,
        chunk_count: 1,
        embedded: true,
      }),
    };
    const auth: ServiceJwtIssuer = {
      issue: jest
        .fn()
        .mockResolvedValue({ token: 'service-token', claims: {} as never }),
    };
    const client = new AiServiceClient(
      config as never,
      transport,
      auth,
      new AiCircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1000 }),
      () => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      () => 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    );

    await expect(client.indexJob(indexJobRequest)).rejects.toMatchObject({
      code: 'AI_INVALID_MODEL_OUTPUT',
      status: 502,
    });
  });
});
