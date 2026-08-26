import {
  assertRagGenerateRequest,
  assertRagGenerateResponse,
  assertRagRetrieveRequest,
  assertRagRetrieveResponse,
  RagDataScope,
  serializeRagRetrieveRequest,
} from './contracts/rag.contracts';
import { AiServiceError, AiServiceErrorCode } from './ai-client.errors';

const IDS = {
  request: '11111111-1111-4111-8111-111111111111',
  trace: '22222222-2222-4222-8222-222222222222',
  operation: '33333333-3333-4333-8333-333333333333',
  client: '44444444-4444-4444-8444-444444444444',
  user: '55555555-5555-4555-8555-555555555555',
  session: '66666666-6666-4666-8666-666666666666',
  job: '77777777-7777-4777-8777-777777777777',
  cv: '88888888-8888-4888-8888-888888888888',
};

function retrieveRequest() {
  return {
    identity: {
      request_id: IDS.request,
      trace_id: IDS.trace,
      operation_attempt_id: IDS.operation,
      client_message_id: IDS.client,
      user_id: IDS.user,
      session_id: IDS.session,
    },
    normalized_user_message: 'Tìm việc backend ở Hà Nội',
    locale: 'vi',
    recent_history: [
      'USER: tìm việc backend',
      'ASSISTANT: Tôi sẽ lọc việc đang tuyển',
    ],
    filter_state: { location: 'Hà Nội', skills: ['TypeScript'] },
    explicit_filters: {
      company_ids: [IDS.job],
      locations: ['Hà Nội'],
      skills_any: ['TypeScript'],
      salary_gte: 25000000,
    },
    filter_provenance: { location: 'explicit' },
    policy: {
      data_scope: RagDataScope.PublicActiveJobs,
      max_candidates: 20 as const,
      max_context_jobs: 8 as const,
    },
  };
}

describe('AI internal contracts', () => {
  it('serializes the exact nested snake_case FastAPI retrieve JSON contract', () => {
    const serialized = serializeRagRetrieveRequest(retrieveRequest());

    expect(JSON.parse(JSON.stringify(serialized))).toEqual({
      identity: {
        request_id: IDS.request,
        trace_id: IDS.trace,
        operation_attempt_id: IDS.operation,
        client_message_id: IDS.client,
        user_id: IDS.user,
        session_id: IDS.session,
      },
      normalized_user_message: 'Tìm việc backend ở Hà Nội',
      locale: 'vi',
      recent_history: [
        'USER: tìm việc backend',
        'ASSISTANT: Tôi sẽ lọc việc đang tuyển',
      ],
      filter_state: { location: 'Hà Nội', skills: ['TypeScript'] },
      explicit_filters: {
        company_ids: [IDS.job],
        locations: ['Hà Nội'],
        skills_any: ['TypeScript'],
        salary_gte: 25000000,
      },
      filter_provenance: { location: 'explicit' },
      policy: {
        data_scope: 'PUBLIC_ACTIVE_JOBS',
        max_candidates: 20,
        max_context_jobs: 8,
      },
    });
  });

  it('accepts the canonical UUID-based retrieve request and response shapes', () => {
    expect(assertRagRetrieveRequest(retrieveRequest())).toEqual(
      retrieveRequest(),
    );
    const response = {
      request_id: IDS.request,
      trace_id: IDS.trace,
      job_ids: [IDS.job],
      results: [
        {
          job_id: IDS.job,
          rank: 1,
          score: 0.91,
          metadata: { source: 'local' },
        },
      ],
      applied_filters: { location: 'Hà Nội' },
      unsupported_filters: [],
    };
    expect(assertRagRetrieveResponse(response)).toEqual(response);
  });

  it('rejects arbitrary IDs at the request boundary', () => {
    expect(() =>
      assertRagRetrieveRequest({
        ...retrieveRequest(),
        identity: { ...retrieveRequest().identity, request_id: 'request-1' },
      }),
    ).toThrow(AiServiceError);
  });

  it('enforces CV intent and consent rules without owning authorization', () => {
    const base = {
      identity: retrieveRequest().identity,
      normalized_user_message: 'compare my CV',
      intent: 'CV_JOB_COMPARISON',
      locale: 'vi',
      filter_state: { skills: [] },
      canonical_active_job_context: [],
      retrieval_evidence: [],
      explicit_filters: {},
      policy: {
        data_scope: 'PUBLIC_ACTIVE_JOBS',
        max_candidates: 20,
        max_context_jobs: 8,
      },
    };
    expect(() => assertRagGenerateRequest(base)).toThrow(AiServiceError);
    expect(() =>
      assertRagGenerateRequest({
        ...base,
        intent: 'JOB_SEARCH',
        authorized_cv_snapshot: { cv_id: IDS.cv },
      }),
    ).toThrow(AiServiceError);
  });

  it('accepts the canonical generated response and rejects unsupported answer blocks', () => {
    const response = {
      request_id: IDS.request,
      trace_id: IDS.trace,
      client_message_id: IDS.client,
      answer_status: 'COMPLETE',
      answer_blocks: [{ kind: 'ADVICE', text: 'Nêu kết quả đo được.' }],
      claims: [
        {
          claim_id: 'c1',
          type: 'SALARY',
          subject_id: IDS.job,
          value: { amount: 30000000, currency: 'VND' },
          citation_keys: ['J1'],
        },
      ],
      citation_keys: ['J1'],
      referenced_job_ids: [IDS.job],
      filters: { skills: [] },
      state_delta: {},
      degraded: false,
    };
    expect(assertRagGenerateResponse(response)).toEqual(response);
    expect(() =>
      assertRagGenerateResponse({
        ...response,
        answer_blocks: [{ kind: 'FACT', text: 'untrusted fact' }],
      }),
    ).toThrow(AiServiceError);
    try {
      assertRagGenerateResponse({ ...response, answer_status: 'COMPLETED' });
    } catch (error) {
      expect((error as AiServiceError).code).toBe(
        AiServiceErrorCode.AI_INVALID_MODEL_OUTPUT,
      );
    }
  });
});
