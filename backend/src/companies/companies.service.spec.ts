import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Company } from './entities/company.entity';
import { CompaniesService } from './companies.service';
import { IUser } from '../users/users.interface';
import { Role } from '../decorator/customize';
import {
  AiIndexAggregateType,
  AiIndexOutboxOperation,
} from '../ai-indexing/entities';

const COMPANY_A_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_B_ID = '22222222-2222-4222-8222-222222222222';
const HR_ID = '33333333-3333-4333-8333-333333333333';
const ADMIN_ID = '44444444-4444-4444-8444-444444444444';
const HR_EMAIL = 'hr@example.test';
const ADMIN_EMAIL = 'admin@example.test';

type TestUser = IUser & { createdAt: Date };

interface CompaniesHarness {
  service: CompaniesService;
  manager: Record<string, jest.Mock>;
  companyRepository: Record<string, jest.Mock>;
  jobRepository: Record<string, jest.Mock>;
  usersService: Record<string, jest.Mock>;
  redisService: Record<string, jest.Mock>;
  notificationService: Record<string, jest.Mock>;
  aiIndexingService: Record<string, jest.Mock>;
  dataSource: Record<string, jest.Mock>;
}

function makeCompany(_id: string, isActive = true): Company {
  return {
    _id,
    name: `Company ${_id}`,
    description: 'Company description',
    address: 'Company address',
    logo: 'company.png',
    usersFollow: [],
    pendingHrs: [],
    isActive,
    isPremium: false,
    premiumExpiresAt: null,
    isDeleted: false,
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  } as Company;
}

function makeUser(
  role: Role,
  companyId?: string,
  userId?: string,
  email?: string,
): TestUser {
  const isAdmin = role === Role.ADMIN;
  return {
    _id: userId || (isAdmin ? ADMIN_ID : HR_ID),
    email: email || (isAdmin ? ADMIN_EMAIL : HR_EMAIL),
    name: isAdmin ? 'Admin' : 'HR',
    role,
    age: 30,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...(companyId
      ? { company: { _id: companyId, name: `Company ${companyId}` } }
      : {}),
  };
}

function createQueryBuilder<T>(
  rows: T[] = [],
  total = rows.length,
  count = total,
) {
  return {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([rows, total]),
    getMany: jest.fn().mockResolvedValue(rows),
    getCount: jest.fn().mockResolvedValue(count),
  };
}

function createHarness(userInDb: TestUser): CompaniesHarness {
  const companyRepository: Record<string, jest.Mock> = {
    findOne: jest.fn().mockResolvedValue(makeCompany(COMPANY_A_ID)),
    createQueryBuilder: jest.fn(() => createQueryBuilder()),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const jobRepository: Record<string, jest.Mock> = {
    createQueryBuilder: jest.fn(() => createQueryBuilder()),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const usersService: Record<string, jest.Mock> = {
    findOneByEmail: jest.fn().mockResolvedValue(userInDb),
    findAllByCompanyId: jest
      .fn()
      .mockResolvedValue([makeUser(Role.HR, COMPANY_A_ID)]),
    updateUserCompany: jest.fn().mockResolvedValue(undefined),
  };
  const redisService: Record<string, jest.Mock> = {
    getValue: jest.fn().mockResolvedValue(undefined),
    setValue: jest.fn().mockResolvedValue(undefined),
    invalidateCompaniesCache: jest.fn().mockResolvedValue(undefined),
  };
  const notificationService: Record<string, jest.Mock> = {
    create: jest.fn().mockResolvedValue(undefined),
  };
  const aiIndexingService: Record<string, jest.Mock> = {
    enqueueWithNextSourceVersion: jest.fn().mockResolvedValue({}),
  };
  const manager: Record<string, jest.Mock> = {
    getRepository: jest.fn((entity: unknown) =>
      entity === Company ? companyRepository : jobRepository,
    ),
  };
  const dataSource: Record<string, jest.Mock> = {
    transaction: jest.fn(
      async (callback: (transactionManager: unknown) => Promise<unknown>) =>
        callback(manager),
    ),
  };

  const service = new CompaniesService(
    companyRepository as never,
    jobRepository as never,
    {} as never,
    redisService as never,
    notificationService as never,
    usersService as never,
    {} as never,
    dataSource as never,
    aiIndexingService as never,
  );

  return {
    service,
    manager,
    companyRepository,
    jobRepository,
    usersService,
    redisService,
    notificationService,
    aiIndexingService,
    dataSource,
  };
}

function expectNoCompanyMutationOrSideEffects(harness: CompaniesHarness) {
  expect(harness.companyRepository.update).not.toHaveBeenCalled();
  expect(harness.companyRepository.softDelete).not.toHaveBeenCalled();
  expect(
    harness.aiIndexingService.enqueueWithNextSourceVersion,
  ).not.toHaveBeenCalled();
  expect(harness.redisService.invalidateCompaniesCache).not.toHaveBeenCalled();
  expect(harness.notificationService.create).not.toHaveBeenCalled();
}

describe('CompaniesService secured mutations', () => {
  it('rejects an HR without a company from updating an arbitrary company', async () => {
    const user = makeUser(Role.HR);
    const harness = createHarness(user);

    await expect(
      harness.service.update(COMPANY_B_ID, { name: 'Tampered' }, user),
    ).rejects.toBeInstanceOf(BadRequestException);

    expectNoCompanyMutationOrSideEffects(harness);
    expect(harness.dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rejects a company A HR from updating company B', async () => {
    const user = makeUser(Role.HR, COMPANY_A_ID);
    const harness = createHarness(user);

    await expect(
      harness.service.update(COMPANY_B_ID, { name: 'Tampered' }, user),
    ).rejects.toBeInstanceOf(BadRequestException);

    expectNoCompanyMutationOrSideEffects(harness);
    expect(harness.dataSource.transaction).not.toHaveBeenCalled();
  });

  it('allows a same-company HR update and enqueues one company reindex', async () => {
    const user = makeUser(Role.HR, COMPANY_A_ID);
    const harness = createHarness(user);
    harness.companyRepository.findOne.mockResolvedValue(
      makeCompany(COMPANY_A_ID),
    );

    await expect(
      harness.service.update(COMPANY_A_ID, { name: 'Updated' }, user),
    ).resolves.toEqual({ affected: 1 });

    expect(harness.companyRepository.findOne).toHaveBeenCalledWith({
      where: { _id: COMPANY_A_ID },
      lock: { mode: 'pessimistic_write' },
    });
    expect(harness.companyRepository.update).toHaveBeenCalledWith(
      COMPANY_A_ID,
      {
        name: 'Updated',
        updatedBy: { _id: HR_ID, email: HR_EMAIL },
      },
    );
    expect(
      harness.aiIndexingService.enqueueWithNextSourceVersion,
    ).toHaveBeenCalledTimes(1);
    expect(
      harness.aiIndexingService.enqueueWithNextSourceVersion,
    ).toHaveBeenCalledWith(
      {
        aggregateType: AiIndexAggregateType.COMPANY,
        aggregateId: COMPANY_A_ID,
        operation: AiIndexOutboxOperation.REINDEX_COMPANY,
      },
      harness.manager,
    );
    expect(harness.redisService.invalidateCompaniesCache).toHaveBeenCalledTimes(
      1,
    );
  });

  it('rejects an HR update that submits isActive', async () => {
    const user = makeUser(Role.HR, COMPANY_A_ID);
    const harness = createHarness(user);

    await expect(
      harness.service.update(COMPANY_A_ID, { isActive: false }, user),
    ).rejects.toBeInstanceOf(BadRequestException);

    expectNoCompanyMutationOrSideEffects(harness);
    expect(harness.dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rejects company removal by a non-admin even when the HR has no company', async () => {
    const user = makeUser(Role.HR);
    const harness = createHarness(user);

    await expect(
      harness.service.remove(COMPANY_A_ID, user),
    ).rejects.toBeInstanceOf(BadRequestException);

    expectNoCompanyMutationOrSideEffects(harness);
    expect(harness.dataSource.transaction).not.toHaveBeenCalled();
  });

  it('allows an admin to remove a company inside the transaction', async () => {
    const admin = makeUser(Role.ADMIN);
    const harness = createHarness(admin);
    harness.companyRepository.findOne.mockResolvedValue(
      makeCompany(COMPANY_A_ID),
    );

    await expect(harness.service.remove(COMPANY_A_ID, admin)).resolves.toEqual({
      affected: 1,
    });

    expect(harness.companyRepository.findOne).toHaveBeenCalledWith({
      where: { _id: COMPANY_A_ID },
      lock: { mode: 'pessimistic_write' },
    });
    expect(harness.companyRepository.update).toHaveBeenCalledWith(
      COMPANY_A_ID,
      expect.objectContaining({
        isDeleted: true,
        deletedBy: { _id: ADMIN_ID, email: ADMIN_EMAIL },
      }),
    );
    expect(harness.companyRepository.softDelete).toHaveBeenCalledWith(
      COMPANY_A_ID,
    );
    expect(
      harness.aiIndexingService.enqueueWithNextSourceVersion,
    ).toHaveBeenCalledTimes(1);
    expect(harness.redisService.invalidateCompaniesCache).toHaveBeenCalledTimes(
      1,
    );
  });

  it('rejects non-admin verification and allows an admin to toggle with one reindex', async () => {
    const hr = makeUser(Role.HR, COMPANY_A_ID);
    const rejectedHarness = createHarness(hr);

    await expect(
      rejectedHarness.service.verifyCompany(COMPANY_A_ID, hr),
    ).rejects.toBeInstanceOf(BadRequestException);

    expectNoCompanyMutationOrSideEffects(rejectedHarness);
    expect(rejectedHarness.dataSource.transaction).not.toHaveBeenCalled();

    const admin = makeUser(Role.ADMIN);
    const harness = createHarness(admin);
    const company = makeCompany(COMPANY_A_ID, true);
    harness.companyRepository.findOne.mockResolvedValue(company);

    await expect(
      harness.service.verifyCompany(COMPANY_A_ID, admin),
    ).resolves.toEqual({
      message: 'Xác thực công ty thành công',
      isActive: false,
    });

    expect(harness.companyRepository.update).toHaveBeenCalledWith(
      COMPANY_A_ID,
      { isActive: false },
    );
    expect(
      harness.aiIndexingService.enqueueWithNextSourceVersion,
    ).toHaveBeenCalledTimes(1);
    expect(harness.redisService.invalidateCompaniesCache).toHaveBeenCalledTimes(
      1,
    );
    expect(harness.usersService.findAllByCompanyId).toHaveBeenCalledWith(
      COMPANY_A_ID,
    );
    expect(harness.notificationService.create).toHaveBeenCalledTimes(1);
  });

  it('does not mutate, enqueue, invalidate cache, or notify after an authorization failure', async () => {
    const user = makeUser(Role.HR, COMPANY_A_ID);
    const harness = createHarness(user);

    await expect(
      harness.service.verifyCompany(COMPANY_A_ID, user),
    ).rejects.toBeInstanceOf(BadRequestException);

    expectNoCompanyMutationOrSideEffects(harness);
    expect(harness.usersService.findAllByCompanyId).not.toHaveBeenCalled();
    expect(harness.dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rejects an update when the locked company identity does not match the target', async () => {
    const user = makeUser(Role.HR, COMPANY_A_ID);
    const harness = createHarness(user);
    harness.companyRepository.findOne.mockResolvedValue(
      makeCompany(COMPANY_B_ID),
    );

    await expect(
      harness.service.update(COMPANY_A_ID, { name: 'Tampered' }, user),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(harness.companyRepository.findOne).toHaveBeenCalledWith({
      where: { _id: COMPANY_A_ID },
      lock: { mode: 'pessimistic_write' },
    });
    expectNoCompanyMutationOrSideEffects(harness);
  });
});

describe('CompaniesService public responses and roster authorization', () => {
  it('returns an allowlisted company shape from the administrative listing', async () => {
    const harness = createHarness(makeUser(Role.ADMIN));
    const company = {
      ...makeCompany(COMPANY_A_ID),
      taxCode: 'TAX-001',
      scale: '50-200',
      usersFollow: [HR_ID, ADMIN_ID],
      pendingHrs: [
        {
          userId: 'pending-user',
          name: 'Pending HR',
          email: 'pending@example.test',
          requestedAt: new Date(),
        },
      ],
      createdBy: { _id: HR_ID, email: HR_EMAIL },
      updatedBy: { _id: ADMIN_ID, email: ADMIN_EMAIL },
      deletedBy: { _id: ADMIN_ID, email: ADMIN_EMAIL },
      password: 'company-secret',
      securityMetadata: { internalOnly: true },
    } as Company & Record<string, unknown>;
    harness.companyRepository.createQueryBuilder.mockReturnValue(
      createQueryBuilder([company], 1),
    );

    const response = await harness.service.getAllByAdmin({
      current: '1',
      pageSize: '10',
    });

    expect(response.result).toEqual([
      {
        _id: company._id,
        name: company.name,
        description: company.description,
        address: company.address,
        logo: company.logo,
        taxCode: company.taxCode,
        scale: company.scale,
        isActive: company.isActive,
        isPremium: company.isPremium,
        premiumExpiresAt: company.premiumExpiresAt,
        createdAt: company.createdAt,
        updatedAt: company.updatedAt,
      },
    ]);
    expect(response.result[0]).not.toHaveProperty('usersFollow');
    expect(response.result[0]).not.toHaveProperty('pendingHrs');
    expect(response.result[0]).not.toHaveProperty('createdBy');
    expect(response.result[0]).not.toHaveProperty('updatedBy');
    expect(response.result[0]).not.toHaveProperty('deletedBy');
    expect(response.result[0]).not.toHaveProperty('password');
    expect(response.result[0]).not.toHaveProperty('securityMetadata');
  });

  it('returns only the public company allowlist from findAll', async () => {
    const harness = createHarness(makeUser(Role.USER));
    const company = {
      ...makeCompany(COMPANY_A_ID),
      taxCode: 'TAX-001',
      scale: '50-200',
      usersFollow: [HR_ID, ADMIN_ID],
      pendingHrs: [
        {
          userId: 'pending-user',
          name: 'Pending HR',
          email: 'pending@example.test',
          requestedAt: new Date(),
        },
      ],
      createdBy: { _id: HR_ID, email: HR_EMAIL },
      updatedBy: { _id: ADMIN_ID, email: ADMIN_EMAIL },
      deletedBy: { _id: ADMIN_ID, email: ADMIN_EMAIL },
      password: 'company-secret',
      securityMetadata: { internalOnly: true },
    } as Company & Record<string, unknown>;
    harness.companyRepository.createQueryBuilder.mockReturnValue(
      createQueryBuilder([company], 1),
    );
    harness.jobRepository.createQueryBuilder.mockReturnValue(
      createQueryBuilder([], 0, 4),
    );

    const response = await harness.service.findAll('name=Company');

    expect(response.result).toEqual([
      {
        _id: COMPANY_A_ID,
        name: company.name,
        description: company.description,
        address: company.address,
        logo: company.logo,
        taxCode: company.taxCode,
        scale: company.scale,
        isActive: company.isActive,
        isPremium: company.isPremium,
        premiumExpiresAt: company.premiumExpiresAt,
        createdAt: company.createdAt,
        updatedAt: company.updatedAt,
        isFollowed: false,
        jobCount: 4,
      },
    ]);
    expect(response.result[0]).not.toHaveProperty('usersFollow');
    expect(response.result[0]).not.toHaveProperty('pendingHrs');
    expect(response.result[0]).not.toHaveProperty('createdBy');
    expect(response.result[0]).not.toHaveProperty('updatedBy');
    expect(response.result[0]).not.toHaveProperty('deletedBy');
    expect(response.result[0]).not.toHaveProperty('password');
    expect(response.result[0]).not.toHaveProperty('securityMetadata');
  });

  it('returns an allowlisted company and public HR summaries without PII from findOne', async () => {
    const harness = createHarness(makeUser(Role.USER));
    const company = {
      ...makeCompany(COMPANY_A_ID),
      taxCode: 'TAX-001',
      scale: '50-200',
      usersFollow: [HR_ID],
      pendingHrs: [{ userId: 'pending-user' }],
      createdBy: { _id: HR_ID, email: HR_EMAIL },
      updatedBy: { _id: ADMIN_ID, email: ADMIN_EMAIL },
      deletedBy: { _id: ADMIN_ID, email: ADMIN_EMAIL },
    } as Company;
    const hr = {
      ...makeUser(Role.HR, COMPANY_A_ID),
      avatar: 'hr.png',
      address: 'HR address',
      createdAt: new Date('2026-01-03T00:00:00.000Z'),
      password: 'password',
      refreshToken: 'refresh-token',
      verificationToken: 'verification-token',
      registrationCompany: { name: 'Private company data' },
      createdBy: { _id: ADMIN_ID, email: ADMIN_EMAIL },
    };
    harness.companyRepository.findOne.mockResolvedValue(company);
    harness.usersService.findAllByCompanyId.mockResolvedValue([hr]);
    harness.jobRepository.createQueryBuilder.mockReturnValue(
      createQueryBuilder([], 0, 7),
    );

    const response = await harness.service.findOne(COMPANY_A_ID);

    const expectedHr = {
      _id: hr._id,
      name: hr.name,
      avatar: hr.avatar,
      role: hr.role,
      createdAt: hr.createdAt,
      isLead: true,
      hrRole: 'LEAD',
    };
    expect(response).toEqual({
      _id: company._id,
      name: company.name,
      description: company.description,
      address: company.address,
      logo: company.logo,
      taxCode: company.taxCode,
      scale: company.scale,
      isActive: company.isActive,
      isPremium: company.isPremium,
      premiumExpiresAt: company.premiumExpiresAt,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
      hrs: [expectedHr],
      hr: expectedHr,
      jobCount: 7,
    });
    expect(response).not.toHaveProperty('usersFollow');
    expect(response).not.toHaveProperty('pendingHrs');
    expect(response).not.toHaveProperty('createdBy');
    expect(response.hrs[0]).not.toHaveProperty('password');
    expect(response.hrs[0]).not.toHaveProperty('refreshToken');
    expect(response.hrs[0]).not.toHaveProperty('verificationToken');
    expect(response.hrs[0]).not.toHaveProperty('registrationCompany');
    expect(response.hrs[0]).not.toHaveProperty('createdBy');
    expect(response.hrs[0]).not.toHaveProperty('email');
    expect(response.hrs[0]).not.toHaveProperty('address');
  });

  it('does not return an inactive company from the public detail endpoint', async () => {
    const harness = createHarness(makeUser(Role.USER));
    harness.companyRepository.findOne.mockResolvedValue(null);

    await expect(harness.service.findOne(COMPANY_A_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(harness.companyRepository.findOne).toHaveBeenCalledWith({
      where: {
        _id: COMPANY_A_ID,
        isActive: true,
        isDeleted: false,
      },
    });
    expect(harness.usersService.findAllByCompanyId).not.toHaveBeenCalled();
    expect(harness.jobRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('allows an admin to view any roster and rejects unassigned or foreign HR actors', async () => {
    const harness = createHarness(makeUser(Role.ADMIN));
    harness.companyRepository.findOne.mockResolvedValue(
      makeCompany(COMPANY_B_ID),
    );
    harness.usersService.findAllByCompanyId.mockResolvedValue([
      makeUser(Role.HR, COMPANY_B_ID),
    ]);

    await expect(
      harness.service.getCompanyHrs(COMPANY_B_ID, makeUser(Role.ADMIN)),
    ).resolves.toHaveLength(1);
    await expect(
      harness.service.getCompanyHrs(
        COMPANY_B_ID,
        makeUser(
          Role.HR,
          COMPANY_B_ID,
          '55555555-5555-4555-8555-555555555555',
          'member@example.test',
        ),
      ),
    ).resolves.toHaveLength(1);
    await expect(
      harness.service.getCompanyHrs(COMPANY_B_ID, makeUser(Role.HR)),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      harness.service.getCompanyHrs(
        COMPANY_B_ID,
        makeUser(Role.HR, COMPANY_A_ID, '55555555-5555-4555-8555-555555555555'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns a sanitized same-company HR roster with lead metadata', async () => {
    const creator = {
      ...makeUser(Role.HR, COMPANY_A_ID),
      createdAt: new Date('2026-01-03T00:00:00.000Z'),
    };
    const harness = createHarness(creator);
    const company = {
      ...makeCompany(COMPANY_A_ID),
      createdBy: { _id: creator._id, email: creator.email },
    } as Company;
    const member = {
      ...makeUser(
        Role.HR,
        COMPANY_A_ID,
        '55555555-5555-4555-8555-555555555555',
        'member@example.test',
      ),
      avatar: 'member.png',
      address: 'Member address',
      createdAt: new Date('2026-01-04T00:00:00.000Z'),
      password: 'password',
      refreshToken: 'refresh-token',
      verificationToken: 'verification-token',
    };
    harness.companyRepository.findOne.mockResolvedValue(company);
    harness.usersService.findAllByCompanyId.mockResolvedValue([
      creator,
      member,
    ]);

    const roster = await harness.service.getCompanyHrs(COMPANY_A_ID, creator);

    expect(roster).toEqual([
      {
        _id: creator._id,
        name: creator.name,
        email: creator.email,
        avatar: creator.avatar,
        address: creator.address,
        role: creator.role,
        createdAt: creator.createdAt,
        isLead: true,
        hrRole: 'LEAD',
      },
      {
        _id: member._id,
        name: member.name,
        email: member.email,
        avatar: member.avatar,
        address: member.address,
        role: member.role,
        createdAt: member.createdAt,
        isLead: false,
        hrRole: 'MEMBER',
      },
    ]);
    expect(roster[1]).not.toHaveProperty('password');
    expect(roster[1]).not.toHaveProperty('refreshToken');
    expect(roster[1]).not.toHaveProperty('verificationToken');
  });

  it('allows only an admin or the same-company creator to view pending HR requests', async () => {
    const company = {
      ...makeCompany(COMPANY_A_ID),
      createdBy: { _id: HR_ID, email: HR_EMAIL },
      pendingHrs: [
        {
          userId: 'pending-user',
          name: 'Pending HR',
          email: 'pending@example.test',
          avatar: 'pending.png',
          requestedAt: new Date('2026-01-05T00:00:00.000Z'),
        },
      ],
    } as Company;
    const creator = makeUser(Role.HR, COMPANY_A_ID);
    const harness = createHarness(creator);
    harness.companyRepository.findOne.mockResolvedValue(company);

    await expect(
      harness.service.getPendingHrs(COMPANY_A_ID, creator),
    ).resolves.toEqual(company.pendingHrs);
    await expect(
      harness.service.getPendingHrs(COMPANY_A_ID, makeUser(Role.ADMIN)),
    ).resolves.toEqual(company.pendingHrs);
    await expect(
      harness.service.getPendingHrs(
        COMPANY_A_ID,
        makeUser(
          Role.HR,
          COMPANY_A_ID,
          '55555555-5555-4555-8555-555555555555',
          'member@example.test',
        ),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      harness.service.getPendingHrs(
        COMPANY_A_ID,
        makeUser(
          Role.HR,
          COMPANY_B_ID,
          '66666666-6666-4666-8666-666666666666',
          'foreign@example.test',
        ),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      harness.service.getPendingHrs(
        COMPANY_A_ID,
        makeUser(Role.HR, undefined, HR_ID, HR_EMAIL),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('CompaniesService join request authorization', () => {
  const pendingRequest = {
    userId: '55555555-5555-4555-8555-555555555555',
    name: 'Pending HR',
    email: 'pending@example.test',
    avatar: 'pending.png',
    requestedAt: new Date('2026-01-05T00:00:00.000Z'),
  };

  function createApprovalHarness(approver: TestUser) {
    const harness = createHarness(approver);
    harness.companyRepository.findOne.mockResolvedValue({
      ...makeCompany(COMPANY_A_ID),
      createdBy: { _id: HR_ID, email: HR_EMAIL },
      pendingHrs: [pendingRequest],
    } as Company);
    return harness;
  }

  it('requires an HR currently assigned to the company to approve a request', async () => {
    const invalidApprovers = [
      makeUser(Role.USER, COMPANY_A_ID, HR_ID, HR_EMAIL),
      makeUser(Role.HR, COMPANY_B_ID, HR_ID, HR_EMAIL),
      makeUser(Role.HR, undefined, HR_ID, HR_EMAIL),
    ];

    for (const approver of invalidApprovers) {
      const harness = createApprovalHarness(approver);

      await expect(
        harness.service.approveHrRequest(
          COMPANY_A_ID,
          pendingRequest.userId,
          approver,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(harness.companyRepository.update).not.toHaveBeenCalled();
      expect(harness.usersService.updateUserCompany).not.toHaveBeenCalled();
      expect(harness.notificationService.create).not.toHaveBeenCalled();
    }
  });

  it('requires an HR currently assigned to the company to reject a request', async () => {
    const approver = makeUser(Role.HR, COMPANY_B_ID, HR_ID, HR_EMAIL);
    const harness = createApprovalHarness(approver);

    await expect(
      harness.service.rejectHrRequest(
        COMPANY_A_ID,
        pendingRequest.userId,
        approver,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(harness.companyRepository.update).not.toHaveBeenCalled();
    expect(harness.notificationService.create).not.toHaveBeenCalled();
  });

  it('allows the assigned HR creator to approve a pending request', async () => {
    const approver = makeUser(Role.HR, COMPANY_A_ID, HR_ID, HR_EMAIL);
    const harness = createApprovalHarness(approver);

    await expect(
      harness.service.approveHrRequest(
        COMPANY_A_ID,
        pendingRequest.userId,
        approver,
      ),
    ).resolves.toEqual({
      message: `Đã duyệt ${pendingRequest.name} vào công ty`,
    });

    expect(harness.companyRepository.update).toHaveBeenCalledWith(
      COMPANY_A_ID,
      { pendingHrs: [] },
    );
    expect(harness.usersService.updateUserCompany).toHaveBeenCalledWith(
      pendingRequest.userId,
      { _id: COMPANY_A_ID, name: `Company ${COMPANY_A_ID}`, isActive: true },
    );
  });

  it('allows the assigned HR creator to reject a pending request', async () => {
    const approver = makeUser(Role.HR, COMPANY_A_ID, HR_ID, HR_EMAIL);
    const harness = createApprovalHarness(approver);

    await expect(
      harness.service.rejectHrRequest(
        COMPANY_A_ID,
        pendingRequest.userId,
        approver,
      ),
    ).resolves.toEqual({
      message: `Đã từ chối yêu cầu của ${pendingRequest.name}`,
    });

    expect(harness.companyRepository.update).toHaveBeenCalledWith(
      COMPANY_A_ID,
      { pendingHrs: [] },
    );
    expect(harness.usersService.updateUserCompany).not.toHaveBeenCalled();
    expect(harness.notificationService.create).toHaveBeenCalledTimes(1);
  });
});
