import { UserCvParseProcessor, UserCvParseJobData } from './cv-parse.processor';
import { CVParseStatus } from './cv-parse-status';

describe('UserCvParseProcessor', () => {
  const cvId = 'cv-1';
  const jobData: UserCvParseJobData = {
    cvId,
    fileUrl: 'https://cdn.example.test/resume.pdf',
    expectedUrl: 'https://cdn.example.test/resume.pdf',
    contentVersion: 'version-1',
  };

  function setup(cv: any = {
    _id: cvId,
    url: jobData.expectedUrl,
    contentVersion: jobData.contentVersion,
    isDeleted: false,
    deletedAt: null,
  }) {
    const userCvRepo = {
      findOne: jest.fn().mockResolvedValue(cv),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    } as any;
    const aiMatchingService = {
      extractTextFromFile: jest.fn(),
      extractSectionsFromText: jest.fn(),
    } as any;

    return {
      processor: new UserCvParseProcessor(userCvRepo, aiMatchingService),
      userCvRepo,
      aiMatchingService,
    };
  }

  it('skips a missing CV or an incomplete/stale job without changing status', async () => {
    const missing = setup(null);
    await missing.processor.handleParse({ data: jobData } as any);
    expect(missing.userCvRepo.update).not.toHaveBeenCalled();

    const stale = setup({
      _id: cvId,
      url: 'https://cdn.example.test/new-resume.pdf',
      contentVersion: 'version-2',
      isDeleted: false,
      deletedAt: null,
    });
    await stale.processor.handleParse({ data: jobData } as any);
    expect(stale.userCvRepo.update).not.toHaveBeenCalled();

    const deleted = setup({
      _id: cvId,
      url: jobData.expectedUrl,
      contentVersion: jobData.contentVersion,
      isDeleted: false,
      deletedAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    await deleted.processor.handleParse({ data: jobData } as any);
    expect(deleted.userCvRepo.update).not.toHaveBeenCalled();
  });

  it('marks the current CV as failed for empty parsed content', async () => {
    const { processor, userCvRepo, aiMatchingService } = setup();
    aiMatchingService.extractTextFromFile.mockResolvedValue('  too short  ');

    await expect(
      processor.handleParse({ data: jobData } as any),
    ).rejects.toThrow('PARSE_EMPTY_CONTENT');

    expect(userCvRepo.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        _id: cvId,
        contentVersion: jobData.contentVersion,
      }),
      expect.objectContaining({
        parseStatus: CVParseStatus.FAILED,
        parseErrorCode: 'PARSE_EMPTY_CONTENT',
      }),
    );
  });

  it('stores parsed content and READY status for the current CV', async () => {
    const { processor, userCvRepo, aiMatchingService } = setup();
    const parsedText = 'A sufficiently long parsed resume body';
    aiMatchingService.extractTextFromFile.mockResolvedValue(parsedText);
    aiMatchingService.extractSectionsFromText.mockReturnValue({
      skills: ['TypeScript'],
      education: [],
      experience: ['Backend'],
      certificates: [],
    });

    await processor.handleParse({ data: jobData } as any);

    expect(userCvRepo.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        _id: cvId,
        url: jobData.expectedUrl,
        contentVersion: jobData.contentVersion,
      }),
      expect.objectContaining({
        parsedText,
        contentHash: expect.any(String),
        parseStatus: CVParseStatus.READY,
        skills: ['TypeScript'],
      }),
    );
  });

  it('does not write a parse result when the CV changes during extraction', async () => {
    const currentCv = {
      _id: cvId,
      url: jobData.expectedUrl,
      contentVersion: jobData.contentVersion,
      isDeleted: false,
      deletedAt: null,
    };
    const { processor, userCvRepo, aiMatchingService } = setup(currentCv);
    aiMatchingService.extractTextFromFile.mockResolvedValue(
      'A sufficiently long parsed resume body',
    );
    aiMatchingService.extractSectionsFromText.mockReturnValue({
      skills: [],
      education: [],
      experience: [],
      certificates: [],
    });
    userCvRepo.findOne
      .mockResolvedValueOnce(currentCv)
      .mockResolvedValueOnce({ ...currentCv, contentVersion: 'version-2' });

    await processor.handleParse({ data: jobData } as any);

    expect(userCvRepo.update).toHaveBeenCalledTimes(1);
    expect(userCvRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ contentVersion: jobData.contentVersion }),
      expect.objectContaining({ parseStatus: CVParseStatus.PROCESSING }),
    );
  });

  it('guards the READY write when the update loses a version race', async () => {
    const { processor, userCvRepo, aiMatchingService } = setup();
    aiMatchingService.extractTextFromFile.mockResolvedValue(
      'A sufficiently long parsed resume body',
    );
    aiMatchingService.extractSectionsFromText.mockReturnValue({
      skills: [],
      education: [],
      experience: [],
      certificates: [],
    });
    userCvRepo.update
      .mockResolvedValueOnce({ affected: 1 })
      .mockResolvedValueOnce({ affected: 0 });

    await processor.handleParse({ data: jobData } as any);

    expect(userCvRepo.update).toHaveBeenCalledTimes(2);
    expect(userCvRepo.update.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        _id: cvId,
        url: jobData.expectedUrl,
        contentVersion: jobData.contentVersion,
        isDeleted: false,
        deletedAt: null,
      }),
    );
    expect(userCvRepo.update.mock.calls[1][1]).toEqual(
      expect.objectContaining({ parseStatus: CVParseStatus.READY }),
    );
  });

  it('guards the FAILED write when the update loses a deletion race', async () => {
    const { processor, userCvRepo, aiMatchingService } = setup();
    aiMatchingService.extractTextFromFile.mockRejectedValue(
      new Error('DOWNLOAD_FAILED'),
    );
    userCvRepo.update
      .mockResolvedValueOnce({ affected: 1 })
      .mockResolvedValueOnce({ affected: 0 });

    await expect(
      processor.handleParse({ data: jobData } as any),
    ).resolves.toBeUndefined();

    expect(userCvRepo.update).toHaveBeenCalledTimes(2);
    expect(userCvRepo.update.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        _id: cvId,
        url: jobData.expectedUrl,
        contentVersion: jobData.contentVersion,
        isDeleted: false,
        deletedAt: null,
      }),
    );
    expect(userCvRepo.update.mock.calls[1][1]).toEqual(
      expect.objectContaining({ parseStatus: CVParseStatus.FAILED }),
    );
  });
});
