import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GatewayTimeoutException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { IUser } from 'src/users/users.interface';
import { UsersService } from 'src/users/users.service';
import { JobsService } from 'src/jobs/jobs.service';
import { AiCvConsentsService } from 'src/ai-consents/ai-cv-consents.service';
import {
  AiCvConsentScope,
  getActiveAiCvConsentPolicy,
} from 'src/ai-consents/ai-cv-consent.policy';
import { AiServiceError } from 'src/ai-matching/ai-service.client';
import { CandidateCareerProfileService } from 'src/candidate-career-profile/candidate-career-profile.service';
import { CandidateCareerProfile } from 'src/candidate-career-profile/entities/candidate-career-profile.entity';
import { Job } from 'src/jobs/entities/job.entity';
import { OnlineCV } from './entities/online-cv.entity';
import { CvGenerationJobData } from './async-cv-generation.types';
import { OnlineCvGenerationStateService } from './online-cv-generation-state.service';
import { GenerateOnlineCvDto } from './dto/generate-online-cv.dto';
import { GenerateFromCareerProfileDto } from 'src/candidate-career-profile/dto/update-candidate-career-profile.dto';

const CV_GENERATION_TIMEOUT_MS = 300_000;

export interface CvGenerationWorkerHandlers {
  regenerateSelectedItem(
    cv: OnlineCV,
    user: IUser,
    data: CvGenerationJobData,
    deadline: number,
  ): Promise<string[]>;
  generateExistingCv(
    id: string,
    dto: GenerateOnlineCvDto,
    user: IUser,
    operationId: string,
    timeoutMs: number,
  ): Promise<unknown>;
  generateFromCareerProfile(
    dto: GenerateFromCareerProfileDto,
    user: IUser,
    targetCvId: string,
    operationId: string,
    sourceVersion: string,
    timeoutMs: number,
  ): Promise<unknown>;
}

@Injectable()
export class OnlineCvGenerationWorkerService {
  constructor(
    @InjectRepository(OnlineCV)
    private readonly onlineCVRepo: Repository<OnlineCV>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly configService: ConfigService,
    private readonly aiCvConsentsService: AiCvConsentsService,
    private readonly usersService: UsersService,
    private readonly jobsService: JobsService,
    private readonly careerProfileService: CandidateCareerProfileService,
    private readonly generationState: OnlineCvGenerationStateService,
  ) {}

  private generationRemaining(deadline: number): number {
    const remaining = deadline - Date.now();
    if (remaining <= 0)
      throw new GatewayTimeoutException(
        'Dịch vụ AI tạo CV phản hồi quá thời gian',
      );
    return remaining;
  }

  private jobSnapshot(
    job: Job | null,
    fallbackId: string,
    fallbackTitle?: string,
  ) {
    return {
      job_id: job?._id || fallbackId,
      title: job?.name || fallbackTitle || 'Candidate CV',
      company_name: job?.company?.name || null,
      description: job?.description || null,
      location: job?.location || null,
      work_mode: job?.workingModel || null,
      level: job?.level || null,
      required_skills: job?.skills || [],
      preferred_skills: [],
    };
  }

  async processGenerationJob(
    data: CvGenerationJobData,
    handlers: CvGenerationWorkerHandlers,
  ): Promise<void> {
    const cv = await this.onlineCVRepo.findOne({
      where: { _id: data.cvId, userId: data.userId, isDeleted: false },
    });
    if (!cv) return;
    const metadata = cv.revision?.sourceTrace?.generation;
    const operationStatus = data.regenerationTarget
      ? metadata?.regeneration?.status
      : metadata?.status;
    const operationCreatedAt = data.regenerationTarget
      ? metadata?.regeneration?.createdAt
      : metadata?.createdAt;
    const operationMatches = data.regenerationTarget
      ? metadata?.operationId === data.regenerationTarget.reviewOperationId &&
        metadata.regeneration?.operationId === data.operationId &&
        metadata.regeneration.expectedDraftHash ===
          data.regenerationTarget.expectedDraftHash &&
        metadata.regeneration.targetPath === data.regenerationTarget.targetPath
      : metadata?.operationId === data.operationId;
    const deadline =
      Date.parse(operationCreatedAt || '') + CV_GENERATION_TIMEOUT_MS;
    if (
      operationMatches &&
      ['QUEUED', 'RUNNING'].includes(operationStatus || '') &&
      Date.now() >= deadline
    ) {
      return this.generationState.finishGeneration(
        data,
        'FAILED',
        'AI_TIMEOUT',
      );
    }
    if (operationMatches && operationStatus === 'RUNNING') {
      return this.generationState.finishGeneration(
        data,
        'FAILED',
        'WORKER_INTERRUPTED',
      );
    }
    if (
      !metadata ||
      !operationMatches ||
      operationStatus === 'CANCELLED' ||
      operationStatus !== 'QUEUED'
    )
      return;
    const userEntity = await this.userRepo.findOne({
      where: { _id: data.userId, isDeleted: false },
    });
    if (!userEntity)
      return this.generationState.finishGeneration(
        data,
        'FAILED',
        'OWNER_NOT_FOUND',
      );
    const user = userEntity as unknown as IUser;
    const policy = getActiveAiCvConsentPolicy(
      this.configService,
      AiCvConsentScope.CV_GENERATION,
    );
    if (
      policy.consentVersion !== data.consentVersion ||
      policy.policyHash !== data.consentPolicyHash ||
      !(await this.aiCvConsentsService.hasValidConsent(
        data.userId,
        AiCvConsentScope.CV_GENERATION,
        data.consentVersion,
        data.consentPolicyHash,
      ))
    )
      return this.generationState.finishGeneration(
        data,
        'FAILED',
        'CONSENT_REVOKED',
      );
    if (
      data.templateType !== 'template1' &&
      !this.usersService.isCandidatePremium(userEntity)
    )
      return this.generationState.finishGeneration(
        data,
        'FAILED',
        'ENTITLEMENT_REVOKED',
      );
    if (cv.contentVersion !== data.expectedContentVersion)
      return this.generationState.finishGeneration(
        data,
        'STALE',
        'CONTENT_VERSION_CHANGED',
      );
    if (data.kind === 'EXISTING_CV') {
      const job = data.targetJobId
        ? await this.jobsService.findOne(data.targetJobId)
        : null;
      const snapshot = this.jobSnapshot(
        job,
        cv._id,
        cv.position || cv.title || undefined,
      );
      const sourceVersion = createHash('sha256')
        .update(
          JSON.stringify({
            job: snapshot,
            updatedAt: job?.updatedAt?.toISOString() || null,
            profileVersion: cv.contentVersion || 1,
          }),
        )
        .digest('hex');
      if (sourceVersion !== data.sourceVersion)
        return this.generationState.finishGeneration(
          data,
          'STALE',
          'SOURCE_VERSION_CHANGED',
        );
    }
    if (data.kind === 'CAREER_PROFILE') {
      let profile: CandidateCareerProfile;
      try {
        profile = await this.careerProfileService.requireMine(user);
      } catch {
        return this.generationState.finishGeneration(
          data,
          'STALE',
          'PROFILE_NOT_FOUND',
        );
      }
      if (
        profile._id !== data.sourceProfileId ||
        profile.contentVersion !== data.sourceProfileVersion
      )
        return this.generationState.finishGeneration(
          data,
          'STALE',
          'PROFILE_VERSION_CHANGED',
        );
    }
    const running = await this.generationState.setGenerationStatus(
      data,
      'RUNNING',
    );
    if (!running) return;
    try {
      if (data.regenerationTarget) {
        const warnings = await handlers.regenerateSelectedItem(
          cv,
          user,
          data,
          deadline,
        );
        await this.generationState.finishGeneration(
          data,
          warnings.length ? 'DEGRADED' : 'COMPLETE',
          undefined,
          warnings,
        );
        return;
      }
      if (data.kind === 'EXISTING_CV') {
        await handlers.generateExistingCv(
          data.cvId,
          { jobId: data.targetJobId || undefined } as GenerateOnlineCvDto,
          user,
          data.operationId,
          this.generationRemaining(deadline),
        );
      } else {
        await handlers.generateFromCareerProfile(
          {
            templateType: data.templateType,
            locale: data.locale,
            jobId: data.targetJobId || undefined,
            expectedProfileVersion: data.sourceProfileVersion,
          } as GenerateFromCareerProfileDto,
          user,
          data.cvId,
          data.operationId,
          data.sourceVersion,
          this.generationRemaining(deadline),
        );
      }
      const latest = await this.onlineCVRepo.findOne({
        where: { _id: data.cvId, userId: data.userId, isDeleted: false },
      });
      const warnings = latest?.revision?.warnings || [];
      await this.generationState.finishGeneration(
        data,
        warnings.length ? 'DEGRADED' : 'COMPLETE',
        undefined,
        warnings,
      );
    } catch (error) {
      if (error instanceof ConflictException)
        return this.generationState.finishGeneration(
          data,
          'STALE',
          'SOURCE_CHANGED',
        );
      if (
        error instanceof GatewayTimeoutException ||
        (error instanceof AiServiceError && error.code === 'AI_SERVICE_TIMEOUT')
      )
        return this.generationState.finishGeneration(
          data,
          'FAILED',
          'AI_TIMEOUT',
        );
      Logger.error(
        JSON.stringify({
          event: 'cv_generation_failed',
          operation_id: data.operationId,
          kind: data.kind,
          stage: 'generation',
          error_code:
            error instanceof AiServiceError
              ? error.code
              : error instanceof BadRequestException ||
                error instanceof ForbiddenException ||
                error instanceof NotFoundException ||
                error instanceof ServiceUnavailableException
              ? `HTTP_${error.getStatus()}`
              : 'GENERATION_FAILED',
          error_type:
            error instanceof Error &&
            /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(error.name)
              ? error.name
              : 'UnknownError',
        }),
      );
      return this.generationState.finishGeneration(
        data,
        'FAILED',
        'GENERATION_FAILED',
      );
    }
  }
}
