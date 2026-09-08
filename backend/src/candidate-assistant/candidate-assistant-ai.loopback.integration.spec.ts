import { ConfigService } from '@nestjs/config';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { generateKeyPairSync } from 'crypto';
import { resolve } from 'path';
import { AiServiceClient } from 'src/ai-matching/ai-service.client';
import { CandidateAssistantAiServiceClient } from './candidate-assistant-ai.client';
import {
  AiChatMessageRole,
  AiChatSessionMode,
} from './candidate-assistant.types';

jest.setTimeout(30_000);

type ServiceKeys = {
  privatePem: string;
  publicPem: string;
};

const ids = {
  request: '11111111-1111-4111-8111-111111111111',
  trace: '22222222-2222-4222-8222-222222222222',
  attempt: '33333333-3333-4333-8333-333333333333',
  message: '44444444-4444-4444-8444-444444444444',
  user: '55555555-5555-4555-8555-555555555555',
  session: '66666666-6666-4666-8666-666666666666',
  job: '77777777-7777-4777-8777-777777777777',
  company: '88888888-8888-4888-8888-888888888888',
};

function serviceKeys(): ServiceKeys {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  return {
    privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

async function waitForUvicorn(
  child: ChildProcessWithoutNullStreams,
): Promise<string> {
  return new Promise((resolveUrl, reject) => {
    let output = '';
    let settled = false;
    const timeout = setTimeout(() => {
      finish(new Error(`FastAPI loopback server did not start: ${output}`));
    }, 15_000);

    const finish = (error: Error | null, url?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      error ? reject(error) : resolveUrl(url as string);
    };
    const onOutput = (chunk: Buffer) => {
      output += chunk.toString();
      const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) finish(null, `http://127.0.0.1:${match[1]}`);
    };

    child.stdout.on('data', onOutput);
    child.stderr.on('data', onOutput);
    child.once('error', (error) => finish(error));
    child.once('exit', (code, signal) => {
      finish(
        new Error(
          `FastAPI loopback server exited before startup (code=${code}, signal=${signal}): ${output}`,
        ),
      );
    });
  });
}

async function stopProcess(
  child: ChildProcessWithoutNullStreams | undefined,
): Promise<void> {
  if (!child || child.exitCode !== null) return;
  await new Promise<void>((resolveStop) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      resolveStop();
    }, 5_000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolveStop();
    });
    child.kill('SIGTERM');
  });
}

describe('NestJS -> FastAPI candidate assistant RAG loopback contract', () => {
  let fastApiProcess: ChildProcessWithoutNullStreams | undefined;
  let aiServiceUrl: string;
  let keys: ServiceKeys;

  beforeAll(async () => {
    keys = serviceKeys();
    const aiServiceDirectory = resolve(__dirname, '../../..', 'ai-service');
    const launcher = resolve(
      aiServiceDirectory,
      'tests',
      'rag_loopback_launcher.py',
    );
    fastApiProcess = spawn(
      'uv',
      ['run', '--project', aiServiceDirectory, 'python', launcher],
      {
        cwd: aiServiceDirectory,
        env: {
          ...process.env,
          AI_ENVIRONMENT: 'test',
          AI_AUTH_REQUIRED: 'true',
          AI_JWT_ALGORITHMS: '["RS256"]',
          AI_JWT_PUBLIC_KEY: keys.publicPem,
          AI_JWT_ISSUER: 'https://issuer.example',
          AI_JWT_AUDIENCE: 'talentpulse-ai',
          AI_JWT_SUBJECT: 'talentpulse-backend',
          AI_RAG_RETRIEVE_SCOPE: 'rag:retrieve',
          AI_RAG_GENERATE_SCOPE: 'rag:generate',
          AI_EMBEDDING_PROVIDER: 'deterministic',
          AI_VECTOR_STORE_PROVIDER: 'memory',
          AI_GENERATION_PROVIDER: 'deterministic',
          AI_COHERE_DIMENSIONS: '32',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    aiServiceUrl = await waitForUvicorn(fastApiProcess);
  });

  afterAll(async () => {
    await stopProcess(fastApiProcess);
  });

  it('retrieves a canonical job and sends hydrated grounded context through generation', async () => {
    const aiServiceClient = new AiServiceClient(
      new ConfigService({
        AI_SERVICE_URL: aiServiceUrl,
        AI_SERVICE_TIMEOUT_MS: '5000',
        AI_SERVICE_ISSUER: 'https://issuer.example',
        AI_SERVICE_AUDIENCE: 'talentpulse-ai',
        AI_SERVICE_JWT_ALGORITHM: 'RS256',
        AI_SERVICE_JWT_PRIVATE_KEY: keys.privatePem,
        AI_SERVICE_JWT_SUBJECT: 'talentpulse-backend',
        AI_RAG_RETRIEVE_SCOPE: 'rag:retrieve',
        AI_RAG_GENERATE_SCOPE: 'rag:generate',
      }),
    );
    const candidateClient = new CandidateAssistantAiServiceClient(
      aiServiceClient,
    );
    const retrieveRag = jest.spyOn(aiServiceClient, 'retrieveRag');
    const generateRag = jest.spyOn(aiServiceClient, 'generateRag');

    const response = await candidateClient.generate({
      requestId: ids.request,
      traceId: ids.trace,
      operationAttemptId: ids.attempt,
      clientMessageId: ids.message,
      userId: ids.user,
      sessionId: ids.session,
      mode: AiChatSessionMode.ADVICE,
      message: 'Find advice for a senior Python backend role in Hanoi.',
      history: [
        {
          role: AiChatMessageRole.USER,
          content: 'I prefer backend engineering.',
        },
      ],
      jobs: [
        {
          id: ids.job,
          title: 'Backend Engineer',
          description: 'Build reliable backend services.',
          skills: ['Python', 'PostgreSQL'],
          location: 'Hanoi',
          level: 'senior',
          salary: 3000,
          company: { id: ids.company, name: 'Synthetic Systems' },
        },
      ],
      filters: {},
    });

    expect(retrieveRag).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: expect.objectContaining({
          request_id: ids.request,
          trace_id: ids.trace,
        }),
      }),
    );
    expect(retrieveRag.mock.results[0]?.value).toBeDefined();
    const retrieval = await retrieveRag.mock.results[0].value;
    expect(retrieval).toEqual(
      expect.objectContaining({
        request_id: ids.request,
        trace_id: ids.trace,
        job_ids: [ids.job],
        results: [
          expect.objectContaining({
            job_id: ids.job,
            rank: 1,
            score: 0.93,
          }),
        ],
      }),
    );

    const generated = await generateRag.mock.results[0].value;
    expect(generated).toEqual(
      expect.objectContaining({
        request_id: ids.request,
        trace_id: ids.trace,
        client_message_id: ids.message,
        answer_status: 'DEGRADED',
        citation_keys: [],
        referenced_job_ids: [],
        degraded: true,
      }),
    );
    expect(generateRag).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: 'ADVICE',
        canonical_active_job_context: [
          {
            job_id: ids.job,
            title: 'Backend Engineer',
            company_name: 'Synthetic Systems',
            location: 'Hanoi',
            level: 'senior',
            salary: { amount: 3000, currency: 'VND' },
            skills: ['Python', 'PostgreSQL'],
            start_date: null,
            end_date: null,
          },
        ],
        retrieval_evidence: [
          {
            job_id: ids.job,
            rank: 1,
            score: 0.93,
            citation_key: `job:${ids.job}`,
          },
        ],
      }),
    );

    expect(response.blocks.length).toBeGreaterThan(0);
    expect(response.blocks[0]).toEqual(
      expect.objectContaining({ type: 'ADVICE', text: expect.any(String) }),
    );
    expect(response.citations).toEqual([]);
    expect(
      response.citations.some((citation) => citation.sourceId !== ids.job),
    ).toBe(false);
  });
});
