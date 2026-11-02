import { ApplicationsService } from 'src/applications/applications.service';
import { UsersService } from 'src/users/users.service';
import { CandidateAccessService } from 'src/candidate-access/candidate-access.service';
import { Role } from 'src/decorator/customize';
import { PremiumPlan } from 'src/users/entities/user.entity';
import { mapHRMatchingAnalysis } from 'src/ai-matching/hr-matching-analysis';
import { CVMatchResult } from 'src/ai-matching/entities/cv-match-result.entity';

function policyHarness(persisted: Record<string, unknown> | null) {
  const service = Object.assign(Object.create(UsersService.prototype), {
    userRepo: { findOne: jest.fn().mockResolvedValue(persisted) },
    packageRepo: { findOne: jest.fn().mockResolvedValue(null) },
  }) as UsersService;
  return service;
}

describe('Persisted HR AI entitlements', () => {
  it.each([
    [Role.HR, PremiumPlan.FREE, null, false],
    [Role.HR, PremiumPlan.HR_PREMIUM, '2099-01-01', true],
    [Role.HR, PremiumPlan.HR_PREMIUM, '2000-01-01', false],
    [Role.ADMIN, PremiumPlan.FREE, null, true],
  ])(
    'gates combined advanced search by persisted %s/%s expiry=%s',
    async (role, premiumPlan, premiumExpiresAt, allowed) => {
      const usersService = policyHarness({
        _id: 'hr',
        role,
        premiumPlan,
        premiumExpiresAt,
      });
      const createQueryBuilder = jest.fn(() => {
        throw new Error('query reached');
      });
      const search = Object.assign(
        Object.create(CandidateAccessService.prototype),
        {
          usersService,
          getCompanyRecruitmentProfile: jest.fn().mockResolvedValue(null),
          onlineCVRepo: { createQueryBuilder },
        },
      ) as CandidateAccessService;
      await expect(
        search.searchCandidates(
          {
            skills: 'SQL',
            location: 'Hanoi',
            education: 'Bachelor',
            minExperienceYears: 0,
            minExpectedSalary: 0,
          },
          { _id: 'hr', role: Role.ADMIN } as never,
        ),
      ).rejects.toThrow(allowed ? 'query reached' : 'HR Premium');
      expect(createQueryBuilder).toHaveBeenCalledTimes(allowed ? 1 : 0);
    },
  );

  it.each([
    [Role.HR, PremiumPlan.FREE, null, true, false],
    [Role.HR, PremiumPlan.HR_PREMIUM, '2099-01-01', true, true],
    [Role.HR, PremiumPlan.HR_PREMIUM, '2000-01-01', true, false],
    [Role.ADMIN, PremiumPlan.FREE, null, true, true],
    [Role.USER, PremiumPlan.HR_PREMIUM, null, false, false],
  ])(
    'uses persisted %s/%s expiry=%s',
    async (role, plan, expiry, basic, advanced) => {
      const service = policyHarness({
        _id: 'hr',
        role,
        premiumPlan: plan,
        premiumExpiresAt: expiry,
      });
      const { limits } = await service.getUserEntitlements({
        _id: 'hr',
        role: Role.ADMIN,
        premiumPlan: PremiumPlan.HR_PREMIUM,
      });
      expect(limits).toMatchObject({
        canViewAiRanking: basic,
        canExportAiScores: basic,
        canUseAdvancedCandidateSearch: advanced,
        canUseAutomaticCandidateMatching: advanced,
        canViewCandidateAiAnalysis: advanced,
      });
    },
  );

  it('does not fall back to stale token policy when persisted user is missing', async () => {
    const { limits } = await policyHarness(null).getUserEntitlements({
      _id: 'deleted',
      role: Role.ADMIN,
    });
    expect(limits.canViewAiRanking).toBe(false);
    expect(limits.canViewCandidateAiAnalysis).toBe(false);
  });
});

function rankingHarness(role = Role.HR, advanced = false, company = 'company') {
  const usersService = {
    getUserEntitlements: jest.fn().mockResolvedValue({
      role,
      limits: {
        canViewAiRanking: role === Role.HR || role === Role.ADMIN,
        canViewCandidateAiAnalysis: advanced,
        canUseAdvancedCandidateSearch: advanced,
      },
    }),
    findOne: jest.fn().mockResolvedValue({ company: { _id: company } }),
  };
  const result = {
    applicationId: 'application',
    matchScore: 87,
    user: {
      _id: 'candidate',
      name: 'Candidate',
      email: 'candidate@example.test',
    },
    cv: { _id: 'cv', title: 'CV' },
    matchedSkills: ['NestJS'],
    missingSkills: ['SQL'],
    explanation: 'Skill gap',
  };
  const cvProcessingService = {
    getRankedCandidates: jest.fn().mockResolvedValue([result]),
    getProcessingStatus: jest.fn().mockResolvedValue({
      total: 1,
      completed: 1,
      processing: 0,
      pending: 0,
      failed: 0,
    }),
  };
  const service = Object.assign(Object.create(ApplicationsService.prototype), {
    usersService,
    jobsService: {
      findOneForInternal: jest.fn().mockResolvedValue({
        _id: 'job',
        name: 'Engineer',
        company: { _id: 'company' },
      }),
    },
    applicationRepo: { count: jest.fn().mockResolvedValue(1) },
    companyRepo: {
      findOne: jest.fn().mockResolvedValue({ _id: 'company', name: 'Company' }),
    },
    cvProcessingService,
  }) as ApplicationsService;
  const user = { _id: 'hr', role } as Parameters<
    ApplicationsService['getAIRankedCandidates']
  >[2];
  return { service, user, usersService, cvProcessingService };
}

describe('HR AI ranking and search boundaries', () => {
  it('redacts nested and legacy analysis when persisted Premium has expired', async () => {
    const { service, user } = rankingHarness(Role.HR, true);
    Object.assign(service, {
      usersService: Object.assign(
        policyHarness({
          _id: 'hr',
          role: Role.HR,
          premiumPlan: PremiumPlan.HR_PREMIUM,
          premiumExpiresAt: '2000-01-01',
        }),
        {
          findOne: jest.fn().mockResolvedValue({ company: { _id: 'company' } }),
        },
      ),
    });
    const response = await service.getAIRankedCandidates('job', 10, user);
    expect(response.rankedCandidates[0]).toMatchObject({
      matchScore: 87,
      analysisAvailable: false,
      matchedSkills: [],
      missingSkills: [],
      shortExplanation: '',
    });
    expect(response.rankedCandidates[0]).not.toHaveProperty('aiAnalysis');
  });

  it.each([
    [Role.HR, false],
    [Role.HR, true],
    [Role.ADMIN, true],
  ])(
    'returns score/identity but gates analysis for %s advanced=%s',
    async (role, advanced) => {
      const { service, user } = rankingHarness(role, advanced);
      const response = await service.getAIRankedCandidates('job', 15, user);
      expect(response.rankedCandidates[0]).toMatchObject({
        candidateId: 'candidate',
        matchScore: 87,
        analysisAvailable: advanced,
        matchedSkills: advanced ? ['NestJS'] : [],
        missingSkills: advanced ? ['SQL'] : [],
        shortExplanation: advanced ? 'Skill gap' : '',
      });
      expect(response.processingStatus?.completed).toBe(1);
      if (advanced) {
        expect(response.rankedCandidates[0].aiAnalysis).toMatchObject({
          source: 'persisted_cv_match_result',
          components: {
            experience: { available: false, score: null, weight: 0 },
          },
          explanation: {
            text: 'Skill gap',
            source: 'stored_unknown',
            locale: 'und',
          },
        });
      } else {
        expect(response.rankedCandidates[0]).not.toHaveProperty('aiAnalysis');
      }
    },
  );

  it('denies cross-company HR before reading scores', async () => {
    const { service, user, cvProcessingService } = rankingHarness(
      Role.HR,
      true,
      'other',
    );
    await expect(
      service.getAIRankedCandidates('job', 10, user),
    ).rejects.toThrow('không có quyền');
    expect(cvProcessingService.getRankedCandidates).not.toHaveBeenCalled();
  });

  it('rejects candidate role', async () => {
    const { service, user } = rankingHarness(Role.USER);
    await expect(
      service.getAIRankedCandidates('job', 10, user),
    ).rejects.toThrow('không có quyền');
  });

  it.each([0, -1, 1.5, NaN])('rejects invalid topN %s', async (topN) => {
    const { service, user } = rankingHarness();
    await expect(
      service.getAIRankedCandidates('job', topN, user),
    ).rejects.toThrow('positive integer');
  });

  it('denies Free CV search', async () => {
    const { service, user } = rankingHarness();
    await expect(
      service.searchByCV('job', { skills: 'SQL' }, user),
    ).rejects.toThrow('HR Premium');
  });

  it('retains company ownership checks for Premium CV search', async () => {
    const { service, user } = rankingHarness(Role.HR, true, 'other');
    await expect(
      service.searchByCV('job', { skills: 'SQL' }, user),
    ).rejects.toThrow('không có quyền');
  });

  it('uses persisted HR role for ownership even if token claims admin', async () => {
    const { service, user } = rankingHarness(Role.HR, true, 'other');
    await expect(
      service.getAIRankedCandidates('job', 10, { ...user, role: Role.ADMIN }),
    ).rejects.toThrow('không có quyền');
  });

  it.each([Role.HR, Role.ADMIN])(
    'allows Premium/admin CV search for %s',
    async (role) => {
      const { service, user } = rankingHarness(role, true);
      const queryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      Object.assign(service, {
        applicationRepo: { createQueryBuilder: () => queryBuilder },
      });
      await expect(
        service.searchByCV('job', { skills: 'SQL' }, user),
      ).resolves.toBeDefined();
    },
  );

  it.each([
    [{ keyword: 'Engineer' }, false],
    [{ skills: 'SQL' }, true],
    [{ location: 'Hanoi' }, true],
  ])('preserves browse flow for %s with advanced=%s', async (dto, advanced) => {
    const { usersService, user } = rankingHarness(Role.HR, advanced);
    const service = Object.assign(
      Object.create(CandidateAccessService.prototype),
      {
        usersService,
        getCompanyRecruitmentProfile: jest.fn().mockResolvedValue(null),
        onlineCVRepo: {},
      },
    ) as CandidateAccessService;
    // Stop at the repository boundary: basic browse must not require Premium.
    const createQueryBuilder = jest.fn(() => {
      throw new Error('browse reached');
    });
    Object.assign(service, { onlineCVRepo: { createQueryBuilder } });
    await expect(service.searchCandidates(dto, user)).rejects.toThrow(
      'browse reached',
    );
    if (!advanced) {
      expect(usersService.getUserEntitlements).not.toHaveBeenCalled();
    }
  });

  it.each([{ skills: 'SQL' }, { location: 'Hanoi' }])(
    'denies Free advanced browse %s',
    async (dto) => {
      const { usersService, user } = rankingHarness();
      const service = Object.assign(
        Object.create(CandidateAccessService.prototype),
        {
          usersService,
        },
      ) as CandidateAccessService;
      await expect(service.searchCandidates(dto, user)).rejects.toThrow(
        'HR Premium',
      );
    },
  );
});

describe('Allowlisted persisted matching analysis', () => {
  it('maps legitimate evidence and zero-weight compatibility without provider extras', () => {
    const result = Object.assign(new CVMatchResult(), {
      scoringVersion: 'cv-job-match-v2',
      modelVersion: 'semantic-v1',
      normalizationVersion: 'normalization-v1',
      degraded: false,
      matchedSkills: ['SQL'],
      missingSkills: ['NestJS'],
      explanation: 'Overall score: 0.80.',
      components: {
        semantic: {
          score: 0.8,
          weight: 0.6,
          available: true,
          evidence: ['semantic scorer=v1'],
          secret: 'hidden',
        },
        skills: { score: 0, weight: 0.4, available: true, evidence: [] },
        location: {
          score: 0,
          weight: 0.9,
          available: true,
          evidence: ['different locations'],
        },
        secret: { payload: 'hidden' },
      },
      compatibility: {
        strengths: ['SQL matched'],
        gaps: ['NestJS missing'],
        secret: 'hidden',
      },
    });
    const analysis = mapHRMatchingAnalysis(result);
    expect(analysis.components.skills).toEqual({
      score: 0,
      weight: 0.4,
      available: true,
      evidence: [],
    });
    expect(analysis.components.experience).toEqual({
      score: null,
      weight: 0,
      available: false,
      evidence: [],
    });
    expect(analysis.compatibility.location).toEqual({
      score: 0,
      weight: 0,
      available: true,
      evidence: ['different locations'],
    });
    expect(analysis).toMatchObject({
      strengths: ['SQL matched'],
      gaps: ['NestJS missing'],
      degraded: false,
      explanation: { source: 'deterministic_matching', locale: 'en' },
    });
    expect(JSON.stringify(analysis)).not.toContain('hidden');
  });

  it.each([
    null,
    [],
    'old',
    {
      experience: {
        score: -1,
        weight: 2,
        available: true,
        evidence: [null, 'fact'],
      },
    },
  ])('safely handles null/malformed legacy JSONB %s', (components) => {
    const result = Object.assign(new CVMatchResult(), {
      components,
      compatibility: null,
      matchedSkills: [null, 'SQL'],
      missingSkills: null,
      explanation: null,
      degraded: null,
    });
    const analysis = mapHRMatchingAnalysis(result);
    expect(analysis.components.experience).toMatchObject({
      available: false,
      score: null,
      weight: 0,
    });
    expect(analysis.matchedSkills).toEqual(['SQL']);
    expect(analysis.strengths).toEqual([]);
    expect(analysis.degraded).toBeNull();
    expect(analysis.explanation).toEqual({
      text: null,
      source: 'unavailable',
      locale: 'und',
    });
  });
});
