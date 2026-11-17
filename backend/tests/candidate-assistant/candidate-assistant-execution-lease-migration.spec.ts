import { CandidateAssistantExecutionLeases20261117150000 } from 'src/database/migrations/20261117150000-CandidateAssistantExecutionLeases';

describe('CandidateAssistantExecutionLeases migration', () => {
  it('adds only backward-compatible nullable lease metadata and an expiry index', async () => {
    const queryRunner = { query: jest.fn().mockResolvedValue([]) } as any;

    await new CandidateAssistantExecutionLeases20261117150000().up(queryRunner);

    expect(queryRunner.query).toHaveBeenCalledTimes(2);
    expect(queryRunner.query.mock.calls[0][0]).toContain(
      'ADD COLUMN IF NOT EXISTS "executionOwner" uuid NULL',
    );
    expect(queryRunner.query.mock.calls[0][0]).toContain(
      'ADD COLUMN IF NOT EXISTS "leaseExpiresAt" timestamptz NULL',
    );
    expect(queryRunner.query.mock.calls[1][0]).toContain(
      "WHERE \"status\" = 'RESERVED' AND \"leaseExpiresAt\" IS NOT NULL",
    );
  });

  it('refuses rollback while durable execution leases remain active', async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue([{ has_active_leases: true }]),
    } as any;

    await expect(
      new CandidateAssistantExecutionLeases20261117150000().down(queryRunner),
    ).rejects.toThrow('Reconcile active candidate assistant leases before rollback.');
    expect(queryRunner.query).toHaveBeenCalledTimes(1);
  });

  it('drops the additive columns after leases have been reconciled', async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue([{ has_active_leases: false }]),
    } as any;

    await new CandidateAssistantExecutionLeases20261117150000().down(queryRunner);

    expect(queryRunner.query).toHaveBeenCalledTimes(3);
    expect(queryRunner.query.mock.calls[2][0]).toContain(
      'DROP COLUMN IF EXISTS "executionOwner"',
    );
  });
});
