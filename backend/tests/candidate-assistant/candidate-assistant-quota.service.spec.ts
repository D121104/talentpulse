import { CandidateAssistantQuotaService } from 'src/candidate-assistant/candidate-assistant-quota.service';
describe('CandidateAssistantQuotaService', () => {
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
      { transaction: jest.fn((fn) => fn(manager)) } as any,
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
      { transaction: jest.fn((fn) => fn(manager)) } as any,
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
