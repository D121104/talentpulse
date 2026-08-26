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
    const { cvId, fileUrl } = job.data;
    const cv = await this.userCvRepo.findOne({ where: { _id: cvId } });

    if (!cv || cv.isDeleted) {
      return;
    }

    await this.userCvRepo.update(cvId, {
      parseStatus: CVParseStatus.PROCESSING,
      parseErrorCode: null,
      parsedAt: null,
    });

    try {
      const parsedText = (await this.aiMatchingService.extractTextFromFile(fileUrl)).trim();
      if (parsedText.length < 10) {
        throw new Error('PARSE_EMPTY_CONTENT');
      }

      const sections = this.aiMatchingService.extractSectionsFromText(parsedText);
      await this.userCvRepo.update(cvId, {
        parsedText,
        skills: sections.skills,
        education: sections.education,
        experience: sections.experience,
        certificates: sections.certificates,
        contentHash: createHash('sha256').update(parsedText, 'utf8').digest('hex'),
        parsedAt: new Date(),
        parseErrorCode: null,
        parseStatus: CVParseStatus.READY,
      });
      this.logger.log(`CV parse completed: ${cvId}`);
    } catch (error) {
      const errorCode = error instanceof Error ? error.message : 'PARSE_FAILED';
      await this.userCvRepo.update(cvId, {
        parseStatus: CVParseStatus.FAILED,
        parseErrorCode: errorCode.slice(0, 80),
        parsedAt: null,
      });
      this.logger.warn(`CV parse failed: ${cvId}`);
      throw error;
    }
  }
}
