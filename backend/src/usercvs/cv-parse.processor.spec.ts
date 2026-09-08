import { UserCvParseProcessor, UserCvParseJobData } from './cv-parse.processor';
import { CVParseStatus } from './cv-parse-status';
import { aiContentVersion } from './cv-parse.processor';
import { AiServiceClient } from 'src/ai-matching/ai-service.client';

jest.mock('src/ai-matching/cv-download', () => ({
  CvDownloadError: class CvDownloadError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
  downloadTrustedCv: jest.fn().mockResolvedValue(Buffer.from('%PDF-test')),
}));

describe('UserCvParseProcessor', () => {
  const cvId = 'cv-1';
  const jobData: UserCvParseJobData = {
    cvId,
    fileUrl: 'https://cdn.example.test/resume.pdf',
    expectedUrl: 'https://cdn.example.test/resume.pdf',
    contentVersion: 'version-1',
  };

  function setup(
    cv: any = {
      _id: cvId,
      url: jobData.expectedUrl,
      contentVersion: jobData.contentVersion,
      isDeleted: false,
      deletedAt: null,
      fileType: 'pdf',
      contentHash: null,
      skills: ['TypeScript'],
      education: [],
      experience: [],
      certificates: [],
    },
  ) {
    const userCvRepo = {
      findOne: jest.fn().mockResolvedValue(cv),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    } as any;
    const aiMatchingService = {
      parseCv: jest.fn(),
    } as any;

    return {
      processor: new UserCvParseProcessor(userCvRepo, aiMatchingService, {
        get: jest.fn().mockReturnValue(undefined),
      } as any),
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
      fileType: 'pdf',
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
    aiMatchingService.parseCv.mockResolvedValue({
      cv_id: cvId,
      content_version: aiContentVersion(jobData.contentVersion),
      media_type: 'application/pdf',
      content_sha256:
        '3c87d37f1dbea6909f917ce437c390fb8e655a774387d9e69301c0b2283d5b63',
      extracted_text: '  too short  ',
      text_char_count: 12,
      parser_version: 'test',
    });

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
    aiMatchingService.parseCv.mockResolvedValue({
      cv_id: cvId,
      content_version: aiContentVersion(jobData.contentVersion),
      media_type: 'application/pdf',
      content_sha256:
        '3c87d37f1dbea6909f917ce437c390fb8e655a774387d9e69301c0b2283d5b63',
      extracted_text: parsedText,
      text_char_count: parsedText.length,
      parser_version: 'test',
       skills: ['TypeScript', 'NestJS'],
       education: ['Computer Science'],
       experience: ['Backend Engineer'],
       certificates: ['AWS Certified'],
       warnings: ['Some dates were inferred'],
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
        contentHash:
          '3c87d37f1dbea6909f917ce437c390fb8e655a774387d9e69301c0b2283d5b63',
        parseStatus: CVParseStatus.READY,
               skills: ['TypeScript', 'NestJS'],
         education: ['Computer Science'],
         experience: ['Backend Engineer'],
         certificates: ['AWS Certified'],
         warnings: ['Some dates were inferred'],
         parserVersion: 'test',
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
      fileType: 'pdf',
      contentHash: null,
      skills: [],
      education: [],
      experience: [],
      certificates: [],
    };
    const { processor, userCvRepo, aiMatchingService } = setup(currentCv);
    aiMatchingService.parseCv.mockResolvedValue({
      cv_id: cvId,
      content_version: aiContentVersion(jobData.contentVersion),
      media_type: 'application/pdf',
      content_sha256:
        '3c87d37f1dbea6909f917ce437c390fb8e655a774387d9e69301c0b2283d5b63',
      extracted_text: 'A sufficiently long parsed resume body',
      text_char_count: 40,
      parser_version: 'test',
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
    aiMatchingService.parseCv.mockResolvedValue({
      cv_id: cvId,
      content_version: aiContentVersion(jobData.contentVersion),
      media_type: 'application/pdf',
      content_sha256:
        '3c87d37f1dbea6909f917ce437c390fb8e655a774387d9e69301c0b2283d5b63',
      extracted_text: 'A sufficiently long parsed resume body',
      text_char_count: 40,
      parser_version: 'test',
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
    aiMatchingService.parseCv.mockRejectedValue(new Error('DOWNLOAD_FAILED'));
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

  it('accepts bounded structured parse fields and rejects malformed or unknown fields', () => {
    const client = new AiServiceClient({ get: jest.fn() } as any);
    const request = {
      cv_id: '00000000-0000-4000-8000-000000000001',
      filename: 'cv.pdf',
      media_type: 'application/pdf',
      content_version: 1,
    };
    const extractedText = 'A valid extracted CV text';
    const response = {
      cv_id: request.cv_id,
      content_version: request.content_version,
      media_type: request.media_type,
      content_sha256: 'a'.repeat(64),
      extracted_text: extractedText,
      text_char_count: extractedText.length,
      parser_version: 'parser-v1',
      skills: ['TypeScript'],
      education: ['Computer Science'],
      experience: ['Backend Engineer'],
      certificates: ['AWS Certified'],
      warnings: ['A date was inferred'],
    };

    expect((client as any).validateParseResponse(response, request)).toEqual(response);
    expect(() =>
      (client as any).validateParseResponse(
        { ...response, skills: ['x'.repeat(501)] },
        request,
      ),
    ).toThrow('Invalid parse response');
    expect(() =>
      (client as any).validateParseResponse(
        { ...response, warnings: ['bad\u0000warning'] },
        request,
      ),
    ).toThrow('Invalid parse response');
    expect(() =>
      (client as any).validateParseResponse(
        { ...response, provider_debug: 'not allowed' },
        request,
      ),
    ).toThrow('unsupported fields');
  });

});
