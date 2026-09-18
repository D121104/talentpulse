import 'reflect-metadata';
import { CandidateAssistantConsentController } from 'src/candidate-assistant/candidate-assistant-consent.controller';

describe('CandidateAssistantConsentController', () => {
  it('returns active policy metadata even when current consent is null', () => {
    const policy = {
      purpose: 'candidate_assistant',
      consentVersion: 'candidate-assistant-v1',
      policyHash: 'a'.repeat(64),
    };
    const service = {
      getActivePolicy: jest.fn().mockReturnValue(policy),
      getCurrent: jest.fn().mockResolvedValue(null),
    };
    const controller = new CandidateAssistantConsentController(service as any);

    expect(controller.policy()).toEqual(policy);
    expect(service.getActivePolicy).toHaveBeenCalledTimes(1);
    expect(
      controller.current({
        _id: '11111111-1111-4111-8111-111111111111',
      } as any),
    ).toBeInstanceOf(Promise);
  });
});
