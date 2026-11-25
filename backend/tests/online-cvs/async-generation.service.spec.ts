import { OnlineCVsService } from 'src/online-cvs/online-cvs.service';
import { Role } from 'src/decorator/customize';
import { OnlineCvGenerationProcessor } from 'src/online-cvs/online-cv-generation.processor';
import { Logger } from '@nestjs/common';
import { AiServiceError } from 'src/ai-matching/ai-service.client';
import { createHash } from 'crypto';

const user = {
  _id: '11111111-1111-4111-8111-111111111111',
  email: 'candidate@example.com',
  name: 'Candidate Name',
  role: Role.USER,
};

function generatedReview(data: Record<string, any>) {
  return {
    implementation: 'agent',
    draft: {
      request_id: data.operationId,
      trace_id: data.operationId,
      operation_attempt_id: data.operationId,
      candidate_id: user._id,
      target_job_id: data.targetJobId || data.cvId,
      template_type: data.templateType || 'template1',
      generation_mode: 'EDITOR_ONLY',
      full_name: user.name,
      title: 'Candidate CV',
      position: 'Software Engineer',
      email: user.email,
      phone: null,
      link: null,
      address: null,
      career_objective: 'Build reliable services',
      education: [],
      projects: [],
      work_experience: [],
      skills: [],
      activities: [],
      certificates: [],
      awards: [],
      section_order: [],
      warnings: [],
      generated_by: 'ai-service',
      source_version: data.sourceVersion,
      content_version: data.expectedContentVersion + 1,
    },
    review_metadata: {
      source_refs_by_path: { '/position': ['/candidate/headline'] },
      field_origins_by_path: { '/position': 'AI_SUGGESTED' },
      omissions_by_path: [],
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function createExistingService() {
  const cv: any = {
    _id: '22222222-2222-4222-8222-222222222222',
    userId: user._id,
    contentVersion: 1,
    templateType: 'template1',
    position: 'Engineer',
    title: 'CV',
    revision: { contentVersion: 1, sourceTrace: {} },
    isDeleted: false,
  };
  const queue = {
    add: jest.fn().mockResolvedValue({}),
    getJob: jest.fn(),
  };
  const repo: any = {
    findOne: jest.fn().mockImplementation(async () => cv),
    findOneOrFail: jest.fn().mockImplementation(async () => cv),
    update: jest
      .fn()
      .mockImplementation(async (_where: unknown, patch: any) => {
        Object.assign(cv, patch);
        return { affected: 1 };
      }),
  };
  const userRepo = {
    findOne: jest.fn().mockResolvedValue({ ...user, isDeleted: false }),
  };
  const manager: any = {
    getRepository: jest.fn((entity: any) =>
      entity?.name === 'OnlineCV' ? repo : userRepo,
    ),
    transaction: jest.fn((callback: (transaction: any) => unknown) =>
      callback(manager),
    ),
  };
  repo.manager = manager;
  const aiServiceClient: any = { generateCvDraft: jest.fn() };
  aiServiceClient.generateCvDraftReview = jest.fn(async (...args: any[]) => ({
    implementation: 'legacy',
    draft: await aiServiceClient.generateCvDraft(...args),
    review_metadata: {
      source_refs_by_path: {},
      field_origins_by_path: {},
      omissions_by_path: [],
    },
  }));
  const service = Object.create(OnlineCVsService.prototype) as OnlineCVsService;
  Object.assign(service as any, {
    onlineCVRepo: repo,
    generationQueue: queue,
    userRepo,
    usersService: {
      isCandidatePremium: jest.fn().mockReturnValue(false),
      getUserMaxCvLimit: jest.fn().mockReturnValue(3),
    },
    aiCvConsentsService: {
      lockScope: jest.fn().mockResolvedValue(undefined),
      hasValidConsent: jest.fn().mockResolvedValue(true),
    },
    aiServiceClient,
    configService: { get: jest.fn() },
    jobsService: { findOne: jest.fn().mockResolvedValue(null) },
  });
  return { service, cv, queue, repo };
}

describe('async online CV generation', () => {
  const previousRedis = process.env.REDIS_ENABLED;

  beforeEach(() => {
    process.env.REDIS_ENABLED = 'true';
  });

  describe('T016 acceptance-to-result deadline', () => {
    beforeEach(() => {
      jest.useFakeTimers({ now: new Date('2026-11-21T00:00:00Z') });
    });

    afterEach(() => jest.useRealTimers());

    it('subtracts synchronous authorization/context time from the 300-second provider budget', async () => {
      const { service, cv } = createExistingService();
      (service as any).aiCvConsentsService.hasValidConsent.mockImplementation(
        async () => {
          jest.setSystemTime(Date.now() + 40_000);
          return true;
        },
      );
      const client = (service as any).aiServiceClient;
      client.generateCvDraftReview.mockRejectedValue(
        new Error('deterministic stop'),
      );

      await expect(
        service.generate(cv._id, {} as any, user as any),
      ).rejects.toBeDefined();

      expect(client.generateCvDraftReview).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ timeoutMs: 260_000 }),
      );
    });

    it('counts queue wait instead of granting the worker a fresh generation budget', async () => {
      const { service, cv, queue } = createExistingService();
      await service.enqueueGeneration(
        cv._id,
        { expectedContentVersion: 1 },
        user as any,
        'deadline-budget',
      );
      jest.setSystemTime(Date.now() + 240_000);
      const generate = jest
        .spyOn(service, 'generate')
        .mockResolvedValue(undefined as any);

      await service.processGenerationJob(queue.add.mock.calls[0][1]);

      expect(generate).toHaveBeenCalledWith(
        cv._id,
        expect.any(Object),
        expect.any(Object),
        expect.any(String),
        60_000,
      );
    });

    it('settles a synchronous request by 300 seconds even if the provider never settles', async () => {
      const { service, cv } = createExistingService();
      const started = deferred<void>();
      (service as any).aiServiceClient.generateCvDraftReview.mockImplementation(
        () => {
          started.resolve();
          return new Promise(() => undefined);
        },
      );
      let outcome: any;
      void service.generate(cv._id, {} as any, user as any).then(
        (value) => {
          outcome = { value };
        },
        (error) => {
          outcome = { error };
        },
      );
      await started.promise;

      await jest.advanceTimersByTimeAsync(300_000);

      expect(outcome).toEqual({
        error: expect.objectContaining({ status: 504 }),
      });
      expect(cv.generationSnapshot?.pendingDraft).toBeUndefined();
    });

    it('returns an actionable timeout at the deadline even when no worker has started', async () => {
      const { service, cv, queue } = createExistingService();
      const accepted = await service.enqueueGeneration(
        cv._id,
        { expectedContentVersion: 1 },
        user as any,
        'queue-expired',
      );
      jest.setSystemTime(Date.now() + 300_000);

      const status = await service.getGenerationJob(
        cv._id,
        accepted.operationId,
        user as any,
      );

      expect(status).toMatchObject({
        status: 'FAILED',
        errorCode: 'AI_TIMEOUT',
        pollAfterSeconds: 0,
      });
      const generate = jest
        .spyOn(service, 'generate')
        .mockResolvedValue(undefined as any);
      await service.processGenerationJob(queue.add.mock.calls[0][1]);
      expect(generate).not.toHaveBeenCalled();
      expect(cv.generationSnapshot?.pendingDraft).toBeUndefined();
    });

    it('does not invoke generation when a worker dequeues at the deadline', async () => {
      const { service, cv, queue } = createExistingService();
      await service.enqueueGeneration(
        cv._id,
        { expectedContentVersion: 1 },
        user as any,
        'expired-worker',
      );
      jest.setSystemTime(Date.now() + 300_000);
      const generate = jest
        .spyOn(service, 'generate')
        .mockResolvedValue(undefined as any);

      await new OnlineCvGenerationProcessor(service).handleGeneration({
        data: queue.add.mock.calls[0][1],
      } as any);

      expect(generate).not.toHaveBeenCalled();
      expect(cv.revision.sourceTrace.generation).toMatchObject({
        status: 'FAILED',
        errorCode: 'AI_TIMEOUT',
      });
    });

    it('fences an otherwise valid result that arrives after the acceptance deadline', async () => {
      const { service, cv, queue } = createExistingService();
      const started = deferred<void>();
      const response = deferred<Record<string, any>>();
      (service as any).aiServiceClient.generateCvDraftReview.mockImplementation(
        () => {
          started.resolve();
          return response.promise;
        },
      );
      await service.enqueueGeneration(
        cv._id,
        { expectedContentVersion: 1 },
        user as any,
        'late-deadline',
      );
      const job = queue.add.mock.calls[0][1];
      const processor = new OnlineCvGenerationProcessor(service);
      const worker = processor.handleGeneration({ data: job } as any);
      await started.promise;
      jest.setSystemTime(Date.now() + 300_001);
      response.resolve(generatedReview(job));
      await worker;

      expect(cv.generationSnapshot?.pendingDraft).toBeUndefined();
      expect(cv.revision.sourceTrace.generation).toMatchObject({
        status: 'FAILED',
        errorCode: 'AI_TIMEOUT',
      });
      expect(cv.contentVersion).toBe(1);
    });
  });

  afterAll(() => {
    if (previousRedis === undefined) delete process.env.REDIS_ENABLED;
    else process.env.REDIS_ENABLED = previousRedis;
  });

  describe('T029 selected-item regeneration', () => {
    const targets = [
      ['/position', '/candidate/headline'],
      ['/career_objective', '/candidate/career_objective'],
      ['/education/0', '/candidate/education/1'],
      ['/work_experience/0', '/candidate/experience/1'],
      ['/projects/0', '/candidate/projects/1'],
      ['/skills/0', '/candidate/skills/1'],
      ['/activities/0', '/candidate/activities/1'],
      ['/certificates/0', '/candidate/certificates/1'],
      ['/awards/0', '/candidate/awards/1'],
    ];
    const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
    function draftHash(draft: unknown): string {
      const keys = new Set<string>();
      JSON.stringify(draft, (key, value) => {
        keys.add(key);
        return value;
      });
      return createHash('sha256')
        .update(JSON.stringify(draft, [...keys].sort()))
        .digest('hex');
    }

    async function pendingFixture() {
      const fixture = createExistingService();
      const { service, cv, queue } = fixture;
      Object.assign(cv, {
        careerObjective: 'Owned objective',
        education: [0, 1].map((i) => ({
          schoolName: `School ${i}`,
          major: 'CS',
        })),
        workExperience: [0, 1].map((i) => ({
          companyName: `Company ${i}`,
          position: 'Engineer',
          description: `Owned work ${i}`,
        })),
        projects: [0, 1].map((i) => ({
          projectName: `Project ${i}`,
          description: `Owned project ${i}`,
          technologies: ['TypeScript'],
        })),
        skills: [{ name: 'Python' }, { name: 'TypeScript' }],
        activities: [0, 1].map((i) => ({
          organizationName: `Group ${i}`,
          description: `Activity ${i}`,
        })),
        certificates: [0, 1].map((i) => ({ name: `Certificate ${i}` })),
        awards: [0, 1].map((i) => ({ name: `Award ${i}` })),
        isPrimary: true,
        isSearchable: true,
      });
      await service.enqueueGeneration(
        cv._id,
        { expectedContentVersion: 1 },
        user as any,
        't029-initial',
      );
      const job = queue.add.mock.calls[0][1];
      const result = generatedReview(job);
      Object.assign(result.draft, {
        education: [
          {
            school_name: 'School 1',
            major: 'CS',
            degree: null,
            start_date: null,
            end_date: null,
            description: null,
          },
        ],
        work_experience: [
          {
            source_index: 1,
            company_name: 'Company 1',
            position: 'Engineer',
            start_date: null,
            end_date: null,
            description: 'Owned work 1',
            bullets: ['Owned work 1'],
          },
        ],
        projects: [
          {
            source_index: 1,
            project_name: 'Project 1',
            role: null,
            start_date: null,
            end_date: null,
            description: 'Owned project 1',
            technologies: ['TypeScript'],
            bullets: ['Owned project 1'],
          },
        ],
        skills: [{ name: 'Languages', description: 'TypeScript' }],
        activities: ['Activity 1'],
        certificates: ['Certificate 1'],
        awards: ['Award 1'],
      });
      Object.assign(
        result.review_metadata.source_refs_by_path,
        Object.fromEntries(targets.map(([path, ref]) => [path, [ref]])),
      );
      (service as any).aiServiceClient.generateCvDraftReview.mockResolvedValue(
        result,
      );
      await service.processGenerationJob(job);
      const pending = cv.generationSnapshot.pendingDraft;
      expect(pending.draft).toEqual(result.draft);
      const sourceCandidate = clone(
        (service as any).aiServiceClient.generateCvDraftReview.mock.calls[0][0]
          .candidate,
      );
      fixture.repo.update.mockClear();
      queue.add.mockClear();
      (service as any).aiServiceClient.generateCvDraftReview.mockClear();
      const dto = (targetPath = '/position') => ({
        expectedContentVersion: 1,
        regenerationTarget: {
          reviewOperationId: pending.operationId,
          expectedDraftHash: pending.draftHash,
          targetPath,
        },
      });
      const enqueue = (body = dto(), key = 't029-selected') =>
        service.enqueueGeneration(cv._id, body as any, user as any, key);
      return { ...fixture, pending, dto, enqueue, sourceCandidate };
    }

    it.each(['save', 'reject', 'regenerate'])(
      'T039 keeps an existing Agent pending draft owner-readable and available to %s after legacy rollback',
      async (action) => {
        const { service, cv, repo, queue, pending, enqueue } =
          await pendingFixture();
        const before = clone(cv);
        const client = (service as any).aiServiceClient;
        // Capability selection belongs to FastAPI. At this boundary rollback
        // is represented by its existing legacy review response contract.
        client.generateCvDraftReview.mockImplementation(async () => {
          const result = generatedReview(queue.add.mock.calls[0][1]);
          result.implementation = 'legacy';
          result.draft.position = 'Legacy regenerated position';
          return result;
        });
        repo.findOne.mockImplementation(async ({ where }) =>
          where._id === cv._id && where.userId === user._id ? cv : null,
        );
        expect(
          await service.getGenerationJob(
            cv._id,
            pending.operationId,
            user as any,
          ),
        ).toMatchObject({
          reviewStatus: 'PENDING',
          draft: pending.draft,
          draftHash: pending.draftHash,
        });
        await expect(
          service.getGenerationJob(cv._id, pending.operationId, {
            ...user,
            _id: '99999999-9999-4999-8999-999999999999',
          } as any),
        ).rejects.toMatchObject({ status: 404 });
        expect(cv).toEqual(before);

        if (action === 'save') {
          (service as any).invalidateUserCvSkillsCache = jest
            .fn()
            .mockResolvedValue(undefined);
          (service as any).exportToPdf = jest.fn().mockResolvedValue(undefined);
          await service.update(
            cv._id,
            {
              expectedContentVersion: 1,
              position: pending.draft.position,
              generationApproval: {
                operationId: pending.operationId,
                draftHash: pending.draftHash,
              },
            },
            user as any,
          );
          expect(cv.contentVersion).toBe(2);
          expect(cv.position).toBe(pending.draft.position);
          expect(cv.generationSnapshot.pendingDraft).toBeUndefined();
          expect(cv.revision.sourceTrace.generation.reviewStatus).toBe(
            'APPROVED',
          );
        } else if (action === 'reject') {
          await service.discardGenerationDraft(
            cv._id,
            pending.operationId,
            user as any,
          );
          expect(cv.generationSnapshot.pendingDraft).toBeUndefined();
          expect(cv.revision.sourceTrace.generation.reviewStatus).toBe(
            'REJECTED',
          );
          expect({
            ...cv,
            revision: before.revision,
            generationSnapshot: before.generationSnapshot,
          }).toEqual(before);
        } else {
          const accepted = await enqueue();
          await service.processGenerationJob(queue.add.mock.calls[0][1]);
          expect(
            await service.getGenerationJob(
              cv._id,
              accepted.operationId,
              user as any,
            ),
          ).toMatchObject({ status: 'COMPLETE' });
          expect(cv.generationSnapshot.pendingDraft.operationId).toBe(
            pending.operationId,
          );
          expect(cv.generationSnapshot.pendingDraft.draft).toEqual({
            ...before.generationSnapshot.pendingDraft.draft,
            position: 'Legacy regenerated position',
          });
          expect(cv.contentVersion).toBe(1);
          expect(cv.position).toBe(before.position);
        }
        expect(client.generateCvDraftReview).toHaveBeenCalledTimes(
          action === 'regenerate' ? 1 : 0,
        );
      },
    );

    it.each(targets)(
      'resolves %s through its authorized source reference %s, not the draft index',
      async (path, ref) => {
        const { cv, service, queue, pending, dto, enqueue, sourceCandidate } =
          await pendingFixture();
        const before = clone(pending);
        const accepted = await enqueue(dto(path));
        expect(accepted.operationId).not.toBe(pending.operationId);
        const client = (service as any).aiServiceClient.generateCvDraftReview;
        client.mockImplementation(async (request) => {
          const candidate = request.candidate;
          const sourceKey = ref.split('/')[2];
          if (ref.endsWith('/1')) {
            expect(candidate[sourceKey]).toHaveLength(1);
            expect(candidate[sourceKey]).toEqual([
              sourceCandidate[sourceKey][1],
            ]);
            expect(JSON.stringify(candidate[sourceKey])).not.toContain(
              'Owned work 0',
            );
            if (sourceKey === 'skills')
              expect(candidate.skills).toEqual(['TypeScript']);
            if (sourceKey === 'experience')
              expect(candidate.experience[0].company_name).toBe('Company 1');
            if (sourceKey === 'projects')
              expect(candidate.projects[0].project_name).toBe('Project 1');
            if (sourceKey === 'education')
              expect(candidate.education[0].school_name).toBe('School 1');
          } else
            expect(candidate[sourceKey]).toBe(
              path === '/position' ? 'Engineer' : 'Owned objective',
            );
          const result = generatedReview(queue.add.mock.calls[0][1]);
          const key = path.split('/')[1];
          result.draft = clone(before.draft);
          if (Array.isArray(result.draft[key])) {
            const selected = result.draft[key][0];
            if (
              selected &&
              typeof selected === 'object' &&
              'source_index' in selected
            )
              selected.source_index = 0;
          }
          return result;
        });
        await service.processGenerationJob(queue.add.mock.calls[0][1]);
        expect(client).toHaveBeenCalledTimes(1);
        expect(cv.contentVersion).toBe(1);
        expect(cv.generationSnapshot.pendingDraft.operationId).toBe(
          before.operationId,
        );
        expect(
          await service.getGenerationJob(
            cv._id,
            accepted.operationId,
            user as any,
          ),
        ).toMatchObject({ status: 'COMPLETE' });
      },
    );

    it.each([
      '/full_name',
      '/email',
      '/phone',
      '/link',
      '/address',
      '/title',
      '/candidate_id',
      '/request_id',
      '/section_order',
      '/warnings',
      '/content_version',
      '/source_version',
      '/reviewMetadata',
      '/position/nested',
      '/projects',
      '/projects/-1',
      '/projects/01',
      '/projects/99',
      '/work_experience/0/bullets/0',
    ])(
      'rejects forbidden or non-single-item target %s before queueing',
      async (path) => {
        const { cv, queue, repo, dto, enqueue } = await pendingFixture();
        const before = clone(cv);
        await expect(enqueue(dto(path))).rejects.toMatchObject({ status: 400 });
        expect(cv).toEqual(before);
        expect(queue.add).not.toHaveBeenCalled();
        expect(repo.update).not.toHaveBeenCalled();
      },
    );

    it.each(['absent', 'ambiguous', 'outside source'])(
      'rejects a %s source mapping without changing pending content or provenance',
      async (mapping) => {
        const { cv, pending, queue, dto, enqueue } = await pendingFixture();
        if (mapping === 'absent') delete pending.sourceRefsByPath['/position'];
        else
          pending.sourceRefsByPath['/position'] =
            mapping === 'ambiguous'
              ? ['/candidate/headline', '/candidate/career_objective']
              : ['/candidate/experience/999'];
        const before = clone(cv);
        await expect(enqueue(dto())).rejects.toBeDefined();
        expect(cv).toEqual(before);
        expect(queue.add).not.toHaveBeenCalled();
      },
    );

    it.each(['agent', 'legacy'])(
      'replaces only the target and its provenance in %s mode, retaining the approval identity',
      async (implementation) => {
        const { service, cv, queue, enqueue } = await pendingFixture();
        const before = clone(cv);
        const accepted = await enqueue();
        const job = queue.add.mock.calls[0][1];
        const response = generatedReview(job);
        response.implementation = implementation;
        response.draft.position = 'Backend Engineer';
        response.draft.career_objective =
          'Unselected provider change must be ignored';
        response.review_metadata.field_origins_by_path = {
          '/position': 'LOCALIZED',
        };
        (
          service as any
        ).aiServiceClient.generateCvDraftReview.mockResolvedValue(response);
        await service.processGenerationJob(job);
        const after = cv.generationSnapshot.pendingDraft;
        expect(after.operationId).toBe(
          before.generationSnapshot.pendingDraft.operationId,
        );
        expect(after.draft).toEqual({
          ...before.generationSnapshot.pendingDraft.draft,
          position: 'Backend Engineer',
        });
        expect(after.fieldOriginsByPath).toEqual({
          ...before.generationSnapshot.pendingDraft.fieldOriginsByPath,
          '/position': 'LOCALIZED',
        });
        expect(after.sourceRefsByPath).toEqual(
          before.generationSnapshot.pendingDraft.sourceRefsByPath,
        );
        expect(after.omissionsByPath).toEqual(
          before.generationSnapshot.pendingDraft.omissionsByPath,
        );
        expect(after.draftHash).toMatch(/^[a-f0-9]{64}$/);
        expect(after.draftHash).not.toBe(
          before.generationSnapshot.pendingDraft.draftHash,
        );
        expect({
          ...cv,
          revision: before.revision,
          generationSnapshot: before.generationSnapshot,
        }).toEqual(before);
        const status = await service.getGenerationJob(
          cv._id,
          accepted.operationId,
          user as any,
        );
        expect(status).toMatchObject({
          status: 'COMPLETE',
          draftHash: after.draftHash,
          reviewMetadata: { fieldOriginsByPath: after.fieldOriginsByPath },
        });
        expect(JSON.stringify(status)).not.toContain('sourceRefsByPath');
      },
    );

    it('replays the same target but rejects reuse of its key with another target, hash or review operation', async () => {
      const { dto, enqueue, queue } = await pendingFixture();
      const body = dto();
      const first = await enqueue(body);
      expect((await enqueue(body)).operationId).toBe(first.operationId);
      for (const change of [
        { targetPath: '/career_objective' },
        { expectedDraftHash: '0'.repeat(64) },
        { reviewOperationId: '99999999-9999-4999-8999-999999999999' },
      ])
        await expect(
          enqueue({
            ...body,
            regenerationTarget: { ...body.regenerationTarget, ...change },
          }),
        ).rejects.toMatchObject({ status: 409 });
      expect(queue.add).toHaveBeenCalledTimes(1);
    });

    it('replaces one work entry and its leaf origins, preserving sibling items and unrelated omissions', async () => {
      const { cv, service, pending, queue, dto, enqueue } =
        await pendingFixture();
      pending.draft.work_experience.push({
        ...clone(pending.draft.work_experience[0]),
        source_index: 0,
        company_name: 'Company 0',
        bullets: ['Owned work 0'],
      });
      pending.sourceRefsByPath['/work_experience/1'] = [
        '/candidate/experience/0',
      ];
      pending.fieldOriginsByPath = {
        '/position': 'SOURCE',
        '/work_experience/0/position': 'SOURCE',
        '/work_experience/0/bullets/0': 'FALLBACK',
        '/work_experience/1/bullets/0': 'SOURCE',
      };
      pending.omissionsByPath = [
        { path: '/projects/0/role', reasonCode: 'INSUFFICIENT_EVIDENCE' },
      ];
      pending.draftHash = draftHash(pending.draft);
      const before = clone(pending);
      const accepted = await enqueue(dto('/work_experience/0'));
      const job = queue.add.mock.calls[0][1];
      const response = generatedReview(job);
      const replacement = {
        ...clone(before.draft.work_experience[0]),
        bullets: ['Built reliable owned services'],
      };
      response.draft.work_experience = [{ ...replacement, source_index: 0 }];
      Object.assign(response.review_metadata, {
        field_origins_by_path: {
          '/work_experience/0/position': 'SOURCE',
          '/work_experience/0/bullets/0': 'AI_SUGGESTED',
        },
      });
      (service as any).aiServiceClient.generateCvDraftReview.mockResolvedValue(
        response,
      );
      await service.processGenerationJob(job);
      const after = cv.generationSnapshot.pendingDraft;
      expect(after.draft).toEqual({
        ...before.draft,
        work_experience: [replacement, before.draft.work_experience[1]],
      });
      expect(after.fieldOriginsByPath).toEqual({
        ...before.fieldOriginsByPath,
        '/work_experience/0/bullets/0': 'AI_SUGGESTED',
      });
      expect(after.omissionsByPath).toEqual(before.omissionsByPath);
      expect(after.sourceRefsByPath).toEqual(before.sourceRefsByPath);
      expect(after.operationId).toBe(before.operationId);
      expect(after.draftHash).not.toBe(before.draftHash);
      expect(
        await service.getGenerationJob(
          cv._id,
          accepted.operationId,
          user as any,
        ),
      ).toMatchObject({ draftHash: after.draftHash });
    });

    it.each(['hash', 'review operation'])(
      'rejects a stale %s without replacing the pending review',
      async (field) => {
        const { cv, dto, enqueue, queue } = await pendingFixture();
        const body = dto();
        if (field === 'hash')
          body.regenerationTarget.expectedDraftHash = '0'.repeat(64);
        else
          body.regenerationTarget.reviewOperationId =
            '99999999-9999-4999-8999-999999999999';
        const before = clone(cv);
        await expect(enqueue(body)).rejects.toMatchObject({ status: 409 });
        expect(cv).toEqual(before);
        expect(queue.add).not.toHaveBeenCalled();
      },
    );

    it.each(targets.filter(([path]) => path.endsWith('/0')))(
      'preserves the pending review when selected output %s is missing',
      async (path) => {
        const { cv, service, pending, queue, dto, enqueue } =
          await pendingFixture();
        const before = clone(pending);
        const accepted = await enqueue(dto(path));
        const job = queue.add.mock.calls[0][1];
        (
          service as any
        ).aiServiceClient.generateCvDraftReview.mockResolvedValue(
          generatedReview(job),
        );
        await service.processGenerationJob(job);
        expect(cv.generationSnapshot.pendingDraft).toEqual(before);
        const status = await service.getGenerationJob(
          cv._id,
          accepted.operationId,
          user as any,
        );
        expect(['FAILED', 'STALE']).toContain(status.status);
        expect(status.draft).toBeUndefined();
      },
    );

    it.each([
      'cancel',
      'concurrent hash',
      'content version',
      'timeout',
      'missing output',
    ])(
      'fences an in-flight selected result after %s without replacing pending data or metadata',
      async (fence) => {
        const { cv, service, pending, queue, enqueue } = await pendingFixture();
        const accepted = await enqueue();
        const job = queue.add.mock.calls[0][1];
        const started = deferred<void>();
        const response = deferred<Record<string, any>>();
        (
          service as any
        ).aiServiceClient.generateCvDraftReview.mockImplementation(() => {
          started.resolve();
          return response.promise;
        });
        const worker = service.processGenerationJob(job);
        // Also settle if a broken worker exits without invoking the provider.
        await Promise.race([started.promise, worker]);
        let clock: jest.SpyInstance | undefined;
        try {
          if (fence === 'cancel')
            await service.cancelGeneration(
              cv._id,
              accepted.operationId,
              user as any,
            );
          if (fence === 'concurrent hash') {
            const currentPending = cv.generationSnapshot.pendingDraft;
            currentPending.draft.position = 'Concurrent winner';
            currentPending.draftHash = draftHash(currentPending.draft);
            currentPending.fieldOriginsByPath['/position'] = 'SOURCE';
          }
          if (fence === 'content version') cv.contentVersion++;
          if (fence === 'timeout')
            clock = jest
              .spyOn(Date, 'now')
              .mockReturnValue(Date.now() + 300_001);
          const before = clone(cv.generationSnapshot);
          const result = generatedReview(job);
          if (fence === 'missing output') result.draft.position = null;
          response.resolve(result);
          await worker;
          expect(cv.generationSnapshot).toEqual(before);
          const status = await service.getGenerationJob(
            cv._id,
            accepted.operationId,
            user as any,
          );
          expect(['FAILED', 'STALE', 'CANCELLED']).toContain(status.status);
          expect(status.draft).toBeUndefined();
        } finally {
          response.resolve(generatedReview(job));
          await worker;
          clock?.mockRestore();
        }
      },
    );
  });

  describe('T024 pending draft discard', () => {
    // T025 adds this service boundary; keep these contract tests executable RED
    // without adding a production stub or suppressing TypeScript diagnostics.
    type DiscardService = OnlineCVsService & {
      discardGenerationDraft(
        id: string,
        operationId: string,
        caller: typeof user,
      ): Promise<void>;
    };

    async function createPendingReview() {
      const fixture = createExistingService();
      const { service, cv, queue, repo } = fixture;
      Object.assign(cv, {
        careerObjective: 'Canonical objective\n  Keep spacing',
        skills: [{ name: 'TypeScript' }],
        workExperience: [
          { position: 'Engineer', description: 'Canonical work' },
        ],
        isPrimary: true,
        isSearchable: true,
        generationSnapshot: { localizationRetry: { attempt: 1 } },
      });
      await service.enqueueGeneration(
        cv._id,
        { expectedContentVersion: 1 },
        user as any,
        'discard-review',
      );
      const job = queue.add.mock.calls[0][1];
      (service as any).aiServiceClient.generateCvDraftReview.mockResolvedValue(
        generatedReview(job),
      );
      await service.processGenerationJob(job);
      expect(cv.generationSnapshot.pendingDraft.reviewStatus).toBe('PENDING');

      const otherCv = JSON.parse(JSON.stringify(cv));
      otherCv._id = '44444444-4444-4444-8444-444444444444';
      otherCv.revision.sourceTrace.generation.operationId =
        '55555555-5555-4555-8555-555555555555';
      otherCv.generationSnapshot.pendingDraft.operationId =
        otherCv.revision.sourceTrace.generation.operationId;
      const rows = [cv, otherCv];
      repo.findOne.mockImplementation(async ({ where }) =>
        rows.find(
          (row) =>
            row._id === where._id &&
            row.userId === where.userId &&
            row.isDeleted === where.isDeleted,
        ),
      );
      repo.update.mockImplementation(async (where, patch) => {
        const row = rows.find(
          (item) => item._id === where._id && item.userId === where.userId,
        );
        if (!row) return { affected: 0 };
        Object.assign(row, patch);
        return { affected: 1 };
      });
      const profile = {
        contentVersion: 8,
        headline: 'Independent profile',
        skills: [{ name: 'Python' }],
      };
      const profileService = {
        requireMine: jest.fn().mockResolvedValue(profile),
        updateMine: jest.fn(async (_caller, patch) =>
          Object.assign(profile, patch),
        ),
      };
      (service as any).careerProfileService = profileService;
      repo.update.mockClear();
      return {
        ...fixture,
        discard: service as DiscardService,
        operationId: job.operationId as string,
        profile,
        profileService,
        otherCv,
      };
    }

    it('allows the owner to discard the matching PENDING output without changing canonical CV/profile/other operations', async () => {
      const {
        service,
        discard,
        cv,
        operationId,
        profile,
        profileService,
        otherCv,
      } = await createPendingReview();
      const before = JSON.parse(JSON.stringify(cv));
      const profileBefore = JSON.parse(JSON.stringify(profile));
      const otherBefore = JSON.parse(JSON.stringify(otherCv));

      await expect(
        discard.discardGenerationDraft(cv._id, operationId, user),
      ).resolves.toBeUndefined();

      expect(cv.generationSnapshot.pendingDraft).toBeUndefined();
      expect(cv.revision.sourceTrace.generation).toMatchObject({
        operationId,
        status: 'COMPLETE',
        reviewStatus: 'REJECTED',
      });
      expect({
        ...cv,
        generationSnapshot: before.generationSnapshot,
        revision: before.revision,
      }).toEqual(before);
      expect(cv.generationSnapshot).toEqual({
        localizationRetry: { attempt: 1 },
      });
      expect({
        ...cv.revision,
        sourceTrace: before.revision.sourceTrace,
      }).toEqual(before.revision);
      expect(profile).toEqual(profileBefore);
      expect(profileService.updateMine).not.toHaveBeenCalled();
      expect(otherCv).toEqual(otherBefore);
      const status = await service.getGenerationJob(cv._id, operationId, {
        ...user,
        age: 30,
      });
      expect(status).toMatchObject({ reviewStatus: 'REJECTED' });
      expect(status.draft).toBeUndefined();
      expect(JSON.stringify(status)).not.toContain('Build reliable services');
    });

    it('is idempotent when the owner repeats a successful discard', async () => {
      const { discard, cv, operationId } = await createPendingReview();
      await discard.discardGenerationDraft(cv._id, operationId, user);
      const afterFirstDiscard = JSON.parse(JSON.stringify(cv));

      await expect(
        discard.discardGenerationDraft(cv._id, operationId, user),
      ).resolves.toBeUndefined();

      expect(cv).toEqual(afterFirstDiscard);
      expect(cv.generationSnapshot.pendingDraft).toBeUndefined();
      expect(cv.revision.sourceTrace.generation.reviewStatus).toBe('REJECTED');
    });

    it('is an unchanged successful no-op for an already expired draft', async () => {
      const { discard, cv, operationId, repo } = await createPendingReview();
      delete cv.generationSnapshot.pendingDraft;
      cv.revision.sourceTrace.generation.reviewStatus = 'EXPIRED';
      const before = JSON.parse(JSON.stringify(cv));

      await expect(
        discard.discardGenerationDraft(cv._id, operationId, user),
      ).resolves.toBeUndefined();

      expect(cv).toEqual(before);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it.each(['requested operation', 'pending operation'])(
      'does not discard when the %s does not match the generation trace',
      async (mismatch) => {
        const { discard, cv, operationId, repo, otherCv } =
          await createPendingReview();
        const differentId = '66666666-6666-4666-8666-666666666666';
        if (mismatch === 'pending operation')
          cv.generationSnapshot.pendingDraft.operationId = differentId;
        const before = JSON.parse(JSON.stringify(cv));
        const otherBefore = JSON.parse(JSON.stringify(otherCv));

        await expect(
          discard.discardGenerationDraft(
            cv._id,
            mismatch === 'requested operation' ? differentId : operationId,
            user,
          ),
        ).rejects.toBeDefined();

        expect(cv).toEqual(before);
        expect(otherCv).toEqual(otherBefore);
        expect(repo.update).not.toHaveBeenCalled();
      },
    );

    it('does not reject or remove an already approved operation', async () => {
      const { discard, cv, operationId, repo } = await createPendingReview();
      delete cv.generationSnapshot.pendingDraft;
      cv.revision.sourceTrace.generation.reviewStatus = 'APPROVED';
      const before = JSON.parse(JSON.stringify(cv));

      await expect(
        discard.discardGenerationDraft(cv._id, operationId, user),
      ).rejects.toBeDefined();

      expect(cv).toEqual(before);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('returns the same non-disclosing not-found response for a non-owner and a missing CV', async () => {
      const { discard, cv, operationId, repo, profile, otherCv } =
        await createPendingReview();
      const otherUser = {
        ...user,
        _id: '99999999-9999-4999-8999-999999999999',
      };
      const before = JSON.parse(JSON.stringify({ cv, profile, otherCv }));
      const forbidden = await discard
        .discardGenerationDraft(cv._id, operationId, otherUser)
        .catch((error: unknown) => error);
      const missing = await discard
        .discardGenerationDraft(
          '77777777-7777-4777-8777-777777777777',
          operationId,
          otherUser,
        )
        .catch((error: unknown) => error);

      expect(forbidden).toMatchObject({ status: 404 });
      expect(missing).toMatchObject({ status: 404 });
      expect((forbidden as Error).message).toBe((missing as Error).message);
      expect(JSON.stringify(forbidden)).not.toContain(operationId);
      expect(JSON.stringify(forbidden)).not.toContain(
        'Build reliable services',
      );
      expect({ cv, profile, otherCv }).toEqual(before);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  it('stores a pending operation and sends only opaque queue data', async () => {
    const { service, queue, cv } = createExistingService();
    const first = await service.enqueueGeneration(
      cv._id,
      { expectedContentVersion: 1 } as any,
      user as any,
      'request-1',
    );

    expect(first.status).toBe('QUEUED');
    expect(first.onlineCvId).toBe(cv._id);
    expect(first).not.toHaveProperty('cvId');
    expect(first.pollAfterSeconds).toBe(5);
    expect(first.acceptedAt).toBe(cv.revision.sourceTrace.generation.createdAt);
    expect(queue.add).toHaveBeenCalledWith(
      'generate-cv',
      expect.objectContaining({
        operationId: first.operationId,
        userId: user._id,
        cvId: cv._id,
        idempotencyKeyHash: expect.not.stringContaining('request-1'),
      }),
      expect.objectContaining({ jobId: first.operationId, attempts: 1 }),
    );
    const queuedPayload = JSON.stringify(queue.add.mock.calls[0][1]);
    expect(queuedPayload).not.toContain(user.email);
    expect(queuedPayload).not.toContain(user.name);
    expect(cv.revision.sourceTrace.generation.status).toBe('QUEUED');

    const replay = await service.enqueueGeneration(
      cv._id,
      { expectedContentVersion: 1 } as any,
      user as any,
      'request-1',
    );
    expect(replay.operationId).toBe(first.operationId);
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('rejects a missing idempotency key before reserving work', async () => {
    const { service, repo, cv } = createExistingService();
    await expect(
      service.enqueueGeneration(
        cv._id,
        { expectedContentVersion: 1 } as any,
        user as any,
        '',
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('does not start a cancelled worker operation', async () => {
    const { service, cv } = createExistingService();
    cv.revision.sourceTrace.generation = {
      operationId: '33333333-3333-4333-8333-333333333333',
      status: 'CANCELLED',
      userId: user._id,
      cvId: cv._id,
    };
    (service as any).aiServiceClient = { generateCvDraft: jest.fn() };
    await service.processGenerationJob({
      operationId: cv.revision.sourceTrace.generation.operationId,
      userId: user._id,
      cvId: cv._id,
    } as any);
    expect(
      (service as any).aiServiceClient.generateCvDraft,
    ).not.toHaveBeenCalled();
  });

  it.each(['CANCELLED', 'STALE', 'COMPLETE', 'DEGRADED', 'FAILED'])(
    'ignores a late worker delivery for a %s operation without changing canonical content',
    async (status) => {
      const { service, cv, repo, queue } = createExistingService();
      Object.assign(cv, {
        careerObjective: 'Build reliable services',
        skills: [{ name: 'TypeScript' }],
        workExperience: [{ position: 'Engineer', description: 'Built APIs' }],
        isPrimary: true,
        isSearchable: true,
      });
      const accepted = await service.enqueueGeneration(
        cv._id,
        { expectedContentVersion: 1 },
        user as any,
        `late-${status}`,
      );
      cv.revision.sourceTrace.generation.status = status;
      const before = JSON.parse(JSON.stringify(cv));
      repo.update.mockClear();
      const generate = jest.spyOn(service, 'generate');
      const generateFromProfile = jest.spyOn(
        service,
        'generateFromCareerProfile',
      );

      await service.processGenerationJob(queue.add.mock.calls[0][1]);

      expect(accepted.operationId).toBe(
        cv.revision.sourceTrace.generation.operationId,
      );
      expect(generate).not.toHaveBeenCalled();
      expect(generateFromProfile).not.toHaveBeenCalled();
      expect(repo.update).not.toHaveBeenCalled();
      expect(cv).toEqual(before);
      expect(cv.generationSnapshot?.pendingDraft).toBeUndefined();
    },
  );

  it('ignores a superseded operation without changing the current operation or staging output', async () => {
    const { service, cv, repo, queue } = createExistingService();
    await service.enqueueGeneration(
      cv._id,
      { expectedContentVersion: 1 },
      user as any,
      'superseded-operation',
    );
    const oldPayload = queue.add.mock.calls[0][1];
    cv.revision.sourceTrace.generation.operationId =
      '44444444-4444-4444-8444-444444444444';
    const before = JSON.parse(JSON.stringify(cv));
    repo.update.mockClear();
    const generate = jest.spyOn(service, 'generate');
    const generateFromProfile = jest.spyOn(
      service,
      'generateFromCareerProfile',
    );

    await service.processGenerationJob(oldPayload);

    expect(generate).not.toHaveBeenCalled();
    expect(generateFromProfile).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
    expect(cv).toEqual(before);
    expect(cv.generationSnapshot?.pendingDraft).toBeUndefined();
  });

  it.each([
    { change: 'content version', errorCode: 'CONTENT_VERSION_CHANGED' },
    { change: 'source version', errorCode: 'SOURCE_VERSION_CHANGED' },
  ])(
    'fences a queued result with a stale $change before inference',
    async ({ change, errorCode }) => {
      const { service, cv, repo, queue } = createExistingService();
      await service.enqueueGeneration(
        cv._id,
        { expectedContentVersion: 1 },
        user as any,
        `stale-${change}`,
      );
      const payload = { ...queue.add.mock.calls[0][1] };
      if (change === 'content version') cv.contentVersion = 2;
      else payload.sourceVersion = '0'.repeat(64);
      const before = JSON.parse(JSON.stringify(cv));
      repo.update.mockClear();
      const generate = jest.spyOn(service, 'generate');
      const generateFromProfile = jest.spyOn(
        service,
        'generateFromCareerProfile',
      );

      await service.processGenerationJob(payload);

      expect(generate).not.toHaveBeenCalled();
      expect(generateFromProfile).not.toHaveBeenCalled();
      expect(cv.revision.sourceTrace.generation).toMatchObject({
        status: 'STALE',
        errorCode,
      });
      for (const [, patch] of repo.update.mock.calls) {
        expect(Object.keys(patch)).toEqual(['revision']);
      }
      expect({ ...cv, revision: before.revision }).toEqual(before);
      expect(cv.generationSnapshot?.pendingDraft).toBeUndefined();
    },
  );

  it('stages generated output while canonical CV fields remain unchanged', async () => {
    const { service, cv, queue } = createExistingService();
    Object.assign(cv, {
      careerObjective: 'Canonical objective',
      skills: [{ name: 'Canonical skill' }],
      workExperience: [{ position: 'Canonical position' }],
      contentVersion: 1,
      isPrimary: true,
      isSearchable: true,
      generationSnapshot: { localizationRetry: { attempt: 1 } },
    });
    const canonical = {
      careerObjective: cv.careerObjective,
      skills: JSON.parse(JSON.stringify(cv.skills)),
      workExperience: JSON.parse(JSON.stringify(cv.workExperience)),
      contentVersion: cv.contentVersion,
      isPrimary: cv.isPrimary,
      isSearchable: cv.isSearchable,
    };
    const aiServiceClient = { generateCvDraftReview: jest.fn() };
    (service as any).aiServiceClient = aiServiceClient;
    await service.enqueueGeneration(
      cv._id,
      { expectedContentVersion: 1 },
      user as any,
      'stage-review',
    );
    const job = queue.add.mock.calls[0][1];
    aiServiceClient.generateCvDraftReview.mockResolvedValue(
      generatedReview(job),
    );

    await service.processGenerationJob(job);

    const pending = cv.generationSnapshot.pendingDraft;
    expect(pending).toMatchObject({
      operationId: job.operationId,
      sourceVersion: job.sourceVersion,
      expectedContentVersion: 1,
      consentVersion: job.consentVersion,
      consentPolicyHash: job.consentPolicyHash,
      reviewStatus: 'PENDING',
      draft: expect.objectContaining({ position: 'Software Engineer' }),
      sourceRefsByPath: { '/position': ['/candidate/headline'] },
      fieldOriginsByPath: { '/position': 'AI_SUGGESTED' },
      omissionsByPath: [],
    });
    expect(pending.draftHash).toMatch(/^[a-f0-9]{64}$/);
    expect(cv.revision.sourceTrace.generation).toMatchObject({
      status: 'COMPLETE',
      reviewStatus: 'PENDING',
      draftHash: pending.draftHash,
    });
    expect({
      careerObjective: cv.careerObjective,
      skills: cv.skills,
      workExperience: cv.workExperience,
      contentVersion: cv.contentVersion,
      isPrimary: cv.isPrimary,
      isSearchable: cv.isSearchable,
    }).toEqual(canonical);
    expect(cv.generationSnapshot.localizationRetry).toEqual({ attempt: 1 });
  });

  it.each([true, false])(
    'T019 preserves the existing source CV and Career Profile before approval (published=%s)',
    async (published) => {
      const { service, cv, queue } = createExistingService();
      const source = {
        fullName: 'Ứng viên tổng hợp',
        title: '  Source CV  ',
        position: 'Backend engineer',
        email: 'synthetic@example.invalid',
        phone: '+84000000000',
        link: 'https://example.invalid/portfolio',
        address: 'Hà Nội',
        careerObjective: '  Giữ nguyên dấu tiếng Việt\nDòng thứ hai.  ',
        education: [
          {
            schoolName: 'Synthetic University',
            major: 'CS',
            degree: 'BSc',
            startDate: '2018',
            endDate: '2022',
            description: 'Original education\n',
          },
        ],
        workExperience: [
          {
            companyName: 'Synthetic Company',
            position: 'Engineer',
            startDate: '2022',
            endDate: '',
            description: 'Original work\n  spacing',
          },
        ],
        skills: [
          { name: 'PostgreSQL', description: 'Original detail' },
          { name: 'TypeScript', description: '' },
        ],
        projects: [
          {
            projectName: 'Source project',
            role: 'Developer',
            startDate: '2023',
            endDate: '',
            description: 'Original project',
            technologies: ['TypeScript', 'PostgreSQL'],
          },
        ],
        activities: [
          {
            organizationName: 'Synthetic group',
            position: 'Volunteer',
            startDate: '2020',
            endDate: '2021',
            description: 'Original activity',
          },
        ],
        certificates: [
          {
            name: 'Source certificate',
            issuer: 'Synthetic issuer',
            date: '2023',
            credentialUrl: 'https://example.invalid/cert',
          },
        ],
        awards: [
          {
            name: 'Source award',
            issuer: 'Synthetic issuer',
            date: '2022',
            description: 'Original award',
          },
        ],
        sectionOrder: [
          'skills',
          'experience',
          'education',
          'projects',
          'objective',
          'activities',
          'certificates',
          'awards',
        ],
        contentVersion: 7,
        isPrimary: published,
        isSearchable: published,
      };
      Object.assign(cv, source, {
        revision: { contentVersion: 7, locale: 'vi-VN', sourceTrace: {} },
      });
      const profile = {
        headline: 'Independent Career Profile',
        version: 11,
        skills: [{ name: 'Python' }],
        objective: 'Do not synchronize from AI',
      };
      const profileBefore = JSON.stringify(profile);
      const profileService = {
        requireMine: jest.fn().mockResolvedValue(profile),
        updateMine: jest.fn(),
      };
      (service as any).careerProfileService = profileService;
      const before = JSON.stringify(source);
      const assertPreserved = () => {
        const current = Object.fromEntries(
          Object.keys(source).map((key) => [key, cv[key]]),
        );
        expect(current).toEqual(JSON.parse(before));
        expect(Buffer.from(JSON.stringify(current))).toEqual(
          Buffer.from(before),
        );
        expect(JSON.stringify(profile)).toBe(profileBefore);
        expect(profileService.updateMine).not.toHaveBeenCalled();
      };
      await service.enqueueGeneration(
        cv._id,
        { expectedContentVersion: 7 },
        user as any,
        `source-preservation-${published}`,
      );
      assertPreserved();
      const job = queue.add.mock.calls[0][1];
      const review = generatedReview(job);
      const client = (service as any).aiServiceClient;
      client.generateCvDraftReview.mockResolvedValue(review);

      await new OnlineCvGenerationProcessor(service).handleGeneration({
        data: job,
      } as any);

      expect(client.generateCvDraftReview).toHaveBeenCalledTimes(1);
      expect(
        client.generateCvDraftReview.mock.calls[0][0].candidate,
      ).toMatchObject({
        career_objective: source.careerObjective,
        headline: source.position,
      });
      expect(cv.generationSnapshot.pendingDraft).toMatchObject({
        draft: review.draft,
        expectedContentVersion: 7,
        reviewStatus: 'PENDING',
      });
      expect(cv.revision.sourceTrace.generation).toMatchObject({
        kind: 'EXISTING_CV',
        implementation: 'agent',
        status: 'COMPLETE',
        reviewStatus: 'PENDING',
      });
      expect(cv.revision.contentVersion).toBe(7);
      assertPreserved();
    },
  );

  it('does not stage an in-flight result after cancellation', async () => {
    const { service, cv, queue } = createExistingService();
    Object.assign(cv, {
      careerObjective: 'Canonical objective',
      contentVersion: 1,
      isPrimary: true,
      isSearchable: true,
    });
    const started = deferred<void>();
    const response = deferred<Record<string, any>>();
    (service as any).aiServiceClient = {
      generateCvDraftReview: jest.fn(() => {
        started.resolve();
        return response.promise;
      }),
    };
    const accepted = await service.enqueueGeneration(
      cv._id,
      { expectedContentVersion: 1 },
      user as any,
      'cancel-in-flight',
    );
    const job = queue.add.mock.calls[0][1];
    const worker = service.processGenerationJob(job);
    await started.promise;

    await service.cancelGeneration(cv._id, accepted.operationId, user as any);
    response.resolve(generatedReview(job));
    await worker;

    expect(cv.revision.sourceTrace.generation.status).toBe('CANCELLED');
    expect(cv.generationSnapshot?.pendingDraft).toBeUndefined();
    expect(cv.careerObjective).toBe('Canonical objective');
    expect(cv.contentVersion).toBe(1);
    expect(cv.isPrimary).toBe(true);
    expect(cv.isSearchable).toBe(true);
  });

  it('does not stage an in-flight result after the canonical content version changes', async () => {
    const { service, cv, queue } = createExistingService();
    Object.assign(cv, {
      careerObjective: 'Canonical objective',
      contentVersion: 1,
      isPrimary: true,
      isSearchable: true,
    });
    const started = deferred<void>();
    const response = deferred<Record<string, any>>();
    (service as any).aiServiceClient = {
      generateCvDraftReview: jest.fn(() => {
        started.resolve();
        return response.promise;
      }),
    };
    await service.enqueueGeneration(
      cv._id,
      { expectedContentVersion: 1 },
      user as any,
      'stale-in-flight',
    );
    const job = queue.add.mock.calls[0][1];
    const worker = service.processGenerationJob(job);
    await started.promise;
    cv.contentVersion = 2;
    response.resolve(generatedReview(job));
    await worker;

    expect(cv.revision.sourceTrace.generation).toMatchObject({
      status: 'STALE',
      errorCode: 'SOURCE_CHANGED',
    });
    expect(cv.generationSnapshot?.pendingDraft).toBeUndefined();
    expect(cv.careerObjective).toBe('Canonical objective');
    expect(cv.contentVersion).toBe(2);
    expect(cv.isPrimary).toBe(true);
    expect(cv.isSearchable).toBe(true);
  });

  it('maps internal RUNNING to PROCESSING and returns terminal current/draft consistently', async () => {
    const { service, cv } = createExistingService();
    const accepted = await service.enqueueGeneration(
      cv._id,
      { expectedContentVersion: 1 },
      user as any,
      'response-contract',
    );
    const metadata = cv.revision.sourceTrace.generation;
    metadata.status = 'RUNNING';
    expect(
      await service.getGenerationJob(cv._id, accepted.operationId, user as any),
    ).toMatchObject({
      onlineCvId: cv._id,
      status: 'PROCESSING',
      pollAfterSeconds: 5,
      acceptedAt: metadata.createdAt,
    });
    metadata.status = 'COMPLETE';
    expect(
      await service.getGenerationJob(cv._id, accepted.operationId, user as any),
    ).toMatchObject({
      status: 'COMPLETE',
      pollAfterSeconds: 0,
      current: cv,
      draft: cv,
    });
  });

  it('cancels a queued operation and returns the current operation response', async () => {
    const { service, cv, queue, repo } = createExistingService();
    const remove = jest.fn().mockResolvedValue(undefined);
    queue.getJob.mockResolvedValue({
      getState: jest.fn().mockResolvedValue('waiting'),
      remove,
    });
    const accepted = await service.enqueueGeneration(
      cv._id,
      { expectedContentVersion: 1 },
      user as any,
      'cancel-queued',
    );

    const result = await service.cancelGeneration(
      cv._id,
      accepted.operationId,
      user as any,
    );

    expect(result).toMatchObject({
      status: 'CANCELLED',
      onlineCvId: cv._id,
      current: cv,
    });
    expect(repo.update).toHaveBeenCalledTimes(2);
    expect(repo.update.mock.calls[1][1]).toMatchObject({
      revision: {
        sourceTrace: { generation: { status: 'CANCELLED' } },
      },
    });
    expect(queue.getJob).toHaveBeenCalledWith(accepted.operationId);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('does not disclose or cancel a generation operation for a CV not owned by the caller', async () => {
    const { service, cv, repo, queue } = createExistingService();
    repo.findOne.mockResolvedValue(null);
    const otherUser = {
      ...user,
      _id: '99999999-9999-4999-8999-999999999999',
    };

    await expect(
      service.getGenerationJob(
        cv._id,
        '33333333-3333-4333-8333-333333333333',
        otherUser as any,
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.cancelGeneration(
        cv._id,
        '33333333-3333-4333-8333-333333333333',
        otherUser as any,
      ),
    ).rejects.toMatchObject({ status: 404 });

    expect(repo.update).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('rejects stale and pending editor saves before persistence', async () => {
    const { service, cv, repo } = createExistingService();
    await expect(
      service.update(cv._id, { expectedContentVersion: 2 }, user as any),
    ).rejects.toMatchObject({ status: 409 });
    cv.revision.sourceTrace.generation = { status: 'RUNNING' };
    await expect(
      service.update(cv._id, { expectedContentVersion: 1 }, user as any),
    ).rejects.toMatchObject({ status: 409 });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('fails closed on a stalled RUNNING redelivery without invoking inference', async () => {
    const { service, cv } = createExistingService();
    const accepted = await service.enqueueGeneration(
      cv._id,
      { expectedContentVersion: 1 },
      user as any,
      'stalled',
    );
    cv.revision.sourceTrace.generation.status = 'RUNNING';
    const generate = jest.spyOn(service, 'generate');
    await service.processGenerationJob({
      cvId: cv._id,
      userId: user._id,
      operationId: accepted.operationId,
    } as any);
    expect(generate).not.toHaveBeenCalled();
    expect(cv.revision.sourceTrace.generation).toMatchObject({
      status: 'FAILED',
      errorCode: 'WORKER_INTERRUPTED',
    });
  });

  it('logs correlated safe diagnostics when AI generation fails', async () => {
    const { service, cv, queue } = createExistingService();
    const accepted = await service.enqueueGeneration(
      cv._id,
      { expectedContentVersion: 1 },
      user as any,
      'diagnostic-failure',
    );
    const privateMessage = 'private provider response must not be logged';
    const logger = jest
      .spyOn(Logger, 'error')
      .mockImplementation(() => undefined);
    jest
      .spyOn(service, 'generate')
      .mockRejectedValue(
        new AiServiceError('AI_SERVICE_REJECTED', privateMessage),
      );

    await service.processGenerationJob(queue.add.mock.calls[0][1]);

    const diagnostic = logger.mock.calls
      .map(([message]) => String(message))
      .find((message) => message.includes('cv_generation_failed'));
    expect(diagnostic).toContain(accepted.operationId);
    expect(diagnostic).toContain('AI_SERVICE_REJECTED');
    expect(diagnostic).toContain('AiServiceError');
    expect(diagnostic).not.toContain(privateMessage);
    expect(cv.revision.sourceTrace.generation).toMatchObject({
      status: 'FAILED',
      errorCode: 'GENERATION_FAILED',
    });
    logger.mockRestore();
  });

  it('never downgrades a terminal operation after a late worker failure', async () => {
    const { service, cv, repo } = createExistingService();
    const accepted = await service.enqueueGeneration(
      cv._id,
      { expectedContentVersion: 1 },
      user as any,
      'terminal',
    );
    cv.revision.sourceTrace.generation.status = 'COMPLETE';
    repo.update.mockClear();
    await service.markGenerationFailure({
      cvId: cv._id,
      userId: user._id,
      operationId: accepted.operationId,
    } as any);
    expect(repo.update).not.toHaveBeenCalled();
    expect(cv.revision.sourceTrace.generation.status).toBe('COMPLETE');
  });

  it('does not overwrite completion when cancellation loses its atomic CAS', async () => {
    const { service, cv, repo } = createExistingService();
    const accepted = await service.enqueueGeneration(
      cv._id,
      { expectedContentVersion: 1 },
      user as any,
      'cancel-race',
    );
    repo.update.mockImplementationOnce(async (criteria: any) => {
      expect(criteria).toMatchObject({
        _id: cv._id,
        userId: user._id,
        isDeleted: false,
        contentVersion: 1,
      });
      expect(criteria.revision.objectLiteralParameters.expectedRevision).toBe(
        JSON.stringify(cv.revision),
      );
      cv.revision.sourceTrace.generation.status = 'COMPLETE';
      return { affected: 0 };
    });
    expect(
      await service.cancelGeneration(cv._id, accepted.operationId, user as any),
    ).toMatchObject({ status: 'COMPLETE', current: cv, draft: cv });
  });
});
