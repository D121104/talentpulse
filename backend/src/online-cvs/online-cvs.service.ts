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
import { FilesService } from 'src/files/files.service';
import * as Handlebars from 'handlebars';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createHash, randomUUID } from 'crypto';

import { RedisService } from 'src/redis/redis.service';
import { AiCvConsentsService } from 'src/ai-consents/ai-cv-consents.service';
import {
  AiCvConsentScope,
  getActiveAiCvConsentPolicy,
} from 'src/ai-consents/ai-cv-consent.policy';
import {
  AiServiceClient,
  AiServiceError,
  CvDraftRequest,
  CvDraftResponse,
  matchOwnedSkillMembers,
  ownedSkillLiterals,
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
  ONLINE_CV_GENERATION_QUEUE,
  ONLINE_CV_GENERATION_PROCESS,
} from './async-cv-generation.types';
import { CandidateCareerProfileService } from 'src/candidate-career-profile/candidate-career-profile.service';
import { CandidateCareerProfile } from 'src/candidate-career-profile/entities/candidate-career-profile.entity';
import {
  filterMeaningfulCvEntries,
  normalizeCvEntryCollections,
} from 'src/core/cv-entry-filter';

// Dynamic import for puppeteer
let puppeteer: any;

const DEFAULT_CV_LOCALE: OnlineCvLocale = 'vi-VN';
const ASYNC_CV_TIMEOUT_MS = 660_000;

function normalizeCvLocale(value: unknown): OnlineCvLocale {
  return value === 'en-US' ? 'en-US' : DEFAULT_CV_LOCALE;
}

function applicationHeading(
  job: Job | null,
  locale: OnlineCvLocale,
  generatedPosition?: string | null,
) {
  if (!job) return undefined;
  const prefix = `${locale === 'en-US' ? 'Applying for' : 'Ứng tuyển'}: `;
  const canonicalRole = job.name.trim().replace(/\s+/g, ' ');
  // Keep exact application-only translations aligned with FastAPI's role map.
  const localizedRoles: Record<string, string> = {
    'machine learning engineer': 'Kỹ sư học máy',
    'ml engineer': 'Kỹ sư học máy',
    'full stack engineer': 'Kỹ sư full-stack',
    'fullstack engineer': 'Kỹ sư full-stack',
    'senior full stack engineer': 'Kỹ sư full-stack cấp cao',
    'senior fullstack engineer': 'Kỹ sư full-stack cấp cao',
    'senior fullstack developer': 'Lập trình viên full-stack cấp cao',
    'ai / machine learning engineer (python & pytorch)':
      'Kỹ sư AI / học máy (Python & PyTorch)',
    'senior fullstack developer (nodejs / react)':
      'Lập trình viên full-stack cấp cao (NodeJS / React)',
  };
  const generatedHeading = generatedPosition?.trim().replace(/\s+/g, ' ');
  if (generatedHeading?.startsWith(prefix)) {
    const generatedRole = generatedHeading.slice(prefix.length);
    if (
      generatedRole === canonicalRole ||
      (locale === 'vi-VN' &&
        generatedRole === localizedRoles[canonicalRole.toLowerCase()])
    ) {
      return `${prefix}${generatedRole}`;
    }
  }
  return `${prefix}${canonicalRole}`;
}

function isGeneratedDocumentTitle(cv: OnlineCV) {
  const defaults = [
    '',
    'Candidate CV',
    'CV - Candidate',
    'Hồ sơ - Candidate',
    `CV - ${cv.fullName}`,
    `Hồ sơ - ${cv.fullName}`,
    `CV - ${cv.fullName}${cv.position ? ` - ${cv.position}` : ''}`,
    ...(cv.position ? [`CV - ${cv.position}`] : []),
  ];
  return defaults.includes(cv.title || '');
}

function selectedSourceRows<T, D extends { source_index: number }>(
  source: T[],
  drafts: D[],
) {
  const indices = new Set<number>();
  if (!Array.isArray(drafts) || drafts.length > 3) {
    throw new BadGatewayException(
      'Dữ liệu lựa chọn từ dịch vụ AI không hợp lệ',
    );
  }
  return drafts.map((draft) => {
    const index = draft.source_index;
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= source.length ||
      indices.has(index)
    ) {
      throw new BadGatewayException(
        'Dữ liệu lựa chọn từ dịch vụ AI không hợp lệ',
      );
    }
    indices.add(index);
    return { source: source[index], draft };
  });
}

function skillLiteral(
  skill: string | { name?: string; description?: string | null },
) {
  if (typeof skill === 'string') return skill.trim();
  const name = skill.name?.trim() || '';
  const description = skill.description?.trim();
  return name && description ? `${name} (${description})` : name;
}

function skillGroups(
  skills: CvDraftResponse['skills'],
  owned: string[],
  translatable: string[],
) {
  return skills.map((skill) => {
    const members = skill.description
      ? matchOwnedSkillMembers(skill.description, owned, translatable)
      : [];
    if (!members || (!skill.description && owned.length)) {
      throw new BadGatewayException('Nhóm kỹ năng từ dịch vụ AI không hợp lệ');
    }
    return { name: skill.name, description: skill.description, members };
  });
}

function currentCvSkillLiterals(cv: OnlineCV): string[] {
  const stored = cv.revision?.sourceTrace?.skillGroups;
  const groups: Array<{
    name: string;
    description?: string | null;
    members: string[];
  }> = [];
  if (Array.isArray(stored)) {
    for (const value of stored as unknown[]) {
      if (!value || typeof value !== 'object') continue;
      const group = value as Record<string, unknown>;
      const members =
        Array.isArray(group.members) &&
        group.members.every((member) => typeof member === 'string')
          ? (group.members as string[])
          : null;
      const matched =
        members && typeof group.description === 'string'
          ? matchOwnedSkillMembers(group.description, members)
          : null;
      if (
        typeof group.name === 'string' &&
        Array.isArray(group.members) &&
        group.members.every((member) => typeof member === 'string') &&
        (typeof group.description === 'string'
          ? matched?.length === members?.length &&
            matched?.every((member, index) => member === members?.[index])
          : group.description == null && group.members.length === 0)
      ) {
        groups.push({
          name: group.name,
          description: group.description as string | null,
          members: group.members as string[],
        });
      }
    }
  }
  return (cv.skills || []).flatMap((skill) => {
    const prior =
      groups.find(
        (group) =>
          group.name === skill.name && group.description === skill.description,
      ) || groups.find((group) => group.name === skill.name);
    if (!prior) return [skillLiteral(skill)].filter(Boolean);
    if (prior.description === skill.description) return prior.members;
    // A changed group description is current user-owned text, not old membership.
    return skill.description?.trim() ? [skill.description.trim()] : [];
  });
}

const MAX_PDF_HTML_LENGTH = 500_000;
const ALLOWED_PDF_TAGS = new Set([
  'html',
  'head',
  'body',
  'meta',
  'title',
  'style',
  'div',
  'span',
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  'small',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'section',
  'article',
  'header',
  'footer',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'img',
  'a',
]);
const VOID_PDF_TAGS = new Set([
  'area',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'meta',
  'source',
  'track',
  'wbr',
]);

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });
}

function sanitizeCss(css: string): string {
  return css
    .replace(/@import[^;]+;?/gi, '')
    .replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (_match, quote, url) => {
      return /^(?:data:image\/(?:png|jpeg|gif|webp);|blob:)/i.test(
        String(url).trim(),
      )
        ? `url(${quote}${url}${quote})`
        : 'none';
    })
    .replace(/(?:expression|behavior|-moz-binding)\s*:/gi, 'blocked:');
}

function sanitizePdfAttributes(attributes: string): string {
  const safeAttributes: string[] = [];
  const attributePattern =
    /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;

  while ((match = attributePattern.exec(attributes))) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    if (
      name.startsWith('on') ||
      name === 'srcdoc' ||
      name === 'formaction' ||
      (name === 'style' &&
        /(?:url\s*\(|expression|behavior|-moz-binding)/i.test(value))
    ) {
      continue;
    }

    if (name === 'style') {
      safeAttributes.push(`style="${escapeHtml(sanitizeCss(value))}"`);
      continue;
    }
    if (
      !['class', 'id', 'title', 'alt', 'width', 'height', 'role'].includes(
        name,
      ) &&
      !name.startsWith('aria-') &&
      !name.startsWith('data-') &&
      name !== 'href' &&
      name !== 'src'
    ) {
      continue;
    }
    if (name === 'href' && !/^(?:#|mailto:)/i.test(value.trim())) continue;
    if (
      name === 'src' &&
      !/^(?:data:image\/(?:png|jpeg|gif|webp);|blob:)/i.test(value.trim())
    )
      continue;
    safeAttributes.push(`${name}="${escapeHtml(value)}"`);
  }

  return safeAttributes.length ? ` ${safeAttributes.join(' ')}` : '';
}

/** Remove executable markup and all non-local resource references before Chromium sees user HTML. */
export function sanitizePdfHtml(input: string): string {
  const bounded = input.slice(0, MAX_PDF_HTML_LENGTH);
  const withoutDangerousBlocks = bounded
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(
      /<\s*(?:script|iframe|object|embed|base|form|video|audio|source|link|frame|frameset)\b[^>]*>[\s\S]*?(?:<\s*\/\s*(?:script|iframe|object|embed|base|form|video|audio|source|link|frame|frameset)\s*>|$)/gi,
      '',
    )
    .replace(
      /<\s*(?:script|iframe|object|embed|base|form|video|audio|source|link|frame|frameset)\b[^>]*\/?\s*>/gi,
      '',
    );

  const withoutRemoteCss = withoutDangerousBlocks.replace(
    /<\s*style\b[^>]*>([\s\S]*?)<\s*\/\s*style\s*>/gi,
    (_full, css) => `<style>${sanitizeCss(String(css))}</style>`,
  );

  return withoutRemoteCss.replace(
    /<\s*(\/?)([a-z0-9:-]+)([^>]*)>/gi,
    (full, closing, rawTag, attributes) => {
      const tag = String(rawTag).toLowerCase();
      if (!ALLOWED_PDF_TAGS.has(tag)) return '';
      if (closing) return `</${tag}>`;
      if (tag === 'style') return `<style${sanitizePdfAttributes(attributes)}>`;
      const suffix =
        VOID_PDF_TAGS.has(tag) || /\/\s*$/.test(attributes) ? ' /' : '';
      return `<${tag}${sanitizePdfAttributes(attributes)}${suffix}>`;
    },
  );
}

function isTrustedPdfResource(url: string): boolean {
  return /^(?:about:blank|data:image\/(?:png|jpeg|gif|webp);|blob:)/i.test(url);
}

export function normalizeCvContentKey(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}+#]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Preserve the first source item while removing presentation-only duplicates. */
export function dedupeCvText(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const cleaned = value.trim().replace(/\s+/g, ' ');
    const key = normalizeCvContentKey(cleaned);
    if (!cleaned || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result;
}

export function draftDescription(
  source: string | null | undefined,
  bullets: readonly string[] | undefined,
  generatedDescription: string | null | undefined,
): string | undefined {
  const sourceKey = source ? normalizeCvContentKey(source) : '';
  const uniqueBullets = dedupeCvText(bullets || []).filter(
    (bullet) => !sourceKey || normalizeCvContentKey(bullet) !== sourceKey,
  );
  return (
    uniqueBullets.join('\n') || generatedDescription || source || undefined
  );
}

function draftText(value: unknown, ...keys: string[]): string | undefined {
  if (typeof value === 'string' && value.trim()) return value;
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }
  return undefined;
}

function draftList(value: unknown, key: string): string[] {
  const entries = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)[key]
    : undefined;
  if (!Array.isArray(entries)) return [];
  return entries.filter(
    (item): item is string =>
      typeof item === 'string' && item.trim().length > 0,
  );
}

@Injectable()
export class OnlineCVsService {
  constructor(
    @InjectRepository(OnlineCV)
    private readonly onlineCVRepo: Repository<OnlineCV>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly usersService: UsersService,
    private readonly filesService: FilesService,
    private readonly redisService: RedisService,
    private readonly aiCvConsentsService: AiCvConsentsService,
    private readonly aiServiceClient: AiServiceClient,
    private readonly jobsService: JobsService,
    private readonly configService: ConfigService,
    private readonly careerProfileService: CandidateCareerProfileService,
    @InjectQueue(ONLINE_CV_GENERATION_QUEUE)
    private readonly generationQueue: Queue<CvGenerationJobData>,
  ) {
    this.loadPuppeteer();
  }

  private async invalidateUserCvSkillsCache(userId: string) {
    try {
      if (userId) {
        await this.redisService.deleteValue(`user:${userId}:primary-cv-skills`);
      }
    } catch {
      // Ignore cache deletion error
    }
  }

  private async loadPuppeteer() {
    try {
      puppeteer = await import('puppeteer');
    } catch (error) {
      console.warn('Puppeteer not available for PDF generation');
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
    const nextContentVersion = Math.max(1, Number(cv.contentVersion || 1) + 1);
    const identity = {
      request_id: randomUUID(),
      trace_id: randomUUID(),
      operation_attempt_id: randomUUID(),
    };
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
        degree: null,
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
            : [entry?.name, entry?.date].filter(Boolean).join(' - '),
        )
        .filter(Boolean),
    };
    // Legacy CVs created before locale metadata existed remain Vietnamese by contract.
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

    let generated: CvDraftResponse;
    try {
      generated = await this.aiServiceClient.generateCvDraft(
        request,
        aiTimeoutMs ? { timeoutMs: aiTimeoutMs } : undefined,
      );
    } catch (error) {
      if (
        error instanceof AiServiceError &&
        error.code === 'AI_SERVICE_TIMEOUT'
      ) {
        throw new GatewayTimeoutException(
          'Dịch vụ AI tạo CV phản hồi quá thời gian',
        );
      }
      throw new BadGatewayException('Dịch vụ AI tạo CV hiện không khả dụng');
    }

    if (
      generated.target_job_id !== jobIdForContract ||
      generated.candidate_id !== user._id
    ) {
      throw new BadGatewayException(
        'Dữ liệu trả về từ dịch vụ AI không hợp lệ',
      );
    }
    const sourceExperiences = cv.workExperience || [];
    const workExperience = selectedSourceRows(
      sourceExperiences,
      generated.work_experience,
    ).map(({ source: entry, draft }) => ({
      ...entry,
      description: draftDescription(
        entry.description,
        draft.bullets,
        draft.description,
      ),
    }));
    const education = (cv.education || []).map((entry, index) => ({
      ...entry,
      description: generated.education[index]?.description || entry.description,
    }));
    const groups = skillGroups(
      generated.skills,
      ownedSkillLiterals(request.candidate),
      request.candidate.skills,
    );
    const skills = groups.map((entry) => ({
      name: entry.name,
      description: entry.description,
    }));
    const projects = selectedSourceRows(
      (cv.projects || []).filter((entry) => Boolean(entry.projectName)),
      generated.projects,
    ).map(({ source, draft }) => ({
      projectName: source.projectName,
      role: source.role,
      startDate: source.startDate,
      endDate: source.endDate,
      description: draftDescription(
        source.description,
        draft.bullets,
        draft.description,
      ),
      technologies: source.technologies,
    }));
    const warnings = generated.warnings || [];
    const applicationPosition = applicationHeading(
      job,
      locale,
      generated.position,
    );
    await this.onlineCVRepo.manager.transaction(async (manager) => {
      const persistPrerequisites = await this.assertGenerationPrerequisites(
        user,
        cv.templateType as 'template1' | 'template2',
        manager,
      );
      if (
        persistPrerequisites.policy.consentVersion !== policy.consentVersion ||
        persistPrerequisites.policy.policyHash !== policy.policyHash
      ) {
        throw new ForbiddenException('Quyền xử lý AI đã thay đổi');
      }
      await this.assertTargetJobUnchanged(manager, job);
      const repository = manager.getRepository(OnlineCV);
      if (operationId) {
        const current = await repository.findOne({
          where: { _id: id, userId: user._id, isDeleted: false },
          lock: { mode: 'pessimistic_write' },
        });
        if (
          !current ||
          this.generationTrace(current)?.operationId !== operationId ||
          this.generationTrace(current)?.status !== 'RUNNING'
        ) {
          throw new ConflictException(
            'Yêu cầu tạo CV đã bị hủy hoặc trở nên cũ',
          );
        }
      }
      const updateResult = await repository.update(
        this.generationWriteCriteria(cv),
        {
          generationMode: OnlineCvGenerationMode.EDITOR_ONLY,
          contentVersion: generated.content_version,
          sourceVersion: generated.source_version,
          generatedBy: generated.generated_by,
          targetJobId,
          position: applicationPosition || cv.position,
          ...(job && isGeneratedDocumentTitle(cv)
            ? { title: `CV - ${applicationPosition}` }
            : {}),
          revision: {
            contentVersion: generated.content_version,
            locale,
            generatedAt: new Date().toISOString(),
            warnings,
            sourceTrace: {
              requestId: generated.request_id,
              traceId: generated.trace_id,
              operationAttemptId: generated.operation_attempt_id,
              consentVersion: policy.consentVersion,
              locale,
              targetJobId,
              experienceSourceIndices: generated.work_experience.map(
                (entry) => entry.source_index,
              ),
              projectSourceIndices: generated.projects.map(
                (entry) => entry.source_index,
              ),
              skillGroups: groups,
              ...(operationId && this.generationTrace(cv)
                ? {
                    generation: {
                      ...this.generationTrace(cv),
                      status: warnings.length ? 'DEGRADED' : 'COMPLETE',
                      finishedAt: new Date().toISOString(),
                      warnings,
                    },
                  }
                : {}),
            },
          },
          careerObjective: generated.career_objective || cv.careerObjective,
          workExperience,
          education,
          skills,
          projects,
          sectionOrder: generated.section_order,
          // Editor-only CVs are rendered by the client template, never by PDF/Cloudinary.
          htmlContent: null,
          pdfUrl: null,
          updatedBy: { _id: user._id, email: user.email },
        },
      );
      if (!updateResult.affected) {
        throw new ConflictException(
          'CV đã được thay đổi trong khi AI đang tạo bản nháp; vui lòng thử lại',
        );
      }
    });
    await this.invalidateUserCvSkillsCache(user._id);
    const saved = await this.findOne(id, user);
    return {
      status: warnings.length > 0 ? 'DEGRADED' : 'COMPLETE',
      draft: saved,
      warnings,
      generationMode: saved.generationMode,
      contentVersion: saved.contentVersion,
      sourceVersion: saved.sourceVersion,
      generatedBy: saved.generatedBy,
      targetJobId: saved.targetJobId,
      revision: saved.revision,
      locale: saved.revision?.locale || locale,
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
        .map((entry) => [entry?.name, entry?.date].filter(Boolean).join(' - '))
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
        .map((entry) => [entry?.name, entry?.date].filter(Boolean).join(' - '))
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

    let generated: CvDraftResponse;
    try {
      generated = await this.aiServiceClient.generateCvDraft(
        request,
        aiTimeoutMs ? { timeoutMs: aiTimeoutMs } : undefined,
      );
    } catch (error) {
      if (
        error instanceof AiServiceError &&
        error.code === 'AI_SERVICE_TIMEOUT'
      ) {
        throw new GatewayTimeoutException(
          'Dịch vụ AI tạo CV phản hồi quá thời gian',
        );
      }
      throw new BadGatewayException('Dịch vụ AI tạo CV hiện không khả dụng');
    }
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

    const sourceExperiences = normalizedProfile.experience;
    const sourceProjects = normalizedProfile.projects.filter((entry) =>
      Boolean(entry.projectName),
    );

    const projectDrafts: OnlineCV['projects'] = selectedSourceRows(
      sourceProjects,
      generated.projects,
    ).map(({ source, draft: generatedProject }) => {
      return {
        projectName: source.projectName,
        // Project names, dates and technologies are canonical profile facts;
        // only the role and narrative are localized by the AI response.
        role: draftText(generatedProject, 'role') || source.role,
        startDate: source.startDate,
        endDate: source.endDate,
        description: draftDescription(
          source.description,
          draftList(generatedProject, 'bullets'),
          draftText(generatedProject, 'description'),
        ),
        technologies: source.technologies,
      };
    });
    let pendingGeneration: CvGenerationMetadata | undefined;
    if (targetCvId && operationId) {
      const current = await this.onlineCVRepo.findOne({
        where: { _id: targetCvId, userId: user._id, isDeleted: false },
      });
      pendingGeneration = current ? this.generationTrace(current) : undefined;
      if (
        !current ||
        pendingGeneration?.operationId !== operationId ||
        pendingGeneration.status === 'CANCELLED'
      ) {
        throw new ConflictException('Yêu cầu tạo CV đã bị hủy hoặc trở nên cũ');
      }
    }
    const applicationPosition = applicationHeading(
      job,
      locale,
      generated.position,
    );
    const newCvData: DeepPartial<OnlineCV> = {
      templateType: generated.template_type,
      generationMode: OnlineCvGenerationMode.EDITOR_ONLY,
      contentVersion: 1,
      sourceVersion: generated.source_version,
      generatedBy: generated.generated_by,
      targetJobId,
      sourceProfileId: profile._id,
      sourceProfileVersion: profile.contentVersion,
      generationSnapshot: normalizedProfile,
      revision: {
        contentVersion: generated.content_version,
        locale,
        generatedAt: new Date().toISOString(),
        warnings: generated.warnings || [],
        sourceTrace: {
          requestId: generated.request_id,
          traceId: generated.trace_id,
          operationAttemptId: generated.operation_attempt_id,
          consentVersion: policy.consentVersion,
          locale,
          targetJobId,
          sourceProfileId: profile._id,
          sourceProfileVersion: profile.contentVersion,
          experienceSourceIndices: generated.work_experience.map(
            (entry) => entry.source_index,
          ),
          projectSourceIndices: generated.projects.map(
            (entry) => entry.source_index,
          ),
          skillGroups: skillGroups(
            generated.skills,
            ownedSkillLiterals(request.candidate),
            request.candidate.skills,
          ),
          ...(pendingGeneration ? { generation: pendingGeneration } : {}),
        },
      },
      title: job ? `CV - ${applicationPosition}` : generated.title,
      fullName: normalizedProfile.contact.fullName,
      position: applicationPosition || normalizedProfile.headline,
      phone: normalizedProfile.contact.phone,
      email: normalizedProfile.contact.email,
      link: normalizedProfile.contact.link,
      address: normalizedProfile.contact.address,
      careerObjective:
        generated.career_objective || normalizedProfile.objective,
      education: normalizedProfile.education.map((entry, index) => ({
        // Preserve school and dates as proper/canonical facts; localized degree,
        // major and description are accepted when FastAPI returns them.
        schoolName: entry.schoolName,
        degree: draftText(generated.education[index], 'degree') || entry.degree,
        major: draftText(generated.education[index], 'major') || entry.major,
        startDate: entry.startDate,
        endDate: entry.endDate,
        description:
          draftText(generated.education[index], 'description') ||
          entry.description,
      })),
      workExperience: selectedSourceRows(
        sourceExperiences,
        generated.work_experience,
      ).map(({ source: entry, draft }) => ({
        companyName: entry.companyName,
        position: draftText(draft, 'position') || entry.position,
        startDate: entry.startDate,
        endDate: entry.endDate,
        description: draftDescription(
          entry.description,
          draftList(draft, 'bullets'),
          draftText(draft, 'description'),
        ),
      })),
      skills: filterMeaningfulCvEntries(
        (generated.skills || [])
          .map((skill) => ({
            // The transport deliberately omits skill level. Keep OnlineCV's
            // canonical name/description shape and never invent or persist it.
            name: skill.name,
            description: skill.description,
          }))
          .filter(
            (skill, index, entries) =>
              entries.findIndex(
                (candidate) =>
                  normalizeCvContentKey(candidate.name) ===
                  normalizeCvContentKey(skill.name),
              ) === index,
          ),
      ),
      projects: projectDrafts,
      activities: normalizedProfile.activities.map((entry, index) => {
        // FastAPI intentionally returns these sections as localized strings.
        // Keep canonical organization/date fields and place the localized text
        // in the editable narrative field.
        const localized = generated.activities[index];
        return {
          organizationName: entry.organizationName,
          position: entry.position,
          startDate: entry.startDate,
          endDate: entry.endDate,
          description:
            typeof localized === 'string' && localized.trim()
              ? localized
              : entry.description,
        };
      }),
      certificates: normalizedProfile.certificates.map((entry, index) => {
        const localized = generated.certificates[index];
        return {
          // Certificate names are displayed as the localized contract value;
          // issuer/date/credential URL remain canonical profile facts.
          name:
            typeof localized === 'string' && localized.trim()
              ? localized
              : entry.name,
          issuer: entry.issuer,
          date: entry.date,
          credentialUrl: entry.credentialUrl,
        };
      }),
      awards: normalizedProfile.awards.map((entry, index) => {
        const localized = generated.awards[index];
        return {
          name: entry.name,
          issuer: entry.issuer,
          date: entry.date,
          description:
            typeof localized === 'string' && localized.trim()
              ? localized
              : entry.description,
        };
      }),
      sectionOrder: generated.section_order,
      htmlContent: null,
      pdfUrl: null,
      userId: user._id,
      isPrimary: currentCount === 0,
      isSearchable: false,
      isDeleted: false,
      createdBy: { _id: user._id, email: user.email },
    };

    const persist = async (manager: EntityManager): Promise<OnlineCV> => {
      const persistPrerequisites = await this.assertGenerationPrerequisites(
        user,
        templateType,
        manager,
      );
      if (
        persistPrerequisites.policy.consentVersion !== policy.consentVersion ||
        persistPrerequisites.policy.policyHash !== policy.policyHash
      ) {
        throw new ForbiddenException('Quyền xử lý AI đã thay đổi');
      }
      const profileRepository = manager.getRepository(CandidateCareerProfile);
      {
        const lockedProfile = await profileRepository.findOne({
          where: { _id: profile._id, userId: user._id },
          lock: { mode: 'pessimistic_write' },
        });
        if (
          !lockedProfile ||
          lockedProfile.contentVersion !== profile.contentVersion
        ) {
          throw new ConflictException(
            'Hồ sơ nghề nghiệp đã được thay đổi trong khi AI đang tạo CV; vui lòng thử lại',
          );
        }
      }
      await this.assertTargetJobUnchanged(manager, job);
      const cvRepository = manager.getRepository(OnlineCV);
      if (newCvData.isPrimary) {
        await cvRepository.update(
          { userId: user._id, isPrimary: true },
          { isPrimary: false },
        );
      }
      if (targetCvId) {
        const current = await cvRepository.findOne({
          where: { _id: targetCvId, userId: user._id, isDeleted: false },
          ...(manager ? { lock: { mode: 'pessimistic_write' } } : {}),
        });
        const currentOperation = current && this.generationTrace(current);
        if (
          !current ||
          !currentOperation ||
          currentOperation.operationId !== operationId ||
          currentOperation.status !== 'RUNNING' ||
          current.contentVersion !== currentOperation.expectedContentVersion
        ) {
          throw new ConflictException(
            'Yêu cầu tạo CV đã bị hủy hoặc trở nên cũ',
          );
        }
        newCvData.revision = {
          ...newCvData.revision,
          contentVersion: current.contentVersion + 1,
          sourceTrace: {
            ...newCvData.revision?.sourceTrace,
            generation: {
              ...currentOperation,
              status: generated.warnings?.length ? 'DEGRADED' : 'COMPLETE',
              finishedAt: new Date().toISOString(),
              warnings: generated.warnings || [],
            },
          },
        };
        newCvData.contentVersion = current.contentVersion + 1;
        const updated = await cvRepository.update(
          this.generationWriteCriteria(current),
          newCvData,
        );
        if (!updated.affected)
          throw new ConflictException(
            'CV nháp đã được thay đổi trong khi AI đang tạo',
          );
        return cvRepository.findOneOrFail({
          where: { _id: targetCvId, userId: user._id },
        });
      }
      return cvRepository.save(cvRepository.create(newCvData));
    };
    const saved = await this.onlineCVRepo.manager.transaction(persist);
    return {
      status: generated.warnings?.length ? 'DEGRADED' : 'COMPLETE',
      draft: saved,
      onlineCv: saved,
      warnings: generated.warnings || [],
      generationMode: saved.generationMode,
      contentVersion: saved.contentVersion,
      sourceVersion: saved.sourceVersion,
      sourceProfileId: saved.sourceProfileId,
      sourceProfileVersion: saved.sourceProfileVersion,
      generationSnapshot: saved.generationSnapshot,
      generatedBy: saved.generatedBy,
      targetJobId: saved.targetJobId,
      revision: saved.revision,
      locale: saved.revision?.locale || locale,
    };
  }

  private assertGenerationKey(idempotencyKey: string): string {
    const normalized = idempotencyKey?.trim();
    if (!normalized || normalized.length > 200) {
      throw new BadRequestException('Idempotency-Key không hợp lệ');
    }
    return createHash('sha256').update(normalized, 'utf8').digest('hex');
  }

  private generationTrace(cv: OnlineCV): CvGenerationMetadata | undefined {
    const value = cv.revision?.sourceTrace?.generation;
    return value && typeof value === 'object' ? value : undefined;
  }

  private generationWriteCriteria(cv: OnlineCV) {
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
    };
  }

  private operationResponse(
    metadata: CvGenerationMetadata,
    cvId: string,
    cv?: OnlineCV,
  ) {
    const active = ['QUEUED', 'RUNNING'].includes(metadata.status);
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
      ...(!active && cv ? { current: cv } : {}),
      ...(cv && ['COMPLETE', 'DEGRADED'].includes(metadata.status)
        ? {
            draft: cv,
            generationMode: cv.generationMode,
            contentVersion: cv.contentVersion,
            sourceVersion: cv.sourceVersion,
            generatedBy: cv.generatedBy,
            revision: cv.revision,
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
    const idempotencyKeyHash = this.assertGenerationKey(idempotencyKey);
    const cv = await this.findOne(id, user);
    const existingOperation = this.generationTrace(cv);
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
      createdAt: new Date().toISOString(),
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

  async enqueueGenerationFromCareerProfile(
    dto: GenerateFromCareerProfileDto,
    user: IUser,
    idempotencyKey: string,
  ) {
    if (!isRedisEnabled()) {
      throw new ServiceUnavailableException('Hàng đợi tạo CV chưa được bật');
    }
    const reserved = await this.onlineCVRepo.manager.transaction((manager) =>
      this.reserveGenerationFromCareerProfile(
        dto,
        user,
        idempotencyKey,
        manager,
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
      createdAt: new Date().toISOString(),
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
    const cv = await this.findOne(id, user);
    const metadata = this.generationTrace(cv);
    if (!metadata || metadata.operationId !== operationId)
      throw new NotFoundException('Không tìm thấy yêu cầu tạo CV');
    return this.operationResponse(metadata, cv._id, cv);
  }

  async cancelGeneration(id: string, operationId: string, user: IUser) {
    const cv = await this.findOne(id, user);
    const metadata = this.generationTrace(cv);
    if (!metadata || metadata.operationId !== operationId)
      throw new NotFoundException('Không tìm thấy yêu cầu tạo CV');
    if (
      ['COMPLETE', 'DEGRADED', 'FAILED', 'STALE', 'CANCELLED'].includes(
        metadata.status,
      )
    ) {
      return this.operationResponse(metadata, cv._id, cv);
    }
    const cancelled: CvGenerationMetadata = {
      ...metadata,
      status: 'CANCELLED',
      finishedAt: new Date().toISOString(),
      errorCode: 'CANCELLED_BY_USER',
    };
    const result = await this.onlineCVRepo.update(
      this.generationWriteCriteria(cv),
      {
        revision: {
          ...(cv.revision || {}),
          sourceTrace: {
            ...(cv.revision?.sourceTrace || {}),
            generation: cancelled,
          },
        },
      },
    );
    if (!result.affected) return this.getGenerationJob(id, operationId, user);
    try {
      const queued = await this.generationQueue.getJob(operationId);
      if (
        queued &&
        ['waiting', 'delayed', 'paused'].includes(await queued.getState())
      )
        await queued.remove();
    } catch {
      /* cancellation state is persisted even if Redis is unavailable */
    }
    return this.getGenerationJob(cv._id, operationId, user);
  }

  async processGenerationJob(data: CvGenerationJobData): Promise<void> {
    const cv = await this.onlineCVRepo.findOne({
      where: { _id: data.cvId, userId: data.userId, isDeleted: false },
    });
    if (!cv) return;
    const metadata = this.generationTrace(cv);
    if (
      metadata?.operationId === data.operationId &&
      metadata.status === 'RUNNING'
    ) {
      return this.finishGeneration(data, 'FAILED', 'WORKER_INTERRUPTED');
    }
    if (
      !metadata ||
      metadata.operationId !== data.operationId ||
      metadata.status === 'CANCELLED' ||
      metadata.status !== 'QUEUED'
    )
      return;
    const userEntity = await this.userRepo.findOne({
      where: { _id: data.userId, isDeleted: false },
    });
    if (!userEntity)
      return this.finishGeneration(data, 'FAILED', 'OWNER_NOT_FOUND');
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
      return this.finishGeneration(data, 'FAILED', 'CONSENT_REVOKED');
    if (
      data.templateType !== 'template1' &&
      !this.usersService.isCandidatePremium(userEntity)
    )
      return this.finishGeneration(data, 'FAILED', 'ENTITLEMENT_REVOKED');
    if (cv.contentVersion !== data.expectedContentVersion)
      return this.finishGeneration(data, 'STALE', 'CONTENT_VERSION_CHANGED');
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
        return this.finishGeneration(data, 'STALE', 'SOURCE_VERSION_CHANGED');
    }
    if (data.kind === 'CAREER_PROFILE') {
      let profile: CandidateCareerProfile;
      try {
        profile = await this.careerProfileService.requireMine(user);
      } catch {
        return this.finishGeneration(data, 'STALE', 'PROFILE_NOT_FOUND');
      }
      if (
        profile._id !== data.sourceProfileId ||
        profile.contentVersion !== data.sourceProfileVersion
      )
        return this.finishGeneration(data, 'STALE', 'PROFILE_VERSION_CHANGED');
    }
    const running = await this.setGenerationStatus(data, 'RUNNING');
    if (!running) return;
    try {
      if (data.kind === 'EXISTING_CV') {
        await this.generate(
          data.cvId,
          { jobId: data.targetJobId || undefined } as GenerateOnlineCvDto,
          user,
          data.operationId,
          ASYNC_CV_TIMEOUT_MS,
        );
      } else {
        await this.generateFromCareerProfile(
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
          ASYNC_CV_TIMEOUT_MS,
        );
      }
      const latest = await this.onlineCVRepo.findOne({
        where: { _id: data.cvId, userId: data.userId, isDeleted: false },
      });
      const warnings = latest?.revision?.warnings || [];
      await this.finishGeneration(
        data,
        warnings.length ? 'DEGRADED' : 'COMPLETE',
        undefined,
        warnings,
      );
    } catch (error) {
      if (error instanceof ConflictException)
        return this.finishGeneration(data, 'STALE', 'SOURCE_CHANGED');
      if (
        error instanceof AiServiceError &&
        error.code === 'AI_SERVICE_TIMEOUT'
      )
        return this.finishGeneration(data, 'FAILED', 'AI_TIMEOUT');
      return this.finishGeneration(data, 'FAILED', 'GENERATION_FAILED');
    }
  }

  async markGenerationFailure(
    data: CvGenerationJobData,
    errorCode = 'WORKER_FAILURE',
  ): Promise<void> {
    await this.finishGeneration(data, 'FAILED', errorCode);
  }

  private async setGenerationStatus(
    data: CvGenerationJobData,
    status: CvGenerationOperationStatus,
  ): Promise<boolean> {
    const cv = await this.onlineCVRepo.findOne({
      where: { _id: data.cvId, userId: data.userId, isDeleted: false },
    });
    const current = cv && this.generationTrace(cv);
    if (
      !cv ||
      !current ||
      current.operationId !== data.operationId ||
      current.status !== 'QUEUED'
    )
      return false;
    const metadata = {
      ...current,
      status,
      startedAt: new Date().toISOString(),
    };
    const result = await this.onlineCVRepo.update(
      this.generationWriteCriteria(cv),
      {
        revision: {
          ...(cv.revision || {}),
          sourceTrace: {
            ...(cv.revision?.sourceTrace || {}),
            generation: metadata,
          },
        },
      },
    );
    return Boolean(result.affected);
  }

  private async finishGeneration(
    data: CvGenerationJobData,
    status: CvGenerationOperationStatus,
    errorCode?: string,
    warnings?: string[],
  ) {
    const cv = await this.onlineCVRepo.findOne({
      where: { _id: data.cvId, userId: data.userId, isDeleted: false },
    });
    if (!cv) return;
    const current = this.generationTrace(cv);
    if (
      !current ||
      current.operationId !== data.operationId ||
      !['QUEUED', 'RUNNING'].includes(current.status)
    )
      return;
    const metadata: CvGenerationMetadata = {
      ...current,
      status,
      finishedAt: new Date().toISOString(),
      ...(errorCode ? { errorCode } : {}),
      ...(warnings ? { warnings } : {}),
    };
    await this.onlineCVRepo.update(this.generationWriteCriteria(cv), {
      revision: {
        ...(cv.revision || {}),
        sourceTrace: {
          ...(cv.revision?.sourceTrace || {}),
          generation: metadata,
        },
      },
    });
  }

  // Get all online CVs of current user
  async findByUser(user: IUser) {
    const cvs = await this.onlineCVRepo.find({
      where: { userId: user._id, isDeleted: false },
      order: { isPrimary: 'DESC', createdAt: 'DESC' },
    });
    Logger.log(`Found ${cvs.length} online CV(s) for user ${user.email}`);
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

    const updateResult = await this.onlineCVRepo.update(
      this.generationWriteCriteria(cv),
      {
        ...dataToSave,
        htmlContent,
        contentVersion: nextContentVersion,
        revision: {
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
        },
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

  // Resolve templates directory (dist or src fallback)
  private getTemplatesDir(): string {
    const compiledDir = join(__dirname, 'templates');
    const srcDir = join(process.cwd(), 'src', 'online-cvs', 'templates');
    return existsSync(compiledDir) ? compiledDir : srcDir;
  }

  // Generate HTML from Handlebars template based on templateType
  private generateHTML(cv: OnlineCV): string {
    const templateFile = `${cv.templateType}.hbs`;
    const templatePath = join(this.getTemplatesDir(), templateFile);

    if (!existsSync(templatePath)) {
      throw new BadRequestException(
        `Template '${cv.templateType}' không tồn tại`,
      );
    }

    const templateSource = readFileSync(templatePath, 'utf-8');
    const template = Handlebars.compile(templateSource);

    return template(normalizeCvEntryCollections(cv));
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

    if (!puppeteer) {
      throw new BadRequestException('PDF generation is not available');
    }

    // Verify premium directly from database to prevent watermark bypass
    const userInDb = await this.userRepo.findOne({ where: { _id: user._id } });
    const userHasPremium = this.usersService.isCandidatePremium(userInDb);
    // Watermark is ONLY removed when explicitly downloading with Premium mode (isPremium === true)
    const shouldRemoveWatermark = Boolean(isPremium) && userHasPremium;

    try {
      let contentToUse = htmlContent || cv.htmlContent;
      let finalHtml = '';

      if (shouldRemoveWatermark && contentToUse) {
        // Strip any existing watermark blocks from HTML specifically for this Premium download
        contentToUse = contentToUse
          .replace(
            /<div[^>]*class="[^"]*cv-watermark[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
            '',
          )
          .replace(/<div[^>]*data-watermark="true"[^>]*>[\s\S]*?<\/div>/gi, '')
          .replace(
            /<div[^>]*>[\s\S]*?Được tạo bởi[\s\S]*?TalentPulse[\s\S]*?<\/div>/gi,
            '',
          )
          .replace(
            /<div style="position: fixed; bottom: 8px;[\s\S]*?<\/div>/gi,
            '',
          );
      }

      const watermarkHtml = shouldRemoveWatermark
        ? ''
        : `
<div class="cv-watermark" style="position: fixed; bottom: 8px; left: 0; right: 0; text-align: center; font-size: 8pt; color: #94a3b8; font-family: 'Inter', sans-serif; border-top: 1px dashed #cbd5e1; padding-top: 4px; margin: 0 40px; pointer-events: none; z-index: 9999; background: white;">
  © <strong>talentpulse.vn</strong> &bull; Nền tảng tạo CV & kết nối ứng viên thông minh
</div>`;

      if (contentToUse && contentToUse.trim().length > 0) {
        contentToUse = sanitizePdfHtml(contentToUse);
        finalHtml = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data: blob:;" />
  <title>${escapeHtml(cv.fullName || 'CV')}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 0;
    }
    html, body {
      margin: 0;
      padding: 0;
      background-color: #ffffff;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    * {
      box-sizing: border-box;
    }
    .print\\:hidden {
      display: none !important;
    }
    ${
      shouldRemoveWatermark
        ? '.cv-watermark, [data-watermark] { display: none !important; }'
        : ''
    }
  </style>
</head>
<body>
  ${contentToUse}
  ${
    !contentToUse.includes('talentpulse.vn') && !shouldRemoveWatermark
      ? watermarkHtml
      : ''
  }
</body>
</html>`;
      } else {
        finalHtml = this.generateHTML(cv);
        if (!shouldRemoveWatermark) {
          finalHtml = finalHtml.replace('</body>', `${watermarkHtml}</body>`);
        }
      }

      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const page = await browser.newPage();
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', (request: any) => {
        if (isTrustedPdfResource(request.url())) request.continue();
        else request.abort();
      });
      await page.setContent(finalHtml, { waitUntil: 'domcontentloaded' });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
      });

      await browser.close();

      // Upload PDF to Cloudinary
      const uploadResult = await this.filesService.uploadBuffer(
        pdfBuffer,
        `cv_${cv._id}_${Date.now()}.pdf`,
        'application/pdf',
      );

      // Update online CV with PDF URL and htmlContent
      await this.onlineCVRepo.update(id, {
        pdfUrl: uploadResult.url,
        ...(contentToUse ? { htmlContent: contentToUse } : {}),
      });

      // Also sync pdfUrl to linked UserCV records if present
      try {
        await this.onlineCVRepo.query(
          'UPDATE user_cvs SET url = $1 WHERE "onlineCvId" = $2',
          [uploadResult.url, id],
        );
      } catch {
        // Ignore if not present
      }

      return {
        _id: cv._id,
        pdfUrl: uploadResult.url,
        message: 'Xuất PDF thành công',
      };
    } catch {
      Logger.error('PDF generation failed');
      throw new BadRequestException('Không thể tạo PDF');
    }
  }

  // Get preview HTML (for client-side preview)
  async getPreviewHTML(id: string, user: IUser) {
    const cv = await this.findOne(id, user);
    const html = this.generateHTML(cv);
    return { html };
  }
}
