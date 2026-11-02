import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CandidateAccessService,
  structuredExperienceYears,
} from '../src/candidate-access/candidate-access.service';
import { SearchCandidatesDto } from '../src/candidate-access/dto/search-candidate.dto';
import { CreateOnlineCVDto } from '../src/online-cvs/dto/create-online-cv.dto';
import { Role } from '../src/decorator/customize';

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
