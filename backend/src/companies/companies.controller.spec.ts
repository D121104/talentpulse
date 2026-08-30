import { Role, ROLES_KEY } from '../decorator/customize';
import { IUser } from '../users/users.interface';
import { CompaniesController } from './companies.controller';

const COMPANY_ID = '11111111-1111-4111-8111-111111111111';

type TestUser = IUser & { createdAt: Date };

function makeUser(role: Role, companyId?: string): TestUser {
  return {
    _id: '33333333-3333-4333-8333-333333333333',
    email: 'hr@example.test',
    name: 'HR',
    role,
    age: 30,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...(companyId ? { company: { _id: companyId, name: 'Company' } } : {}),
  };
}

describe('CompaniesController company roster endpoints', () => {
  it('forwards the administrative listing query and restricts the route to admins', async () => {
    const companiesService = {
      getAllByAdmin: jest.fn().mockResolvedValue({ meta: {}, result: [] }),
    };
    const controller = new CompaniesController(companiesService as never);
    const query = { current: '2', pageSize: '8', name: 'Acme' };

    await controller.getAllByAdmin(query);

    expect(companiesService.getAllByAdmin).toHaveBeenCalledWith(query);
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        CompaniesController.prototype.getAllByAdmin,
      ),
    ).toEqual([Role.ADMIN]);
  });

  it('forwards the public company detail id without an authenticated actor', async () => {
    const companiesService = {
      findOne: jest.fn().mockResolvedValue({}),
    };
    const controller = new CompaniesController(companiesService as never);

    await controller.findOne(COMPANY_ID);

    expect(companiesService.findOne).toHaveBeenCalledWith(COMPANY_ID);
    expect(
      Reflect.getMetadata(ROLES_KEY, CompaniesController.prototype.findOne),
    ).toBeUndefined();
  });

  it('forwards the authenticated actor to both roster service methods', async () => {
    const companiesService = {
      getCompanyHrs: jest.fn().mockResolvedValue([]),
      getPendingHrs: jest.fn().mockResolvedValue([]),
    };
    const controller = new CompaniesController(companiesService as never);
    const user = makeUser(Role.HR, COMPANY_ID);

    await controller.getCompanyHrs(COMPANY_ID, user);
    await controller.getPendingHrs(COMPANY_ID, user);

    expect(companiesService.getCompanyHrs).toHaveBeenCalledWith(
      COMPANY_ID,
      user,
    );
    expect(companiesService.getPendingHrs).toHaveBeenCalledWith(
      COMPANY_ID,
      user,
    );
  });

  it('preserves ADMIN/HR role metadata on both protected endpoints', () => {
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        CompaniesController.prototype.getCompanyHrs,
      ),
    ).toEqual([Role.ADMIN, Role.HR]);
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        CompaniesController.prototype.getPendingHrs,
      ),
    ).toEqual([Role.HR, Role.ADMIN]);
  });
});
