import { OnlineCVsService } from 'src/online-cvs/online-cvs.service';
import { OnlineCvDraftLifecycleService } from 'src/online-cvs/online-cv-draft-lifecycle.service';
import { OnlineCvGenerationStateService } from 'src/online-cvs/online-cv-generation-state.service';
import { OnlineCvGenerationMode } from 'src/online-cvs/entities/online-cv.entity';
import { createHash } from 'crypto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateOnlineCVDto } from 'src/online-cvs/dto/update-online-cv.dto';
import { Role } from 'src/decorator/customize';
import { OnlineCVsController } from 'src/online-cvs/online-cvs.controller';
import {
  GenerateOnlineCvDto,
  EnqueueOnlineCvGenerationDto,
} from 'src/online-cvs/dto/generate-online-cv.dto';
import {
  PATH_METADATA,
  METHOD_METADATA,
  HTTP_CODE_METADATA,
} from '@nestjs/common/constants';
import { RequestMethod, NotFoundException } from '@nestjs/common';
import {
  AiCvConsentScope,
  getActiveAiCvConsentPolicy,
} from 'src/ai-consents/ai-cv-consent.policy';

import {
  dedupeCvText,
  draftDescription,
  escapeHtml,
  normalizeCvContentKey,
  sanitizePdfHtml,
} from 'src/online-cvs/online-cvs.service';

const approvalUser = {
  _id: '11111111-1111-4111-8111-111111111111',
  email: 'candidate@example.com',
  role: Role.USER,
} as any;

function createPendingReviewService() {
  const policy = getActiveAiCvConsentPolicy(
    undefined,
    AiCvConsentScope.CV_GENERATION,
  );
  const cvId = '22222222-2222-4222-8222-222222222222';
  const sourceVersion = createHash('sha256')
    .update(
      JSON.stringify({
        job: {
          job_id: cvId,
          title: 'Engineer',
          company_name: null,
          description: null,
          location: null,
          work_mode: null,
          level: null,
          required_skills: [],
          preferred_skills: [],
        },
        updatedAt: null,
        profileVersion: 1,
      }),
    )
    .digest('hex');
  const draft = { career_objective: 'Generated objective' };
  const draftHash = createHash('sha256')
    .update(JSON.stringify(draft), 'utf8')
    .digest('hex');
  const pendingDraft = {
    operationId: '33333333-3333-4333-8333-333333333333',
    draftHash,
    draft,
    sourceRefsByPath: { '/career_objective': ['/candidate/career_objective'] },
    fieldOriginsByPath: { '/career_objective': 'AI_SUGGESTED' },
    omissionsByPath: [],
    sourceVersion,
    expectedContentVersion: 1,
    consentVersion: policy.consentVersion,
    consentPolicyHash: policy.policyHash,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    reviewStatus: 'PENDING',
  };
  const cv: any = {
    _id: cvId,
    userId: approvalUser._id,
    contentVersion: 1,
    templateType: 'template1',
    generationMode: OnlineCvGenerationMode.EDITOR_ONLY,
    position: 'Engineer',
    title: 'Candidate CV',
    careerObjective: 'Canonical objective',
    skills: [{ name: 'TypeScript' }],
    isPrimary: true,
    isSearchable: true,
    generationSnapshot: { localizationRetry: { attempt: 1 }, pendingDraft },
    revision: {
      contentVersion: 1,
      sourceTrace: {
        generation: {
          operationId: pendingDraft.operationId,
          idempotencyKeyHash: 'c'.repeat(64),
          status: 'COMPLETE',
          kind: 'EXISTING_CV',
          userId: approvalUser._id,
          cvId,
          reviewStatus: 'PENDING',
          draftHash: pendingDraft.draftHash,
          expectedContentVersion: 1,
          sourceVersion,
          consentVersion: pendingDraft.consentVersion,
          consentPolicyHash: pendingDraft.consentPolicyHash,
          templateType: 'template1',
          locale: 'vi-VN',
          targetJobId: null,
          attempts: 1,
          createdAt: new Date().toISOString(),
        },
      },
    },
  };
  const repository: any = {
    findOne: jest.fn().mockResolvedValue(cv),
    findOneOrFail: jest.fn().mockResolvedValue(cv),
    update: jest
      .fn()
      .mockImplementation(async (_where: unknown, patch: any) => {
        Object.assign(cv, patch);
        return { affected: 1 };
      }),
  };
  const expiryQuery = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  };
  repository.createQueryBuilder = jest.fn(() => expiryQuery);
  const userRepo = {
    findOne: jest.fn().mockResolvedValue({
      ...approvalUser,
      role: Role.USER,
      isDeleted: false,
    }),
  };
  const manager: any = {
    getRepository: jest.fn((entity: any) =>
      entity?.name === 'OnlineCV' ? repository : userRepo,
    ),
    transaction: jest.fn((callback: (transaction: any) => unknown) =>
      callback(manager),
    ),
  };
  repository.manager = manager;
  const queue = { getJob: jest.fn().mockResolvedValue(null) };
  const draftLifecycle = new OnlineCvDraftLifecycleService(repository);
  const service = Object.assign(Object.create(OnlineCVsService.prototype), {
    onlineCVRepo: repository,
    generationQueue: queue,
    aiCvConsentsService: {
      lockScope: jest.fn().mockResolvedValue(undefined),
      hasValidConsent: jest.fn().mockResolvedValue(true),
    },
    configService: { get: jest.fn() },
    invalidateUserCvSkillsCache: jest.fn(),
    usersService: { isCandidatePremium: jest.fn().mockReturnValue(false) },
    pdfService: { isAvailable: jest.fn().mockReturnValue(false) },
    draftLifecycle,
    generationState: new OnlineCvGenerationStateService(
      repository,
      queue as any,
      draftLifecycle,
    ),
  }) as OnlineCVsService;
  return { service, cv, repository, pendingDraft, policy };
}

describe('legacy cv_generation disabled compatibility', () => {
  it('keeps sync input optional and async content version required without requiring review fields', async () => {
    const options = { whitelist: true, forbidNonWhitelisted: true };
    expect(
      await validate(plainToInstance(GenerateOnlineCvDto, {}), options),
    ).toEqual([]);
    expect(
      await validate(
        plainToInstance(EnqueueOnlineCvGenerationDto, {
          expectedContentVersion: 1,
        }),
        options,
      ),
    ).toEqual([]);
    const missing = await validate(
      plainToInstance(EnqueueOnlineCvGenerationDto, {}),
      options,
    );
    expect(missing.map((error) => error.property)).toEqual([
      'expectedContentVersion',
    ]);
    const invalid = await validate(
      plainToInstance(EnqueueOnlineCvGenerationDto, {
        expectedContentVersion: 0,
        jobId: 'invalid',
        sourceVersion: 'short',
      }),
      options,
    );
    expect(invalid.map((error) => error.property).sort()).toEqual([
      'expectedContentVersion',
      'jobId',
      'sourceVersion',
    ]);
  });
  it.each([
    ['generate', ':id/generate', RequestMethod.POST, undefined],
    [
      'generateFromProfile',
      'generate-from-career-profile',
      RequestMethod.POST,
      undefined,
    ],
    ['enqueueGeneration', ':id/generation-jobs', RequestMethod.POST, 202],
    [
      'enqueueGenerationFromCareerProfile',
      'generation-jobs/from-career-profile',
      RequestMethod.POST,
      202,
    ],
    [
      'getGenerationJob',
      ':id/generation-jobs/:operationId',
      RequestMethod.GET,
      undefined,
    ],
    [
      'cancelGeneration',
      ':id/generation-jobs/:operationId',
      RequestMethod.DELETE,
      200,
    ],
  ] as const)('preserves %s route metadata', (method, path, verb, code) => {
    expect(Reflect.getMetadata(PATH_METADATA, OnlineCVsController)).toBe(
      'online-cvs',
    );
    const handler = OnlineCVsController.prototype[method];
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(verb);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(code);
  });

  it.each([
    'QUEUED',
    'RUNNING',
    'COMPLETE',
    'DEGRADED',
    'FAILED',
    'STALE',
    'CANCELLED',
  ])(
    'preserves legacy polling status and response fields for %s without staging a review',
    async (status) => {
      const { service, cv, repository, pendingDraft } =
        createPendingReviewService();
      delete cv.generationSnapshot.pendingDraft;
      cv.sourceVersion = pendingDraft.sourceVersion;
      const metadata = cv.revision.sourceTrace.generation;
      for (const key of ['reviewStatus', 'draftHash']) delete metadata[key];
      Object.assign(metadata, {
        status,
        createdAt: new Date().toISOString(),
        errorCode: status === 'FAILED' ? 'AI_UNAVAILABLE' : undefined,
      });
      const before = JSON.parse(JSON.stringify(cv));
      const result = await service.getGenerationJob(
        cv._id,
        metadata.operationId,
        approvalUser,
      );
      expect(result).toMatchObject({
        status: status === 'RUNNING' ? 'PROCESSING' : status,
        operationId: metadata.operationId,
        onlineCvId: cv._id,
        acceptedAt: metadata.createdAt,
        updatedAt: metadata.createdAt,
        pollAfterSeconds: ['QUEUED', 'RUNNING'].includes(status) ? 5 : 0,
        kind: 'EXISTING_CV',
        expectedContentVersion: 1,
        sourceVersion: pendingDraft.sourceVersion,
        targetJobId: null,
        templateType: 'template1',
        locale: 'vi-VN',
        attempts: 1,
        warnings: [],
        errorCode: status === 'FAILED' ? 'AI_UNAVAILABLE' : null,
      });
      for (const key of [
        'reviewStatus',
        'draftHash',
        'reviewMetadata',
        'pendingGeneration',
      ]) {
        expect(result).not.toHaveProperty(key);
      }
      if (['COMPLETE', 'DEGRADED'].includes(status)) {
        expect(result.draft).toMatchObject({
          _id: cv._id,
          careerObjective: 'Canonical objective',
          contentVersion: 1,
        });
        expect(result.draft).not.toHaveProperty('generationSnapshot');
      } else expect(result).not.toHaveProperty('draft');
      expect(repository.update).not.toHaveBeenCalled();
      expect(JSON.parse(JSON.stringify(cv))).toEqual(before);
    },
  );

  it('keeps unknown-operation errors unchanged and performs no persistence', async () => {
    const { service, cv, repository } = createPendingReviewService();
    delete cv.generationSnapshot.pendingDraft;
    for (const method of ['getGenerationJob', 'cancelGeneration'] as const) {
      await expect(
        service[method](
          cv._id,
          '44444444-4444-4444-8444-444444444444',
          approvalUser,
        ),
      ).rejects.toMatchObject({
        status: 404,
        message: 'Không tìm thấy yêu cầu tạo CV',
      });
    }
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('forwards legacy sync/async arguments, strips private snapshots, and preserves service errors', async () => {
    const draft = {
      _id: 'legacy-cv',
      contentVersion: 2,
      generationSnapshot: { localizationRetry: { attempt: 1 } },
    };
    const response = {
      status: 'COMPLETE',
      draft,
      generationMode: 'EDITOR_ONLY',
      contentVersion: 2,
    };
    const api = {
      generate: jest.fn().mockResolvedValue(response),
      enqueueGeneration: jest.fn().mockResolvedValue({
        status: 'QUEUED',
        operationId: 'legacy-operation',
      }),
    };
    const controller = new OnlineCVsController(
      api as unknown as OnlineCVsService,
    );
    expect(await controller.generate('legacy-cv', {}, approvalUser)).toEqual({
      ...response,
      draft: { _id: 'legacy-cv', contentVersion: 2 },
    });
    expect(api.generate).toHaveBeenCalledWith('legacy-cv', {}, approvalUser);
    const dto = { expectedContentVersion: 2 };
    expect(
      await controller.enqueueGeneration(
        'legacy-cv',
        dto,
        'legacy-key',
        approvalUser,
      ),
    ).toEqual({ status: 'QUEUED', operationId: 'legacy-operation' });
    expect(api.enqueueGeneration).toHaveBeenCalledWith(
      'legacy-cv',
      dto,
      approvalUser,
      'legacy-key',
    );
    const error = new NotFoundException('Không tìm thấy CV');
    api.generate.mockRejectedValue(error);
    await expect(controller.generate('missing', {}, approvalUser)).rejects.toBe(
      error,
    );
  });
});

describe('online CV PDF HTML safety', () => {
  it('removes executable markup, handlers and remote resource URLs', () => {
    const sanitized = sanitizePdfHtml(
      '<div onclick="alert(1)"><script>fetch("https://evil.test")</script><img src="https://evil.test/a.png"><img src="data:image/png;base64,abc"></div>',
    );

    expect(sanitized).not.toMatch(/script|onclick|https:\/\/evil\.test/i);
    expect(sanitized).toContain('data:image/png;base64,abc');
  });

  it('escapes user-controlled document titles', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;',
    );
  });
});

describe('online CV generation approval boundary', () => {
  it('validates the optional generation approval proof as a UUID and SHA-256', async () => {
    const valid = plainToInstance(UpdateOnlineCVDto, {
      expectedContentVersion: 1,
      generationApproval: {
        operationId: '33333333-3333-4333-8333-333333333333',
        draftHash: 'a'.repeat(64),
      },
    });
    const invalid = plainToInstance(UpdateOnlineCVDto, {
      expectedContentVersion: 1,
      generationApproval: {
        operationId: 'not-a-uuid',
        draftHash: 'not-a-hash',
        privateData: 'must not be accepted',
      },
    });

    expect(
      await validate(valid, { whitelist: true, forbidNonWhitelisted: true }),
    ).toEqual([]);
    expect(
      await validate(invalid, { whitelist: true, forbidNonWhitelisted: true }),
    ).not.toHaveLength(0);
  });

  it.each(['QUEUED', 'RUNNING'])(
    'does not allow an editor save to bypass a %s operation',
    async (status) => {
      const user = {
        _id: '11111111-1111-4111-8111-111111111111',
        email: 'candidate@example.com',
      } as any;
      const cv = {
        _id: '22222222-2222-4222-8222-222222222222',
        userId: user._id,
        contentVersion: 1,
        generationMode: OnlineCvGenerationMode.EDITOR_ONLY,
        careerObjective: 'Build reliable services',
        skills: [{ name: 'TypeScript' }],
        isPrimary: true,
        isSearchable: true,
        revision: {
          contentVersion: 1,
          sourceTrace: {
            generation: {
              operationId: '33333333-3333-4333-8333-333333333333',
              status,
            },
          },
        },
      };
      const before = JSON.parse(JSON.stringify(cv));
      const repository = {
        findOne: jest.fn().mockResolvedValue(cv),
        update: jest.fn(),
      };
      const service = Object.assign(Object.create(OnlineCVsService.prototype), {
        onlineCVRepo: repository,
        pdfService: { isAvailable: jest.fn().mockReturnValue(false) },
      }) as OnlineCVsService;

      await expect(
        service.update(
          cv._id,
          { expectedContentVersion: 1, careerObjective: 'Edited objective' },
          user,
        ),
      ).rejects.toMatchObject({ status: 409 });

      expect(repository.update).not.toHaveBeenCalled();
      expect(cv).toEqual(before);
    },
  );

  it('rejects PATCH/autosave while a draft is pending without generationApproval', async () => {
    const { service, cv, repository } = createPendingReviewService();

    await expect(
      service.update(
        cv._id,
        {
          expectedContentVersion: 1,
          careerObjective: 'Edited objective',
        } as any,
        approvalUser,
      ),
    ).rejects.toMatchObject({ status: 409 });

    expect(repository.update).not.toHaveBeenCalled();
    expect(cv.careerObjective).toBe('Canonical objective');
    expect(cv.contentVersion).toBe(1);
    expect(cv.generationSnapshot.pendingDraft.reviewStatus).toBe('PENDING');
  });

  it.each([
    {
      operationId: '44444444-4444-4444-8444-444444444444',
      draftHash: 'a'.repeat(64),
    },
    {
      operationId: '33333333-3333-4333-8333-333333333333',
      draftHash: 'b'.repeat(64),
    },
    { operationId: undefined, draftHash: 'a'.repeat(64) },
    {
      operationId: '33333333-3333-4333-8333-333333333333',
      draftHash: undefined,
    },
  ])(
    'rejects pending-draft approval with a missing or mismatched proof',
    async (proof) => {
      const { service, cv, repository } = createPendingReviewService();

      await expect(
        service.update(
          cv._id,
          {
            expectedContentVersion: 1,
            careerObjective: 'Edited objective',
            generationApproval: proof,
          } as any,
          approvalUser,
        ),
      ).rejects.toMatchObject({ status: 409 });

      expect(repository.update).not.toHaveBeenCalled();
      expect(cv.contentVersion).toBe(1);
      expect(cv.generationSnapshot.pendingDraft.reviewStatus).toBe('PENDING');
    },
  );

  it('applies a pending draft only with matching proof and records approval once', async () => {
    const { service, cv, repository, pendingDraft } =
      createPendingReviewService();

    await service.update(
      cv._id,
      {
        expectedContentVersion: 1,
        careerObjective: 'Edited objective',
        generationApproval: {
          operationId: pendingDraft.operationId,
          draftHash: pendingDraft.draftHash,
        },
      } as any,
      approvalUser,
    );

    expect(repository.update).toHaveBeenCalledTimes(1);
    expect(cv.careerObjective).toBe('Edited objective');
    expect(cv.contentVersion).toBe(2);
    expect(cv.generationSnapshot.pendingDraft).toBeUndefined();
    expect(cv.generationSnapshot.localizationRetry).toEqual({ attempt: 1 });
    expect(cv.revision.contentVersion).toBe(2);
    expect(cv.revision.sourceTrace.generation).toMatchObject({
      reviewStatus: 'APPROVED',
      draftHash: pendingDraft.draftHash,
    });
    expect(cv.isPrimary).toBe(true);
    expect(cv.isSearchable).toBe(true);
  });
});

describe('online CV pending draft expiration', () => {
  const createdAt = new Date('2026-11-01T00:00:00.000Z');
  const expiresAt = new Date('2026-11-08T00:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(createdAt);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function createSevenDayDraft() {
    const fixture = createPendingReviewService();
    fixture.pendingDraft.expiresAt = expiresAt.toISOString();
    return fixture;
  }

  it('removes expired staged text while retaining safe EXPIRED operation metadata', async () => {
    const { service, cv, pendingDraft } = createSevenDayDraft();
    const before = JSON.parse(JSON.stringify(cv));
    const metadata = { ...cv.revision.sourceTrace.generation };
    expect(
      Date.parse(pendingDraft.expiresAt) - Date.parse(pendingDraft.createdAt),
    ).toBe(7 * 24 * 60 * 60 * 1000);
    jest.setSystemTime(expiresAt.getTime() + 1);

    const result = await service.getGenerationJob(
      cv._id,
      pendingDraft.operationId,
      approvalUser,
    );

    expect(cv.generationSnapshot).not.toHaveProperty('pendingDraft');
    expect(cv.generationSnapshot.localizationRetry).toEqual({ attempt: 1 });
    expect(cv.revision.sourceTrace.generation).toEqual({
      ...metadata,
      reviewStatus: 'EXPIRED',
    });
    expect(result).toMatchObject({
      operationId: pendingDraft.operationId,
      reviewStatus: 'EXPIRED',
    });
    expect(JSON.stringify(cv)).not.toContain('Generated objective');
    expect(JSON.stringify(result)).not.toContain('Generated objective');
    expect(cv).toEqual({
      ...before,
      generationSnapshot: { localizationRetry: { attempt: 1 } },
      revision: {
        ...before.revision,
        sourceTrace: {
          ...before.revision.sourceTrace,
          generation: { ...metadata, reviewStatus: 'EXPIRED' },
        },
      },
    });
  });

  it('rejects approval after expiry without applying text or changing canonical contentVersion', async () => {
    const { service, cv, repository, pendingDraft } = createSevenDayDraft();
    const before = JSON.parse(JSON.stringify(cv));
    jest.setSystemTime(expiresAt.getTime() + 1);

    await expect(
      service.update(
        cv._id,
        {
          expectedContentVersion: 1,
          careerObjective: pendingDraft.draft.career_objective,
          generationApproval: {
            operationId: pendingDraft.operationId,
            draftHash: pendingDraft.draftHash,
          },
        },
        approvalUser,
      ),
    ).rejects.toMatchObject({ status: 409 });

    expect(repository.update).not.toHaveBeenCalled();
    expect(cv).toEqual(before);
    expect(cv.careerObjective).toBe('Canonical objective');
    expect(cv.contentVersion).toBe(1);
    expect(cv.revision.contentVersion).toBe(1);
  });

  it('keeps a not-yet-expired pending draft intact immediately before expiry', async () => {
    const { service, cv, repository, pendingDraft } = createSevenDayDraft();
    const before = JSON.parse(JSON.stringify(cv));
    jest.setSystemTime(expiresAt.getTime() - 1);

    const result = await service.getGenerationJob(
      cv._id,
      pendingDraft.operationId,
      approvalUser,
    );

    expect(result).toMatchObject({
      operationId: pendingDraft.operationId,
      reviewStatus: 'PENDING',
    });
    expect(repository.update).not.toHaveBeenCalled();
    expect(cv).toEqual(before);
    expect(cv.generationSnapshot.pendingDraft.draft).toEqual({
      career_objective: 'Generated objective',
    });
  });

  it('cleans only selected expired drafts and preserves safe metadata', async () => {
    const { service, cv, pendingDraft, repository } = createSevenDayDraft();
    jest.setSystemTime(expiresAt.getTime() + 1);
    const expiryQuery = repository.createQueryBuilder();
    expiryQuery.getMany.mockResolvedValue([cv]);
    const metadata = { ...cv.revision.sourceTrace.generation };

    await expect(service.expirePendingGenerationDrafts()).resolves.toBe(1);

    expect(repository.createQueryBuilder).toHaveBeenCalledWith('cv');
    expect(expiryQuery.select).toHaveBeenCalledWith([
      'cv._id',
      'cv.userId',
      'cv.contentVersion',
      'cv.isDeleted',
      'cv.generationSnapshot',
      'cv.revision',
    ]);
    expect(cv.generationSnapshot).not.toHaveProperty('pendingDraft');
    expect(cv.generationSnapshot.localizationRetry).toEqual({ attempt: 1 });
    expect(cv.revision.sourceTrace.generation).toEqual({
      ...metadata,
      reviewStatus: 'EXPIRED',
    });
    expect(JSON.stringify(cv)).not.toContain(
      pendingDraft.draft.career_objective,
    );
    expect(repository.update).toHaveBeenCalledTimes(1);
  });
});

describe('online CV content deduplication', () => {
  it('normalizes punctuation and preserves first distinct facts', () => {
    expect(
      dedupeCvText([
        ' Built FastAPI services. ',
        'built  FastAPI services!',
        'Maintained PostgreSQL.',
      ]),
    ).toEqual(['Built FastAPI services.', 'Maintained PostgreSQL.']);
    expect(normalizeCvContentKey('C++')).not.toBe(normalizeCvContentKey('C#'));
  });

  it('does not persist a source description alongside identical generated bullets', () => {
    expect(
      draftDescription(
        'Built FastAPI services.',
        ['Built FastAPI services!'],
        'Generated fallback.',
      ),
    ).toBe('Generated fallback.');
    expect(
      draftDescription(
        'Built FastAPI services.',
        ['Built FastAPI services!', 'Maintained PostgreSQL.'],
        null,
      ),
    ).toBe('Maintained PostgreSQL.');
  });
});

describe('online CV locale metadata', () => {
  const user = { _id: 'user-1', email: 'candidate@example.com' } as any;

  it.each([20000000, null])(
    'persists candidate salary and explicit disclosure consent (%s)',
    async (salary) => {
      const cv = {
        _id: 'cv-1',
        userId: user._id,
        contentVersion: 1,
        revision: {},
        templateType: 'template1',
      };
      const repository = {
        findOne: jest.fn().mockResolvedValue(cv),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      const service = Object.assign(Object.create(OnlineCVsService.prototype), {
        onlineCVRepo: repository,
        redisService: { deleteValue: jest.fn().mockResolvedValue(undefined) },
        pdfService: { isAvailable: jest.fn().mockReturnValue(false) },
      }) as OnlineCVsService;
      await service.update(
        'cv-1',
        {
          expectedContentVersion: 1,
          expectedSalaryVndMonthly: salary,
          shareExpectedSalary: false,
        },
        user,
      );
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { _id: 'cv-1', userId: user._id, isDeleted: false },
      });
      expect(repository.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          expectedSalaryVndMonthly: salary,
          shareExpectedSalary: false,
        }),
      );
    },
  );

  it('does not update salary on a CV not owned by the caller', async () => {
    const repository = {
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    };
    const service = Object.assign(Object.create(OnlineCVsService.prototype), {
      onlineCVRepo: repository,
      pdfService: { isAvailable: jest.fn().mockReturnValue(false) },
    }) as OnlineCVsService;
    await expect(
      service.update(
        'other-cv',
        {
          expectedContentVersion: 1,
          expectedSalaryVndMonthly: 0,
          shareExpectedSalary: true,
        },
        user,
      ),
    ).rejects.toThrow('không thuộc về bạn');
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('preserves revision locale and source trace locale when editing without locale', async () => {
    const cv = {
      _id: 'cv-1',
      userId: user._id,
      contentVersion: 4,
      generationMode: 'EDITOR_ONLY',
      revision: {
        contentVersion: 4,
        locale: 'en-US',
        sourceTrace: { locale: 'en-US', requestId: 'request-1' },
      },
      templateType: 'template1',
      isDeleted: false,
    };
    const repository = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const service = Object.create(
      OnlineCVsService.prototype,
    ) as OnlineCVsService;
    Object.assign(service as any, {
      onlineCVRepo: repository,
      redisService: { deleteValue: jest.fn().mockResolvedValue(undefined) },
      findOne: jest.fn().mockResolvedValue(cv),
    });

    await service.update(
      'cv-1',
      { fullName: 'Edited Candidate', expectedContentVersion: 4 } as any,
      user,
    );

    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: 'cv-1',
        userId: user._id,
        isDeleted: false,
        contentVersion: 4,
      }),
      expect.objectContaining({
        revision: expect.objectContaining({
          contentVersion: 5,
          locale: 'en-US',
          sourceTrace: expect.objectContaining({ locale: 'en-US' }),
        }),
      }),
    );
  });
});

describe('online CV create locale metadata', () => {
  it('persists the requested locale and returns it through findOne', async () => {
    const user = { _id: 'user-1', email: 'candidate@example.com' } as any;
    const repository = {
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ ...value, _id: 'cv-1' })),
    };
    const saved = {
      _id: 'cv-1',
      generationMode: 'MANUAL',
      revision: {
        contentVersion: 1,
        locale: 'en-US',
        sourceTrace: { locale: 'en-US' },
      },
    };
    const service = Object.create(
      OnlineCVsService.prototype,
    ) as OnlineCVsService;
    Object.assign(service as any, {
      onlineCVRepo: repository,
      userRepo: {
        findOne: jest
          .fn()
          .mockResolvedValue({ _id: user._id, isVerified: true }),
      },
      usersService: {
        isCandidatePremium: jest.fn().mockReturnValue(false),
        getUserMaxCvLimit: jest.fn().mockReturnValue(3),
      },
      redisService: { deleteValue: jest.fn().mockResolvedValue(undefined) },
      exportToPdf: jest.fn().mockResolvedValue(undefined),
      pdfService: { isAvailable: jest.fn().mockReturnValue(false) },
      findOne: jest.fn().mockResolvedValue(saved),
    });

    const result = await service.create(
      {
        templateType: 'template1',
        locale: 'en-US',
        fullName: 'Candidate',
        education: [{}, { schoolName: 'University' }],
        workExperience: [{}, { position: 'Engineer' }],
        skills: [{}, { name: 'TypeScript' }],
        activities: [{}, { organizationName: 'Community group' }],
        projects: [{}, { projectName: 'TalentPulse' }],
        certificates: [{}, { name: 'AWS' }],
        awards: [{}, { name: 'Winner' }],
      } as any,
      user,
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        revision: expect.objectContaining({
          locale: 'en-US',
          sourceTrace: expect.objectContaining({ locale: 'en-US' }),
        }),
        education: [{ schoolName: 'University' }],
        workExperience: [{ position: 'Engineer' }],
        skills: [{ name: 'TypeScript' }],
        activities: [{ organizationName: 'Community group' }],
        projects: [{ projectName: 'TalentPulse' }],
        certificates: [{ name: 'AWS' }],
        awards: [{ name: 'Winner' }],
      }),
    );
    expect(result.revision).toEqual(
      expect.objectContaining({ locale: 'en-US' }),
    );
  });
});
