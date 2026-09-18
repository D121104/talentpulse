import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnlineCV } from './entities/online-cv.entity';
import { User } from 'src/users/entities/user.entity';
import { UsersService } from 'src/users/users.service';
import { IUser } from 'src/users/users.interface';
import { CreateOnlineCVDto } from './dto/create-online-cv.dto';
import { UpdateOnlineCVDto } from './dto/update-online-cv.dto';
import { FilesService } from 'src/files/files.service';
import * as Handlebars from 'handlebars';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

import { RedisService } from 'src/redis/redis.service';

// Dynamic import for puppeteer
let puppeteer: any;

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

    const { htmlContent, ...dataToSave } = createOnlineCVDto;
    const newCV = this.onlineCVRepo.create({
      ...dataToSave,
      isPrimary,
      htmlContent,
      userId: user._id,
      createdBy: {
        _id: user._id,
        email: user.email,
      },
    });

    const savedCV = await this.onlineCVRepo.save(newCV);
    await this.invalidateUserCvSkillsCache(user._id);

    // If htmlContent is provided, generate PDF & upload to Cloudinary
    try {
      await this.exportToPdf(savedCV._id, user, htmlContent);
    } catch (err) {
      Logger.error('Auto PDF generation on create failed:', err);
    }

    return await this.findOne(savedCV._id, user);
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

    const { htmlContent, ...dataToSave } = updateOnlineCVDto;

    await this.onlineCVRepo.update(id, {
      ...dataToSave,
      htmlContent,
      updatedBy: {
        _id: user._id,
        email: user.email,
      },
    });

    await this.invalidateUserCvSkillsCache(user._id);

    // Auto update PDF & upload to Cloudinary
    try {
      await this.exportToPdf(id, user, htmlContent);
    } catch (err) {
      Logger.error('Auto PDF generation on update failed:', err);
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

    return template(cv);
  }

  // Export CV to PDF and save to Cloudinary
  async exportToPdf(
    id: string,
    user: IUser,
    htmlContent?: string,
    isPremium?: boolean,
  ) {
    const cv = await this.findOne(id, user);

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
