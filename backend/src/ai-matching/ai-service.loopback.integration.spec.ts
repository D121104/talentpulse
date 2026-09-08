import { ConfigService } from '@nestjs/config';
import { resolve } from 'path';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { generateKeyPairSync } from 'crypto';
import { ApplicationStatus } from 'src/applications/entities/application.entity';
import { CVParseStatus } from 'src/usercvs/cv-parse-status';
import { getJobSourceVersion } from 'src/job-indexing/job-indexing.normalization';
import { AiServiceClient } from './ai-service.client';
import {
  consentIdempotencyKey,
  CVProcessingJobData,
  CVProcessingProcessor,
} from './cv-processing.processor';
import { CVProcessingStatus } from './entities/cv-match-result.entity';

jest.setTimeout(30_000);

type ServiceKeys = {
  privatePem: string;
  publicPem: string;
};

const ids = {
  result: '00000000-0000-4000-8000-000000000101',
  cv: '00000000-0000-4000-8000-000000000102',
  application: '00000000-0000-4000-8000-000000000103',
  user: '00000000-0000-4000-8000-000000000104',
  job: '00000000-0000-4000-8000-000000000105',
  company: '00000000-0000-4000-8000-000000000106',
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
  if (!child || child.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 5_000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

describe('NestJS -> FastAPI CV matching loopback contract', () => {
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
          AI_CV_MATCH_SCOPE: 'cv:match',
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

  it('accepts a real signed match request and persists only bounded canonical metadata', async () => {
    const updatedAt = new Date('2026-01-01T00:00:00.000Z');
    const company = {
      _id: ids.company,
      name: 'Acme',
      isActive: true,
      isDeleted: false,
      deletedAt: null,
      updatedAt,
    } as any;
    const recruitmentJob = {
      _id: ids.job,
      name: 'Backend Engineer',
      description:
        'Canonical job description must not cross the structured match boundary.',
      skills: ['TypeScript', 'Python'],
      level: 'senior',
      location: 'Hanoi',
      company: { _id: ids.company, name: company.name },
      isDeleted: false,
      deletedAt: null,
      updatedAt,
    } as any;
    const cv = {
      _id: ids.cv,
      userId: ids.user,
      contentVersion: 'cv-v1',
      contentHash: 'a'.repeat(64),
      parseStatus: CVParseStatus.READY,
      parsedText:
        'Synthetic CV text must not cross the structured match boundary.',
      skills: ['TypeScript', 'Python'],
      yearsExperience: null,
      level: 'senior',
      location: 'Hanoi',
      isDeleted: false,
      deletedAt: null,
    } as any;
    const application = {
      _id: ids.application,
      cvId: ids.cv,
      userId: ids.user,
      jobId: ids.job,
      isDeleted: false,
      deletedAt: null,
      status: ApplicationStatus.PENDING,
      aiRankingConsentGranted: true,
      aiRankingConsentVersion: 'application-ai-ranking-v1',
      aiRankingConsentPolicyHash: 'b'.repeat(64),
      aiRankingConsentAt: new Date('2026-01-02T00:00:00.000Z'),
    } as any;
    const result = {
      _id: ids.result,
      cvId: ids.cv,
      userId: ids.user,
      applicationId: ids.application,
      jobId: ids.job,
      contentHash: cv.contentHash,
      jobSourceVersion: getJobSourceVersion(recruitmentJob, company),
      isDeleted: false,
      deletedAt: null,
      status: CVProcessingStatus.PENDING,
    } as any;
    const data: CVProcessingJobData = {
      cvMatchResultId: ids.result,
      cvId: ids.cv,
      applicationId: ids.application,
      userId: ids.user,
      jobId: ids.job,
      cvContentVersion: cv.contentVersion,
      contentHash: cv.contentHash,
      jobSourceVersion: result.jobSourceVersion,
      aiRankingConsentGranted: true,
      aiRankingConsentVersion: application.aiRankingConsentVersion,
      aiRankingConsentPolicyHash: application.aiRankingConsentPolicyHash,
      consentIdempotencyKey: consentIdempotencyKey(
        ids.application,
        cv.contentVersion,
        result.jobSourceVersion,
      ),
    };

    const resultRepo = {
      findOne: jest.fn().mockResolvedValue(result),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const cvRepo = { findOne: jest.fn().mockResolvedValue(cv) };
    const jobRepo = { findOne: jest.fn().mockResolvedValue(recruitmentJob) };
    const companyRepo = { findOne: jest.fn().mockResolvedValue(company) };
    const applicationRepo = {
      findOne: jest.fn().mockResolvedValue(application),
    };
    const client = new AiServiceClient(
      new ConfigService({
        AI_SERVICE_URL: aiServiceUrl,
        AI_SERVICE_TIMEOUT_MS: '5000',
        AI_SERVICE_ISSUER: 'https://issuer.example',
        AI_SERVICE_AUDIENCE: 'talentpulse-ai',
        AI_SERVICE_JWT_ALGORITHM: 'RS256',
        AI_SERVICE_JWT_PRIVATE_KEY: keys.privatePem,
        AI_SERVICE_JWT_SUBJECT: 'talentpulse-backend',
        AI_CV_MATCH_SCOPE: 'cv:match',
      }),
    );
    const processor = new CVProcessingProcessor(
      client,
      resultRepo as any,
      cvRepo as any,
      jobRepo as any,
      companyRepo as any,
      applicationRepo as any,
    );
    const matchCv = jest.spyOn(client, 'matchCv');

    const processResponse = await processor.handleProcessCV({ data } as any);
    const aiResponse = await matchCv.mock.results[0].value;
    const processingPayload = resultRepo.update.mock.calls[0]?.[1] as Record<
      string,
      unknown
    >;
    const persisted = resultRepo.update.mock.calls.at(-1)?.[1] as Record<
      string,
      unknown
    >;

    expect(processResponse).toEqual({ success: true, matchScore: 1 });
    expect(matchCv).toHaveBeenCalledWith(
      expect.objectContaining({
        cv_id: ids.cv,
        job_id: ids.job,
      }),
    );
    expect(aiResponse).toEqual(
      expect.objectContaining({
        cv_id: ids.cv,
        job_id: ids.job,
        overall_score: 1,
        components: expect.objectContaining({
          semantic: expect.objectContaining({ score: 1, available: true }),
          skills: expect.objectContaining({ score: 1, available: true }),
          location: expect.objectContaining({ score: 1, available: true }),
        }),
      }),
    );
    expect(processingPayload).toEqual(
      expect.objectContaining({
        contentHash: data.contentHash,
        jobSourceVersion: data.jobSourceVersion,
        status: CVProcessingStatus.PROCESSING,
      }),
    );
    expect(persisted).toEqual(
      expect.objectContaining({
        matchScore: 1,
        matchedSkills: ['TypeScript', 'Python'],
        missingSkills: [],
        scoringVersion: 'cv-job-match-v2',
        modelVersion: 'deterministic-v1',
        normalizationVersion: 'cv-job-normalization-v1',
        degraded: false,
        status: CVProcessingStatus.COMPLETED,
        processedAt: expect.any(Date),
      }),
    );
    expect(persisted.compatibility).toEqual(
      expect.objectContaining({
        matchedSkills: ['TypeScript', 'Python'],
        missingRequiredSkills: [],
        strengths: [
          'Matches 2 required skill(s).',
          'Experience and level are compatible with the job.',
        ],
        gaps: [],
        semanticComponentVersion: 'deterministic-v1',
        experience: expect.objectContaining({
          score: 1,
          weight: 0.15,
          available: true,
        }),
        location: expect.objectContaining({
          score: 1,
          weight: 0,
          available: true,
        }),
        workMode: expect.objectContaining({
          score: 0,
          weight: 0,
          available: false,
        }),
      }),
    );

    const components = persisted.components as Record<
      string,
      Record<string, unknown>
    >;
    expect(Object.keys(components).sort()).toEqual([
      'experience',
      'location',
      'semantic',
      'skills',
      'work_mode',
    ]);
    expect(components.semantic).toEqual(
      expect.objectContaining({ score: expect.any(Number), available: true }),
    );
    expect(components.skills).toEqual(
      expect.objectContaining({ score: 1, available: true }),
    );
    expect(
      Object.values(components).every((component) => {
        const evidence = component.evidence;
        return Array.isArray(evidence) && evidence.length <= 20;
      }),
    ).toBe(true);
    expect(String(persisted.explanation).length).toBeLessThanOrEqual(2_000);
    expect(resultRepo.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        _id: ids.result,
        cvId: ids.cv,
        jobId: ids.job,
        applicationId: ids.application,
        contentHash: data.contentHash,
        jobSourceVersion: data.jobSourceVersion,
        status: CVProcessingStatus.PROCESSING,
      }),
      expect.any(Object),
    );
  });
});
