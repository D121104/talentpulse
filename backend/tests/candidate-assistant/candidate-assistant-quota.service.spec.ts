import { CandidateAssistantQuotaService } from 'src/candidate-assistant/candidate-assistant-quota.service';
import { AiChatQuotaLedger } from 'src/candidate-assistant/entities/ai-chat-quota-ledger.entity';
describe('CandidateAssistantQuotaService', () => {
  const now = new Date('2026-11-02T00:00:00Z');

  it.each([0, 2, null])(
    'enforces configured quota %s against persisted reservation state',
    async (limit) => {
      const rows = [];
      const repo = {
        findOne: async ({ where }) =>
          rows.find((row) => row.reservationKey === where.reservationKey),
        count: async () => rows.length,
        create: (value) => ({ ...value, _id: String(rows.length) }),
        save: async (value) => {
          rows.push(value);
          return value;
        },
      };
      const service = new CandidateAssistantQuotaService(
        repo as any,
        {
          getRepository: () => ({
            findOne: async () => ({ chatbotDailyLimit: limit }),
          }),
          transaction: async (fn) =>
            fn({ query: async () => undefined, getRepository: () => repo }),
        } as any,
        { findOne: async () => ({ role: 'USER', isPremium: false }) } as any,
      );
      for (let i = 0; i < 3; i++) {
        const result = service.reserve('user', String(i), now);
        if (limit !== null && i >= limit)
          await expect(result).rejects.toMatchObject({ status: 429 });
        else await expect(result).resolves.toMatchObject({ reused: false });
      }
      await expect(service.getQuota('user', now)).resolves.toMatchObject({
        limit,
        usedToday: limit === null ? 3 : limit,
        remaining: limit === null ? null : 0,
      });
      if (rows.length)
        await expect(service.reserve('user', '0', now)).resolves.toMatchObject({
          reused: true,
        });
      expect(rows).toHaveLength(limit === null ? 3 : limit);
    },
  );

  it.each([
    ['Free', { isPremium: false }, 10],
    [
      'valid Premium',
      {
        isPremium: true,
        premiumPlan: 'CANDIDATE_PREMIUM',
        premiumExpiresAt: new Date('2026-12-01'),
      },
      null,
    ],
    [
      'expired Premium',
      {
        isPremium: true,
        premiumPlan: 'CANDIDATE_PREMIUM',
        premiumExpiresAt: now,
      },
      10,
    ],
    [
      'Premium without expiry',
      { isPremium: true, premiumPlan: 'CANDIDATE_PREMIUM' },
      10,
    ],
    [
      'wrong plan',
      {
        isPremium: true,
        premiumPlan: 'HR_PREMIUM',
        premiumExpiresAt: new Date('2026-12-01'),
      },
      10,
    ],
  ])('reports the daily policy for %s', async (_name, subscription, limit) => {
    const service = new CandidateAssistantQuotaService(
      { count: jest.fn().mockResolvedValue(150) } as any,
      {
        getRepository: () => ({
          findOne: async () => ({ chatbotDailyLimit: limit }),
        }),
      } as any,
      {
        findOne: jest.fn().mockResolvedValue({
          role: 'USER',
          premiumPackageId: '11111111-1111-4111-8111-111111111111',
          ...subscription,
        }),
      } as any,
    );
    await expect(service.getQuota('user-1', now)).resolves.toMatchObject({
      usedToday: 150,
      limit,
      remaining: limit === null ? null : 0,
      isUnlimited: limit === null,
    });
  });

  it.each([
    [false, 9],
    [false, 10],
    [false, 150],
    [true, 150],
  ])(
    'enforces Free cap but records unlimited Premium requests (premium=%s, used=%s)',
    async (isPremium, used) => {
      const repo = {
        findOne: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(used),
        create: jest.fn((value) => ({ ...value, _id: 'r1' })),
        save: jest.fn(async (value) => value),
      };
      const manager = { query: jest.fn(), getRepository: () => repo };
      const service = new CandidateAssistantQuotaService(
        {} as any,
        {
          transaction: async (fn) => fn(manager),
          getRepository: () => ({
            findOne: async () => ({ chatbotDailyLimit: isPremium ? null : 10 }),
          }),
        } as any,
        {
          findOne: async () => ({
            role: 'USER',
            premiumPackageId: '11111111-1111-4111-8111-111111111111',
            isPremium,
            premiumPlan: 'CANDIDATE_PREMIUM',
            premiumExpiresAt: new Date('2026-12-01'),
          }),
        } as any,
      );
      const result = service.reserve('user-1', 'key', now);
      if (isPremium || used < 10) {
        await expect(result).resolves.toMatchObject({
          id: 'r1',
          reused: false,
        });
        expect(repo.save).toHaveBeenCalledTimes(1);
        if (isPremium) expect(repo.count).not.toHaveBeenCalled();
      } else {
        await expect(result).rejects.toMatchObject({ status: 429 });
        expect(repo.save).not.toHaveBeenCalled();
      }
    },
  );

  it('rejects HR quota access at the quota service boundary', async () => {
    const service = new CandidateAssistantQuotaService(
      {} as any,
      {} as any,
      { findOne: jest.fn().mockResolvedValue({ role: 'HR' }) } as any,
    );

    await expect(service.getQuota('user-1')).rejects.toMatchObject({
      status: 403,
      response: { code: 'CANDIDATE_ASSISTANT_FORBIDDEN' },
    });
  });

  it('uses UTC+7 date boundaries', async () => {
    const manager = {
      query: jest.fn(),
      getRepository: jest.fn().mockReturnValue({
        findOne: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn((v) => ({ ...v, _id: 'r1' })),
        save: jest.fn((v) => Promise.resolve(v)),
      }),
    };
    const service = new CandidateAssistantQuotaService(
      {} as any,
      {
        transaction: jest.fn((fn) => fn(manager)),
        getRepository: () => ({
          findOne: async () => ({ chatbotDailyLimit: 10 }),
        }),
      } as any,
      {
        findOne: jest
          .fn()
          .mockResolvedValue({ role: 'USER', isPremium: false }),
      } as any,
    );
    await expect(
      service.reserve(
        '11111111-1111-4111-8111-111111111111',
        'k',
        new Date('2026-01-01T16:59:59.000Z'),
      ),
    ).resolves.toMatchObject({ quotaDate: '2026-01-01' });
    await expect(
      service.reserve(
        '11111111-1111-4111-8111-111111111111',
        'k2',
        new Date('2026-01-01T17:00:00.000Z'),
      ),
    ).resolves.toMatchObject({ quotaDate: '2026-01-02' });
  });

  it('acquires and renews a request-owned lease with bounded expiry', async () => {
    const ledger = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
    const service = new CandidateAssistantQuotaService(
      ledger as any,
      {} as any,
      {} as any,
    );
    const reservation: {
      id: string;
      userId: string;
      quotaDate: string;
      reservationKey: string;
      reused: boolean;
      executionOwner?: string;
    } = {
      id: 'reservation-1',
      userId: 'user-1',
      quotaDate: '2026-11-17',
      reservationKey: 'session-1:message-1',
      reused: false,
    };
    const context = {
      sessionId: 'session-1',
      userMessageId: 'user-message-1',
      assistantMessageId: 'assistant-message-1',
    };

    const lease = await service.acquireLease(
      reservation,
      'execution-owner',
      context,
      now,
    );

    expect(lease).toMatchObject({
      owner: 'execution-owner',
      expiresAt: new Date(now.getTime() + 30_000),
      graceMs: 5_000,
      ...context,
    });
    expect(reservation.executionOwner).toBe('execution-owner');
    expect(ledger.update).toHaveBeenCalledWith(
      expect.objectContaining({
        executionOwner: expect.objectContaining({ _type: 'isNull' }),
      }),
      expect.objectContaining({
        executionOwner: 'execution-owner',
        leaseExpiresAt: new Date(now.getTime() + 30_000),
      }),
    );

    ledger.update.mockResolvedValueOnce({ affected: 1 });
    await expect(
      service.renewLease(reservation, 'execution-owner', now),
    ).resolves.toBe(true);
    expect(ledger.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ executionOwner: 'execution-owner' }),
      expect.objectContaining({
        leaseExpiresAt: new Date(now.getTime() + 30_000),
      }),
    );
    ledger.update.mockResolvedValueOnce({ affected: 0 });
    await expect(
      service.renewLease(reservation, 'stale-owner', now),
    ).resolves.toBe(false);
  });

  it('only returns leases beyond expiry grace and conditionally claims recovery', async () => {
    const row = {
      _id: 'reservation-1',
      userId: 'user-1',
      quotaDate: '2026-11-17',
      reservationKey: 'session-1:message-1',
      status: 'RESERVED',
      executionOwner: 'execution-owner',
      leaseExpiresAt: new Date(now.getTime() - 5_001),
      executionSessionId: 'session-1',
      executionUserMessageId: 'user-message-1',
      executionAssistantMessageId: 'assistant-message-1',
    };
    const ledger = {
      find: jest.fn().mockResolvedValue([row]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const service = new CandidateAssistantQuotaService(
      ledger as any,
      {} as any,
      {} as any,
    );

    const leases = await service.findExpiredLeases(now);

    expect(ledger.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'RESERVED',
          leaseExpiresAt: expect.objectContaining({ _type: 'lessThan' }),
        }),
        take: 100,
      }),
    );
    expect(leases).toHaveLength(1);
    expect(await service.terminalizeLease(leases[0], now)).toBe(true);
    expect(ledger.update).toHaveBeenCalledWith(
      expect.objectContaining({
        executionOwner: 'execution-owner',
        leaseExpiresAt: expect.objectContaining({ _type: 'lessThanOrEqual' }),
      }),
      expect.objectContaining({ executionOwner: expect.any(String) }),
    );
    expect(leases[0].owner).not.toBe('execution-owner');

    ledger.update.mockResolvedValueOnce({ affected: 0 });
    expect(await service.terminalizeLease(leases[0], now)).toBe(false);
  });

  it('commits quota and assistant terminal state in one transaction', async () => {
    const ledger = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
    const messages = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
    const manager = {
      getRepository: (entity) =>
        entity === AiChatQuotaLedger ? ledger : messages,
    };
    const dataSource = { transaction: (callback) => callback(manager) };
    const service = new CandidateAssistantQuotaService(
      {} as any,
      dataSource as any,
      {} as any,
    );
    const reservation = {
      id: 'reservation-1',
      userId: 'user-1',
      quotaDate: '2026-11-17',
      reservationKey: 'session-1:message-1',
      executionOwner: 'execution-owner',
      reused: false,
    };

    await expect(
      service.commit(reservation, 'assistant-message-1', {
        _id: 'assistant-message-1',
        status: 'COMPLETED' as any,
        content: 'Synthetic answer',
      }),
    ).resolves.toBe(true);

    expect(ledger.update).toHaveBeenCalledWith(
      expect.objectContaining({ executionOwner: 'execution-owner' }),
      expect.objectContaining({ status: 'COMMITTED' }),
    );
    expect(messages.update).toHaveBeenCalledWith(
      { _id: 'assistant-message-1', status: 'PROCESSING' },
      expect.objectContaining({ status: 'COMPLETED' }),
    );
  });

  it('does not persist a late assistant result after lease ownership is lost', async () => {
    const ledger = { update: jest.fn().mockResolvedValue({ affected: 0 }) };
    const messages = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
    const manager = {
      getRepository: (entity) =>
        entity === AiChatQuotaLedger ? ledger : messages,
    };
    const service = new CandidateAssistantQuotaService(
      {} as any,
      { transaction: (callback) => callback(manager) } as any,
      {} as any,
    );

    await expect(
      service.commit(
        {
          id: 'reservation-1',
          userId: 'user-1',
          quotaDate: '2026-11-17',
          reservationKey: 'session-1:message-1',
          executionOwner: 'stale-owner',
          reused: false,
        },
        'assistant-message-1',
        {
          _id: 'assistant-message-1',
          status: 'COMPLETED' as any,
        },
      ),
    ).resolves.toBe(false);
    expect(ledger.update).toHaveBeenCalledWith(
      expect.objectContaining({ executionOwner: 'stale-owner' }),
      expect.objectContaining({ status: 'COMMITTED' }),
    );
    expect(messages.update).not.toHaveBeenCalled();
  });

  it('reuses a released reservation row without counting it twice', async () => {
    const row = {
      _id: 'reservation-1',
      userId: '11111111-1111-4111-8111-111111111111',
      quotaDate: '2026-01-01',
      reservationKey: 'session-1:message-1',
      status: 'RELEASED',
      errorCode: 'AI_SERVICE_TIMEOUT',
      finalizedAt: new Date('2026-01-01T00:00:00.000Z'),
      messageId: null,
    };
    const repo = {
      findOne: jest.fn().mockResolvedValue(row),
      count: jest.fn().mockResolvedValue(0),
      save: jest.fn((value) => Promise.resolve(value)),
    };
    const manager = {
      query: jest.fn(),
      getRepository: jest.fn().mockReturnValue(repo),
    };
    const service = new CandidateAssistantQuotaService(
      {} as any,
      {
        transaction: jest.fn((fn) => fn(manager)),
        getRepository: () => ({
          findOne: async () => ({ chatbotDailyLimit: 10 }),
        }),
      } as any,
      {
        findOne: jest
          .fn()
          .mockResolvedValue({ role: 'USER', isPremium: false }),
      } as any,
    );

    const first = await service.reserve(
      row.userId,
      row.reservationKey,
      new Date('2026-01-01T00:00:00.000Z'),
    );
    const second = await service.reserve(
      row.userId,
      row.reservationKey,
      new Date('2026-01-01T00:00:00.000Z'),
    );

    expect(first).toMatchObject({ id: row._id, reused: false });
    expect(second).toMatchObject({ id: row._id, reused: true });
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(row).toMatchObject({
      status: 'RESERVED',
      errorCode: null,
      finalizedAt: null,
      messageId: null,
    });
  });
});
