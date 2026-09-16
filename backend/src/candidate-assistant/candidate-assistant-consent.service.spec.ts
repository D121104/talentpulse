import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CandidateAssistantConsentService } from './candidate-assistant-consent.service';
import { getCandidateAssistantConsentPolicy } from './candidate-assistant-consent.policy';
describe('CandidateAssistantConsentService', () => {
  it('returns the active policy metadata independently of consent rows', () => {
    const config = {
      get: jest.fn(
        (key: string) =>
          ({
            AI_CANDIDATE_ASSISTANT_CONSENT_VERSION: 'candidate-assistant-v2',
            AI_CANDIDATE_ASSISTANT_CONSENT_POLICY_HASH: 'a'.repeat(64),
          }[key]),
      ),
    } as unknown as ConfigService;
    const service = new CandidateAssistantConsentService(
      {} as any,
      {} as any,
      config,
      {} as any,
    );

    expect(service.getActivePolicy()).toEqual({
      purpose: 'candidate_assistant',
      consentVersion: 'candidate-assistant-v2',
      policyHash: 'a'.repeat(64),
    });
  });

  it('rejects a stale policy version', async () => {
    const repo = {} as any;
    const service = new CandidateAssistantConsentService(
      repo,
      {} as any,
      new ConfigService(),
      {} as any,
    );
    const p = getCandidateAssistantConsentPolicy();
    await expect(
      service.grant('11111111-1111-4111-8111-111111111111', {
        consentVersion: 'old',
        policyHash: p.policyHash,
        source: 'web',
      } as any),
    ).rejects.toThrow(ConflictException);
  });
});
