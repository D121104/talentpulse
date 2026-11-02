import { ApplicationsService } from 'src/applications/applications.service';
import { UsersService } from 'src/users/users.service';
import { CandidateAccessService } from 'src/candidate-access/candidate-access.service';
import { Role } from 'src/decorator/customize';
import { PremiumPlan } from 'src/users/entities/user.entity';

function policyHarness(persisted: Record<string, unknown> | null) {
  const service = Object.assign(Object.create(UsersService.prototype), {
    userRepo: { findOne: jest.fn().mockResolvedValue(persisted) },
    packageRepo: { findOne: jest.fn().mockResolvedValue(null) },
  }) as UsersService;
  return service;
}

describe('Persisted HR AI entitlements', () => {
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
