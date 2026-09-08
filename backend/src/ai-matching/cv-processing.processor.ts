import { Process, Processor } from '@nestjs/bull';
import { createHash } from 'crypto';
import { Logger } from '@nestjs/common';
import { Job as BullJob } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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
import { normalizeJobText } from 'src/job-indexing/job-indexing.normalization';
import { Job as RecruitmentJobEntity } from 'src/jobs/entities/job.entity';

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

function stableSourceValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableSourceValue);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((output, key) => {
        output[key] = stableSourceValue(
          (value as Record<string, unknown>)[key],
        );
        return output;
      }, {});
  }
  return value ?? null;
}

export function getJobSourceVersion(
  job:
    | RecruitmentJobEntity
    | {
        name: string;
        description?: string | null;
        skills?: unknown;
        level?: string | null;
        location?: string | null;
        _id?: string;
        company?: unknown;
        salary?: number | null;
        startDate?: Date | string | null;
        endDate?: Date | string | null;
        isActive?: boolean;
        isDeleted?: boolean;
        quantity?: number | null;
        isHot?: boolean;
        boostedAt?: Date | string | null;
        isFeatured?: boolean;
        isUrgent?: boolean;
        createdAt?: Date | string | null;
        updatedAt?: Date | string | null;
        deletedAt?: Date | string | null;
        [key: string]: unknown;
      },
): string {
  // This is a version fingerprint, not business data sent to the AI service.
  // Keep the complete canonical job/source context here so an old match cannot
  // survive a change to a field used by matching or job eligibility.
  const source = {
    job: {
      _id: job._id ?? null,
      name: normalizeJobText(job.name),
      description: normalizeJobText(job.description),
      skills: skills(job.skills).map(normalizeJobText).sort(),
      level: job.level == null ? null : normalizeJobText(job.level),
      location: job.location == null ? null : normalizeJobText(job.location),
      salary: job.salary ?? null,
      startDate: job.startDate ?? null,
      endDate: job.endDate ?? null,
      isActive: job.isActive ?? null,
      isDeleted: job.isDeleted ?? null,
      quantity: job.quantity ?? null,
      isHot: job.isHot ?? null,
      boostedAt: job.boostedAt ?? null,
      isFeatured: job.isFeatured ?? null,
      isUrgent: job.isUrgent ?? null,
      createdAt: job.createdAt ?? null,
      updatedAt: job.updatedAt ?? null,
      deletedAt: job.deletedAt ?? null,
      createdBy: (job as Record<string, unknown>).createdBy ?? null,
      updatedBy: (job as Record<string, unknown>).updatedBy ?? null,
      deletedBy: (job as Record<string, unknown>).deletedBy ?? null,
      // These fields are not currently declared on Job, but including them
      // makes the fence safe if a canonical schema supplies them dynamically.
      preferredSkills: (job as Record<string, unknown>).preferredSkills ?? null,
      minYearsExperience:
        (job as Record<string, unknown>).minYearsExperience ?? null,
      maxYearsExperience:
        (job as Record<string, unknown>).maxYearsExperience ?? null,
      workMode:
        (job as Record<string, unknown>).workMode ??
        (job as Record<string, unknown>).work_mode ??
        null,
      employmentType:
        (job as Record<string, unknown>).employmentType ??
        (job as Record<string, unknown>).employment_type ??
        null,
    },
    company: job.company ?? null,
  };
  return createHash('sha256')
    .update(JSON.stringify(stableSourceValue(source)), 'utf8')
    .digest('hex');
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
    const candidate = cv as UserCV & Record<string, unknown>;
    const job = recruitmentJob as RecruitmentJob & Record<string, unknown>;
    const canonicalNumber = (...keys: string[]): number | null => {
      const value = keys
        .map((key) => candidate[key])
        .find((item) => item != null);
      return typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? value
        : null;
    };
    const canonicalLocation = (value: unknown): string | null => {
      if (typeof value !== 'string') return null;
      const normalized = value.trim();
      return normalized ? normalized : null;
    };
    const canonicalWorkModes = (value: unknown): AiWorkMode[] => {
      const values = Array.isArray(value)
        ? value
        : value == null
        ? []
        : [value];
      return values.filter((item): item is AiWorkMode =>
        ['onsite', 'hybrid', 'remote'].includes(String(item)),
      );
    };
    const jobSkills = skills(recruitmentJob.skills);
    const preferredSkills = skills(job.preferredSkills ?? job.preferred_skills);
    return {
      cv_id: cv._id,
      job_id: recruitmentJob._id,
      candidate: {
        // Use only explicit structured canonical fields. The free-form
        // experience array and parsed text are never interpreted as years,
        // level, location, or work-mode evidence.
        skills: skills(cv.skills),
        years_experience: canonicalNumber(
          'yearsExperience',
          'years_experience',
          'experienceYears',
        ),
        level: asLevel(
          typeof candidate.level === 'string' ? candidate.level : null,
        ),
        location: canonicalLocation(candidate.location),
        work_modes: canonicalWorkModes(
          candidate.workModes ?? candidate.work_modes,
        ),
      },
      job: {
        required_skills: jobSkills,
        preferred_skills: preferredSkills,
        min_years_experience:
          typeof job.minYearsExperience === 'number'
            ? job.minYearsExperience
            : typeof job.min_years_experience === 'number'
            ? job.min_years_experience
            : null,
        max_years_experience:
          typeof job.maxYearsExperience === 'number'
            ? job.maxYearsExperience
            : typeof job.max_years_experience === 'number'
            ? job.max_years_experience
            : null,
        level: asLevel(recruitmentJob.level),
        location: canonicalLocation(recruitmentJob.location),
        work_modes: canonicalWorkModes(
          job.workMode ?? job.work_mode ?? job.workModes ?? job.work_modes,
        ),
      },
    };
  }

  private compatibility(
    match: Awaited<ReturnType<AiServiceClient['matchCv']>>,
  ): Record<string, unknown> {
    const compatibility: Record<string, unknown> = {
      matchedSkills: match.matched_skills,
      missingRequiredSkills: match.missing_required_skills,
      strengths: match.strengths,
      gaps: match.gaps,
      semanticComponentVersion: match.semantic_component_version,
    };
    for (const [responseKey, persistedKey] of [
      ['experience', 'experience'],
      ['location', 'location'],
      ['work_mode', 'workMode'],
    ] as const) {
      const component = match.components[responseKey];
      if (component) compatibility[persistedKey] = component;
    }

    // Keep this allowlist ready for the response contract's explicit fields;
    // never copy an arbitrary provider response into JSONB.
    const response = match as unknown as Record<string, unknown>;
    for (const [responseKey, persistedKey] of [
      ['location_compatibility', 'location'],
      ['work_mode_compatibility', 'workMode'],
      ['locationCompatibility', 'location'],
      ['workModeCompatibility', 'workMode'],
    ] as const) {
      if (response[responseKey] !== undefined)
        compatibility[persistedKey] = response[responseKey];
    }
    return compatibility;
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
        status: In([CVProcessingStatus.PENDING, CVProcessingStatus.FAILED]),
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
          status: CVProcessingStatus.PROCESSING,
        },
        {
          matchScore: match.overall_score,
          matchedSkills: match.matched_skills,
          missingSkills: match.missing_required_skills,
          explanation: match.explanation,
          components: match.components,
          compatibility: this.compatibility(match),
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
            status: CVProcessingStatus.PROCESSING,
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
