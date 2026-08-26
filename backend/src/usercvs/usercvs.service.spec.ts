import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { UserCVsService } from './usercvs.service';
import { CVParseStatus } from './cv-parse-status';
import { getActiveAiCvConsentPolicy } from '../ai-consents/ai-cv-consent.policy';

describe('UserCVsService.createAiSnapshot', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const cvId = '22222222-2222-4222-8222-222222222222';
  const activePolicy = getActiveAiCvConsentPolicy();
  const consentArgs = [
    activePolicy.scope,
    activePolicy.consentVersion,
    activePolicy.policyHash,
  ] as const;

  const readyCv = {
    _id: cvId,
    userId,
    isDeleted: false,
    deletedAt: null,
    parseStatus: CVParseStatus.READY,
    contentHash: 'b'.repeat(64),
    title: 'Resume',
    skills: ['TypeScript'],
    education: [],
    experience: [],
    certificates: [],
    parsedText: 'safe parsed text',
  };

  function setup(cv = readyCv, validConsent = true) {
    const cvRepo = {
      findOne: jest.fn().mockResolvedValue(cv),
    } as any;
    const consentService = {
      hasValidConsent: jest.fn().mockResolvedValue(validConsent),
    } as any;
    return {
      service: new UserCVsService(cvRepo, {} as any, consentService),
      cvRepo,
      consentService,
    };
  }

  it('denies a snapshot for an unknown or foreign CV', async () => {
    const { service, consentService } = setup(null);

    await expect(
      service.createAiSnapshot(userId, cvId, ...consentArgs),
    ).rejects.toThrow(NotFoundException);
    expect(consentService.hasValidConsent).not.toHaveBeenCalled();
  });

  it('denies a snapshot unless parsing is READY and contentHash is present', async () => {
    const { service } = setup({ ...readyCv, parseStatus: CVParseStatus.PENDING });

    await expect(
      service.createAiSnapshot(userId, cvId, ...consentArgs),
    ).rejects.toThrow(ConflictException);
  });

  it('denies a ready CV without valid consent', async () => {
    const { service, consentService } = setup(readyCv, false);

    await expect(
      service.createAiSnapshot(userId, cvId, ...consentArgs),
    ).rejects.toThrow(BadRequestException);
    expect(consentService.hasValidConsent).toHaveBeenCalledWith(
      userId,
      ...consentArgs,
    );
  });

  it('denies a READY CV when its content hash is empty', async () => {
    const { service, consentService } = setup({ ...readyCv, contentHash: '   ' });

    await expect(
      service.createAiSnapshot(userId, cvId, ...consentArgs),
    ).rejects.toThrow(ConflictException);
    expect(consentService.hasValidConsent).not.toHaveBeenCalled();
  });

  it('creates a bounded snapshot only after ownership, readiness and consent checks', async () => {
    const { service, cvRepo, consentService } = setup();

    await expect(
      service.createAiSnapshot(userId, cvId, ...consentArgs),
    ).resolves.toEqual(
      expect.objectContaining({
        cvId,
        contentHash: readyCv.contentHash,
        skills: ['TypeScript'],
        sanitizedText: readyCv.parsedText,
      }),
    );
    expect(cvRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ _id: cvId, userId, isDeleted: false }),
      }),
    );
    expect(consentService.hasValidConsent).toHaveBeenCalledTimes(1);
  });
});

describe('UserCVsService.update uploaded source', () => {
  const user = {
    _id: '11111111-1111-4111-8111-111111111111',
    email: 'candidate@example.test',
  } as any;
  const originalCv = {
    _id: '22222222-2222-4222-8222-222222222222',
    userId: user._id,
    url: 'https://cdn.example.test/old.pdf',
    fileType: 'pdf',
    contentVersion: 'old-version',
    parsedText: 'stale parsed text',
    contentHash: 'a'.repeat(64),
    parseStatus: CVParseStatus.READY,
    parseErrorCode: null,
    parsedAt: new Date('2026-01-01T00:00:00.000Z'),
    skills: ['old skill'],
    education: ['old education'],
    experience: ['old experience'],
    certificates: ['old certificate'],
    isSearchable: true,
    isPrimary: true,
    isDeleted: false,
  };

  const originalRedisEnabled = process.env.REDIS_ENABLED;
  const originalBackgroundJobs = process.env.RUN_BACKGROUND_JOBS;

  afterEach(() => {
    if (originalRedisEnabled === undefined) delete process.env.REDIS_ENABLED;
    else process.env.REDIS_ENABLED = originalRedisEnabled;
    if (originalBackgroundJobs === undefined) {
      delete process.env.RUN_BACKGROUND_JOBS;
    } else {
      process.env.RUN_BACKGROUND_JOBS = originalBackgroundJobs;
    }
  });

  function setup(updatedCv = { ...originalCv, url: 'https://cdn.example.test/new.docx', contentVersion: 'new-version', fileType: 'docx' }) {
    process.env.REDIS_ENABLED = 'true';
    process.env.RUN_BACKGROUND_JOBS = 'true';
    const cvRepo = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(originalCv)
        .mockResolvedValueOnce(updatedCv),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    } as any;
    const cvParseQueue = { add: jest.fn().mockResolvedValue(undefined) } as any;
    const service = new UserCVsService(cvRepo, cvParseQueue, {} as any);
    return { service, cvRepo, cvParseQueue };
  }

  it.each([
    ['pdf', 'https://cdn.example.test/new.pdf'],
    ['doc', 'https://cdn.example.test/new.doc'],
    ['docx', 'https://cdn.example.test/new.docx'],
  ])('accepts a %s source update', async (fileType, url) => {
    const updatedCv = {
      ...originalCv,
      url,
      fileType,
      contentVersion: 'rotated-version',
    };
    const { service, cvRepo } = setup(updatedCv);

    await service.update(originalCv._id, { url } as any, user);

    expect(cvRepo.update).toHaveBeenLastCalledWith(
      originalCv._id,
      expect.objectContaining({
        url,
        fileType,
        contentVersion: expect.any(String),
        parsedText: null,
        contentHash: null,
        skills: [],
        education: [],
        experience: [],
        certificates: [],
        parseStatus: CVParseStatus.PENDING,
        parseErrorCode: null,
        parsedAt: null,
      }),
    );
  });

  it('rejects unsupported source extensions before persisting', async () => {
    const { service, cvRepo, cvParseQueue } = setup();

    await expect(
      service.update(originalCv._id, { url: 'https://cdn.example.test/new.txt' } as any, user),
    ).rejects.toThrow('PDF, DOC hoặc DOCX');
    expect(cvRepo.update).not.toHaveBeenCalled();
    expect(cvParseQueue.add).not.toHaveBeenCalled();
  });

  it('enqueues the rotated version and expected URL without changing searchable state', async () => {
    const updatedCv = {
      ...originalCv,
      url: 'https://cdn.example.test/new.doc',
      fileType: 'doc',
      contentVersion: 'rotated-version',
    };
    const { service, cvParseQueue } = setup(updatedCv);

    await service.update(
      originalCv._id,
      { url: updatedCv.url } as any,
      user,
    );

    expect(cvParseQueue.add).toHaveBeenCalledWith(
      'parse-cv',
      expect.objectContaining({
        cvId: originalCv._id,
        fileUrl: updatedCv.url,
        expectedUrl: updatedCv.url,
        contentVersion: 'rotated-version',
      }),
      expect.any(Object),
    );
    expect(cvParseQueue.add.mock.calls[0][1]).not.toHaveProperty('isSearchable');
  });

  it('does not reset or enqueue an online CV update', async () => {
    const updatedCv = { ...originalCv, onlineCvId: 'online-cv-1' };
    const { service, cvRepo, cvParseQueue } = setup(updatedCv);

    await service.update(
      originalCv._id,
      { onlineCvId: 'online-cv-1', url: 'https://cdn.example.test/online' } as any,
      user,
    );

    expect(cvRepo.update).toHaveBeenLastCalledWith(
      originalCv._id,
      expect.not.objectContaining({ parseStatus: CVParseStatus.PENDING }),
    );
    expect(cvParseQueue.add).not.toHaveBeenCalled();
  });
});
