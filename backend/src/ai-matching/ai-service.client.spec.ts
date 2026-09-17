import axios from 'axios';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { ConfigService } from '@nestjs/config';
import { generateKeyPairSync } from 'crypto';
import {
  AiServiceClient,
  JobIndexDeleteRequest,
  JobIndexUpsertRequest,
} from './ai-service.client';

jest.mock('axios');
const request = axios.request as jest.Mock;
const config = (values: Record<string, string>) => new ConfigService(values);
const parseRequest = {
  cv_id: '00000000-0000-4000-8000-000000000001',
  filename: 'cv.pdf',
  media_type: 'application/pdf' as const,
  content_base64: 'JVBERi0=',
  content_version: 1,
};
const matchRequest = {
  identity: {
    request_id: '00000000-0000-4000-8000-000000000011',
    trace_id: '00000000-0000-4000-8000-000000000012',
    operation_attempt_id: '00000000-0000-4000-8000-000000000013',
  },
  cv_id: '00000000-0000-4000-8000-000000000001',
  job_id: '00000000-0000-4000-8000-000000000002',
  content_hash: 'a'.repeat(64),
  content_version: 'cv-content-v1',
  job_source_version: 'job-source-v1',
  idempotency_key: 'cv-match:00000000-0000-4000-8000-000000000001:fixture-v1',
  locale: 'en',
  candidate: {
    skills: ['TypeScript'],
    years_experience: null,
    level: null,
    location: null,
    work_modes: [],
  },
  job: {
    required_skills: ['TypeScript'],
    preferred_skills: [],
    min_years_experience: null,
    max_years_experience: null,
    level: null,
    location: null,
    work_modes: [],
  },
};
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const auth = {
  AI_SERVICE_URL: 'https://ai.internal',
  AI_SERVICE_ISSUER: 'backend',
  AI_SERVICE_AUDIENCE: 'ai',
  AI_SERVICE_JWT_ALGORITHM: 'RS256',
  AI_SERVICE_JWT_PRIVATE_KEY: privateKey
    .export({ type: 'pkcs8', format: 'pem' })
    .toString(),
};

const parseResponse = {
  cv_id: parseRequest.cv_id,
  content_version: parseRequest.content_version,
  media_type: parseRequest.media_type,
  content_sha256: 'a'.repeat(64),
  extracted_text: 'text',
  text_char_count: 4,
  parser_version: 'v1',
};
const matchResponse = {
  request_id: matchRequest.identity.request_id,
  trace_id: matchRequest.identity.trace_id,
  operation_attempt_id: matchRequest.identity.operation_attempt_id,
  cv_id: matchRequest.cv_id,
  job_id: matchRequest.job_id,
  content_hash: matchRequest.content_hash,
  content_version: matchRequest.content_version,
  job_source_version: matchRequest.job_source_version,
  idempotency_key: matchRequest.idempotency_key,
  locale: matchRequest.locale,
  overall_score: 0.8,
  components: {},
  matched_skills: ['TypeScript'],
  missing_required_skills: [],
  strengths: [],
  gaps: [],
  explanation: 'matched',
  degraded: false,
  scoring_version: 'v1',
  semantic_component_version: 'v1',
};
const claimsFromRequest = (requestConfig: {
  headers?: Record<string, string>;
}) => {
  const token = requestConfig.headers?.Authorization?.replace('Bearer ', '');
  if (!token) throw new Error('Missing service token');
  const payload = token.split('.')[1];
  return JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
    scope: string;
    sub: string;
  };
};
const scopeFromRequest = (requestConfig: {
  headers?: Record<string, string>;
}) => claimsFromRequest(requestConfig).scope;

describe('AiServiceClient', () => {
  beforeEach(() => request.mockReset());
  it('checks FastAPI health without signing a provider request', async () => {
    const client = new AiServiceClient(
      config({ AI_SERVICE_URL: 'https://ai.internal' }),
    );
    request.mockResolvedValue({ status: 200, data: { status: 'ok' } });

    await expect(client.checkReadiness()).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: 'https://ai.internal/health',
        timeout: 1000,
      }),
    );
    expect(request.mock.calls[0][0].headers).toBeUndefined();
  });

  it('uses the bounded extended timeout for local Ollama calls', async () => {
    const client = new AiServiceClient(
      config({
        ...auth,
        NODE_ENV: 'development',
        AI_SERVICE_TIMEOUT_MS: '180000',
      }),
    );
    request.mockResolvedValue({ status: 200, data: parseResponse });

    await client.parseCv(parseRequest);

    expect(request.mock.calls[0][0].timeout).toBe(180000);
  });

  it('keeps the deployment timeout cap outside local runtimes', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'demo';
    try {
      const client = new AiServiceClient(
        config({
          ...auth,
          AI_SERVICE_TIMEOUT_MS: '180000',
        }),
      );
      request.mockResolvedValue({ status: 200, data: parseResponse });

      await client.parseCv(parseRequest);

      expect(request.mock.calls[0][0].timeout).toBe(10000);
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it('sanitizes FastAPI health failures and keeps the timeout bounded', async () => {
    const client = new AiServiceClient(
      config({ AI_SERVICE_URL: 'https://ai.internal' }),
    );
    request.mockRejectedValue(
      Object.assign(new Error('provider secret'), { code: 'ETIMEDOUT' }),
    );

    await expect(client.checkReadiness(60000)).resolves.toBe(false);
    expect(request.mock.calls[0][0].timeout).toBe(1000);
  });

  it('emits the exact default service subject', async () => {
    const client = new AiServiceClient(config(auth));
    request.mockResolvedValue({ status: 200, data: parseResponse });

    await client.parseCv(parseRequest);

    expect(claimsFromRequest(request.mock.calls[0][0])).toMatchObject({
      sub: 'talentpulse-backend',
      scope: 'cv:parse',
    });
  });

  it('emits a configured service subject unchanged with the endpoint scope', async () => {
    const client = new AiServiceClient(
      config({ ...auth, AI_SERVICE_JWT_SUBJECT: 'configured-ai-client' }),
    );
    request.mockResolvedValue({ status: 200, data: parseResponse });

    await client.parseCv(parseRequest);

    expect(claimsFromRequest(request.mock.calls[0][0])).toMatchObject({
      sub: 'configured-ai-client',
      scope: 'cv:parse',
    });
  });

  it('uses endpoint-specific default scopes and does not reuse tokens across scopes', async () => {
    const client = new AiServiceClient(config(auth));
    request.mockResolvedValue({ status: 200, data: parseResponse });

    await client.parseCv(parseRequest);
    const parseToken = request.mock.calls[0][0].headers.Authorization;
    await client.parseCv(parseRequest);
    const parseTokenAgain = request.mock.calls[1][0].headers.Authorization;

    request.mockResolvedValue({ status: 200, data: matchResponse });
    await client.matchCv(matchRequest);
    const matchToken = request.mock.calls[2][0].headers.Authorization;

    request.mockResolvedValue({ status: 200, data: { results: [] } });
    await client.retrieveRag({ query: 'jobs' });
    const retrieveToken = request.mock.calls[3][0].headers.Authorization;

    request.mockResolvedValue({ status: 200, data: { answer: 'result' } });
    await client.generateRag({ query: 'jobs' });
    const generateToken = request.mock.calls[4][0].headers.Authorization;

    expect(scopeFromRequest(request.mock.calls[0][0])).toBe('cv:parse');
    expect(scopeFromRequest(request.mock.calls[2][0])).toBe('cv:match');
    expect(scopeFromRequest(request.mock.calls[3][0])).toBe('rag:retrieve');
    expect(scopeFromRequest(request.mock.calls[4][0])).toBe('rag:generate');
    expect(parseTokenAgain).toBe(parseToken);
    expect(
      new Set([parseToken, matchToken, retrieveToken, generateToken]).size,
    ).toBe(4);
  });
  it('uses configured operation scopes exactly', async () => {
    const client = new AiServiceClient(
      config({
        ...auth,
        AI_CV_PARSE_SCOPE: 'internal:parse',
        AI_CV_MATCH_SCOPE: 'internal:match',
        AI_RAG_RETRIEVE_SCOPE: 'internal:retrieve',
        AI_RAG_GENERATE_SCOPE: 'internal:generate',
      }),
    );
    request.mockResolvedValue({ status: 200, data: parseResponse });
    await client.parseCv(parseRequest);
    expect(scopeFromRequest(request.mock.calls[0][0])).toBe('internal:parse');

    request.mockResolvedValue({ status: 200, data: matchResponse });
    await client.matchCv(matchRequest);
    expect(scopeFromRequest(request.mock.calls[1][0])).toBe('internal:match');

    request.mockResolvedValue({ status: 200, data: { results: [] } });
    await client.retrieveRag({ query: 'jobs' });
    expect(scopeFromRequest(request.mock.calls[2][0])).toBe(
      'internal:retrieve',
    );

    request.mockResolvedValue({ status: 200, data: { answer: 'result' } });
    await client.generateRag({ query: 'jobs' });
    expect(scopeFromRequest(request.mock.calls[3][0])).toBe(
      'internal:generate',
    );
  });
  it('rejects missing authentication configuration without making a request', async () => {
    await expect(
      new AiServiceClient(
        new ConfigService({ AI_SERVICE_URL: 'https://ai.internal' }),
      ).parseCv(parseRequest),
    ).rejects.toMatchObject({ code: 'AI_SERVICE_NOT_CONFIGURED' });
    expect(request).not.toHaveBeenCalled();
  });
  it('maps timeout and provider errors to sanitized codes', async () => {
    const client = new AiServiceClient(config(auth));
    request.mockRejectedValueOnce(
      Object.assign(new Error('secret'), {
        code: 'ETIMEDOUT',
        isAxiosError: true,
        toJSON: () => ({}),
      }),
    );
    await expect(client.matchCv(matchRequest)).rejects.toMatchObject({
      code: 'AI_SERVICE_TIMEOUT',
      message: 'AI service request timed out',
    });
    request.mockResolvedValueOnce({
      status: 422,
      data: { detail: { code: 'parse_failed', message: 'private details' } },
    });
    await expect(client.matchCv(matchRequest)).rejects.toMatchObject({
      code: 'AI_SERVICE_REJECTED',
      message: 'AI service rejected the request',
    });
  });
  it('validates the shared CV match golden fixture and preserves its metadata', async () => {
    const fixture = JSON.parse(
      readFileSync(
        resolve(__dirname, '../../../contracts/cv-match-v1.json'),
        'utf8',
      ),
    ) as { request: typeof matchRequest; response: typeof matchResponse };
    const client = new AiServiceClient(config(auth));
    request.mockResolvedValue({ status: 200, data: fixture.response });

    await expect(client.matchCv(fixture.request)).resolves.toEqual(
      fixture.response,
    );
    expect(request.mock.calls[0][0].data).toEqual(fixture.request);
  });

  it('rejects response identity/version mismatches and unsupported fields', async () => {
    const client = new AiServiceClient(config(auth));
    request.mockResolvedValue({
      status: 200,
      data: {
        cv_id: '00000000-0000-4000-8000-000000000003',
        content_version: 1,
        media_type: 'application/pdf',
        content_sha256: 'a'.repeat(64),
        extracted_text: 'text',
        text_char_count: 4,
        parser_version: 'v1',
      },
    });
    await expect(client.parseCv(parseRequest)).rejects.toMatchObject({
      code: 'AI_INVALID_RESPONSE',
    });
  });
});

const jobIndexUpsertRequest: JobIndexUpsertRequest = {
  identity: {
    request_id: '00000000-0000-4000-8000-000000000011',
    trace_id: '00000000-0000-4000-8000-000000000012',
    operation_attempt_id: '00000000-0000-4000-8000-000000000013',
  },
  job: {
    job_id: '00000000-0000-4000-8000-000000000002',
    title: 'Backend Engineer',
    description: 'Build APIs',
    skills: ['PostgreSQL', 'TypeScript'],
    company_id: '00000000-0000-4000-8000-000000000001',
    company_name: 'Acme',
    location: 'Hanoi',
    level: 'senior',
    work_mode: null,
    employment_type: null,
    salary: 100,
    salary_currency: null,
    start_date: '2025-01-01T00:00:00.000Z',
    end_date: '2027-01-01T00:00:00.000Z',
    start_date_epoch_ms: 1735689600000,
    end_date_epoch_ms: 1798761600000,
    is_active: true,
    is_deleted: false,
    company_is_active: true,
    company_is_deleted: false,
  },
  idempotency_key: 'job-index:JOB_CHANGED:job-1:source:demo-v1',
  source_version: 'source-version',
  representation_version: 'demo-v1',
  content_hash: 'b'.repeat(64),
};

const jobIndexDeleteRequest: JobIndexDeleteRequest = {
  identity: jobIndexUpsertRequest.identity,
  job_id: jobIndexUpsertRequest.job.job_id,
  idempotency_key: jobIndexUpsertRequest.idempotency_key,
  source_version: jobIndexUpsertRequest.source_version,
  representation_version: jobIndexUpsertRequest.representation_version,
};

function jobIndexResponse(
  request: JobIndexUpsertRequest | JobIndexDeleteRequest,
  operation: 'UPSERT' | 'DELETE',
  status:
    | 'INDEXED'
    | 'DELETED'
    | 'ALREADY_DELETED'
    | 'SKIPPED_INACTIVE' = operation === 'UPSERT' ? 'INDEXED' : 'DELETED',
) {
  const jobId = 'job_id' in request ? request.job_id : request.job.job_id;
  return {
    request_id: request.identity.request_id,
    trace_id: request.identity.trace_id,
    operation_attempt_id: request.identity.operation_attempt_id,
    job_id: jobId,
    operation,
    status,
    source_version: request.source_version,
    representation_version: request.representation_version,
    point_id: '00000000-0000-4000-8000-000000000022',
    content_hash:
      operation === 'UPSERT'
        ? status === 'SKIPPED_INACTIVE'
          ? null
          : (request as JobIndexUpsertRequest).content_hash
        : null,
    embedding_provider: 'cohere',
    embedding_model: 'cohere.embed-multilingual-v3',
    embedding_dimensions: 1024,
    embedded: operation === 'UPSERT' && status !== 'SKIPPED_INACTIVE',
  };
}

describe('AiServiceClient job indexing boundary', () => {
  beforeEach(() => request.mockReset());

  it('sends exact upsert JSON and the jobs:index scope', async () => {
    const client = new AiServiceClient(config(auth));
    request.mockResolvedValue({
      status: 200,
      data: jobIndexResponse(jobIndexUpsertRequest, 'UPSERT'),
    });

    await client.upsertJob(jobIndexUpsertRequest);

    const requestConfig = request.mock.calls[0][0];
    expect(requestConfig.url).toBe(
      'https://ai.internal/internal/v1/index/jobs/upsert',
    );
    expect(requestConfig.method).toBe('POST');
    expect(requestConfig.data).toEqual(jobIndexUpsertRequest);
    expect(scopeFromRequest(requestConfig)).toBe('jobs:index');
    expect(requestConfig.timeout).toBe(10000);
  });

  it('sends exact delete JSON and reuses the jobs:index token', async () => {
    const client = new AiServiceClient(config(auth));
    request
      .mockResolvedValueOnce({
        status: 200,
        data: jobIndexResponse(jobIndexDeleteRequest, 'DELETE'),
      })
      .mockResolvedValueOnce({
        status: 200,
        data: jobIndexResponse(
          jobIndexDeleteRequest,
          'DELETE',
          'ALREADY_DELETED',
        ),
      });

    await client.deleteJob(jobIndexDeleteRequest);
    await client.deleteJob(jobIndexDeleteRequest);

    expect(request.mock.calls[0][0].url).toBe(
      'https://ai.internal/internal/v1/index/jobs/delete',
    );
    expect(request.mock.calls[0][0].data).toEqual(jobIndexDeleteRequest);
    expect(scopeFromRequest(request.mock.calls[0][0])).toBe('jobs:index');
    expect(request.mock.calls[1][0].headers.Authorization).toBe(
      request.mock.calls[0][0].headers.Authorization,
    );
  });

  it('uses a configured jobs:index scope', async () => {
    const client = new AiServiceClient(
      config({ ...auth, AI_JOB_INDEX_SCOPE: 'internal:jobs-index' }),
    );
    request.mockResolvedValue({
      status: 200,
      data: jobIndexResponse(jobIndexUpsertRequest, 'UPSERT'),
    });

    await client.upsertJob(jobIndexUpsertRequest);

    expect(scopeFromRequest(request.mock.calls[0][0])).toBe(
      'internal:jobs-index',
    );
  });

  it('sanitizes timeout, 4xx, 5xx and auth errors', async () => {
    const client = new AiServiceClient(config(auth));
    request.mockRejectedValueOnce(
      Object.assign(new Error('private timeout details'), {
        code: 'ETIMEDOUT',
      }),
    );
    await expect(client.upsertJob(jobIndexUpsertRequest)).rejects.toMatchObject(
      {
        code: 'AI_SERVICE_TIMEOUT',
        message: 'AI service request timed out',
        retryable: true,
      },
    );

    request.mockResolvedValueOnce({ status: 422, data: { detail: 'secret' } });
    await expect(client.upsertJob(jobIndexUpsertRequest)).rejects.toMatchObject(
      {
        code: 'AI_SERVICE_REJECTED',
        message: 'AI service rejected the request',
        retryable: false,
      },
    );

    request.mockResolvedValueOnce({ status: 503, data: { detail: 'secret' } });
    await expect(client.deleteJob(jobIndexDeleteRequest)).rejects.toMatchObject(
      {
        code: 'AI_SERVICE_REJECTED',
        message: 'AI service rejected the request',
        retryable: true,
      },
    );

    request.mockResolvedValueOnce({ status: 401, data: { detail: 'secret' } });
    await expect(client.deleteJob(jobIndexDeleteRequest)).rejects.toMatchObject(
      {
        code: 'AI_SERVICE_AUTH_FAILED',
        message: 'AI service authentication failed',
      },
    );
  });

  it('accepts SKIPPED_INACTIVE as a terminal successful upsert', async () => {
    const client = new AiServiceClient(config(auth));
    request.mockResolvedValue({
      status: 200,
      data: jobIndexResponse(
        jobIndexUpsertRequest,
        'UPSERT',
        'SKIPPED_INACTIVE',
      ),
    });

    await expect(
      client.upsertJob(jobIndexUpsertRequest),
    ).resolves.toMatchObject({
      status: 'SKIPPED_INACTIVE',
      operation: 'UPSERT',
      embedded: false,
      content_hash: null,
    });
  });

  it('rejects malformed job index responses', async () => {
    const client = new AiServiceClient(config(auth));
    request.mockResolvedValueOnce({
      status: 200,
      data: {
        ...jobIndexResponse(jobIndexUpsertRequest, 'UPSERT'),
        job_id: '00000000-0000-4000-8000-000000000099',
      },
    });
    await expect(client.upsertJob(jobIndexUpsertRequest)).rejects.toMatchObject(
      {
        code: 'AI_INVALID_RESPONSE',
      },
    );

    request.mockResolvedValueOnce({
      status: 200,
      data: {
        ...jobIndexResponse(jobIndexDeleteRequest, 'DELETE'),
        unsupported: true,
      },
    });
    await expect(client.deleteJob(jobIndexDeleteRequest)).rejects.toMatchObject(
      {
        code: 'AI_INVALID_RESPONSE',
      },
    );

    request.mockResolvedValueOnce({
      status: 200,
      data: {
        ...jobIndexResponse(jobIndexUpsertRequest, 'UPSERT'),
        content_hash: 'a'.repeat(64),
      },
    });
    await expect(client.upsertJob(jobIndexUpsertRequest)).rejects.toMatchObject(
      {
        code: 'AI_INVALID_RESPONSE',
      },
    );

    request.mockResolvedValueOnce({
      status: 200,
      data: {
        ...jobIndexResponse(jobIndexUpsertRequest, 'UPSERT'),
        representation_version: 'local-ollama-v1',
      },
    });
    await expect(client.upsertJob(jobIndexUpsertRequest)).rejects.toMatchObject(
      {
        code: 'AI_INVALID_RESPONSE',
      },
    );
  });
});
