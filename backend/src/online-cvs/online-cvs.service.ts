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
import { FilesService } from 'src/files/files.service';
import * as Handlebars from 'handlebars';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
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

// Dynamic import for puppeteer
let puppeteer: any;

const DEFAULT_CV_LOCALE: OnlineCvLocale = 'vi-VN';
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

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error('Value is not JSON serializable');
  return encoded;
}

function cvDraftHash(draft: CvDraftResponse): string {
  return createHash('sha256').update(stableJson(draft), 'utf8').digest('hex');
}

function safeReviewWarnings(review: CvDraftReviewResponse): string[] {
  const warnings = new Set<string>();
  if (
    Object.values(review.review_metadata.field_origins_by_path).includes(
      'FALLBACK',
    )
  ) {
    warnings.add('FALLBACK_USED');
  }
  for (const omission of review.review_metadata.omissions_by_path) {
    warnings.add(omission.reason_code);
  }
  return [...warnings].slice(0, 20);
}

function publicReviewMetadata(review: CvDraftReviewResponse) {
  return {
    fieldOriginsByPath: review.review_metadata.field_origins_by_path,
    omissionsByPath: review.review_metadata.omissions_by_path.map(
      ({ path, reason_code }) => ({ path, reasonCode: reason_code }),
    ),
  };
}

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

function localizedCvText(
  source: string | null | undefined,
  generated: string | null | undefined,
  locale: OnlineCvLocale,
  warnings: string[],
): string | null {
  if (generated?.trim()) return generated;
  if (locale !== 'en-US') return source || null;
  if (
    source?.trim() &&
    !warnings.some((warning) =>
      warning.startsWith('cv_generation.localization_omission'),
    )
  ) {
    warnings.push('cv_generation.localization_omission=narrative:unresolved');
  }
  return null;
}

const RETRY_TEXT_FIELDS = {
  workExperience: ['position', 'description'],
  education: ['degree', 'major', 'description'],
  projects: ['role', 'description'],
  certificates: ['name'],
  activities: ['position', 'description'],
  awards: ['name', 'description'],
} as const;

type LocalizationRetry = {
  contentVersion: number;
  fields: Record<string, string>;
  skills: string[];
};

function localizedRetryInput(cv: OnlineCV): OnlineCV {
  const retry = cv.generationSnapshot?.localizationRetry as
    | LocalizationRetry
    | undefined;
  if (
    cv.revision?.locale !== 'en-US' ||
    retry?.contentVersion !== cv.contentVersion ||
    !cv.revision?.warnings?.some(
      (warning) =>
        warning.includes('localization_omission') ||
        warning.includes('skill_member_locale_omission'),
    )
  )
    return cv;
  const input = { ...cv };
  if (
    !input.careerObjective &&
    typeof retry.fields?.careerObjective === 'string'
  ) {
    input.careerObjective = retry.fields.careerObjective;
  }
  for (const section of Object.keys(
    RETRY_TEXT_FIELDS,
  ) as (keyof typeof RETRY_TEXT_FIELDS)[]) {
    const entries = (cv[section] || []).map((entry, index) => {
      const restored = { ...entry };
      for (const field of RETRY_TEXT_FIELDS[section]) {
        const value = retry.fields?.[`${section}.${index}.${field}`];
        if (!restored[field] && typeof value === 'string')
          restored[field] = value;
      }
      return restored;
    });
    Object.assign(input, { [section]: entries });
  }
  return input;
}

function localizationRetry(
  source: Pick<OnlineCV, keyof typeof RETRY_TEXT_FIELDS | 'careerObjective'>,
  output: Pick<OnlineCV, keyof typeof RETRY_TEXT_FIELDS | 'careerObjective'>,
  contentVersion: number,
  skills: string[],
): LocalizationRetry {
  const fields: Record<string, string> = {};
  if (source.careerObjective && !output.careerObjective)
    fields.careerObjective = source.careerObjective;
  for (const section of Object.keys(
    RETRY_TEXT_FIELDS,
  ) as (keyof typeof RETRY_TEXT_FIELDS)[]) {
    (output[section] || []).forEach((entry, index) => {
      for (const field of RETRY_TEXT_FIELDS[section]) {
        const value = source[section]?.[index]?.[field];
        if (!entry[field] && typeof value === 'string' && value.trim())
          fields[`${section}.${index}.${field}`] = value;
      }
    });
  }
  return { contentVersion, fields, skills };
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
    const inputCv = localizedRetryInput(cv);
    const retry = cv.generationSnapshot?.localizationRetry as
      | LocalizationRetry
      | undefined;
    const retrySkills =
      inputCv !== cv && Array.isArray(retry?.skills) ? retry.skills : [];
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
      skills: retrySkills.length
        ? Array.from(new Set([...currentCvSkillLiterals(cv), ...retrySkills]))
        : currentCvSkillLiterals(cv),
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

    let reviewResponse: CvDraftReviewResponse;
    try {
      reviewResponse = await this.aiServiceClient.generateCvDraftReview(
        request,
        { timeoutMs: this.generationRemaining(deadline) },
      );
    } catch (error) {
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
    if (reviewResponse.implementation === 'agent') {
      const result = await this.stageAgentDraft({
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
        implementation: reviewResponse.implementation,
        status: result.status,
        reviewStatus: 'PENDING_REVIEW',
        durationMs: Date.now() - startedAt,
        modelCalls: 1,
        toolCalls: 1,
        errorType: null,
      });
      return result;
    }
    const warnings = [...(generated.warnings || [])];
    const text = (
      source: string | null | undefined,
      value: string | null | undefined,
    ) => localizedCvText(source, value, locale, warnings);
    const sourceExperiences = inputCv.workExperience || [];
    const workExperience = selectedSourceRows(
      sourceExperiences,
      generated.work_experience,
    ).map(({ source: entry, draft }) => ({
      ...entry,
      position: text(entry.position, draftText(draft, 'position')),
      description: text(
        entry.description,
        draftDescription(undefined, draft.bullets, draft.description),
      ),
    }));
    const education = (inputCv.education || []).map((entry, index) => ({
      ...entry,
      degree: text(
        entry.degree,
        draftText(generated.education[index], 'degree'),
      ),
      major: text(entry.major, draftText(generated.education[index], 'major')),
      description: text(
        entry.description,
        draftText(generated.education[index], 'description'),
      ),
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
      (inputCv.projects || []).filter((entry) => Boolean(entry.projectName)),
      generated.projects,
    ).map(({ source, draft }) => ({
      ...source,
      projectName: source.projectName,
      role: text(source.role, draftText(draft, 'role')),
      startDate: source.startDate,
      endDate: source.endDate,
      description: text(
        source.description,
        draftDescription(undefined, draft.bullets, draft.description),
      ),
      technologies: source.technologies,
    }));
    const certificates = (inputCv.certificates || []).map((entry, index) => ({
      ...entry,
      name: text(entry.name, draftText(generated.certificates[index])) || '',
    }));
    const activities = (inputCv.activities || []).map((entry, index) => ({
      ...entry,
      position:
        locale === 'en-US' ? text(entry.position, undefined) : entry.position,
      description: text(
        entry.description,
        draftText(generated.activities[index]),
      ),
    }));
    const awards = (inputCv.awards || []).map((entry, index) => ({
      ...entry,
      name:
        locale === 'en-US'
          ? entry.description
            ? 'Award'
            : text(entry.name, draftText(generated.awards[index])) || 'Award'
          : entry.name,
      description:
        locale === 'en-US' && !entry.description
          ? null
          : text(entry.description, draftText(generated.awards[index])),
    }));
    const careerObjective = text(
      inputCv.careerObjective,
      generated.career_objective,
    );
    if (
      locale === 'en-US' &&
      [
        ...(inputCv.workExperience || []),
        ...(inputCv.projects || []),
        ...(inputCv.education || []),
      ].some((entry) => entry.description?.trim()) &&
      ![...workExperience, ...projects, ...education].some((entry) =>
        entry.description?.trim(),
      )
    ) {
      throw new BadGatewayException(
        'AI could not localize the CV narratives; the original CV was not changed',
      );
    }
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
      this.generationRemaining(deadline);
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
          ...(locale === 'en-US' &&
          warnings.some(
            (warning) =>
              warning.startsWith('cv_generation.localization_omission') ||
              warning.includes('skill_member_locale_omission'),
          )
            ? {
                generationSnapshot: {
                  ...cv.generationSnapshot,
                  localizationRetry: localizationRetry(
                    {
                      ...inputCv,
                      workExperience: selectedSourceRows(
                        sourceExperiences,
                        generated.work_experience,
                      ).map(({ source }) => source),
                      projects: selectedSourceRows(
                        (inputCv.projects || []).filter((entry) =>
                          Boolean(entry.projectName),
                        ),
                        generated.projects,
                      ).map(({ source }) => source),
                    },
                    {
                      workExperience,
                      education,
                      projects,
                      certificates,
                      activities,
                      awards,
                      careerObjective,
                    },
                    generated.content_version,
                    warnings.some((warning) =>
                      warning.includes('skill_member_locale_omission'),
                    )
                      ? profile.skills.filter(
                          (skill) =>
                            !groups.some((group) =>
                              group.members.includes(skill),
                            ),
                        )
                      : [],
                  ),
                  previousCvContent: cv.generationSnapshot
                    ?.previousCvContent || {
                    position: cv.position,
                    careerObjective: cv.careerObjective,
                    workExperience: cv.workExperience,
                    education: cv.education,
                    projects: cv.projects,
                    certificates: cv.certificates,
                    activities: cv.activities,
                    awards: cv.awards,
                    skills: cv.skills,
                    skillGroups: cv.revision?.sourceTrace?.skillGroups,
                  },
                },
              }
            : {}),
          careerObjective,
          workExperience,
          education,
          skills,
          projects,
          certificates,
          activities,
          awards,
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
    const result = {
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
    this.logCvGenerationObservation({
      request,
      implementation: reviewResponse.implementation,
      status: result.status,
      reviewStatus: 'NOT_REQUIRED',
      durationMs: Date.now() - startedAt,
      modelCalls: 1,
      toolCalls: 0,
      errorType: null,
    });
    return result;
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

    const warnings = [...(generated.warnings || [])];
    const text = (
      source: string | null | undefined,
      value: string | null | undefined,
    ) => localizedCvText(source, value, locale, warnings);
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
        role: text(source.role, draftText(generatedProject, 'role')),
        startDate: source.startDate,
        endDate: source.endDate,
        description: text(
          source.description,
          draftDescription(
            undefined,
            draftList(generatedProject, 'bullets'),
            draftText(generatedProject, 'description'),
          ),
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
        warnings,
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
      careerObjective: text(
        normalizedProfile.objective,
        generated.career_objective,
      ),
      education: normalizedProfile.education.map((entry, index) => ({
        // Preserve school and dates as proper/canonical facts; localized degree,
        // major and description are accepted when FastAPI returns them.
        schoolName: entry.schoolName,
        degree: text(
          entry.degree,
          draftText(generated.education[index], 'degree'),
        ),
        major: text(
          entry.major,
          draftText(generated.education[index], 'major'),
        ),
        startDate: entry.startDate,
        endDate: entry.endDate,
        description: text(
          entry.description,
          draftText(generated.education[index], 'description'),
        ),
      })),
      workExperience: selectedSourceRows(
        sourceExperiences,
        generated.work_experience,
      ).map(({ source: entry, draft }) => ({
        companyName: entry.companyName,
        position: text(entry.position, draftText(draft, 'position')),
        startDate: entry.startDate,
        endDate: entry.endDate,
        description: text(
          entry.description,
          draftDescription(
            undefined,
            draftList(draft, 'bullets'),
            draftText(draft, 'description'),
          ),
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
          position:
            locale === 'en-US'
              ? text(entry.position, undefined)
              : entry.position,
          startDate: entry.startDate,
          endDate: entry.endDate,
          description: text(entry.description, draftText(localized)),
        };
      }),
      certificates: normalizedProfile.certificates.map((entry, index) => {
        const localized = generated.certificates[index];
        return {
          // Certificate names are displayed as the localized contract value;
          // issuer/date/credential URL remain canonical profile facts.
          name: text(entry.name, draftText(localized)) || '',
          issuer: entry.issuer,
          date: entry.date,
          credentialUrl: entry.credentialUrl,
        };
      }),
      awards: normalizedProfile.awards.map((entry, index) => {
        const localized = generated.awards[index];
        return {
          name:
            locale === 'en-US'
              ? entry.description
                ? 'Award'
                : text(entry.name, draftText(localized)) || 'Award'
              : entry.name,
          issuer: entry.issuer,
          date: entry.date,
          description:
            locale === 'en-US' && !entry.description
              ? null
              : text(entry.description, draftText(localized)),
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

    if (
      locale === 'en-US' &&
      [
        ...sourceExperiences,
        ...sourceProjects,
        ...normalizedProfile.education,
      ].some((entry) => entry.description?.trim()) &&
      ![
        ...(newCvData.workExperience || []),
        ...projectDrafts,
        ...(newCvData.education || []),
      ].some((entry) => entry.description?.trim())
    ) {
      throw new BadGatewayException(
        'AI could not localize the CV narratives; the original profile was not changed',
      );
    }

    if (
      locale === 'en-US' &&
      warnings.some(
        (warning) =>
          warning.includes('localization_omission') ||
          warning.includes('skill_member_locale_omission'),
      )
    ) {
      newCvData.generationSnapshot = {
        ...normalizedProfile,
        localizationRetry: localizationRetry(
          {
            careerObjective: normalizedProfile.objective,
            workExperience: selectedSourceRows(
              sourceExperiences,
              generated.work_experience,
            ).map(({ source }) => source),
            education: normalizedProfile.education,
            projects: selectedSourceRows(
              sourceProjects,
              generated.projects,
            ).map(({ source }) => source),
            certificates: normalizedProfile.certificates,
            activities: normalizedProfile.activities,
            awards: normalizedProfile.awards,
          },
          newCvData as OnlineCV,
          targetCvId ? (pendingGeneration?.expectedContentVersion || 0) + 1 : 1,
          warnings.some((warning) =>
            warning.includes('skill_member_locale_omission'),
          )
            ? candidate.skills.filter(
                (skill) =>
                  !skillGroups(
                    generated.skills,
                    ownedSkillLiterals(candidate),
                    candidate.skills,
                  ).some((group) => group.members.includes(skill)),
              )
            : [],
        ),
      };
    }

    if (reviewResponse.implementation === 'agent') {
      const sourceOnlyPlaceholder: DeepPartial<OnlineCV> = {
        ...newCvData,
        title: job ? `CV - ${applicationPosition || job.name}` : 'Candidate CV',
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
        position: applicationPosition || normalizedProfile.headline,
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
      this.generationRemaining(deadline);
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
              status: warnings.length ? 'DEGRADED' : 'COMPLETE',
              finishedAt: new Date().toISOString(),
              warnings,
            },
          },
        };
        newCvData.contentVersion = current.contentVersion + 1;
        this.generationRemaining(deadline);
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
      this.generationRemaining(deadline);
      return cvRepository.save(cvRepository.create(newCvData));
    };
    const saved = await this.onlineCVRepo.manager.transaction(persist);
    return {
      status: warnings.length ? 'DEGRADED' : 'COMPLETE',
      draft: saved,
      onlineCv: saved,
      warnings,
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
    const input = localizedRetryInput(cv);
    return {
      candidate_id: cv.userId,
      full_name: 'Candidate',
      email: null,
      phone: null,
      link: null,
      address: null,
      headline: cv.position || null,
      career_objective: input.careerObjective || null,
      skills: currentCvSkillLiterals(cv),
      experience: (input.workExperience || []).map((entry) => ({
        company_name: entry.companyName || null,
        position: entry.position || null,
        start_date: entry.startDate || null,
        end_date: entry.endDate || null,
        description: entry.description || null,
      })),
      education: (input.education || []).map((entry) => ({
        school_name: entry.schoolName || null,
        degree: entry.degree || null,
        major: entry.major || null,
        start_date: entry.startDate || null,
        end_date: entry.endDate || null,
        description: entry.description || null,
      })),
      projects: (input.projects || [])
        .filter((entry) => Boolean(entry.projectName))
        .map((entry) => ({
          project_name: entry.projectName,
          role: entry.role || null,
          start_date: entry.startDate || null,
          end_date: entry.endDate || null,
          description: entry.description || null,
          technologies: entry.technologies || [],
        })),
      certificates: (input.certificates || [])
        .map((entry) => (typeof entry === 'string' ? entry : entry?.name || ''))
        .filter(Boolean),
      activities: (input.activities || [])
        .map((entry) =>
          typeof entry === 'string'
            ? entry
            : [entry?.organizationName, entry?.position, entry?.description]
                .filter(Boolean)
                .join(' - '),
        )
        .filter(Boolean),
      awards: (input.awards || [])
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
    const cv = await this.findOne(id, user);
    const metadata = this.generationTrace(cv);
    const regeneration = metadata?.regeneration;
    const isRegeneration = regeneration?.operationId === operationId;
    if (!metadata || (metadata.operationId !== operationId && !isRegeneration))
      throw new NotFoundException('Không tìm thấy yêu cầu tạo CV');
    const pending = cv.generationSnapshot?.pendingDraft;
    if (
      pending?.operationId === operationId &&
      pending.reviewStatus === 'PENDING' &&
      Date.parse(pending.expiresAt) <= Date.now()
    ) {
      await this.expirePendingDraft(cv);
      return this.getGenerationJob(id, operationId, user);
    }
    const currentOperation = isRegeneration
      ? { ...metadata, ...regeneration }
      : metadata;
    if (
      ['QUEUED', 'RUNNING'].includes(currentOperation.status) &&
      Date.now() >=
        Date.parse(currentOperation.createdAt) + CV_GENERATION_TIMEOUT_MS
    ) {
      await this.finishGeneration(
        {
          cvId: id,
          userId: user._id,
          operationId,
          ...(isRegeneration ? { regenerationTarget: regeneration } : {}),
        } as unknown as CvGenerationJobData,
        'FAILED',
        'AI_TIMEOUT',
      );
      return this.getGenerationJob(id, operationId, user);
    }
    return this.operationResponse(currentOperation, cv._id, cv);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async expirePendingGenerationDrafts(): Promise<number> {
    const now = new Date();
    const expired = await this.onlineCVRepo
      .createQueryBuilder('cv')
      .select([
        'cv._id',
        'cv.userId',
        'cv.contentVersion',
        'cv.isDeleted',
        'cv.generationSnapshot',
        'cv.revision',
      ])
      .where('"cv"."isDeleted" = false')
      .andWhere(
        "\"cv\".\"generationSnapshot\"->'pendingDraft'->>'reviewStatus' = 'PENDING'",
      )
      .andWhere(
        '("cv"."generationSnapshot"->\'pendingDraft\'->>\'expiresAt\')::timestamptz <= :now',
        {
          now: now.toISOString(),
        },
      )
      .orderBy(
        '("cv"."generationSnapshot"->\'pendingDraft\'->>\'expiresAt\')::timestamptz',
        'ASC',
      )
      .take(100)
      .getMany();

    let expiredCount = 0;
    for (const cv of expired) {
      if (await this.expirePendingDraft(cv)) expiredCount += 1;
    }
    return expiredCount;
  }

  private async expirePendingDraft(cv: OnlineCV): Promise<boolean> {
    const pending = cv.generationSnapshot?.pendingDraft;
    const metadata = this.generationTrace(cv);
    if (
      !pending ||
      pending.reviewStatus !== 'PENDING' ||
      Date.parse(pending.expiresAt) > Date.now() ||
      !metadata ||
      metadata.operationId !== pending.operationId
    )
      return false;

    const generationSnapshot = { ...(cv.generationSnapshot || {}) };
    delete generationSnapshot.pendingDraft;
    const revision = {
      ...(cv.revision || {}),
      sourceTrace: {
        ...(cv.revision?.sourceTrace || {}),
        generation: { ...metadata, reviewStatus: 'EXPIRED' as const },
      },
    };
    const result = await this.onlineCVRepo.update(
      this.generationWriteCriteria(cv, true),
      { generationSnapshot, revision },
    );
    if (result.affected) {
      cv.generationSnapshot = generationSnapshot;
      cv.revision = revision as OnlineCV['revision'];
      return true;
    }
    return false;
  }

  async cancelGeneration(id: string, operationId: string, user: IUser) {
    const cv = await this.findOne(id, user);
    const metadata = this.generationTrace(cv);
    const regeneration = metadata?.regeneration;
    const isRegeneration = regeneration?.operationId === operationId;
    if (!metadata || (metadata.operationId !== operationId && !isRegeneration))
      throw new NotFoundException('Không tìm thấy yêu cầu tạo CV');
    if (isRegeneration) {
      if (!['QUEUED', 'RUNNING'].includes(regeneration.status))
        return this.operationResponse(
          { ...metadata, ...regeneration },
          cv._id,
          cv,
        );
      const cancelledAttempt = {
        ...regeneration,
        status: 'CANCELLED' as const,
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
              generation: { ...metadata, regeneration: cancelledAttempt },
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
      return this.getGenerationJob(id, operationId, user);
    }
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

  async discardGenerationDraft(
    id: string,
    operationId: string,
    user: IUser,
  ): Promise<void> {
    const cv = await this.findOne(id, user);
    const metadata = this.generationTrace(cv);
    if (!metadata || metadata.operationId !== operationId)
      throw new NotFoundException('Không tìm thấy bản nháp CV');

    const pending = cv.generationSnapshot?.pendingDraft;
    if (!pending) {
      if (
        metadata.reviewStatus === 'REJECTED' ||
        metadata.reviewStatus === 'EXPIRED'
      )
        return;
      throw new ConflictException('Bản nháp CV không còn chờ xem xét');
    }
    if (
      pending.operationId !== operationId ||
      pending.reviewStatus !== 'PENDING' ||
      metadata.reviewStatus !== 'PENDING'
    )
      throw new NotFoundException('Không tìm thấy bản nháp CV');

    const generationSnapshot = { ...(cv.generationSnapshot || {}) };
    delete generationSnapshot.pendingDraft;
    const revision = {
      ...(cv.revision || {}),
      sourceTrace: {
        ...(cv.revision?.sourceTrace || {}),
        generation: { ...metadata, reviewStatus: 'REJECTED' as const },
      },
    };
    const result = await this.onlineCVRepo.update(
      this.generationWriteCriteria(cv, true),
      { generationSnapshot, revision },
    );
    if (!result.affected)
      return this.discardGenerationDraft(id, operationId, user);
  }

  async processGenerationJob(data: CvGenerationJobData): Promise<void> {
    const cv = await this.onlineCVRepo.findOne({
      where: { _id: data.cvId, userId: data.userId, isDeleted: false },
    });
    if (!cv) return;
    const metadata = this.generationTrace(cv);
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
      return this.finishGeneration(data, 'FAILED', 'AI_TIMEOUT');
    }
    if (operationMatches && operationStatus === 'RUNNING') {
      return this.finishGeneration(data, 'FAILED', 'WORKER_INTERRUPTED');
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
      if (data.regenerationTarget) {
        const warnings = await this.generateSelectedCvItem(
          cv,
          user,
          data,
          deadline,
        );
        await this.finishGeneration(
          data,
          warnings.length ? 'DEGRADED' : 'COMPLETE',
          undefined,
          warnings,
        );
        return;
      }
      if (data.kind === 'EXISTING_CV') {
        await this.generate(
          data.cvId,
          { jobId: data.targetJobId || undefined } as GenerateOnlineCvDto,
          user,
          data.operationId,
          this.generationRemaining(deadline),
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
          this.generationRemaining(deadline),
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
        error instanceof GatewayTimeoutException ||
        (error instanceof AiServiceError && error.code === 'AI_SERVICE_TIMEOUT')
      )
        return this.finishGeneration(data, 'FAILED', 'AI_TIMEOUT');
      return this.finishGeneration(data, 'FAILED', 'GENERATION_FAILED');
    }
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
    if (data.regenerationTarget) {
      const attempt = current?.regeneration;
      if (
        !cv ||
        !current ||
        current.operationId !== data.regenerationTarget.reviewOperationId ||
        attempt?.operationId !== data.operationId ||
        attempt.status !== 'QUEUED' ||
        attempt.expectedDraftHash !==
          data.regenerationTarget.expectedDraftHash ||
        attempt.targetPath !== data.regenerationTarget.targetPath
      )
        return false;
      const revision = {
        ...(cv.revision || {}),
        sourceTrace: {
          ...(cv.revision?.sourceTrace || {}),
          generation: {
            ...current,
            regeneration: {
              ...attempt,
              status,
              startedAt: new Date().toISOString(),
            },
          },
        },
      };
      const result = await this.onlineCVRepo.update(
        this.generationWriteCriteria(cv),
        { revision },
      );
      if (result.affected) cv.revision = revision as OnlineCV['revision'];
      return Boolean(result.affected);
    }
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
    const revision = {
      ...(cv.revision || {}),
      sourceTrace: {
        ...(cv.revision?.sourceTrace || {}),
        generation: metadata,
      },
    };
    const result = await this.onlineCVRepo.update(
      this.generationWriteCriteria(cv),
      { revision },
    );
    if (result.affected) cv.revision = revision as OnlineCV['revision'];
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
    if (data.regenerationTarget) {
      const attempt = current?.regeneration;
      if (
        !current ||
        current.operationId !== data.regenerationTarget.reviewOperationId ||
        attempt?.operationId !== data.operationId ||
        !['QUEUED', 'RUNNING'].includes(attempt.status) ||
        attempt.expectedDraftHash !==
          data.regenerationTarget.expectedDraftHash ||
        attempt.targetPath !== data.regenerationTarget.targetPath
      )
        return;
      const regeneration = {
        ...attempt,
        status,
        finishedAt: new Date().toISOString(),
        ...(errorCode ? { errorCode } : {}),
      };
      const revision = {
        ...(cv.revision || {}),
        sourceTrace: {
          ...(cv.revision?.sourceTrace || {}),
          generation: { ...current, regeneration },
        },
      };
      const result = await this.onlineCVRepo.update(
        this.generationWriteCriteria(cv),
        { revision },
      );
      if (result.affected) {
        cv.revision = revision as OnlineCV['revision'];
        this.logGenerationJobObservation(
          data,
          { ...current, regeneration },
          status,
          errorCode,
          cv.revision?.sourceTrace,
        );
      }
      return;
    }
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
    const revision = {
      ...(cv.revision || {}),
      sourceTrace: {
        ...(cv.revision?.sourceTrace || {}),
        generation: metadata,
      },
    };
    const result = await this.onlineCVRepo.update(
      this.generationWriteCriteria(cv),
      { revision },
    );
    if (result.affected) {
      cv.revision = revision as OnlineCV['revision'];
      this.logGenerationJobObservation(
        data,
        metadata,
        status,
        errorCode,
        cv.revision?.sourceTrace,
      );
    }
  }

  private logGenerationJobObservation(
    data: CvGenerationJobData,
    metadata: CvGenerationMetadata,
    status: CvGenerationOperationStatus,
    errorCode?: string,
    sourceTrace?: Record<string, unknown>,
  ): void {
    const regeneration = data.regenerationTarget
      ? metadata.regeneration
      : undefined;
    const operationAttemptId =
      regeneration?.operationId || metadata.operationId;
    const correlationId =
      regeneration?.correlationId ||
      (typeof sourceTrace?.traceId === 'string'
        ? sourceTrace.traceId
        : operationAttemptId);
    const safeErrorType =
      errorCode && /^[A-Z0-9_]{1,48}$/.test(errorCode) ? errorCode : null;
    Logger.log(
      JSON.stringify({
        operation_attempt_id: operationAttemptId,
        request_id:
          regeneration?.requestId ||
          (typeof sourceTrace?.requestId === 'string'
            ? sourceTrace.requestId
            : operationAttemptId),
        trace_id: correlationId,
        correlation_id: correlationId,
        capability_id: 'cv_generation',
        implementation:
          regeneration?.implementation || metadata.implementation || 'legacy',
        status,
        review_status:
          metadata.reviewStatus === 'PENDING'
            ? 'PENDING_REVIEW'
            : metadata.reviewStatus ||
              (status === 'COMPLETE' || status === 'DEGRADED'
                ? 'NOT_REQUIRED'
                : 'FAILED'),
        duration_ms: Math.max(
          0,
          Date.now() -
            Date.parse(regeneration?.createdAt || metadata.createdAt),
        ),
        steps:
          regeneration?.implementation === 'agent' ||
          metadata.implementation === 'agent'
            ? 1
            : 0,
        model_calls: 1,
        tool_calls:
          regeneration?.implementation === 'agent' ||
          metadata.implementation === 'agent'
            ? 1
            : 0,
        error_type: safeErrorType,
      }),
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
