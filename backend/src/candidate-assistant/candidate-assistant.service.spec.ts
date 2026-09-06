import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CandidateAssistantService } from './candidate-assistant.service';
import { Role } from 'src/decorator/customize';
import { AiChatMessageRole } from './candidate-assistant.types';

const user = {
  _id: '11111111-1111-4111-8111-111111111111',
  role: Role.USER,
  email: 'user@example.test',
} as any;
const hr = {
  _id: '22222222-2222-4222-8222-222222222222',
  role: Role.HR,
} as any;
function setup(
  session: any = {
    _id: 'session-1',
    userId: user._id,
    archivedAt: null,
    mode: 'ADVICE',
  },
) {
  const sessionRepo = {
    findOne: jest
      .fn()
      .mockImplementation(async (options: any) =>
        options?.where?.userId === session.userId ? session : null,
      ),
    save: jest.fn((value) => Promise.resolve(value)),
    create: jest.fn((value) => value),
    find: jest.fn(),
  } as any;
  const messageRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn((value) =>
      Promise.resolve({ ...value, _id: value._id || 'message-1' }),
    ),
    create: jest.fn((value) => value),
    find: jest.fn().mockResolvedValue([]),
    createQueryBuilder: jest.fn(),
  } as any;
  const service = new CandidateAssistantService(
    sessionRepo,
    messageRepo,
    {
      hasValidConsent: jest.fn().mockResolvedValue(true),
      getActivePolicy: jest.fn().mockReturnValue({ consentVersion: 'v1' }),
    } as any,
    {
      reserve: jest.fn().mockResolvedValue({ id: 'r', reused: false }),
      commit: jest.fn(),
      release: jest.fn(),
    } as any,
    { getAll: jest.fn().mockResolvedValue([]), findOne: jest.fn() } as any,
    { createCandidateAssistantSnapshot: jest.fn() } as any,
    { generate: jest.fn() } as any,
  );
  return { service, sessionRepo, messageRepo };
}
describe('CandidateAssistantService', () => {
  it('rejects HR before reading a session', async () => {
    const { service, sessionRepo } = setup();
    await expect(service.listSessions(hr)).rejects.toThrow(ForbiddenException);
    expect(sessionRepo.find).not.toHaveBeenCalled();
  });
  it('rejects access to another owner as not found', async () => {
    const { service } = setup({
      _id: 'session-1',
      userId: 'other-user',
      archivedAt: null,
      mode: 'ADVICE',
    });
    await expect(service.archiveSession('session-1', user)).rejects.toThrow(
      NotFoundException,
    );
  });
  it('returns the stored message for an idempotent client message', async () => {
    const { service, messageRepo } = setup();
    const existing = {
      _id: 'm1',
      sessionId: 'session-1',
      clientMessageId: '33333333-3333-4333-8333-333333333333',
      role: AiChatMessageRole.USER,
    };
    messageRepo.findOne.mockResolvedValue(existing);
    await expect(
      service.sendMessage(
        'session-1',
        { content: 'hello', clientMessageId: existing.clientMessageId },
        user,
      ),
    ).resolves.toMatchObject({ userMessage: existing });
  });
});
