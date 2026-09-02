import 'reflect-metadata';

import { ConfigService } from '@nestjs/config';
import type { INestApplicationContext } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { validate as isUuid } from 'uuid';
import { AiServiceClient } from '../ai-client/ai-client.service';
import { AiProviderAttemptRecorderToken } from '../ai-client/ai-provider-attempt.contracts';
import { AiIndexBackfillService } from '../ai-indexing/services/ai-index-backfill.service';
import { AiIndexReplayService } from '../ai-indexing/services/ai-index-replay.service';
import { AiIndexDrainService } from '../ai-indexing/services/ai-index-drain.service';
import { AiIndexReconcileService } from '../ai-indexing/services/ai-index-reconcile.service';
import { AiIndexPublisherService } from '../ai-indexing/services/ai-index-publisher.service';
import { AiIndexVerificationService } from '../ai-indexing/services/ai-index-verification.service';
import { resolveAiIndexEnvironment } from '../config/ai-index-environment';

const COMMANDS = new Set([
  'backfill',
  'reconcile',
  'reconcile-qdrant',
  'replay',
  'drain',
  'publish',
  'verify',
]);
const MAX_LIMIT = 100;
const MAX_DRAIN_BATCHES = 1_000;
const MAX_BACKFILL_OPERATIONS = 100_000;

const SAFE_OPERATIONAL_ERRORS: Record<string, string> = {
  AI_INDEX_VERIFY_STAGING_ONLY: 'Verification is restricted to staging.',
  AI_INDEX_VERIFY_TARGET_NOT_FOUND_OR_MISMATCH:
    'Verification target was not found or did not match.',
  AI_INDEX_VERIFY_QDRANT_UNAVAILABLE: 'Qdrant verification is unavailable.',
};

class AiIndexOperationalError extends Error {
  constructor(public readonly code: keyof typeof SAFE_OPERATIONAL_ERRORS) {
    super(code);
  }
}

export function formatAiIndexOperationalError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined;
  if (typeof code === 'string' && SAFE_OPERATIONAL_ERRORS[code]) {
    return code + ": " + SAFE_OPERATIONAL_ERRORS[code];
  }
  return 'AI_INDEX_COMMAND_FAILED: Command failed.';
}

export interface ParsedCliArguments {
  command: string;
  environment?: string;
  cursor?: string;
  scanRunId?: string;
  limit?: number;
  maxBatches?: number;
  batchSize?: number;
  outboxId?: string;
  jobId?: string;
  companyId?: string;
  qdrant?: boolean;
  dryRun?: boolean;
  maxOperations?: number;
}

export type AiIndexOperationalContext = Pick<
  INestApplicationContext,
  'get' | 'close'
>;

/** Parses only documented, bounded operational arguments without side effects. */
export function parseAiIndexArguments(argv: string[]): ParsedCliArguments {
  const command = argv[0];
  if (!command || !COMMANDS.has(command)) {
    throw new Error(
      'Usage: ai-index <backfill|reconcile|reconcile-qdrant|replay|drain|publish|verify> [options]',
    );
  }

  const parsed: ParsedCliArguments = { command };
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }
    if (argument === '--qdrant') {
      parsed.qdrant = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error('Missing value for ' + argument);
    }
    switch (argument) {
      case '--environment':
        if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,31}$/.test(value)) {
          throw new Error('--environment must contain 1 to 32 safe characters');
        }
        parsed.environment = value;
        break;
      case '--cursor':
        parsed.cursor = parseCursor(command, value);
        break;
      case '--scan-run-id':
        parsed.scanRunId = requireUuid(value, '--scan-run-id must be a UUID');
        break;
      case '--outbox-id':
        parsed.outboxId = requireUuid(value, '--outbox-id must be a UUID');
        break;
      case '--job-id':
        parsed.jobId = requireUuid(value, '--job-id must be a UUID');
        break;
      case '--company-id':
        parsed.companyId = requireUuid(value, '--company-id must be a UUID');
        break;
      case '--limit':
        parsed.limit = parseBoundedInteger(value, '--limit', MAX_LIMIT);
        break;
      case '--max-operations':
        parsed.maxOperations = parseBoundedInteger(
          value,
          '--max-operations',
          MAX_BACKFILL_OPERATIONS,
        );
        break;
      case '--max-batches':
        parsed.maxBatches = parseBoundedInteger(
          value,
          '--max-batches',
          MAX_DRAIN_BATCHES,
        );
        break;
      case '--batch-size':
        parsed.batchSize = parseBoundedInteger(
          value,
          '--batch-size',
          MAX_LIMIT,
        );
        break;
      default:
        throw new Error('Unknown argument: ' + argument);
    }
    index += 1;
  }

  if (
    command === 'replay' &&
    Boolean(parsed.outboxId) === Boolean(parsed.jobId)
  ) {
    throw new Error('replay requires exactly one of --outbox-id or --job-id');
  }
  if (
    !['replay', 'verify'].includes(command) &&
    (parsed.outboxId || parsed.jobId || parsed.companyId)
  ) {
    throw new Error(
      '--outbox-id, --job-id, and --company-id are valid only for replay and verify',
    );
  }
  if (
    command === 'verify' &&
    (!parsed.outboxId || !parsed.jobId || !parsed.companyId)
  ) {
    throw new Error('verify requires --outbox-id, --job-id, and --company-id');
  }
  if (command === 'replay' && parsed.companyId) {
    throw new Error('--company-id is valid only for verify');
  }
  if (command !== 'verify' && parsed.qdrant) {
    throw new Error('--qdrant is valid only for verify');
  }
  if (command === 'replay' && parsed.outboxId && parsed.limit) {
    throw new Error('--limit is valid only when replay uses --job-id');
  }
  if (command !== 'reconcile-qdrant' && parsed.scanRunId) {
    throw new Error('--scan-run-id is valid only for reconcile-qdrant');
  }
  if (!['backfill', 'verify'].includes(command) && parsed.dryRun) {
    throw new Error('--dry-run is valid only for backfill and verify');
  }
  if (command === 'verify' && !parsed.dryRun) {
    throw new Error('verify requires --dry-run');
  }
  if (command !== 'backfill' && parsed.maxOperations !== undefined) {
    throw new Error('--max-operations is valid only for backfill');
  }
  if (command !== 'drain' && parsed.maxBatches) {
    throw new Error('--max-batches is valid only for drain');
  }
  if (!['drain', 'publish'].includes(command) && parsed.batchSize) {
    throw new Error('--batch-size is valid only for drain and publish');
  }
  if (parsed.limit && ['drain', 'publish'].includes(command)) {
    throw new Error('--limit is not valid for drain or publish');
  }
  if (
    parsed.cursor &&
    !['backfill', 'reconcile', 'reconcile-qdrant'].includes(command)
  ) {
    throw new Error(
      '--cursor is valid only for backfill, reconcile, and reconcile-qdrant',
    );
  }
  if (command === 'reconcile-qdrant' && parsed.cursor && !parsed.scanRunId) {
    throw new Error(
      '--scan-run-id is required when reconcile-qdrant uses --cursor',
    );
  }
  if (!parsed.environment) {
    throw new Error('--environment is required');
  }
  return parsed;
}

/**
 * Runs against the same Nest providers as production: ConfigService, TypeORM,
 * service JWT, real HTTP client and persistent provider-attempt audit recorder.
 */
export async function runAiIndexCommand(
  argv: string[],
  applicationContext?: AiIndexOperationalContext,
): Promise<unknown> {
  const args = parseAiIndexArguments(argv);
  const context =
    applicationContext ?? (await createAiIndexOperationalContext());
  const ownsContext = applicationContext === undefined;

  try {
    const config = context.get(ConfigService);
    const environment = resolveAiIndexEnvironment(config, args.environment);
    if (args.command === 'verify' && environment !== 'staging') {
      throw new AiIndexOperationalError('AI_INDEX_VERIFY_STAGING_ONLY');
    }
    if (args.command === 'publish') {
      return context.get(AiIndexPublisherService).publish({
        environment,
        batchSize: args.batchSize,
      });
    }

    // Resolve hard production prerequisites before selecting an AI command. This
    // forbids a Qdrant reconciliation path with a hand-built/no-op AI client.
    context.get(DataSource);
    context.get(AiServiceClient);
    context.get(AiProviderAttemptRecorderToken);

    switch (args.command) {
      case 'backfill':
        return context.get(AiIndexBackfillService).backfillAll({
          environment,
          cursor: args.cursor,
          limit: args.limit,
          maxOperations: args.maxOperations,
          ...(args.dryRun ? { dryRun: true } : {}),
        });
      case 'reconcile':
        return context.get(AiIndexReconcileService).reconcileAll({
          environment,
          cursor: args.cursor,
          limit: args.limit,
        });
      case 'reconcile-qdrant': {
        const service = context.get(AiIndexReconcileService);
        if (args.cursor) {
          const result = await service.reconcileQdrantPage({
            environment,
            cursor: args.cursor,
            limit: args.limit,
            scanRunId: args.scanRunId,
          });
          return { ...result, status: 'IN_PROGRESS' };
        }
        const result = await service.reconcileQdrantAll({
          environment,
          limit: args.limit,
          scanRunId: args.scanRunId,
        });
        return { ...result, status: 'COMPLETED' };
      }
      case 'drain':
        return context.get(AiIndexDrainService).drain({
          environment,
          batchSize: args.batchSize,
          maxBatches: args.maxBatches,
        });
      case 'verify':
        return context.get(AiIndexVerificationService).verify({
          outboxId: args.outboxId as string,
          jobId: args.jobId as string,
          companyId: args.companyId as string,
          verifyQdrant: args.qdrant,
          qdrantLimit: args.limit,
        });
      case 'replay': {
        const replay = context.get(AiIndexReplayService);
        if (args.outboxId) {
          return {
            replayed: await replay.replayOutbox(args.outboxId, environment),
          };
        }
        if (!args.jobId) {
          throw new Error(
            'replay requires --job-id when --outbox-id is absent',
          );
        }
        return replay.replayJob(args.jobId, args.limit, environment);
      }
      default:
        throw new Error('Unsupported AI indexing command');
    }
  } finally {
    if (ownsContext) await context.close();
  }
}

export async function createAiIndexOperationalContext(): Promise<AiIndexOperationalContext> {
  // The imports are intentionally delayed. Parsing/tests never load dotenv,
  // database configuration, or construct a network-capable Nest application.
  const { NestFactory } = await import('@nestjs/core');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const operationalModule: typeof import('./ai-index-operational.module') = require('./ai-index-operational.module');
  const { AiIndexOperationalModule } = operationalModule;
  return NestFactory.createApplicationContext(AiIndexOperationalModule, {
    logger: ['error', 'warn'],
  });
}

function requireUuid(value: string, message: string): string {
  if (!isUuid(value)) throw new Error(message);
  return value.toLowerCase();
}

function parseCursor(command: string, value: string): string {
  if (command === 'reconcile-qdrant') {
    if (isUuid(value)) return value.toLowerCase();
    if (/^(?:0|[1-9][0-9]*)$/.test(value)) {
      const numericOffset = BigInt(value);
      if (numericOffset <= 18446744073709551615n) return value;
    }
    throw new Error(
      '--cursor must be a canonical UUID or canonical numeric Qdrant offset',
    );
  }
  return requireUuid(value, '--cursor must be a canonical UUID');
}

function parseBoundedInteger(value: string, name: string, max: number): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) {
    throw new Error(name + ' must be an integer between 1 and ' + max);
  }
  return parsed;
}

function isMainModule(): boolean {
  return require.main === module;
}

if (isMainModule()) {
  void runAiIndexCommand(process.argv.slice(2))
    .then((result) => process.stdout.write(JSON.stringify(result) + '\n'))
    .catch((error: unknown) => {
      process.stderr.write(formatAiIndexOperationalError(error) + '\n');
      process.exitCode = 1;
    });
}
