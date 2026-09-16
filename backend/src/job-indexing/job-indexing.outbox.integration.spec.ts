import { spawn, spawnSync } from 'child_process';
import * as net from 'net';
import { randomUUID } from 'crypto';
import { DataSource, DataSourceOptions } from 'typeorm';
import { Job } from 'src/jobs/entities/job.entity';
import { Company } from 'src/companies/entities/company.entity';
import {
  JobIndexDeleteRequest,
  JobIndexingClient,
  JobIndexResponse,
  JobIndexUpsertRequest,
} from 'src/ai-matching/ai-service.client';
import { JobIndexOutbox } from './entities/job-index-outbox.entity';
import { JobIndexOutbox20260907170000 } from 'src/database/migrations/20260907170000-JobIndexOutbox';
import { JobIndexOutboxRepresentationVersion20260915000000 } from 'src/database/migrations/20260915000000-JobIndexOutboxRepresentationVersion';
import {
  deterministicJobPointId,
  getJobSourceVersion,
} from './job-indexing.normalization';
import { JOB_EMBEDDING_DIMENSIONS } from './job-indexing.constants';
import { JobIndexingService } from './job-indexing.service';
import { JobIndexingSubscriber } from './job-indexing.subscriber';

jest.setTimeout(120_000);

const POSTGRES_IMAGE = 'postgis/postgis:16-3.4';
const POSTGRES_USER = 'postgres';
const POSTGRES_PASSWORD = 'postgres123';
const POSTGRES_DATABASE = 'job_index_integration';
const JOB_ID = '00000000-0000-4000-8000-000000000301';
const COMPANY_ID = '00000000-0000-4000-8000-000000000302';

type CommandResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

type JobIndexRequest = JobIndexUpsertRequest | JobIndexDeleteRequest;

function dockerIsAvailable(): boolean {
  const result = spawnSync('docker', ['info'], {
    stdio: 'ignore',
    timeout: 5_000,
  });
  if (result.error || result.status !== 0) {
    process.stderr.write(
      '[job-index outbox integration] Docker is unavailable; skipping disposable PostgreSQL coverage.\n',
    );
    return false;
  }
  return true;
}

function runCommand(command: string, args: string[]): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (error: Error | null, code: number | null = null) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve({ code, stdout, stderr });
    };
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.once('error', (error: Error) => finish(error));
    child.once('close', (code: number | null) => finish(null, code));
  });
}

async function allocateHostPort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Could not determine disposable PostgreSQL host port');
  }
  const port = address.port;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

function dataSourceOptions(
  port: number,
  includeMigration: boolean,
  includeCanonicalSchema = false,
): DataSourceOptions {
  return {
    type: 'postgres',
    host: '127.0.0.1',
    port,
    username: POSTGRES_USER,
    password: POSTGRES_PASSWORD,
    database: POSTGRES_DATABASE,
    entities: includeCanonicalSchema
      ? [JobIndexOutbox, Job, Company]
      : [JobIndexOutbox],
    subscribers: includeCanonicalSchema ? [JobIndexingSubscriber] : [],
    migrations: includeMigration
      ? [
          JobIndexOutbox20260907170000,
          JobIndexOutboxRepresentationVersion20260915000000,
        ]
      : [],
    migrationsTableName: 'job_index_integration_migrations',
    synchronize: false,
    logging: false,
    extra: { options: '-c timezone=UTC' },
  };
}

async function waitForDatabase(port: number): Promise<DataSource> {
  const deadline = Date.now() + 60_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    const dataSource = new DataSource(dataSourceOptions(port, true, true));
    try {
      await dataSource.initialize();
      await dataSource.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
      await dataSource.runMigrations();
      await dataSource.synchronize();
      return dataSource;
    } catch (error) {
      lastError = error;
      if (dataSource.isInitialized) await dataSource.destroy();
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  const message =
    lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Disposable PostgreSQL did not become ready: ${message}`);
}

async function waitFor<T>(
  read: () => Promise<T>,
  predicate: (value: T) => boolean,
  description: string,
  timeout = 10_000,
): Promise<T> {
  const deadline = Date.now() + timeout;
  let latest: T;
  do {
    latest = await read();
    if (predicate(latest)) return latest;
    await new Promise((resolve) => setTimeout(resolve, 25));
  } while (Date.now() < deadline);
  throw new Error(`Timed out waiting for ${description}`);
}

function canonicalFixtures() {
  const updatedAt = new Date('2026-01-15T00:00:00.000Z');
  const company = {
    _id: COMPANY_ID,
    name: 'Synthetic Company',
    description: 'Integration fixture',
    address: 'Hanoi',
    isActive: true,
    isDeleted: false,
    deletedAt: null,
    updatedAt,
  } as Company;
  const job = {
    _id: JOB_ID,
    name: 'Backend Engineer',
    description: 'Build APIs',
    skills: ['TypeScript', 'PostgreSQL'],
    company: { _id: COMPANY_ID, name: company.name },
    salary: 100000,
    level: 'senior',
    location: 'Hanoi',
    startDate: new Date('2025-01-01T00:00:00.000Z'),
    endDate: new Date('2030-01-01T00:00:00.000Z'),
    isActive: true,
    isDeleted: false,
    deletedAt: null,
    updatedAt,
  } as Job;
  return { job, company };
}

function responseFor(request: JobIndexRequest): JobIndexResponse {
  const isUpsert = 'job' in request;
  return {
    request_id: request.identity.request_id,
    trace_id: request.identity.trace_id,
    operation_attempt_id: request.identity.operation_attempt_id,
    job_id: isUpsert ? request.job.job_id : request.job_id,
    operation: isUpsert ? 'UPSERT' : 'DELETE',
    status: isUpsert ? 'INDEXED' : 'DELETED',
    source_version: request.source_version,
    representation_version: request.representation_version,
    point_id: deterministicJobPointId(
      isUpsert ? request.job.job_id : request.job_id,
    ),
    content_hash: isUpsert ? request.content_hash : null,
    embedding_provider: 'deterministic',
    embedding_model: 'deterministic-v1',
    embedding_dimensions: JOB_EMBEDDING_DIMENSIONS,
    embedded: isUpsert,
  };
}

class SuccessfulIndexingClient implements JobIndexingClient {
  async upsertJob(request: JobIndexUpsertRequest): Promise<JobIndexResponse> {
    return responseFor(request);
  }

  async deleteJob(request: JobIndexDeleteRequest): Promise<JobIndexResponse> {
    return responseFor(request);
  }
}

class DeferredIndexingClient implements JobIndexingClient {
  readonly calls: JobIndexRequest[] = [];
  private readonly pending: Array<{
    request: JobIndexRequest;
    resolve: (response: JobIndexResponse) => void;
    reject: (error: Error) => void;
  }> = [];

  async upsertJob(request: JobIndexUpsertRequest): Promise<JobIndexResponse> {
    return this.defer(request);
  }

  async deleteJob(request: JobIndexDeleteRequest): Promise<JobIndexResponse> {
    return this.defer(request);
  }

  release(index: number): void {
    const pending = this.pending[index];
    if (!pending)
      throw new Error(`No deferred provider call at index ${index}`);
    pending.resolve(responseFor(pending.request));
  }

  reject(
    index: number,
    error = new Error('controlled provider failure'),
  ): void {
    const pending = this.pending[index];
    if (!pending)
      throw new Error(`No deferred provider call at index ${index}`);
    pending.reject(error);
  }

  private defer(request: JobIndexRequest): Promise<JobIndexResponse> {
    this.calls.push(request);
    return new Promise((resolve, reject) => {
      this.pending.push({ request, resolve, reject });
    });
  }
}

class RecordingIndexingClient implements JobIndexingClient {
  readonly calls: JobIndexRequest[] = [];

  async upsertJob(request: JobIndexUpsertRequest): Promise<JobIndexResponse> {
    this.calls.push(request);
    return responseFor(request);
  }

  async deleteJob(request: JobIndexDeleteRequest): Promise<JobIndexResponse> {
    this.calls.push(request);
    return responseFor(request);
  }
}

class FailingIndexingClient implements JobIndexingClient {
  async upsertJob(request: JobIndexUpsertRequest): Promise<JobIndexResponse> {
    void request;
    throw new Error('controlled provider failure');
  }

  async deleteJob(request: JobIndexDeleteRequest): Promise<JobIndexResponse> {
    void request;
    throw new Error('controlled provider failure');
  }
}

function fakeRepositories() {
  const { job, company } = canonicalFixtures();
  return {
    jobRepo: {
      findOne: jest.fn().mockResolvedValue(job),
    },
    companyRepo: {
      findOne: jest.fn().mockResolvedValue(company),
    },
  };
}

async function destroyDataSource(
  dataSource: DataSource | undefined,
): Promise<void> {
  if (dataSource?.isInitialized) await dataSource.destroy();
}

const hasDocker = dockerIsAvailable();
const integrationDescribe = hasDocker ? describe : describe.skip;

integrationDescribe(
  'JobIndexingService outbox claim, lease, retry, and fencing integration',
  () => {
    let containerName: string | undefined;
    let hostPort: number;
    let setupDataSource: DataSource;
    const workerDataSources: DataSource[] = [];

    async function createWorker(
      indexingClient: JobIndexingClient,
    ): Promise<JobIndexingService> {
      const dataSource = new DataSource(dataSourceOptions(hostPort, false));
      try {
        await dataSource.initialize();
        workerDataSources.push(dataSource);
        const repositories = fakeRepositories();
        return new JobIndexingService(
          dataSource,
          dataSource.getRepository(JobIndexOutbox),
          repositories.jobRepo as any,
          repositories.companyRepo as any,
          indexingClient,
        );
      } catch (error) {
        await destroyDataSource(dataSource);
        throw error;
      }
    }

    async function insertPendingOutbox(): Promise<string> {
      const { job, company } = canonicalFixtures();
      const outbox = setupDataSource.getRepository(JobIndexOutbox).create({
        _id: randomUUID(),
        aggregateId: job._id,
        aggregateType: 'JOB',
        eventType: 'JOB_CHANGED',
        sourceVersion: getJobSourceVersion(job, company),
        representationVersion: 'demo-v1',
        status: 'PENDING',
        attemptCount: 0,
        availableAt: new Date(),
        leaseUntil: null,
        leaseToken: null,
        claimedAt: null,
        processedAt: null,
        lastError: null,
      });
      await setupDataSource.getRepository(JobIndexOutbox).save(outbox);
      return outbox._id;
    }

    async function readOutbox(id: string): Promise<JobIndexOutbox> {
      const row = await setupDataSource
        .getRepository(JobIndexOutbox)
        .findOneBy({ _id: id });
      if (!row) throw new Error(`Outbox row ${id} disappeared`);
      return row;
    }

    beforeAll(async () => {
      containerName = `talentpulse-job-index-it-${randomUUID()}`;
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
      if (started.code !== 0) {
        throw new Error(
          `Could not start disposable PostgreSQL: ${
            started.stderr || started.stdout
          }`,
        );
      }

      try {
        setupDataSource = await waitForDatabase(hostPort);
      } catch (error) {
        await destroyDataSource(setupDataSource);
        const removed = await runCommand('docker', [
          'rm',
          '--force',
          containerName,
        ]);
        if (removed.code !== 0) {
          process.stderr.write(
            `[job-index outbox integration] Cleanup warning: ${removed.stderr}\n`,
          );
        }
        throw error;
      }
    });

    afterEach(async () => {
      if (setupDataSource?.isInitialized) {
        await setupDataSource.query('DELETE FROM "job_index_outbox"');
        await setupDataSource.query('DELETE FROM "jobs"');
        await setupDataSource.query('DELETE FROM "companies"');
      }
    });

    afterAll(async () => {
      let cleanupError: unknown;
      for (const dataSource of [
        ...workerDataSources,
        setupDataSource,
      ].reverse()) {
        try {
          await destroyDataSource(dataSource);
        } catch (error) {
          cleanupError ??= error;
        }
      }
      if (containerName) {
        try {
          const removed = await runCommand('docker', [
            'rm',
            '--force',
            containerName,
          ]);
          if (
            removed.code !== 0 &&
            !removed.stderr.includes('No such container')
          ) {
            cleanupError ??= new Error(
              `Could not remove disposable PostgreSQL: ${removed.stderr}`,
            );
          }
        } catch (error) {
          cleanupError ??= error;
        }
      }
      if (cleanupError) throw cleanupError;
    });

    it('allows one active lease to win concurrent drains', async () => {
      const outboxId = await insertPendingOutbox();
      const client = new DeferredIndexingClient();
      const workerA = await createWorker(client);
      const workerB = await createWorker(client);

      const drainA = workerA.drain(1);
      const processing = await waitFor(
        () => readOutbox(outboxId),
        (row) => row.status === 'PROCESSING' && row.attemptCount === 1,
        'the first active lease',
      );
      expect(processing.leaseToken).toMatch(/^[0-9a-f-]{36}$/);
      expect(processing.leaseUntil?.getTime()).toBeGreaterThan(Date.now());
      await waitFor(
        async () => client.calls.length,
        (count) => count === 1,
        'the single provider call',
      );

      const drainB = workerB.drain(1);
      const resultB = await drainB;
      expect(resultB).toEqual({
        claimed: 0,
        completed: 0,
        failed: 0,
        leaseLost: 0,
      });
      expect(client.calls).toHaveLength(1);

      client.release(0);
      const resultA = await drainA;
      expect(resultA).toEqual({
        claimed: 1,
        completed: 1,
        failed: 0,
        leaseLost: 0,
      });
      expect(await readOutbox(outboxId)).toEqual(
        expect.objectContaining({
          status: 'COMPLETED',
          attemptCount: 1,
          leaseUntil: null,
          leaseToken: null,
        }),
      );
    });

    it('persists simultaneous representations for the same canonical source version', async () => {
      const { job, company } = canonicalFixtures();
      const sourceVersion = getJobSourceVersion(job, company);
      const repository = setupDataSource.getRepository(JobIndexOutbox);

      await repository.insert([
        repository.create({
          aggregateId: job._id,
          aggregateType: 'JOB',
          eventType: 'JOB_CHANGED',
          sourceVersion,
          representationVersion: 'demo-v1',
          status: 'PENDING',
          attemptCount: 0,
          availableAt: new Date(),
        }),
        repository.create({
          aggregateId: job._id,
          aggregateType: 'JOB',
          eventType: 'JOB_CHANGED',
          sourceVersion,
          representationVersion: 'local-ollama-v1',
          status: 'PENDING',
          attemptCount: 0,
          availableAt: new Date(),
        }),
      ]);

      const rows = await repository.find({
        where: {
          aggregateId: job._id,
          sourceVersion,
          eventType: 'JOB_CHANGED',
        },
      });
      expect(rows.map((row) => row.representationVersion).sort()).toEqual([
        'demo-v1',
        'local-ollama-v1',
      ]);
    });

    it('refuses migration rollback when representations would collapse', async () => {
      const { job, company } = canonicalFixtures();
      const sourceVersion = getJobSourceVersion(job, company);
      const repository = setupDataSource.getRepository(JobIndexOutbox);
      await repository.insert([
        repository.create({
          aggregateId: job._id,
          aggregateType: 'JOB',
          eventType: 'JOB_CHANGED',
          sourceVersion,
          representationVersion: 'demo-v1',
          status: 'PENDING',
          attemptCount: 0,
          availableAt: new Date(),
        }),
        repository.create({
          aggregateId: job._id,
          aggregateType: 'JOB',
          eventType: 'JOB_CHANGED',
          sourceVersion,
          representationVersion: 'local-ollama-v1',
          status: 'PENDING',
          attemptCount: 0,
          availableAt: new Date(),
        }),
      ]);
      const queryRunner = setupDataSource.createQueryRunner();
      await queryRunner.connect();
      try {
        await expect(
          new JobIndexOutboxRepresentationVersion20260915000000().down(
            queryRunner,
          ),
        ).rejects.toThrow('Cannot safely restore');
      } finally {
        await queryRunner.release();
      }
    });

    it('reclaims expired leases and fences stale successful completion', async () => {
      const outboxId = await insertPendingOutbox();
      const client = new DeferredIndexingClient();
      const workerA = await createWorker(client);
      const workerB = await createWorker(client);

      const drainA = workerA.drain(1);
      const firstClaim = await waitFor(
        () => readOutbox(outboxId),
        (row) => row.status === 'PROCESSING' && row.attemptCount === 1,
        'the first lease before expiry',
      );
      await waitFor(
        async () => client.calls.length,
        (count) => count === 1,
        'the first blocked provider call',
      );
      const firstLeaseToken = firstClaim.leaseToken;
      await setupDataSource.query(
        'UPDATE "job_index_outbox" SET "leaseUntil" = $1 WHERE "_id" = $2',
        [new Date(Date.now() - 1_000), outboxId],
      );

      const drainB = workerB.drain(1);
      const secondClaim = await waitFor(
        () => readOutbox(outboxId),
        (row) => row.status === 'PROCESSING' && row.attemptCount === 2,
        'the reclaimed lease',
      );
      expect(secondClaim.leaseToken).toMatch(/^[0-9a-f-]{36}$/);
      expect(secondClaim.leaseToken).not.toBe(firstLeaseToken);
      await waitFor(
        async () => client.calls.length,
        (count) => count === 2,
        'the second provider call',
      );

      client.release(1);
      const resultB = await drainB;
      expect(resultB).toEqual({
        claimed: 1,
        completed: 1,
        failed: 0,
        leaseLost: 0,
      });
      expect(await readOutbox(outboxId)).toEqual(
        expect.objectContaining({
          status: 'COMPLETED',
          attemptCount: 2,
          leaseUntil: null,
          leaseToken: null,
        }),
      );

      client.release(0);
      const resultA = await drainA;
      expect(resultA).toEqual({
        claimed: 1,
        completed: 0,
        failed: 0,
        leaseLost: 1,
      });
      expect(await readOutbox(outboxId)).toEqual(
        expect.objectContaining({
          status: 'COMPLETED',
          attemptCount: 2,
          leaseUntil: null,
          leaseToken: null,
        }),
      );
    });

    it('reports lease loss when a stale worker failure cannot fence the reclaimed row', async () => {
      const outboxId = await insertPendingOutbox();
      const client = new DeferredIndexingClient();
      const workerA = await createWorker(client);
      const workerB = await createWorker(client);

      const drainA = workerA.drain(1);
      await waitFor(
        () => readOutbox(outboxId),
        (row) => row.status === 'PROCESSING' && row.attemptCount === 1,
        'the first lease before failure',
      );
      await waitFor(
        async () => client.calls.length,
        (count) => count === 1,
        'the first blocked provider call',
      );
      await setupDataSource.query(
        'UPDATE "job_index_outbox" SET "leaseUntil" = $1 WHERE "_id" = $2',
        [new Date(Date.now() - 1_000), outboxId],
      );

      const drainB = workerB.drain(1);
      await waitFor(
        () => readOutbox(outboxId),
        (row) => row.status === 'PROCESSING' && row.attemptCount === 2,
        'the reclaimed lease before completion',
      );
      await waitFor(
        async () => client.calls.length,
        (count) => count === 2,
        'the second blocked provider call',
      );

      client.release(1);
      expect(await drainB).toEqual({
        claimed: 1,
        completed: 1,
        failed: 0,
        leaseLost: 0,
      });

      client.reject(0);
      expect(await drainA).toEqual({
        claimed: 1,
        completed: 0,
        failed: 0,
        leaseLost: 1,
      });
      expect(await readOutbox(outboxId)).toEqual(
        expect.objectContaining({
          status: 'COMPLETED',
          attemptCount: 2,
          leaseUntil: null,
          leaseToken: null,
          lastError: null,
        }),
      );
    });

    it('drives a real job mutation through the registered subscriber, outbox, fencing, and delete', async () => {
      const { job: fixtureJob, company: fixtureCompany } = canonicalFixtures();
      const companyRepo = setupDataSource.getRepository(Company);
      const jobRepo = setupDataSource.getRepository(Job);
      const outboxRepo = setupDataSource.getRepository(JobIndexOutbox);
      const company = await companyRepo.save(
        companyRepo.create(fixtureCompany),
      );
      const client = new RecordingIndexingClient();
      const indexingService = new JobIndexingService(
        setupDataSource,
        outboxRepo,
        jobRepo,
        companyRepo,
        client,
      );

      await setupDataSource.transaction(async (manager) => {
        await manager
          .getRepository(Job)
          .save(manager.getRepository(Job).create(fixtureJob));
      });

      let persistedJob = await jobRepo.findOne({
        where: { _id: fixtureJob._id },
        withDeleted: true,
      });
      if (!persistedJob) throw new Error('Job fixture was not persisted');
      const initialVersion = getJobSourceVersion(persistedJob, company);
      const initialOutbox = await waitFor(
        () =>
          outboxRepo.findOneBy({
            aggregateId: persistedJob._id,
            sourceVersion: initialVersion,
          }),
        (row) => row !== null,
        'the transactional insert outbox row',
      );
      expect(initialOutbox).toEqual(
        expect.objectContaining({
          status: 'PENDING',
          eventType: 'JOB_CHANGED',
        }),
      );

      expect(await indexingService.drain(1)).toEqual({
        claimed: 1,
        completed: 1,
        failed: 0,
        leaseLost: 0,
      });
      expect(client.calls).toHaveLength(1);
      expect(client.calls[0]).toEqual(
        expect.objectContaining({
          job: expect.objectContaining({ job_id: fixtureJob._id }),
          source_version: initialVersion,
        }),
      );

      persistedJob.description = 'Build APIs v2';
      persistedJob = await jobRepo.save(persistedJob);
      const staleVersion = getJobSourceVersion(persistedJob, company);
      await waitFor(
        () =>
          outboxRepo.findOneBy({
            aggregateId: persistedJob._id,
            sourceVersion: staleVersion,
          }),
        (row) => row !== null,
        'the first update outbox row',
      );

      persistedJob.description = 'Build APIs v3';
      persistedJob = await jobRepo.save(persistedJob);
      const currentVersion = getJobSourceVersion(persistedJob, company);
      await waitFor(
        () =>
          outboxRepo.findOneBy({
            aggregateId: persistedJob._id,
            sourceVersion: currentVersion,
          }),
        (row) => row !== null,
        'the second update outbox row',
      );

      expect(await indexingService.drain(1)).toEqual({
        claimed: 1,
        completed: 1,
        failed: 0,
        leaseLost: 0,
      });
      expect(client.calls).toHaveLength(1);
      expect(
        await outboxRepo.findOneBy({
          aggregateId: persistedJob._id,
          sourceVersion: staleVersion,
        }),
      ).toEqual(expect.objectContaining({ status: 'COMPLETED' }));

      expect(await indexingService.drain(1)).toEqual({
        claimed: 1,
        completed: 1,
        failed: 0,
        leaseLost: 0,
      });
      expect(client.calls).toHaveLength(2);
      expect(client.calls[1]).toEqual(
        expect.objectContaining({
          job: expect.objectContaining({
            job_id: fixtureJob._id,
            description: 'Build APIs v3',
          }),
          source_version: currentVersion,
        }),
      );

      persistedJob.isDeleted = true;
      const removedJob = await jobRepo.softRemove(persistedJob);
      const deleteVersion = getJobSourceVersion(removedJob, company);
      await waitFor(
        () =>
          outboxRepo.findOneBy({
            aggregateId: persistedJob._id,
            sourceVersion: deleteVersion,
          }),
        (row) => row !== null,
        'the soft-delete outbox row',
      );

      expect(await indexingService.drain(1)).toEqual({
        claimed: 1,
        completed: 1,
        failed: 0,
        leaseLost: 0,
      });
      expect(client.calls).toHaveLength(3);
      expect(client.calls[2]).toEqual(
        expect.objectContaining({
          job_id: fixtureJob._id,
          source_version: deleteVersion,
        }),
      );
      expect('job' in client.calls[2]).toBe(false);
      expect(
        await outboxRepo.findOneBy({
          aggregateId: fixtureJob._id,
          sourceVersion: deleteVersion,
        }),
      ).toEqual(expect.objectContaining({ status: 'COMPLETED' }));
    });

    it('persists a bounded retry and completes after availability', async () => {
      const outboxId = await insertPendingOutbox();
      const failingWorker = await createWorker(new FailingIndexingClient());
      const failedAt = Date.now();
      const failedResult = await failingWorker.drain(1);
      expect(failedResult).toEqual({
        claimed: 1,
        completed: 0,
        failed: 1,
        leaseLost: 0,
      });
      const failed = await readOutbox(outboxId);
      expect(failed).toEqual(
        expect.objectContaining({
          status: 'FAILED',
          attemptCount: 1,
          leaseUntil: null,
          leaseToken: null,
          lastError: 'controlled provider failure',
        }),
      );
      expect(failed.lastError?.length).toBeLessThanOrEqual(1_000);
      expect(failed.availableAt.getTime()).toBeGreaterThan(failedAt);

      await setupDataSource.query(
        'UPDATE "job_index_outbox" SET "availableAt" = $1 WHERE "_id" = $2',
        [new Date(Date.now() - 1_000), outboxId],
      );
      const successfulWorker = await createWorker(
        new SuccessfulIndexingClient(),
      );
      const successfulResult = await successfulWorker.drain(1);
      expect(successfulResult).toEqual({
        claimed: 1,
        completed: 1,
        failed: 0,
        leaseLost: 0,
      });
      expect(await readOutbox(outboxId)).toEqual(
        expect.objectContaining({
          status: 'COMPLETED',
          attemptCount: 2,
          leaseUntil: null,
          leaseToken: null,
          lastError: null,
        }),
      );
    });
  },
);
