import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import {
  CURRENT_MATCH_SCORING_VERSION,
  CURRENT_SKILL_NORMALIZATION_VERSION,
  hasCurrentMatchingVersions,
} from './matching-versions';
import {
  Application,
  ApplicationStatus,
} from 'src/applications/entities/application.entity';
import { Job } from 'src/jobs/entities/job.entity';
import { Company } from 'src/companies/entities/company.entity';
import { UserCV } from 'src/usercvs/entities/usercv.entity';
import { CVParseStatus } from 'src/usercvs/cv-parse-status';
import { getJobSourceVersion } from 'src/job-indexing/job-indexing.normalization';
import { areQueueWorkersEnabled } from 'src/config/runtime-flags';
import {
  CVMatchResult,
  CVProcessingStatus,
} from './entities/cv-match-result.entity';
import {
  CVProcessingJobData,
  consentIdempotencyKey,
  hasAutomaticMatchingEntitlement,
} from './cv-processing.processor';

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

  async enqueueEligibleApplication(applicationId: string): Promise<void> {
    const manager = this.cvMatchResultRepo.manager;
    const application = await manager
      .getRepository(Application)
      .findOne({ where: { _id: applicationId } });
    if (
      !application ||
      application.isDeleted ||
      application.deletedAt ||
      ![
        ApplicationStatus.PENDING,
        ApplicationStatus.REVIEWING,
        ApplicationStatus.CONSIDERING,
        ApplicationStatus.APPROVED,
      ].includes(application.status) ||
      !application.aiRankingConsentGranted ||
      !application.aiRankingConsentVersion ||
      !application.aiRankingConsentPolicyHash ||
      !application.aiRankingConsentAt
    )
      return;
    const [cv, job] = await Promise.all([
      manager
        .getRepository(UserCV)
        .findOne({ where: { _id: application.cvId } }),
      manager.getRepository(Job).findOne({ where: { _id: application.jobId } }),
    ]);
    if (
      !cv ||
      cv.isDeleted ||
      cv.deletedAt ||
      cv.userId !== application.userId ||
      cv.parseStatus !== CVParseStatus.READY ||
      !cv.contentHash ||
      !cv.contentVersion ||
      !job ||
      job.isDeleted ||
      job.deletedAt ||
      !job.company?._id ||
      application.companyId !== job.company._id
    )
      return;
    const company = await manager
      .getRepository(Company)
      .findOne({ where: { _id: job.company._id } });
    if (
      !company ||
      !(await hasAutomaticMatchingEntitlement(
        manager,
        job,
        company,
        application.userId,
      ))
    )
      return;
    const version = getJobSourceVersion(job, company);
    await this.queueCVProcessing({
      cvId: cv._id,
      userId: application.userId,
      applicationId,
      cvContentVersion: cv.contentVersion,
      contentHash: cv.contentHash,
      jobId: job._id,
      jobSourceVersion: version,
      aiRankingConsentGranted: true,
      aiRankingConsentVersion: application.aiRankingConsentVersion,
      aiRankingConsentPolicyHash: application.aiRankingConsentPolicyHash,
      consentIdempotencyKey: consentIdempotencyKey(
        applicationId,
        cv.contentVersion,
        version,
      ),
    });
  }

  async enqueueReadyCV(cvId: string): Promise<void> {
    // Keyset pages keep each query bounded even for a heavily reused CV.
    let cursor = '00000000-0000-0000-0000-000000000000';
    for (;;) {
      const applications = await this.cvMatchResultRepo.manager
        .getRepository(Application)
        .createQueryBuilder('application')
        .where('application.cvId = :cvId', { cvId })
        .andWhere('application._id > :cursor', { cursor })
        .orderBy('application._id', 'ASC')
        .take(100)
        .getMany();
      for (const application of applications)
        await this.enqueueEligibleApplication(application._id);
      if (applications.length < 100) return;
      cursor = applications[applications.length - 1]._id;
    }
  }

  private reconciliationCursor = '00000000-0000-0000-0000-000000000000';
  private reconciling = false;

  @Cron('*/1 * * * *')
  async reconcileAutomaticMatches(): Promise<void> {
    if (!areQueueWorkersEnabled() || this.reconciling) return;
    this.reconciling = true;
    try {
      // Recover apply/READY races and transient queue failures, at most 100
      // recent applications per tick. Never scan historical applications.
      const applications = await this.cvMatchResultRepo.manager
        .getRepository(Application)
        .createQueryBuilder('application')
        .innerJoin(UserCV, 'cv', 'cv._id = application.cvId')
        .leftJoin(
          CVMatchResult,
          'result',
          'result.cvId = application.cvId AND result.jobId = application.jobId',
        )
        .where('(application.createdAt >= :since OR cv.parsedAt >= :since)', {
          since: new Date(Date.now() - 86400000),
        })
        .andWhere('cv.parseStatus = :ready', { ready: CVParseStatus.READY })
        .andWhere('application.aiRankingConsentGranted = true')
        .andWhere('(result._id IS NULL OR result.status IN (:...statuses))', {
          statuses: [CVProcessingStatus.PENDING, CVProcessingStatus.COMPLETED],
        })
        .andWhere('application._id > :cursor', {
          cursor: this.reconciliationCursor,
        })
        .orderBy('application._id', 'ASC')
        .take(100)
        .getMany();
      for (const application of applications) {
        try {
          await this.enqueueEligibleApplication(application._id);
        } catch {
          this.logger.warn(
            `Automatic matching enqueue deferred: ${application._id}`,
          );
        }
      }
      this.reconciliationCursor =
        applications.length === 100
          ? applications[99]._id
          : '00000000-0000-0000-0000-000000000000';
    } catch {
      this.logger.warn('Automatic matching reconciliation unavailable');
    } finally {
      this.reconciling = false;
    }
  }

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
    return this.cvMatchResultRepo.manager.transaction(async (manager) => {
      // Serialize both READY and apply events across API/worker processes.
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`${params.cvId}:${params.jobId}`],
      );
      const repo = manager.getRepository(CVMatchResult);
      const existing = await repo.findOne({
        where: { cvId: params.cvId, jobId: params.jobId },
      });

      if (
        existing &&
        !existing.isDeleted &&
        !existing.deletedAt &&
        existing.applicationId === params.applicationId &&
        existing.contentHash === params.contentHash &&
        existing.jobSourceVersion === params.jobSourceVersion &&
        (existing.status !== CVProcessingStatus.COMPLETED ||
          hasCurrentMatchingVersions(existing))
      ) {
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
            {
              ...retryOptions,
              jobId: consentIdempotencyKey(
                params.applicationId,
                params.cvContentVersion,
                params.jobSourceVersion,
              ),
              removeOnComplete: true,
              removeOnFail: true,
            },
          );
        }
        return existing;
      }

      const savedResult = await repo.save(
        repo.create({
          ...(existing ? { _id: existing._id } : {}),
          cvId: params.cvId,
          userId: params.userId,
          jobId: params.jobId,
          applicationId: params.applicationId,
          contentHash: params.contentHash,
          jobSourceVersion: params.jobSourceVersion,
          status: CVProcessingStatus.PENDING,
          isDeleted: false,
          deletedAt: null,
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
        consentIdempotencyKey: consentIdempotencyKey(
          params.applicationId,
          params.cvContentVersion,
          params.jobSourceVersion,
        ),
      };

      await this.cvProcessingQueue.add('process-cv', payload, {
        ...retryOptions,
        jobId: payload.consentIdempotencyKey,
        removeOnComplete: true,
        removeOnFail: true,
      });
      this.logger.log(
        `Queued CV processing: CV ${params.cvId} for Job ${params.jobId}`,
      );
      return savedResult;
    });
  }

  async getRankedCandidates(
    jobId: string,
    topN = 10,
    currentJobSourceVersion: string,
    applicationId?: string,
  ): Promise<CVMatchResult[]> {
    return this.cvMatchResultRepo
      .createQueryBuilder('result')
      .leftJoinAndSelect('result.user', 'user')
      .leftJoinAndSelect('result.cv', 'cv')
      .leftJoinAndSelect('result.application', 'application')
      .leftJoin('result.job', 'job')
      .where('result.jobId = :jobId', { jobId })
      .andWhere(
        applicationId ? 'result.applicationId = :applicationId' : '1=1',
        { applicationId },
      )
      .andWhere('result.status = :status', {
        status: CVProcessingStatus.COMPLETED,
      })
      .andWhere('result.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('result.deletedAt IS NULL')
      .andWhere('job.isDeleted = false AND job.deletedAt IS NULL')
      .andWhere("CAST(application.companyId AS text) = job.company->>'_id'")
      .andWhere('result.jobSourceVersion = :jobSourceVersion', {
        jobSourceVersion: currentJobSourceVersion,
      })
      .andWhere('cv.contentHash IS NOT NULL')
      .andWhere('result.contentHash = cv.contentHash')
      .andWhere('result.scoringVersion = :scoringVersion', {
        scoringVersion: CURRENT_MATCH_SCORING_VERSION,
      })
      .andWhere('result.normalizationVersion = :normalizationVersion', {
        normalizationVersion: CURRENT_SKILL_NORMALIZATION_VERSION,
      })
      .andWhere(
        'application.cvId = result.cvId AND application.userId = result.userId AND application.jobId = result.jobId',
      )
      .andWhere('cv.userId = result.userId')
      .andWhere('(cv.isDeleted = false OR cv.isDeleted IS NULL)')
      .andWhere('cv.deletedAt IS NULL')
      .andWhere('application.aiRankingConsentGranted = true')
      .andWhere('application.aiRankingConsentVersion IS NOT NULL')
      .andWhere('application.aiRankingConsentPolicyHash IS NOT NULL')
      .andWhere('application.aiRankingConsentAt IS NOT NULL')
      .andWhere('application.isDeleted = false')
      .andWhere('application.deletedAt IS NULL')
      .andWhere('application.status IN (:...eligibleStatuses)', {
        eligibleStatuses: [
          ApplicationStatus.PENDING,
          ApplicationStatus.REVIEWING,
          ApplicationStatus.CONSIDERING,
          ApplicationStatus.APPROVED,
        ],
      })
      .andWhere('user.isDeleted = false')
      .andWhere('user.deletedAt IS NULL')
      .orderBy('result.matchScore', 'DESC')
      .addOrderBy('result._id', 'ASC')
      .take(topN)
      .getMany();
  }

  async getProcessingStatus(jobId: string): Promise<{
    total: number;
    completed: number;
    processing: number;
    pending: number;
    failed: number;
    stale: number;
  }> {
    const reportedStatus = `CASE WHEN result.status = 'COMPLETED' AND
      (result.scoringVersion IS DISTINCT FROM :scoringVersion OR
       result.normalizationVersion IS DISTINCT FROM :normalizationVersion)
      THEN 'STALE' ELSE result.status::text END`;
    const stats = await this.cvMatchResultRepo
      .createQueryBuilder('result')
      .select(reportedStatus, 'status')
      .setParameters({
        scoringVersion: CURRENT_MATCH_SCORING_VERSION,
        normalizationVersion: CURRENT_SKILL_NORMALIZATION_VERSION,
      })
      .addSelect('COUNT(result._id)', 'count')
      .where('result.jobId = :jobId', { jobId })
      .andWhere('result.isDeleted = :isDeleted', { isDeleted: false })
      .groupBy('1')
      .getRawMany();
    const output = {
      total: 0,
      completed: 0,
      processing: 0,
      pending: 0,
      failed: 0,
      stale: 0,
    };
    for (const stat of stats) {
      const count = parseInt(stat.count, 10);
      output.total += count;
      switch (stat.status) {
        case 'STALE':
          output.stale = count;
          break;
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
