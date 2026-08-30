import { ForbiddenException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { Role } from 'src/decorator/customize';
import { User } from 'src/users/entities/user.entity';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function createStrategy(user: User) {
  const userRepo = {
    findOne: jest.fn().mockResolvedValue(user),
  };
  const configService = {
    get: jest.fn().mockReturnValue('access-secret'),
  };

  return {
    strategy: new JwtStrategy(configService as never, userRepo as never),
    userRepo,
  };
}

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

describe('JwtStrategy HR approval enforcement', () => {
  it.each([false, undefined, null])(
    'rejects an HR JWT when isApproved is %s',
    async (isApproved) => {
      const { strategy } = createStrategy(
        makeUser({ role: Role.HR, isApproved: isApproved as boolean }),
      );

      await expect(
        strategy.validate({ _id: USER_ID } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it('continues to authenticate approved HR accounts', async () => {
    const { strategy } = createStrategy(
      makeUser({ role: Role.HR, isApproved: true }),
    );

    await expect(
      strategy.validate({ _id: USER_ID } as never),
    ).resolves.toMatchObject({
      _id: USER_ID,
      role: Role.HR,
      isApproved: true,
    });
  });

  it('continues to authenticate candidate accounts', async () => {
    const { strategy } = createStrategy(
      makeUser({ role: Role.USER, isApproved: false }),
    );

    await expect(
      strategy.validate({ _id: USER_ID } as never),
    ).resolves.toMatchObject({ _id: USER_ID, role: Role.USER });
  });
});
