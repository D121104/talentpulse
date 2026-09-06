import { createHash } from 'crypto';
import { ConfigService } from '@nestjs/config';
export const CANDIDATE_ASSISTANT_CONSENT_PURPOSE = 'candidate_assistant';
const DEFAULT_VERSION = 'candidate-assistant-v1';
const POLICY_TEXT =
  "TalentPulse may process the candidate's selected job and CV data to provide the candidate assistant.";
const DEFAULT_HASH = createHash('sha256')
  .update(POLICY_TEXT, 'utf8')
  .digest('hex');
export interface CandidateAssistantConsentPolicy {
  purpose: string;
  consentVersion: string;
  policyHash: string;
}
export function getCandidateAssistantConsentPolicy(
  config?: ConfigService,
): CandidateAssistantConsentPolicy {
  const consentVersion =
    config?.get<string>('AI_CANDIDATE_ASSISTANT_CONSENT_VERSION')?.trim() ||
    DEFAULT_VERSION;
  const policyHash =
    config
      ?.get<string>('AI_CANDIDATE_ASSISTANT_CONSENT_POLICY_HASH')
      ?.trim()
      .toLowerCase() || DEFAULT_HASH;
  if (
    !/^\w[\w.-]{0,79}$/.test(consentVersion) ||
    !/^[a-f0-9]{64}$/.test(policyHash)
  )
    throw new Error('Invalid candidate assistant consent policy configuration');
  return {
    purpose: CANDIDATE_ASSISTANT_CONSENT_PURPOSE,
    consentVersion,
    policyHash,
  };
}
