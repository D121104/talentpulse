import { ApplicationsService } from 'src/applications/applications.service';
import { Role } from 'src/decorator/customize';
import { getJobSourceVersion } from 'src/job-indexing/job-indexing.normalization';
import { Job } from 'src/jobs/entities/job.entity';
import { Company } from 'src/companies/entities/company.entity';

function harness() {
  const company = { _id: 'company', updatedAt: new Date(0) } as Company;
  const job = Object.assign(new Job(), {
    _id: 'job',
    company,
    updatedAt: new Date(0),
  });
  const app = {
    _id: 'app',
    cvId: 'cv',
    userId: 'candidate',
    jobId: 'job',
    companyId: 'company',
    company,
    job,
    status: 'PENDING',
    aiRankingConsentGranted: true,
    aiRankingConsentVersion: 'v1',
    aiRankingConsentPolicyHash: 'policy',
    aiRankingConsentAt: new Date(0),
    cv: { _id: 'cv', contentHash: 'hash', parsedContent: 'private' },
    user: { _id: 'candidate', name: 'Candidate', password: 'private' },
  };
  const result = {
    applicationId: 'app',
    cvId: 'cv',
    userId: 'candidate',
    jobId: 'job',
    status: 'COMPLETED',
    matchScore: 0,
    contentHash: 'hash',
    jobSourceVersion: getJobSourceVersion(job, company),
    explanation: 'private',
  };
  const qb = Object.fromEntries(
    [
      'leftJoinAndSelect',
      'where',
      'andWhere',
      'orderBy',
      'addOrderBy',
      'skip',
      'take',
    ].map((name) => [name, jest.fn().mockReturnThis()]),
  );
  qb.getManyAndCount = jest.fn().mockResolvedValue([[app], 1]);
  const scores = { find: jest.fn().mockResolvedValue([result]) };
  const usersService = {
    getUserEntitlements: jest.fn().mockResolvedValue({
      role: Role.HR,
      limits: { canExportAiScores: true },
    }),
    findOne: jest.fn().mockResolvedValue({ role: Role.HR, company }),
  };
  const jobsService = { findOneForInternal: jest.fn().mockResolvedValue(job) };
  const service = Object.assign(Object.create(ApplicationsService.prototype), {
    applicationRepo: { createQueryBuilder: () => qb },
    cvMatchResultRepo: scores,
    usersService,
    jobsService,
  }) as ApplicationsService;
  const user = { _id: 'hr', role: Role.HR } as Parameters<
    ApplicationsService['findAll']
  >[1];
  return { service, user, app, result, qb, scores, usersService, jobsService };
}

describe('Application list AI score reporting', () => {
  it.each(['findAll', 'findByJob'] as const)(
    '%s returns a fresh zero without raw entities',
    async (method) => {
      const h = harness();
      const response =
        method === 'findAll'
          ? await h.service.findAll({}, h.user)
          : await h.service.findByJob('job', {}, h.user);
      expect(response.result[0].aiScore).toEqual({
        status: 'COMPLETED',
        overallScore: 0,
      });
      expect(response.result[0]).not.toHaveProperty('user');
      expect(response.result[0]).not.toHaveProperty('cv');
      expect(JSON.stringify(response)).not.toContain('private');
      expect(h.scores.find).toHaveBeenCalledTimes(1);
      expect(h.scores.find.mock.calls[0][0].where.applicationId._value).toEqual(
        ['app'],
      );
    },
  );

  it.each([
    'PENDING',
    'PROCESSING',
    'FAILED',
    'STALE',
    'MISSING',
    'UNAVAILABLE',
    'WRONG_APPLICATION',
    'WRONG_CV',
    'WRONG_USER',
    'WRONG_JOB',
    'MISSING_CV_HASH',
    'JOB_CHANGED',
  ])('reports %s with null score', async (state) => {
    const h = harness();
    let expected = state;
    if (['PENDING', 'PROCESSING', 'FAILED'].includes(state))
      h.result.status = state;
    if (state === 'STALE') h.result.contentHash = 'old';
    if (state === 'JOB_CHANGED') {
      h.result.jobSourceVersion = 'old';
      expected = 'STALE';
    }
    if (state === 'MISSING') h.scores.find.mockResolvedValue([]);
    if (state === 'UNAVAILABLE') h.app.aiRankingConsentGranted = false;
    if (state === 'WRONG_APPLICATION') {
      h.result.applicationId = 'other';
      expected = 'MISSING';
    }
    if (state === 'WRONG_CV') {
      h.result.cvId = 'other';
      expected = 'MISSING';
    }
    if (state === 'WRONG_USER') {
      h.result.userId = 'other';
      expected = 'MISSING';
    }
    if (state === 'WRONG_JOB') {
      h.result.jobId = 'other';
      expected = 'MISSING';
    }
    if (state === 'MISSING_CV_HASH') {
      h.app.cv.contentHash = '';
      expected = 'STALE';
    }
    const response = await h.service.findAll({}, h.user);
    expect(response.result[0].aiScore).toEqual({
      status: expected,
      overallScore: null,
    });
  });

  it('associates batch results by exact application, not row order', async () => {
    const h = harness();
    h.qb.getManyAndCount.mockResolvedValue([
      [h.app, { ...h.app, _id: 'second' }],
      2,
    ]);
    h.scores.find.mockResolvedValue([
      { ...h.result, applicationId: 'second', matchScore: 83 },
      h.result,
    ]);
    const response = await h.service.findAll({}, h.user);
    expect(response.result.map((row) => row.aiScore.overallScore)).toEqual([
      0, 83,
    ]);
    expect(h.scores.find).toHaveBeenCalledTimes(1);
  });

  it.each(['findAll', 'findByJob'] as const)(
    '%s marks ineligible application statuses unavailable',
    async (method) => {
      const h = harness();
      h.app.status = 'UNKNOWN';
      const response =
        method === 'findAll'
          ? await h.service.findAll({}, h.user)
          : await h.service.findByJob('job', {}, h.user);
      expect(response.result[0].aiScore).toEqual({
        status: 'UNAVAILABLE',
        overallScore: null,
      });
    },
  );

  it.each([
    { cv: { isDeleted: true } },
    { cv: { deletedAt: new Date(0) } },
    { user: { isDeleted: true } },
    { user: { deletedAt: new Date(0) } },
    { isDeleted: true },
    { deletedAt: new Date(0) },
    { status: 'REJECTED' },
    { aiRankingConsentVersion: null },
    { aiRankingConsentPolicyHash: null },
    { aiRankingConsentAt: null },
    { cv: null },
    { user: null },
  ])('does not disclose scores for unavailable rows: %j', async (changes) => {
    const h = harness();
    Object.assign(h.app, changes);
    const response = await h.service.findAll({}, h.user);
    expect(response.result[0].aiScore).toEqual({
      status: 'UNAVAILABLE',
      overallScore: null,
    });
  });

  it.each([null, NaN, Infinity])(
    'preserves an invalid/missing score as null: %s',
    async (score) => {
      const h = harness();
      Object.assign(h.result, { matchScore: score });
      const response = await h.service.findAll({}, h.user);
      expect(response.result[0].aiScore.overallScore).toBeNull();
    },
  );

  it('does not query scores for an empty page', async () => {
    const h = harness();
    h.qb.getManyAndCount.mockResolvedValue([[], 0]);
    expect((await h.service.findAll({}, h.user)).result).toEqual([]);
    expect(h.scores.find).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'returns only basic scores with detailed-analysis entitlement %s',
    async (canViewDetailedAiAnalysis) => {
      const h = harness();
      h.usersService.getUserEntitlements.mockResolvedValue({
        role: Role.HR,
        limits: Object.assign(
          { canExportAiScores: true },
          { canViewDetailedAiAnalysis },
        ),
      });
      const response = await h.service.findAll({}, h.user);
      expect(response.result[0].aiScore).toEqual({
        status: 'COMPLETED',
        overallScore: 0,
      });
      const selection = h.scores.find.mock.calls[0][0].select;
      expect(selection).not.toHaveProperty('explanation');
      expect(selection).not.toHaveProperty('components');
      expect(selection).not.toHaveProperty('matchedSkills');
      expect(h.scores.find.mock.calls[0][0].where.isDeleted).toBe(false);
    },
  );

  it('uses all loaded application IDs, including rows beyond the rank modal limit', async () => {
    const h = harness();
    const apps = Array.from({ length: 20 }, (_, i) => ({
      ...h.app,
      _id: `app-${i}`,
    }));
    h.qb.getManyAndCount.mockResolvedValue([apps, 100]);
    h.scores.find.mockResolvedValue(
      apps.map((app, i) => ({
        ...h.result,
        applicationId: app._id,
        matchScore: i,
      })),
    );
    const response = await h.service.findByJob(
      'job',
      { pageSize: '20' },
      h.user,
    );
    expect(response.result).toHaveLength(20);
    expect(response.result[19].aiScore.overallScore).toBe(19);
    expect(response.meta.total).toBe(100);
    expect(h.scores.find.mock.calls[0][0].where.applicationId._value).toEqual(
      apps.map((app) => app._id),
    );
  });

  it('preserves company scope and rejects cross-company job lists', async () => {
    const h = harness();
    await h.service.findAll({ companyId: 'other' }, h.user);
    expect(h.qb.andWhere).toHaveBeenCalledWith('app.companyId = :companyId', {
      companyId: 'company',
    });
    h.usersService.findOne.mockResolvedValue({
      role: Role.HR,
      company: { _id: 'other' } as Company,
    });
    await expect(h.service.findByJob('job', {}, h.user)).rejects.toThrow();
  });

  it('rejects a persisted non-HR role even with an admin token', async () => {
    const h = harness();
    h.usersService.getUserEntitlements.mockResolvedValue({
      role: Role.USER,
      limits: { canExportAiScores: false },
    });
    await expect(
      h.service.findAll({}, { ...h.user, role: Role.ADMIN }),
    ).rejects.toThrow();
    expect(h.scores.find).not.toHaveBeenCalled();
  });
});
