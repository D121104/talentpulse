export const AI_PROVIDER_ATTEMPT_PROVIDER_MAX_LENGTH = 80;
export const AI_PROVIDER_ATTEMPT_MODEL_MAX_LENGTH = 256;
export const AI_PROVIDER_ATTEMPT_ERROR_CODE_MAX_LENGTH = 80;

const SAFE_LABEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:/-]*$/;
const SENSITIVE_LABEL_PATTERN =
  /(?:bearer|api[_-]?key|access[_-]?token|secret|password|token)/i;
const PHONE_LIKE_PATTERN = /^[+().\d-]+$/;
const CREDENTIAL_PREFIX_PATTERN =
  /^(?:sk-|pk-|ghp_|github_pat_|xox[baprs]-|AIza|eyJ)/i;

const KNOWN_ERROR_CODES = new Set([
  'AI_PROVIDER_TIMEOUT',
  'AI_DEPENDENCY_UNAVAILABLE',
  'AI_INVALID_MODEL_OUTPUT',
  'AI_REQUEST_REJECTED',
  'AI_SERVICE_UNAUTHORIZED',
  'AI_ENDPOINT_NOT_FOUND',
  'AI_DEPENDENCY_RATE_LIMITED',
  'AI_CLIENT_NOT_CONFIGURED',
  'AI_CIRCUIT_OPEN',
  'AI_PROVIDER_UNKNOWN_BEFORE_SEND',
  'AI_PROVIDER_ATTEMPT_STALE_BEFORE_SEND',
  'AI_PROVIDER_ATTEMPT_STALE_AFTER_SEND',
]);

export const AI_PROVIDER_ATTEMPT_GENERIC_ERROR_CODE = 'AI_PROVIDER_ERROR';

/** Returns only short, internal audit labels; never returns raw external text. */
export function normalizeAiProviderAttemptLabel(
  value: unknown,
  maxLength: number,
): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;

  // Trimming is the only accepted normalization. Internal whitespace and
  // controls are rejected instead of being copied into audit metadata.
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > maxLength ||
    /\s/.test(normalized) ||
    /[\u0000-\u001f\u007f]/.test(normalized) ||
    !SAFE_LABEL_PATTERN.test(normalized) ||
    SENSITIVE_LABEL_PATTERN.test(normalized) ||
    CREDENTIAL_PREFIX_PATTERN.test(normalized)
  ) {
    return undefined;
  }

  const digits = normalized.replace(/\D/g, '');
  if (PHONE_LIKE_PATTERN.test(normalized) && digits.length >= 7) {
    return undefined;
  }
  return normalized;
}

export function requireAiProviderAttemptLabel(
  value: unknown,
  maxLength: number,
  field: string,
): string {
  const normalized = normalizeAiProviderAttemptLabel(value, maxLength);
  if (!normalized) {
    throw new Error(`AI_PROVIDER_ATTEMPT_${field.toUpperCase()}_INVALID`);
  }
  return normalized;
}

export function normalizeAiProviderAttemptErrorCode(value: unknown): string {
  if (
    typeof value === 'string' &&
    value.length <= AI_PROVIDER_ATTEMPT_ERROR_CODE_MAX_LENGTH &&
    KNOWN_ERROR_CODES.has(value)
  ) {
    return value;
  }
  return AI_PROVIDER_ATTEMPT_GENERIC_ERROR_CODE;
}

export function isSafeAiProviderAttemptLabel(
  value: unknown,
  maxLength: number,
): value is string {
  return normalizeAiProviderAttemptLabel(value, maxLength) === value;
}
