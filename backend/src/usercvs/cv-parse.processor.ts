import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job as BullJob } from 'bull';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { AIMatchingService } from 'src/ai-matching/ai-matching.service';
import { CVParseStatus } from './cv-parse-status';
import { UserCV } from './entities/usercv.entity';

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

@Injectable()
@Processor('user-cv-parse')
export class UserCvParseProcessor {
  private readonly logger = new Logger(UserCvParseProcessor.name);

  constructor(
    @InjectRepository(UserCV)
    private readonly userCvRepo: Repository<UserCV>,
    private readonly aiMatchingService: AIMatchingService,
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
        deletedAt: null,
        url: job.data.expectedUrl,
        contentVersion: job.data.contentVersion,
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
       const parsedText = (
         await this.aiMatchingService.extractTextFromFile(expectedUrl)
       ).trim();
      if (parsedText.length < 10) {
        throw new Error('PARSE_EMPTY_CONTENT');
      }

      const sections = this.aiMatchingService.extractSectionsFromText(parsedText);
      const currentCV = await this.userCvRepo.findOne({ where: { _id: cvId } });
      if (!currentCV || !isCurrentParseJob(currentCV, job.data)) {
        this.logger.warn(`Skipping stale CV parse result: ${cvId}`);
        return;
      }

      const readyUpdate = await this.userCvRepo.update(
        {
          _id: cvId,
          isDeleted: false,
          deletedAt: null,
          url: job.data.expectedUrl,
          contentVersion: job.data.contentVersion,
        },
        {
          parsedText,
          skills: sections.skills,
          education: sections.education,
          experience: sections.experience,
          certificates: sections.certificates,
          contentHash: createHash('sha256').update(parsedText, 'utf8').digest('hex'),
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
      const errorCode = error instanceof Error ? error.message : 'PARSE_FAILED';
      const currentCV = await this.userCvRepo.findOne({ where: { _id: cvId } });
      if (currentCV && isCurrentParseJob(currentCV, job.data)) {
        const failedUpdate = await this.userCvRepo.update(
          {
            _id: cvId,
            isDeleted: false,
            deletedAt: null,
            url: job.data.expectedUrl,
            contentVersion: job.data.contentVersion,
          },
          {
            parseStatus: CVParseStatus.FAILED,
            parseErrorCode: errorCode.slice(0, 80),
            parsedAt: null,
          },
        );
        if (failedUpdate.affected === 0) {
          this.logger.warn(`CV changed before FAILED status was stored: ${cvId}`);
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
