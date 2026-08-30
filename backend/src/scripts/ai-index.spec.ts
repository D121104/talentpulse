import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AiServiceClient } from '../ai-client/ai-client.service';
import { AiProviderAttemptRecorderToken } from '../ai-client/ai-provider-attempt.contracts';
import { AiIndexBackfillService } from '../ai-indexing/services/ai-index-backfill.service';
import { AiIndexReplayService } from '../ai-indexing/services/ai-index-replay.service';
import { AiIndexDrainService } from '../ai-indexing/services/ai-index-drain.service';
import { AiIndexReconcileService } from '../ai-indexing/services/ai-index-reconcile.service';
import { parseAiIndexArguments, runAiIndexCommand } from './ai-index';

const UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('parseAiIndexArguments', () => {
  it('parses the bounded Qdrant reconciliation command', () => {
    expect(
      parseAiIndexArguments([
        'reconcile-qdrant',
        '--environment',
        'local',
        '--cursor',
        UUID,
        '--scan-run-id',
        UUID,
        '--limit',
        '10',
      ]),
    ).toEqual({
      command: 'reconcile-qdrant',
      environment: 'local',
      cursor: UUID,
      scanRunId: UUID,
      limit: 10,
    });
  });

  it('parses max operations with dry-run for backfill', () => {
    expect(
      parseAiIndexArguments([
        'backfill',
        '--environment',
        'local',
        '--max-operations',
        '100000',
        '--dry-run',
      ]),
    ).toEqual({
      command: 'backfill',
      environment: 'local',
      maxOperations: 100000,
      dryRun: true,
    });
  });

  it('parses dry-run only for backfill', () => {
    expect(
      parseAiIndexArguments([
        'backfill',
        '--environment',
        'local',
        '--dry-run',
      ]),
    ).toEqual({ command: 'backfill', environment: 'local', dryRun: true });
  });

  it.each([
    [['reconcile-qdrant'], '--environment is required'],
    [
      ['reconcile', '--environment', 'local', '--dry-run'],
      '--dry-run is valid only for backfill',
    ],
    [
      ['reconcile-qdrant', '--environment', 'local', '--dry-run'],
      '--dry-run is valid only for backfill',
    ],
    [
      ['replay', '--environment', 'local', '--job-id', UUID, '--dry-run'],
      '--dry-run is valid only for backfill',
    ],
    [
      ['drain', '--environment', 'local', '--dry-run'],
      '--dry-run is valid only for backfill',
    ],
    [['drain', '--environment', 'local', '--max-batches'], 'Missing value'],
    [['drain', '--environment', 'local', '--batch-size', '0'], '--batch-size'],
    [
      ['backfill', '--environment', 'local', '--max-operations', '0'],
      '--max-operations',
    ],
    [
      ['backfill', '--environment', 'local', '--max-operations', '1.5'],
      '--max-operations',
    ],
    [
      ['backfill', '--environment', 'local', '--max-operations', '100001'],
      '--max-operations',
    ],
    [
      [
        'backfill',
        '--environment',
        'local',
        '--max-operations',
        '9007199254740992',
      ],
      '--max-operations',
    ],
    [
      ['reconcile', '--environment', 'local', '--max-operations', '1'],
      '--max-operations is valid only for backfill',
    ],
    [
      ['reconcile-qdrant', '--environment', 'local', '--scan-run-id', 'bad'],
      'UUID',
    ],
    [
      ['backfill', '--environment', 'local', '--cursor', 'bad'],
      'canonical UUID',
    ],
    [
      ['reconcile-qdrant', '--environment', 'local', '--cursor', '10'],
      '--scan-run-id is required',
    ],
    [['drain', '--environment', 'local', '--limit', '1'], '--limit'],
    [
      [
        'reconcile-qdrant',
        '--environment',
        'local',
        '--cursor',
        '18446744073709551616',
        '--scan-run-id',
        UUID,
      ],
      'canonical numeric Qdrant offset',
    ],
    [
      ['replay', '--environment', 'local', '--outbox-id', UUID, '--limit', '1'],
      '--limit is valid only when replay uses --job-id',
    ],
    [
      ['replay', '--environment', 'local', '--job-id', UUID, '--cursor', UUID],
      '--cursor is valid only',
    ],
  ])('rejects invalid operational arguments: %j', (argv, message) => {
    expect(() => parseAiIndexArguments(argv)).toThrow(message);
  });
});

describe('runAiIndexCommand', () => {
  function createContext(environment = 'local') {
    const backfillAll = jest.fn().mockResolvedValue({ scanned: 1 });
    const reconcileQdrantAll = jest.fn().mockResolvedValue({
      orphanDetection: 'COMPLETED',
    });
    const reconcileQdrantPage = jest.fn().mockResolvedValue({
      orphanDetection: 'IN_PROGRESS',
    });
    const drain = jest.fn().mockResolvedValue({ status: 'COMPLETED' });
    const get = jest.fn((token: unknown) => {
      if (token === ConfigService) {
        return {
          get: jest.fn((key: string, fallback?: unknown) => {
            if (key === 'AI_INDEX_ENVIRONMENT') return environment;
            if (key === 'AI_INDEX_OUTBOX_ENVIRONMENT') return environment;
            return fallback;
          }),
        };
      }
      if (token === DataSource) return { isInitialized: true };
      if (token === AiServiceClient) return {};
      if (token === AiProviderAttemptRecorderToken) return {};
      if (token === AiIndexBackfillService) return { backfillAll };
      if (token === AiIndexReconcileService) {
        return { reconcileQdrantAll, reconcileQdrantPage };
      }
      if (token === AiIndexDrainService) return { drain };
      if (token === AiIndexReplayService) return {};
      throw new Error('unexpected token');
    });
    return {
      context: { get, close: jest.fn().mockResolvedValue(undefined) },
      get,
      backfillAll,
      reconcileQdrantAll,
      reconcileQdrantPage,
      drain,
    };
  }

  it('uses the application context composition and forwards the configured environment to backfill', async () => {
    const harness = createContext();

    await expect(
      runAiIndexCommand(
        [
          'backfill',
          '--environment',
          'local',
          '--limit',
          '4',
          '--max-operations',
          '7',
          '--dry-run',
        ],
        harness.context as never,
      ),
    ).resolves.toEqual({ scanned: 1 });
    expect(harness.backfillAll).toHaveBeenCalledWith({
      environment: 'local',
      cursor: undefined,
      limit: 4,
      maxOperations: 7,
      dryRun: true,
    });
    expect(harness.get).toHaveBeenCalledWith(DataSource);
    expect(harness.get).toHaveBeenCalledWith(AiServiceClient);
    expect(harness.get).toHaveBeenCalledWith(AiProviderAttemptRecorderToken);
    expect(harness.context.close).not.toHaveBeenCalled();
  });

  it('accepts a canonical numeric Qdrant offset only for Qdrant reconciliation', () => {
    expect(
      parseAiIndexArguments([
        'reconcile-qdrant',
        '--environment',
        'local',
        '--cursor',
        '10',
        '--scan-run-id',
        UUID,
      ]),
    ).toMatchObject({ cursor: '10' });
  });

  it('uses a single Qdrant page for a resume cursor and reports IN_PROGRESS', async () => {
    const harness = createContext();

    await expect(
      runAiIndexCommand(
        [
          'reconcile-qdrant',
          '--environment',
          'local',
          '--cursor',
          UUID,
          '--scan-run-id',
          UUID,
        ],
        harness.context as never,
      ),
    ).resolves.toMatchObject({ status: 'IN_PROGRESS' });
    expect(harness.reconcileQdrantPage).toHaveBeenCalledWith({
      environment: 'local',
      cursor: UUID,
      limit: undefined,
      scanRunId: UUID,
    });
    expect(harness.reconcileQdrantAll).not.toHaveBeenCalled();
  });

  it('rejects invalid max operations before accessing the application context', async () => {
    const context = { get: jest.fn(), close: jest.fn() };

    await expect(
      runAiIndexCommand(
        ['backfill', '--environment', 'local', '--max-operations', '0'],
        context as never,
      ),
    ).rejects.toThrow(
      '--max-operations must be an integer between 1 and 100000',
    );
    expect(context.get).not.toHaveBeenCalled();
    expect(context.close).not.toHaveBeenCalled();
  });

  it('rejects a CLI environment different from its configured deployment environment', async () => {
    const harness = createContext('staging');

    await expect(
      runAiIndexCommand(
        ['drain', '--environment', 'production'],
        harness.context as never,
      ),
    ).rejects.toThrow('AI_INDEX_ENVIRONMENT_MISMATCH');
  });
});
