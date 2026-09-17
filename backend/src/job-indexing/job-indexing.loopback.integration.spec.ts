import { ConfigService } from '@nestjs/config';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { generateKeyPairSync } from 'crypto';
import { resolve } from 'path';
import { AiServiceClient } from 'src/ai-matching/ai-service.client';
import {
  buildCanonicalJobSnapshot,
  computeJobContentHash,
  deterministicJobPointId,
  getJobIndexSourceVersion,
} from './job-indexing.normalization';
import { JOB_INDEX_VERSION } from './job-indexing.constants';
import { JobIndexingService } from './job-indexing.service';

jest.setTimeout(30_000);

type ServiceKeys = {
  privatePem: string;
  publicPem: string;
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
  return new Promise((resolve, reject) => {
    let output = '';
    let settled = false;
    const timeout = setTimeout(() => {
      finish(new Error(`FastAPI loopback server did not start: ${output}`));
    }, 15_000);

    const finish = (error: Error | null, url?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      error ? reject(error) : resolve(url as string);
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
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve();
    };
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      finish();
    }, 5_000);
    child.once('exit', finish);
    child.once('error', finish);
    child.kill('SIGTERM');
  });
}

describe('NestJS -> FastAPI job indexing loopback contract', () => {
  let fastApiProcess: ChildProcessWithoutNullStreams | undefined;
  let aiServiceUrl: string;
  let keys: ServiceKeys;

  beforeAll(async () => {
    keys = serviceKeys();
    const aiServiceDirectory = resolve(__dirname, '../../..', 'ai-service');
    fastApiProcess = spawn(
      'uv',
      [
        'run',
        '--project',
        aiServiceDirectory,
        'uvicorn',
        'app.main:app',
        '--host',
        '127.0.0.1',
        '--port',
        '0',
      ],
      {
        cwd: aiServiceDirectory,
        env: {
          ...process.env,
          AI_ENVIRONMENT: 'test',
          AI_AUTH_REQUIRED: 'true',
          AI_JWT_ALGORITHMS: '["RS256"]',
          AI_JWT_ISSUER: 'https://issuer.example',
          AI_JWT_AUDIENCE: 'talentpulse-ai',
          AI_JWT_SUBJECT: 'talentpulse-backend',
          AI_JOB_INDEX_SCOPE: 'jobs:index',
          AI_EMBEDDING_PROVIDER: 'deterministic',
          AI_VECTOR_STORE_PROVIDER: 'memory',
          AI_GENERATION_PROVIDER: 'deterministic',
          AI_COHERE_DIMENSIONS: '32',
          AI_JWT_PUBLIC_KEY: keys.publicPem,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    aiServiceUrl = await waitForUvicorn(fastApiProcess);
  });

  afterAll(async () => {
    await stopProcess(fastApiProcess);
  });

  it('indexes an active canonical job over authenticated HTTP and returns completed', async () => {
    const jobId = '00000000-0000-4000-8000-000000000201';
    const companyId = '00000000-0000-4000-8000-000000000202';
    const updatedAt = new Date('2026-01-15T00:00:00.000Z');
    const company = {
      _id: companyId,
      name: 'Công ty Ánh Dương &amp; Co.',
      description: 'Synthetic company',
      address: 'Hà Nội',
      isActive: true,
      isDeleted: false,
      deletedAt: null,
      updatedAt,
    } as any;
    const job = {
      _id: jobId,
      name: '<h1>Senior &amp; Backend Engineer – Việt Nam</h1>',
      description:
        '<p>Build &amp; ship APIs — phục vụ tuyển dụng đa ngôn ngữ.</p>',
      skills: ['TypeScript &amp; Node.js', '中文 数据库', 'Python'],
      company: { _id: companyId, name: company.name },
      salary: 125000.75,
      level: 'senior',
      location: '<span>Hà Nội &amp; Remote</span>',
      startDate: new Date('2025-01-01T00:00:00.000Z'),
      endDate: new Date('2028-01-01T00:00:00.000Z'),
      isActive: true,
      isDeleted: false,
      deletedAt: null,
      updatedAt,
    } as any;
    const sourceVersion = getJobIndexSourceVersion(job, company);
    const expectedSnapshot = buildCanonicalJobSnapshot(job, company);
    const expectedContentHash = computeJobContentHash(job, company);

    const client = new AiServiceClient(
      new ConfigService({
        AI_SERVICE_URL: aiServiceUrl,
        AI_SERVICE_TIMEOUT_MS: '5000',
        AI_SERVICE_ISSUER: 'https://issuer.example',
        AI_SERVICE_AUDIENCE: 'talentpulse-ai',
        AI_SERVICE_JWT_ALGORITHM: 'RS256',
        AI_SERVICE_JWT_PRIVATE_KEY: keys.privatePem,
        AI_SERVICE_JWT_SUBJECT: 'talentpulse-backend',
        AI_JOB_INDEX_SCOPE: 'jobs:index',
      }),
    );
    const upsertJob = jest.spyOn(client, 'upsertJob');
    const service = new JobIndexingService(
      {} as any,
      {} as any,
      { findOne: jest.fn().mockResolvedValue(job) } as any,
      { findOne: jest.fn().mockResolvedValue(company) } as any,
      client,
    );
    const claim = {
      _id: '00000000-0000-4000-8000-000000000203',
      aggregateId: jobId,
      sourceVersion,
      eventType: 'JOB_CHANGED',
      attemptCount: 1,
    } as any;

    const result = await (service as any).indexClaim(claim);
    const request = upsertJob.mock.calls[0][0];
    const response = await upsertJob.mock.results[0].value;

    expect(result).toBe('completed');
    expect(request).toEqual({
      identity: {
        request_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        trace_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        operation_attempt_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      },
      job: expectedSnapshot,
      idempotency_key: expect.stringMatching(
        new RegExp(`^job-index:JOB_CHANGED:${jobId}:[0-9a-f]{64}$`),
      ),
      source_version: sourceVersion,
      representation_version: JOB_INDEX_VERSION,
      content_hash: expectedContentHash,
    });
    expect(request.job).toEqual({
      job_id: jobId,
      title: 'Senior & Backend Engineer – Việt Nam',
      description: 'Build & ship APIs — phục vụ tuyển dụng đa ngôn ngữ.',
      skills: ['Python', 'TypeScript & Node.js', '中文 数据库'],
      company_id: companyId,
      company_name: 'Công ty Ánh Dương & Co.',
      location: 'Hà Nội & Remote',
      level: 'senior',
      work_mode: null,
      employment_type: null,
      salary: 125000.75,
      salary_currency: null,
      start_date: '2025-01-01T00:00:00.000Z',
      end_date: '2028-01-01T00:00:00.000Z',
      start_date_epoch_ms: 1735689600000,
      end_date_epoch_ms: 1830297600000,
      is_active: true,
      is_deleted: false,
      company_is_active: true,
      company_is_deleted: false,
    });
    expect(request.content_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(request.idempotency_key).toHaveLength(10 + 12 + 37 + 64);

    expect(response).toEqual({
      request_id: request.identity.request_id,
      trace_id: request.identity.trace_id,
      operation_attempt_id: request.identity.operation_attempt_id,
      job_id: jobId,
      operation: 'UPSERT',
      status: 'INDEXED',
      source_version: sourceVersion,
      representation_version: JOB_INDEX_VERSION,
      point_id: deterministicJobPointId(jobId),
      content_hash: expectedContentHash,
      embedding_provider: 'deterministic',
      embedding_model: 'deterministic-v1',
      embedding_dimensions: 32,
      embedded: true,
    });

    const replayResult = await (service as any).indexClaim(claim);
    const replayRequest = upsertJob.mock.calls[1][0];
    expect(replayResult).toBe('completed');
    expect(replayRequest.identity).toEqual(request.identity);
    expect(replayRequest.idempotency_key).toBe(request.idempotency_key);
  });
});
