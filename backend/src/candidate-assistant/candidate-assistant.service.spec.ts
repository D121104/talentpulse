import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CandidateAssistantService } from './candidate-assistant.service';
import { Role } from 'src/decorator/customize';
import {
  AiChatMessageRole,
  AiChatMessageStatus,
  AiChatSessionMode,
} from './candidate-assistant.types';

const user = {
  _id: '11111111-1111-4111-8111-111111111111',
  role: Role.USER,
  email: 'user@example.test',
} as any;
const hr = {
  _id: '22222222-2222-4222-8222-222222222222',
  role: Role.HR,
} as any;
const admin = {
  _id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  role: Role.ADMIN,
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
    {
      findOne: jest
        .fn()
        .mockResolvedValue({ _id: 'company-1', updatedAt: new Date() }),
    } as any,
    { createCandidateAssistantSnapshot: jest.fn() } as any,
    { generate: jest.fn() } as any,
  );
  return {
    service,
    sessionRepo,
    messageRepo,
    quotaService: (service as any).quotaService,
    aiClient: (service as any).aiClient,
  };
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
  it('normalizes frontend filter names before calling the AI client', async () => {
    const { service, aiClient } = setup();
    (aiClient.generate as jest.Mock).mockResolvedValue({
      blocks: [{ type: 'ADVICE', text: 'ok' }],
      citations: [],
      filterState: null,
    });
    await service.sendMessage(
      'session-1',
      {
        content: 'find jobs',
        clientMessageId: '33333333-3333-4333-8333-333333333333',
        filters: {
          workMode: 'remote',
          experienceLevel: 'senior',
          minSalary: 100,
          maxSalary: 200,
        },
      },
      user,
    );
    expect(aiClient.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: {
          work_mode: 'remote',
          experience_level: 'senior',
          salary_min: 100,
          salary_max: 200,
        },
      }),
    );
  });

  it('requires one selected active job and an owned CV for comparison', async () => {
    const { service, quotaService } = setup({
      _id: 'session-1',
      userId: user._id,
      archivedAt: null,
      mode: AiChatSessionMode.CV_JOB_COMPARISON,
    });
    await expect(
      service.sendMessage(
        'session-1',
        {
          content: 'compare',
          clientMessageId: '33333333-3333-4333-8333-333333333333',
        },
        user,
      ),
    ).rejects.toThrow('requires exactly one active job');
    expect(quotaService.release).toHaveBeenCalled();
  });

  it('rejects quota access for HR users', async () => {
    const { service } = setup();
    await expect(service.getQuota(hr)).rejects.toThrow(ForbiddenException);
  });

  it('allows ADMIN to create and use the assistant without candidate consent', async () => {
    const { service, messageRepo, aiClient } = setup({
      _id: 'session-1',
      userId: admin._id,
      archivedAt: null,
      mode: AiChatSessionMode.ADVICE,
    });
    const consentService = (service as any).consentService;
    consentService.hasValidConsent.mockResolvedValue(false);
    aiClient.generate.mockResolvedValue({
      blocks: [{ type: 'ADVICE', text: 'admin response' }],
      citations: [],
      filterState: null,
    });

    await expect(
      service.createSession({ mode: AiChatSessionMode.ADVICE }, admin),
    ).resolves.toMatchObject({ userId: admin._id });
    await expect(
      service.sendMessage(
        'session-1',
        {
          content: 'admin question',
          clientMessageId: '33333333-3333-4333-8333-333333333333',
        },
        admin,
      ),
    ).resolves.toMatchObject({
      assistantMessage: { content: 'admin response' },
    });
    expect(consentService.hasValidConsent).not.toHaveBeenCalled();
    expect(messageRepo.create).toHaveBeenCalled();
  });

  it('keeps requiring consent for USER sessions', async () => {
    const { service } = setup();
    const consentService = (service as any).consentService;
    consentService.hasValidConsent.mockResolvedValue(false);

    await expect(
      service.createSession({ mode: AiChatSessionMode.ADVICE }, user),
    ).rejects.toMatchObject({
      response: { code: 'AI_CONSENT_REQUIRED' },
    });
  });

  it('reuses the same reservation key when retrying a failed assistant response', async () => {
    const { service, messageRepo, quotaService, aiClient } = setup();
    const existing = {
      _id: 'm1',
      sessionId: 'session-1',
      clientMessageId: '33333333-3333-4333-8333-333333333333',
      role: AiChatMessageRole.USER,
    };
    const failedAssistant = {
      _id: 'assistant-1',
      sessionId: 'session-1',
      parentMessageId: 'm1',
      role: AiChatMessageRole.ASSISTANT,
      status: AiChatMessageStatus.FAILED,
    };
    messageRepo.findOne
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(failedAssistant);
    quotaService.reserve.mockResolvedValue({
      id: 'r2',
      reused: false,
      reservationKey: 'session-1:33333333-3333-4333-8333-333333333333',
    });
    aiClient.generate.mockResolvedValue({
      blocks: [{ type: 'ADVICE', text: 'retry succeeded' }],
      citations: [],
      filterState: null,
    });

    await service.sendMessage(
      'session-1',
      {
        content: 'retry',
        clientMessageId: existing.clientMessageId,
      },
      user,
    );

    expect(quotaService.reserve).toHaveBeenCalledWith(
      user._id,
      `session-1:${existing.clientMessageId}`,
    );
    expect(quotaService.commit).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'r2', reused: false }),
      'assistant-1',
    );
    expect(quotaService.release).not.toHaveBeenCalled();
    expect(aiClient.generate).toHaveBeenCalledTimes(1);
    expect(messageRepo.create).not.toHaveBeenCalled();
    expect(messageRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: failedAssistant._id,
        parentMessageId: existing._id,
        status: AiChatMessageStatus.COMPLETED,
      }),
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
