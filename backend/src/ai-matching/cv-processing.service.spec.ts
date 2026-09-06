import { CVProcessingService } from './cv-processing.service';
import { CVProcessingStatus } from './entities/cv-match-result.entity';

describe('CVProcessingService queue payloads', () => {
  it('queues application matching by IDs and fences, never by CV URL/text or snapshots', async () => {
    const result = { _id: 'result-1', status: CVProcessingStatus.PENDING };
    const resultRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn().mockResolvedValue(result),
    };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const service = new CVProcessingService(resultRepo as any, queue as any);

    await service.queueCVProcessing({
      cvId: 'cv-1',
      userId: 'user-1',
      applicationId: 'application-1',
      cvContentVersion: 'cv-v1',
      contentHash: 'a'.repeat(64),
      jobId: 'job-1',
      jobSourceVersion: 'job-v1',
      aiRankingConsentGranted: true,
      aiRankingConsentVersion: 'consent-v1',
      aiRankingConsentPolicyHash: 'b'.repeat(64),
      consentIdempotencyKey: 'application-1:cv-v1:job-v1',
    });

    const payload = queue.add.mock.calls[0][1];
    expect(payload).toEqual(
      expect.objectContaining({
        cvMatchResultId: 'result-1',
        cvId: 'cv-1',
        userId: 'user-1',
        applicationId: 'application-1',
        jobId: 'job-1',
        cvContentVersion: 'cv-v1',
        contentHash: 'a'.repeat(64),
        jobSourceVersion: 'job-v1',
      }),
    );
    expect(payload).not.toHaveProperty('cvText');
    expect(payload).not.toHaveProperty('cvUrl');
    expect(payload).not.toHaveProperty('candidate');
    expect(payload).not.toHaveProperty('job');
  });
});
