import { OnlineCVsService } from 'src/online-cvs/online-cvs.service';
import { Role } from 'src/decorator/customize';

const user = {
  _id: '11111111-1111-4111-8111-111111111111',
  email: 'candidate@example.com',
  name: 'Candidate Name',
  role: Role.USER,
};

function createExistingService() {
  const cv: any = {
    _id: '22222222-2222-4222-8222-222222222222',
    userId: user._id,
    contentVersion: 1,
    templateType: 'template1',
    position: 'Engineer',
    title: 'CV',
    revision: { contentVersion: 1, sourceTrace: {} },
    isDeleted: false,
  };
  const queue = { add: jest.fn().mockResolvedValue({}) };
  const repo: any = {
    findOne: jest.fn().mockImplementation(async () => cv),
    update: jest
      .fn()
      .mockImplementation(async (_where: unknown, patch: any) => {
        Object.assign(cv, patch);
        return { affected: 1 };
      }),
  };
  const service = Object.create(OnlineCVsService.prototype) as OnlineCVsService;
  Object.assign(service as any, {
    onlineCVRepo: repo,
    generationQueue: queue,
    userRepo: {
      findOne: jest.fn().mockResolvedValue({ ...user, isDeleted: false }),
    },
    usersService: {
      isCandidatePremium: jest.fn().mockReturnValue(false),
      getUserMaxCvLimit: jest.fn().mockReturnValue(3),
    },
    aiCvConsentsService: { hasValidConsent: jest.fn().mockResolvedValue(true) },
    configService: { get: jest.fn() },
    jobsService: { findOne: jest.fn().mockResolvedValue(null) },
  });
  return { service, cv, queue, repo };
}

describe('async online CV generation', () => {
  const previousRedis = process.env.REDIS_ENABLED;

  beforeEach(() => {
    process.env.REDIS_ENABLED = 'true';
  });

  afterAll(() => {
    if (previousRedis === undefined) delete process.env.REDIS_ENABLED;
    else process.env.REDIS_ENABLED = previousRedis;
  });

  it('stores a pending operation and sends only opaque queue data', async () => {
    const { service, queue, cv } = createExistingService();
    const first = await service.enqueueGeneration(
      cv._id,
      { expectedContentVersion: 1 } as any,
      user as any,
      'request-1',
    );

    expect(first.status).toBe('QUEUED');
    expect(first.onlineCvId).toBe(cv._id);
    expect(first).not.toHaveProperty('cvId');
    expect(first.pollAfterSeconds).toBe(5);
    expect(first.acceptedAt).toBe(cv.revision.sourceTrace.generation.createdAt);
    expect(queue.add).toHaveBeenCalledWith(
      'generate-cv',
      expect.objectContaining({
        operationId: first.operationId,
        userId: user._id,
        cvId: cv._id,
        idempotencyKeyHash: expect.not.stringContaining('request-1'),
      }),
      expect.objectContaining({ jobId: first.operationId, attempts: 1 }),
    );
    const queuedPayload = JSON.stringify(queue.add.mock.calls[0][1]);
    expect(queuedPayload).not.toContain(user.email);
    expect(queuedPayload).not.toContain(user.name);
    expect(cv.revision.sourceTrace.generation.status).toBe('QUEUED');

    const replay = await service.enqueueGeneration(
      cv._id,
      { expectedContentVersion: 1 } as any,
      user as any,
      'request-1',
    );
    expect(replay.operationId).toBe(first.operationId);
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('rejects a missing idempotency key before reserving work', async () => {
    const { service, repo, cv } = createExistingService();
    await expect(
      service.enqueueGeneration(
        cv._id,
        { expectedContentVersion: 1 } as any,
        user as any,
        '',
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('does not start a cancelled worker operation', async () => {
    const { service, cv } = createExistingService();
    cv.revision.sourceTrace.generation = {
      operationId: '33333333-3333-4333-8333-333333333333',
      status: 'CANCELLED',
      userId: user._id,
      cvId: cv._id,
    };
    (service as any).aiServiceClient = { generateCvDraft: jest.fn() };
    await service.processGenerationJob({
      operationId: cv.revision.sourceTrace.generation.operationId,
      userId: user._id,
      cvId: cv._id,
    } as any);
    expect(
      (service as any).aiServiceClient.generateCvDraft,
    ).not.toHaveBeenCalled();
  });

  it('maps internal RUNNING to PROCESSING and returns terminal current/draft consistently', async () => {
    const { service, cv } = createExistingService();
    const accepted = await service.enqueueGeneration(
      cv._id,
      { expectedContentVersion: 1 },
      user as any,
      'response-contract',
    );
    const metadata = cv.revision.sourceTrace.generation;
    metadata.status = 'RUNNING';
    expect(
      await service.getGenerationJob(cv._id, accepted.operationId, user as any),
    ).toMatchObject({
      onlineCvId: cv._id,
      status: 'PROCESSING',
      pollAfterSeconds: 5,
      acceptedAt: metadata.createdAt,
    });
    metadata.status = 'COMPLETE';
    expect(
      await service.getGenerationJob(cv._id, accepted.operationId, user as any),
    ).toMatchObject({
      status: 'COMPLETE',
      pollAfterSeconds: 0,
      current: cv,
      draft: cv,
    });
  });

  it('rejects stale and pending editor saves before persistence', async () => {
    const { service, cv, repo } = createExistingService();
    await expect(
      service.update(cv._id, { expectedContentVersion: 2 }, user as any),
    ).rejects.toMatchObject({ status: 409 });
    cv.revision.sourceTrace.generation = { status: 'RUNNING' };
    await expect(
      service.update(cv._id, { expectedContentVersion: 1 }, user as any),
    ).rejects.toMatchObject({ status: 409 });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('fails closed on a stalled RUNNING redelivery without invoking inference', async () => {
    const { service, cv } = createExistingService();
    const accepted = await service.enqueueGeneration(
      cv._id,
      { expectedContentVersion: 1 },
      user as any,
      'stalled',
    );
    cv.revision.sourceTrace.generation.status = 'RUNNING';
    const generate = jest.spyOn(service, 'generate');
    await service.processGenerationJob({
      cvId: cv._id,
      userId: user._id,
      operationId: accepted.operationId,
    } as any);
    expect(generate).not.toHaveBeenCalled();
    expect(cv.revision.sourceTrace.generation).toMatchObject({
      status: 'FAILED',
      errorCode: 'WORKER_INTERRUPTED',
    });
  });

  it('never downgrades a terminal operation after a late worker failure', async () => {
    const { service, cv, repo } = createExistingService();
    const accepted = await service.enqueueGeneration(
      cv._id,
      { expectedContentVersion: 1 },
      user as any,
      'terminal',
    );
    cv.revision.sourceTrace.generation.status = 'COMPLETE';
    repo.update.mockClear();
    await service.markGenerationFailure({
      cvId: cv._id,
      userId: user._id,
      operationId: accepted.operationId,
    } as any);
    expect(repo.update).not.toHaveBeenCalled();
    expect(cv.revision.sourceTrace.generation.status).toBe('COMPLETE');
  });

  it('does not overwrite completion when cancellation loses its atomic CAS', async () => {
    const { service, cv, repo } = createExistingService();
    const accepted = await service.enqueueGeneration(
      cv._id,
      { expectedContentVersion: 1 },
      user as any,
      'cancel-race',
    );
    repo.update.mockImplementationOnce(async (criteria: any) => {
      expect(criteria).toMatchObject({
        _id: cv._id,
        userId: user._id,
        isDeleted: false,
        contentVersion: 1,
      });
      expect(criteria.revision.objectLiteralParameters.expectedRevision).toBe(
        JSON.stringify(cv.revision),
      );
      cv.revision.sourceTrace.generation.status = 'COMPLETE';
      return { affected: 0 };
    });
    expect(
      await service.cancelGeneration(cv._id, accepted.operationId, user as any),
    ).toMatchObject({ status: 'COMPLETE', current: cv, draft: cv });
  });
});
