import { createHash } from 'crypto';
import { ConfigService } from '@nestjs/config';

const POLICY_TEXT =
  'The candidate permits AI ranking for this specific job application.';
export const APPLICATION_AI_RANKING_CONSENT_PURPOSE = 'application_ai_ranking';
const DEFAULT_VERSION = 'application-ai-ranking-v1';
const DEFAULT_HASH = createHash('sha256')
  .update(POLICY_TEXT, 'utf8')
  .digest('hex');

export function getApplicationAiRankingConsentPolicy(config?: ConfigService) {
  return {
    purpose: APPLICATION_AI_RANKING_CONSENT_PURPOSE,
    consentVersion:
      config?.get<string>('AI_APPLICATION_RANKING_CONSENT_VERSION')?.trim() ||
      DEFAULT_VERSION,
    policyHash:
      config
        ?.get<string>('AI_APPLICATION_RANKING_CONSENT_POLICY_HASH')
        ?.trim()
        .toLowerCase() || DEFAULT_HASH,
  };
}
