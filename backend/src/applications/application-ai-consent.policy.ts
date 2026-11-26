import { createHash } from 'crypto';

export const APPLICATION_AI_RANKING_POLICY_TEXT =
  'By submitting this application, the candidate authorizes AI analysis and ranking of the selected CV for this job application only. This does not authorize global CV search, processing for other jobs, or AI training. Withdrawing removes the application and its AI matching results and prevents further matching for that application. An AI request already in progress may finish, but its result will not be retained for the withdrawn application.';
export const APPLICATION_AI_RANKING_CONSENT_PURPOSE = 'application_ai_ranking';
const DEFAULT_VERSION = 'application-ai-ranking-submission-v2';
const DEFAULT_HASH = createHash('sha256')
  .update(APPLICATION_AI_RANKING_POLICY_TEXT, 'utf8')
  .digest('hex');

export function getApplicationAiRankingConsentPolicy() {
  return {
    purpose: APPLICATION_AI_RANKING_CONSENT_PURPOSE,
    // Bind the new submission policy to its actual text, not legacy opt-in overrides.
    consentVersion: DEFAULT_VERSION,
    policyHash: DEFAULT_HASH,
  };
}
