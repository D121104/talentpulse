import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AiIndexBackfillService } from '../ai-indexing/services/ai-index-backfill.service';
import { runAiIndexBackfillTask } from './ai-index-backfill.task';

const CURSOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('runAiIndexBackfillTask', () => {
  it('delegates only bounded backfill options and sanitizes its result', async () => {
    const backfillAll = jest.fn().mockResolvedValue({
      scanned: 2,
      active: 1,
      inactive: 1,
      upsertEnqueued: 1,
      deleteEnqueued: 1,
      upsertSkipped: 0,
      deleteSkipped: 0,
      deleted: 0,
      expired: 1,
      missingCompany: 0,
      inactiveCompany: 0,
      inactiveJob: 1,
      notStarted: 0,
      invalidDates: 0,
      otherInactive: 0,
      cursor: CURSOR,
      nextCursor: CURSOR,
      hasMore: true,
      operationBudgetExhausted: true,
      internalDiagnostic: 'must not be emitted',
    });
    const context = {
      get: jest.fn((token: unknown) => {
        if (token === ConfigService) {
          return {
            get: jest.fn((key: string, fallback?: unknown) => {
              if (key === 'AI_INDEX_ENVIRONMENT') return 'staging';
              if (key === 'AI_INDEX_OUTBOX_ENVIRONMENT') return 'staging';
              return fallback;
            }),
          };
        }
        if (token === DataSource) return { isInitialized: true };
        if (token === AiIndexBackfillService) return { backfillAll };
        throw new Error('unexpected token');
      }),
      close: jest.fn().mockResolvedValue(undefined),
    };

    await expect(
      runAiIndexBackfillTask(
        [
          '--environment',
          'staging',
          '--cursor',
          CURSOR,
          '--limit',
          '25',
          '--max-operations',
          '50',
          '--dry-run',
        ],
        context as never,
      ),
    ).resolves.toEqual({
      scanned: 2,
      active: 1,
      inactive: 1,
      upsertEnqueued: 1,
      deleteEnqueued: 1,
      upsertSkipped: 0,
      deleteSkipped: 0,
      deleted: 0,
      expired: 1,
      missingCompany: 0,
      inactiveCompany: 0,
      inactiveJob: 1,
      notStarted: 0,
      invalidDates: 0,
      otherInactive: 0,
      cursor: CURSOR,
      nextCursor: CURSOR,
      hasMore: true,
      operationBudgetExhausted: true,
    });
    expect(backfillAll).toHaveBeenCalledWith({
      environment: 'staging',
      cursor: CURSOR,
      limit: 25,
      maxOperations: 50,
      dryRun: true,
    });
    expect(context.close).not.toHaveBeenCalled();
  });

  it('requires an operation budget so the Fargate task cannot scan unboundedly', async () => {
    const context = { get: jest.fn(), close: jest.fn() };

    await expect(
      runAiIndexBackfillTask(['--environment', 'local'], context as never),
    ).rejects.toThrow('--max-operations is required for the backfill task');
    expect(context.get).not.toHaveBeenCalled();
  });

  it('uses the existing parser to reject unbounded task arguments', async () => {
    const context = { get: jest.fn(), close: jest.fn() };

    await expect(
      runAiIndexBackfillTask(
        ['--environment', 'local', '--max-operations', '100001'],
        context as never,
      ),
    ).rejects.toThrow(
      '--max-operations must be an integer between 1 and 100000',
    );
    expect(context.get).not.toHaveBeenCalled();
  });
});
