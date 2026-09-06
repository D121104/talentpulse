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

const retryOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000 },
};

@Injectable()
export class CVProcessingService {
  private readonly logger = new Logger(CVProcessingService.name);

  constructor(
    @InjectRepository(CVMatchResult)
    private readonly cvMatchResultRepo: Repository<CVMatchResult>,
    @InjectQueue('cv-processing')
    private readonly cvProcessingQueue: Queue,
  ) {}

  /** Queue only opaque IDs, versions, hashes and consent fencing data. */
  async queueCVProcessing(params: {
    cvId: string;
    userId: string;
    applicationId: string;
    cvContentVersion: string;
    contentHash: string;
    jobId: string;
    jobSourceVersion: string;
    aiRankingConsentGranted: true;
    aiRankingConsentVersion: string;
    aiRankingConsentPolicyHash: string;
    consentIdempotencyKey: string;
  }): Promise<CVMatchResult> {
    const existing = await this.cvMatchResultRepo.findOne({
      where: { cvId: params.cvId, jobId: params.jobId },
    });

    if (existing) {
      this.logger.log(
        `CV match result already exists for CV ${params.cvId} and Job ${params.jobId}`,
      );
      if (
        existing.status === CVProcessingStatus.FAILED ||
        existing.status === CVProcessingStatus.PENDING
      ) {
        await this.cvProcessingQueue.add(
          'reprocess-cv',
          { cvMatchResultId: existing._id },
          retryOptions,
        );
      }
      return existing;
    }

    const savedResult = await this.cvMatchResultRepo.save(
      this.cvMatchResultRepo.create({
        cvId: params.cvId,
        userId: params.userId,
        jobId: params.jobId,
        applicationId: params.applicationId,
        contentHash: params.contentHash,
        jobSourceVersion: params.jobSourceVersion,
        status: CVProcessingStatus.PENDING,
      }),
    );

    const payload: CVProcessingJobData = {
      cvMatchResultId: savedResult._id,
      cvId: params.cvId,
      userId: params.userId,
      applicationId: params.applicationId,
      jobId: params.jobId,
      cvContentVersion: params.cvContentVersion,
      contentHash: params.contentHash,
      jobSourceVersion: params.jobSourceVersion,
      aiRankingConsentGranted: true,
      aiRankingConsentVersion: params.aiRankingConsentVersion,
      aiRankingConsentPolicyHash: params.aiRankingConsentPolicyHash,
      consentIdempotencyKey: params.consentIdempotencyKey,
    };

    await this.cvProcessingQueue.add('process-cv', payload, {
      ...retryOptions,
      removeOnComplete: true,
      removeOnFail: false,
    });
    this.logger.log(
      `Queued CV processing: CV ${params.cvId} for Job ${params.jobId}`,
    );
    return savedResult;
  }

  async getRankedCandidates(
    jobId: string,
    topN = 10,
  ): Promise<CVMatchResult[]> {
    return this.cvMatchResultRepo.find({
      where: { jobId, status: CVProcessingStatus.COMPLETED, isDeleted: false },
      order: { matchScore: 'DESC' },
      take: topN,
      relations: ['user', 'cv', 'application'],
    });
  }

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
    const output = {
      total: 0,
      completed: 0,
      processing: 0,
      pending: 0,
      failed: 0,
    };
    for (const stat of stats) {
      const count = parseInt(stat.count, 10);
      output.total += count;
      switch (stat.status) {
        case CVProcessingStatus.COMPLETED:
          output.completed = count;
          break;
        case CVProcessingStatus.PROCESSING:
          output.processing = count;
          break;
        case CVProcessingStatus.PENDING:
          output.pending = count;
          break;
        case CVProcessingStatus.FAILED:
          output.failed = count;
          break;
      }
    }
    return output;
  }

  async reprocessFailedCVs(jobId: string): Promise<number> {
    const failedResults = await this.cvMatchResultRepo.find({
      where: { jobId, status: CVProcessingStatus.FAILED, isDeleted: false },
    });
    for (const result of failedResults) {
      await this.cvProcessingQueue.add(
        'reprocess-cv',
        { cvMatchResultId: result._id },
        retryOptions,
      );
    }
    this.logger.log(
      `Requeued ${failedResults.length} failed CV processing jobs for Job ${jobId}`,
    );
    return failedResults.length;
  }

  async deleteByApplication(applicationId: string): Promise<void> {
    await this.cvMatchResultRepo.update({ applicationId }, { isDeleted: true });
  }

  async reprocessAllCVsForJob(jobId: string): Promise<number> {
    const allResults = await this.cvMatchResultRepo.find({
      where: { jobId, isDeleted: false },
    });
    if (allResults.length === 0) return 0;
    for (const result of allResults) {
      await this.cvMatchResultRepo.update(result._id, {
        status: CVProcessingStatus.PENDING,
        matchScore: 0,
        matchedSkills: [],
        missingSkills: [],
        explanation: null as any,
      });
      await this.cvProcessingQueue.add(
        'reprocess-cv',
        { cvMatchResultId: result._id },
        retryOptions,
      );
    }
    this.logger.log(
      `Requeued ${allResults.length} CV processing jobs for updated Job ${jobId}`,
    );
    return allResults.length;
  }

  async reprocessCVForAllJobs(cvId: string): Promise<number> {
    const allResults = await this.cvMatchResultRepo.find({
      where: { cvId, isDeleted: false },
    });
    for (const result of allResults) {
      await this.cvMatchResultRepo.update(result._id, {
        status: CVProcessingStatus.PENDING,
        matchScore: 0,
        matchedSkills: [],
        missingSkills: [],
        explanation: null as any,
      });
      await this.cvProcessingQueue.add(
        'reprocess-cv',
        { cvMatchResultId: result._id },
        retryOptions,
      );
    }
    this.logger.log(
      `Requeued ${allResults.length} CV processing jobs for updated CV ${cvId}`,
    );
    return allResults.length;
  }
}
