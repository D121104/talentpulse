import { CVProcessingService } from 'src/ai-matching/cv-processing.service';
import { CVProcessingStatus } from 'src/ai-matching/entities/cv-match-result.entity';
import {
  Application,
  ApplicationStatus,
} from 'src/applications/entities/application.entity';
import { User, PremiumPlan } from 'src/users/entities/user.entity';
import { UserCV } from 'src/usercvs/entities/usercv.entity';
import { Job } from 'src/jobs/entities/job.entity';
import { Company } from 'src/companies/entities/company.entity';
import { Role } from 'src/decorator/customize';
import { CVParseStatus } from 'src/usercvs/cv-parse-status';
import * as runtimeFlags from 'src/config/runtime-flags';
import { consentIdempotencyKey } from 'src/ai-matching/cv-processing.processor';
import { createHash } from 'crypto';

describe('automatic matching reconciliation', () => {
  afterEach(() => jest.restoreAllMocks());

  it('prevents overlapping ticks, isolates enqueue failures, and releases the guard', async () => {
    jest.spyOn(runtimeFlags, 'areQueueWorkersEnabled').mockReturnValue(true);
    let release: (value: { _id: string }[]) => void;
    const pending = new Promise<{ _id: string }[]>((resolve) => {
      release = resolve;
    });
    const query = {
      innerJoin: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockReturnValueOnce(pending).mockResolvedValue([]),
    };
    const service = new CVProcessingService(
      {
        manager: {
          getRepository: () => ({ createQueryBuilder: () => query }),
        },
      } as any,
      {} as any,
    );
    const enqueue = jest
      .spyOn(service, 'enqueueEligibleApplication')
      .mockRejectedValueOnce(new Error('queue unavailable'))
      .mockResolvedValue(undefined);
    const firstTick = service.reconcileAutomaticMatches();
    await service.reconcileAutomaticMatches();
    expect(query.getMany).toHaveBeenCalledTimes(1);
    release([{ _id: 'first' }, { _id: 'second' }]);
    await firstTick;
    expect(enqueue.mock.calls).toEqual([['first'], ['second']]);
    await service.reconcileAutomaticMatches();
    expect(query.getMany).toHaveBeenCalledTimes(2);
    expect(query.take).toHaveBeenCalledWith(100);
    expect(query.andWhere).toHaveBeenCalledWith('application._id > :cursor', {
      cursor: '00000000-0000-0000-0000-000000000000',
    });
  });

  it('does not query canonical records when queue workers are disabled', async () => {
    jest.spyOn(runtimeFlags, 'areQueueWorkersEnabled').mockReturnValue(false);
    const getRepository = jest.fn();
    const service = new CVProcessingService(
      { manager: { getRepository } } as any,
      {} as any,
    );
    await service.reconcileAutomaticMatches();
    expect(getRepository).not.toHaveBeenCalled();
  });
});

describe('CVProcessingService queue payloads', () => {
  it('reports old completed versions separately as stale rather than current completed', async () => {
    const qb = {
      select: jest.fn().mockReturnThis(),
      setParameters: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        { status: 'STALE', count: '2' },
        { status: 'COMPLETED', count: '1' },
      ]),
    };
    const service = new CVProcessingService(
      { createQueryBuilder: () => qb } as never,
      {} as never,
    );
    expect(await service.getProcessingStatus('job')).toEqual({
      total: 3,
      completed: 1,
      stale: 2,
      pending: 0,
      processing: 0,
      failed: 0,
    });
    expect(qb.select).toHaveBeenCalledWith(
      expect.stringContaining('IS DISTINCT FROM :scoringVersion'),
      'status',
    );
    expect(qb.setParameters).toHaveBeenCalledWith({
      scoringVersion: 'cv-job-match-v3',
      normalizationVersion: 'skill-normalization-v2',
    });
  });
  it.each(['cv-job-match-v3', 'cv-job-match-v2'])(
    'deduplicates only current completed pipeline: %s',
    async (scoringVersion) => {
      const params = {
        cvId: 'cv',
        userId: 'user',
        applicationId: 'app',
        cvContentVersion: 'cv-version',
        contentHash: 'hash',
        jobId: 'job',
        jobSourceVersion: 'job-version',
        aiRankingConsentGranted: true as const,
        aiRankingConsentVersion: 'v1',
        aiRankingConsentPolicyHash: 'policy',
        consentIdempotencyKey: 'ignored',
      };
      const existing = {
        _id: 'result',
        ...params,
        status: CVProcessingStatus.COMPLETED,
        scoringVersion,
        normalizationVersion: 'skill-normalization-v2',
      };
      const repo = {
        findOne: jest.fn().mockResolvedValue(existing),
        create: jest.fn((r) => r),
        save: jest.fn(async (r) => r),
      };
      Object.assign(repo, {
        manager: {
          transaction: async (run) =>
            run({ query: jest.fn(), getRepository: () => repo }),
        },
      });
      const queue = { add: jest.fn() };
      const service = new CVProcessingService(repo as never, queue as never);
      await service.queueCVProcessing(params);
      if (scoringVersion === 'cv-job-match-v3') {
        expect(queue.add).not.toHaveBeenCalled();
        expect(repo.save).not.toHaveBeenCalled();
      } else {
        expect(repo.save).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'PENDING' }),
        );
        expect(queue.add).toHaveBeenCalledWith(
          'process-cv',
          expect.anything(),
          expect.objectContaining({
            jobId: consentIdempotencyKey('app', 'cv-version', 'job-version'),
          }),
        );
      }
    },
  );

  it('version-fences queue identity against legacy identical CV/job hashes', () => {
    const legacy = `cv-match:app:${createHash('sha256')
      .update('app:cv:job')
      .digest('hex')}`;
    const current = consentIdempotencyKey('app', 'cv', 'job');
    expect(current).not.toBe(legacy);
    expect(current).toBe(
      `cv-match:app:${createHash('sha256')
        .update('app:cv:job:cv-job-match-v3:skill-normalization-v2')
        .digest('hex')}`,
    );
    expect(consentIdempotencyKey('app', 'cv', 'job')).toBe(current);
  });
  it('queues application matching by IDs and fences, never by CV URL/text or snapshots', async () => {
    const result = { _id: 'result-1', status: CVProcessingStatus.PENDING };
    const resultRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn().mockResolvedValue(result),
    };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    Object.assign(resultRepo, {
      manager: {
        transaction: async (run) =>
          run({ query: jest.fn(), getRepository: () => resultRepo }),
      },
    });
    const service = new CVProcessingService(resultRepo as any, queue as any);

    await service.queueCVProcessing({
      cvId: 'cv-1',
      userId: 'user-1',
      applicationId: 'application-1',
      cvContentVersion: 'cv-v1',
      contentHash: 'a'.repeat(64),
      jobId: 'job-1',
      jobSourceVersion: 'job-v1',
      aiRankingConsentGranted: true,
      aiRankingConsentVersion: 'consent-v1',
      aiRankingConsentPolicyHash: 'b'.repeat(64),
      consentIdempotencyKey: 'application-1:cv-v1:job-v1',
    });

    const payload = queue.add.mock.calls[0][1];
    expect(payload).toEqual(
      expect.objectContaining({
        cvMatchResultId: 'result-1',
        cvId: 'cv-1',
        userId: 'user-1',
        applicationId: 'application-1',
        jobId: 'job-1',
        cvContentVersion: 'cv-v1',
        contentHash: 'a'.repeat(64),
        jobSourceVersion: 'job-v1',
      }),
    );
    expect(payload).not.toHaveProperty('cvText');
    expect(payload).not.toHaveProperty('cvUrl');
    expect(payload).not.toHaveProperty('candidate');
    expect(payload).not.toHaveProperty('job');
  });
});

describe('automatic application eligibility', () => {
  function setup() {
    const app = {
      _id: 'app',
      cvId: 'cv',
      jobId: 'job',
      userId: 'candidate',
      companyId: 'company',
      status: ApplicationStatus.PENDING,
      aiRankingConsentGranted: true,
      aiRankingConsentVersion: 'v1',
      aiRankingConsentPolicyHash: 'policy',
      aiRankingConsentAt: new Date(),
    };
    const cv = {
      _id: 'cv',
      userId: 'candidate',
      contentVersion: 'v1',
      contentHash: 'hash',
      parseStatus: CVParseStatus.READY,
    };
    const job = {
      _id: 'job',
      company: { _id: 'company' },
      createdBy: { _id: 'creator' },
      updatedAt: new Date(),
      skills: [],
    };
    const company = { _id: 'company', isActive: true };
    const creator = {
      role: Role.HR,
      isPremium: true,
      premiumPlan: PremiumPlan.HR_PREMIUM,
      premiumExpiresAt: new Date(Date.now() + 86400000),
      company: { _id: 'company' },
    };
    const records = new Map<unknown, unknown>([
      [Application, app],
      [UserCV, cv],
      [Job, job],
      [Company, company],
    ]);
    const manager = {
      getRepository: (entity) => ({
        findOne: async ({ where }) =>
          entity === User
            ? where._id === 'creator'
              ? creator
              : { _id: 'candidate', premiumPlan: PremiumPlan.FREE }
            : records.get(entity),
      }),
    };
    const service = new CVProcessingService({ manager } as any, {} as any);
    const enqueue = jest
      .spyOn(service, 'queueCVProcessing')
      .mockResolvedValue({} as any);
    return { service, app, cv, job, creator, company, enqueue };
  }

  it('queues READY-before-apply with a Free applicant and persisted HR Premium creator', async () => {
    const h = setup();
    await h.service.enqueueEligibleApplication('app');
    expect(h.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: 'app',
        userId: 'candidate',
        contentHash: 'hash',
      }),
    );
    const payload = h.enqueue.mock.calls[0][0];
    expect(payload).not.toHaveProperty('parsedText');
    expect(payload).not.toHaveProperty('url');
  });

  it('defers apply-before-READY until the same shared eligibility check sees READY', async () => {
    const h = setup();
    h.cv.parseStatus = CVParseStatus.PROCESSING;
    await h.service.enqueueEligibleApplication('app');
    expect(h.enqueue).not.toHaveBeenCalled();
    h.cv.parseStatus = CVParseStatus.READY;
    await h.service.enqueueEligibleApplication('app');
    expect(h.enqueue).toHaveBeenCalledTimes(1);
  });

  it.each([
    'free',
    'expired',
    'company mismatch',
    'no creator',
    'revoked',
    'rejected',
    'deleted CV',
    'deleted company',
  ])('does not enqueue %s', async (reason) => {
    const h = setup();
    if (reason === 'free') h.creator.premiumPlan = PremiumPlan.FREE;
    if (reason === 'expired') h.creator.premiumExpiresAt = new Date(0);
    if (reason === 'company mismatch') h.creator.company._id = 'unrelated';
    if (reason === 'no creator') h.job.createdBy = null;
    if (reason === 'revoked') h.app.aiRankingConsentGranted = false;
    if (reason === 'rejected') h.app.status = ApplicationStatus.REJECTED;
    if (reason === 'deleted CV') Object.assign(h.cv, { isDeleted: true });
    if (reason === 'deleted company')
      Object.assign(h.company, { isDeleted: true });
    await h.service.enqueueEligibleApplication('app');
    expect(h.enqueue).not.toHaveBeenCalled();
  });

  it('allows a canonical Admin creator without a Premium subscription', async () => {
    const h = setup();
    h.creator.role = Role.ADMIN;
    h.creator.premiumPlan = PremiumPlan.FREE;
    h.creator.premiumExpiresAt = new Date(0);
    await h.service.enqueueEligibleApplication('app');
    expect(h.enqueue).toHaveBeenCalledTimes(1);
  });
});

it.each([undefined, 'exact-application'])(
  'returns only fresh consented matches with optional application filter %s',
  async (applicationId) => {
    const queryBuilder = {
      leftJoin: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    const resultRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    const service = new CVProcessingService(resultRepo as any, {} as any);

    await service.getRankedCandidates(
      'job-1',
      10,
      'job-source-v2',
      applicationId,
    );
    if (applicationId) {
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'result.applicationId = :applicationId',
        { applicationId },
      );
    }
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'application.aiRankingConsentGranted = true',
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'application.deletedAt IS NULL',
    );

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'result.jobSourceVersion = :jobSourceVersion',
      { jobSourceVersion: 'job-source-v2' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'result.contentHash = cv.contentHash',
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'result.scoringVersion = :scoringVersion',
      { scoringVersion: 'cv-job-match-v3' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'result.normalizationVersion = :normalizationVersion',
      { normalizationVersion: 'skill-normalization-v2' },
    );
    for (const predicate of [
      'application.aiRankingConsentGranted = true',
      'application.aiRankingConsentVersion IS NOT NULL',
      'application.aiRankingConsentPolicyHash IS NOT NULL',
      'application.aiRankingConsentAt IS NOT NULL',
      'application.isDeleted = false',
      'application.deletedAt IS NULL',
      'user.isDeleted = false',
      'user.deletedAt IS NULL',
      'application.cvId = result.cvId AND application.userId = result.userId AND application.jobId = result.jobId',
      'cv.userId = result.userId',
      'result.deletedAt IS NULL',
      'job.isDeleted = false AND job.deletedAt IS NULL',
      "CAST(application.companyId AS text) = job.company->>'_id'",
    ]) {
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(predicate);
    }
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'application.status IN (:...eligibleStatuses)',
      { eligibleStatuses: ['PENDING', 'REVIEWING', 'CONSIDERING', 'APPROVED'] },
    );
    expect(queryBuilder.addOrderBy).toHaveBeenCalledWith('result._id', 'ASC');
  },
);
