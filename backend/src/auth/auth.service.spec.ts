import { ForbiddenException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Role } from 'src/decorator/customize';
import { User } from 'src/users/entities/user.entity';
import { IUser } from 'src/users/users.interface';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    _id: USER_ID,
    email: 'user@example.test',
    password: 'password-hash',
    name: 'User',
    role: Role.USER,
    isDeleted: false,
    isLocked: false,
    isApproved: true,
    ...overrides,
  } as User;
}

function createHarness(user: User) {
  const userRepo = {
    findOne: jest.fn().mockResolvedValue(user),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((data) => data),
    save: jest.fn().mockImplementation(async (value) => value),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const usersService = {
    checkPassword: jest.fn().mockReturnValue(true),
    hashPassword: jest.fn().mockReturnValue('hashed-password'),
  };
  const configService = {
    get: jest.fn((key: string, fallback?: string) => {
      const values: Record<string, string> = {
        JWT_SECRET: 'access-secret',
        JWT_REFRESH_SECRET: 'refresh-secret',
        JWT_ACCESS_TOKEN_SECRET: 'verification-secret',
        JWT_EXPIRES_IN: '1d',
        JWT_REFRESH_EXPIRES_IN: '7d',
        COOKIE_SAME_SITE: 'lax',
        NODE_ENV: 'test',
      };
      return values[key] ?? fallback;
    }),
  };
  const jwtService = {
    sign: jest.fn().mockReturnValue('signed-token'),
    verify: jest.fn(),
    verifyAsync: jest.fn(),
  };
  const notificationsService = { createBulk: jest.fn() };
  const redisService = {
    setValue: jest.fn(),
    getValue: jest.fn(),
    deleteValue: jest.fn(),
  };
  const mailService = {
    sendAccountVerificationEmail: jest.fn().mockResolvedValue(undefined),
  };

  const service = new AuthService(
    userRepo as never,
    configService as never,
    usersService as never,
    jwtService as never,
    notificationsService as never,
    redisService as never,
    mailService as never,
  );

  return { service, userRepo, jwtService };
}

describe('AuthService HR approval enforcement', () => {
  it.each([false, undefined, null])(
    'rejects an HR account whose isApproved value is %s during password login',
    async (isApproved) => {
      const { service } = createHarness(
        makeUser({ role: Role.HR, isApproved: isApproved as boolean }),
      );

      await expect(
        service.validateUser('user@example.test', 'password'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it('preserves candidate password login even when isApproved is false', async () => {
    const { service } = createHarness(
      makeUser({ role: Role.USER, isApproved: false }),
    );

    await expect(
      service.validateUser('user@example.test', 'password'),
    ).resolves.toMatchObject({ _id: USER_ID, role: Role.USER });
  });

  it('rejects a pending HR when the login endpoint creates a session', async () => {
    const { service, userRepo, jwtService } = createHarness(
      makeUser({ role: Role.HR, isApproved: false }),
    );
    const response = { cookie: jest.fn() };

    await expect(
      service.login(
        { _id: USER_ID, role: Role.HR } as IUser,
        response as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(userRepo.update).not.toHaveBeenCalled();
    expect(jwtService.sign).not.toHaveBeenCalled();
  });

  it('registers HR accounts as pending rather than authenticated', async () => {
    const pendingUser = makeUser({
      role: Role.HR,
      isApproved: false,
      email: 'hr@example.test',
    });
    const { service, userRepo } = createHarness(pendingUser);
    userRepo.findOne.mockResolvedValueOnce(null);
    userRepo.save.mockResolvedValueOnce(pendingUser);

    const result = await service.registerHr({
      email: 'hr@example.test',
      password: 'password123',
      name: 'Pending HR',
      role: 'HR',
    });

    expect(userRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: Role.HR, isApproved: false }),
    );
    expect(result.user).toMatchObject({ role: Role.HR, isApproved: false });
  });
});
