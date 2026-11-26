import 'reflect-metadata';
import { spawnSync } from 'child_process';
import { createHash, randomUUID } from 'crypto';
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
import { OnlineCvDraftLifecycleService } from 'src/online-cvs/online-cv-draft-lifecycle.service';
import { OnlineCvGenerationStateService } from 'src/online-cvs/online-cv-generation-state.service';
import { OnlineCvGenerationWorkerService } from 'src/online-cvs/online-cv-generation-worker.service';

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
      const lifecycle = new OnlineCvDraftLifecycleService(
        source.getRepository(OnlineCV),
      );
      const onlineCVRepo = source.getRepository(OnlineCV);
      const userRepo = source.getRepository(User);
      const usersService = {
        isCandidatePremium: () => true,
        getUserMaxCvLimit: () => 3,
      };
      const careerProfileService = {
        requireMine: () =>
          source
            .getRepository(CandidateCareerProfile)
            .findOneByOrFail({ userId: user._id }),
      };
      const jobsService = {
        findOne: (id: string) =>
          new ActiveJobQueryService(
            source.getRepository(Job),
            source.getRepository(Company),
          ).findActiveById(id),
      };
      const generationState = new OnlineCvGenerationStateService(
        onlineCVRepo,
        queue as any,
        lifecycle,
      );
      const generationWorker = new OnlineCvGenerationWorkerService(
        onlineCVRepo,
        userRepo,
        config,
        consents,
        usersService as any,
        jobsService as any,
        careerProfileService as any,
        generationState,
      );
      Object.assign(instance, {
        onlineCVRepo,
        userRepo,
        configService: config,
        aiCvConsentsService: consents,
        usersService,
        careerProfileService,
        generationQueue: queue,
        pdfService: { isAvailable: () => false },
        draftLifecycle: lifecycle,
        generationState,
        generationWorker,
        jobsService,
        aiServiceClient: (() => {
          const generateCvDraft = async (request) => {
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
          };
          return {
            generateCvDraft,
            generateCvDraftReview: async (request) => ({
              implementation: 'agent',
              draft: await generateCvDraft(request),
              review_metadata: {
                source_refs_by_path: {},
                field_origins_by_path: {},
                omissions_by_path: [],
              },
            }),
          };
        })(),
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

  describe('T029 selected-item PostgreSQL fences', () => {
    async function pendingReview() {
      const repository = peer.getRepository(OnlineCV);
      const cv = await repository.save({
        userId: user._id,
        templateType: 'template1',
        title: 'Synthetic CV',
        fullName: 'Synthetic Candidate',
        position: 'Owned engineer',
        careerObjective: 'Canonical objective',
        skills: [{ name: 'PostgreSQL' }],
        contentVersion: 1,
        revision: { contentVersion: 1, sourceTrace: {} },
        isPrimary: true,
        isSearchable: true,
      });
      const originalProvider = (service as any).aiServiceClient
        .generateCvDraftReview;
      const provider = jest.fn(async (request) => {
        const result = await originalProvider(request);
        result.draft.content_version = request.content_version;
        result.implementation = 'agent';
        result.review_metadata.source_refs_by_path = {
          '/position': ['/candidate/headline'],
          '/career_objective': ['/candidate/career_objective'],
        };
        result.review_metadata.field_origins_by_path = {
          '/position': 'SOURCE',
          '/career_objective': 'SOURCE',
        };
        return result;
      });
      (service as any).aiServiceClient.generateCvDraftReview = provider;
      await service.enqueueGeneration(
        cv._id,
        { expectedContentVersion: 1 },
        user,
        't029-seed',
      );
      inference.release();
      await service.processGenerationJob(queue.add.mock.calls[0][1]);
      const before = await repository.findOneByOrFail({ _id: cv._id });
      expect(before.generationSnapshot?.pendingDraft?.reviewStatus).toBe(
        'PENDING',
      );
      queue.add.mockClear();
      entered = gate();
      inference = gate();
      const pending = before.generationSnapshot?.pendingDraft;
      if (!pending) throw new Error('Expected seeded pending review');
      provider.mockImplementation(async (request) => {
        const result = await originalProvider(request);
        result.draft.content_version = request.content_version;
        result.implementation = 'agent';
        result.draft.position = 'Regenerated engineer';
        result.draft.career_objective = 'Ignore unselected provider change';
        result.review_metadata.field_origins_by_path = {
          '/position': 'LOCALIZED',
        };
        return result;
      });
      const body = {
        expectedContentVersion: 1,
        regenerationTarget: {
          reviewOperationId: pending.operationId,
          expectedDraftHash: pending.draftHash,
          targetPath: '/position',
        },
      };
      return { repository, before, body, provider };
    }

    it.each(['AI_SUGGESTED', 'SOURCE', 'LOCALIZED'])(
      'T032 stages selected %s output with precise provenance',
      async (origin) => {
        const { repository, before, body, provider } = await pendingReview();
        const original = provider.getMockImplementation()!;
        provider.mockImplementation(async (request) => {
          const result = await original(request);
          result.review_metadata.field_origins_by_path = {
            '/position': origin,
          };
          result.review_metadata.source_refs_by_path = {
            '/position': ['/candidate/headline'],
          };
          return result;
        });
        const accepted = await service.enqueueGeneration(
          before._id,
          body as any,
          user,
          `t032-${origin}`,
        );
        inference.release();
        await service.processGenerationJob(queue.add.mock.calls[0][1]);
        const after = await repository.findOneByOrFail({ _id: before._id });
        const pending = after.generationSnapshot!.pendingDraft!;
        expect(pending.operationId).toBe(
          body.regenerationTarget.reviewOperationId,
        );
        expect(pending.fieldOriginsByPath).toEqual({
          ...before.generationSnapshot!.pendingDraft!.fieldOriginsByPath,
          '/position': origin,
        });
        expect(pending.omissionsByPath).toEqual([]);
        expect(pending.draft.career_objective).toBe(
          before.generationSnapshot!.pendingDraft!.draft.career_objective,
        );
        expect(after.position).toBe(before.position);
        expect(
          await other.getGenerationJob(before._id, accepted.operationId, user),
        ).toMatchObject({
          status: 'COMPLETE',
          reviewMetadata: {
            fieldOriginsByPath: pending.fieldOriginsByPath,
            omissionsByPath: pending.omissionsByPath,
          },
        });
      },
    );

    it.each(['save', 'reject', 'expire', 'conflict'])(
      'T032 pending review lifecycle: %s',
      async (action) => {
        const { repository, before, body } = await pendingReview();
        const proof = {
          operationId: body.regenerationTarget.reviewOperationId,
          draftHash: body.regenerationTarget.expectedDraftHash,
        };
        const profile = await peer
          .getRepository(CandidateCareerProfile)
          .findOneByOrFail({ userId: user._id });
        if (action === 'save') {
          await other.update(
            before._id,
            {
              expectedContentVersion: 1,
              generationApproval: proof,
              position: 'Human reviewed engineer',
            },
            user,
          );
        } else if (action === 'reject') {
          await other.discardGenerationDraft(
            before._id,
            proof.operationId,
            user,
          );
          await other.discardGenerationDraft(
            before._id,
            proof.operationId,
            user,
          );
        } else if (action === 'expire') {
          before.generationSnapshot!.pendingDraft!.expiresAt =
            '2000-01-01T00:00:00.000Z';
          await repository.update(before._id, {
            generationSnapshot: before.generationSnapshot,
          });
          expect(await other.expirePendingGenerationDrafts()).toBe(1);
          expect(await other.expirePendingGenerationDrafts()).toBe(0);
        } else {
          await repository.update(before._id, {
            position: 'Concurrent edit',
            contentVersion: 2,
          });
        }
        const settled = await repository.findOneByOrFail({ _id: before._id });
        if (action === 'save') {
          expect(settled.position).toBe('Human reviewed engineer');
          expect(settled.contentVersion).toBe(2);
        } else if (action !== 'conflict') {
          expect(settled.position).toBe(before.position);
          expect(settled.contentVersion).toBe(1);
          expect(settled.revision.sourceTrace.generation.reviewStatus).toBe(
            action === 'reject' ? 'REJECTED' : 'EXPIRED',
          );
        }
        if (action !== 'conflict')
          expect(settled.generationSnapshot?.pendingDraft).toBeUndefined();
        await expect(
          other.update(
            before._id,
            {
              expectedContentVersion: 1,
              generationApproval: proof,
              position: 'Must never force apply',
            },
            user,
          ),
        ).rejects.toMatchObject({ status: 409 });
        expect(await repository.findOneByOrFail({ _id: before._id })).toEqual(
          settled,
        );
        expect(
          await peer
            .getRepository(CandidateCareerProfile)
            .findOneByOrFail({ userId: user._id }),
        ).toEqual(profile);
      },
    );

    it('serializes same-key reservations on separate connections and distinguishes target/hash fingerprints', async () => {
      const { repository, before, body } = await pendingReview();
      const results = await Promise.all([
        service.enqueueGeneration(before._id, body as any, user, 't029-race'),
        other.enqueueGeneration(before._id, body as any, user, 't029-race'),
      ]);
      expect(results[0].operationId).toBe(results[1].operationId);
      expect(results[0].operationId).not.toBe(
        body.regenerationTarget.reviewOperationId,
      );
      expect(queue.add).toHaveBeenCalledTimes(1);
      for (const change of [
        { targetPath: '/career_objective' },
        { expectedDraftHash: '0'.repeat(64) },
      ]) {
        await expect(
          other.enqueueGeneration(
            before._id,
            {
              ...body,
              regenerationTarget: { ...body.regenerationTarget, ...change },
            } as any,
            user,
            't029-race',
          ),
        ).rejects.toMatchObject({ status: 409 });
      }
      const after = await repository.findOneByOrFail({ _id: before._id });
      expect(after.generationSnapshot).toEqual(before.generationSnapshot);
      expect(after.contentVersion).toBe(1);
    });

    it.each([
      'success',
      'concurrent pending hash',
      'cancelled',
      'late cancelled delivery',
    ])(
      'compare-and-sets pending output/provenance without canonical writes: %s',
      async (scenario) => {
        const { repository, before, body, provider } = await pendingReview();
        const accepted = await service.enqueueGeneration(
          before._id,
          body as any,
          user,
          't029-update',
        );
        const payload = queue.add.mock.calls[0][1] as CvGenerationJobData;
        const worker = service.processGenerationJob(payload);
        await Promise.race([entered.promise, worker]);
        try {
          if (scenario === 'concurrent pending hash') {
            const current = await repository.findOneByOrFail({
              _id: before._id,
            });
            const pending = current.generationSnapshot?.pendingDraft;
            if (!pending) throw new Error('Expected in-flight pending review');
            pending.draft.position = 'Concurrent accepted target';
            pending.draftHash = createHash('sha256')
              .update(JSON.stringify(pending.draft))
              .digest('hex');
            pending.fieldOriginsByPath['/position'] = 'LOCALIZED';
            await repository.update(before._id, {
              generationSnapshot: current.generationSnapshot,
            });
          }
          if (scenario.includes('cancelled'))
            await other.cancelGeneration(
              before._id,
              accepted.operationId,
              user,
            );
          const fenced = await repository.findOneByOrFail({ _id: before._id });
          inference.release();
          await worker;
          if (scenario === 'late cancelled delivery')
            await service.processGenerationJob(payload);
          const after = await repository.findOneByOrFail({ _id: before._id });
          const canonical = (row: OnlineCV) =>
            Object.fromEntries(
              Object.entries(row).filter(
                ([key]) =>
                  ![
                    'revision',
                    'generationSnapshot',
                    'updatedAt',
                    'updatedBy',
                  ].includes(key),
              ),
            );
          expect(canonical(after)).toEqual(canonical(before));
          expect(
            await peer
              .getRepository(CandidateCareerProfile)
              .findOneByOrFail({ userId: user._id }),
          ).toMatchObject({
            headline: 'Backend engineer',
            objective: 'Build reliable systems',
          });
          if (scenario === 'success') {
            const old = before.generationSnapshot?.pendingDraft;
            const next = after.generationSnapshot?.pendingDraft;
            if (!old || !next)
              throw new Error('Expected preserved pending review');
            expect(next.operationId).toBe(old.operationId);
            expect(next.draft).toEqual({
              ...old.draft,
              position: 'Regenerated engineer',
            });
            expect(next.draftHash).not.toBe(old.draftHash);
            expect(next.fieldOriginsByPath).toEqual({
              ...old.fieldOriginsByPath,
              '/position': 'LOCALIZED',
            });
            expect(next.sourceRefsByPath).toEqual(old.sourceRefsByPath);
            const status = await other.getGenerationJob(
              before._id,
              accepted.operationId,
              user,
            );
            expect(status).toMatchObject({
              status: 'COMPLETE',
              draftHash: next.draftHash,
            });
          } else {
            expect(after.generationSnapshot).toEqual(fenced.generationSnapshot);
            const status = await other.getGenerationJob(
              before._id,
              accepted.operationId,
              user,
            );
            expect(['STALE', 'CANCELLED', 'FAILED']).toContain(status.status);
            expect(status.draft).toBeUndefined();
          }
          expect(provider).toHaveBeenCalledTimes(2);
        } finally {
          inference.release();
          await worker;
        }
      },
    );
  });

  it.each(['stage', 'concurrent-edit'])(
    'T019 preserves an existing source CV and Career Profile before approval: %s',
    async (scenario) => {
      const repository = peer.getRepository(OnlineCV);
      const saved = await repository.save({
        userId: user._id,
        templateType: 'template1',
        fullName: 'Ứng viên tổng hợp',
        title: '  Source CV  ',
        position: 'Source engineer',
        email: 'source@example.invalid',
        phone: '+84000000000',
        address: 'Hà Nội',
        link: 'https://example.invalid/source',
        careerObjective: '  Mục tiêu gốc\nGiữ nguyên khoảng trắng.  ',
        education: [
          {
            schoolName: 'Synthetic University',
            major: 'CS',
            startDate: '2018',
            endDate: '2022',
            description: 'Source education',
          },
        ],
        workExperience: [
          {
            companyName: 'Synthetic Company',
            position: 'Engineer',
            startDate: '2022',
            endDate: '',
            description: 'Source work\n  spacing',
          },
        ],
        skills: [{ name: 'PostgreSQL', description: 'Source skill' }],
        projects: [
          {
            projectName: 'Source project',
            role: 'Developer',
            startDate: '2023',
            endDate: '',
            description: 'Source project detail',
            technologies: ['PostgreSQL'],
          },
        ],
        activities: [
          {
            organizationName: 'Synthetic group',
            position: 'Volunteer',
            startDate: '2020',
            endDate: '2021',
            description: 'Source activity',
          },
        ],
        certificates: [
          {
            name: 'Source certificate',
            issuer: 'Synthetic issuer',
            date: '2023',
          },
        ],
        awards: [
          {
            name: 'Source award',
            date: '2022',
            description: 'Source award detail',
          },
        ],
        sectionOrder: [
          'skills',
          'experience',
          'objective',
          'education',
          'projects',
          'activities',
          'certificates',
          'awards',
        ],
        contentVersion: 7,
        revision: { contentVersion: 7, locale: 'vi-VN', sourceTrace: {} },
        isPrimary: true,
        isSearchable: true,
      });
      // Compare persisted representations: JSONB normalizes object key order.
      const source = await repository.findOneByOrFail({ _id: saved._id });
      const profileBefore = await peer
        .getRepository(CandidateCareerProfile)
        .findOneByOrFail({ userId: user._id });
      const canonical = (cv: OnlineCV) => {
        return Object.fromEntries(
          Object.entries(cv).filter(
            ([key]) =>
              ![
                'revision',
                'generationSnapshot',
                'updatedAt',
                'updatedBy',
              ].includes(key),
          ),
        );
      };
      const assertPreserved = async (expected: OnlineCV) => {
        const row = await repository.findOneByOrFail({ _id: source._id });
        expect(canonical(row)).toEqual(canonical(expected));
        expect(Buffer.from(JSON.stringify(canonical(row)))).toEqual(
          Buffer.from(JSON.stringify(canonical(expected))),
        );
        expect(row.revision.contentVersion).toBe(expected.contentVersion);
        const profile = await peer
          .getRepository(CandidateCareerProfile)
          .findOneByOrFail({ userId: user._id });
        expect(profile).toEqual(profileBefore);
        expect(JSON.stringify(profile)).toBe(JSON.stringify(profileBefore));
        return row;
      };
      const provider = jest.fn(async (request) => {
        entered.release();
        await inference.promise;
        return {
          implementation: 'agent',
          draft: {
            ...request.identity,
            candidate_id: user._id,
            target_job_id: request.job.job_id,
            template_type: request.template_type,
            generation_mode: 'EDITOR_ONLY',
            source_version: request.source_version,
            content_version: request.content_version,
            full_name: 'Candidate',
            title: 'Agent proposal',
            position: 'Suggested engineer',
            career_objective: 'Suggested objective',
            education: [],
            work_experience: [],
            skills: [],
            projects: [],
            activities: [],
            certificates: [],
            awards: [],
            section_order: [],
            warnings: [],
          },
          review_metadata: {
            source_refs_by_path: {},
            field_origins_by_path: {},
            omissions_by_path: [],
          },
        };
      });
      (service as any).aiServiceClient.generateCvDraftReview = provider;
      await service.enqueueGeneration(
        source._id,
        { expectedContentVersion: 7 },
        user,
        randomUUID(),
      );
      await assertPreserved(source);
      const payload = queue.add.mock.calls[0][1] as CvGenerationJobData;
      const worker = service.processGenerationJob(payload);
      const holder = peer.createQueryRunner();
      let expected: OnlineCV = source;
      try {
        await entered.promise;
        if (scenario === 'concurrent-edit') {
          await holder.connect();
          await holder.startTransaction();
          await holder.manager.getRepository(OnlineCV).findOneOrFail({
            where: { _id: source._id },
            lock: { mode: 'pessimistic_write' },
          });
          const [{ pid }] = await holder.query(
            'SELECT pg_backend_pid() AS pid',
          );
          inference.release();
          const deadline = Date.now() + 5000;
          let blocked = false;
          while (!blocked && Date.now() < deadline) {
            const rows = await db.query(
              'SELECT 1 FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))',
              [pid],
            );
            blocked = rows.length > 0;
            if (!blocked)
              await new Promise((resolve) => setTimeout(resolve, 10));
          }
          expect(blocked).toBe(true);
          await assertPreserved(source);
          await holder.manager.getRepository(OnlineCV).update(source._id, {
            careerObjective: 'Explicit concurrent editor change',
            contentVersion: 8,
            revision: {
              ...(
                await repository.findOneByOrFail({ _id: source._id })
              ).revision,
              contentVersion: 8,
            },
          });
          await holder.commitTransaction();
          expected = await repository.findOneByOrFail({ _id: source._id });
        }
        inference.release();
        await worker;
        expect(provider).toHaveBeenCalledTimes(1);
        const after = await assertPreserved(expected);
        if (scenario === 'stage') {
          expect(after.generationSnapshot?.pendingDraft).toMatchObject({
            reviewStatus: 'PENDING',
            expectedContentVersion: 7,
            draft: {
              position: 'Suggested engineer',
              career_objective: 'Suggested objective',
            },
          });
          expect(after.revision.sourceTrace.generation).toMatchObject({
            kind: 'EXISTING_CV',
            implementation: 'agent',
            status: 'COMPLETE',
            reviewStatus: 'PENDING',
          });
        } else {
          expect(after.generationSnapshot?.pendingDraft).toBeUndefined();
          expect(after.revision.sourceTrace.generation).toMatchObject({
            status: 'STALE',
          });
        }
      } finally {
        if (holder.isTransactionActive) await holder.rollbackTransaction();
        await holder.release();
        inference.release();
        await worker;
      }
    },
  );

  it('T032 initial safe partial stages retained fields and exposes precise safe omissions', async () => {
    const client = (service as any).aiServiceClient;
    const original = client.generateCvDraftReview;
    client.generateCvDraftReview = jest.fn(async (request) => {
      const result = await original(request);
      result.implementation = 'agent';
      result.draft.content_version = request.content_version;
      result.review_metadata = {
        source_refs_by_path: { '/position': ['/candidate/headline'] },
        field_origins_by_path: {
          '/full_name': 'SOURCE',
          '/position': 'LOCALIZED',
          '/career_objective': 'AI_SUGGESTED',
          '/skills/0/name': 'FALLBACK',
        },
        omissions_by_path: [
          {
            path: '/projects/0/description',
            reason_code: 'INSUFFICIENT_EVIDENCE',
          },
        ],
      };
      return result;
    });
    const { accepted, worker } = await start();
    inference.release();
    await worker;
    const status = await other.getGenerationJob(
      accepted.onlineCvId,
      accepted.operationId,
      user,
    );
    expect(status).toMatchObject({
      status: 'DEGRADED',
      reviewStatus: 'PENDING',
      reviewMetadata: {
        fieldOriginsByPath: {
          '/full_name': 'SOURCE',
          '/position': 'LOCALIZED',
          '/career_objective': 'AI_SUGGESTED',
          '/skills/0/name': 'FALLBACK',
        },
        omissionsByPath: [
          {
            path: '/projects/0/description',
            reasonCode: 'INSUFFICIENT_EVIDENCE',
          },
        ],
      },
      draft: { position: 'Generated engineer', projects: [] },
    });
    const row = await peer
      .getRepository(OnlineCV)
      .findOneByOrFail({ _id: accepted.onlineCvId });
    expect(row.contentVersion).toBe(1);
    expect(row.careerObjective).toBe('Build reliable systems');
    expect(row.generationSnapshot!.pendingDraft!.fieldOriginsByPath).toEqual(
      status.reviewMetadata!.fieldOriginsByPath,
    );
  });

  it('T032 unsafe partial provider failure exposes no draft and preserves source', async () => {
    (service as any).aiServiceClient.generateCvDraftReview = jest.fn(
      async () => {
        throw new Error('No individually safe subset');
      },
    );
    const accepted = await service.enqueueGenerationFromCareerProfile(
      {},
      user,
      't032-unsafe',
    );
    const repository = peer.getRepository(OnlineCV);
    const before = await repository.findOneByOrFail({
      _id: accepted.onlineCvId,
    });
    await service.processGenerationJob(queue.add.mock.calls[0][1]);
    const status = await other.getGenerationJob(
      before._id,
      accepted.operationId,
      user,
    );
    expect(status.status).toBe('FAILED');
    expect(status.draft).toBeUndefined();
    const after = await repository.findOneByOrFail({ _id: before._id });
    expect(after.generationSnapshot?.pendingDraft).toBeUndefined();
    expect(after.contentVersion).toBe(before.contentVersion);
    expect(after.careerObjective).toBe(before.careerObjective);
  });

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

  it('keeps structured Agent output pending until explicit approval', async () => {
    const { accepted, worker } = await start();
    inference.release();
    await worker;
    const before = await peer
      .getRepository(OnlineCV)
      .findOneByOrFail({ _id: accepted.onlineCvId });
    expect(before.contentVersion).toBe(1);
    expect(before.revision.sourceTrace.generation.status).toBe('COMPLETE');
    expect(before.careerObjective).toBe('Build reliable systems');
    expect(before.generationSnapshot.pendingDraft.draft.career_objective).toBe(
      'Generated objective',
    );
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
