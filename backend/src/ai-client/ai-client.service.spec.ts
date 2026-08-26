import { AiServiceClient } from './ai-client.service';
import { AiCircuitBreaker } from './circuit-breaker';
import { AiServiceHttpTransport } from './http.transport';
import { ServiceJwtIssuer } from './service-jwt.provider';
import { RagDataScope, RagRetrieveRequest } from './contracts/rag.contracts';
import { ServiceJwtScope } from './contracts/service-jwt.contracts';

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
      post: jest
        .fn()
        .mockResolvedValue({
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
});
