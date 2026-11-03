export interface JobIndexIdentity {
  request_id: string;
  trace_id: string;
  operation_attempt_id: string;
}

export type AiServiceErrorCode =
  | 'AI_SERVICE_NOT_CONFIGURED'
  | 'AI_SERVICE_UNAVAILABLE'
  | 'AI_SERVICE_TIMEOUT'
  | 'AI_SERVICE_AUTH_FAILED'
  | 'AI_SERVICE_REJECTED'
  | 'AI_SERVICE_RATE_LIMITED'
  | 'AI_INVALID_RESPONSE';
export class AiServiceError extends Error {
  constructor(
    public readonly code: AiServiceErrorCode,
    message: string = code,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'AiServiceError';
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}
export function isSafeString(
  value: unknown,
  min: number,
  max: number,
): value is string {
  return (
    isString(value) &&
    value.length >= min &&
    value.length <= max &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  );
}
export function isVersion(value: unknown): value is string {
  return (
    isString(value) &&
    value.length >= 1 &&
    value.length <= 128 &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
  );
}
export function isOptionalText(value: unknown, maxLength: number): boolean {
  return (
    value === null ||
    (isString(value) && value.length <= maxLength && value.trim().length > 0)
  );
}
export function isOptionalIsoDate(value: unknown): value is string | null {
  return (
    value === null ||
    (isString(value) &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value) &&
      !Number.isNaN(Date.parse(value)))
  );
}
export function isOptionalEpochMs(value: unknown): value is number | null {
  return (
    value === null || (typeof value === 'number' && Number.isSafeInteger(value))
  );
}
export function datesMatchEpoch(
  date: string | null,
  epochMs: number | null,
): boolean {
  return date === null ? epochMs === null : epochMs === Date.parse(date);
}
export function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
export function isScore(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}
export function assertExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): void {
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new AiServiceError(
      'AI_INVALID_RESPONSE',
      'AI response contains unsupported fields',
    );
  }
}
export function assertStringArray(
  value: unknown,
  max: number,
): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    value.length > max ||
    value.some((item) => !isString(item))
  ) {
    throw new AiServiceError(
      'AI_INVALID_RESPONSE',
      'AI response contains an invalid list',
    );
  }
}
export function assertParseStringArray(
  value: unknown,
  maxItems: number,
  maxItemLength = 500,
): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    value.length > maxItems ||
    value.some((item) => !isSafeString(item, 1, maxItemLength))
  ) {
    throw new AiServiceError('AI_INVALID_RESPONSE', 'Invalid parse response');
  }
}
