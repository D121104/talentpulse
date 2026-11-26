import {
  BadRequestException,
  BadGatewayException,
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
import { Cron, CronExpression } from '@nestjs/schedule';
import { DeepPartial, EntityManager, Not, Raw, Repository } from 'typeorm';
import { Job } from 'src/jobs/entities/job.entity';
import { Company } from 'src/companies/entities/company.entity';
import { isCanonicalActiveJob } from 'src/active-jobs/active-job-query.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { OnlineCV, OnlineCvGenerationMode } from './entities/online-cv.entity';
import type { OnlineCvLocale } from './entities/online-cv.entity';
import { User } from 'src/users/entities/user.entity';
import { UsersService } from 'src/users/users.service';
import { IUser } from 'src/users/users.interface';
import { CreateOnlineCVDto } from './dto/create-online-cv.dto';
import { UpdateOnlineCVDto } from './dto/update-online-cv.dto';
import { createHash, randomUUID } from 'crypto';

import { RedisService } from 'src/redis/redis.service';
import { AiCvConsentsService } from 'src/ai-consents/ai-cv-consents.service';
import {
  AiCvConsentScope,
  ActiveAiCvConsentPolicy,
  getActiveAiCvConsentPolicy,
} from 'src/ai-consents/ai-cv-consent.policy';
import {
  AiServiceClient,
  AiServiceError,
  CvDraftRequest,
  CvDraftResponse,
  CvDraftReviewResponse,
} from 'src/ai-matching/ai-service.client';
import { JobsService } from 'src/jobs/jobs.service';
import { Role } from 'src/decorator/customize';
import { GenerateOnlineCvDto } from './dto/generate-online-cv.dto';
import { GenerateFromCareerProfileDto } from 'src/candidate-career-profile/dto/update-candidate-career-profile.dto';
import { EnqueueOnlineCvGenerationDto } from './dto/generate-online-cv.dto';
import { isRedisEnabled } from 'src/config/runtime-flags';
import {
  CvGenerationJobData,
  CvGenerationMetadata,
  CvGenerationOperationStatus,
  CvGenerationPendingDraft,
  CvRegenerationTarget,
  ONLINE_CV_GENERATION_QUEUE,
  ONLINE_CV_GENERATION_PROCESS,
} from './async-cv-generation.types';
import { CandidateCareerProfileService } from 'src/candidate-career-profile/candidate-career-profile.service';
import { CandidateCareerProfile } from 'src/candidate-career-profile/entities/candidate-career-profile.entity';
import {
  filterMeaningfulCvEntries,
  normalizeCvEntryCollections,
} from 'src/core/cv-entry-filter';
import { OnlineCvPdfService } from './online-cv-pdf.service';
import { OnlineCvDraftLifecycleService } from './online-cv-draft-lifecycle.service';
import { OnlineCvGenerationStateService } from './online-cv-generation-state.service';
import { OnlineCvGenerationWorkerService } from './online-cv-generation-worker.service';
import {
  currentCvSkillLiterals,
  cvDraftHash,
  normalizeCvLocale,
  safeReviewWarnings,
  skillLiteral,
} from './online-cv-generation.utils';

export { escapeHtml, sanitizePdfHtml } from './online-cv-pdf.utils';
export {
  dedupeCvText,
  draftDescription,
  normalizeCvContentKey,
} from './online-cv-generation.utils';

const CV_GENERATION_TIMEOUT_MS = 300_000;

interface StageAgentDraftInput {
  deadline: number;
  cv: OnlineCV;
  user: IUser;
  job: Job | null;
  targetJobId: string | null;
  policy: ActiveAiCvConsentPolicy;
  request: CvDraftRequest;
  reviewResponse: CvDraftReviewResponse;
  expectedContentVersion: number;
  operationId?: string;
  kind: CvGenerationMetadata['kind'];
}

interface StageCareerProfileDraftInput {
  deadline: number;
  targetCvId?: string;
  sourcePlaceholderData: DeepPartial<OnlineCV>;
  user: IUser;
  profile: CandidateCareerProfile;
  normalizedProfile: Record<string, unknown>;
  job: Job | null;
  targetJobId: string | null;
  policy: ActiveAiCvConsentPolicy;
  request: CvDraftRequest;
  reviewResponse: CvDraftReviewResponse;
  operationId?: string;
}

interface StageCareerProfileDraftInput {
  targetCvId?: string;
  sourcePlaceholderData: DeepPartial<OnlineCV>;
  user: IUser;
  profile: CandidateCareerProfile;
  normalizedProfile: Record<string, unknown>;
  job: Job | null;
  targetJobId: string | null;
  policy: ActiveAiCvConsentPolicy;
  request: CvDraftRequest;
  reviewResponse: CvDraftReviewResponse;
  operationId?: string;
}

@Injectable()
export class OnlineCVsService {
  constructor(
    @InjectRepository(OnlineCV)
    private readonly onlineCVRepo: Repository<OnlineCV>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly usersService: UsersService,
    private readonly redisService: RedisService,
    private readonly aiCvConsentsService: AiCvConsentsService,
    private readonly aiServiceClient: AiServiceClient,
    private readonly jobsService: JobsService,
    private readonly configService: ConfigService,
    private readonly careerProfileService: CandidateCareerProfileService,
    @InjectQueue(ONLINE_CV_GENERATION_QUEUE)
    private readonly generationQueue: Queue<CvGenerationJobData>,
    private readonly pdfService: OnlineCvPdfService,
    private readonly draftLifecycle: OnlineCvDraftLifecycleService,
    private readonly generationState: OnlineCvGenerationStateService,
    private readonly generationWorker: OnlineCvGenerationWorkerService,
  ) {}

  private async invalidateUserCvSkillsCache(userId: string) {
    try {
      if (userId) {
        await this.redisService.deleteValue(`user:${userId}:primary-cv-skills`);
      }
    } catch {
      // Ignore cache deletion error
    }
  }

  // Create a new online CV
  async create(createOnlineCVDto: CreateOnlineCVDto, user: IUser) {
    if (createOnlineCVDto.generationMode === 'EDITOR_ONLY') {
      throw new BadRequestException(
        'Chỉ endpoint tạo CV bằng AI mới được tạo CV ở chế độ EDITOR_ONLY',
      );
    }
    const userInDb = await this.userRepo.findOne({ where: { _id: user._id } });
    if (!userInDb) {
      throw new NotFoundException('Không tìm thấy tài khoản người dùng');
    }

    const isPremium = this.usersService.isCandidatePremium(userInDb);
    const isVerified = userInDb.isVerified || false;

    // 1. Enforce max CV limits: Thường (3), Đã xác thực (6), Premium (Không giới hạn)
    const maxLimit = this.usersService.getUserMaxCvLimit(userInDb);
    const currentCount = await this.onlineCVRepo.count({
      where: { userId: user._id, isDeleted: false },
    });

    if (currentCount >= maxLimit) {
      const upgradeMsg = isVerified
        ? 'Vui lòng nâng cấp gói Candidate Premium để tạo không giới hạn CV.'
        : 'Vui lòng xác thực tài khoản qua Email (để nâng hạn mức lên 6 CV) hoặc nâng cấp gói Candidate Premium (không giới hạn CV).';
      throw new ForbiddenException(
        `Bạn đã đạt giới hạn tối đa ${maxLimit} CV cho cấp tài khoản hiện tại. ${upgradeMsg}`,
      );
    }

    // 2. Enforce Premium Template Lock: Template khác template1 là mẫu Cao Cấp
    const isPremiumTemplate =
      createOnlineCVDto.templateType &&
      createOnlineCVDto.templateType !== 'template1';

    if (isPremiumTemplate && !isPremium) {
      throw new ForbiddenException(
        'Mẫu CV Cao Cấp này chỉ dành riêng cho tài khoản Candidate Premium. Vui lòng nâng cấp gói Premium để tạo CV với mẫu này.',
      );
    }

    const isPrimary =
      currentCount === 0 || createOnlineCVDto.isPrimary === true;

    if (isPrimary) {
      await this.onlineCVRepo.update(
        { userId: user._id, isPrimary: true },
        { isPrimary: false },
      );
    }

    const normalizedDto = normalizeCvEntryCollections(createOnlineCVDto);
    const {
      htmlContent,
      generationMode: _generationMode,
      locale,
      ...dataToSave
    } = normalizedDto;
    const newCV = this.onlineCVRepo.create({
      ...dataToSave,
      generationMode: OnlineCvGenerationMode.MANUAL,
      isPrimary,
      htmlContent,
      revision: {
        contentVersion: 1,
        locale: normalizeCvLocale(locale),
        sourceTrace: { locale: normalizeCvLocale(locale) },
      },
      userId: user._id,
      createdBy: {
        _id: user._id,
        email: user.email,
      },
    });

    const savedCV = await this.onlineCVRepo.save(newCV);
    await this.invalidateUserCvSkillsCache(user._id);

    // If htmlContent is provided, generate PDF & upload to Cloudinary
    if (savedCV.generationMode !== 'EDITOR_ONLY') {
      try {
        await this.exportToPdf(savedCV._id, user, htmlContent);
      } catch (err) {
        Logger.error('Auto PDF generation on create failed:', err);
      }
    }

    return await this.findOne(savedCV._id, user);
  }

  async generate(
    id: string,
    dto: GenerateOnlineCvDto,
    user: IUser,
    operationId?: string,
    aiTimeoutMs?: number,
  ) {
    const deadline =
      Date.now() +
      Math.min(
        aiTimeoutMs ?? CV_GENERATION_TIMEOUT_MS,
        CV_GENERATION_TIMEOUT_MS,
      );
    return this.withGenerationDeadline(deadline, () =>
      this.generateWithinDeadline(id, dto, user, operationId, deadline),
    );
  }

  private async withGenerationDeadline<T>(
    deadline: number,
    work: () => Promise<T>,
  ): Promise<T> {
    const remaining = this.generationRemaining(deadline);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        work(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new GatewayTimeoutException(
                  'Dịch vụ AI tạo CV phản hồi quá thời gian',
                ),
              ),
            remaining,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private generationRemaining(deadline: number): number {
    const remaining = deadline - Date.now();
    if (remaining <= 0)
      throw new GatewayTimeoutException(
        'Dịch vụ AI tạo CV phản hồi quá thời gian',
      );
    return remaining;
  }

  private async generateWithinDeadline(
    id: string,
    dto: GenerateOnlineCvDto,
    user: IUser,
    operationId: string | undefined,
    deadline: number,
  ) {
    const startedAt = Date.now();
    if (user.role !== Role.USER) {
      throw new ForbiddenException('Chỉ ứng viên mới được tạo CV bằng AI');
    }
    const cv = await this.findOne(id, user);
    if (
      !operationId &&
      ['QUEUED', 'RUNNING'].includes(this.generationTrace(cv)?.status || '')
    ) {
      throw new ConflictException(
        'CV đang được tạo; vui lòng chờ hoặc hủy yêu cầu',
      );
    }
    const policy = getActiveAiCvConsentPolicy(
      this.configService,
      AiCvConsentScope.CV_GENERATION,
    );
    const hasConsent = await this.aiCvConsentsService.hasValidConsent(
      user._id,
      AiCvConsentScope.CV_GENERATION,
      policy.consentVersion,
      policy.policyHash,
    );
    if (!hasConsent) {
      throw new ForbiddenException(
        'Cần cấp quyền xử lý AI cho mục đích tạo CV trước khi sử dụng tính năng này',
      );
    }

    const userInDb = await this.userRepo.findOne({
      where: { _id: user._id, isDeleted: false },
    });
    if (!userInDb)
      throw new NotFoundException('Không tìm thấy tài khoản người dùng');
    if (
      cv.templateType !== 'template1' &&
      !this.usersService.isCandidatePremium(userInDb)
    ) {
      throw new ForbiddenException(
        'Mẫu CV Cao Cấp này chỉ dành riêng cho tài khoản Candidate Premium',
      );
    }

    const job = dto.jobId ? await this.jobsService.findOne(dto.jobId) : null;
    const targetJobId = job?._id ?? null;
    const jobIdForContract = targetJobId ?? cv._id;
    const jobSnapshot = {
      job_id: jobIdForContract,
      title: job?.name || cv.position || cv.title || 'Candidate CV',
      company_name: job?.company?.name || null,
      description: job?.description || null,
      location: job?.location || null,
      work_mode: job?.workingModel || null,
      level: job?.level || null,
      required_skills: job?.skills || [],
      preferred_skills: [],
    };
    const sourceVersion = createHash('sha256')
      .update(
        JSON.stringify({
          job: jobSnapshot,
          updatedAt: job?.updatedAt?.toISOString() || null,
          profileVersion: cv.contentVersion || 1,
        }),
      )
      .digest('hex');
    const expectedContentVersion = Math.max(1, Number(cv.contentVersion || 1));
    const nextContentVersion = expectedContentVersion + 1;
    const identity = {
      request_id: randomUUID(),
      trace_id: randomUUID(),
      operation_attempt_id: randomUUID(),
    };
    const inputCv = cv;
    const profile = {
      candidate_id: user._id,
      // Contact PII stays in canonical PostgreSQL data and is restored from the CV
      // after generation; the provider only receives a non-identifying placeholder.
      full_name: 'Candidate',
      email: null,
      phone: null,
      link: null,
      address: null,
      headline: cv.position || null,
      career_objective: inputCv.careerObjective || null,
      skills: currentCvSkillLiterals(cv),
      experience: (inputCv.workExperience || []).map((entry) => ({
        company_name: entry.companyName || null,
        position: entry.position || null,
        start_date: entry.startDate || null,
        end_date: entry.endDate || null,
        description: entry.description || null,
      })),
      education: (inputCv.education || []).map((entry) => ({
        school_name: entry.schoolName || null,
        degree: entry.degree || null,
        major: entry.major || null,
        start_date: entry.startDate || null,
        end_date: entry.endDate || null,
        description: entry.description || null,
      })),
      projects: (inputCv.projects || [])
        .filter((entry) => Boolean(entry.projectName))
        .map((entry) => ({
          project_name: entry.projectName,
          role: entry.role || null,
          start_date: entry.startDate || null,
          end_date: entry.endDate || null,
          description: entry.description || null,
          technologies: entry.technologies || [],
        })),
      certificates: (inputCv.certificates || [])
        .map((entry) => (typeof entry === 'string' ? entry : entry?.name || ''))
        .filter(Boolean),
      activities: (inputCv.activities || [])
        .map((entry) =>
          typeof entry === 'string'
            ? entry
            : [entry?.organizationName, entry?.position, entry?.description]
                .filter(Boolean)
                .join(' - '),
        )
        .filter(Boolean),
      awards: (inputCv.awards || [])
        .map((entry) =>
          typeof entry === 'string'
            ? entry
            : [entry?.name, entry?.description].filter(Boolean).join(' - '),
        )
        .filter(Boolean),
    };
    // Keep the selected output locale across regeneration.
    const locale = normalizeCvLocale(cv.revision?.locale);
    const request: CvDraftRequest = {
      identity,
      candidate: profile,
      job: jobSnapshot,
      template_type: cv.templateType as 'template1' | 'template2',
      locale,
      source_version: sourceVersion,
      content_version: nextContentVersion,
      consent_version: policy.consentVersion,
    };

    let reviewResponse: CvDraftReviewResponse;
    try {
      reviewResponse = await this.aiServiceClient.generateCvDraftReview(
        request,
        { timeoutMs: this.generationRemaining(deadline) },
      );
    } catch (error) {
      this.logCvGenerationFailure(request, operationId, error);
      if (
        error instanceof GatewayTimeoutException ||
        (error instanceof AiServiceError && error.code === 'AI_SERVICE_TIMEOUT')
      ) {
        throw new GatewayTimeoutException(
          'Dịch vụ AI tạo CV phản hồi quá thời gian',
        );
      }
      throw new BadGatewayException('Dịch vụ AI tạo CV hiện không khả dụng');
    }
    const generated = reviewResponse.draft;
    this.generationRemaining(deadline);

    if (
      generated.target_job_id !== jobIdForContract ||
      generated.candidate_id !== user._id
    ) {
      throw new BadGatewayException(
        'Dữ liệu trả về từ dịch vụ AI không hợp lệ',
      );
    }
    if (reviewResponse.implementation !== 'agent') {
      throw new BadGatewayException(
        'Dịch vụ AI trả về kiểu tạo CV không được hỗ trợ',
      );
    }
    const stagedResult = await this.stageAgentDraft({
      deadline,
      cv,
      user,
      job,
      targetJobId,
      policy,
      request,
      reviewResponse,
      expectedContentVersion,
      operationId,
      kind: 'EXISTING_CV',
    });
    this.logCvGenerationObservation({
      request,
      implementation: 'agent',
      status: stagedResult.status,
      reviewStatus: 'PENDING_REVIEW',
      durationMs: Date.now() - startedAt,
      modelCalls: 1,
      toolCalls: 0,
      errorType: null,
    });
    return stagedResult;
  }

  private logCvGenerationObservation(input: {
    request: CvDraftRequest;
    implementation: 'legacy' | 'agent';
    status: string;
    reviewStatus: string;
    durationMs: number;
    modelCalls: number;
    toolCalls: number;
    errorType: string | null;
  }): void {
    const { request } = input;
    Logger.log(
      JSON.stringify({
        operation_attempt_id: request.identity.operation_attempt_id,
        request_id: request.identity.request_id,
        trace_id: request.identity.trace_id,
        correlation_id: request.identity.trace_id,
        capability_id: 'cv_generation',
        implementation: input.implementation,
        status: input.status,
        review_status: input.reviewStatus,
        duration_ms: Math.max(0, input.durationMs),
        steps: input.implementation === 'agent' ? 1 : 0,
        model_calls: input.modelCalls,
        tool_calls: input.toolCalls,
        error_type: input.errorType,
      }),
    );
  }

  private logCvGenerationFailure(
    request: CvDraftRequest,
    operationId: string | undefined,
    error: unknown,
  ): void {
    const errorCode =
      error instanceof AiServiceError
        ? error.code
        : error instanceof BadRequestException ||
          error instanceof ForbiddenException ||
          error instanceof NotFoundException ||
          error instanceof ServiceUnavailableException
        ? `HTTP_${error.getStatus()}`
        : 'AI_GENERATION_FAILED';
    const errorType =
      error instanceof Error && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(error.name)
        ? error.name
        : 'UnknownError';
    Logger.error(
      JSON.stringify({
        event: 'cv_ai_generation_failed',
        operation_id: operationId || 'none',
        request_id: request.identity.request_id,
        trace_id: request.identity.trace_id,
        operation_attempt_id: request.identity.operation_attempt_id,
        error_code: errorCode,
        error_type: errorType,
      }),
    );
  }

  private normalizedCareerProfileSnapshot(
    profile: CandidateCareerProfile,
    user: User,
  ) {
    return {
      contact: {
        fullName: profile.contact?.fullName || user.name || user.email,
        email: profile.contact?.email || user.email,
        phone: profile.contact?.phone || null,
        link: profile.contact?.link || null,
        address: profile.contact?.address || user.address || null,
        avatar: profile.contact?.avatar || user.avatar || null,
      },
      headline: profile.headline || null,
      objective: profile.objective || null,
      experience: filterMeaningfulCvEntries(profile.experience || []),
      education: filterMeaningfulCvEntries(profile.education || []),
      projects: filterMeaningfulCvEntries(profile.projects || []),
      certificates: filterMeaningfulCvEntries(profile.certificates || []),
      skills: filterMeaningfulCvEntries(profile.skills || []),
      activities: filterMeaningfulCvEntries(profile.activities || []),
      awards: filterMeaningfulCvEntries(profile.awards || []),
      contentVersion: profile.contentVersion,
    };
  }

  async generateFromCareerProfile(
    dto: GenerateFromCareerProfileDto,
    user: IUser,
    targetCvId?: string,
    operationId?: string,
    expectedSourceVersion?: string,
    aiTimeoutMs?: number,
  ) {
    const deadline =
      Date.now() +
      Math.min(
        aiTimeoutMs ?? CV_GENERATION_TIMEOUT_MS,
        CV_GENERATION_TIMEOUT_MS,
      );
    return this.withGenerationDeadline(deadline, () =>
      this.generateProfileWithinDeadline(
        dto,
        user,
        targetCvId,
        operationId,
        expectedSourceVersion,
        deadline,
      ),
    );
  }

  private async generateProfileWithinDeadline(
    dto: GenerateFromCareerProfileDto,
    user: IUser,
    targetCvId: string | undefined,
    operationId: string | undefined,
    expectedSourceVersion: string | undefined,
    deadline: number,
  ) {
    if (user.role !== Role.USER) {
      throw new ForbiddenException('Chỉ ứng viên mới được tạo CV bằng AI');
    }
    const profile = await this.careerProfileService.requireMine(user);
    if (
      dto.expectedProfileVersion !== undefined &&
      dto.expectedProfileVersion !== profile.contentVersion
    ) {
      throw new ConflictException(
        'Hồ sơ nghề nghiệp đã được thay đổi; vui lòng tải lại trước khi tạo CV',
      );
    }
    const policy = getActiveAiCvConsentPolicy(
      this.configService,
      AiCvConsentScope.CV_GENERATION,
    );
    const hasConsent = await this.aiCvConsentsService.hasValidConsent(
      user._id,
      AiCvConsentScope.CV_GENERATION,
      policy.consentVersion,
      policy.policyHash,
    );
    if (!hasConsent) {
      throw new ForbiddenException(
        'Cần cấp quyền xử lý AI cho mục đích tạo CV trước khi sử dụng tính năng này',
      );
    }

    const userInDb = await this.userRepo.findOne({
      where: { _id: user._id, isDeleted: false },
    });
    if (!userInDb) {
      throw new NotFoundException('Không tìm thấy tài khoản người dùng');
    }
    const templateType = dto.templateType || 'template1';
    const locale = normalizeCvLocale(dto.locale);
    if (
      templateType !== 'template1' &&
      !this.usersService.isCandidatePremium(userInDb)
    ) {
      throw new ForbiddenException(
        'Mẫu CV Cao Cấp này chỉ dành riêng cho tài khoản Candidate Premium',
      );
    }

    const maxLimit = this.usersService.getUserMaxCvLimit(userInDb);
    const currentCount = await this.onlineCVRepo.count({
      where: {
        userId: user._id,
        isDeleted: false,
        ...(targetCvId ? { _id: Not(targetCvId) } : {}),
      },
    });
    if (currentCount >= maxLimit) {
      throw new ForbiddenException(
        `Bạn đã đạt giới hạn tối đa ${maxLimit} CV cho cấp tài khoản hiện tại`,
      );
    }

    const job = dto.jobId ? await this.jobsService.findOne(dto.jobId) : null;
    const targetJobId = job?._id || null;
    const jobIdForContract = targetJobId || profile._id;
    const jobSnapshot = {
      job_id: jobIdForContract,
      title: job?.name || 'Candidate CV',
      company_name: job?.company?.name || null,
      description: job?.description || null,
      location: job?.location || null,
      work_mode: job?.workingModel || null,
      level: job?.level || null,
      required_skills: job?.skills || [],
      preferred_skills: [],
    };
    const normalizedProfile = this.normalizedCareerProfileSnapshot(
      profile,
      userInDb,
    );
    const candidate = {
      candidate_id: user._id,
      // Contact PII is retained in the canonical profile/snapshot and restored below;
      // the AI service only needs a non-identifying placeholder for generation.
      full_name: 'Candidate',
      email: null,
      phone: null,
      link: null,
      address: null,
      headline: normalizedProfile.headline,
      career_objective: normalizedProfile.objective,
      skills: normalizedProfile.skills.map(skillLiteral).filter(Boolean),
      experience: normalizedProfile.experience.map((entry) => ({
        company_name: entry.companyName || null,
        position: entry.position || null,
        start_date: entry.startDate || null,
        end_date: entry.endDate || null,
        description: entry.description || null,
      })),
      education: normalizedProfile.education.map((entry) => ({
        school_name: entry.schoolName || null,
        degree: entry.degree || null,
        major: entry.major || null,
        start_date: entry.startDate || null,
        end_date: entry.endDate || null,
        description: entry.description || null,
      })),
      projects: normalizedProfile.projects
        .filter((entry) => Boolean(entry.projectName))
        .map((entry) => ({
          project_name: entry.projectName,
          role: entry.role || null,
          start_date: entry.startDate || null,
          end_date: entry.endDate || null,
          description: entry.description || null,
          technologies: entry.technologies || [],
        })),
      certificates: normalizedProfile.certificates
        .map((entry) => entry?.name || '')
        .filter(Boolean),
      activities: normalizedProfile.activities
        .map((entry) =>
          [
            entry?.organizationName,
            entry?.position,
            entry?.startDate,
            entry?.endDate,
            entry?.description,
          ]
            .filter(Boolean)
            .join(' - '),
        )
        .filter(Boolean),
      awards: normalizedProfile.awards
        .map((entry) =>
          [entry?.name, entry?.description].filter(Boolean).join(' - '),
        )
        .filter(Boolean),
    };
    const sourceVersion = createHash('sha256')
      .update(JSON.stringify({ profile: normalizedProfile, job: jobSnapshot }))
      .digest('hex');
    if (expectedSourceVersion && sourceVersion !== expectedSourceVersion) {
      throw new ConflictException(
        'Nguồn hồ sơ đã thay đổi trong khi AI đang tạo CV',
      );
    }
    const identity = {
      request_id: randomUUID(),
      trace_id: randomUUID(),
      operation_attempt_id: randomUUID(),
    };
    const request: CvDraftRequest = {
      identity,
      candidate,
      job: jobSnapshot,
      template_type: templateType,
      locale,
      source_version: sourceVersion,
      content_version: 1,
      consent_version: policy.consentVersion,
    };

    let reviewResponse: CvDraftReviewResponse;
    try {
      reviewResponse = await this.aiServiceClient.generateCvDraftReview(
        request,
        { timeoutMs: this.generationRemaining(deadline) },
      );
    } catch (error) {
      this.logCvGenerationFailure(request, operationId, error);
      if (
        error instanceof GatewayTimeoutException ||
        (error instanceof AiServiceError && error.code === 'AI_SERVICE_TIMEOUT')
      ) {
        throw new GatewayTimeoutException(
          'Dịch vụ AI tạo CV phản hồi quá thời gian',
        );
      }
      throw new BadGatewayException('Dịch vụ AI tạo CV hiện không khả dụng');
    }
    const generated = reviewResponse.draft;
    if (
      generated.candidate_id !== user._id ||
      generated.target_job_id !== jobIdForContract ||
      generated.source_version !== sourceVersion ||
      generated.content_version !== 1
    ) {
      throw new BadGatewayException(
        'Dữ liệu trả về từ dịch vụ AI không hợp lệ',
      );
    }

    // AI generation is long-running. Re-read the canonical profile immediately
    // before persistence so a concurrent profile edit cannot be captured as fresh.
    const latestProfile = await this.careerProfileService.requireMine(user);
    if (
      latestProfile._id !== profile._id ||
      latestProfile.contentVersion !== profile.contentVersion
    ) {
      throw new ConflictException(
        'Hồ sơ nghề nghiệp đã được thay đổi trong khi AI đang tạo CV; vui lòng thử lại',
      );
    }

    if (reviewResponse.implementation !== 'agent') {
      throw new BadGatewayException(
        'Dịch vụ AI trả về kiểu tạo CV không được hỗ trợ',
      );
    }
    const sourceOnlyPlaceholder: DeepPartial<OnlineCV> = {
      title: job ? `CV - ${job.name}` : 'Candidate CV',
      generationMode: OnlineCvGenerationMode.EDITOR_ONLY,
      contentVersion: 1,
      sourceVersion,
      generatedBy: null,
      targetJobId,
      sourceProfileId: profile._id,
      sourceProfileVersion: profile.contentVersion,
      fullName: normalizedProfile.contact.fullName,
      email: normalizedProfile.contact.email,
      phone: normalizedProfile.contact.phone,
      link: normalizedProfile.contact.link,
      address: normalizedProfile.contact.address,
      avatar: normalizedProfile.contact.avatar,
      position: job?.name || normalizedProfile.headline,
      careerObjective: normalizedProfile.objective,
      education: normalizedProfile.education.map((entry: any) => ({
        schoolName: entry.schoolName || entry.school || null,
        degree: entry.degree || null,
        major: entry.major || null,
        startDate: entry.startDate || null,
        endDate: entry.endDate || null,
        description: entry.description || null,
      })),
      workExperience: normalizedProfile.experience.map((entry: any) => ({
        companyName: entry.companyName || null,
        position: entry.position || null,
        startDate: entry.startDate || null,
        endDate: entry.endDate || null,
        description: entry.description || null,
      })),
      skills: normalizedProfile.skills
        .map((entry: any) => ({
          name: skillLiteral(entry),
          description: entry?.description || null,
        }))
        .filter((entry: any) => Boolean(entry.name)),
      projects: normalizedProfile.projects.map((entry: any) => ({
        projectName: entry.projectName || entry.name || null,
        role: entry.role || null,
        startDate: entry.startDate || null,
        endDate: entry.endDate || null,
        description: entry.description || null,
        technologies: entry.technologies || [],
      })),
      certificates: normalizedProfile.certificates.map((entry: any) =>
        typeof entry === 'string' ? { name: entry } : entry,
      ),
      activities: normalizedProfile.activities,
      awards: normalizedProfile.awards,
      generationSnapshot: normalizedProfile,
      revision: {
        contentVersion: 1,
        locale,
        sourceTrace: {
          locale,
          sourceProfileId: profile._id,
          sourceProfileVersion: profile.contentVersion,
        },
      },
      htmlContent: null,
      pdfUrl: null,
      isPrimary: false,
      isSearchable: false,
    };
    return this.stageCareerProfileAgentDraft({
      deadline,
      targetCvId,
      sourcePlaceholderData: sourceOnlyPlaceholder,
      user,
      profile,
      normalizedProfile,
      job,
      targetJobId,
      policy,
      request,
      reviewResponse,
      operationId,
    });
  }

  private assertGenerationKey(idempotencyKey: string): string {
    const normalized = idempotencyKey?.trim();
    if (!normalized || normalized.length > 200) {
      throw new BadRequestException('Idempotency-Key không hợp lệ');
    }
    return createHash('sha256').update(normalized, 'utf8').digest('hex');
  }

  private async stageAgentDraft(input: StageAgentDraftInput) {
    const {
      cv,
      user,
      job,
      targetJobId,
      policy,
      request,
      reviewResponse,
      operationId,
      kind,
    } = input;
    const generated = reviewResponse.draft;
    const draftHash = cvDraftHash(generated);
    const warnings = safeReviewWarnings(reviewResponse);
    const now = new Date();
    const nowIso = now.toISOString();
    const reviewOperationId = operationId || generated.operation_attempt_id;
    const expiresAt = new Date(
      now.getTime() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const pendingDraft: CvGenerationPendingDraft = {
      operationId: reviewOperationId,
      draftHash,
      draft: generated,
      sourceRefsByPath: reviewResponse.review_metadata.source_refs_by_path,
      fieldOriginsByPath: reviewResponse.review_metadata.field_origins_by_path,
      omissionsByPath: reviewResponse.review_metadata.omissions_by_path.map(
        ({ path, reason_code }) => ({ path, reasonCode: reason_code }),
      ),
      sourceVersion: generated.source_version,
      expectedContentVersion: input.expectedContentVersion,
      consentVersion: policy.consentVersion,
      consentPolicyHash: policy.policyHash,
      createdAt: nowIso,
      expiresAt,
      reviewStatus: 'PENDING',
    };

    const staged = await this.onlineCVRepo.manager.transaction(
      async (manager) => {
        const prerequisites = await this.assertGenerationPrerequisites(
          user,
          cv.templateType as 'template1' | 'template2',
          manager,
        );
        if (
          prerequisites.policy.consentVersion !== policy.consentVersion ||
          prerequisites.policy.policyHash !== policy.policyHash ||
          request.consent_version !== prerequisites.policy.consentVersion
        ) {
          throw new ForbiddenException('Quyền xử lý AI đã thay đổi');
        }
        await this.assertTargetJobUnchanged(manager, job);

        const repository = manager.getRepository(OnlineCV);
        const current = await repository.findOne({
          where: { _id: cv._id, userId: user._id, isDeleted: false },
          lock: { mode: 'pessimistic_write' },
        });
        if (!current) throw new NotFoundException('Không tìm thấy CV');
        if (current.contentVersion !== input.expectedContentVersion) {
          throw new ConflictException(
            'CV đã thay đổi trong khi AI đang tạo bản nháp',
          );
        }
        if (
          current.generationSnapshot?.pendingDraft?.reviewStatus === 'PENDING'
        ) {
          throw new ConflictException('CV đã có bản nháp đang chờ xem xét');
        }
        const currentGeneration = this.generationTrace(current);
        if (
          operationId &&
          (currentGeneration?.operationId !== operationId ||
            currentGeneration.status !== 'RUNNING')
        ) {
          throw new ConflictException(
            'Yêu cầu tạo CV đã bị hủy hoặc trở nên cũ',
          );
        }
        if (
          !operationId &&
          currentGeneration &&
          ['QUEUED', 'RUNNING'].includes(currentGeneration.status)
        ) {
          throw new ConflictException('CV đang được tạo; vui lòng chờ');
        }
        const jobSnapshot = this.jobSnapshot(
          job,
          targetJobId || current._id,
          current.position || current.title || 'Candidate CV',
        );
        const currentSourceVersion = createHash('sha256')
          .update(
            JSON.stringify({
              job: jobSnapshot,
              updatedAt: job?.updatedAt?.toISOString() || null,
              profileVersion: input.expectedContentVersion || 1,
            }),
          )
          .digest('hex');
        if (
          currentSourceVersion !== request.source_version ||
          generated.source_version !== request.source_version ||
          generated.content_version !== input.expectedContentVersion + 1
        ) {
          throw new ConflictException(
            'Nguồn CV đã thay đổi trong khi AI đang tạo bản nháp',
          );
        }

        const status = pendingDraft.omissionsByPath.length
          ? 'DEGRADED'
          : 'COMPLETE';
        const generationMetadata: CvGenerationMetadata = {
          ...(currentGeneration || {}),
          operationId: reviewOperationId,
          idempotencyKeyHash:
            currentGeneration?.idempotencyKeyHash ||
            createHash('sha256')
              .update(reviewOperationId, 'utf8')
              .digest('hex'),
          status,
          kind,
          userId: user._id,
          cvId: current._id,
          expectedContentVersion: input.expectedContentVersion,
          sourceVersion: generated.source_version,
          consentVersion: prerequisites.policy.consentVersion,
          consentPolicyHash: prerequisites.policy.policyHash,
          templateType: current.templateType as 'template1' | 'template2',
          locale: request.locale as OnlineCvLocale,
          targetJobId,
          attempts: currentGeneration?.attempts || 1,
          createdAt: currentGeneration?.createdAt || nowIso,
          startedAt: currentGeneration?.startedAt || nowIso,
          finishedAt: nowIso,
          warnings,
          implementation: reviewResponse.implementation,
          reviewStatus: 'PENDING',
          draftHash,
        };
        const snapshot = {
          ...(current.generationSnapshot || {}),
          pendingDraft,
        };
        const revision = {
          ...(current.revision || {}),
          contentVersion: current.contentVersion,
          locale: request.locale as OnlineCvLocale,
          sourceTrace: {
            ...(current.revision?.sourceTrace || {}),
            generation: generationMetadata,
          },
        };
        this.generationRemaining(input.deadline);
        const updateResult = await repository.update(
          this.generationWriteCriteria(current, true),
          { generationSnapshot: snapshot, revision },
        );
        if (!updateResult.affected) {
          throw new ConflictException(
            'CV hoặc bản nháp đã thay đổi trong khi AI đang xử lý',
          );
        }
        return repository.findOneOrFail({
          where: { _id: current._id, userId: user._id, isDeleted: false },
        });
      },
    );
    const metadata = this.generationTrace(staged);
    if (!metadata)
      throw new ConflictException('Không thể lưu trạng thái bản nháp');
    return this.operationResponse(metadata, staged._id, staged);
  }

  private async stageCareerProfileAgentDraft(
    input: StageCareerProfileDraftInput,
  ) {
    const {
      targetCvId,
      sourcePlaceholderData,
      user,
      profile,
      job,
      targetJobId,
      policy,
      request,
      reviewResponse,
      operationId,
    } = input;
    const generated = reviewResponse.draft;
    const draftHash = cvDraftHash(generated);
    const warnings = safeReviewWarnings(reviewResponse);
    const nowIso = new Date().toISOString();
    const reviewOperationId = operationId || generated.operation_attempt_id;
    const expiresAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const staged = await this.onlineCVRepo.manager.transaction(
      async (manager) => {
        const { policy: activePolicy, userInDb } =
          await this.assertGenerationPrerequisites(
            user,
            request.template_type,
            manager,
          );
        if (
          activePolicy.consentVersion !== policy.consentVersion ||
          activePolicy.policyHash !== policy.policyHash ||
          request.consent_version !== activePolicy.consentVersion
        ) {
          throw new ForbiddenException('Quyền xử lý AI đã thay đổi');
        }
        const profileRepository = manager.getRepository(CandidateCareerProfile);
        const currentProfile = await profileRepository.findOne({
          where: { _id: profile._id, userId: user._id },
          lock: { mode: 'pessimistic_write' },
        });
        if (
          !currentProfile ||
          currentProfile.contentVersion !== profile.contentVersion
        ) {
          throw new ConflictException(
            'Hồ sơ nghề nghiệp đã thay đổi trong khi AI đang tạo CV',
          );
        }
        await this.assertTargetJobUnchanged(manager, job);
        const jobSnapshot = this.jobSnapshot(
          job,
          targetJobId || currentProfile._id,
        );
        const sourceVersion = createHash('sha256')
          .update(
            JSON.stringify({
              profile: this.normalizedCareerProfileSnapshot(
                currentProfile,
                userInDb,
              ),
              job: jobSnapshot,
            }),
          )
          .digest('hex');
        if (
          sourceVersion !== request.source_version ||
          generated.source_version !== sourceVersion ||
          generated.content_version !== request.content_version
        ) {
          throw new ConflictException(
            'Nguồn hồ sơ đã thay đổi trong khi AI đang tạo CV',
          );
        }

        const repository = manager.getRepository(OnlineCV);
        let current = targetCvId
          ? await repository.findOne({
              where: { _id: targetCvId, userId: user._id, isDeleted: false },
              lock: { mode: 'pessimistic_write' },
            })
          : null;
        if (targetCvId && !current)
          throw new NotFoundException('Không tìm thấy CV');
        if (!current) {
          this.generationRemaining(input.deadline);
          current = await repository.save(
            repository.create(sourcePlaceholderData),
          );
        }
        const expectedContentVersion = Number(current.contentVersion || 1);
        const currentGeneration = this.generationTrace(current);
        if (
          operationId &&
          (currentGeneration?.operationId !== operationId ||
            currentGeneration.status !== 'RUNNING')
        ) {
          throw new ConflictException(
            'Yêu cầu tạo CV đã bị hủy hoặc trở nên cũ',
          );
        }
        if (
          !operationId &&
          currentGeneration &&
          ['QUEUED', 'RUNNING'].includes(currentGeneration.status)
        ) {
          throw new ConflictException('CV đang được tạo; vui lòng chờ');
        }
        const pendingDraft: CvGenerationPendingDraft = {
          operationId: reviewOperationId,
          draftHash,
          draft: generated,
          sourceRefsByPath: reviewResponse.review_metadata.source_refs_by_path,
          fieldOriginsByPath:
            reviewResponse.review_metadata.field_origins_by_path,
          omissionsByPath: reviewResponse.review_metadata.omissions_by_path.map(
            ({ path, reason_code }) => ({ path, reasonCode: reason_code }),
          ),
          sourceVersion,
          expectedContentVersion,
          consentVersion: activePolicy.consentVersion,
          consentPolicyHash: activePolicy.policyHash,
          createdAt: nowIso,
          expiresAt,
          reviewStatus: 'PENDING',
        };
        const status = pendingDraft.omissionsByPath.length
          ? 'DEGRADED'
          : 'COMPLETE';
        const generationMetadata: CvGenerationMetadata = {
          ...(currentGeneration || {}),
          operationId: reviewOperationId,
          idempotencyKeyHash:
            currentGeneration?.idempotencyKeyHash ||
            createHash('sha256')
              .update(reviewOperationId, 'utf8')
              .digest('hex'),
          status,
          kind: 'CAREER_PROFILE',
          userId: user._id,
          cvId: current._id,
          sourceProfileId: currentProfile._id,
          sourceProfileVersion: currentProfile.contentVersion,
          expectedContentVersion,
          sourceVersion,
          consentVersion: activePolicy.consentVersion,
          consentPolicyHash: activePolicy.policyHash,
          templateType: current.templateType as 'template1' | 'template2',
          locale: request.locale as OnlineCvLocale,
          targetJobId,
          attempts: currentGeneration?.attempts || 1,
          createdAt: currentGeneration?.createdAt || nowIso,
          startedAt: currentGeneration?.startedAt || nowIso,
          finishedAt: nowIso,
          warnings,
          implementation: reviewResponse.implementation,
          reviewStatus: 'PENDING',
          draftHash,
        };
        const snapshot = {
          ...(current.generationSnapshot || {}),
          pendingDraft,
        };
        const revision = {
          ...(current.revision || {}),
          contentVersion: current.contentVersion,
          locale: request.locale as OnlineCvLocale,
          sourceTrace: {
            ...(current.revision?.sourceTrace || {}),
            generation: generationMetadata,
          },
        };
        this.generationRemaining(input.deadline);
        const updateResult = await repository.update(
          this.generationWriteCriteria(current, true),
          {
            generationSnapshot: snapshot,
            revision,
            ...(targetCvId ? {} : { isPrimary: false, isSearchable: false }),
          },
        );
        if (!updateResult.affected) {
          throw new ConflictException(
            'CV hoặc hồ sơ đã thay đổi trong khi AI đang tạo bản nháp',
          );
        }
        return repository.findOneOrFail({
          where: { _id: current._id, userId: user._id, isDeleted: false },
        });
      },
    );
    const metadata = this.generationTrace(staged);
    if (!metadata)
      throw new ConflictException('Không thể lưu trạng thái bản nháp');
    return this.operationResponse(metadata, staged._id, staged);
  }

  private generationTrace(cv: OnlineCV): CvGenerationMetadata | undefined {
    const value = cv.revision?.sourceTrace?.generation;
    return value && typeof value === 'object' ? value : undefined;
  }

  private expirePendingDraft(cv: OnlineCV): Promise<boolean> {
    return this.draftLifecycle.expirePendingDraft(cv);
  }

  private publicOnlineCv(cv: OnlineCV): Record<string, unknown> {
    const { generationSnapshot, ...publicCv } = cv;
    const pending = generationSnapshot?.pendingDraft;
    return {
      ...publicCv,
      ...(pending?.reviewStatus === 'PENDING'
        ? {
            pendingGeneration: {
              operationId: pending.operationId,
              reviewStatus: pending.reviewStatus,
              draftHash: pending.draftHash,
              expiresAt: pending.expiresAt,
            },
          }
        : {}),
    };
  }

  private generationWriteCriteria(
    cv: OnlineCV,
    compareGenerationSnapshot = false,
  ) {
    return {
      _id: cv._id,
      userId: cv.userId,
      isDeleted: false,
      contentVersion: cv.contentVersion,
      revision: Raw(
        (alias) =>
          `${alias} IS NOT DISTINCT FROM CAST(:expectedRevision AS jsonb)`,
        { expectedRevision: cv.revision ? JSON.stringify(cv.revision) : null },
      ),
      ...(compareGenerationSnapshot
        ? {
            generationSnapshot: Raw(
              (alias) =>
                `${alias} IS NOT DISTINCT FROM CAST(:expectedGenerationSnapshot AS jsonb)`,
              {
                expectedGenerationSnapshot: cv.generationSnapshot
                  ? JSON.stringify(cv.generationSnapshot)
                  : null,
              },
            ),
          }
        : {}),
    };
  }

  private operationResponse(
    metadata: CvGenerationMetadata,
    cvId: string,
    cv?: OnlineCV,
  ) {
    const active = ['QUEUED', 'RUNNING'].includes(metadata.status);
    const current = cv ? this.publicOnlineCv(cv) : undefined;
    const pending = cv?.generationSnapshot?.pendingDraft;
    const discardedReview = ['REJECTED', 'EXPIRED'].includes(
      metadata.reviewStatus || '',
    );
    const reviewMetadata = pending
      ? {
          fieldOriginsByPath: pending.fieldOriginsByPath,
          omissionsByPath: pending.omissionsByPath,
        }
      : undefined;
    return {
      status: metadata.status === 'RUNNING' ? 'PROCESSING' : metadata.status,
      operationId: metadata.operationId,
      onlineCvId: cvId,
      acceptedAt: metadata.createdAt,
      updatedAt:
        metadata.finishedAt || metadata.startedAt || metadata.createdAt,
      pollAfterSeconds: active ? 5 : 0,
      kind: metadata.kind,
      sourceVersion: metadata.sourceVersion,
      sourceProfileId: metadata.sourceProfileId || null,
      sourceProfileVersion: metadata.sourceProfileVersion || null,
      expectedContentVersion: metadata.expectedContentVersion || null,
      targetJobId: metadata.targetJobId || null,
      templateType: metadata.templateType,
      locale: metadata.locale,
      attempts: 1,
      errorCode: metadata.errorCode || null,
      warnings: metadata.warnings || [],
      ...(metadata.regeneration &&
      metadata.operationId === metadata.regeneration.operationId
        ? {
            regenerationTarget: {
              reviewOperationId: metadata.regeneration.reviewOperationId,
              expectedDraftHash: metadata.regeneration.expectedDraftHash,
              targetPath: metadata.regeneration.targetPath,
            },
          }
        : {}),
      ...(!active && current ? { current } : {}),
      ...(cv && ['COMPLETE', 'DEGRADED'].includes(metadata.status)
        ? {
            ...(!discardedReview ? { draft: pending?.draft || current } : {}),
            generationMode: cv.generationMode,
            contentVersion: cv.contentVersion,
            sourceVersion: cv.sourceVersion,
            generatedBy: cv.generatedBy,
            revision: cv.revision,
            ...(pending || metadata.reviewStatus
              ? {
                  reviewStatus: pending?.reviewStatus || metadata.reviewStatus,
                }
              : {}),
            ...(pending?.draftHash || metadata.draftHash
              ? { draftHash: pending?.draftHash || metadata.draftHash }
              : {}),
            ...(reviewMetadata ? { reviewMetadata } : {}),
          }
        : {}),
    };
  }

  private async assertGenerationPrerequisites(
    user: IUser,
    templateType: 'template1' | 'template2',
    manager?: EntityManager,
  ) {
    if (user.role !== Role.USER) {
      throw new ForbiddenException('Chỉ ứng viên mới được tạo CV bằng AI');
    }
    const policy = getActiveAiCvConsentPolicy(
      this.configService,
      AiCvConsentScope.CV_GENERATION,
    );
    if (manager) {
      await this.aiCvConsentsService.lockScope(manager, user._id, policy.scope);
    }
    const hasConsent = await this.aiCvConsentsService.hasValidConsent(
      user._id,
      AiCvConsentScope.CV_GENERATION,
      policy.consentVersion,
      policy.policyHash,
      manager,
    );
    if (!hasConsent) {
      throw new ForbiddenException(
        'Cần cấp quyền xử lý AI cho mục đích tạo CV trước khi sử dụng tính năng này',
      );
    }
    const userInDb = await (
      manager?.getRepository(User) || this.userRepo
    ).findOne({
      where: { _id: user._id, isDeleted: false },
      ...(manager ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!userInDb)
      throw new NotFoundException('Không tìm thấy tài khoản người dùng');
    if (userInDb.role !== Role.USER) {
      throw new ForbiddenException('Chỉ ứng viên mới được tạo CV bằng AI');
    }
    if (
      templateType !== 'template1' &&
      !this.usersService.isCandidatePremium(userInDb)
    ) {
      throw new ForbiddenException(
        'Mẫu CV Cao cấp chỉ dành cho tài khoản Candidate Premium',
      );
    }
    return { policy, userInDb };
  }

  private async assertTargetJobUnchanged(
    manager: EntityManager,
    job: Job | null,
  ) {
    if (!job) return;
    const current = await this.lockCanonicalActiveJob(manager, job._id);
    if (
      !current ||
      current.updatedAt?.toISOString() !== job.updatedAt?.toISOString() ||
      JSON.stringify(this.jobSnapshot(current, job._id)) !==
        JSON.stringify(this.jobSnapshot(job, job._id))
    ) {
      throw new ConflictException(
        'Tin tuyển dụng đã được thay đổi trong khi AI đang tạo CV',
      );
    }
  }

  private async lockCanonicalActiveJob(
    manager: EntityManager,
    id: string,
  ): Promise<Job | null> {
    const repository = manager.getRepository(Job);
    const observed = await repository.findOne({ where: { _id: id } });
    if (!observed?.company?._id) return null;
    // Lock the parent before the job. A changed company reference fails closed.
    const company = await manager.getRepository(Company).findOne({
      where: { _id: observed.company._id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!company) return null;
    const current = await repository.findOne({
      where: { _id: id },
      lock: { mode: 'pessimistic_write' },
    });
    return current && isCanonicalActiveJob(current, company, new Date())
      ? current
      : null;
  }

  private async enqueueOperation(
    metadata: CvGenerationMetadata,
    payload: CvGenerationJobData,
  ): Promise<void> {
    if (!isRedisEnabled()) {
      throw new ServiceUnavailableException('Hàng đợi tạo CV chưa được bật');
    }
    try {
      await this.generationQueue.add(ONLINE_CV_GENERATION_PROCESS, payload, {
        jobId: metadata.operationId,
        attempts: 1,
        removeOnComplete: false,
        removeOnFail: false,
      });
    } catch (error) {
      throw new BadGatewayException(
        'Không thể đưa yêu cầu tạo CV vào hàng đợi',
      );
    }
  }

  private jobSnapshot(job: any, fallbackId: string, fallbackTitle?: string) {
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

  async enqueueGeneration(
    id: string,
    dto: EnqueueOnlineCvGenerationDto,
    user: IUser,
    idempotencyKey: string,
  ) {
    const acceptedAt = new Date().toISOString();
    const idempotencyKeyHash = this.assertGenerationKey(idempotencyKey);
    const cv = await this.findOne(id, user);
    const existingOperation = this.generationTrace(cv);
    if (dto.regenerationTarget)
      return this.enqueueSelectedRegeneration(
        cv,
        dto,
        user,
        idempotencyKeyHash,
      );
    if (existingOperation) {
      if (
        existingOperation.idempotencyKeyHash === idempotencyKeyHash &&
        existingOperation.targetJobId === (dto.jobId || null)
      ) {
        return this.operationResponse(existingOperation, cv._id, cv);
      }
      throw new ConflictException('CV đang có một yêu cầu tạo CV khác');
    }
    if (dto.expectedContentVersion !== cv.contentVersion) {
      throw new ConflictException(
        'CV đã được thay đổi; vui lòng tải lại trước khi tạo',
      );
    }
    const templateType = cv.templateType as 'template1' | 'template2';
    const { policy } = await this.assertGenerationPrerequisites(
      user,
      templateType,
    );
    const job = dto.jobId ? await this.jobsService.findOne(dto.jobId) : null;
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
    if (dto.sourceVersion && dto.sourceVersion !== sourceVersion) {
      throw new ConflictException('Source version không còn hợp lệ');
    }
    const targetJobId = job?._id || null;
    const operationId = randomUUID();
    const locale = normalizeCvLocale(cv.revision?.locale);
    const metadata: CvGenerationMetadata = {
      operationId,
      idempotencyKeyHash,
      status: 'QUEUED',
      kind: 'EXISTING_CV',
      userId: user._id,
      cvId: cv._id,
      expectedContentVersion: cv.contentVersion,
      sourceVersion,
      consentVersion: policy.consentVersion,
      consentPolicyHash: policy.policyHash,
      templateType,
      locale,
      targetJobId,
      attempts: 1,
      createdAt: acceptedAt,
    };
    const revision = {
      ...(cv.revision || { contentVersion: cv.contentVersion }),
      sourceTrace: {
        ...(cv.revision?.sourceTrace || {}),
        generation: metadata,
      },
    };
    const reserved = await this.onlineCVRepo.update(
      this.generationWriteCriteria(cv),
      { revision },
    );
    if (!reserved.affected)
      throw new ConflictException('CV đã được thay đổi; vui lòng thử lại');
    const payload: CvGenerationJobData = {
      operationId,
      idempotencyKeyHash,
      userId: user._id,
      cvId: cv._id,
      kind: 'EXISTING_CV',
      expectedContentVersion: cv.contentVersion,
      sourceVersion,
      consentVersion: policy.consentVersion,
      consentPolicyHash: policy.policyHash,
      templateType,
      locale,
      targetJobId,
    };
    try {
      await this.enqueueOperation(metadata, payload);
    } catch (error) {
      const latest = await this.onlineCVRepo.findOne({
        where: { _id: cv._id, userId: user._id, isDeleted: false },
      });
      if (
        latest &&
        this.generationTrace(latest)?.operationId === operationId &&
        this.generationTrace(latest)?.status === 'QUEUED'
      ) {
        await this.onlineCVRepo.update(this.generationWriteCriteria(latest), {
          revision: {
            ...(latest.revision || {}),
            sourceTrace: {
              ...(latest.revision?.sourceTrace || {}),
              generation: undefined,
            },
          },
        });
      }
      throw error;
    }
    return this.operationResponse(metadata, cv._id);
  }

  private async enqueueSelectedRegeneration(
    cv: OnlineCV,
    dto: EnqueueOnlineCvGenerationDto,
    user: IUser,
    idempotencyKeyHash: string,
  ) {
    if (!isRedisEnabled())
      throw new ServiceUnavailableException('Hàng đợi tạo CV chưa được bật');
    const metadata = this.generationTrace(cv);
    const pending = cv.generationSnapshot?.pendingDraft;
    const target = dto.regenerationTarget as CvRegenerationTarget;
    if (!metadata || !pending || pending.reviewStatus !== 'PENDING')
      throw new ConflictException(
        'Bản nháp đã thay đổi; hãy tải lại trước khi tạo lại mục',
      );
    if (metadata.regeneration?.idempotencyKeyHash === idempotencyKeyHash) {
      if (
        metadata.regeneration.reviewOperationId !== target.reviewOperationId ||
        metadata.regeneration.expectedDraftHash !== target.expectedDraftHash ||
        metadata.regeneration.targetPath !== target.targetPath ||
        (dto.jobId !== undefined && dto.jobId !== metadata.targetJobId) ||
        dto.expectedContentVersion !== metadata.expectedContentVersion ||
        (dto.sourceVersion && dto.sourceVersion !== metadata.sourceVersion)
      )
        throw new ConflictException(
          'Idempotency-Key đã được dùng cho yêu cầu khác',
        );
      return this.operationResponse(
        { ...metadata, ...metadata.regeneration },
        cv._id,
        cv,
      );
    }
    if (Date.parse(pending.expiresAt) <= Date.now()) {
      await this.expirePendingDraft(cv);
      throw new ConflictException('Bản nháp đã hết hạn');
    }
    if (
      !metadata ||
      !pending ||
      pending.reviewStatus !== 'PENDING' ||
      target.reviewOperationId !== pending.operationId ||
      target.expectedDraftHash !== pending.draftHash ||
      metadata.operationId !== pending.operationId ||
      metadata.reviewStatus !== 'PENDING' ||
      cv.contentVersion !== pending.expectedContentVersion ||
      dto.expectedContentVersion !== cv.contentVersion
    ) {
      throw new ConflictException(
        'Bản nháp đã thay đổi; hãy tải lại trước khi tạo lại mục',
      );
    }
    if (
      metadata.regeneration &&
      ['QUEUED', 'RUNNING'].includes(metadata.regeneration.status)
    )
      throw new ConflictException('Đang tạo lại một mục khác trong bản nháp');

    const source = this.resolveRegenerationSource(cv, pending, target);
    if (!source)
      throw new BadRequestException('Mục này không có dữ liệu nguồn hợp lệ');
    const { policy } = await this.assertGenerationPrerequisites(
      user,
      metadata.templateType,
    );
    if (
      policy.consentVersion !== pending.consentVersion ||
      policy.policyHash !== pending.consentPolicyHash ||
      !(await this.aiCvConsentsService.hasValidConsent(
        user._id,
        AiCvConsentScope.CV_GENERATION,
        pending.consentVersion,
        pending.consentPolicyHash,
      ))
    )
      throw new ConflictException('Consent tạo CV không còn hợp lệ');

    const acceptedAt = new Date().toISOString();
    const operationId = randomUUID();
    const regeneration = {
      ...target,
      operationId,
      idempotencyKeyHash,
      status: 'QUEUED' as const,
      createdAt: acceptedAt,
    };
    const nextMetadata = { ...metadata, regeneration };
    const revision = {
      ...(cv.revision || {}),
      sourceTrace: {
        ...(cv.revision?.sourceTrace || {}),
        generation: nextMetadata,
      },
    };
    const reserved = await this.onlineCVRepo.update(
      this.generationWriteCriteria(cv, true),
      { revision },
    );
    if (!reserved.affected) {
      const latest = await this.onlineCVRepo.findOne({
        where: { _id: cv._id, userId: user._id, isDeleted: false },
      });
      const priorMetadata = latest && this.generationTrace(latest);
      const prior = priorMetadata?.regeneration;
      if (
        latest &&
        priorMetadata &&
        prior &&
        prior?.idempotencyKeyHash === idempotencyKeyHash &&
        prior.reviewOperationId === target.reviewOperationId &&
        prior.expectedDraftHash === target.expectedDraftHash &&
        prior.targetPath === target.targetPath
      )
        return this.operationResponse(
          { ...priorMetadata, ...prior },
          latest._id,
          latest,
        );
      throw new ConflictException('Bản nháp đã thay đổi; hãy thử lại');
    }

    const job = dto.jobId ? await this.jobsService.findOne(dto.jobId) : null;
    const targetJobId = job?._id || metadata.targetJobId || null;
    const payload: CvGenerationJobData = {
      operationId,
      idempotencyKeyHash,
      userId: user._id,
      cvId: cv._id,
      kind: 'EXISTING_CV',
      expectedContentVersion: cv.contentVersion,
      sourceVersion: pending.sourceVersion,
      consentVersion: pending.consentVersion,
      consentPolicyHash: pending.consentPolicyHash,
      templateType: metadata.templateType,
      locale: metadata.locale,
      targetJobId,
      regenerationTarget: target,
    };
    try {
      await this.enqueueOperation(nextMetadata, payload);
    } catch (error) {
      const latest = await this.onlineCVRepo.findOne({
        where: { _id: cv._id, userId: user._id, isDeleted: false },
      });
      if (
        latest &&
        this.generationTrace(latest)?.regeneration?.operationId === operationId
      ) {
        const latestMetadata = this.generationTrace(latest)!;
        const { regeneration: _regeneration, ...rest } = latestMetadata;
        await this.onlineCVRepo.update(this.generationWriteCriteria(latest), {
          revision: {
            ...(latest.revision || {}),
            sourceTrace: {
              ...(latest.revision?.sourceTrace || {}),
              generation: rest,
            },
          },
        });
      }
      throw error;
    }
    return this.operationResponse(
      { ...nextMetadata, ...regeneration },
      cv._id,
      cv,
    );
  }

  private resolveRegenerationSource(
    cv: OnlineCV,
    pending: CvGenerationPendingDraft,
    target: CvRegenerationTarget,
  ): { field: string; index?: number } | null {
    const targetMatch = target.targetPath.match(
      /^\/(position|career_objective|education|work_experience|projects|skills|activities|certificates|awards)(?:\/(0|[1-9]\d*))?$/,
    );
    const sourceRefs = pending.sourceRefsByPath[target.targetPath];
    if (!targetMatch || !Array.isArray(sourceRefs) || sourceRefs.length !== 1)
      return null;
    const [, targetField, targetIndex] = targetMatch;
    const expectedCollection: Record<string, string> = {
      education: 'education',
      work_experience: 'experience',
      projects: 'projects',
      skills: 'skills',
      activities: 'activities',
      certificates: 'certificates',
      awards: 'awards',
    };
    const pendingDraft = pending.draft as unknown as Record<string, unknown>;
    if (targetField === 'position' || targetField === 'career_objective') {
      if (targetIndex !== undefined) return null;
      if (typeof pendingDraft[targetField] !== 'string') return null;
    } else {
      const values = pendingDraft[targetField];
      if (
        targetIndex === undefined ||
        !Array.isArray(values) ||
        Number(targetIndex) >= values.length
      )
        return null;
    }

    const sourceMatch = sourceRefs[0].match(
      /^\/candidate\/(headline|career_objective|education|experience|projects|skills|activities|certificates|awards)(?:\/(0|[1-9]\d*))?$/,
    );
    if (!sourceMatch) return null;
    const [, sourceField, sourceIndex] = sourceMatch;
    if (targetField === 'position' && sourceField !== 'headline') return null;
    if (
      targetField === 'career_objective' &&
      sourceField !== 'career_objective'
    )
      return null;
    if (
      expectedCollection[targetField] &&
      expectedCollection[targetField] !== sourceField
    )
      return null;
    if (expectedCollection[targetField]) {
      const values = this.regenerationCandidate(cv)[sourceField];
      if (
        sourceIndex === undefined ||
        !Array.isArray(values) ||
        Number(sourceIndex) >= values.length
      )
        return null;
      return { field: sourceField, index: Number(sourceIndex) };
    }
    const candidate = this.regenerationCandidate(cv);
    if (target.targetPath !== '/position') candidate.headline = null;
    if (target.targetPath !== '/career_objective')
      candidate.career_objective = null;
    return typeof candidate[sourceField] === 'string' && candidate[sourceField]
      ? { field: sourceField }
      : null;
  }

  private regenerationCandidate(cv: OnlineCV): Record<string, unknown> {
    return {
      candidate_id: cv.userId,
      full_name: 'Candidate',
      email: null,
      phone: null,
      link: null,
      address: null,
      headline: cv.position || null,
      career_objective: cv.careerObjective || null,
      skills: currentCvSkillLiterals(cv),
      experience: (cv.workExperience || []).map((entry) => ({
        company_name: entry.companyName || null,
        position: entry.position || null,
        start_date: entry.startDate || null,
        end_date: entry.endDate || null,
        description: entry.description || null,
      })),
      education: (cv.education || []).map((entry) => ({
        school_name: entry.schoolName || null,
        degree: entry.degree || null,
        major: entry.major || null,
        start_date: entry.startDate || null,
        end_date: entry.endDate || null,
        description: entry.description || null,
      })),
      projects: (cv.projects || [])
        .filter((entry) => Boolean(entry.projectName))
        .map((entry) => ({
          project_name: entry.projectName,
          role: entry.role || null,
          start_date: entry.startDate || null,
          end_date: entry.endDate || null,
          description: entry.description || null,
          technologies: entry.technologies || [],
        })),
      certificates: (cv.certificates || [])
        .map((entry) => (typeof entry === 'string' ? entry : entry?.name || ''))
        .filter(Boolean),
      activities: (cv.activities || [])
        .map((entry) =>
          typeof entry === 'string'
            ? entry
            : [entry?.organizationName, entry?.position, entry?.description]
                .filter(Boolean)
                .join(' - '),
        )
        .filter(Boolean),
      awards: (cv.awards || [])
        .map((entry) =>
          typeof entry === 'string'
            ? entry
            : [entry?.name, entry?.description].filter(Boolean).join(' - '),
        )
        .filter(Boolean),
    };
  }

  async enqueueGenerationFromCareerProfile(
    dto: GenerateFromCareerProfileDto,
    user: IUser,
    idempotencyKey: string,
  ) {
    const acceptedAt = new Date().toISOString();
    if (!isRedisEnabled()) {
      throw new ServiceUnavailableException('Hàng đợi tạo CV chưa được bật');
    }
    const reserved = await this.onlineCVRepo.manager.transaction((manager) =>
      this.reserveGenerationFromCareerProfile(
        dto,
        user,
        idempotencyKey,
        manager,
        acceptedAt,
      ),
    );
    if (!reserved.payload) return reserved.response;
    const { metadata, payload } = reserved;
    try {
      await this.enqueueOperation(metadata, payload);
    } catch (error) {
      const latest = await this.onlineCVRepo.findOne({
        where: { _id: payload.cvId, userId: user._id, isDeleted: false },
      });
      if (
        latest &&
        this.generationTrace(latest)?.operationId === payload.operationId &&
        this.generationTrace(latest)?.status === 'QUEUED'
      ) {
        await this.onlineCVRepo.update(this.generationWriteCriteria(latest), {
          isDeleted: true,
          deletedAt: new Date(),
        });
      }
      throw error;
    }
    return reserved.response;
  }

  private async reserveGenerationFromCareerProfile(
    dto: GenerateFromCareerProfileDto,
    user: IUser,
    idempotencyKey: string,
    manager: EntityManager,
    acceptedAt: string,
  ) {
    const idempotencyKeyHash = this.assertGenerationKey(idempotencyKey);
    const templateType = dto.templateType || 'template1';
    const locale = normalizeCvLocale(dto.locale);
    const { policy, userInDb } = await this.assertGenerationPrerequisites(
      user,
      templateType,
      manager,
    );
    const profile = await manager
      .getRepository(CandidateCareerProfile)
      .findOne({
        where: { userId: user._id },
        lock: { mode: 'pessimistic_write' },
      });
    if (!profile)
      throw new NotFoundException('Không tìm thấy hồ sơ nghề nghiệp');
    if (
      dto.expectedProfileVersion !== undefined &&
      dto.expectedProfileVersion !== profile.contentVersion
    ) {
      throw new ConflictException(
        'Hồ sơ nghề nghiệp đã được thay đổi; vui lòng tải lại trước khi tạo CV',
      );
    }
    const job = dto.jobId
      ? await this.lockCanonicalActiveJob(manager, dto.jobId)
      : null;
    if (dto.jobId && !job)
      throw new NotFoundException('Không tìm thấy tin tuyển dụng');
    const targetJobId = job?._id || null;
    const jobSnapshot = this.jobSnapshot(job, targetJobId || profile._id);
    const normalizedProfile = {
      contact: {
        fullName: profile.contact?.fullName || userInDb.name || userInDb.email,
        email: profile.contact?.email || userInDb.email,
        phone: profile.contact?.phone || null,
        link: profile.contact?.link || null,
        address: profile.contact?.address || userInDb.address || null,
        avatar: profile.contact?.avatar || userInDb.avatar || null,
      },
      headline: profile.headline || null,
      objective: profile.objective || null,
      experience: filterMeaningfulCvEntries(profile.experience || []),
      education: filterMeaningfulCvEntries(profile.education || []),
      projects: filterMeaningfulCvEntries(profile.projects || []),
      certificates: filterMeaningfulCvEntries(profile.certificates || []),
      skills: filterMeaningfulCvEntries(profile.skills || []),
      activities: filterMeaningfulCvEntries(profile.activities || []),
      awards: filterMeaningfulCvEntries(profile.awards || []),
      contentVersion: profile.contentVersion,
    };
    const sourceVersion = createHash('sha256')
      .update(JSON.stringify({ profile: normalizedProfile, job: jobSnapshot }))
      .digest('hex');
    const cvRepository = manager.getRepository(OnlineCV);
    const existing = (
      await cvRepository.find({
        where: { userId: user._id, isDeleted: false },
      })
    ).find(
      (item) =>
        this.generationTrace(item)?.idempotencyKeyHash === idempotencyKeyHash,
    );
    if (existing) {
      const prior = this.generationTrace(existing);
      if (
        !prior ||
        prior.kind !== 'CAREER_PROFILE' ||
        prior.sourceVersion !== sourceVersion ||
        prior.sourceProfileId !== profile._id ||
        prior.sourceProfileVersion !== profile.contentVersion ||
        prior.locale !== locale ||
        prior.templateType !== templateType ||
        prior.targetJobId !== targetJobId
      )
        throw new ConflictException(
          'Idempotency-Key đã được dùng cho yêu cầu khác',
        );
      return {
        response: this.operationResponse(prior, existing._id, existing),
        payload: null,
        metadata: prior,
      };
    }
    const count = await cvRepository.count({
      where: { userId: user._id, isDeleted: false },
    });
    if (count >= this.usersService.getUserMaxCvLimit(userInDb)) {
      throw new ForbiddenException(
        'Bạn đã đạt giới hạn tối đa CV cho cấp tài khoản hiện tại',
      );
    }
    const operationId = randomUUID();
    const metadata: CvGenerationMetadata = {
      operationId,
      idempotencyKeyHash,
      status: 'QUEUED',
      kind: 'CAREER_PROFILE',
      userId: user._id,
      cvId: '',
      sourceProfileId: profile._id,
      sourceProfileVersion: profile.contentVersion,
      expectedContentVersion: 1,
      sourceVersion,
      consentVersion: policy.consentVersion,
      consentPolicyHash: policy.policyHash,
      templateType,
      locale,
      targetJobId,
      attempts: 1,
      createdAt: acceptedAt,
    };
    metadata.cvId = randomUUID();
    const placeholder = cvRepository.create({
      _id: metadata.cvId,
      templateType,
      generationMode: OnlineCvGenerationMode.EDITOR_ONLY,
      contentVersion: 1,
      sourceVersion,
      targetJobId,
      sourceProfileId: profile._id,
      sourceProfileVersion: profile.contentVersion,
      generationSnapshot: normalizedProfile,
      revision: {
        contentVersion: 1,
        locale,
        sourceTrace: { locale, generation: metadata },
      },
      title: 'Candidate CV',
      fullName: normalizedProfile.contact.fullName,
      position: normalizedProfile.headline,
      phone: normalizedProfile.contact.phone,
      email: normalizedProfile.contact.email,
      link: normalizedProfile.contact.link,
      address: normalizedProfile.contact.address,
      avatar: normalizedProfile.contact.avatar,
      careerObjective: normalizedProfile.objective,
      education: normalizedProfile.education,
      workExperience: normalizedProfile.experience,
      skills: normalizedProfile.skills,
      projects: normalizedProfile.projects,
      activities: normalizedProfile.activities,
      certificates: normalizedProfile.certificates,
      awards: normalizedProfile.awards,
      userId: user._id,
      isPrimary: count === 0,
      isSearchable: false,
      isDeleted: false,
      createdBy: { _id: user._id, email: user.email },
      htmlContent: null,
      pdfUrl: null,
    });
    const saved = await cvRepository.save(placeholder);
    const payload: CvGenerationJobData = {
      operationId,
      idempotencyKeyHash,
      userId: user._id,
      cvId: saved._id,
      kind: 'CAREER_PROFILE',
      sourceProfileId: profile._id,
      sourceProfileVersion: profile.contentVersion,
      expectedContentVersion: 1,
      sourceVersion,
      consentVersion: policy.consentVersion,
      consentPolicyHash: policy.policyHash,
      templateType,
      locale,
      targetJobId,
    };
    return {
      response: this.operationResponse(metadata, saved._id),
      metadata,
      payload,
    };
  }

  async getGenerationJob(id: string, operationId: string, user: IUser) {
    const state = await this.generationState.getGenerationState(
      id,
      operationId,
      user,
    );
    return this.operationResponse(state.metadata, state.cv._id, state.cv);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async expirePendingGenerationDrafts(): Promise<number> {
    return this.draftLifecycle.expirePendingGenerationDrafts();
  }

  async cancelGeneration(id: string, operationId: string, user: IUser) {
    const state = await this.generationState.cancelGeneration(
      id,
      operationId,
      user,
    );
    return this.operationResponse(state.metadata, state.cv._id, state.cv);
  }

  async discardGenerationDraft(
    id: string,
    operationId: string,
    user: IUser,
  ): Promise<void> {
    return this.draftLifecycle.discardGenerationDraft(id, operationId, user);
  }

  async processGenerationJob(data: CvGenerationJobData): Promise<void> {
    return this.generationWorker.processGenerationJob(data, {
      regenerateSelectedItem: (cv, user, jobData, deadline) =>
        this.generateSelectedCvItem(cv, user, jobData, deadline),
      generateExistingCv: (id, dto, user, operationId, timeoutMs) =>
        this.generate(id, dto, user, operationId, timeoutMs),
      generateFromCareerProfile: (
        dto,
        user,
        targetCvId,
        operationId,
        sourceVersion,
        timeoutMs,
      ) =>
        this.generateFromCareerProfile(
          dto,
          user,
          targetCvId,
          operationId,
          sourceVersion,
          timeoutMs,
        ),
    });
  }

  private async generateSelectedCvItem(
    cv: OnlineCV,
    user: IUser,
    data: CvGenerationJobData,
    deadline: number,
  ): Promise<string[]> {
    const target = data.regenerationTarget;
    const metadata = this.generationTrace(cv);
    const pending = cv.generationSnapshot?.pendingDraft;
    if (
      !target ||
      !metadata ||
      !pending ||
      pending.operationId !== target.reviewOperationId ||
      pending.draftHash !== target.expectedDraftHash ||
      pending.reviewStatus !== 'PENDING'
    )
      throw new ConflictException('Bản nháp đã thay đổi');

    const source = this.resolveRegenerationSource(cv, pending, target);
    if (!source) throw new ConflictException('Dữ liệu nguồn không còn hợp lệ');
    const candidate = this.regenerationCandidate(cv);
    for (const field of [
      'skills',
      'experience',
      'education',
      'projects',
      'certificates',
      'activities',
      'awards',
    ]) {
      if (field === source.field) continue;
      candidate[field] = [];
    }
    if (source.index !== undefined) {
      const values = candidate[source.field];
      if (!Array.isArray(values) || !values[source.index])
        throw new ConflictException('Dữ liệu nguồn không còn hợp lệ');
      candidate[source.field] = [values[source.index]];
    }

    const job = data.targetJobId
      ? await this.jobsService.findOne(data.targetJobId)
      : null;
    const jobSnapshot = this.jobSnapshot(
      job,
      job?._id || cv._id,
      cv.position || cv.title || undefined,
    );
    const request: CvDraftRequest = {
      identity: {
        request_id: randomUUID(),
        trace_id: randomUUID(),
        operation_attempt_id: randomUUID(),
      },
      candidate: candidate as unknown as CvDraftRequest['candidate'],
      job: jobSnapshot,
      template_type: data.templateType,
      locale: data.locale,
      source_version: data.sourceVersion,
      content_version: (cv.contentVersion || 1) + 1,
      consent_version: data.consentVersion,
    };
    const result = await this.aiServiceClient.generateCvDraftReview(request, {
      timeoutMs: this.generationRemaining(deadline),
    });
    this.generationRemaining(deadline);
    if (
      result.draft.candidate_id !== user._id ||
      result.draft.target_job_id !== jobSnapshot.job_id
    )
      throw new BadGatewayException(
        'Dữ liệu trả về từ dịch vụ AI không hợp lệ',
      );

    const match = target.targetPath.match(
      /^\/(position|career_objective|education|work_experience|projects|skills|activities|certificates|awards)(?:\/(\d+))?$/,
    );
    if (!match) throw new BadRequestException('Mục cần tạo lại không hợp lệ');
    const [, field, rawIndex] = match;
    const index = rawIndex === undefined ? undefined : Number(rawIndex);
    const outputKey: Record<string, keyof CvDraftResponse> = {
      position: 'position',
      career_objective: 'career_objective',
      education: 'education',
      work_experience: 'work_experience',
      projects: 'projects',
      skills: 'skills',
      activities: 'activities',
      certificates: 'certificates',
      awards: 'awards',
    };
    const key = outputKey[field];
    const output = result.draft[key];
    const value = Array.isArray(output) ? output[0] : output;
    if (
      value === undefined ||
      value === null ||
      (typeof value === 'string' && !value.trim())
    )
      throw new BadGatewayException(
        'Dịch vụ AI không tạo được nội dung cho mục đã chọn',
      );

    const nextDraft = JSON.parse(
      JSON.stringify(pending.draft),
    ) as CvDraftResponse;
    if (index === undefined) {
      if (field === 'position') nextDraft.position = value as string;
      else if (field === 'career_objective')
        nextDraft.career_objective = value as string;
      else
        throw new BadRequestException('Đường dẫn mục cần tạo lại không hợp lệ');
    } else {
      const collection = nextDraft[key] as unknown[];
      if (!Array.isArray(collection) || index >= collection.length)
        throw new ConflictException('Mục cần tạo lại không còn tồn tại');
      const previous = collection[index];
      collection[index] =
        previous &&
        value &&
        typeof previous === 'object' &&
        typeof value === 'object' &&
        'source_index' in previous
          ? { ...value, source_index: previous.source_index }
          : value;
    }

    const targetPrefix = target.targetPath;
    const metadataPath = (path: string) => {
      const generatedPrefix = targetPrefix.replace(/\/(\d+)$/, '/0');
      return path === generatedPrefix || path.startsWith(`${generatedPrefix}/`)
        ? `${targetPrefix}${path.slice(generatedPrefix.length)}`
        : path;
    };
    const fieldOrigins = { ...pending.fieldOriginsByPath };
    const generatedPrefix = targetPrefix.replace(/\/(\d+)$/, '/0');
    for (const path of Object.keys(fieldOrigins))
      if (path === targetPrefix || path.startsWith(`${targetPrefix}/`))
        delete fieldOrigins[path];
    for (const [path, origin] of Object.entries(
      result.review_metadata.field_origins_by_path,
    )) {
      if (path !== generatedPrefix && !path.startsWith(`${generatedPrefix}/`))
        continue;
      fieldOrigins[metadataPath(path)] = origin;
    }
    const omissions = pending.omissionsByPath.filter(
      (omission) =>
        omission.path !== targetPrefix &&
        !omission.path.startsWith(`${targetPrefix}/`),
    );
    omissions.push(
      ...result.review_metadata.omissions_by_path
        .filter(
          (omission) =>
            omission.path === generatedPrefix ||
            omission.path.startsWith(`${generatedPrefix}/`),
        )
        .map((omission) => ({
          path: metadataPath(omission.path),
          reasonCode: omission.reason_code,
        })),
    );
    const nextPending = {
      ...pending,
      draft: nextDraft,
      draftHash: cvDraftHash(nextDraft),
      fieldOriginsByPath: fieldOrigins,
      omissionsByPath: omissions,
    };
    const latest = await this.onlineCVRepo.findOne({
      where: { _id: cv._id, userId: user._id, isDeleted: false },
    });
    const latestMetadata = latest && this.generationTrace(latest);
    const latestPending = latest?.generationSnapshot?.pendingDraft;
    if (
      !latest ||
      !latestMetadata ||
      latestMetadata.operationId !== target.reviewOperationId ||
      latestMetadata.regeneration?.operationId !== data.operationId ||
      latestMetadata.regeneration.status !== 'RUNNING' ||
      !latestPending ||
      latestPending.operationId !== target.reviewOperationId ||
      latestPending.draftHash !== target.expectedDraftHash ||
      latestPending.reviewStatus !== 'PENDING' ||
      latest.contentVersion !== data.expectedContentVersion
    )
      throw new ConflictException('Bản nháp đã thay đổi trong lúc tạo lại');

    const generationSnapshot = {
      ...(latest.generationSnapshot || {}),
      pendingDraft: nextPending,
    };
    const revision = {
      ...(latest.revision || {}),
      sourceTrace: {
        ...(latest.revision?.sourceTrace || {}),
        generation: {
          ...latestMetadata,
          regeneration: {
            ...latestMetadata.regeneration,
            implementation: result.implementation,
            requestId: result.draft.request_id,
            correlationId: result.draft.trace_id,
          },
        },
      },
    };
    const saved = await this.onlineCVRepo.update(
      this.generationWriteCriteria(latest, true),
      { generationSnapshot, revision },
    );
    if (!saved.affected)
      throw new ConflictException('Bản nháp đã thay đổi trong lúc tạo lại');
    latest.generationSnapshot = generationSnapshot;
    latest.revision = revision as OnlineCV['revision'];
    cv.revision = revision as OnlineCV['revision'];
    cv.generationSnapshot = generationSnapshot;
    return safeReviewWarnings(result);
  }

  async markGenerationFailure(
    data: CvGenerationJobData,
    errorCode = 'WORKER_FAILURE',
  ): Promise<void> {
    return this.generationState.markGenerationFailure(data, errorCode);
  }

  private async setGenerationStatus(
    data: CvGenerationJobData,
    status: CvGenerationOperationStatus,
  ): Promise<boolean> {
    return this.generationState.setGenerationStatus(data, status);
  }

  private async finishGeneration(
    data: CvGenerationJobData,
    status: CvGenerationOperationStatus,
    errorCode?: string,
    warnings?: string[],
  ) {
    return this.generationState.finishGeneration(
      data,
      status,
      errorCode,
      warnings,
    );
  }

  // Get all online CVs of current user
  async findByUser(user: IUser) {
    const cvs = await this.onlineCVRepo.find({
      where: { userId: user._id, isDeleted: false },
      order: { isPrimary: 'DESC', createdAt: 'DESC' },
    });
    Logger.log(`Found ${cvs.length} online CV(s)`);
    return cvs;
  }

  // Get one online CV by ID
  async findOne(id: string, user: IUser) {
    const cv = await this.onlineCVRepo.findOne({
      where: {
        _id: id,
        userId: user._id,
        isDeleted: false,
      },
    });

    if (!cv) {
      throw new NotFoundException('CV không tồn tại hoặc không thuộc về bạn');
    }

    return cv;
  }

  private async approvePendingDraft(
    id: string,
    observedCv: OnlineCV,
    dto: UpdateOnlineCVDto,
    user: IUser,
  ): Promise<OnlineCV> {
    if (!dto.generationApproval) {
      throw new ConflictException(
        'Cần xác nhận bản nháp đang chờ trước khi lưu',
      );
    }
    if (dto.expectedContentVersion !== observedCv.contentVersion) {
      throw new ConflictException(
        'CV đã được thay đổi; vui lòng tải lại trước khi lưu',
      );
    }
    if (dto.generationMode === OnlineCvGenerationMode.EDITOR_ONLY) {
      throw new BadRequestException(
        'Chỉ endpoint tạo CV bằng AI mới được chuyển CV sang chế độ EDITOR_ONLY',
      );
    }

    const {
      generationApproval: _generationApproval,
      expectedContentVersion: _expectedContentVersion,
      generationMode: _generationMode,
      htmlContent,
      locale,
      ...dataToSave
    } = normalizeCvEntryCollections(dto);
    const saved = await this.onlineCVRepo.manager.transaction(
      async (manager) => {
        const { policy, userInDb } = await this.assertGenerationPrerequisites(
          user,
          observedCv.templateType as 'template1' | 'template2',
          manager,
        );
        if (
          dto.templateType &&
          dto.templateType !== 'template1' &&
          !this.usersService.isCandidatePremium(userInDb)
        ) {
          throw new ForbiddenException(
            'Mẫu CV Cao Cấp này chỉ dành riêng cho tài khoản Candidate Premium',
          );
        }
        const repository = manager.getRepository(OnlineCV);
        const current = await repository.findOne({
          where: { _id: id, userId: user._id, isDeleted: false },
          lock: { mode: 'pessimistic_write' },
        });
        if (!current) throw new NotFoundException('Không tìm thấy CV');
        if (
          current.contentVersion !== dto.expectedContentVersion ||
          current.contentVersion !== observedCv.contentVersion
        ) {
          throw new ConflictException(
            'CV đã được thay đổi; vui lòng tải lại trước khi lưu',
          );
        }

        const pending = current.generationSnapshot?.pendingDraft;
        const generation = this.generationTrace(current);
        if (
          !pending ||
          pending.reviewStatus !== 'PENDING' ||
          !generation ||
          generation.reviewStatus !== 'PENDING' ||
          pending.operationId !== dto.generationApproval.operationId ||
          generation.operationId !== pending.operationId ||
          pending.draftHash !== dto.generationApproval.draftHash ||
          generation.draftHash !== pending.draftHash ||
          pending.expectedContentVersion !== current.contentVersion ||
          generation.expectedContentVersion !== current.contentVersion ||
          pending.sourceVersion !== generation.sourceVersion ||
          pending.consentVersion !== policy.consentVersion ||
          pending.consentPolicyHash !== policy.policyHash ||
          generation.consentVersion !== policy.consentVersion ||
          generation.consentPolicyHash !== policy.policyHash ||
          new Date(pending.expiresAt).getTime() <= Date.now() ||
          cvDraftHash(pending.draft) !== pending.draftHash
        ) {
          throw new ConflictException(
            'Bản nháp đang chờ duyệt không còn hợp lệ',
          );
        }
        const hasConsent = await this.aiCvConsentsService.hasValidConsent(
          user._id,
          AiCvConsentScope.CV_GENERATION,
          policy.consentVersion,
          policy.policyHash,
          manager,
        );
        if (!hasConsent) {
          throw new ForbiddenException('Quyền xử lý AI đã bị thu hồi');
        }

        await this.assertPendingDraftSourceCurrent(
          current,
          generation,
          user,
          manager,
        );
        const nextContentVersion = Math.max(
          1,
          Number(current.contentVersion || 1) + 1,
        );
        const generationSnapshot = { ...(current.generationSnapshot || {}) };
        delete generationSnapshot.pendingDraft;
        const approvedGeneration: CvGenerationMetadata = {
          ...generation,
          reviewStatus: 'APPROVED',
          draftHash: pending.draftHash,
          finishedAt: new Date().toISOString(),
        };
        const revision = {
          ...(current.revision || {}),
          ...(locale
            ? {
                locale: normalizeCvLocale(locale),
                sourceTrace: {
                  ...(current.revision?.sourceTrace || {}),
                  locale: normalizeCvLocale(locale),
                  generation: approvedGeneration,
                },
              }
            : {
                sourceTrace: {
                  ...(current.revision?.sourceTrace || {}),
                  generation: approvedGeneration,
                },
              }),
          contentVersion: nextContentVersion,
        };
        const updateResult = await repository.update(
          this.generationWriteCriteria(current, true),
          {
            ...dataToSave,
            htmlContent,
            generationSnapshot,
            contentVersion: nextContentVersion,
            revision,
            updatedBy: { _id: user._id, email: user.email },
          },
        );
        if (!updateResult.affected) {
          throw new ConflictException(
            'Bản nháp hoặc CV đã được thay đổi; vui lòng tải lại trước khi lưu',
          );
        }
        return repository.findOneOrFail({
          where: { _id: id, userId: user._id, isDeleted: false },
        });
      },
    );
    await this.invalidateUserCvSkillsCache(user._id);
    if (saved.generationMode !== OnlineCvGenerationMode.EDITOR_ONLY) {
      try {
        await this.exportToPdf(id, user, htmlContent);
      } catch (err) {
        Logger.error('Auto PDF generation on approval save failed:', err);
      }
    }
    return saved;
  }

  private async assertPendingDraftSourceCurrent(
    cv: OnlineCV,
    generation: CvGenerationMetadata,
    user: IUser,
    manager: EntityManager,
  ): Promise<void> {
    if (generation.kind === 'CAREER_PROFILE') {
      if (
        !generation.sourceProfileId ||
        generation.sourceProfileVersion == null
      ) {
        throw new ConflictException(
          'Nguồn hồ sơ của bản nháp không còn hợp lệ',
        );
      }
      const profile = await manager
        .getRepository(CandidateCareerProfile)
        .findOne({
          where: { _id: generation.sourceProfileId, userId: user._id },
          lock: { mode: 'pessimistic_write' },
        });
      if (
        !profile ||
        profile.contentVersion !== generation.sourceProfileVersion
      ) {
        throw new ConflictException(
          'Hồ sơ nghề nghiệp đã thay đổi sau khi tạo bản nháp',
        );
      }
      const userRecord = await manager.getRepository(User).findOne({
        where: { _id: user._id, isDeleted: false },
        lock: { mode: 'pessimistic_write' },
      });
      if (!userRecord)
        throw new NotFoundException('Không tìm thấy tài khoản người dùng');
      const job = generation.targetJobId
        ? await this.lockCanonicalActiveJob(manager, generation.targetJobId)
        : null;
      if (generation.targetJobId && !job) {
        throw new ConflictException(
          'Tin tuyển dụng đã thay đổi sau khi tạo bản nháp',
        );
      }
      const currentSourceVersion = createHash('sha256')
        .update(
          JSON.stringify({
            profile: this.normalizedCareerProfileSnapshot(profile, userRecord),
            job: this.jobSnapshot(job, generation.targetJobId || profile._id),
          }),
        )
        .digest('hex');
      if (currentSourceVersion !== generation.sourceVersion) {
        throw new ConflictException(
          'Nguồn hồ sơ đã thay đổi sau khi tạo bản nháp',
        );
      }
      return;
    }

    const job = generation.targetJobId
      ? await this.lockCanonicalActiveJob(manager, generation.targetJobId)
      : null;
    if (generation.targetJobId && !job) {
      throw new ConflictException(
        'Tin tuyển dụng đã thay đổi sau khi tạo bản nháp',
      );
    }
    const jobSnapshot = this.jobSnapshot(
      job,
      generation.targetJobId || cv._id,
      cv.position || cv.title || 'Candidate CV',
    );
    const sourceVersion = createHash('sha256')
      .update(
        JSON.stringify({
          job: jobSnapshot,
          updatedAt: job?.updatedAt?.toISOString() || null,
          profileVersion: cv.contentVersion || 1,
        }),
      )
      .digest('hex');
    if (sourceVersion !== generation.sourceVersion) {
      throw new ConflictException(
        'Dữ liệu nguồn đã thay đổi sau khi tạo bản nháp',
      );
    }
  }

  // Update online CV
  async update(id: string, updateOnlineCVDto: UpdateOnlineCVDto, user: IUser) {
    const cv = await this.findOne(id, user);
    if (
      ['QUEUED', 'RUNNING'].includes(this.generationTrace(cv)?.status || '')
    ) {
      throw new ConflictException(
        'CV đang được tạo; vui lòng chờ hoặc hủy yêu cầu',
      );
    }
    const pendingDraft = cv.generationSnapshot?.pendingDraft;
    if (pendingDraft?.reviewStatus === 'PENDING') {
      return this.approvePendingDraft(id, cv, updateOnlineCVDto, user);
    }
    if (updateOnlineCVDto.generationApproval) {
      throw new ConflictException('Bản nháp đang chờ duyệt không còn hợp lệ');
    }
    if (updateOnlineCVDto.expectedContentVersion !== cv.contentVersion) {
      throw new ConflictException(
        'CV đã được thay đổi; vui lòng tải lại trước khi lưu',
      );
    }

    if (
      updateOnlineCVDto.generationMode === OnlineCvGenerationMode.EDITOR_ONLY
    ) {
      throw new BadRequestException(
        'Chỉ endpoint tạo CV bằng AI mới được chuyển CV sang chế độ EDITOR_ONLY',
      );
    }

    // Enforce Premium Template Lock on update
    if (
      updateOnlineCVDto.templateType &&
      updateOnlineCVDto.templateType !== 'template1'
    ) {
      const userInDb = await this.userRepo.findOne({
        where: { _id: user._id },
      });
      const isPremium = this.usersService.isCandidatePremium(userInDb);
      if (!isPremium) {
        throw new ForbiddenException(
          'Mẫu CV Cao Cấp này chỉ dành riêng cho tài khoản Candidate Premium. Vui lòng nâng cấp gói Premium để sử dụng mẫu này.',
        );
      }
    }

    const normalizedDto = normalizeCvEntryCollections(updateOnlineCVDto);
    const {
      htmlContent,
      generationMode: _generationMode,
      locale,
      expectedContentVersion: _expectedContentVersion,
      ...dataToSave
    } = normalizedDto;
    const nextContentVersion = Math.max(1, Number(cv.contentVersion || 1) + 1);
    const revision = {
      ...(cv.revision || {}),
      ...(locale
        ? {
            locale: normalizeCvLocale(locale),
            sourceTrace: {
              ...(cv.revision?.sourceTrace || {}),
              locale: normalizeCvLocale(locale),
            },
          }
        : {}),
      contentVersion: nextContentVersion,
    };

    const updateResult = await this.onlineCVRepo.update(
      this.generationWriteCriteria(cv, Boolean(pendingDraft)),
      {
        ...dataToSave,
        htmlContent,
        contentVersion: nextContentVersion,
        revision,
        updatedBy: {
          _id: user._id,
          email: user.email,
        },
      },
    );
    if (updateResult.affected === 0) {
      throw new ConflictException(
        'CV đã được thay đổi; vui lòng tải lại trước khi lưu',
      );
    }

    await this.invalidateUserCvSkillsCache(user._id);

    // Auto update PDF & upload to Cloudinary
    if (cv.generationMode !== OnlineCvGenerationMode.EDITOR_ONLY) {
      try {
        await this.exportToPdf(id, user, htmlContent);
      } catch (err) {
        Logger.error('Auto PDF generation on update failed:', err);
      }
    }

    return await this.findOne(id, user);
  }

  // Delete online CV
  async remove(id: string, user: IUser) {
    const cv = await this.findOne(id, user);

    await this.onlineCVRepo.update(id, {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: {
        _id: user._id,
        email: user.email,
      },
    });

    await this.invalidateUserCvSkillsCache(user._id);

    return await this.onlineCVRepo.softDelete(id);
  }

  // Toggle allow recruiter to search this online CV
  async toggleSearchable(id: string, user: IUser, isSearchable?: boolean) {
    const cv = await this.findOne(id, user);
    const newSearchable =
      isSearchable !== undefined ? Boolean(isSearchable) : !cv.isSearchable;

    await this.onlineCVRepo.update(id, {
      isSearchable: newSearchable,
      updatedBy: {
        _id: user._id,
        email: user.email,
      },
    });

    return {
      _id: cv._id,
      isSearchable: newSearchable,
      message: newSearchable
        ? 'Đã bật cho phép Nhà Tuyển Dụng tìm kiếm CV này'
        : 'Đã tắt cho phép Nhà Tuyển Dụng tìm kiếm CV này',
    };
  }

  // Set an online CV as primary
  async setPrimary(id: string, user: IUser) {
    const cv = await this.findOne(id, user);

    await this.onlineCVRepo.update(
      { userId: user._id, isPrimary: true },
      { isPrimary: false },
    );

    await this.onlineCVRepo.update(id, {
      isPrimary: true,
      updatedBy: {
        _id: user._id,
        email: user.email,
      },
    });

    await this.invalidateUserCvSkillsCache(user._id);

    return {
      _id: cv._id,
      isPrimary: true,
      message: 'Đã đặt làm CV chính thành công',
    };
  }

  // Generate HTML from Handlebars template based on templateType
  private generateHTML(cv: OnlineCV): string {
    return this.pdfService.generateHTML(cv);
  }

  // Export CV to PDF and save to Cloudinary
  async exportToPdf(
    id: string,
    user: IUser,
    htmlContent?: string,
    isPremium?: boolean,
  ) {
    const cv = await this.findOne(id, user);

    if (
      ['QUEUED', 'RUNNING'].includes(this.generationTrace(cv)?.status || '')
    ) {
      throw new ConflictException(
        'CV đang được tạo; vui lòng chờ hoặc hủy yêu cầu',
      );
    }
    if (cv.generationMode === OnlineCvGenerationMode.EDITOR_ONLY) {
      throw new BadRequestException(
        'CV EDITOR_ONLY chỉ được hiển thị và chỉnh sửa trong trình biên tập',
      );
    }

    if (!this.pdfService.isAvailable()) {
      throw new BadRequestException('PDF generation is not available');
    }

    // Verify premium directly from database to prevent watermark bypass
    const userInDb = await this.userRepo.findOne({ where: { _id: user._id } });
    const userHasPremium = this.usersService.isCandidatePremium(userInDb);
    // Watermark is ONLY removed when explicitly downloading with Premium mode (isPremium === true)
    const shouldRemoveWatermark = Boolean(isPremium) && userHasPremium;

    return this.pdfService.export(cv, htmlContent, shouldRemoveWatermark);
  }

  // Get preview HTML (for client-side preview)
  async getPreviewHTML(id: string, user: IUser) {
    const cv = await this.findOne(id, user);
    const html = this.generateHTML(cv);
    return { html };
  }
}
