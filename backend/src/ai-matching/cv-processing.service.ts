import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Repository } from 'typeorm';
import {
  CVMatchResult,
  CVProcessingStatus,
} from './entities/cv-match-result.entity';
import { CVProcessingJobData } from './cv-processing.processor';

@Injectable()
export class CVProcessingService {
  private readonly logger = new Logger(CVProcessingService.name);

  constructor(
    @InjectRepository(CVMatchResult)
    private readonly cvMatchResultRepo: Repository<CVMatchResult>,
    @InjectQueue('cv-processing')
    private readonly cvProcessingQueue: Queue,
  ) {}

  /**
   * Queue CV processing when an application is created
   * Uses pre-parsed CV text from DB (no file download needed)
   */
  async queueCVProcessing(params: {
    cvId: string;
    userId: string;
    applicationId: string;
    cvUrl: string;
    cvText: string;
    job: {
      _id: string;
      name: string;
      description?: string;
      skills?: string[];
      level?: string;
    };
  }): Promise<CVMatchResult> {
    const { cvId, userId, applicationId, cvUrl, cvText, job } = params;

    const existing = await this.cvMatchResultRepo.findOne({
      where: {
        cvId,
        jobId: job._id,
      },
    });

    if (existing) {
      this.logger.log(
        `CV match result already exists for CV ${cvId} and Job ${job._id}`,
      );

      if (
        existing.status === CVProcessingStatus.FAILED ||
        existing.status === CVProcessingStatus.PENDING
      ) {
        await this.cvProcessingQueue.add(
          'reprocess-cv',
          {
            cvMatchResultId: existing._id,
          },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
          },
        );
      }

      return existing;
    }

    const cvMatchResult = this.cvMatchResultRepo.create({
      cvId,
      userId,
      jobId: job._id,
      applicationId,
      cvUrl,
      status: CVProcessingStatus.PENDING,
    });

    const savedResult = await this.cvMatchResultRepo.save(cvMatchResult);

    const jobSkills = Array.isArray(job.skills)
      ? job.skills.map((s: any) => (typeof s === 'string' ? s : s.name))
      : [];

    const jobData: CVProcessingJobData = {
      cvMatchResultId: savedResult._id,
      cvText,
      jobId: job._id,
      jobName: job.name,
      jobDescription: job.description || '',
      jobSkills,
      jobLevel: job.level || '',
    };

    await this.cvProcessingQueue.add('process-cv', jobData, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
      removeOnFail: false,
    });

    this.logger.log(`Queued CV processing: CV ${cvId} for Job ${job._id}`);

    return savedResult;
  }

  /**
   * Get pre-calculated ranked candidates for a job
   * Fast query from database instead of real-time processing
   */
  async getRankedCandidates(
    jobId: string,
    topN = 10,
  ): Promise<CVMatchResult[]> {
    return await this.cvMatchResultRepo.find({
      where: {
        jobId,
        status: CVProcessingStatus.COMPLETED,
        isDeleted: false,
      },
      order: { matchScore: 'DESC' },
      take: topN,
      relations: ['userId', 'cvId', 'applicationId'],
    });
  }

  /**
   * Get processing status for a job
   */
  async getProcessingStatus(jobId: string): Promise<{
    total: number;
    completed: number;
    processing: number;
    pending: number;
    failed: number;
  }> {
    const stats = await this.cvMatchResultRepo
      .createQueryBuilder('result')
      .select('result.status', 'status')
      .addSelect('COUNT(result._id)', 'count')
      .where('result.jobId = :jobId', { jobId })
      .andWhere('result.isDeleted = :isDeleted', { isDeleted: false })
      .groupBy('result.status')
      .getRawMany();

    const result = {
      total: 0,
      completed: 0,
      processing: 0,
      pending: 0,
      failed: 0,
    };

    for (const stat of stats) {
      const count = parseInt(stat.count, 10);
      result.total += count;
      switch (stat.status) {
        case CVProcessingStatus.COMPLETED:
          result.completed = count;
          break;
        case CVProcessingStatus.PROCESSING:
          result.processing = count;
          break;
        case CVProcessingStatus.PENDING:
          result.pending = count;
          break;
        case CVProcessingStatus.FAILED:
          result.failed = count;
          break;
      }
    }

    return result;
  }

  /**
   * Reprocess failed CVs for a job
   */
  async reprocessFailedCVs(jobId: string): Promise<number> {
    const failedResults = await this.cvMatchResultRepo.find({
      where: {
        jobId,
        status: CVProcessingStatus.FAILED,
        isDeleted: false,
      },
    });

    for (const result of failedResults) {
      await this.cvProcessingQueue.add(
        'reprocess-cv',
        {
          cvMatchResultId: result._id,
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        },
      );
    }

    this.logger.log(
      `Requeued ${failedResults.length} failed CV processing jobs for Job ${jobId}`,
    );

    return failedResults.length;
  }

  /**
   * Delete match results when application is deleted
   */
  async deleteByApplication(applicationId: string): Promise<void> {
    await this.cvMatchResultRepo.update({ applicationId }, { isDeleted: true });
  }

  /**
   * Re-process all CVs for a job when job details are updated
   */
  async reprocessAllCVsForJob(
    jobId: string,
    jobData: {
      name: string;
      description?: string;
      skills?: string[];
      level?: string;
    },
  ): Promise<number> {
    const allResults = await this.cvMatchResultRepo.find({
      where: {
        jobId,
        isDeleted: false,
      },
    });

    if (allResults.length === 0) {
      this.logger.log(`No CV match results found for Job ${jobId}`);
      return 0;
    }

    const jobSkills = Array.isArray(jobData.skills)
      ? jobData.skills.map((s: any) => (typeof s === 'string' ? s : s.name))
      : [];

    for (const result of allResults) {
      await this.cvMatchResultRepo.update(result._id, {
        status: CVProcessingStatus.PENDING,
        matchScore: 0,
        matchedSkills: [],
        missingSkills: [],
        explanation: null as any,
      });

      const jobProcessingData: CVProcessingJobData = {
        cvMatchResultId: result._id,
        cvText: result.cvText || '',
        jobId: jobId,
        jobName: jobData.name,
        jobDescription: jobData.description || '',
        jobSkills,
        jobLevel: jobData.level || '',
      };

      await this.cvProcessingQueue.add('process-cv', jobProcessingData, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: false,
      });
    }

    this.logger.log(
      `Requeued ${allResults.length} CV processing jobs for updated Job ${jobId}`,
    );

    return allResults.length;
  }

  /**
   * Re-process CV when user updates their CV
   */
  async reprocessCVForAllJobs(cvId: string, cvUrl: string): Promise<number> {
    const allResults = await this.cvMatchResultRepo.find({
      where: {
        cvId,
        isDeleted: false,
      },
      relations: ['job'],
    });

    if (allResults.length === 0) {
      this.logger.log(`No job applications found for CV ${cvId}`);
      return 0;
    }

    for (const result of allResults) {
      const job = result.job;
      if (!job) continue;

      await this.cvMatchResultRepo.update(result._id, {
        status: CVProcessingStatus.PENDING,
        cvUrl,
        matchScore: 0,
        matchedSkills: [],
        missingSkills: [],
        explanation: null as any,
      });

      const jobSkills = Array.isArray(job.skills)
        ? job.skills.map((s: any) => (typeof s === 'string' ? s : s.name))
        : [];

      const jobProcessingData: CVProcessingJobData = {
        cvMatchResultId: result._id,
        cvText: result.cvText || '',
        jobId: job._id,
        jobName: job.name,
        jobDescription: job.description || '',
        jobSkills,
        jobLevel: job.level || '',
      };

      await this.cvProcessingQueue.add('process-cv', jobProcessingData, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: false,
      });
    }

    this.logger.log(
      `Requeued ${allResults.length} CV processing jobs for updated CV ${cvId}`,
    );

    return allResults.length;
  }
}
