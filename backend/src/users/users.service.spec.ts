import { BadRequestException } from '@nestjs/common';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';
import { IUser } from './users.interface';
import { Role } from 'src/decorator/customize';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '22222222-2222-4222-8222-222222222222';
const COMPANY_ID = '33333333-3333-4333-8333-333333333333';
const FOREIGN_COMPANY_ID = '44444444-4444-4444-8444-444444444444';

type TestRequester = IUser & { createdAt: Date };

function makeRequester(role: Role): TestRequester {
  return {
    _id: role === Role.ADMIN ? ADMIN_ID : USER_ID,
    email: role === Role.ADMIN ? 'admin@example.test' : 'user@example.test',
    name: role === Role.ADMIN ? 'Admin' : 'User',
    role,
    age: 30,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function createHarness() {
  const userRepo = {
    findOne: jest.fn().mockResolvedValue({ _id: USER_ID } as User),
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

describe('UsersService.update authorization', () => {
  it('rejects a non-admin attempting to promote their own role', async () => {
    const { service, userRepo } = createHarness();

    await expect(
      service.update(USER_ID, { role: Role.ADMIN }, makeRequester(Role.USER)),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(userRepo.update).not.toHaveBeenCalled();
  });

  it('rejects a non-admin attempting to forge their company assignment', async () => {
    const { service, userRepo } = createHarness();

    await expect(
      service.update(
        USER_ID,
        {
          company: { _id: FOREIGN_COMPANY_ID, name: 'Foreign company' },
        },
        makeRequester(Role.USER),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(userRepo.update).not.toHaveBeenCalled();
  });

  it('allows an admin to update a user role and company through the intended update path', async () => {
    const { service, userRepo } = createHarness();
    const company = { _id: COMPANY_ID, name: 'Company' };

    await expect(
      service.update(
        USER_ID,
        { name: 'Updated user', role: Role.HR, company },
        makeRequester(Role.ADMIN),
      ),
    ).resolves.toEqual({ affected: 1 });

    expect(userRepo.update).toHaveBeenCalledWith(USER_ID, {
      name: 'Updated user',
      role: Role.HR,
      company,
      updatedBy: { _id: ADMIN_ID, email: 'admin@example.test' },
    });
  });

  it('preserves normal profile updates for non-admin users', async () => {
    const { service, userRepo } = createHarness();
    const requester = makeRequester(Role.USER);

    await expect(
      service.update(
        USER_ID,
        {
          email: 'updated@example.test',
          name: 'Updated user',
          age: 31,
          gender: 'female',
          address: 'Updated address',
          avatar: 'avatar.png',
        },
        requester,
      ),
    ).resolves.toEqual({ affected: 1 });

    expect(userRepo.update).toHaveBeenCalledWith(USER_ID, {
      email: 'updated@example.test',
      name: 'Updated user',
      age: 31,
      gender: 'female',
      address: 'Updated address',
      avatar: 'avatar.png',
      updatedBy: { _id: USER_ID, email: 'user@example.test' },
    });
  });

  it('does not persist sensitive fields supplied directly to the service', async () => {
    const { service, userRepo } = createHarness();
    const update = {
      name: 'Safe profile update',
      password: 'attacker-password',
      refreshToken: 'attacker-refresh-token',
      isApproved: true,
      isPremium: true,
      premiumPlan: 'HR_PREMIUM',
      isVerified: true,
      isLocked: false,
      registrationCompany: { name: 'Forged company' },
      updatedBy: { _id: ADMIN_ID, email: 'attacker@example.test' },
    } as unknown as UpdateUserDto;

    await expect(
      service.update(USER_ID, update, makeRequester(Role.USER)),
    ).resolves.toEqual({ affected: 1 });

    expect(userRepo.update).toHaveBeenCalledWith(USER_ID, {
      name: 'Safe profile update',
      updatedBy: { _id: USER_ID, email: 'user@example.test' },
    });
  });
});
