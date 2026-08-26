import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, Between, MoreThanOrEqual } from 'typeorm';
import {
  CandidateAccess,
  CandidateAccessType,
} from './entities/candidate-access.entity';
import { User } from 'src/users/entities/user.entity';
import { OnlineCV } from 'src/online-cvs/entities/online-cv.entity';
import { UserCV } from 'src/usercvs/entities/usercv.entity';
import { Job } from 'src/jobs/entities/job.entity';
import { Company } from 'src/companies/entities/company.entity';
import { UsersService } from 'src/users/users.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import {
  NotificationType,
  NotificationTargetType,
} from 'src/notifications/entities/notification.entity';
import { IUser } from 'src/users/users.interface';
import { SearchCandidatesDto } from './dto/search-candidate.dto';
import { UnlockCandidateDto } from './dto/unlock-candidate.dto';

const FREE_HR_DAILY_CV_LIMIT = 5;

const DOMAIN_DICTIONARY: Record<string, string[]> = {
  IT_SOFTWARE: [
    'it', 'phần mềm', 'software', 'developer', 'frontend', 'backend', 'fullstack',
    'devops', 'engineer', 'react', 'nodejs', 'java', 'spring', 'python', 'golang',
    'php', 'vue', 'angular', 'mobile', 'flutter', 'swift', 'kotlin', 'tester',
    'qa', 'qc', 'database', 'sql', 'postgres', 'aws', 'docker', 'ai', 'data',
  ],
  SALES_BUSINESS: [
    'kinh doanh', 'sales', 'bán hàng', 'tư vấn', 'telesale', 'bất động sản',
    'phát triển thị trường', 'chăm sóc khách hàng', 'cskh', 'account', 'b2b',
    'b2c', 'thương mại', 'sale', 'bảo hiểm', 'tài chính',
  ],
  MARKETING_MEDIA: [
    'marketing', 'digital', 'seo', 'content', 'copywriter', 'social',
    'truyền thông', 'ads', 'quảng cáo', 'facebook ads', 'google ads',
    'pr', 'sự kiện', 'media', 'tiktok', 'branding',
  ],
  FINANCE_ACCOUNTING: [
    'kế toán', 'kiểm toán', 'tài chính', 'thuế', 'ngân hàng', 'thủ quỹ',
    'kế toán tổng hợp', 'kế toán trưởng', 'finance', 'accounting',
  ],
  DESIGN_CREATIVE: [
    'ui/ux', 'design', 'designer', 'thiết kế', 'đồ họa', 'figma',
    'photoshop', 'illustrator', 'video editor', '3d', 'sáng tạo',
  ],
  HR_ADMIN: [
    'nhân sự', 'tuyển dụng', 'hành chính', 'hr', 'c&b', 'tiền lương',
    'headhunter', 'đào tạo', 'pháp chế',
  ],
  LOGISTICS_SUPPLY: [
    'logistics', 'xuất nhập khẩu', 'kho vận', 'supply chain', 'vận tải',
    'giao nhận', 'mua hàng', 'procurement',
  ],
};

function estimateMonths(startStr?: string, endStr?: string): number {
  if (!startStr) return 0;
  const now = new Date();

  const parseDate = (str: string): Date | null => {
    if (!str) return null;
    const clean = str.trim().toLowerCase();
    if (
      ['hiện tại', 'hien tai', 'present', 'now', 'nay', 'đang làm', 'dang lam'].includes(
        clean,
      )
    ) {
      return now;
    }
    const mmYyyy = clean.match(/^(\d{1,2})[\/\-](\d{4})$/);
    if (mmYyyy) {
      const m = parseInt(mmYyyy[1], 10) - 1;
      const y = parseInt(mmYyyy[2], 10);
      return new Date(y, m, 1);
    }
    const yyyyMm = clean.match(/^(\d{4})[\/\-](\d{1,2})$/);
    if (yyyyMm) {
      const y = parseInt(yyyyMm[1], 10);
      const m = parseInt(yyyyMm[2], 10) - 1;
      return new Date(y, m, 1);
    }
    const yyyy = clean.match(/^(\d{4})$/);
    if (yyyy) {
      return new Date(parseInt(yyyy[1], 10), 0, 1);
    }
    const parsed = new Date(str);
    return isNaN(parsed.getTime()) ? null : parsed;
  };

  const startDate = parseDate(startStr);
  const endDate = parseDate(endStr || '') || now;

  if (!startDate || !endDate || endDate < startDate) return 0;

  const yearsDiff = endDate.getFullYear() - startDate.getFullYear();
  const monthsDiff = endDate.getMonth() - startDate.getMonth();
  return Math.max(1, yearsDiff * 12 + monthsDiff);
}

function parseExperienceStats(
  workExperience: any[],
  parsedText?: string,
): { years: number; placesCount: number; summary: string } {
  if (!Array.isArray(workExperience) || workExperience.length === 0) {
    if (parsedText) {
      const match = parsedText.match(
        /(\d{1,2})\s*(năm|year|years)\s*(kinh nghiệm|experience)?/i,
      );
      if (match) {
        const y = parseInt(match[1], 10);
        if (y > 0 && y <= 30) {
          return {
            years: y,
            placesCount: 1,
            summary: `~${y} năm kinh nghiệm`,
          };
        }
      }
    }
    return {
      years: 0,
      placesCount: 0,
      summary: 'Mới tốt nghiệp / Fresher',
    };
  }

  let totalMonths = 0;
  const placesCount = workExperience.length;

  for (const exp of workExperience) {
    if (typeof exp === 'object' && exp !== null) {
      const start = exp.startDate;
      const end = exp.endDate;
      const months = estimateMonths(start, end);
      if (months > 0) {
        totalMonths += months;
      }
    } else if (typeof exp === 'string') {
      const match = exp.match(/(\d{1,2})\s*(năm|year|years)/i);
      if (match) {
        totalMonths += parseInt(match[1], 10) * 12;
      }
    }
  }

  const computedYears =
    totalMonths > 0 ? Math.round((totalMonths / 12) * 10) / 10 : 0;

  let summary = '';
  if (computedYears >= 1) {
    summary = `${computedYears} năm KN (${placesCount} nơi từng làm)`;
  } else if (computedYears > 0) {
    summary = `${Math.round(totalMonths)} tháng KN (${placesCount} nơi từng làm)`;
  } else {
    summary = `Đã làm việc tại ${placesCount} nơi`;
  }

  return { years: computedYears, placesCount, summary };
}

export function extractCandidateSkills(skillsData: any): string[] {
  if (!Array.isArray(skillsData) || skillsData.length === 0) {
    return [];
  }

  const GENERIC_SKILL_HEADERS = new Set([
    'tên kỹ năng',
    'kỹ năng',
    'kĩ năng',
    'kỹ năng chuyên môn',
    'kỹ năng mềm',
    'kỹ năng khác',
    'kỹ năng chính',
    'kỹ năng phụ',
    'mô tả kỹ năng',
    'mức độ thành thạo',
    'chi tiết',
    'skill',
    'skills',
    'skill name',
    'skill description',
    'technical skills',
    'professional skills',
    'soft skills',
    'hard skills',
    'other skills',
    'competencies',
    'tools & technologies',
  ]);

  const PROFICIENCY_NOISE = new Set([
    'thành thạo',
    'cơ bản',
    'nâng cao',
    'chuyên sâu',
    'tốt',
    'khá',
    'xuất sắc',
    'mới bắt đầu',
    'đang học',
    'mức độ thành thạo',
    'mô tả kỹ năng',
    'chi tiết',
    'beginner',
    'intermediate',
    'advanced',
    'expert',
    'proficient',
    'good',
    'fluent',
    'basic',
    'senior',
    'junior',
  ]);

  const extracted: string[] = [];
  const seenLower = new Set<string>();

  const addSkill = (raw: string) => {
    if (!raw) return;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length < 2 || trimmed.length > 50) return;
    const lower = trimmed.toLowerCase();

    // Skip generic placeholder words or proficiency ratings
    if (GENERIC_SKILL_HEADERS.has(lower) || PROFICIENCY_NOISE.has(lower)) {
      return;
    }
    // Skip duration text (e.g. "2 năm", "3 years", "6 tháng")
    if (/^\d+\s*(năm|tháng|year|years|month|months)/i.test(trimmed)) {
      return;
    }

    if (!seenLower.has(lower)) {
      seenLower.add(lower);
      extracted.push(trimmed);
    }
  };

  for (const item of skillsData) {
    if (typeof item === 'string') {
      const tokens = item.split(/[,;\/•|\n]+/).map((t) => t.trim()).filter(Boolean);
      if (tokens.length > 1) {
        tokens.forEach(addSkill);
      } else {
        addSkill(item);
      }
    } else if (typeof item === 'object' && item !== null) {
      const name = (item.name || '').trim();
      const desc = (item.description || '').trim();
      const nameLower = name.toLowerCase();

      // Check if description has comma/semicolon/bullet-separated skills
      const descTokens = desc
        .split(/[,;\/•|\n]+/)
        .map((t) => t.trim())
        .filter(Boolean);

      const hasMultipleDescSkills = descTokens.length > 1;

      // If name is NOT a generic placeholder/header, add it
      if (name && !GENERIC_SKILL_HEADERS.has(nameLower)) {
        addSkill(name);
      }

      // If description contains skills, extract tokens
      if (desc) {
        if (hasMultipleDescSkills) {
          descTokens.forEach(addSkill);
        } else {
          const descLower = desc.toLowerCase();
          if (
            !PROFICIENCY_NOISE.has(descLower) &&
            !/^\d+\s*(năm|tháng|year|years|month|months)/i.test(desc)
          ) {
            addSkill(desc);
          }
        }
      }
    }
  }

  return extracted;
}

@Injectable()
export class CandidateAccessService {
  private readonly logger = new Logger(CandidateAccessService.name);

  constructor(
    @InjectRepository(CandidateAccess)
    private readonly candidateAccessRepo: Repository<CandidateAccess>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(OnlineCV)
    private readonly onlineCVRepo: Repository<OnlineCV>,
    @InjectRepository(UserCV)
    private readonly userCVRepo: Repository<UserCV>,
    @InjectRepository(Job)
    private readonly jobRepo: Repository<Job>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Helper calculate Vietnam UTC+7 date range [startOfDay, endOfDay]
   */
  private getUtc7DayRange(): { startOfDay: Date; endOfDay: Date } {
    const now = new Date();
    const utc7OffsetMs = 7 * 60 * 60 * 1000;
    const nowUtc7 = new Date(now.getTime() + utc7OffsetMs);

    const startOfDayUtc7 = new Date(
      Date.UTC(
        nowUtc7.getUTCFullYear(),
        nowUtc7.getUTCMonth(),
        nowUtc7.getUTCDate(),
        0,
        0,
        0,
        0,
      ) - utc7OffsetMs,
    );

    const endOfDayUtc7 = new Date(
      startOfDayUtc7.getTime() + 24 * 60 * 60 * 1000 - 1,
    );

    return { startOfDay: startOfDayUtc7, endOfDay: endOfDayUtc7 };
  }

  /**
   * Extract company recruitment profile & field keywords to personalize CV search
   */
  private async getCompanyRecruitmentProfile(hrUserId: string) {
    const hrUser = await this.userRepo.findOne({ where: { _id: hrUserId } });
    if (!hrUser || !hrUser.company || !hrUser.company._id) return null;

    const companyId = hrUser.company._id;
    const company = await this.companyRepo.findOne({ where: { _id: companyId } });
    const companyJobs = await this.jobRepo.find({
      where: { isDeleted: false },
    });

    // Filter jobs belonging to this company
    const myCompanyJobs = companyJobs.filter(
      (j) => j.company && j.company._id && String(j.company._id) === String(companyId),
    );

    const targetSkills: string[] = [];
    const targetJobTitles: string[] = [];
    const rawKeywords: string[] = [];

    if (company?.name) rawKeywords.push(company.name.toLowerCase());
    if (company?.description) rawKeywords.push(company.description.toLowerCase());

    for (const job of myCompanyJobs) {
      if (job.name) {
        targetJobTitles.push(job.name.toLowerCase());
        rawKeywords.push(job.name.toLowerCase());
      }
      if (Array.isArray(job.skills)) {
        job.skills.forEach((s) => {
          if (s) {
            targetSkills.push(s.toLowerCase());
            rawKeywords.push(s.toLowerCase());
          }
        });
      }
      if (job.description) {
        rawKeywords.push(job.description.toLowerCase());
      }
    }

    const combinedText = rawKeywords.join(' ');
    const industryDomains: string[] = [];

    for (const [domainKey, domainKeywords] of Object.entries(DOMAIN_DICTIONARY)) {
      const matchCount = domainKeywords.filter((kw) =>
        combinedText.includes(kw),
      ).length;
      if (matchCount >= 2) {
        industryDomains.push(domainKey);
      }
    }

    return {
      companyName: company?.name || hrUser.company.name || 'Công ty',
      industryDomains,
      targetSkills: Array.from(new Set(targetSkills)),
      targetJobTitles: Array.from(new Set(targetJobTitles)),
      rawKeywords,
      jobCount: myCompanyJobs.length,
    };
  }

  /**
   * Calculate relevance match score between candidate and HR's company profile
   */
  private calculateCompanyMatch(
    candidateSkills: string[],
    candidateTitle: string,
    candidateObjective: string,
    companyProfile: any,
  ): { score: number; isRecommended: boolean; reason?: string } {
    if (!companyProfile) {
      return { score: 0, isRecommended: false };
    }

    let score = 0;
    const matchedSkills: string[] = [];
    const lowerCandSkills = candidateSkills.map((s) => s.toLowerCase());
    const lowerCandTitle = (candidateTitle || '').toLowerCase();
    const lowerCandObjective = (candidateObjective || '').toLowerCase();

    // 1. Skill Match with company jobs (+15 pts per match)
    for (const cSkill of companyProfile.targetSkills) {
      if (
        lowerCandSkills.some(
          (sk) => sk.includes(cSkill) || cSkill.includes(sk),
        )
      ) {
        matchedSkills.push(cSkill);
        score += 15;
        if (score >= 45) break;
      }
    }

    // 2. Job Title Similarity (+25 pts)
    for (const cTitle of companyProfile.targetJobTitles) {
      const titleWords = cTitle.split(/\s+/).filter((w) => w.length > 2);
      if (titleWords.some((w) => lowerCandTitle.includes(w))) {
        score += 25;
        break;
      }
    }

    // 3. Domain Alignment (+25 pts)
    const candText = `${lowerCandTitle} ${lowerCandSkills.join(' ')} ${lowerCandObjective}`;
    let matchedDomainName = '';

    for (const domain of companyProfile.industryDomains) {
      const domainKeywords = DOMAIN_DICTIONARY[domain] || [];
      const hits = domainKeywords.filter((kw) => candText.includes(kw)).length;
      if (hits >= 2) {
        score += 25;
        if (domain === 'IT_SOFTWARE') matchedDomainName = 'Công nghệ / IT';
        else if (domain === 'SALES_BUSINESS')
          matchedDomainName = 'Kinh doanh / Bán hàng';
        else if (domain === 'MARKETING_MEDIA')
          matchedDomainName = 'Marketing / Truyền thông';
        else if (domain === 'FINANCE_ACCOUNTING')
          matchedDomainName = 'Tài chính / Kế toán';
        else if (domain === 'DESIGN_CREATIVE')
          matchedDomainName = 'Thiết kế / UI-UX';
        else if (domain === 'HR_ADMIN') matchedDomainName = 'Nhân sự / Hành chính';
        break;
      }
    }

    score = Math.min(100, score);
    const isRecommended = score >= 30;

    let reason = '';
    if (isRecommended) {
      if (matchedSkills.length > 0) {
        reason = `🎯 Khớp ${score}% kỹ năng (${matchedSkills.slice(0, 2).join(', ')})`;
      } else if (matchedDomainName) {
        reason = `✨ Phù hợp lĩnh vực ${matchedDomainName}`;
      } else {
        reason = `🎯 ${score}% phù hợp định hướng tuyển dụng`;
      }
    }

    return { score, isRecommended, reason };
  }

  /**
   * 1. Search Candidates with STRICT privacy preservation & Company-based Personalization.
   * Returns ONLY public profile data.
   * NEVER returns email, phone, cvUrl, pdfUrl, htmlContent, parsedText.
   */
  async searchCandidates(dto: SearchCandidatesDto, hrUser: IUser) {
    const keyword = dto.keyword?.trim() || '';
    const skillsKeyword = dto.skills?.trim() || '';
    const locationKeyword = dto.location?.trim() || '';
    const current = Math.max(1, Number(dto.current) || 1);
    const pageSize = Math.max(1, Math.min(50, Number(dto.pageSize) || 20));

    const now = new Date();

    // 1.0 Retrieve HR's Company Profile for smart personalized ranking
    const companyProfile = await this.getCompanyRecruitmentProfile(hrUser._id);

    // 1.1 Query Online CVs (Publicly searchable)
    const onlineQueryBuilder = this.onlineCVRepo
      .createQueryBuilder('cv')
      .innerJoinAndSelect('cv.user', 'user')
      .where('cv.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('cv.isSearchable = :isSearchable', { isSearchable: true })
      .andWhere('user.isDeleted = :userNotDeleted', { userNotDeleted: false })
      .andWhere('user.allowRecruiterSearch = :allowRecruiterSearch', {
        allowRecruiterSearch: true,
      })
      .andWhere('user.isJobSeeking = :isJobSeeking', { isJobSeeking: true });

    if (keyword) {
      onlineQueryBuilder.andWhere(
        '(cv.fullName ILIKE :kw OR cv.position ILIKE :kw OR cv.title ILIKE :kw OR cv.careerObjective ILIKE :kw OR user.name ILIKE :kw)',
        { kw: `%${keyword}%` },
      );
    }

    if (skillsKeyword) {
      const skillTokens = skillsKeyword
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (skillTokens.length > 0) {
        const skillConds = skillTokens.map(
          (sk, idx) =>
            `(cv.skills::text ILIKE :online_sk_${idx} OR cv.careerObjective ILIKE :online_sk_${idx} OR cv.position ILIKE :online_sk_${idx} OR cv.title ILIKE :online_sk_${idx})`,
        );
        const params: Record<string, string> = {};
        skillTokens.forEach((sk, idx) => {
          params[`online_sk_${idx}`] = `%${sk}%`;
        });
        onlineQueryBuilder.andWhere(`(${skillConds.join(' OR ')})`, params);
      }
    }

    if (locationKeyword) {
      onlineQueryBuilder.andWhere(
        '(cv.address ILIKE :loc OR user.address ILIKE :loc)',
        { loc: `%${locationKeyword}%` },
      );
    }

    const onlineCvs = await onlineQueryBuilder.getMany();

    // 1.2 Query Uploaded CVs (Publicly searchable)
    const userCvQueryBuilder = this.userCVRepo
      .createQueryBuilder('cv')
      .innerJoinAndSelect('cv.user', 'user')
      .where('cv.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('cv.isSearchable = :isSearchable', { isSearchable: true })
      .andWhere('user.isDeleted = :userNotDeleted', { userNotDeleted: false })
      .andWhere('user.allowRecruiterSearch = :allowRecruiterSearch', {
        allowRecruiterSearch: true,
      })
      .andWhere('user.isJobSeeking = :isJobSeeking', { isJobSeeking: true });

    if (keyword) {
      userCvQueryBuilder.andWhere(
        '(cv.title ILIKE :kw OR cv.description ILIKE :kw OR cv.parsedText ILIKE :kw OR user.name ILIKE :kw)',
        { kw: `%${keyword}%` },
      );
    }

    if (skillsKeyword) {
      const skillTokens = skillsKeyword
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (skillTokens.length > 0) {
        const skillConds = skillTokens.map(
          (sk, idx) =>
            `(EXISTS (SELECT 1 FROM unnest(cv.skills) s WHERE s ILIKE :user_sk_${idx}) OR cv.parsedText ILIKE :user_sk_${idx})`,
        );
        const params: Record<string, string> = {};
        skillTokens.forEach((sk, idx) => {
          params[`user_sk_${idx}`] = `%${sk}%`;
        });
        userCvQueryBuilder.andWhere(`(${skillConds.join(' OR ')})`, params);
      }
    }

    if (locationKeyword) {
      userCvQueryBuilder.andWhere(
        '(user.address ILIKE :loc OR cv.parsedText ILIKE :loc)',
        { loc: `%${locationKeyword}%` },
      );
    }

    const uploadedCvs = await userCvQueryBuilder.getMany();

    // 1.3 Fetch HR unlock history
    const hrUnlocks = await this.candidateAccessRepo.find({
      where: { hrUserId: hrUser._id },
    });
    const unlockedOnlineCvIds = new Set(
      hrUnlocks
        .filter((u) => u.onlineCvId)
        .map((u) => `${u.candidateUserId}_${u.onlineCvId}`),
    );
    const unlockedUserCvIds = new Set(
      hrUnlocks
        .filter((u) => u.userCvId)
        .map((u) => `${u.candidateUserId}_${u.userCvId}`),
    );

    // 1.4 Map to sanitized public profile data & compute experience and personalization match
    const publicResults: any[] = [];

    for (const cv of onlineCvs) {
      const candidate = cv.user;
      if (!candidate) continue;

      const isBoosted = Boolean(
        candidate.boostExpiresAt && new Date(candidate.boostExpiresAt) > now,
      );
      const isUnlocked = unlockedOnlineCvIds.has(`${candidate._id}_${cv._id}`);

      const skills = extractCandidateSkills(cv.skills);

      const expStats = parseExperienceStats(cv.workExperience || []);
      const title = cv.position || cv.title || 'Ứng viên tiềm năng';

      const match = this.calculateCompanyMatch(
        skills,
        title,
        cv.careerObjective || '',
        companyProfile,
      );

      publicResults.push({
        candidateUserId: candidate._id,
        name: cv.fullName || candidate.name || 'Ứng viên',
        avatar: candidate.avatar || cv.avatar || null,
        title,
        skills,
        location: cv.address || candidate.address || 'Toàn quốc',
        experienceYears: expStats.years,
        experiencePlacesCount: expStats.placesCount,
        experienceSummary: expStats.summary,
        companyMatchScore: match.score,
        isRecommendedForCompany: match.isRecommended,
        recommendationReason: match.reason,
        cvType: CandidateAccessType.ONLINE_CV,
        cvId: cv._id,
        isVerified: Boolean(candidate.isVerified),
        isPremium: Boolean(candidate.isPremium),
        isBoosted,
        canUnlock: true,
        isUnlocked,
        createdAt: cv.createdAt,
      });
    }

    for (const cv of uploadedCvs) {
      const candidate = cv.user;
      if (!candidate) continue;

      const isBoosted = Boolean(
        candidate.boostExpiresAt && new Date(candidate.boostExpiresAt) > now,
      );
      const isUnlocked = unlockedUserCvIds.has(`${candidate._id}_${cv._id}`);

      const skills = extractCandidateSkills(cv.skills);
      const expStats = parseExperienceStats(
        cv.experience || [],
        cv.parsedText || '',
      );
      const title = cv.title || 'Hồ sơ CV đính kèm';

      const match = this.calculateCompanyMatch(
        skills,
        title,
        cv.description || '',
        companyProfile,
      );

      publicResults.push({
        candidateUserId: candidate._id,
        name: candidate.name || 'Ứng viên',
        avatar: candidate.avatar || null,
        title,
        skills,
        location: candidate.address || 'Toàn quốc',
        experienceYears: expStats.years,
        experiencePlacesCount: expStats.placesCount,
        experienceSummary: expStats.summary,
        companyMatchScore: match.score,
        isRecommendedForCompany: match.isRecommended,
        recommendationReason: match.reason,
        cvType: CandidateAccessType.UPLOADED_CV,
        cvId: cv._id,
        isVerified: Boolean(candidate.isVerified),
        isPremium: Boolean(candidate.isPremium),
        isBoosted,
        canUnlock: true,
        isUnlocked,
        createdAt: cv.createdAt,
      });
    }

    // 1.5 Sort: Boosted First -> Company Relevance Match Score DESC -> Candidate Premium -> Newest
    publicResults.sort((a, b) => {
      if (a.isBoosted && !b.isBoosted) return -1;
      if (!a.isBoosted && b.isBoosted) return 1;
      if ((b.companyMatchScore || 0) !== (a.companyMatchScore || 0)) {
        return (b.companyMatchScore || 0) - (a.companyMatchScore || 0);
      }
      if (a.isPremium && !b.isPremium) return -1;
      if (!a.isPremium && b.isPremium) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const total = publicResults.length;
    const totalPages = Math.ceil(total / pageSize);
    const startIndex = (current - 1) * pageSize;
    const paginatedResult = publicResults.slice(
      startIndex,
      startIndex + pageSize,
    );

    return {
      meta: {
        current,
        pageSize,
        pages: totalPages,
        total,
        companyField: companyProfile?.industryDomains?.[0] || undefined,
        hasCompanyJobs: companyProfile ? companyProfile.jobCount > 0 : false,
        companyJobCount: companyProfile ? companyProfile.jobCount : 0,
        companyName: companyProfile?.companyName,
      },
      result: paginatedResult,
    };
  }

  /**
   * 2. Unlock Candidate Profile & CV.
   * Concurrency-safe with PostgreSQL Transaction + Advisory Lock.
   * Enforces 5 CV/day limit for free HR in UTC+7 timezone.
   */
  async unlockCandidate(
    candidateUserId: string,
    dto: UnlockCandidateDto,
    hrUser: IUser,
  ) {
    return await this.dataSource.transaction(async (manager) => {
      // 2.1 Acquire Postgres Advisory Lock per HR User to prevent race condition
      await manager.query(
        `SELECT pg_advisory_xact_lock(hashtext('hr_cv_unlock_' || $1))`,
        [hrUser._id],
      );

      // 2.2 Cross-validate Candidate User
      const candidate = await manager.findOne(User, {
        where: {
          _id: candidateUserId,
          isDeleted: false,
          allowRecruiterSearch: true,
        },
      });

      if (!candidate) {
        throw new NotFoundException(
          'Không tìm thấy ứng viên hoặc ứng viên không cho phép Nhà Tuyển Dụng tìm kiếm',
        );
      }

      // 2.3 Cross-validate CV existence & ownership
      let onlineCv: OnlineCV | null = null;
      let userCv: UserCV | null = null;

      if (dto.cvType === CandidateAccessType.ONLINE_CV) {
        onlineCv = await manager.findOne(OnlineCV, {
          where: {
            _id: dto.cvId,
            userId: candidateUserId,
            isDeleted: false,
            isSearchable: true,
          },
        });

        if (!onlineCv) {
          throw new NotFoundException(
            'CV online không tồn tại hoặc không thuộc về ứng viên này',
          );
        }
      } else if (dto.cvType === CandidateAccessType.UPLOADED_CV) {
        userCv = await manager.findOne(UserCV, {
          where: {
            _id: dto.cvId,
            userId: candidateUserId,
            isDeleted: false,
            isSearchable: true,
          },
        });

        if (!userCv) {
          throw new NotFoundException(
            'File CV không tồn tại hoặc không thuộc về ứng viên này',
          );
        }
      } else {
        throw new BadRequestException('Loại CV không hợp lệ');
      }

      // 2.4 Check if HR has already unlocked this distinct CV
      const existingAccess = await manager.findOne(CandidateAccess, {
        where: {
          hrUserId: hrUser._id,
          candidateUserId,
          ...(dto.cvType === CandidateAccessType.ONLINE_CV
            ? { onlineCvId: dto.cvId }
            : { userCvId: dto.cvId }),
        },
      });

      let isNewUnlock = false;

      if (!existingAccess) {
        // 2.5 Check HR Premium status
        const hrUserRecord = await manager.findOne(User, {
          where: { _id: hrUser._id },
        });

        const isHrPremium = this.usersService.isHrPremium(hrUserRecord);

        if (!isHrPremium) {
          const { startOfDay, endOfDay } = this.getUtc7DayRange();

          const todayUnlocksCount = await manager.count(CandidateAccess, {
            where: {
              hrUserId: hrUser._id,
              accessedAt: Between(startOfDay, endOfDay),
            },
          });

          if (todayUnlocksCount >= FREE_HR_DAILY_CV_LIMIT) {
            throw new ForbiddenException(
              `Bạn đã sử dụng hết hạn mức ${FREE_HR_DAILY_CV_LIMIT} lượt mở khóa/tải CV miễn phí trong ngày hôm nay (theo giờ Việt Nam UTC+7). Hãy nâng cấp tài khoản lên HR Premium để mở khóa không giới hạn!`,
            );
          }
        }

        // 2.6 Save CandidateAccess record (atomically consume 1 credit)
        const newAccess = manager.create(CandidateAccess, {
          hrUserId: hrUser._id,
          candidateUserId,
          onlineCvId:
            dto.cvType === CandidateAccessType.ONLINE_CV ? dto.cvId : null,
          userCvId:
            dto.cvType === CandidateAccessType.UPLOADED_CV ? dto.cvId : null,
          accessType: dto.cvType,
          accessedAt: new Date(),
        });

        await manager.save(newAccess);
        isNewUnlock = true;

        // Dispatch real-time notification to the candidate
        try {
          const hrUserRecord = await manager.findOne(User, {
            where: { _id: hrUser._id },
          });
          const hrName = hrUserRecord?.name || hrUser.name || 'Nhà tuyển dụng';
          const companyName =
            hrUserRecord?.company?.name || hrUser.company?.name || 'Doanh nghiệp tuyển dụng';
          const companyId = hrUserRecord?.company?._id || hrUser.company?._id;

          await this.notificationsService.create({
            userId: candidateUserId,
            title: '🏢 Nhà tuyển dụng vừa xem hồ sơ CV của bạn',
            content: `${hrName} từ ${companyName} vừa mở khóa và xem chi tiết hồ sơ CV của bạn.`,
            type: NotificationType.RESUME,
            targetType: NotificationTargetType.COMPANY,
            targetId: companyId,
            data: {
              hrName,
              companyName,
              companyId,
              cvType: dto.cvType,
              cvId: dto.cvId,
              accessedAt: new Date().toISOString(),
            },
          });
        } catch (notifErr) {
          this.logger.error('Failed to dispatch candidate unlock notification', notifErr);
        }
      }

      // 2.7 Return full candidate info & CV data
      if (dto.cvType === CandidateAccessType.ONLINE_CV && onlineCv) {
        return {
          isNewUnlock,
          candidate: {
            _id: candidate._id,
            name: onlineCv.fullName || candidate.name,
            email: onlineCv.email || candidate.email,
            phone: onlineCv.phone || candidate.gender || 'Chưa cập nhật',
            address: onlineCv.address || candidate.address || 'Chưa cập nhật',
            avatar: onlineCv.avatar || candidate.avatar || null,
          },
          cv: {
            _id: onlineCv._id,
            type: CandidateAccessType.ONLINE_CV,
            title: onlineCv.title || onlineCv.position || 'CV Trực Tuyến',
            position: onlineCv.position,
            templateType: onlineCv.templateType,
            phone: onlineCv.phone,
            email: onlineCv.email,
            link: onlineCv.link,
            address: onlineCv.address,
            careerObjective: onlineCv.careerObjective,
            education: onlineCv.education || [],
            workExperience: onlineCv.workExperience || [],
            skills: onlineCv.skills || [],
            activities: onlineCv.activities || [],
            certificates: onlineCv.certificates || [],
            awards: onlineCv.awards || [],
            pdfUrl: onlineCv.pdfUrl || null,
          },
          message: isNewUnlock
            ? 'Mở khóa thông tin liên lạc và CV ứng viên thành công'
            : 'Bạn đã mở khóa CV này trước đó (không tốn thêm lượt)',
        };
      }

      if (dto.cvType === CandidateAccessType.UPLOADED_CV && userCv) {
        return {
          isNewUnlock,
          candidate: {
            _id: candidate._id,
            name: candidate.name,
            email: candidate.email,
            phone: candidate.gender || 'Chưa cập nhật',
            address: candidate.address || 'Chưa cập nhật',
            avatar: candidate.avatar || null,
          },
          cv: {
            _id: userCv._id,
            type: CandidateAccessType.UPLOADED_CV,
            title: userCv.title || 'CV Đính kèm',
            fileType: userCv.fileType,
            downloadUrl: userCv.url,
            skills: userCv.skills || [],
            education: userCv.education || [],
            experience: userCv.experience || [],
            certificates: userCv.certificates || [],
          },
          message: isNewUnlock
            ? 'Mở khóa và cấp link tải CV ứng viên thành công'
            : 'Bạn đã mở khóa CV này trước đó (không tốn thêm lượt)',
        };
      }
    });
  }

  /**
   * 3. Get HR Daily Quota status (in UTC+7)
   */
  async getDailyQuota(hrUser: IUser) {
    const hrUserRecord = await this.userRepo.findOne({
      where: { _id: hrUser._id },
    });

    const isHrPremium = this.usersService.isHrPremium(hrUserRecord);

    if (isHrPremium) {
      return {
        usedToday: 0,
        limit: 999999,
        remaining: 999999,
        isUnlimited: true,
        timezone: 'Asia/Ho_Chi_Minh (UTC+7)',
      };
    }

    const { startOfDay, endOfDay } = this.getUtc7DayRange();

    const usedToday = await this.candidateAccessRepo.count({
      where: {
        hrUserId: hrUser._id,
        accessedAt: Between(startOfDay, endOfDay),
      },
    });

    const limit = FREE_HR_DAILY_CV_LIMIT;
    const remaining = Math.max(0, limit - usedToday);

    return {
      usedToday,
      limit,
      remaining,
      isUnlimited: false,
      timezone: 'Asia/Ho_Chi_Minh (UTC+7)',
    };
  }

  /**
   * 4. Get HR Unlocked Candidates History
   */
  async getMyUnlocks(hrUser: IUser, current = 1, pageSize = 20) {
    const skip = (current - 1) * pageSize;

    const [accesses, total] = await this.candidateAccessRepo.findAndCount({
      where: { hrUserId: hrUser._id },
      relations: ['candidateUser'],
      order: { accessedAt: 'DESC' },
      skip,
      take: pageSize,
    });

    const enrichedResults = await Promise.all(
      accesses.map(async (acc) => {
        let cvInfo: any = null;

        if (acc.accessType === CandidateAccessType.ONLINE_CV && acc.onlineCvId) {
          const cv = await this.onlineCVRepo.findOne({
            where: { _id: acc.onlineCvId },
          });
          if (cv) {
            cvInfo = {
              _id: cv._id,
              title: cv.title || cv.position || 'CV Online',
              pdfUrl: cv.pdfUrl,
              templateType: cv.templateType,
              skills: cv.skills,
            };
          }
        } else if (
          acc.accessType === CandidateAccessType.UPLOADED_CV &&
          acc.userCvId
        ) {
          const cv = await this.userCVRepo.findOne({
            where: { _id: acc.userCvId },
          });
          if (cv) {
            cvInfo = {
              _id: cv._id,
              title: cv.title || 'CV Đính kèm',
              downloadUrl: cv.url,
              fileType: cv.fileType,
              skills: cv.skills,
            };
          }
        }

        return {
          _id: acc._id,
          accessType: acc.accessType,
          accessedAt: acc.accessedAt,
          candidate: acc.candidateUser
            ? {
                _id: acc.candidateUser._id,
                name: acc.candidateUser.name,
                email: acc.candidateUser.email,
                avatar: acc.candidateUser.avatar,
                address: acc.candidateUser.address,
              }
            : null,
          cv: cvInfo,
        };
      }),
    );

    return {
      meta: {
        current,
        pageSize,
        pages: Math.ceil(total / pageSize),
        total,
      },
      result: enrichedResults,
    };
  }

  /**
   * 5. Get Employers who have viewed/unlocked Candidate's CV
   */
  async getCandidateEmployerViews(
    candidateUser: IUser,
    current = 1,
    pageSize = 20,
  ) {
    const skip = (current - 1) * pageSize;
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [accesses, total] = await this.candidateAccessRepo.findAndCount({
      where: { candidateUserId: candidateUser._id },
      relations: ['hrUser'],
      order: { accessedAt: 'DESC' },
      skip,
      take: pageSize,
    });

    const viewsThisWeek = await this.candidateAccessRepo.count({
      where: {
        candidateUserId: candidateUser._id,
        accessedAt: MoreThanOrEqual(oneWeekAgo),
      },
    });

    const viewsThisMonth = await this.candidateAccessRepo.count({
      where: {
        candidateUserId: candidateUser._id,
        accessedAt: MoreThanOrEqual(oneMonthAgo),
      },
    });

    const onlineCvCount = await this.onlineCVRepo.count({
      where: {
        userId: candidateUser._id,
        isSearchable: true,
        isDeleted: false,
      },
    });

    const userCvCount = await this.userCVRepo.count({
      where: {
        userId: candidateUser._id,
        isSearchable: true,
        isDeleted: false,
      },
    });

    const searchableCvCount = onlineCvCount + userCvCount;

    const enrichedViews = await Promise.all(
      accesses.map(async (acc) => {
        let companyInfo: any = null;
        const hrUser = acc.hrUser;

        if (hrUser?.company?._id) {
          const company = await this.companyRepo.findOne({
            where: { _id: hrUser.company._id },
          });
          if (company) {
            companyInfo = {
              _id: company._id,
              name: company.name,
              logo: company.logo || null,
              address: company.address || null,
              scale: company.scale || null,
              description: company.description || null,
            };
          }
        }

        let cvInfo: any = null;
        if (
          acc.accessType === CandidateAccessType.ONLINE_CV &&
          acc.onlineCvId
        ) {
          const cv = await this.onlineCVRepo.findOne({
            where: { _id: acc.onlineCvId },
          });
          if (cv) {
            cvInfo = {
              _id: cv._id,
              title: cv.title || cv.position || 'CV Online trực tuyến',
              templateType: cv.templateType,
            };
          }
        } else if (
          acc.accessType === CandidateAccessType.UPLOADED_CV &&
          acc.userCvId
        ) {
          const cv = await this.userCVRepo.findOne({
            where: { _id: acc.userCvId },
          });
          if (cv) {
            cvInfo = {
              _id: cv._id,
              title: cv.title || 'File CV đính kèm (PDF)',
              fileType: cv.fileType || 'PDF',
            };
          }
        }

        return {
          _id: acc._id,
          accessType: acc.accessType,
          accessedAt: acc.accessedAt,
          hr: hrUser
            ? {
                _id: hrUser._id,
                name: hrUser.name || 'Nhà tuyển dụng',
                avatar: hrUser.avatar || null,
                roleTitle: 'Bộ phận tuyển dụng',
              }
            : null,
          company: companyInfo || {
            _id: hrUser?.company?._id || 'unknown',
            name: hrUser?.company?.name || 'Doanh nghiệp tuyển dụng',
            logo: null,
            address: 'Toàn quốc',
          },
          cv: cvInfo || {
            title: 'Hồ sơ CV ứng viên',
            type: acc.accessType,
          },
        };
      }),
    );

    return {
      stats: {
        viewsThisWeek,
        viewsThisMonth,
        totalViews: total,
        searchableCvCount,
      },
      meta: {
        current,
        pageSize,
        pages: Math.ceil(total / pageSize),
        total,
      },
      result: enrichedViews,
    };
  }
}
