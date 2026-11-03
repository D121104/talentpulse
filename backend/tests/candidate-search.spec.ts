import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CandidateAccessService,
  structuredExperienceYears,
} from '../src/candidate-access/candidate-access.service';
import { SearchCandidatesDto } from '../src/candidate-access/dto/search-candidate.dto';
import { CreateOnlineCVDto } from '../src/online-cvs/dto/create-online-cv.dto';
import { Role } from '../src/decorator/customize';
import { Application } from 'src/applications/entities/application.entity';
import { Job } from 'src/jobs/entities/job.entity';
import { Company } from 'src/companies/entities/company.entity';
import { getJobSourceVersion } from 'src/job-indexing/job-indexing.normalization';

describe('advanced candidate search', () => {
  describe('canonical company eligibility', () => {
    function companyHarness(account: object | null, company: object | null) {
      const createQueryBuilder = jest.fn(() => {
        throw new Error('candidate query reached');
      });
      const userRepo = { findOne: jest.fn().mockResolvedValue(account) };
      const companyRepo = { findOne: jest.fn().mockResolvedValue(company) };
      const service = Object.assign(
        Object.create(CandidateAccessService.prototype),
        {
          userRepo,
          companyRepo,
          jobRepo: { find: jest.fn().mockResolvedValue([]) },
          usersService: {
            getUserEntitlements: jest.fn().mockResolvedValue({
              limits: { canUseAdvancedCandidateSearch: true },
            }),
          },
          onlineCVRepo: { createQueryBuilder },
        },
      ) as CandidateAccessService;
      return { service, createQueryBuilder, userRepo, companyRepo };
    }

    it.each([
      [null, null],
      [{ role: Role.HR }, null],
      [{ role: Role.HR, company: { _id: 'stale' } }, null],
      [
        { role: Role.HR, company: { _id: 'company' } },
        { _id: 'company', isDeleted: true },
      ],
      [
        { role: Role.HR, company: { _id: 'company' } },
        { _id: 'company', deletedAt: new Date() },
      ],
      [
        { role: Role.HR, isDeleted: true, company: { _id: 'company' } },
        { _id: 'company' },
      ],
    ])(
      'rejects missing/stale/deleted canonical association %s',
      async (account, company) => {
        for (const dto of [
          { keyword: 'Engineer' },
          { minExpectedSalary: 0 },
          { minExperienceYears: 0 },
        ]) {
          const { service, createQueryBuilder } = companyHarness(
            account,
            company,
          );
          await expect(
            service.searchCandidates(dto, {
              _id: 'hr',
              role: Role.ADMIN,
              company: { _id: 'token-company' },
            } as never),
          ).rejects.toThrow('công ty');
          expect(createQueryBuilder).not.toHaveBeenCalled();
        }
      },
    );

    it.each([
      [
        { role: Role.HR, company: { _id: 'company' } },
        { _id: 'company', name: 'Company' },
      ],
      [{ role: Role.ADMIN }, null],
      [{ role: Role.ADMIN, company: { _id: 'stale' } }, null],
    ])(
      'accepts valid company or canonical Admin exemption %s',
      async (account, company) => {
        const { service, createQueryBuilder, userRepo } = companyHarness(
          account,
          company,
        );
        await expect(
          service.searchCandidates(
            { minExpectedSalary: 0, minExperienceYears: 0 },
            { _id: 'hr', role: Role.HR } as never,
          ),
        ).rejects.toThrow('candidate query reached');
        expect(createQueryBuilder).toHaveBeenCalledTimes(1);
        expect(userRepo.findOne).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ _id: 'hr', isDeleted: false }),
          }),
        );
      },
    );
  });
  it('merges overlapping dated intervals and leaves unknown experience unknown', () => {
    expect(
      structuredExperienceYears([
        { startDate: '2020-01', endDate: '2022-01' },
        { startDate: '2021-01', endDate: '2023-01' },
      ]),
    ).toBe(3);
    expect(structuredExperienceYears(['5 years experience'])).toBeNull();
    expect(structuredExperienceYears([])).toBeNull();
    expect(
      structuredExperienceYears([
        { startDate: '2022-02-30', endDate: '2023-01' },
      ]),
    ).toBeNull();
    expect(
      structuredExperienceYears([{ startDate: '2020-01', endDate: '2020-01' }]),
    ).toBe(0);
  });

  it.each([
    'minExperienceYears',
    'maxExperienceYears',
    'minExpectedSalary',
    'maxExpectedSalary',
    'education',
  ])('gates %s before repositories, including zero', async (field) => {
    const service = Object.assign(
      Object.create(CandidateAccessService.prototype),
      {
        usersService: {
          getUserEntitlements: jest.fn().mockResolvedValue({
            limits: { canUseAdvancedCandidateSearch: false },
          }),
        },
      },
    );
    await expect(
      service.searchCandidates(
        { [field]: field === 'education' ? 'Bachelor' : 0 },
        { _id: 'hr' },
      ),
    ).rejects.toThrow('HR Premium');
  });

  it.each([
    { minExperienceYears: -1 },
    { minExperienceYears: '' },
    { maxExpectedSalary: 'abc' },
    { minExpectedSalary: 0.5 },
  ])('validates numeric inputs %s', async (input) => {
    expect(
      (await validate(plainToInstance(SearchCandidatesDto, input))).length,
    ).toBeGreaterThan(0);
  });

  function harness(online: object[] = [], uploaded: object[] = []) {
    const builder = (rows: object[]) => ({
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(rows),
    });
    const onlineQuery = builder(online);
    const uploadedQuery = builder(uploaded);
    const service: CandidateAccessService = Object.assign(
      Object.create(CandidateAccessService.prototype),
      {
        usersService: {
          getUserEntitlements: jest.fn().mockResolvedValue({
            limits: { canUseAdvancedCandidateSearch: true },
          }),
        },
        getCompanyRecruitmentProfile: jest.fn().mockResolvedValue(null),
        calculateCompanyMatch: jest.fn().mockReturnValue({ score: 0 }),
        onlineCVRepo: { createQueryBuilder: () => onlineQuery },
        userCVRepo: { createQueryBuilder: () => uploadedQuery },
        candidateAccessRepo: { find: jest.fn().mockResolvedValue([]) },
      },
    );
    return { service, onlineQuery, uploadedQuery };
  }

  function jobHarness() {
    const candidate = { _id: 'candidate', name: 'Candidate' };
    const { service } = harness(
      [],
      [
        { _id: 'cv', user: candidate, skills: [], createdAt: new Date(0) },
        {
          _id: 'other-cv',
          user: candidate,
          skills: [],
          createdAt: new Date(0),
        },
      ],
    );
    const company = { _id: 'company' } as Company;
    const job = Object.assign(new Job(), { _id: 'job', company });
    const app = Object.assign(new Application(), {
      _id: 'app',
      cvId: 'cv',
      userId: 'candidate',
      jobId: 'job',
      companyId: 'company',
      company,
      job,
      user: candidate,
      cv: { _id: 'cv', userId: 'candidate', contentHash: 'hash' },
      status: 'PENDING',
      aiRankingConsentGranted: true,
      aiRankingConsentVersion: 'v1',
      aiRankingConsentPolicyHash: 'policy',
      aiRankingConsentAt: new Date(0),
    });
    const result = {
      applicationId: 'app',
      cvId: 'cv',
      userId: 'candidate',
      jobId: 'job',
      status: 'COMPLETED',
      matchScore: 0,
      contentHash: 'hash',
      jobSourceVersion: getJobSourceVersion(job, company),
      scoringVersion: 'cv-job-match-v3',
      normalizationVersion: 'skill-normalization-v2',
    };
    const applications = { find: jest.fn().mockResolvedValue([app]) };
    const results = { find: jest.fn().mockResolvedValue([result]) };
    const entitlements = jest
      .fn()
      .mockResolvedValue({ limits: { canUseAdvancedCandidateSearch: false } });
    Object.assign(service, {
      getCompanyRecruitmentProfile: jest
        .fn()
        .mockResolvedValue({ companyId: 'company' }),
      jobRepo: { findOne: jest.fn().mockResolvedValue(job) },
      dataSource: {
        getRepository: (entity: unknown) =>
          entity === Application ? applications : results,
      },
      usersService: { getUserEntitlements: entitlements },
    });
    return { service, app, result, job, applications, results, entitlements };
  }

  it('returns stored zero for exact CV only on Free, with no heuristic percentage or detail leakage', async () => {
    const h = jobHarness();
    const response = await h.service.searchCandidates({ jobId: 'job' }, {
      _id: 'hr',
    } as never);
    expect(response.result.find((r) => r.cvId === 'cv').aiScore).toEqual({
      status: 'COMPLETED',
      overallScore: 0,
    });
    expect(response.result.find((r) => r.cvId === 'other-cv').aiScore).toEqual({
      status: 'UNAVAILABLE',
      overallScore: null,
    });
    expect(response.result.every((r) => r.companyMatchScore === null)).toBe(
      true,
    );
    expect(response.result[0]).not.toHaveProperty('components');
    expect(h.entitlements).not.toHaveBeenCalled();
  });

  it.each([
    'old-version',
    'old-normalization',
    'no-consent',
    'wrong-company',
    'wrong-owner',
    'wrong-result-cv',
    'no-application',
    'pending',
    'failed',
  ])('does not disclose score for %s', async (state) => {
    const h = jobHarness();
    let status = 'UNAVAILABLE';
    if (state === 'old-version') {
      h.result.scoringVersion = 'cv-job-match-v2';
      status = 'STALE';
    }
    if (state === 'old-normalization') {
      h.result.normalizationVersion = 'cv-job-normalization-v1';
      status = 'STALE';
    }
    if (state === 'no-consent') h.app.aiRankingConsentGranted = false;
    if (state === 'wrong-company') h.app.companyId = 'other';
    if (state === 'wrong-owner') h.app.cv.userId = 'other';
    if (state === 'wrong-result-cv') {
      h.result.cvId = 'other-cv';
      status = 'MISSING';
    }
    if (state === 'no-application') h.applications.find.mockResolvedValue([]);
    if (state === 'pending') {
      h.result.status = 'PENDING';
      status = 'PENDING';
    }
    if (state === 'failed') {
      h.result.status = 'FAILED';
      status = 'FAILED';
    }
    const response = await h.service.searchCandidates({ jobId: 'job' }, {
      _id: 'hr',
    } as never);
    expect(response.result.find((r) => r.cvId === 'cv').aiScore).toEqual({
      status,
      overallScore: null,
    });
  });

  it('rejects cross-company job context before candidate queries', async () => {
    const h = jobHarness();
    h.job.company = { _id: 'other' } as Company;
    await expect(
      h.service.searchCandidates({ jobId: 'job' }, { _id: 'hr' } as never),
    ).rejects.toThrow('quyền');
    expect(h.applications.find).not.toHaveBeenCalled();
  });

  it('validates optional job context UUID', async () => {
    expect(
      (
        await validate(
          plainToInstance(SearchCandidatesDto, { jobId: 'not-a-uuid' }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });

  it.each(['exact', 'other-online-cv', 'other-owner', 'ambiguous'])(
    'uses only explicit exact online CV application linkage: %s',
    async (state) => {
      const h = jobHarness();
      Object.assign(h.app.cv, {
        onlineCvId: state === 'other-online-cv' ? 'other' : 'online',
      });
      if (state === 'other-owner') h.app.cv.userId = 'other';
      if (state === 'ambiguous')
        h.applications.find.mockResolvedValue([
          h.app,
          { ...h.app, _id: 'second' },
        ]);
      const onlineQuery = {
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            _id: 'online',
            user: { _id: 'candidate' },
            skills: [],
            createdAt: new Date(0),
          },
        ]),
      };
      Object.assign(h.service, {
        onlineCVRepo: { createQueryBuilder: () => onlineQuery },
      });
      const response = await h.service.searchCandidates({ jobId: 'job' }, {
        _id: 'hr',
      } as never);
      const row = response.result.find((r) => r.cvId === 'online');
      expect(row.aiScore).toEqual(
        state === 'exact'
          ? { status: 'COMPLETED', overallScore: 0 }
          : { status: 'UNAVAILABLE', overallScore: null },
      );
      expect(h.applications.find.mock.calls[0][0].where).toContainEqual(
        expect.objectContaining({
          cv: { onlineCvId: 'online', userId: 'candidate' },
          jobId: 'job',
          companyId: 'company',
          userId: 'candidate',
        }),
      );
    },
  );

  it('filters experience before counting and paginating; never returns private salary or raw text', async () => {
    const rows = [
      [],
      [{ startDate: '2020-01', endDate: '2021-01' }],
      [{ startDate: '2020-01', endDate: '2022-01' }],
      [{ startDate: '2020-01', endDate: '2023-01' }],
    ].map((workExperience, i) => ({
      _id: String(i),
      user: { _id: String(i), name: 'Candidate' },
      workExperience,
      expectedSalaryVndMonthly: 123,
      parsedText: 'private',
      createdAt: new Date(2020, 0, i + 1),
    }));
    const { service } = harness(rows);
    const result = await service.searchCandidates(
      { minExperienceYears: 2, maxExperienceYears: 3, current: 2, pageSize: 1 },
      { _id: 'hr' } as never,
    );
    expect(result.meta.total).toBe(2);
    expect(result.result).toHaveLength(1);
    expect(result.result[0].experienceYears).toBe(2);
    expect(result.result[0]).not.toHaveProperty('expectedSalaryVndMonthly');
    expect(result.result[0]).not.toHaveProperty('parsedText');
  });

  it('parameterizes combined education, salary, skills and location; fences both sources', async () => {
    const { service, onlineQuery, uploadedQuery } = harness();
    const education = "Bachelor' OR 1=1 --";
    await service.searchCandidates(
      {
        education,
        minExpectedSalary: 0,
        maxExpectedSalary: 20000000,
        skills: 'SQL,Java',
        location: 'Hanoi',
      },
      { _id: 'hr' } as never,
    );
    expect(onlineQuery.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('>= :minSalary'),
      { minSalary: 0 },
    );
    expect(onlineQuery.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('shareExpectedSalary = true'),
    );
    expect(onlineQuery.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('e->>'),
      { edu: `%${education}%` },
    );
    expect(uploadedQuery.andWhere).toHaveBeenCalledWith('1 = 0');
    for (const query of [onlineQuery, uploadedQuery]) {
      expect(query.andWhere).toHaveBeenCalledWith(
        'cv.deletedAt IS NULL AND user.deletedAt IS NULL',
      );
      expect(query.andWhere).toHaveBeenCalledWith(
        'user.allowRecruiterSearch = :allowRecruiterSearch',
        { allowRecruiterSearch: true },
      );
      expect(query.andWhere).toHaveBeenCalledWith(
        'cv.isSearchable = :isSearchable',
        { isSearchable: true },
      );
    }
  });

  it.each([
    { minExperienceYears: 3, maxExperienceYears: 2 },
    { minExpectedSalary: 2, maxExpectedSalary: 0 },
  ])('rejects reversed bounds %s before queries', async (dto) => {
    const { service, onlineQuery } = harness();
    await expect(
      service.searchCandidates(dto, { _id: 'hr' } as never),
    ).rejects.toThrow('tối thiểu');
    expect(onlineQuery.getMany).not.toHaveBeenCalled();
  });

  it.each([0, null, 20000000])(
    'accepts optional salary %s on candidate CV input',
    async (salary) => {
      const dto = plainToInstance(CreateOnlineCVDto, {
        templateType: 'template1',
        fullName: 'Candidate',
        expectedSalaryVndMonthly: salary,
        shareExpectedSalary: true,
      });
      expect(await validate(dto)).toHaveLength(0);
    },
  );

  it.each([-1, 1.5, '20000', 2147483648])(
    'rejects invalid candidate salary %s',
    async (salary) => {
      const dto = plainToInstance(CreateOnlineCVDto, {
        templateType: 'template1',
        fullName: 'Candidate',
        expectedSalaryVndMonthly: salary,
      });
      expect((await validate(dto)).length).toBeGreaterThan(0);
    },
  );
});
