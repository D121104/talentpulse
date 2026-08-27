import 'reflect-metadata';

import { DataSource } from 'typeorm';
import { AiIndexBackfillService } from '../ai-indexing/services/ai-index-backfill.service';
import { AiIndexReconcileService } from '../ai-indexing/services/ai-index-reconcile.service';
import { AiIndexReplayService } from '../ai-indexing/services/ai-index-replay.service';
import { AiIndexingService } from '../ai-indexing/ai-indexing.service';
import { CanonicalJobProjectionService } from '../ai-indexing/services/canonical-job-projection.service';
import { AiIndexOutbox, AiJobIndexState } from '../ai-indexing/entities';
import { Company } from '../companies/entities/company.entity';
import { Job } from '../jobs/entities/job.entity';

const COMMANDS = new Set(['backfill', 'reconcile', 'replay']);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_LIMIT = 100;

export interface ParsedCliArguments {
  command: string;
  environment?: string;
  cursor?: string;
  limit?: number;
  outboxId?: string;
  jobId?: string;
}

/**
 * Parses only the documented operational arguments. This file has no top-level
 * connection/initialization side effect; importing it is safe for tests/tools.
 */
export function parseAiIndexArguments(argv: string[]): ParsedCliArguments {
  const command = argv[0];
  if (!command || !COMMANDS.has(command)) {
    throw new Error('Usage: ai-index <backfill|reconcile|replay> [options]');
  }

  const parsed: ParsedCliArguments = { command };
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${argument}`);
    }
    switch (argument) {
      case '--environment':
        if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,31}$/.test(value)) {
          throw new Error('--environment must contain 1 to 32 safe characters');
        }
        parsed.environment = value;
        break;
      case '--cursor':
        if (!UUID_PATTERN.test(value)) {
          throw new Error('--cursor must be a canonical UUID');
        }
        parsed.cursor = value.toLowerCase();
        break;
      case '--limit': {
        const limit = Number(value);
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
          throw new Error(`--limit must be an integer between 1 and ${MAX_LIMIT}`);
        }
        parsed.limit = limit;
        break;
      }
      case '--outbox-id':
        if (!UUID_PATTERN.test(value)) {
          throw new Error('--outbox-id must be a UUID');
        }
        parsed.outboxId = value.toLowerCase();
        break;
      case '--job-id':
        if (!UUID_PATTERN.test(value)) {
          throw new Error('--job-id must be a UUID');
        }
        parsed.jobId = value.toLowerCase();
        break;
      default:
        throw new Error(`Unknown argument: ${argument}`);
    }
    index += 1;
  }

  if (command === 'replay' && Boolean(parsed.outboxId) === Boolean(parsed.jobId)) {
    throw new Error('replay requires exactly one of --outbox-id or --job-id');
  }
  if (command !== 'replay' && (parsed.outboxId || parsed.jobId)) {
    throw new Error('--outbox-id and --job-id are valid only for replay');
  }
  return parsed;
}

export async function runAiIndexCommand(
  argv: string[],
  dataSource?: DataSource,
): Promise<unknown> {
  const args = parseAiIndexArguments(argv);
  const source = dataSource ?? createOperationalDataSource();
  const ownsDataSource = dataSource === undefined;
  if (ownsDataSource) await source.initialize();

  try {
    const outboxRepository = source.getRepository(AiIndexOutbox);
    const stateRepository = source.getRepository(AiJobIndexState);
    const projection = new CanonicalJobProjectionService(
      source.getRepository(Job),
      source.getRepository(Company),
    );
    const indexing = new AiIndexingService(outboxRepository);

    switch (args.command) {
      case 'backfill':
        return await new AiIndexBackfillService(projection, indexing).backfillAll({
          cursor: args.cursor,
          limit: args.limit,
        });
      case 'reconcile':
        return await new AiIndexReconcileService(
          stateRepository,
          projection,
          indexing,
        ).reconcileAll({
          cursor: args.cursor,
          limit: args.limit,
          environment: args.environment,
        });
      case 'replay': {
        const replay = new AiIndexReplayService(outboxRepository);
        if (args.outboxId) {
          return { replayed: await replay.replayOutbox(args.outboxId) };
        }
        if (args.jobId) return replay.replayJob(args.jobId, args.limit);
        return replay.replayAll(args.limit);
      }
      default:
        throw new Error('Unsupported AI indexing command');
    }
  } finally {
    if (ownsDataSource) await source.destroy();
  }
}

function createOperationalDataSource(): DataSource {
  // Delay dotenv/data-source module evaluation until execution. Importing this
  // CLI for argument parsing or tests must not load a connection configuration
  // or initialize a database connection.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createDataSourceOptions } = require('../database/data-source') as typeof import('../database/data-source');
  return new DataSource(createDataSourceOptions());
}

function isMainModule(): boolean {
  return require.main === module;
}

if (isMainModule()) {
  void runAiIndexCommand(process.argv.slice(2))
    .then((result) => {
      // Results contain counters/IDs only; never print connection config or
      // canonical job content/provider responses.
      process.stdout.write(`${JSON.stringify(result)}\n`);
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Command failed';
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
}
