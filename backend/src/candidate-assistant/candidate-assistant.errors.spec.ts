import {
  CandidateAssistantProviderError,
  mapCandidateAssistantProviderError,
} from './candidate-assistant.errors';
describe('candidate assistant provider errors', () => {
  it('maps timeout to 504 without provider details', () => {
    const error = mapCandidateAssistantProviderError(
      new CandidateAssistantProviderError('TIMEOUT', 'TIMEOUT'),
    );
    expect(error.getStatus()).toBe(504);
    expect(error.getResponse()).toEqual({
      code: 'AI_TIMEOUT',
      message: 'AI service timed out',
    });
  });
  it('maps rate limits to 429', () =>
    expect(
      mapCandidateAssistantProviderError(
        new CandidateAssistantProviderError('RATE_LIMITED'),
      ).getStatus(),
    ).toBe(429));
});
