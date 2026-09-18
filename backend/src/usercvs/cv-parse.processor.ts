import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Job as BullJob } from 'bull';
import { createHash } from 'crypto';
import { IsNull, Repository } from 'typeorm';
import {
  AiServiceClient,
  AiServiceError,
} from 'src/ai-matching/ai-service.client';
import {
  CvDownloadError,
  downloadTrustedCv,
} from 'src/ai-matching/cv-download';
import { CVParseStatus } from './cv-parse-status';
import { UserCV } from './entities/usercv.entity';

/** Deterministic integer adapter for the FastAPI contract; local fencing remains UUID-based. */
export function aiContentVersion(contentVersion: string): number {
  let hash = 2166136261;
  for (let index = 0; index < contentVersion.length; index += 1) {
    hash = Math.imul(hash ^ contentVersion.charCodeAt(index), 16777619);
  }
  return ((hash >>> 0) % 2147483647) + 1;
}

export interface UserCvParseJobData {
  cvId: string;
  fileUrl: string;
  expectedUrl: string;
  contentVersion: string;
}

export function isCurrentParseJob(
  cv: Pick<UserCV, 'url' | 'contentVersion' | 'isDeleted' | 'deletedAt'>,
  data: Pick<UserCvParseJobData, 'expectedUrl' | 'contentVersion'>,
): boolean {
  return Boolean(
    !cv.isDeleted &&
      !cv.deletedAt &&
      data.expectedUrl &&
      data.contentVersion &&
      cv.url === data.expectedUrl &&
      cv.contentVersion === data.contentVersion,
  );
}

function fileTypeForCv(cv: Pick<UserCV, 'fileType'>): 'pdf' | 'docx' {
  if (cv.fileType === 'pdf' || cv.fileType === 'docx') return cv.fileType;
  throw new Error('UNSUPPORTED_MEDIA_TYPE');
}

function filenameForCv(
  url: string,
  fileType: 'pdf' | 'docx',
  cvId: string,
): string {
  const candidate = url.split('?')[0].split('#')[0].split('/').pop() || '';
  const filename =
    candidate.length > 0 && candidate.toLowerCase().endsWith(`.${fileType}`)
      ? candidate
      : `${cvId}.${fileType}`;
  return filename.slice(0, 255);
}

@Injectable()
@Processor('user-cv-parse')
export class UserCvParseProcessor {
  private readonly logger = new Logger(UserCvParseProcessor.name);

  constructor(
    @InjectRepository(UserCV)
    private readonly userCvRepo: Repository<UserCV>,
    private readonly aiServiceClient: AiServiceClient,
    private readonly configService: ConfigService,
  ) {}

  @Process('parse-cv')
  async handleParse(job: BullJob<UserCvParseJobData>): Promise<void> {
    const { cvId, expectedUrl, contentVersion } = job.data;
    const cv = await this.userCvRepo.findOne({ where: { _id: cvId } });

    if (!cv || !isCurrentParseJob(cv, job.data)) {
      this.logger.warn(`Skipping stale or incomplete CV parse job: ${cvId}`);
      return;
    }

    const processingUpdate = await this.userCvRepo.update(
      {
        _id: cvId,
        isDeleted: false,
        deletedAt: IsNull(),
        url: expectedUrl,
        contentVersion,
      },
      {
        parseStatus: CVParseStatus.PROCESSING,
        parseErrorCode: null,
        parsedAt: null,
      },
    );
    if (processingUpdate.affected === 0) {
      this.logger.warn(`CV changed before processing started: ${cvId}`);
      return;
    }

    try {
      const fileType = fileTypeForCv(cv);
      const content = await downloadTrustedCv(
        expectedUrl,
        fileType,
        this.configService,
      );
      const downloadedHash = createHash('sha256').update(content).digest('hex');
      const response = await this.aiServiceClient.parseCv({
        cv_id: cvId,
        filename: filenameForCv(expectedUrl, fileType, cvId),
        media_type:
          fileType === 'pdf'
            ? 'application/pdf'
            : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        content_base64: content.toString('base64'),
        content_version: aiContentVersion(contentVersion),
      });

      if (response.content_version !== aiContentVersion(contentVersion)) {
        throw new Error('AI_CONTENT_VERSION_MISMATCH');
      }
      if (response.content_sha256 !== downloadedHash) {
        throw new Error('AI_CONTENT_HASH_MISMATCH');
      }
      const parsedText = response.extracted_text.trim();
      if (parsedText.length < 10) throw new Error('PARSE_EMPTY_CONTENT');

      const currentCV = await this.userCvRepo.findOne({ where: { _id: cvId } });
      if (!currentCV || !isCurrentParseJob(currentCV, job.data)) {
        this.logger.warn(`Skipping stale CV parse result: ${cvId}`);
        return;
      }

      const readyUpdate = await this.userCvRepo.update(
        {
          _id: cvId,
          isDeleted: false,
          deletedAt: IsNull(),
          url: expectedUrl,
          contentVersion,
        },
        {
          parsedText,
          contentHash: response.content_sha256,
          skills: response.skills ?? [],
          education: response.education ?? [],
          experience: response.experience ?? [],
          certificates: response.certificates ?? [],
          warnings: response.warnings ?? [],
          parserVersion: response.parser_version,
          parsedAt: new Date(),
          parseErrorCode: null,
          parseStatus: CVParseStatus.READY,
        },
      );
      if (readyUpdate.affected === 0) {
        this.logger.warn(`CV changed before READY status was stored: ${cvId}`);
        return;
      }
      this.logger.log(`CV parse completed: ${cvId}`);
    } catch (error) {
      const errorCode =
        error instanceof AiServiceError || error instanceof CvDownloadError
          ? error.code
          : error instanceof Error
          ? error.message
          : 'PARSE_FAILED';
      const currentCV = await this.userCvRepo.findOne({ where: { _id: cvId } });
      if (currentCV && isCurrentParseJob(currentCV, job.data)) {
        const failedUpdate = await this.userCvRepo.update(
          {
            _id: cvId,
            isDeleted: false,
            deletedAt: IsNull(),
            url: expectedUrl,
            contentVersion,
          },
          {
            parseStatus: CVParseStatus.FAILED,
            parseErrorCode: errorCode.slice(0, 80),
            parsedAt: null,
          },
        );
        if (failedUpdate.affected === 0) {
          this.logger.warn(
            `CV changed before FAILED status was stored: ${cvId}`,
          );
          return;
        }
      } else {
        this.logger.warn(`Skipping stale CV parse failure: ${cvId}`);
        return;
      }
      this.logger.warn(`CV parse failed: ${cvId}`);
      throw error;
    }
  }
}
