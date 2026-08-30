import 'reflect-metadata';

import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import {
  AiIndexBackfillResult,
  AiIndexBackfillService,
} from '../ai-indexing/services/ai-index-backfill.service';
import { resolveAiIndexEnvironment } from '../config/ai-index-environment';
import {
  AiIndexOperationalContext,
  createAiIndexOperationalContext,
  parseAiIndexArguments,
} from '../scripts/ai-index';

export interface AiIndexBackfillTaskResult {
  scanned: number;
  active: number;
  inactive: number;
  upsertEnqueued: number;
  deleteEnqueued: number;
  upsertSkipped: number;
  deleteSkipped: number;
  deleted: number;
  expired: number;
  missingCompany: number;
  inactiveCompany: number;
  inactiveJob: number;
  notStarted: number;
  invalidDates: number;
  otherInactive: number;
  dryRun?: true;
  upsertPlanned?: number;
  deletePlanned?: number;
  cursor: string | null;
  nextCursor: string | null;
  hasMore: boolean;
  operationBudgetExhausted?: true;
}

/**
 * Runs one bounded canonical PostgreSQL backfill task. It deliberately creates
 * outbox commands only; delivery remains owned by the incremental SQS worker.
 */
export async function runAiIndexBackfillTask(
  argv: string[],
  applicationContext?: AiIndexOperationalContext,
): Promise<AiIndexBackfillTaskResult> {
  const args = parseAiIndexArguments(['backfill', ...argv]);
  if (args.maxOperations === undefined) {
    throw new Error('--max-operations is required for the backfill task');
  }
  const context =
    applicationContext ?? (await createAiIndexOperationalContext());
  const ownsContext = applicationContext === undefined;

  try {
    const config = context.get(ConfigService);
    const environment = resolveAiIndexEnvironment(config, args.environment);
    context.get(DataSource);
    const result = await context.get(AiIndexBackfillService).backfillAll({
      environment,
      cursor: args.cursor,
      limit: args.limit,
      maxOperations: args.maxOperations,
      ...(args.dryRun ? { dryRun: true } : {}),
    });
    return sanitizeBackfillResult(result);
  } finally {
    if (ownsContext) await context.close();
  }
}

function sanitizeBackfillResult(
  result: AiIndexBackfillResult,
): AiIndexBackfillTaskResult {
  return {
    scanned: result.scanned,
    active: result.active,
    inactive: result.inactive,
    upsertEnqueued: result.upsertEnqueued,
    deleteEnqueued: result.deleteEnqueued,
    upsertSkipped: result.upsertSkipped,
    deleteSkipped: result.deleteSkipped,
    deleted: result.deleted,
    expired: result.expired,
    missingCompany: result.missingCompany,
    inactiveCompany: result.inactiveCompany,
    inactiveJob: result.inactiveJob,
    notStarted: result.notStarted,
    invalidDates: result.invalidDates,
    otherInactive: result.otherInactive,
    ...(result.dryRun ? { dryRun: true } : {}),
    ...(result.upsertPlanned === undefined
      ? {}
      : { upsertPlanned: result.upsertPlanned }),
    ...(result.deletePlanned === undefined
      ? {}
      : { deletePlanned: result.deletePlanned }),
    cursor: result.cursor,
    nextCursor: result.nextCursor,
    hasMore: result.hasMore,
    ...(result.operationBudgetExhausted
      ? { operationBudgetExhausted: true }
      : {}),
  };
}

if (require.main === module) {
  void runAiIndexBackfillTask(process.argv.slice(2))
    .then((result) => process.stdout.write(JSON.stringify(result) + '\n'))
    .catch(() => {
      process.stderr.write('{"error":"AI_INDEX_BACKFILL_TASK_FAILED"}\n');
      process.exitCode = 1;
    });
}
