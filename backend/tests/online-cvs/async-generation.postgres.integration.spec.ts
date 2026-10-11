import 'reflect-metadata';
import { spawnSync } from 'child_process';
import { randomUUID } from 'crypto';
import { resolve } from 'path';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { Role } from 'src/decorator/customize';
import { User } from 'src/users/entities/user.entity';
import { OnlineCV } from 'src/online-cvs/entities/online-cv.entity';
import { CandidateCareerProfile } from 'src/candidate-career-profile/entities/candidate-career-profile.entity';
import { OnlineCVsService } from 'src/online-cvs/online-cvs.service';
import { AiCvConsentsService } from 'src/ai-consents/ai-cv-consents.service';
import { AiCvConsent } from 'src/ai-consents/entities/ai-cv-consent.entity';
import { AiCvConsentEvent } from 'src/ai-consents/entities/ai-cv-consent-event.entity';
import { AiCvConsentScope } from 'src/ai-consents/ai-cv-consent.policy';
import { CvGenerationJobData } from 'src/online-cvs/async-cv-generation.types';
import { Company } from 'src/companies/entities/company.entity';
import { Job } from 'src/jobs/entities/job.entity';
import { ActiveJobQueryService } from 'src/active-jobs/active-job-query.service';

jest.setTimeout(120_000);

const image = 'postgis/postgis:16-3.4';
const available =
  spawnSync('docker', ['info'], { stdio: 'ignore', timeout: 5000 }).status ===
    0 &&
  spawnSync('docker', ['image', 'inspect', image], { stdio: 'ignore' })
    .status === 0;
if (!available)
  process.stderr.write(
    '[async CV PostgreSQL] Skipped: Docker or cached disposable PostGIS image unavailable; no image pull or existing database connection attempted.\n',
  );

function docker(args: string[]): string {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (result.status !== 0) throw new Error(result.stderr || 'Docker failed');
  return result.stdout.trim();
}

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => (release = resolve));
  return { promise, release };
}

(available ? describe : describe.skip)('async CV real PostgreSQL races', () => {
  const container = `talentpulse-async-cv-it-${randomUUID()}`;
  const previousRedis = process.env.REDIS_ENABLED;
  let db: DataSource;
  let peer: DataSource;
  const config = new ConfigService({});
  let user: User;
  let service: OnlineCVsService;
  let other: OnlineCVsService;
  let consent: AiCvConsentsService;
  let workerConsent: AiCvConsentsService;
  let queue: { add: jest.Mock; getJob: jest.Mock };
  let entered: ReturnType<typeof gate>;
  let inference: ReturnType<typeof gate>;

  beforeAll(async () => {
    docker([
      'run',
      '--detach',
      '--pull=never',
      '--name',
      container,
      '--publish',
      '127.0.0.1::5432',
      '--env',
      'POSTGRES_PASSWORD=disposable-test-only',
      '--env',
      'POSTGRES_DB=async_cv_test',
      image,
    ]);
    const port = Number(
      docker([
        'inspect',
        '--format',
        '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}',
        container,
      ]),
    );
    const options = {
      type: 'postgres' as const,
      host: '127.0.0.1',
      port,
      username: 'postgres',
      password: 'disposable-test-only',
      database: 'async_cv_test',
      entities: [resolve(__dirname, '../../src/**/*.entity.ts')],
      synchronize: false,
      logging: false,
    };
    const deadline = Date.now() + 60_000;
    while (true) {
      db = new DataSource(options);
      try {
        await db.initialize();
        break;
      } catch (error) {
        if (Date.now() >= deadline) throw error;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    await db.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await db.synchronize();
    peer = await new DataSource(options).initialize();
    process.env.REDIS_ENABLED = 'true';
  });

  afterAll(async () => {
    inference?.release();
    if (peer?.isInitialized) await peer.destroy();
    if (db?.isInitialized) await db.destroy();
    docker(['rm', '--force', container]);
    if (previousRedis === undefined) delete process.env.REDIS_ENABLED;
    else process.env.REDIS_ENABLED = previousRedis;
  });

  beforeEach(async () => {
    await db.query('TRUNCATE TABLE users, jobs, companies CASCADE');
    user = await db.getRepository(User).save({
      email: 'synthetic@example.invalid',
      password: 'not-a-real-password',
      name: 'Synthetic Candidate',
      role: Role.USER,
    });
    await db.getRepository(CandidateCareerProfile).save({
      userId: user._id,
      headline: 'Backend engineer',
      objective: 'Build reliable systems',
      skills: [{ name: 'PostgreSQL', level: null, description: null }],
    });
    queue = {
      add: jest.fn().mockResolvedValue({}),
      getJob: jest.fn().mockResolvedValue(null),
    };
    entered = gate();
    inference = gate();
    const makeService = (source: DataSource) => {
      const instance = Object.create(
        OnlineCVsService.prototype,
      ) as OnlineCVsService;
      const consents = new AiCvConsentsService(
        source.getRepository(AiCvConsent),
        source.getRepository(AiCvConsentEvent),
        config,
        source,
      );
      Object.assign(instance, {
        onlineCVRepo: source.getRepository(OnlineCV),
        userRepo: source.getRepository(User),
        configService: config,
        aiCvConsentsService: consents,
        usersService: {
          isCandidatePremium: () => true,
          getUserMaxCvLimit: () => 3,
        },
        careerProfileService: {
          requireMine: () =>
            source
              .getRepository(CandidateCareerProfile)
              .findOneByOrFail({ userId: user._id }),
        },
        generationQueue: queue,
        jobsService: {
          findOne: (id: string) =>
            new ActiveJobQueryService(
              source.getRepository(Job),
              source.getRepository(Company),
            ).findActiveById(id),
        },
        aiServiceClient: {
          generateCvDraft: async (request) => {
            entered.release();
            await inference.promise;
            return {
              ...request.identity,
              candidate_id: user._id,
              target_job_id: request.job.job_id,
              source_version: request.source_version,
              content_version: 1,
              template_type: request.template_type,
              generation_mode: 'EDITOR_ONLY',
              full_name: 'Candidate',
              title: 'Generated CV',
              position: 'Generated engineer',
              career_objective: 'Generated objective',
              education: [],
              projects: [],
              work_experience: [],
              skills: [{ name: 'Databases', description: 'PostgreSQL' }],
              activities: [],
              certificates: [],
              awards: [],
              section_order: [],
              warnings: [],
            };
          },
        },
      });
      return { instance, consents };
    };
    ({ instance: service, consents: workerConsent } = makeService(db));
    ({ instance: other, consents: consent } = makeService(peer));
    const policy = consent.getPolicyMetadata(AiCvConsentScope.CV_GENERATION);
    await consent.grant(user._id, {
      scope: policy.scope,
      consentVersion: policy.consentVersion,
      policyHash: policy.policyHash,
      source: 'integration-test',
    });
  });

  async function seedJob() {
    const company = await db.getRepository(Company).save({
      name: `Synthetic Company ${randomUUID()}`,
    });
    const job = await db.getRepository(Job).save({
      name: 'Synthetic backend engineer',
      company: { _id: company._id, name: company.name, isActive: true },
      startDate: new Date(Date.now() - 60_000),
      endDate: new Date(Date.now() + 3_600_000),
    });
    return { company, job };
  }

  async function start(jobId?: string) {
    const accepted = await service.enqueueGenerationFromCareerProfile(
      jobId ? { jobId } : {},
      user,
      randomUUID(),
    );
    const payload = queue.add.mock.calls[0][1] as CvGenerationJobData;
    const worker = service.processGenerationJob(payload);
    await entered.promise;
    return { accepted, payload, worker };
  }

  it.each(['CANCELLED', 'WORKER_INTERRUPTED'])(
    'cannot overwrite %s after delayed inference',
    async (terminal) => {
      const { accepted, payload, worker } = await start();
      try {
        if (terminal === 'CANCELLED')
          await other.cancelGeneration(
            accepted.onlineCvId,
            accepted.operationId,
            user,
          );
        else await other.processGenerationJob(payload);
        const before = await peer
          .getRepository(OnlineCV)
          .findOneByOrFail({ _id: accepted.onlineCvId });
        inference.release();
        await worker;
        const after = await peer
          .getRepository(OnlineCV)
          .findOneByOrFail({ _id: accepted.onlineCvId });
        expect(after.revision).toEqual(before.revision);
        expect(after.contentVersion).toBe(1);
        expect(after.careerObjective).toBe(before.careerObjective);
        expect(after.revision.sourceTrace.generation).toMatchObject(
          terminal === 'CANCELLED'
            ? { status: 'CANCELLED' }
            : { status: 'FAILED', errorCode: 'WORKER_INTERRUPTED' },
        );
      } finally {
        inference.release();
        await worker;
      }
    },
  );

  it('committed consent revoke prevents delayed result persistence', async () => {
    const { accepted, worker } = await start();
    try {
      const policy = consent.getPolicyMetadata(AiCvConsentScope.CV_GENERATION);
      await consent.revoke(user._id, {
        scope: policy.scope,
        consentVersion: policy.consentVersion,
        policyHash: policy.policyHash,
        source: 'integration-test',
      });
      inference.release();
      await worker;
      const row = await peer
        .getRepository(OnlineCV)
        .findOneByOrFail({ _id: accepted.onlineCvId });
      expect(row.contentVersion).toBe(1);
      expect(row.careerObjective).toBe('Build reliable systems');
      expect(row.revision.sourceTrace.generation.status).toBe('FAILED');
      expect(
        await consent.hasValidConsent(
          user._id,
          policy.scope,
          policy.consentVersion,
          policy.policyHash,
        ),
      ).toBe(false);
    } finally {
      inference.release();
      await worker;
    }
  });

  it('serializes simultaneous same-key reservations and rejects changed locale/template', async () => {
    const key = randomUUID();
    const results = await Promise.all([
      service.enqueueGenerationFromCareerProfile({}, user, key),
      other.enqueueGenerationFromCareerProfile({}, user, key),
    ]);
    expect(results[0].operationId).toBe(results[1].operationId);
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(
      await peer.getRepository(OnlineCV).countBy({ userId: user._id }),
    ).toBe(1);
    for (const dto of [
      { locale: 'en-US' as const },
      { templateType: 'template2' as const },
    ])
      await expect(
        other.enqueueGenerationFromCareerProfile(dto, user, key),
      ).rejects.toMatchObject({ status: 409 });
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('waits for the real revoke transaction lock before deciding persistence', async () => {
    const { accepted, worker } = await start();
    const locked = gate();
    const commit = gate();
    const persistAttempt = gate();
    const revokeLock = consent.lockScope.bind(consent);
    const persistLock = workerConsent.lockScope.bind(workerConsent);
    jest.spyOn(consent, 'lockScope').mockImplementation(async (...args) => {
      await revokeLock(...args);
      locked.release();
      await commit.promise;
    });
    jest.spyOn(workerConsent, 'lockScope').mockImplementation((...args) => {
      persistAttempt.release();
      return persistLock(...args);
    });
    const policy = consent.getPolicyMetadata(AiCvConsentScope.CV_GENERATION);
    const revoke = consent.revoke(user._id, {
      scope: policy.scope,
      consentVersion: policy.consentVersion,
      policyHash: policy.policyHash,
      source: 'integration-test',
    });
    try {
      await locked.promise;
      inference.release();
      await persistAttempt.promise;
      const deadline = Date.now() + 5000;
      let blocked = false;
      while (!blocked && Date.now() < deadline) {
        const rows = await db.query(
          "SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND NOT granted",
        );
        blocked = rows.length > 0;
        if (!blocked) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(blocked).toBe(true);
      const pending = await peer
        .getRepository(OnlineCV)
        .findOneByOrFail({ _id: accepted.onlineCvId });
      expect(pending.contentVersion).toBe(1);
      expect(pending.revision.sourceTrace.generation.status).toBe('RUNNING');
      commit.release();
      await revoke;
      await worker;
      const final = await peer
        .getRepository(OnlineCV)
        .findOneByOrFail({ _id: accepted.onlineCvId });
      expect(final.contentVersion).toBe(1);
      expect(final.careerObjective).toBe('Build reliable systems');
      expect(final.revision.sourceTrace.generation.status).toBe('FAILED');
    } finally {
      commit.release();
      inference.release();
      await revoke;
      await worker;
    }
  });

  it('rejects stale editor PATCH after atomic generated completion', async () => {
    const { accepted, worker } = await start();
    inference.release();
    await worker;
    const before = await peer
      .getRepository(OnlineCV)
      .findOneByOrFail({ _id: accepted.onlineCvId });
    expect(before.contentVersion).toBe(2);
    expect(before.revision.sourceTrace.generation.status).toBe('COMPLETE');
    expect(before.careerObjective).toBe('Generated objective');
    await expect(
      other.update(
        before._id,
        { expectedContentVersion: 1, position: 'Stale edit' },
        user,
      ),
    ).rejects.toMatchObject({ status: 409 });
    const after = await peer
      .getRepository(OnlineCV)
      .findOneByOrFail({ _id: before._id });
    expect(after).toEqual(before);
  });

  it.each(['inactive', 'deleted'])(
    'rejects a canonical company becoming %s during inference without job changes',
    async (state) => {
      const { company, job } = await seedJob();
      const { accepted, worker } = await start(job._id);
      try {
        await peer
          .getRepository(Company)
          .update(
            company._id,
            state === 'inactive'
              ? { isActive: false }
              : { isDeleted: true, deletedAt: new Date() },
          );
        inference.release();
        await worker;
        expect(
          await peer.getRepository(Job).findOneByOrFail({ _id: job._id }),
        ).toEqual(job);
        const row = await peer
          .getRepository(OnlineCV)
          .findOneByOrFail({ _id: accepted.onlineCvId });
        expect(row.contentVersion).toBe(1);
        expect(row.careerObjective).toBe('Build reliable systems');
        expect(row.revision.sourceTrace.generation.status).toBe('STALE');
      } finally {
        inference.release();
        await worker;
      }
    },
  );

  it.each(['inactive-company', 'deleted-company', 'expired-job'])(
    'rejects %s reservation without consuming a placeholder or quota',
    async (state) => {
      const { company, job } = await seedJob();
      if (state === 'expired-job')
        await peer.getRepository(Job).update(job._id, {
          endDate: new Date(Date.now() - 1000),
        });
      else
        await peer
          .getRepository(Company)
          .update(
            company._id,
            state === 'inactive-company'
              ? { isActive: false }
              : { isDeleted: true, deletedAt: new Date() },
          );
      const before = await peer
        .getRepository(User)
        .findOneByOrFail({ _id: user._id });
      await expect(
        service.enqueueGenerationFromCareerProfile(
          { jobId: job._id },
          user,
          randomUUID(),
        ),
      ).rejects.toMatchObject({ status: 404 });
      expect(await peer.getRepository(OnlineCV).count()).toBe(0);
      expect(queue.add).not.toHaveBeenCalled();
      expect(
        await peer.getRepository(User).findOneByOrFail({ _id: user._id }),
      ).toEqual(before);
    },
  );

  it('waits on the canonical Company before locking Job and rejects its committed deactivation', async () => {
    const { company, job } = await seedJob();
    const { accepted, worker } = await start(job._id);
    const holder = peer.createQueryRunner();
    await holder.connect();
    await holder.startTransaction();
    try {
      await holder.manager.getRepository(Company).findOneOrFail({
        where: { _id: company._id },
        lock: { mode: 'pessimistic_write' },
      });
      const [{ pid }] = await holder.query('SELECT pg_backend_pid() AS pid');
      inference.release();
      const deadline = Date.now() + 5000;
      let blocked = false;
      while (!blocked && Date.now() < deadline) {
        const rows = await db.query(
          'SELECT 1 FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))',
          [pid],
        );
        blocked = rows.length > 0;
        if (!blocked) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(blocked).toBe(true);
      // NOWAIT succeeds only if the worker has not locked the child first.
      await holder.manager.getRepository(Job).findOneOrFail({
        where: { _id: job._id },
        lock: { mode: 'pessimistic_write', onLocked: 'nowait' },
      });
      const pending = await db
        .getRepository(OnlineCV)
        .findOneByOrFail({ _id: accepted.onlineCvId });
      expect(pending.contentVersion).toBe(1);
      expect(pending.revision.sourceTrace.generation.status).toBe('RUNNING');
      await holder.manager.getRepository(Company).update(company._id, {
        isActive: false,
      });
      await holder.commitTransaction();
      await worker;
      expect(
        await peer.getRepository(Job).findOneByOrFail({ _id: job._id }),
      ).toEqual(job);
      const final = await peer
        .getRepository(OnlineCV)
        .findOneByOrFail({ _id: accepted.onlineCvId });
      expect(final.contentVersion).toBe(1);
      expect(final.careerObjective).toBe('Build reliable systems');
      expect(final.revision.sourceTrace.generation.status).toBe('STALE');
    } finally {
      if (holder.isTransactionActive) await holder.rollbackTransaction();
      await holder.release();
      inference.release();
      await worker;
    }
  });
});
