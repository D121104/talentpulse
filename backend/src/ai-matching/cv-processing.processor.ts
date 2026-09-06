import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job as BullJob } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AiServiceClient,
  AiServiceError,
  AiExperienceLevel,
  AiWorkMode,
} from './ai-service.client';
import {
  CVMatchResult,
  CVProcessingStatus,
} from './entities/cv-match-result.entity';
import { UserCV } from 'src/usercvs/entities/usercv.entity';
import { CVParseStatus } from 'src/usercvs/cv-parse-status';
import { Job as RecruitmentJob } from 'src/jobs/entities/job.entity';
import {
  Application,
  ApplicationStatus,
} from 'src/applications/entities/application.entity';

/**
 * Queue data is deliberately an opaque capability: workers use these IDs and
 * fences to reload canonical records. CV text, URLs and profile/JD content
 * must never be serialized into Bull/Valkey.
 */
export interface CVProcessingJobData {
  cvMatchResultId: string;
  cvId: string;
  applicationId: string;
  userId: string;
  jobId: string;
  cvContentVersion: string;
  contentHash: string;
  jobSourceVersion: string;
  aiRankingConsentGranted: true;
  aiRankingConsentVersion: string;
  aiRankingConsentPolicyHash: string;
  consentIdempotencyKey: string;
}

export function consentIdempotencyKey(
  applicationId: string,
  cvContentVersion: string,
  jobSourceVersion: string,
): string {
  return `${applicationId}:${cvContentVersion}:${jobSourceVersion}`;
}

export function isCurrentMatchJob(
  result: Pick<
    CVMatchResult,
    | 'cvId'
    | 'jobId'
    | 'contentHash'
    | 'jobSourceVersion'
    | 'isDeleted'
    | 'deletedAt'
  >,
  cv: Pick<
    UserCV,
    | '_id'
    | 'userId'
    | 'contentVersion'
    | 'contentHash'
    | 'isDeleted'
    | 'deletedAt'
  >,
  job: Pick<RecruitmentJob, '_id' | 'isDeleted' | 'deletedAt'>,
  data: Pick<
    CVProcessingJobData,
    | 'cvId'
    | 'userId'
    | 'cvContentVersion'
    | 'contentHash'
    | 'jobId'
    | 'jobSourceVersion'
  >,
  currentJobSourceVersion: string,
): boolean {
  return Boolean(
    !result.isDeleted &&
      result.cvId === data.cvId &&
      result.jobId === data.jobId &&
      cv._id === data.cvId &&
      cv.userId === data.userId &&
      job._id === data.jobId &&
      !job.isDeleted &&
      !job.deletedAt &&
      result.contentHash === data.contentHash &&
      result.jobSourceVersion === data.jobSourceVersion &&
      !cv.isDeleted &&
      !cv.deletedAt &&
      cv.contentVersion === data.cvContentVersion &&
      cv.contentHash === data.contentHash &&
      currentJobSourceVersion === data.jobSourceVersion,
  );
}

export function getJobSourceVersion(job: {
  name: string;
  description?: string | null;
  skills?: unknown;
  level?: string | null;
  location?: string | null;
  _id?: string;
}): string {
  // This is a version fingerprint, not business data sent to the AI service.
  const value = JSON.stringify({
    name: job.name,
    description: job.description || '',
    skills: job.skills || [],
    level: job.level || '',
  });
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1)
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function asLevel(value: string | null | undefined): AiExperienceLevel | null {
  return ['intern', 'junior', 'mid', 'senior', 'lead', 'principal'].includes(
    value || '',
  )
    ? (value as AiExperienceLevel)
    : null;
}
function skills(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((item) =>
          typeof item === 'string'
            ? item
            : item && typeof item === 'object' && 'name' in item
            ? String(item.name)
            : '',
        )
        .filter(Boolean)
    : [];
}

const RANKABLE_APPLICATION_STATUSES = new Set<ApplicationStatus>([
  ApplicationStatus.PENDING,
  ApplicationStatus.REVIEWING,
  ApplicationStatus.CONSIDERING,
  ApplicationStatus.APPROVED,
]);

@Processor('cv-processing')
export class CVProcessingProcessor {
  private readonly logger = new Logger(CVProcessingProcessor.name);

  constructor(
    private readonly aiServiceClient: AiServiceClient,
    @InjectRepository(CVMatchResult)
    private readonly cvMatchResultRepo: Repository<CVMatchResult>,
    @InjectRepository(UserCV) private readonly userCvRepo: Repository<UserCV>,
    @InjectRepository(RecruitmentJob)
    private readonly jobRepo: Repository<RecruitmentJob>,
    @InjectRepository(Application)
    private readonly applicationRepo: Repository<Application>,
  ) {}

  private async loadCanonical(data: CVProcessingJobData) {
    const [result, cv, recruitmentJob, application] = await Promise.all([
      this.cvMatchResultRepo.findOne({ where: { _id: data.cvMatchResultId } }),
      this.userCvRepo.findOne({ where: { _id: data.cvId } }),
      this.jobRepo.findOne({ where: { _id: data.jobId } }),
      this.applicationRepo.findOne({ where: { _id: data.applicationId } }),
    ]);
    return { result, cv, recruitmentJob, application };
  }

  private isEligible(
    data: CVProcessingJobData,
    result: CVMatchResult,
    cv: UserCV,
    recruitmentJob: RecruitmentJob,
    application: Application,
  ): boolean {
    return Boolean(
      application._id === data.applicationId &&
        !application.isDeleted &&
        !application.deletedAt &&
        RANKABLE_APPLICATION_STATUSES.has(application.status) &&
        application.cvId === data.cvId &&
        application.jobId === data.jobId &&
        application.userId === data.userId &&
        cv.userId === data.userId &&
        result.applicationId === data.applicationId &&
        result.userId === data.userId &&
        application.aiRankingConsentGranted === true &&
        application.aiRankingConsentVersion === data.aiRankingConsentVersion &&
        application.aiRankingConsentPolicyHash ===
          data.aiRankingConsentPolicyHash &&
        application.aiRankingConsentAt != null &&
        data.aiRankingConsentGranted === true &&
        data.consentIdempotencyKey ===
          consentIdempotencyKey(
            data.applicationId,
            data.cvContentVersion,
            data.jobSourceVersion,
          ) &&
        cv.parseStatus === CVParseStatus.READY &&
        isCurrentMatchJob(
          result,
          cv,
          recruitmentJob,
          data,
          getJobSourceVersion(recruitmentJob),
        ),
    );
  }

  private aiRequest(cv: UserCV, recruitmentJob: RecruitmentJob) {
    const jobSkills = skills(recruitmentJob.skills);
    return {
      cv_id: cv._id,
      job_id: recruitmentJob._id,
      candidate: {
        skills: skills(cv.skills),
        years_experience: null,
        level: null,
        location: null,
        work_modes: [] as AiWorkMode[],
      },
      job: {
        required_skills: jobSkills,
        preferred_skills: [],
        min_years_experience: null,
        max_years_experience: null,
        level: asLevel(recruitmentJob.level),
        location: recruitmentJob.location || null,
        work_modes: [] as AiWorkMode[],
      },
    };
  }

  @Process('process-cv')
  async handleProcessCV(job: BullJob<CVProcessingJobData>) {
    const data = job.data;
    this.logger.log(`Processing CV match: ${data.cvMatchResultId}`);
    const canonical = await this.loadCanonical(data);
    const { result, cv, recruitmentJob, application } = canonical;
    if (
      !result ||
      !cv ||
      !recruitmentJob ||
      !application ||
      !this.isEligible(data, result, cv, recruitmentJob, application)
    ) {
      this.logger.warn(
        `Skipping stale or ineligible CV match: ${data.cvMatchResultId}`,
      );
      return { success: false, stale: true };
    }

    const processing = await this.cvMatchResultRepo.update(
      {
        _id: data.cvMatchResultId,
        isDeleted: false,
        cvId: data.cvId,
        jobId: data.jobId,
        applicationId: data.applicationId,
      },
      {
        status: CVProcessingStatus.PROCESSING,
        contentHash: data.contentHash,
        jobSourceVersion: data.jobSourceVersion,
        errorMessage: null,
      },
    );
    if (!processing.affected) return { success: false, stale: true };

    try {
      const match = await this.aiServiceClient.matchCv(
        this.aiRequest(cv, recruitmentJob),
      );
      const latest = await this.loadCanonical(data);
      if (
        !latest.result ||
        !latest.cv ||
        !latest.recruitmentJob ||
        !latest.application ||
        !this.isEligible(
          data,
          latest.result,
          latest.cv,
          latest.recruitmentJob,
          latest.application,
        )
      ) {
        this.logger.warn(
          `Skipping stale AI match result: ${data.cvMatchResultId}`,
        );
        return { success: false, stale: true };
      }
      const update = await this.cvMatchResultRepo.update(
        {
          _id: data.cvMatchResultId,
          isDeleted: false,
          cvId: data.cvId,
          jobId: data.jobId,
          applicationId: data.applicationId,
          contentHash: data.contentHash,
          jobSourceVersion: data.jobSourceVersion,
        },
        {
          matchScore: match.overall_score,
          matchedSkills: match.matched_skills,
          missingSkills: match.missing_required_skills,
          explanation: match.explanation,
          components: match.components,
          compatibility: {
            matchedSkills: match.matched_skills,
            missingRequiredSkills: match.missing_required_skills,
            strengths: match.strengths,
            gaps: match.gaps,
            semanticComponentVersion: match.semantic_component_version,
          },
          scoringVersion: match.scoring_version,
          modelVersion: match.semantic_component_version,
          normalizationVersion: 'cv-job-normalization-v1',
          degraded: match.degraded,
          status: CVProcessingStatus.COMPLETED,
          processedAt: new Date(),
          errorMessage: null,
        },
      );
      if (!update.affected) return { success: false, stale: true };
      return { success: true, matchScore: match.overall_score };
    } catch (error) {
      const code =
        error instanceof AiServiceError ? error.code : 'AI_MATCH_FAILED';
      const current = await this.loadCanonical(data);
      if (
        current.result &&
        current.cv &&
        current.recruitmentJob &&
        current.application &&
        this.isEligible(
          data,
          current.result,
          current.cv,
          current.recruitmentJob,
          current.application,
        )
      ) {
        await this.cvMatchResultRepo.update(
          {
            _id: data.cvMatchResultId,
            isDeleted: false,
            contentHash: data.contentHash,
            jobSourceVersion: data.jobSourceVersion,
          },
          { status: CVProcessingStatus.FAILED, errorMessage: code },
        );
      }
      this.logger.warn(`CV matching failed: ${data.cvMatchResultId} (${code})`);
      throw error;
    }
  }

  @Process('reprocess-cv')
  async handleReprocessCV(job: BullJob<{ cvMatchResultId: string }>) {
    const result = await this.cvMatchResultRepo.findOne({
      where: { _id: job.data.cvMatchResultId },
      relations: ['job', 'cv', 'application'],
    });
    if (
      !result ||
      !result.job ||
      !result.cv ||
      !result.application ||
      !result.cv.contentHash
    )
      return { success: false, stale: true };
    const recruitmentJob = result.job;
    const data: CVProcessingJobData = {
      cvMatchResultId: result._id,
      cvId: result.cv._id,
      applicationId: result.application._id,
      userId: result.application.userId,
      cvContentVersion: result.cv.contentVersion,
      contentHash: result.cv.contentHash,
      jobId: recruitmentJob._id,
      jobSourceVersion: getJobSourceVersion(recruitmentJob),
      aiRankingConsentGranted: true,
      aiRankingConsentVersion: result.application.aiRankingConsentVersion || '',
      aiRankingConsentPolicyHash:
        result.application.aiRankingConsentPolicyHash || '',
      consentIdempotencyKey: consentIdempotencyKey(
        result.application._id,
        result.cv.contentVersion,
        getJobSourceVersion(recruitmentJob),
      ),
    };
    await this.cvMatchResultRepo.update(result._id, {
      contentHash: data.contentHash,
      jobSourceVersion: data.jobSourceVersion,
    });
    return this.handleProcessCV({
      ...job,
      data,
    } as BullJob<CVProcessingJobData>);
  }
}
