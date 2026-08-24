import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AIMatchingService } from './ai-matching.service';
import {
  CVMatchResult,
  CVProcessingStatus,
} from './entities/cv-match-result.entity';

export interface CVProcessingJobData {
  cvMatchResultId: string;
  cvText: string; // Pre-parsed text from DB (no re-download needed)
  jobId: string;
  jobName: string;
  jobDescription: string;
  jobSkills: string[];
  jobLevel: string;
}

// Bull Queue Worker: processes CV matching jobs asynchronously in background
@Processor('cv-processing')
export class CVProcessingProcessor {
  private readonly logger = new Logger(CVProcessingProcessor.name);

  constructor(
    private readonly aiMatchingService: AIMatchingService,
    @InjectRepository(CVMatchResult)
    private readonly cvMatchResultRepo: Repository<CVMatchResult>,
  ) {}

  // Main processor: runs AI matching pipeline for a single CV against JD
  @Process('process-cv')
  async handleProcessCV(job: Job<CVProcessingJobData>) {
    const {
      cvMatchResultId,
      cvText,
      jobName,
      jobDescription,
      jobSkills,
      jobLevel,
    } = job.data;

    this.logger.log(`Processing CV match: ${cvMatchResultId}`);

    try {
      await this.cvMatchResultRepo.update(cvMatchResultId, {
        status: CVProcessingStatus.PROCESSING,
      });

      // 1. Create JD text and embedding
      const jdText = this.aiMatchingService.createJDText({
        name: jobName,
        description: jobDescription,
        skills: jobSkills,
        level: jobLevel,
      });

      const jdEmbedding = await this.aiMatchingService.generateEmbedding(
        jdText,
      );

      // 2. Match CV with JD using pre-parsed text
      const matchResult = await this.aiMatchingService.matchCVWithJD(
        cvText,
        jdText,
        jdEmbedding,
        jobSkills,
      );

      // 3. Generate and store CV embedding vector for future similarity queries
      const cvEmbedding = matchResult.cvText
        ? await this.aiMatchingService.generateEmbedding(matchResult.cvText)
        : [];

      // 4. Update result in database
      await this.cvMatchResultRepo.update(cvMatchResultId, {
        cvText: matchResult.cvText,
        cvEmbedding,
        matchScore: matchResult.matchScore,
        matchedSkills: matchResult.matchedSkills,
        missingSkills: matchResult.missingSkills,
        explanation: matchResult.explanation,
        status: CVProcessingStatus.COMPLETED,
        processedAt: new Date(),
      });

      this.logger.log(
        `CV match completed: ${cvMatchResultId}, score: ${matchResult.matchScore}`,
      );

      return { success: true, matchScore: matchResult.matchScore };
    } catch (error) {
      this.logger.error(`CV processing failed: ${cvMatchResultId}`, error);

      await this.cvMatchResultRepo.update(cvMatchResultId, {
        status: CVProcessingStatus.FAILED,
        errorMessage: error.message || 'Unknown error',
      });

      throw error;
    }
  }

  // Retry processor: re-runs failed/pending jobs by loading original data from DB
  @Process('reprocess-cv')
  async handleReprocessCV(job: Job<{ cvMatchResultId: string }>) {
    const result = await this.cvMatchResultRepo.findOne({
      where: { _id: job.data.cvMatchResultId },
      relations: ['job', 'cv'],
    });

    if (!result || !result.job) {
      this.logger.warn(
        `CV match result not found: ${job.data.cvMatchResultId}`,
      );
      return;
    }

    const cvText = result.cv?.parsedText || result.cvText || '';

    const jobData: CVProcessingJobData = {
      cvMatchResultId: job.data.cvMatchResultId,
      cvText,
      jobId: result.job._id,
      jobName: result.job.name,
      jobDescription: result.job.description || '',
      jobSkills: Array.isArray(result.job.skills)
        ? result.job.skills.map((s: any) =>
            typeof s === 'string' ? s : s.name,
          )
        : [],
      jobLevel: result.job.level || '',
    };

    return this.handleProcessCV({
      ...job,
      data: jobData,
    } as Job<CVProcessingJobData>);
  }
}
