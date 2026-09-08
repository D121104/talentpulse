import 'reflect-metadata';
import { CandidateAssistantController } from './candidate-assistant.controller';
import { Role, ROLES_KEY } from 'src/decorator/customize';

describe('CandidateAssistantController', () => {
  it('protects quota access with JWT and candidate role guards', async () => {
    const service = {
      getQuota: jest.fn().mockResolvedValue({ remaining: 10 }),
    };
    const controller = new CandidateAssistantController(service as any);

    await expect(
      controller.quota({ _id: 'user-1', role: Role.USER } as any),
    ).resolves.toEqual({ remaining: 10 });
    expect(service.getQuota).toHaveBeenCalledWith({
      _id: 'user-1',
      role: Role.USER,
    });
    expect(
      Reflect.getMetadata(ROLES_KEY, CandidateAssistantController),
    ).toEqual([Role.USER, Role.ADMIN]);
    expect(
      Reflect.getMetadata('__guards__', CandidateAssistantController),
    ).toHaveLength(2);
  });
});
