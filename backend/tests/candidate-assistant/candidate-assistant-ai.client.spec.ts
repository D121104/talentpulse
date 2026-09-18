import { CandidateAssistantAiServiceClient } from 'src/candidate-assistant/candidate-assistant-ai.client';
import {
  AiChatMessageRole,
  AiChatSessionMode,
} from 'src/candidate-assistant/candidate-assistant.types';

const requestIds = {
  requestId: '11111111-1111-4111-8111-111111111111',
  traceId: '22222222-2222-4222-8222-222222222222',
  operationAttemptId: '33333333-3333-4333-8333-333333333333',
  clientMessageId: '44444444-4444-4444-8444-444444444444',
  userId: '55555555-5555-4555-8555-555555555555',
  sessionId: '66666666-6666-4666-8666-666666666666',
};
const selectedJob = {
  id: '77777777-7777-4777-8777-777777777777',
  title: 'Backend Engineer',
  description: 'Build reliable APIs',
  skills: ['Node.js', 'PostgreSQL'],
  location: 'Hanoi',
  level: 'senior',
  salary: 3000,
  jobSourceVersion: 'job-source-v1',
  company: { id: '88888888-8888-4888-8888-888888888888', name: 'Example Co' },
};
const additionalJob = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  title: 'Frontend Engineer',
  description: 'Build interfaces',
  skills: ['React'],
  location: 'Da Nang',
  level: 'mid',
  salary: 2500,
  jobSourceVersion: 'job-source-v2',
  company: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Other Co' },
};
const cv = {
  cvId: '99999999-9999-4999-8999-999999999999',
  contentHash: 'a'.repeat(64),
  contentVersion: 'cv-content-v1',
  title: 'Candidate CV',
  skills: ['Node.js'],
  education: [],
  experience: [],
  certificates: [],
  sanitizedText: 'bounded synthetic CV text',
};

function comparisonRequest() {
  return {
    ...requestIds,
    mode: AiChatSessionMode.CV_JOB_COMPARISON,
    locale: 'vi-VN',
    message: 'Compare my CV with this job',
    history: [] as Array<{ role: AiChatMessageRole; content: string }>,
    jobs: [selectedJob, additionalJob],
    cv,
    filters: {},
    consentVersion: 'v1',
  };
}

describe('CandidateAssistantAiServiceClient', () => {
  it('defaults locale for legacy requests that omit it', async () => {
    const aiServiceClient = {
      retrieveRag: jest.fn().mockResolvedValue({
        request_id: requestIds.requestId,
        trace_id: requestIds.traceId,
        job_ids: [],
        results: [],
        applied_filters: {},
        unsupported_filters: [],
      }),
      generateRag: jest.fn().mockResolvedValue({
        request_id: requestIds.requestId,
        trace_id: requestIds.traceId,
        client_message_id: requestIds.clientMessageId,
        answer_status: 'COMPLETE',
        answer_blocks: [{ kind: 'ADVICE', text: 'ok' }],
        claims: [],
        citation_keys: [],
        referenced_job_ids: [],
        filters: {
          company: null,
          location: null,
          level: null,
          salary_min: null,
          salary_max: null,
          skills: [],
        },
        state_delta: {},
        degraded: false,
      }),
    };
    const client = new CandidateAssistantAiServiceClient(
      aiServiceClient as any,
    );

    await client.generate({
      ...requestIds,
      mode: AiChatSessionMode.ADVICE,
      message: 'Give advice',
      history: [],
      jobs: [],
      filters: {},
    });

    expect(aiServiceClient.retrieveRag).toHaveBeenCalledWith(
      expect.objectContaining({ locale: 'en' }),
    );
    expect(aiServiceClient.generateRag).toHaveBeenCalledWith(
      expect.objectContaining({ locale: 'en' }),
    );
  });

  it('explicitly matches the selected job and preserves it as retrieval evidence', async () => {
    const aiServiceClient = {
      retrieveRag: jest.fn().mockResolvedValue({
        request_id: requestIds.requestId,
        trace_id: requestIds.traceId,
        job_ids: [],
        results: [],
        applied_filters: {},
        unsupported_filters: [],
      }),
      matchCv: jest.fn().mockResolvedValue({
        cv_id: cv.cvId,
        job_id: selectedJob.id,
        overall_score: 0.72,
        components: {
          semantic: {
            score: 0.8,
            weight: 0.5,
            available: true,
            evidence: ['embedding'],
          },
        },
        matched_skills: ['Node.js'],
        missing_required_skills: ['PostgreSQL'],
        strengths: ['Relevant Node.js experience'],
        gaps: ['PostgreSQL is missing'],
        explanation: 'Deterministic comparison result.',
        degraded: false,
        scoring_version: 'cv-job-match-v2',
        semantic_component_version: 'configured-v1',
      }),
      generateRag: jest.fn().mockResolvedValue({
        request_id: requestIds.requestId,
        trace_id: requestIds.traceId,
        client_message_id: requestIds.clientMessageId,
        answer_status: 'COMPLETE',
        answer_blocks: [{ kind: 'ADVICE', text: 'CV có bằng chứng phù hợp.' }],
        claims: [],
        citation_keys: [`job:${selectedJob.id}`],
        referenced_job_ids: [selectedJob.id],
        filters: {
          company: null,
          location: null,
          level: null,
          salary_min: null,
          salary_max: null,
          skills: [],
        },
        state_delta: {},
        degraded: false,
      }),
    };
    const client = new CandidateAssistantAiServiceClient(
      aiServiceClient as any,
    );

    const response = await client.generate(comparisonRequest());

    expect(response.blocks[0]).toMatchObject({
      type: 'MATCH_RESULT',
      data: expect.objectContaining({
        cv_id: cv.cvId,
        job_id: selectedJob.id,
        overall_score: 0.72,
      }),
    });
    expect(response.blocks[0]).not.toHaveProperty('text');
    expect(response.blocks[1]).toMatchObject({
      type: 'ADVICE',
      text: 'CV có bằng chứng phù hợp.',
    });
    expect(aiServiceClient.matchCv).toHaveBeenCalledWith({
      identity: {
        request_id: requestIds.requestId,
        trace_id: requestIds.traceId,
        operation_attempt_id: requestIds.operationAttemptId,
      },
      cv_id: cv.cvId,
      job_id: selectedJob.id,
      content_hash: cv.contentHash,
      content_version: cv.contentVersion,
      job_source_version: selectedJob.jobSourceVersion,
      idempotency_key: expect.stringMatching(/^cv-match:/),
      locale: 'vi-VN',
      candidate: {
        skills: ['Node.js'],
        years_experience: null,
        level: null,
        location: null,
        work_modes: [],
      },
      job: {
        required_skills: ['Node.js', 'PostgreSQL'],
        preferred_skills: [],
        min_years_experience: null,
        max_years_experience: null,
        level: 'senior',
        location: 'Hanoi',
        work_modes: [],
      },
    });
    expect(aiServiceClient.generateRag).toHaveBeenCalledWith(
      expect.objectContaining({
        canonical_active_job_context: [
          expect.objectContaining({ job_id: selectedJob.id }),
          expect.objectContaining({ job_id: additionalJob.id }),
        ],
        matching_evidence: {
          cv_id: cv.cvId,
          job_id: selectedJob.id,
          overall_score: 0.72,
          components: {
            semantic: {
              score: 0.8,
              weight: 0.5,
              available: true,
              evidence: ['embedding'],
            },
          },
          matched_skills: ['Node.js'],
          missing_required_skills: ['PostgreSQL'],
          strengths: ['Relevant Node.js experience'],
          gaps: ['PostgreSQL is missing'],
          explanation: 'Deterministic comparison result.',
          degraded: false,
          scoring_version: 'cv-job-match-v2',
          semantic_component_version: 'configured-v1',
        },
        retrieval_evidence: [
          {
            job_id: selectedJob.id,
            rank: 1,
            score: 1,
            citation_key: `job:${selectedJob.id}`,
          },
        ],
      }),
    );
  });

  it('rejects a job claim and referenced ID paired with a different citation', async () => {
    const aiServiceClient = {
      retrieveRag: jest.fn().mockResolvedValue({
        request_id: requestIds.requestId,
        trace_id: requestIds.traceId,
        job_ids: [selectedJob.id, additionalJob.id],
        results: [
          {
            job_id: selectedJob.id,
            rank: 1,
            score: 0.95,
            metadata: {},
          },
          {
            job_id: additionalJob.id,
            rank: 2,
            score: 0.9,
            metadata: {},
          },
        ],
        applied_filters: {},
        unsupported_filters: [],
      }),
      generateRag: jest.fn().mockResolvedValue({
        request_id: requestIds.requestId,
        trace_id: requestIds.traceId,
        client_message_id: requestIds.clientMessageId,
        answer_status: 'COMPLETE',
        answer_blocks: [{ kind: 'INFERENCE', text: 'Forged job claim.' }],
        claims: [
          {
            claim_id: 'forged-job-claim',
            type: 'JOB_TITLE',
            subject_id: additionalJob.id,
            value: additionalJob.title,
            citation_keys: [`job:${selectedJob.id}`],
          },
        ],
        citation_keys: [`job:${selectedJob.id}`],
        referenced_job_ids: [additionalJob.id],
        filters: {
          company: null,
          location: null,
          level: null,
          salary_min: null,
          salary_max: null,
          skills: [],
        },
        state_delta: {},
        degraded: false,
      }),
    };
    const client = new CandidateAssistantAiServiceClient(
      aiServiceClient as any,
    );

    await expect(
      client.generate({
        ...requestIds,
        mode: AiChatSessionMode.JOB_SEARCH,
        message: 'Find backend and frontend jobs',
        history: [],
        jobs: [selectedJob, additionalJob],
        filters: {},
      }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('accepts legitimate claims and references for multiple cited jobs', async () => {
    const aiServiceClient = {
      retrieveRag: jest.fn().mockResolvedValue({
        request_id: requestIds.requestId,
        trace_id: requestIds.traceId,
        job_ids: [selectedJob.id, additionalJob.id],
        results: [
          {
            job_id: selectedJob.id,
            rank: 1,
            score: 0.95,
            metadata: {},
          },
          {
            job_id: additionalJob.id,
            rank: 2,
            score: 0.9,
            metadata: {},
          },
        ],
        applied_filters: {},
        unsupported_filters: [],
      }),
      generateRag: jest.fn().mockResolvedValue({
        request_id: requestIds.requestId,
        trace_id: requestIds.traceId,
        client_message_id: requestIds.clientMessageId,
        answer_status: 'COMPLETE',
        answer_blocks: [{ kind: 'INFERENCE', text: 'Two matching jobs.' }],
        claims: [
          {
            claim_id: 'selected-job-title',
            type: 'JOB_TITLE',
            subject_id: selectedJob.id,
            value: selectedJob.title,
            citation_keys: [`job:${selectedJob.id}`],
          },
          {
            claim_id: 'additional-job-title',
            type: 'JOB_TITLE',
            subject_id: additionalJob.id,
            value: additionalJob.title,
            citation_keys: [`job:${additionalJob.id}`],
          },
        ],
        citation_keys: [`job:${selectedJob.id}`, `job:${additionalJob.id}`],
        referenced_job_ids: [selectedJob.id, additionalJob.id],
        filters: {
          company: null,
          location: null,
          level: null,
          salary_min: null,
          salary_max: null,
          skills: [],
        },
        state_delta: {},
        degraded: false,
      }),
    };
    const client = new CandidateAssistantAiServiceClient(
      aiServiceClient as any,
    );

    const response = await client.generate({
      ...requestIds,
      mode: AiChatSessionMode.JOB_SEARCH,
      message: 'Find backend and frontend jobs',
      history: [],
      jobs: [selectedJob, additionalJob],
      filters: {},
    });

    expect(response.citations).toEqual([
      {
        sourceId: selectedJob.id,
        sourceType: 'JOB',
        label: selectedJob.title,
      },
      {
        sourceId: additionalJob.id,
        sourceType: 'JOB',
        label: additionalJob.title,
      },
    ]);
  });
});
