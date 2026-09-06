import { CandidateAssistantQuotaService } from './candidate-assistant-quota.service';
describe('CandidateAssistantQuotaService', () => {
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
});
