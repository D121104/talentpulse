import { ForbiddenException } from '@nestjs/common';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';
import { IUser } from './users.interface';
import { Role } from 'src/decorator/customize';
import { UpdateUserPasswordDto } from './dto/update-user.dto';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '22222222-2222-4222-8222-222222222222';
const COMPANY_ID = '33333333-3333-4333-8333-333333333333';
const FOREIGN_USER_ID = '44444444-4444-4444-8444-444444444444';

type TestUser = User & {
  password: string;
  refreshToken: string;
  verificationToken: string;
  registrationCompany: { name: string; taxCode: string; scale: string };
  createdBy: { _id: string; email: string };
  updatedBy: { _id: string; email: string };
  deletedBy: { _id: string; email: string };
};

function makeRequester(role: Role, id = USER_ID): IUser {
  return {
    _id: id,
    email: role === Role.ADMIN ? 'admin@example.test' : 'user@example.test',
    name: role === Role.ADMIN ? 'Admin' : 'User',
    role,
    age: 30,
  };
}

function makeStoredUser(): TestUser {
  return {
    _id: USER_ID,
    email: 'user@example.test',
    password: 'password-hash',
    refreshToken: 'refresh-token',
    verificationToken: 'verification-token',
    name: 'User',
    role: Role.USER,
    age: 30,
    isApproved: true,
    isVerified: true,
    isPremium: false,
    registrationCompany: {
      name: 'Private company',
      taxCode: 'private-tax-code',
      scale: '10-50',
    },
    createdBy: { _id: ADMIN_ID, email: 'admin@example.test' },
    updatedBy: { _id: ADMIN_ID, email: 'admin@example.test' },
    deletedBy: { _id: ADMIN_ID, email: 'admin@example.test' },
    isLocked: true,
    lockedAt: new Date('2026-01-02T00:00:00.000Z'),
    lockedReason: 'Internal moderation note',
    isDeleted: false,
    company: { _id: COMPANY_ID, name: 'Company', isActive: true },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-03T00:00:00.000Z'),
  } as TestUser;
}

function makeQueryBuilder(users: User[], total = users.length) {
  const queryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([users, total]),
  };
  return queryBuilder;
}

function createHarness() {
  const userRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    query: jest.fn(),
    createQueryBuilder: jest.fn(),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const service = new UsersService(
    userRepo as never,
    {} as never,
    {} as never,
    {} as never,
  );

  return { service, userRepo };
}

describe('UsersService read authorization and response sanitization', () => {
  it('allows a user to read their own profile without credentials or internal fields', async () => {
    const { service, userRepo } = createHarness();
    const storedUser = makeStoredUser();
    userRepo.findOne.mockResolvedValue(storedUser);

    const result = await service.findOne(USER_ID, makeRequester(Role.USER));

    expect(result).toMatchObject({
      _id: USER_ID,
      email: 'user@example.test',
      name: 'User',
      role: Role.USER,
      createdAt: storedUser.createdAt,
      updatedAt: storedUser.updatedAt,
    });
    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('refreshToken');
    expect(result).not.toHaveProperty('verificationToken');
    expect(result).not.toHaveProperty('registrationCompany');
    expect(result).not.toHaveProperty('createdBy');
    expect(result).not.toHaveProperty('updatedBy');
    expect(result).not.toHaveProperty('deletedBy');
    expect(result).not.toHaveProperty('isLocked');
    expect(result).not.toHaveProperty('lockedReason');
  });

  it('rejects a non-admin user reading another profile at the service boundary', async () => {
    const { service, userRepo } = createHarness();

    await expect(
      service.findOne(FOREIGN_USER_ID, makeRequester(Role.USER)),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(userRepo.findOne).not.toHaveBeenCalled();
  });

  it('allows admins to read another profile with only admin-safe fields', async () => {
    const { service, userRepo } = createHarness();
    const storedUser = makeStoredUser();
    userRepo.findOne.mockResolvedValue(storedUser);

    const result = await service.findOne(USER_ID, makeRequester(Role.ADMIN));

    expect(result).toMatchObject({
      isLocked: true,
      lockedReason: 'Internal moderation note',
      registrationCompany: storedUser.registrationCompany,
    });
    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('refreshToken');
    expect(result).not.toHaveProperty('verificationToken');
    expect(result).not.toHaveProperty('createdBy');
    expect(result).not.toHaveProperty('updatedBy');
    expect(result).not.toHaveProperty('deletedBy');
  });

  it('requires an admin actor for user lists and sanitizes admin results', async () => {
    const { service, userRepo } = createHarness();
    const storedUser = makeStoredUser();
    userRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder([storedUser]));

    await expect(
      service.findAll('', makeRequester(Role.HR)),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const result = await service.findAll('', makeRequester(Role.ADMIN));
    const listedUser = result.result[0];

    expect(listedUser).toMatchObject({
      _id: USER_ID,
      isLocked: true,
      registrationCompany: storedUser.registrationCompany,
    });
    expect(listedUser).not.toHaveProperty('password');
    expect(listedUser).not.toHaveProperty('refreshToken');
    expect(listedUser).not.toHaveProperty('verificationToken');
    expect(listedUser).not.toHaveProperty('createdBy');
    expect(listedUser).not.toHaveProperty('updatedBy');
    expect(listedUser).not.toHaveProperty('deletedBy');
  });

  it('requires an admin actor for pending HR lists and sanitizes pending HR results', async () => {
    const { service, userRepo } = createHarness();
    const storedUser = makeStoredUser();
    userRepo.find.mockResolvedValue([storedUser]);

    await expect(
      service.findPendingHrs(makeRequester(Role.HR)),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const result = await service.findPendingHrs(makeRequester(Role.ADMIN));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      _id: USER_ID,
      registrationCompany: storedUser.registrationCompany,
    });
    expect(result[0]).not.toHaveProperty('password');
    expect(result[0]).not.toHaveProperty('refreshToken');
    expect(result[0]).not.toHaveProperty('verificationToken');
    expect(result[0]).not.toHaveProperty('createdBy');
    expect(result[0]).not.toHaveProperty('updatedBy');
    expect(result[0]).not.toHaveProperty('deletedBy');
  });

  it('sanitizes company roster reads before returning them to other services', async () => {
    const { service, userRepo } = createHarness();
    const storedUser = makeStoredUser();
    userRepo.query.mockResolvedValue([storedUser]);

    const result = await service.findAllByCompanyId(COMPANY_ID);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      _id: USER_ID,
      company: storedUser.company,
    });
    expect(result[0]).not.toHaveProperty('password');
    expect(result[0]).not.toHaveProperty('refreshToken');
    expect(result[0]).not.toHaveProperty('verificationToken');
    expect(result[0]).not.toHaveProperty('registrationCompany');
    expect(result[0]).not.toHaveProperty('createdBy');
  });
});

describe('UsersService.updatePassword', () => {
  it('changes the password and revokes the stored refresh token in one update', async () => {
    const { service, userRepo } = createHarness();
    userRepo.findOne.mockResolvedValue({
      _id: USER_ID,
      password: 'current-password-hash',
      refreshToken: 'active-refresh-token',
    } as User);
    jest.spyOn(service, 'checkPassword').mockReturnValue(true);
    jest.spyOn(service, 'hashPassword').mockReturnValue('new-password-hash');

    await expect(
      service.updatePassword(USER_ID, {
        currentPassword: 'current-password',
        newPassword: 'new-password',
        password: 'new-password',
      } as UpdateUserPasswordDto),
    ).resolves.toEqual({ affected: 1 });

    expect(userRepo.update).toHaveBeenCalledWith(USER_ID, {
      password: 'new-password-hash',
      refreshToken: null,
    });
  });
});
