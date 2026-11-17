import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CandidateAssistantService } from 'src/candidate-assistant/candidate-assistant.service';
import { Role } from 'src/decorator/customize';
import {
  AiChatMessageRole,
  AiChatMessageStatus,
  AiChatSessionMode,
} from 'src/candidate-assistant/candidate-assistant.types';

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
  const userCVsService = {
    createCandidateAssistantSnapshot: jest.fn(),
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
      acquireLease: jest
        .fn()
        .mockImplementation((reservation, owner, context) => ({
          reservation,
          owner,
          expiresAt: new Date(Date.now() + 30_000),
          graceMs: 5_000,
          ...context,
        })),
      renewLease: jest.fn().mockResolvedValue(true),
      findExpiredLeases: jest.fn().mockResolvedValue([]),
      terminalizeLease: jest.fn().mockResolvedValue(false),
    } as any,
    { getAll: jest.fn().mockResolvedValue([]), findOne: jest.fn() } as any,
    {
      findOne: jest
        .fn()
        .mockResolvedValue({ _id: 'company-1', updatedAt: new Date() }),
    } as any,
    userCVsService,
    { generate: jest.fn() } as any,
  );
  return {
    service,
    sessionRepo,
    messageRepo,
    quotaService: (service as any).quotaService,
    aiClient: (service as any).aiClient,
    userCVsService,
  };
}
describe('CandidateAssistantService', () => {
  it('returns the raced request when quota was already reserved by another instance', async () => {
    const { service, messageRepo, quotaService, aiClient } = setup();
    const userMessage = {
      _id: 'user-raced',
      sessionId: 'session-1',
      clientMessageId: 'raced-message',
      role: AiChatMessageRole.USER,
      status: AiChatMessageStatus.COMPLETED,
      content: 'advice',
    };
    const assistantMessage = {
      _id: 'assistant-raced',
      sessionId: 'session-1',
      parentMessageId: 'user-raced',
      role: AiChatMessageRole.ASSISTANT,
      status: AiChatMessageStatus.COMPLETED,
      content: 'existing result',
    };
    quotaService.reserve.mockResolvedValue({ id: 'r', reused: true });
    messageRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(userMessage)
      .mockResolvedValueOnce(assistantMessage);

    const result = await service.sendMessage(
      'session-1',
      { content: 'advice', clientMessageId: 'raced-message' },
      user,
    );

    expect(result).toEqual({
      userMessage,
      assistantMessage,
    });
    expect(messageRepo.save).not.toHaveBeenCalled();
    expect(quotaService.acquireLease).not.toHaveBeenCalled();
    expect(quotaService.release).not.toHaveBeenCalled();
    expect(aiClient.generate).not.toHaveBeenCalled();
  });

  describe('T034 cancellation and recovery guards', () => {
    // Proposed internal T033 seam; keep missing methods as runtime RED failures,
    // rather than preventing the existing service tests from compiling.
    type LifecycleService = {
      sendMessage(
        ...args: [
          ...Parameters<CandidateAssistantService['sendMessage']>,
          AbortSignal?,
        ]
      ): ReturnType<CandidateAssistantService['sendMessage']>;
      reconcileInterruptedRequests(now: Date): Promise<void>;
    };

    const now = new Date('2026-11-17T16:00:00Z');
    const dto = { content: 'advice', clientMessageId: 'lease-guard-turn' };
    const response = {
      blocks: [{ type: 'ADVICE', text: 'late provider result' }],
      citations: [],
    };

    function lifecycleSetup() {
      const context = setup();
      const reservation = { id: 'r', reused: false };
      const lease = {
        reservation,
        owner: 'instance-a:execution-1',
        expiresAt: new Date(now.getTime() + 30_000),
        graceMs: 5_000,
        sessionId: 'session-1',
        userMessageId: 'user-turn',
        assistantMessageId: 'assistant-turn',
      };
      const rows = [
        {
          _id: lease.userMessageId,
          sessionId: lease.sessionId,
          role: AiChatMessageRole.USER,
          status: AiChatMessageStatus.COMPLETED,
          content: dto.content,
        },
        {
          _id: lease.assistantMessageId,
          sessionId: lease.sessionId,
          parentMessageId: lease.userMessageId,
          role: AiChatMessageRole.ASSISTANT,
          status: AiChatMessageStatus.PROCESSING,
          content: null,
        },
      ];
      context.messageRepo.save.mockImplementation(async (value) => {
        const stored = {
          ...value,
          _id:
            value._id ||
            (value.role === AiChatMessageRole.USER
              ? lease.userMessageId
              : lease.assistantMessageId),
        };
        const index = rows.findIndex((row) => row._id === stored._id);
        if (index === -1) rows.push(stored);
        else rows[index] = stored;
        return stored;
      });
      context.messageRepo.findOne.mockImplementation(
        async ({ where }) =>
          rows.find((row) =>
            Object.entries(where).every(([key, value]) => row[key] === value),
          ) || null,
      );
      Object.assign(context.quotaService, {
        acquireLease: jest.fn().mockResolvedValue(lease),
        renewLease: jest.fn().mockResolvedValue(true),
        findExpiredLeases: jest.fn().mockResolvedValue([lease]),
        terminalizeLease: jest.fn().mockResolvedValue(true),
      });
      return {
        ...context,
        lifecycle: context.service as unknown as LifecycleService,
        lease,
        rows,
      };
    }

    afterEach(() => jest.useRealTimers());

    it('renews the owned durable lease while an AI call is pending and stops renewing after completion', async () => {
      jest.useFakeTimers().setSystemTime(now);
      const { lifecycle, aiClient, quotaService, lease } = lifecycleSetup();
      let finish!: (value: typeof response) => void;
      const started = new Promise<void>((resolve) => {
        aiClient.generate.mockImplementation(() => {
          resolve();
          return new Promise((done) => {
            finish = done;
          });
        });
      });
      const pending = lifecycle.sendMessage('session-1', dto, user);
      await started;
      try {
        await jest.advanceTimersByTimeAsync(10_000);
        expect(quotaService.renewLease).toHaveBeenCalledWith(
          expect.objectContaining({
            ...lease.reservation,
            executionOwner: lease.owner,
          }),
          lease.owner,
        );
      } finally {
        finish(response);
        await pending;
      }
      const renewalCount = quotaService.renewLease.mock.calls.length;
      await jest.advanceTimersByTimeAsync(60_000);
      expect(quotaService.renewLease).toHaveBeenCalledTimes(renewalCount);
      expect(quotaService.commit).toHaveBeenCalledTimes(1);
      expect(quotaService.release).not.toHaveBeenCalled();
    });

    it.each([
      ['unexpired', 1],
      ['expired but inside renewal grace', -4_999],
      ['at the grace boundary', -5_000],
    ])('does not reconcile an %s lease', async (_label, offset) => {
      const { lifecycle, quotaService, lease, messageRepo, aiClient } =
        lifecycleSetup();
      lease.expiresAt = new Date(now.getTime() + Number(offset));
      await lifecycle.reconcileInterruptedRequests(now);
      expect(quotaService.terminalizeLease).not.toHaveBeenCalled();
      expect(messageRepo.save).not.toHaveBeenCalled();
      expect(quotaService.release).not.toHaveBeenCalled();
      expect(aiClient.generate).not.toHaveBeenCalled();
    });

    it.each([
      ['renewed by the live owner', AiChatMessageStatus.PROCESSING],
      ['already completed', AiChatMessageStatus.COMPLETED],
      ['already failed by another reconciler', AiChatMessageStatus.FAILED],
    ])(
      'does not change messages or release quota when the conditional transition loses: %s',
      async (_label, status) => {
        const { lifecycle, quotaService, lease, messageRepo, rows, aiClient } =
          lifecycleSetup();
        lease.expiresAt = new Date(now.getTime() - 5_001);
        rows[1].status = status as AiChatMessageStatus;
        quotaService.terminalizeLease.mockResolvedValue(false);
        await lifecycle.reconcileInterruptedRequests(now);
        expect(quotaService.terminalizeLease).toHaveBeenCalledWith(lease, now);
        expect(messageRepo.save).not.toHaveBeenCalled();
        expect(rows[0].status).toBe(AiChatMessageStatus.COMPLETED);
        expect(rows[1].status).toBe(status);
        expect(quotaService.release).not.toHaveBeenCalled();
        expect(quotaService.commit).not.toHaveBeenCalled();
        expect(aiClient.generate).not.toHaveBeenCalled();
      },
    );

    it('reconciles an expired interrupted execution once without replaying its accepted turn', async () => {
      const { lifecycle, quotaService, lease, rows, aiClient } =
        lifecycleSetup();
      lease.expiresAt = new Date(now.getTime() - 5_001);
      quotaService.terminalizeLease
        .mockImplementationOnce(async (recoveredLease) => {
          recoveredLease.reservation.executionOwner = 'recovery-owner';
          quotaService.renewLease.mockResolvedValue(false);
          return true;
        })
        .mockResolvedValue(false);
      await lifecycle.reconcileInterruptedRequests(now);
      await lifecycle.reconcileInterruptedRequests(now);
      expect(rows.find((row) => row._id === lease.userMessageId)?.status).toBe(
        AiChatMessageStatus.COMPLETED,
      );
      expect(
        rows.find((row) => row._id === lease.assistantMessageId),
      ).toMatchObject({
        status: AiChatMessageStatus.FAILED,
        content: null,
      });
      expect(quotaService.release).toHaveBeenCalledTimes(1);
      expect(quotaService.commit).not.toHaveBeenCalled();
      expect(quotaService.reserve).not.toHaveBeenCalled();
      expect(aiClient.generate).not.toHaveBeenCalled();
    });

    it.each(['resolve', 'reject'] as const)(
      'keeps cancellation terminal when an uncooperative provider later %ss',
      async (settlement) => {
        const { lifecycle, aiClient, quotaService, rows, messageRepo } =
          lifecycleSetup();
        const controller = new AbortController();
        let finish!: (value: typeof response) => void;
        let fail!: (error: Error) => void;
        const started = new Promise<void>((resolve) => {
          aiClient.generate.mockImplementation(() => {
            resolve();
            return new Promise((done, reject) => {
              finish = done;
              fail = reject;
            });
          });
        });
        const pending = lifecycle
          .sendMessage('session-1', dto, user, undefined, controller.signal)
          .then(
            () => 'completed',
            () => 'failed',
          );
        await started;
        controller.abort();
        controller.abort();
        // Let cancellation handlers run before the provider ignores the abort.
        await new Promise<void>((resolve) => setImmediate(resolve));
        const failureBeforeLateResult = rows.find(
          (row) => row.role === AiChatMessageRole.ASSISTANT,
        )?.status;
        if (settlement === 'resolve') finish(response);
        else fail(new Error('late transport rejection'));
        const outcome = await pending;
        expect(failureBeforeLateResult).toBe(AiChatMessageStatus.FAILED);
        expect(outcome).toBe('failed');
        expect(
          rows
            .filter((row) => row.role === AiChatMessageRole.USER)
            .every((row) => row.status === AiChatMessageStatus.COMPLETED),
        ).toBe(true);
        expect(
          rows.find((row) => row.role === AiChatMessageRole.ASSISTANT),
        ).toMatchObject({
          status: AiChatMessageStatus.FAILED,
          content: null,
        });
        expect(
          messageRepo.save.mock.calls.some(
            ([row]) =>
              row.role === AiChatMessageRole.ASSISTANT &&
              row.status === AiChatMessageStatus.COMPLETED,
          ),
        ).toBe(false);
        expect(quotaService.release).toHaveBeenCalledTimes(1);
        expect(quotaService.commit).not.toHaveBeenCalled();
        expect(quotaService.reserve).toHaveBeenCalledTimes(1);
        expect(aiClient.generate).toHaveBeenCalledTimes(1);
      },
    );

    it('discards an in-flight late result after another instance recovers the expired execution', async () => {
      const { lifecycle, aiClient, quotaService, lease, rows } =
        lifecycleSetup();
      let finish!: (value: typeof response) => void;
      const started = new Promise<void>((resolve) => {
        aiClient.generate.mockImplementation(() => {
          resolve();
          return new Promise((done) => {
            finish = done;
          });
        });
      });
      const pending = lifecycle.sendMessage('session-1', dto, user).then(
        () => 'completed',
        () => 'failed',
      );
      await started;
      lease.expiresAt = new Date(now.getTime() - 5_001);
      quotaService.terminalizeLease
        .mockImplementationOnce(async (recoveredLease) => {
          recoveredLease.reservation.executionOwner = 'recovery-owner';
          quotaService.renewLease.mockResolvedValue(false);
          return true;
        })
        .mockResolvedValue(false);
      try {
        await lifecycle.reconcileInterruptedRequests(now);
        await lifecycle.reconcileInterruptedRequests(now);
      } finally {
        finish(response);
        await pending;
      }
      expect(rows.find((row) => row._id === lease.userMessageId)?.status).toBe(
        AiChatMessageStatus.COMPLETED,
      );
      expect(
        rows.find((row) => row._id === lease.assistantMessageId),
      ).toMatchObject({
        status: AiChatMessageStatus.FAILED,
        content: null,
      });
      expect(quotaService.release).toHaveBeenCalledTimes(1);
      expect(quotaService.commit).not.toHaveBeenCalled();
      expect(aiClient.generate).toHaveBeenCalledTimes(1);
      expect(quotaService.reserve).toHaveBeenCalledTimes(1);
    });
  });

  it.each([
    { source: 'llm', fallbackReason: null },
    { source: 'deterministic_fallback', fallbackReason: 'provider_error' },
    {},
  ])(
    'persists provenance through response and history: %j',
    async (provenance) => {
      const { service, aiClient, messageRepo } = setup();
      aiClient.generate.mockResolvedValue({
        blocks: [{ type: 'ADVICE', text: 'ok' }],
        citations: [],
        ...provenance,
      });
      const result = await service.sendMessage(
        'session-1',
        { content: 'advice', clientMessageId: 'provenance-test' },
        user,
      );
      const expected = 'source' in provenance ? provenance : null;
      expect(result.assistantMessage.generationMetadata).toEqual(expected);
      expect(messageRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          role: AiChatMessageRole.ASSISTANT,
          generationMetadata: expected,
        }),
      );
      const qb = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([result.assistantMessage]),
      };
      messageRepo.createQueryBuilder.mockReturnValue(qb);
      const history = await service.listMessages(
        'session-1',
        { limit: 30 },
        user,
      );
      expect(history.items[0].generationMetadata).toEqual(expected);
    },
  );

  it('rejects untrusted provenance without persisting provider details', async () => {
    const { service, aiClient, messageRepo } = setup();
    aiClient.generate.mockResolvedValue({
      blocks: [{ type: 'ADVICE', text: 'ok' }],
      citations: [],
      source: 'llm',
      fallbackReason: 'provider exception containing private data',
    });
    await expect(
      service.sendMessage(
        'session-1',
        { content: 'advice', clientMessageId: 'invalid-provenance' },
        user,
      ),
    ).rejects.toThrow('AI response was invalid');
    expect(JSON.stringify(messageRepo.save.mock.calls)).not.toContain(
      'provider exception',
    );
  });

  it('resolves online selection with the authenticated owner and sends only the canonical snapshot', async () => {
    const { service, userCVsService, aiClient } = setup({
      _id: 'session-1',
      userId: user._id,
      archivedAt: null,
      mode: AiChatSessionMode.CV_ANALYSIS,
    });
    const cvId = '44444444-4444-4444-8444-444444444444';
    const snapshot = {
      cvId: '55555555-5555-4555-8555-555555555555',
      contentHash: 'current',
    };
    userCVsService.createCandidateAssistantSnapshot.mockResolvedValue(snapshot);
    aiClient.generate.mockResolvedValue({
      blocks: [{ type: 'ADVICE', text: 'ok' }],
      citations: [],
      filterState: null,
    });
    await service.sendMessage(
      'session-1',
      {
        content: 'Review my CV',
        clientMessageId: '33333333-3333-4333-8333-333333333333',
        cvId,
        cvSource: 'online',
      },
      user,
    );
    expect(
      userCVsService.createCandidateAssistantSnapshot,
    ).toHaveBeenCalledWith(user._id, cvId, 'online', user.email);
    expect(aiClient.generate).toHaveBeenCalledWith(
      expect.objectContaining({ cv: snapshot, consentVersion: 'v1' }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
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
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('persists only localized user-facing text for structured match evidence', async () => {
    const { service, aiClient, messageRepo } = setup();
    aiClient.generate.mockResolvedValue({
      blocks: [
        {
          type: 'MATCH_RESULT',
          data: { overall_score: 0.72, matched_skills: ['Node.js'] },
        },
        { type: 'ADVICE', text: 'CV có bằng chứng phù hợp.' },
      ],
      citations: [],
      filterState: null,
    });

    await service.sendMessage(
      'session-1',
      {
        content: 'find jobs',
        clientMessageId: '33333333-3333-4333-8333-333333333333',
      },
      user,
    );

    expect(messageRepo.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        content: 'CV có bằng chứng phù hợp.',
        blocks: [
          {
            type: 'MATCH_RESULT',
            text: undefined,
            data: { overall_score: 0.72, matched_skills: ['Node.js'] },
          },
          {
            type: 'ADVICE',
            text: 'CV có bằng chứng phù hợp.',
            data: undefined,
          },
        ],
      }),
    );
  });

  it('derives locale from Accept-Language when the body omits it', async () => {
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
      },
      user,
      'vi-VN,vi;q=0.9,en;q=0.8',
    );

    expect(aiClient.generate).toHaveBeenCalledWith(
      expect.objectContaining({ locale: 'vi-VN' }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('bounds persisted history entries and preserves chronological roles', async () => {
    const { service, messageRepo, aiClient } = setup();
    const newestAssistant = {
      role: AiChatMessageRole.ASSISTANT,
      content: 'assistant '.repeat(500),
    };
    const olderUser = {
      role: AiChatMessageRole.USER,
      content: 'user '.repeat(1000),
    };
    messageRepo.find.mockResolvedValue([
      newestAssistant,
      olderUser,
      { role: AiChatMessageRole.ASSISTANT, content: 'not retained' },
    ]);
    aiClient.generate.mockResolvedValue({
      blocks: [{ type: 'ADVICE', text: 'bounded response' }],
      citations: [],
      filterState: null,
    });

    await service.sendMessage(
      'session-1',
      {
        content: 'next turn',
        clientMessageId: '33333333-3333-4333-8333-333333333333',
      },
      user,
    );

    const request = (aiClient.generate as jest.Mock).mock.calls[0][0];
    expect(request.history).toEqual([
      {
        role: AiChatMessageRole.USER,
        content: olderUser.content.slice(0, 2000),
      },
      {
        role: AiChatMessageRole.ASSISTANT,
        content: newestAssistant.content.slice(0, 4000),
      },
    ]);
    expect(request.history).toHaveLength(2);
    expect(
      Math.max(...request.history.map((item) => item.content.length)),
    ).toBeLessThanOrEqual(4000);
    expect(
      request.history.reduce((total, item) => total + item.content.length, 0),
    ).toBeLessThanOrEqual(6000);
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

  it('records CV readiness failures separately from AI provider failures', async () => {
    const { service, messageRepo, aiClient, userCVsService } = setup({
      _id: 'session-1',
      userId: user._id,
      archivedAt: null,
      mode: AiChatSessionMode.CV_ANALYSIS,
    });
    userCVsService.createCandidateAssistantSnapshot.mockRejectedValue(
      new ConflictException({
        code: 'CV_NOT_READY',
        message: 'CV is not ready for AI processing',
      }),
    );

    await expect(
      service.sendMessage(
        'session-1',
        {
          content: 'review my CV',
          clientMessageId: '33333333-3333-4333-8333-333333333333',
          cvId: '44444444-4444-4444-8444-444444444444',
        },
        user,
      ),
    ).rejects.toThrow(ConflictException);

    expect(messageRepo.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: AiChatMessageStatus.FAILED,
        errorCode: 'CV_NOT_READY',
      }),
    );
    expect(aiClient.generate).not.toHaveBeenCalled();
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
      expect.objectContaining({ status: AiChatMessageStatus.COMPLETED }),
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
