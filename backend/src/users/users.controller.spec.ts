import { UsersController } from './users.controller';
import { Role } from 'src/decorator/customize';
import { IUser } from './users.interface';

describe('UsersController actor forwarding', () => {
  const user = {
    _id: '11111111-1111-4111-8111-111111111111',
    email: 'user@example.test',
    name: 'User',
    role: Role.USER,
  } as IUser;

  it('passes the authenticated actor to user reads and admin lists', async () => {
    const usersService = {
      findOne: jest.fn().mockResolvedValue({}),
      findAll: jest.fn().mockResolvedValue({}),
      findAllCandidates: jest.fn().mockResolvedValue({}),
      findPendingHrs: jest.fn().mockResolvedValue([]),
    };
    const controller = new UsersController(usersService as never);

    await controller.findOne('target-user-id', user);
    await controller.findAll('current=1', user);
    await controller.findAllCandidates('current=1', user);
    await controller.findPendingHrs(user);

    expect(usersService.findOne).toHaveBeenCalledWith('target-user-id', user);
    expect(usersService.findAll).toHaveBeenCalledWith('current=1', user);
    expect(usersService.findAllCandidates).toHaveBeenCalledWith(
      'current=1',
      user,
    );
    expect(usersService.findPendingHrs).toHaveBeenCalledWith(user);
  });
});
