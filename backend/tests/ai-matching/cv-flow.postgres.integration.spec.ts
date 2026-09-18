import 'reflect-metadata';
import { spawn, spawnSync } from 'child_process';
import * as net from 'net';
import { resolve } from 'path';
import { createHash, generateKeyPairSync, randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { DataSource, DataSourceOptions } from 'typeorm';
import { Role } from 'src/decorator/customize';
import { User } from 'src/users/entities/user.entity';
import { Company } from 'src/companies/entities/company.entity';
import { Job } from 'src/jobs/entities/job.entity';
import { UserCV } from 'src/usercvs/entities/usercv.entity';
import { CVParseStatus } from 'src/usercvs/cv-parse-status';
import { UserCvParseProcessor } from 'src/usercvs/cv-parse.processor';
import { UserCVsService } from 'src/usercvs/usercvs.service';
import {
  Application,
  ApplicationStatus,
} from 'src/applications/entities/application.entity';
import { ApplicationAiConsentEvent } from 'src/applications/entities/application-ai-consent-event.entity';
import { getApplicationAiRankingConsentPolicy } from 'src/applications/application-ai-consent.policy';
import { ApplicationsService } from 'src/applications/applications.service';
import {
  CVMatchResult,
  CVProcessingStatus,
} from 'src/ai-matching/entities/cv-match-result.entity';
import { AiServiceClient } from 'src/ai-matching/ai-service.client';
import {
  CVProcessingProcessor,
  CVProcessingJobData,
} from 'src/ai-matching/cv-processing.processor';
import { CVProcessingService } from 'src/ai-matching/cv-processing.service';
import { getJobSourceVersion } from 'src/job-indexing/job-indexing.normalization';
import { downloadTrustedCv } from 'src/ai-matching/cv-download';

jest.mock('src/ai-matching/cv-download', () => ({
  CvDownloadError: class CvDownloadError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
  downloadTrustedCv: jest.fn(),
}));

jest.setTimeout(120_000);

const POSTGRES_IMAGE = 'postgis/postgis:16-3.4';
const POSTGRES_USER = 'postgres';
const POSTGRES_PASSWORD = 'postgres123';
const POSTGRES_DATABASE = 'cv_flow_integration';
const ids = {
  user: '00000000-0000-4000-8000-000000000401',
  company: '00000000-0000-4000-8000-000000000402',
  job: '00000000-0000-4000-8000-000000000403',
  cv: '00000000-0000-4000-8000-000000000404',
};

function dockerIsAvailable(): boolean {
  const result = spawnSync('docker', ['info'], {
    stdio: 'ignore',
    timeout: 5_000,
  });
  if (result.error || result.status !== 0) {
    process.stderr.write(
      '[cv flow integration] Docker unavailable; skipping disposable PostgreSQL coverage.\n',
    );
    return false;
  }
  return true;
}

type CommandResult = { code: number | null; stdout: string; stderr: string };

function runCommand(command: string, args: string[]): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (error: Error | null, code: number | null = null) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve({ code, stdout, stderr });
    };
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.once('error', (error) => finish(error));
    child.once('close', (code) => finish(null, code));
  });
}

async function allocateHostPort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Could not allocate PostgreSQL port');
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

function dataSourceOptions(port: number): DataSourceOptions {
  return {
    type: 'postgres',
    host: '127.0.0.1',
    port,
    username: POSTGRES_USER,
    password: POSTGRES_PASSWORD,
    database: POSTGRES_DATABASE,
    entities: [
      User,
      Company,
      Job,
      UserCV,
      Application,
      ApplicationAiConsentEvent,
      CVMatchResult,
    ],
    synchronize: false,
    logging: false,
    extra: { options: '-c timezone=UTC' },
  };
}

async function waitForDatabase(port: number): Promise<DataSource> {
  const deadline = Date.now() + 60_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    const dataSource = new DataSource(dataSourceOptions(port));
    try {
      await dataSource.initialize();
      await dataSource.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
      await dataSource.synchronize();
      return dataSource;
    } catch (error) {
      lastError = error;
      if (dataSource.isInitialized) await dataSource.destroy();
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(
    `Disposable PostgreSQL did not become ready: ${String(lastError)}`,
  );
}

async function stopProcess(
  child: ReturnType<typeof spawn> | undefined,
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

function serviceKeys(): { privatePem: string; publicPem: string } {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  return {
    privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

async function waitForUvicorn(
  child: ReturnType<typeof spawn>,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = '';
    let settled = false;
    const timeout = setTimeout(
      () =>
        finish(new Error(`FastAPI loopback server did not start: ${output}`)),
      15_000,
    );
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
    child.stdout?.on('data', onOutput);
    child.stderr?.on('data', onOutput);
    child.once('error', (error) => finish(error));
    child.once('exit', (code, signal) =>
      finish(
        new Error(
          `FastAPI exited before startup (code=${code}, signal=${signal}): ${output}`,
        ),
      ),
    );
  });
}

function pdfFixture(): Buffer {
  const lines = [
    'Jordan Lee',
    'Skills:',
    '- TypeScript',
    '- PostgreSQL',
    'Education:',
    '- BSc Computer Science',
    'Experience:',
    '- Backend Engineer at Synthetic Company',
    'Certificates:',
    '- AWS Certified Developer',
  ];
  const escapePdf = (value: string) =>
    value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const stream = `BT\n/F1 12 Tf\n72 720 Td\n${lines
    .map((line, index) => `${index ? '0 -18 Td\n' : ''}(${escapePdf(line)}) Tj`)
    .join('\n')}\nET\n`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(
      stream,
      'ascii',
    )} >>\nstream\n${stream}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${
    objects.length + 1
  } /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'ascii');
}

const hasDocker = dockerIsAvailable();
const integrationDescribe = hasDocker ? describe : describe.skip;

integrationDescribe(
  'NestJS CV parse persistence through consented matching persistence',
  () => {
    let containerName: string | undefined;
    let hostPort: number;
    let dataSource: DataSource;
    let aiServiceUrl: string;
    let fastApiProcess: ReturnType<typeof spawn> | undefined;
    let aiClient: AiServiceClient;
    let keys: { privatePem: string; publicPem: string };
    const download = downloadTrustedCv as jest.MockedFunction<
      typeof downloadTrustedCv
    >;

    beforeAll(async () => {
      keys = serviceKeys();
      containerName = `talentpulse-cv-flow-it-${randomUUID()}`;
      hostPort = await allocateHostPort();
      const started = await runCommand('docker', [
        'run',
        '--detach',
        '--name',
        containerName,
        '--publish',
        `127.0.0.1:${hostPort}:5432`,
        '--env',
        `POSTGRES_USER=${POSTGRES_USER}`,
        '--env',
        `POSTGRES_PASSWORD=${POSTGRES_PASSWORD}`,
        '--env',
        `POSTGRES_DB=${POSTGRES_DATABASE}`,
        POSTGRES_IMAGE,
      ]);
      if (started.code !== 0)
        throw new Error(
          `Could not start disposable PostgreSQL: ${
            started.stderr || started.stdout
          }`,
        );
      dataSource = await waitForDatabase(hostPort);

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
            AI_CV_PARSE_SCOPE: 'cv:parse',
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
      aiClient = new AiServiceClient(
        new ConfigService({
          AI_SERVICE_URL: aiServiceUrl,
          AI_SERVICE_TIMEOUT_MS: '5000',
          AI_SERVICE_ISSUER: 'https://issuer.example',
          AI_SERVICE_AUDIENCE: 'talentpulse-ai',
          AI_SERVICE_JWT_ALGORITHM: 'RS256',
          AI_SERVICE_JWT_PRIVATE_KEY: keys.privatePem,
          AI_SERVICE_JWT_SUBJECT: 'talentpulse-backend',
          AI_CV_PARSE_SCOPE: 'cv:parse',
          AI_CV_MATCH_SCOPE: 'cv:match',
        }),
      );
    });

    afterEach(async () => {
      if (dataSource?.isInitialized) {
        await dataSource.query(
          'TRUNCATE TABLE "cv_match_results", "application_ai_consent_events", "applications", "user_cvs", "jobs", "companies", "users" RESTART IDENTITY CASCADE',
        );
      }
      download.mockReset();
    });

    afterAll(async () => {
      await stopProcess(fastApiProcess);
      if (dataSource?.isInitialized) await dataSource.destroy();
      if (containerName)
        await runCommand('docker', ['rm', '--force', containerName]);
    });

    async function seedAndParse() {
      const userRepo = dataSource.getRepository(User);
      const companyRepo = dataSource.getRepository(Company);
      const jobRepo = dataSource.getRepository(Job);
      const cvRepo = dataSource.getRepository(UserCV);
      const user = await userRepo.save(
        userRepo.create({
          _id: ids.user,
          email: 'candidate@example.test',
          password: 'synthetic-test-password',
          name: 'Jordan Lee',
          role: Role.USER,
          isDeleted: false,
        }),
      );
      const company = await companyRepo.save(
        companyRepo.create({
          _id: ids.company,
          name: 'Synthetic Company',
          address: 'Hanoi',
          isActive: true,
          isDeleted: false,
        }),
      );
      const job = await jobRepo.save(
        jobRepo.create({
          _id: ids.job,
          name: 'Backend Engineer',
          description: 'Canonical synthetic job description',
          skills: ['TypeScript', 'PostgreSQL'],
          company: { _id: company._id, name: company.name },
          level: 'senior',
          location: 'Hanoi',
          isActive: true,
          isDeleted: false,
        }),
      );
      const contentVersion = 'cv-content-v1';
      const cv = await cvRepo.save(
        cvRepo.create({
          _id: ids.cv,
          url: 'https://res.cloudinary.com/test/raw/upload/resume.pdf',
          fileType: 'pdf',
          title: 'Jordan Lee CV',
          userId: user._id,
          contentVersion,
          parseStatus: CVParseStatus.PENDING,
          isPrimary: true,
          isSearchable: true,
          isDeleted: false,
          skills: [],
          education: [],
          experience: [],
          certificates: [],
          warnings: [],
        }),
      );
      await dataSource.query(
        'UPDATE "user_cvs" SET "contentVersion" = $1 WHERE "_id" = $2',
        [contentVersion, cv._id],
      );

      const content = pdfFixture();
      download.mockResolvedValue(content);
      const parseProcessor = new UserCvParseProcessor(
        cvRepo,
        aiClient,
        new ConfigService({
          AI_CV_ALLOWED_HOSTS: 'res.cloudinary.com',
          CLOUD_NAME: 'test',
        }),
      );
      await parseProcessor.handleParse({
        data: {
          cvId: cv._id,
          fileUrl: cv.url,
          expectedUrl: cv.url,
          contentVersion,
        },
      } as any);
      const parsed = await cvRepo.findOneByOrFail({ _id: cv._id });
      return {
        user,
        company,
        job,
        parsed,
        userRepo,
        companyRepo,
        jobRepo,
        cvRepo,
      };
    }

    function applicationServices(
      fixture: Awaited<ReturnType<typeof seedAndParse>>,
    ) {
      const applicationRepo = dataSource.getRepository(Application);
      const consentEventRepo = dataSource.getRepository(
        ApplicationAiConsentEvent,
      );
      const resultRepo = dataSource.getRepository(CVMatchResult);
      const queued = { add: jest.fn().mockResolvedValue(undefined) };
      const processingService = new CVProcessingService(
        resultRepo,
        queued as any,
      );
      const userCvsService = new UserCVsService(
        fixture.cvRepo,
        {} as any,
        {} as any,
      );
      const applicationsService = new ApplicationsService(
        applicationRepo,
        resultRepo,
        fixture.companyRepo,
        consentEventRepo,
        dataSource,
        { findAllByCompanyId: jest.fn().mockResolvedValue([]) } as any,
        userCvsService,
        { create: jest.fn() } as any,
        processingService,
        new ConfigService(),
        { findOne: jest.fn().mockResolvedValue(fixture.job) } as any,
        {} as any,
      );
      return {
        applicationRepo,
        consentEventRepo,
        resultRepo,
        queued,
        processingService,
        applicationsService,
      };
    }

    it('persists parsed fields, admits valid consent, queues opaque fences, and persists canonical match output', async () => {
      const fixture = await seedAndParse();
      expect(fixture.parsed).toEqual(
        expect.objectContaining({
          parseStatus: CVParseStatus.READY,
          contentHash: createHash('sha256').update(pdfFixture()).digest('hex'),
          parsedText: expect.stringContaining('TypeScript'),
          skills: ['TypeScript', 'PostgreSQL'],
          education: ['BSc Computer Science'],
          experience: ['Backend Engineer at Synthetic Company'],
          certificates: ['AWS Certified Developer'],
          parserVersion: 'structured-parser-v1',
        }),
      );
      expect(fixture.parsed.parsedAt).toEqual(expect.any(Date));

      const services = applicationServices(fixture);
      const applicationResponse = await services.applicationsService.create(
        {
          cvId: fixture.parsed._id,
          jobId: fixture.job._id,
          companyId: fixture.company._id,
          aiRankingConsent: true,
        },
        {
          _id: fixture.user._id,
          email: fixture.user.email,
          name: fixture.user.name,
          role: Role.USER,
        } as any,
      );
      const application = await services.applicationRepo.findOneByOrFail({
        _id: applicationResponse._id,
      });
      const policy = getApplicationAiRankingConsentPolicy(new ConfigService());
      expect(application).toEqual(
        expect.objectContaining({
          status: ApplicationStatus.PENDING,
          aiRankingConsentGranted: true,
          aiRankingConsentVersion: policy.consentVersion,
          aiRankingConsentPolicyHash: policy.policyHash,
          aiRankingConsentAt: expect.any(Date),
        }),
      );
      expect(
        await services.consentEventRepo.findOneByOrFail({
          applicationId: application._id,
        }),
      ).toEqual(
        expect.objectContaining({
          granted: true,
          consentVersion: policy.consentVersion,
          policyHash: policy.policyHash,
        }),
      );

      expect(services.queued.add).toHaveBeenCalledTimes(1);
      const queuePayload = services.queued.add.mock
        .calls[0][1] as CVProcessingJobData;
      expect(services.queued.add.mock.calls[0][0]).toBe('process-cv');
      expect(queuePayload).toEqual(
        expect.objectContaining({
          cvId: fixture.parsed._id,
          applicationId: application._id,
          jobId: fixture.job._id,
          cvContentVersion: fixture.parsed.contentVersion,
          contentHash: fixture.parsed.contentHash,
          jobSourceVersion: getJobSourceVersion(fixture.job, fixture.company),
          aiRankingConsentGranted: true,
        }),
      );
      expect(queuePayload).not.toHaveProperty('cvText');
      expect(queuePayload).not.toHaveProperty('parsedText');
      expect(queuePayload).not.toHaveProperty('candidate');
      expect(queuePayload).not.toHaveProperty('job');

      const processor = new CVProcessingProcessor(
        aiClient,
        services.resultRepo,
        fixture.cvRepo,
        fixture.jobRepo,
        fixture.companyRepo,
        services.applicationRepo,
      );
      const processingResponse = await processor.handleProcessCV({
        data: queuePayload,
      } as any);
      const persisted = await services.resultRepo.findOneByOrFail({
        _id: queuePayload.cvMatchResultId,
      });
      expect(processingResponse).toEqual({
        success: true,
        matchScore: persisted.matchScore,
      });
      expect(persisted).toEqual(
        expect.objectContaining({
          status: CVProcessingStatus.COMPLETED,
          cvId: fixture.parsed._id,
          applicationId: application._id,
          jobId: fixture.job._id,
          contentHash: fixture.parsed.contentHash,
          jobSourceVersion: queuePayload.jobSourceVersion,
          matchScore: expect.any(Number),
          matchedSkills: ['TypeScript', 'PostgreSQL'],
          missingSkills: [],
          scoringVersion: 'cv-job-match-v2',
          modelVersion: 'deterministic-v1',
          normalizationVersion: 'cv-job-normalization-v1',
          degraded: false,
          components: expect.objectContaining({
            semantic: expect.objectContaining({ available: true }),
            skills: expect.objectContaining({ score: 1, available: true }),
          }),
          compatibility: expect.objectContaining({
            matchedSkills: ['TypeScript', 'PostgreSQL'],
            missingRequiredSkills: [],
            semanticComponentVersion: 'deterministic-v1',
          }),
        }),
      );
      expect(persisted.matchScore).toBeGreaterThan(0);
      expect(persisted.matchScore).toBeLessThanOrEqual(1);
      expect(persisted.explanation).not.toContain(
        'Canonical synthetic job description',
      );
    });

    it('rejects a queued match after the canonical job source version changes', async () => {
      const fixture = await seedAndParse();
      const services = applicationServices(fixture);
      await services.applicationsService.create(
        {
          cvId: fixture.parsed._id,
          jobId: fixture.job._id,
          companyId: fixture.company._id,
          aiRankingConsent: true,
        },
        {
          _id: fixture.user._id,
          email: fixture.user.email,
          name: fixture.user.name,
          role: Role.USER,
        } as any,
      );
      const queuePayload = services.queued.add.mock
        .calls[0][1] as CVProcessingJobData;
      await fixture.jobRepo.update(fixture.job._id, {
        description: 'Changed canonical job',
      });

      const matchSpy = jest.spyOn(aiClient, 'matchCv');
      const processor = new CVProcessingProcessor(
        aiClient,
        services.resultRepo,
        fixture.cvRepo,
        fixture.jobRepo,
        fixture.companyRepo,
        services.applicationRepo,
      );
      await expect(
        processor.handleProcessCV({ data: queuePayload } as any),
      ).resolves.toEqual({
        success: false,
        stale: true,
      });
      expect(matchSpy).not.toHaveBeenCalled();
      const result = await services.resultRepo.findOneByOrFail({
        _id: queuePayload.cvMatchResultId,
      });
      expect(result).toEqual(
        expect.objectContaining({
          status: CVProcessingStatus.PENDING,
          matchScore: 0,
          contentHash: fixture.parsed.contentHash,
          jobSourceVersion: queuePayload.jobSourceVersion,
        }),
      );
      matchSpy.mockRestore();
    });
  },
);
