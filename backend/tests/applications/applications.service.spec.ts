import { ApplicationsService } from 'src/applications/applications.service';
import { ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AiCvConsentsService } from 'src/ai-consents/ai-cv-consents.service';
import {
  AiCvConsent,
  AiCvConsentStatus,
} from 'src/ai-consents/entities/ai-cv-consent.entity';
import { AiCvConsentEvent } from 'src/ai-consents/entities/ai-cv-consent-event.entity';
import {
  AiCvConsentScope,
  AI_CV_CONSENT_ERROR_MESSAGES,
  getActiveAiCvConsentPolicy,
} from 'src/ai-consents/ai-cv-consent.policy';
import { CVMatchResult } from 'src/ai-matching/entities/cv-match-result.entity';
import {
  analysisVersionKey,
  fallbackNarrative,
  NarrativeRequest,
} from 'src/ai-matching/match-narrative';
import { Role } from 'src/decorator/customize';
import {
  Application,
  ApplicationStatus,
} from 'src/applications/entities/application.entity';
import { CVParseStatus } from 'src/usercvs/cv-parse-status';
import { createHash } from 'crypto';
import {
  APPLICATION_AI_RANKING_POLICY_TEXT,
  getApplicationAiRankingConsentPolicy,
} from 'src/applications/application-ai-consent.policy';

const ids = {
  application: '00000000-0000-4000-8000-000000000001',
  cv: '00000000-0000-4000-8000-000000000002',
  job: '00000000-0000-4000-8000-000000000003',
  company: '00000000-0000-4000-8000-000000000004',
  user: '00000000-0000-4000-8000-000000000005',
};

describe('match analysis applicant cv_matching consent', () => {
  function harness() {
    const policy = getActiveAiCvConsentPolicy(
      undefined,
      AiCvConsentScope.CV_MATCHING,
    );
    const consent = {
      userId: ids.user,
      ...policy,
      status: AiCvConsentStatus.GRANTED,
      grantedAt: new Date(0),
      revokedAt: null,
    };
    const findOne = jest.fn(async ({ where }) =>
      Object.entries(where).every(([key, value]) => consent[key] === value)
        ? consent
        : null,
    );
    const aiCvConsentsService = new AiCvConsentsService(
      { findOne } as unknown as Repository<AiCvConsent>,
      {} as Repository<AiCvConsentEvent>,
    );
    const result = {
      applicationId: ids.application,
      userId: ids.user,
      jobId: ids.job,
      matchScore: 0.75,
      components: {},
      matchedSkills: [],
      missingSkills: [],
    } as CVMatchResult;
    const analyzeMatch = jest.fn(async (request: NarrativeRequest) =>
      fallbackNarrative(request),
    );
    const service = Object.assign(
      Object.create(ApplicationsService.prototype),
      {
        aiCvConsentsService,
        aiServiceClient: { analyzeMatch },
        usersService: {
          getUserEntitlements: jest.fn().mockResolvedValue({
            role: Role.ADMIN,
            limits: { canViewCandidateAiAnalysis: true },
          }),
        },
        jobsService: {
          findOneForInternal: jest.fn().mockResolvedValue(createJob()),
        },
        companyRepo: {
          findOne: jest.fn().mockResolvedValue(createCanonicalCompany()),
        },
        cvProcessingService: {
          getRankedCandidates: jest.fn().mockResolvedValue([result]),
        },
      },
    ) as ApplicationsService;
    const call = () =>
      service.getMatchAnalysis(
        ids.job,
        ids.application,
        {
          locale: 'en',
          analysisVersionKey: analysisVersionKey(result),
        },
        { ...user, _id: ids.company, role: Role.ADMIN },
      );
    return { consent, findOne, analyzeMatch, call, policy };
  }

  it('dispatches with current valid consent belonging to the matched applicant', async () => {
    const h = harness();
    await expect(h.call()).resolves.toMatchObject({ source: 'llm' });
    expect(h.findOne).toHaveBeenCalledWith({
      where: {
        userId: ids.user,
        scope: AiCvConsentScope.CV_MATCHING,
        status: AiCvConsentStatus.GRANTED,
      },
    });
    expect(h.analyzeMatch).toHaveBeenCalledTimes(1);
  });

  it.each([
    'missing',
    'revoked',
    'revoked-at',
    'stale-version',
    'stale-hash',
    'wrong-applicant',
    'wrong-scope',
  ])(
    'denies %s consent without AI dispatch despite HR entitlement',
    async (state) => {
      const h = harness();
      if (state === 'missing') h.findOne.mockResolvedValue(null);
      if (state === 'revoked') h.consent.status = AiCvConsentStatus.REVOKED;
      if (state === 'revoked-at') h.consent.revokedAt = new Date();
      if (state === 'stale-version') h.consent.consentVersion = 'old';
      if (state === 'stale-hash') h.consent.policyHash = '0'.repeat(64);
      if (state === 'wrong-applicant') h.consent.userId = ids.company;
      if (state === 'wrong-scope')
        h.consent.scope = AiCvConsentScope.CV_GENERATION;
      await expect(h.call()).rejects.toEqual(
        new ForbiddenException(AI_CV_CONSENT_ERROR_MESSAGES.INVALID_CONSENT),
      );
      expect(h.analyzeMatch).not.toHaveBeenCalled();
    },
  );
});

const user = {
  _id: ids.user,
  email: 'candidate@example.com',
  name: 'Candidate',
  role: 'USER',
  age: 30,
};

function createJob() {
  return {
    _id: ids.job,
    name: 'Backend Engineer',
    description: 'Build recruitment APIs',
    skills: ['TypeScript', 'NestJS'],
    company: { _id: ids.company, name: 'Embedded Snapshot Co.' },
    location: 'Hanoi',
    level: 'senior',
    isActive: true,
    isDeleted: false,
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  } as any;
}

function createCanonicalCompany() {
  return {
    _id: ids.company,
    name: 'Canonical Company Co.',
    isActive: true,
    isDeleted: false,
    updatedAt: new Date('2026-02-03T00:00:00.000Z'),
  } as any;
}

function createCv() {
  return {
    _id: ids.cv,
    userId: ids.user,
    parseStatus: CVParseStatus.READY,
    contentVersion: 'cv-content-v7',
    contentHash: 'a'.repeat(64),
    isDeleted: false,
    deletedAt: null,
  } as any;
}

function createHarness({
  cv = createCv(),
  job = createJob(),
  canonicalCompany = createCanonicalCompany(),
}: {
  cv?: any;
  job?: any;
  canonicalCompany?: any;
} = {}) {
  const createdAt = new Date('2026-03-04T00:00:00.000Z');
  const applicationRepo = {
    create: jest.fn((value) => ({
      ...value,
      _id: ids.application,
      createdAt,
    })),
    findOne: jest.fn(),
    save: jest.fn(async (entity) => entity),
    update: jest.fn().mockResolvedValue(undefined),
    softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const createdApplication = {
    _id: ids.application,
    cvId: ids.cv,
    userId: ids.user,
    jobId: ids.job,
    companyId: ids.company,
    status: ApplicationStatus.PENDING,
    createdAt,
  } as any;
  applicationRepo.findOne.mockResolvedValue(createdApplication);

  const transactionApplicationRepo = {
    save: jest.fn().mockResolvedValue(createdApplication),
  };
  const consentEventRepo = {
    create: jest.fn((value) => value),
    save: jest.fn().mockResolvedValue(undefined),
  };
  const manager = {
    getRepository: jest.fn((entity) =>
      entity === Application ? transactionApplicationRepo : consentEventRepo,
    ),
  };
  const dataSource = {
    transaction: jest.fn(async (callback) => callback(manager)),
  };
  const companyRepo = {
    findOne: jest.fn().mockResolvedValue(canonicalCompany),
  };
  const queueCVProcessing = jest.fn().mockResolvedValue(undefined);
  const cvMatchResultRepo = { delete: jest.fn().mockResolvedValue(undefined) };
  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'AI_APPLICATION_RANKING_CONSENT_VERSION') {
        return 'application-ai-ranking-v7';
      }
      if (key === 'AI_APPLICATION_RANKING_CONSENT_POLICY_HASH') {
        return 'b'.repeat(64);
      }
      return undefined;
    }),
  };

  const service = new ApplicationsService(
    applicationRepo as any,
    cvMatchResultRepo as any,
    companyRepo as any,
    {} as any,
    dataSource as any,
    { findAllByCompanyId: jest.fn().mockResolvedValue([]) } as any,
    { findOne: jest.fn().mockResolvedValue(cv) } as any,
    { create: jest.fn() } as any,
    { enqueueEligibleApplication: queueCVProcessing } as any,
    configService as any,
    { findOne: jest.fn().mockResolvedValue(job) } as any,
    {} as any,
    {} as AiCvConsentsService,
  );

  return {
    service,
    applicationRepo,
    transactionApplicationRepo,
    consentEventRepo,
    companyRepo,
    queueCVProcessing,
    configService,
    cv,
    job,
    canonicalCompany,
    cvMatchResultRepo,
  };
}

describe('ApplicationsService.create AI ranking consent fencing', () => {
  it('persists the submission policy snapshot and audit atomically before queueing', async () => {
    const harness = createHarness();
    const dto = {
      cvId: ids.cv,
      jobId: ids.job,
      companyId: ids.company,
      aiRankingConsent: true,
    };
    const policy = getApplicationAiRankingConsentPolicy();

    const result = await harness.service.create(dto as any, user);

    expect(result).toEqual({
      _id: ids.application,
      createdAt: new Date('2026-03-04T00:00:00.000Z'),
    });
    expect(harness.queueCVProcessing).toHaveBeenCalledTimes(1);
    expect(harness.queueCVProcessing).toHaveBeenCalledWith(ids.application);
    expect(
      harness.consentEventRepo.save.mock.invocationCallOrder[0],
    ).toBeLessThan(harness.queueCVProcessing.mock.invocationCallOrder[0]);
    expect(harness.cv.contentHash).toBe('a'.repeat(64));

    const createdApplication =
      harness.applicationRepo.create.mock.results[0].value;
    expect(createdApplication).toEqual(
      expect.objectContaining({
        aiRankingConsentGranted: true,
        aiRankingConsentVersion: policy.consentVersion,
        aiRankingConsentPolicyHash: policy.policyHash,
        aiRankingConsentAt: expect.any(Date),
      }),
    );
    expect(harness.consentEventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: ids.application,
        userId: ids.user,
        granted: true,
        consentVersion: policy.consentVersion,
        policyHash: policy.policyHash,
        source: 'application_submission_policy',
        occurredAt: createdApplication.aiRankingConsentAt,
      }),
    );
  });

  it('rejects a DTO company that does not match the canonical job company', async () => {
    const harness = createHarness();

    await expect(
      harness.service.create(
        {
          cvId: ids.cv,
          jobId: ids.job,
          companyId: '00000000-0000-4000-8000-000000000099',
        } as any,
        user,
      ),
    ).rejects.toThrow('Công ty không khớp với công việc');
    expect(harness.applicationRepo.create).not.toHaveBeenCalled();
  });

  it.each([undefined, true, false])(
    'authorizes only the submitted application when legacy consent is %s',
    async (aiRankingConsent) => {
      const harness = createHarness();
      const dto = {
        cvId: ids.cv,
        jobId: ids.job,
        companyId: ids.company,
        ...(aiRankingConsent === undefined ? {} : { aiRankingConsent }),
      };

      const result = await harness.service.create(dto as any, user);

      expect(result._id).toBe(ids.application);
      expect(harness.transactionApplicationRepo.save).toHaveBeenCalledTimes(1);
      expect(harness.queueCVProcessing).toHaveBeenCalledWith(ids.application);
      const snapshot = harness.applicationRepo.create.mock.results[0].value;
      expect(snapshot).toEqual(
        expect.objectContaining({
          cvId: ids.cv,
          jobId: ids.job,
          companyId: ids.company,
          aiRankingConsentGranted: true,
          aiRankingConsentVersion: expect.any(String),
          aiRankingConsentPolicyHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          aiRankingConsentAt: expect.any(Date),
        }),
      );
      expect(harness.consentEventRepo.save).toHaveBeenCalledWith({
        applicationId: ids.application,
        userId: ids.user,
        granted: true,
        consentVersion: snapshot.aiRankingConsentVersion,
        policyHash: snapshot.aiRankingConsentPolicyHash,
        source: 'application_submission_policy',
        occurredAt: snapshot.aiRankingConsentAt,
      });
      expect(harness.transactionApplicationRepo.save).toHaveBeenCalledWith(
        snapshot,
      );
      expect(harness.cv).not.toHaveProperty('aiRankingConsentGranted');
      expect(harness.applicationRepo.update).not.toHaveBeenCalled();
      expect(harness.companyRepo.findOne).not.toHaveBeenCalled();
    },
  );

  it('binds new submissions to the disclosed policy, not legacy configured checkbox metadata', () => {
    expect(getApplicationAiRankingConsentPolicy()).toEqual({
      purpose: 'application_ai_ranking',
      consentVersion: 'application-ai-ranking-submission-v2',
      policyHash: createHash('sha256')
        .update(APPLICATION_AI_RANKING_POLICY_TEXT, 'utf8')
        .digest('hex'),
    });
  });

  it('does not update historical applications during initialization', async () => {
    const harness = createHarness();
    await harness.service.onModuleInit();
    expect(harness.applicationRepo.update).not.toHaveBeenCalled();
    expect(harness.transactionApplicationRepo.save).not.toHaveBeenCalled();
    expect(harness.consentEventRepo.save).not.toHaveBeenCalled();
    expect(harness.queueCVProcessing).not.toHaveBeenCalled();
  });

  it('preserves withdrawal and removes only the withdrawn application matching result', async () => {
    const harness = createHarness();
    await harness.service.create(
      { cvId: ids.cv, jobId: ids.job, companyId: ids.company },
      user,
    );
    harness.queueCVProcessing.mockClear();
    const withdrawn = await harness.service.remove(ids.application, user);
    expect(harness.applicationRepo.findOne).toHaveBeenCalledWith({
      where: { _id: ids.application, isDeleted: false },
    });
    expect(harness.applicationRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: ids.application,
        status: ApplicationStatus.WITHDRAWN,
        withdrawnAt: expect.any(Date),
      }),
    );
    expect(withdrawn).toEqual(
      expect.objectContaining({ status: ApplicationStatus.WITHDRAWN }),
    );
    expect(harness.cvMatchResultRepo.delete).toHaveBeenCalledWith({
      applicationId: ids.application,
    });
    expect(harness.queueCVProcessing).not.toHaveBeenCalled();
    expect(harness.consentEventRepo.save).toHaveBeenCalledTimes(1);
  });

  it('soft-deletes non-pending applications for ADMIN and clears only its matching result', async () => {
    const harness = createHarness();
    harness.applicationRepo.findOne.mockResolvedValueOnce({
      _id: ids.application,
      cvId: ids.cv,
      userId: ids.user,
      jobId: ids.job,
      companyId: ids.company,
      status: ApplicationStatus.REVIEWING,
    });
    await harness.service.remove(ids.application, {
      ...user,
      role: 'ADMIN',
    });
    expect(harness.applicationRepo.update).toHaveBeenCalledWith(
      ids.application,
      expect.objectContaining({ isDeleted: true, deletedAt: expect.any(Date) }),
    );
    expect(harness.cvMatchResultRepo.delete).toHaveBeenCalledWith({
      applicationId: ids.application,
    });
    expect(harness.applicationRepo.softDelete).toHaveBeenCalledWith(
      ids.application,
    );
  });

  it('keeps the application when the matching queue is unavailable', async () => {
    const harness = createHarness({ canonicalCompany: null });
    harness.queueCVProcessing.mockRejectedValue(new Error('queue unavailable'));
    const dto = {
      cvId: ids.cv,
      jobId: ids.job,
      companyId: ids.company,
      aiRankingConsent: true,
    };

    const result = await harness.service.create(dto as any, user);

    expect(result._id).toBe(ids.application);
    expect(harness.queueCVProcessing).toHaveBeenCalledWith(ids.application);
    expect(harness.consentEventRepo.save).toHaveBeenCalledTimes(1);
  });
});
