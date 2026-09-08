import { CandidateAssistantIntegrity20260908100000 } from './migrations/20260908100000-CandidateAssistantIntegrity';

describe('CandidateAssistantIntegrity migration', () => {
  it('restricts deletion of messages referenced by quota ledger rows', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new CandidateAssistantIntegrity20260908100000();

    await migration.up({ query } as any);

    const quotaForeignKeySql = query.mock.calls
      .map(([sql]) => sql as string)
      .find((sql) => sql.includes('FK_ai_chat_quota_ledger_message'));

    expect(quotaForeignKeySql).toBeDefined();
    expect(quotaForeignKeySql).toContain('ON DELETE RESTRICT');
    expect(quotaForeignKeySql).not.toContain('ON DELETE SET NULL');
    expect(quotaForeignKeySql).toContain(`"status" = 'COMMITTED'`);
    expect(quotaForeignKeySql).toContain(`"messageId" IS NOT NULL`);
  });
});
