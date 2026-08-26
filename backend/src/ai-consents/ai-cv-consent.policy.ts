import { createHash } from 'crypto';
import { ConfigService } from '@nestjs/config';

/**
 * Consent scopes are application capabilities, not user-defined labels.
 * Adding a scope requires a code change and an explicit policy definition.
 */
export enum AiCvConsentScope {
  CV_MATCHING = 'cv_matching',
}

export interface ActiveAiCvConsentPolicy {
  scope: AiCvConsentScope;
  consentVersion: string;
  policyHash: string;
}

const DEFAULT_CONSENT_VERSION = 'phase0-v1';
const POLICY_TEXT =
  'TalentPulse may process the candidate CV for the explicitly selected AI CV matching purpose.';
const DEFAULT_POLICY_HASH = createHash('sha256')
  .update(POLICY_TEXT, 'utf8')
  .digest('hex');

export const AI_CV_CONSENT_ERROR_MESSAGES = {
  INVALID_USER_ID: 'Invalid user id',
  INVALID_CV_ID: 'Invalid CV id',
  INVALID_SCOPE: 'Invalid AI CV consent scope',
  POLICY_MISMATCH: 'AI CV consent policy/version does not match the active policy',
  ACTIVE_CONSENT_EXISTS: 'An active consent already exists for this scope',
  NO_ACTIVE_CONSENT: 'No active CV consent exists for this scope',
  INVALID_CONSENT: 'No valid consent exists for this AI purpose',
} as const;

export function isAiCvConsentScope(value: unknown): value is AiCvConsentScope {
  return Object.values(AiCvConsentScope).includes(value as AiCvConsentScope);
}

export function getActiveAiCvConsentPolicy(
  configService?: ConfigService,
): ActiveAiCvConsentPolicy {
  const consentVersion =
    configService?.get<string>('AI_CV_CONSENT_VERSION')?.trim() ||
    DEFAULT_CONSENT_VERSION;
  const policyHash =
    configService?.get<string>('AI_CV_CONSENT_POLICY_HASH')?.trim().toLowerCase() ||
    DEFAULT_POLICY_HASH;

  if (!/^\w[\w.-]{0,79}$/.test(consentVersion) || !/^[a-f0-9]{64}$/.test(policyHash)) {
    throw new Error(
      'AI_CV_CONSENT_VERSION must be a simple version and AI_CV_CONSENT_POLICY_HASH must be a SHA-256 hex digest',
    );
  }

  return {
    scope: AiCvConsentScope.CV_MATCHING,
    consentVersion,
    policyHash,
  };
}
