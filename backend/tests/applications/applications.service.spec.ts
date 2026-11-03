import { ApplicationsService } from 'src/applications/applications.service';
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
    await harness.service.remove(ids.application, user);
    expect(harness.applicationRepo.findOne).toHaveBeenLastCalledWith({
      where: { _id: ids.application, userId: ids.user, isDeleted: false },
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
    expect(harness.queueCVProcessing).not.toHaveBeenCalled();
    expect(harness.consentEventRepo.save).toHaveBeenCalledTimes(1);
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
