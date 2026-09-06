import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CandidateAssistantConsentService } from './candidate-assistant-consent.service';
import { getCandidateAssistantConsentPolicy } from './candidate-assistant-consent.policy';
describe('CandidateAssistantConsentService', () => {
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
