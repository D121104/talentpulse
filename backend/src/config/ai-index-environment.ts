import { ConfigService } from '@nestjs/config';

export const AI_INDEX_ENVIRONMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,31}$/;

export function configuredAiIndexEnvironment(
  configService: ConfigService,
): string {
  const environment = String(
    configService.get<string>('AI_INDEX_ENVIRONMENT', 'local') ?? '',
  ).trim();
  if (!AI_INDEX_ENVIRONMENT_PATTERN.test(environment)) {
    throw new Error(
      'AI_INDEX_ENVIRONMENT must contain 1 to 32 safe characters',
    );
  }
  return environment;
}

/**
 * Enforces the deployment boundary required by the unscoped outbox table.
 *
 * This verifies configuration only. The database itself has no environment
 * column, so non-local deployments must use a dedicated outbox database.
 */
export function assertAiIndexOperationalEnvironment(
  configService: ConfigService,
): string {
  const environment = configuredAiIndexEnvironment(configService);
  const rawOutboxEnvironment = configService.get<string>(
    'AI_INDEX_OUTBOX_ENVIRONMENT',
  );
  const hasOutboxEnvironment =
    rawOutboxEnvironment !== undefined &&
    rawOutboxEnvironment !== null &&
    String(rawOutboxEnvironment).trim() !== '';

  if (!hasOutboxEnvironment) {
    if (environment !== 'local') {
      throw new Error(
        'AI_INDEX_OUTBOX_ENVIRONMENT must be explicitly set for a non-local unscoped outbox',
      );
    }
    return environment;
  }

  const outboxEnvironment = String(rawOutboxEnvironment).trim();
  if (!AI_INDEX_ENVIRONMENT_PATTERN.test(outboxEnvironment)) {
    throw new Error(
      'AI_INDEX_OUTBOX_ENVIRONMENT must contain 1 to 32 safe characters',
    );
  }
  if (outboxEnvironment !== environment) {
    throw new Error(
      'AI_INDEX_OUTBOX_ENVIRONMENT must match AI_INDEX_ENVIRONMENT for the unscoped outbox',
    );
  }
  return environment;
}

/** Enforces the unscoped outbox deployment boundary for operational commands. */
export function resolveAiIndexEnvironment(
  configService: ConfigService,
  requested?: string,
): string {
  const configured = assertAiIndexOperationalEnvironment(configService);
  if (requested === undefined) return configured;
  const environment = String(requested).trim();
  if (!AI_INDEX_ENVIRONMENT_PATTERN.test(environment)) {
    throw new Error(
      'AI_INDEX_ENVIRONMENT must contain 1 to 32 safe characters',
    );
  }
  if (environment !== configured) {
    throw new Error(
      'AI_INDEX_ENVIRONMENT_MISMATCH: command environment must match AI_INDEX_ENVIRONMENT',
    );
  }
  return environment;
}
