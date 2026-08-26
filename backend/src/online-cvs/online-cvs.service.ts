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

// Dynamic import for puppeteer
let puppeteer: any;

@Injectable()
export class OnlineCVsService {
  constructor(
    @InjectRepository(OnlineCV)
    private readonly onlineCVRepo: Repository<OnlineCV>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly usersService: UsersService,
    private readonly filesService: FilesService,
  ) {
    this.loadPuppeteer();
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
    const maxLimit = isPremium ? 9999 : isVerified ? 6 : 3;
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

    const isPrimary = currentCount === 0 || createOnlineCVDto.isPrimary === true;

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
      const userInDb = await this.userRepo.findOne({ where: { _id: user._id } });
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

    return await this.onlineCVRepo.softDelete(id);
  }

  // Toggle allow recruiter to search this online CV
  async toggleSearchable(id: string, user: IUser, isSearchable?: boolean) {
    const cv = await this.findOne(id, user);
    const newSearchable = isSearchable !== undefined ? Boolean(isSearchable) : !cv.isSearchable;

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
  async exportToPdf(id: string, user: IUser, htmlContent?: string, isPremium?: boolean) {
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
          .replace(/<div[^>]*class="[^"]*cv-watermark[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
          .replace(/<div[^>]*data-watermark="true"[^>]*>[\s\S]*?<\/div>/gi, '')
          .replace(/<div[^>]*>[\s\S]*?Được tạo bởi[\s\S]*?TalentPulse[\s\S]*?<\/div>/gi, '')
          .replace(/<div style="position: fixed; bottom: 8px;[\s\S]*?<\/div>/gi, '');
      }

      const watermarkHtml = shouldRemoveWatermark
        ? ''
        : `
<div class="cv-watermark" style="position: fixed; bottom: 8px; left: 0; right: 0; text-align: center; font-size: 8pt; color: #94a3b8; font-family: 'Inter', sans-serif; border-top: 1px dashed #cbd5e1; padding-top: 4px; margin: 0 40px; pointer-events: none; z-index: 9999; background: white;">
  © <strong>talentpulse.vn</strong> &bull; Nền tảng tạo CV & kết nối ứng viên thông minh
</div>`;

      if (contentToUse && contentToUse.trim().length > 0) {
        finalHtml = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${cv.fullName || 'CV'}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Merriweather:ital,wght@0,300;0,400;0,700;1,300;1,400&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Roboto:ital,wght@0,300;0,400;0,500;0,700;1,400&display=swap" rel="stylesheet">
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
    ${shouldRemoveWatermark ? '.cv-watermark, [data-watermark] { display: none !important; }' : ''}
  </style>
</head>
<body>
  ${contentToUse}
  ${!contentToUse.includes('talentpulse.vn') && !shouldRemoveWatermark ? watermarkHtml : ''}
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
      await page.setContent(finalHtml, { waitUntil: 'networkidle0' });

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

      return {
        _id: cv._id,
        pdfUrl: uploadResult.url,
        message: 'Xuất PDF thành công',
      };
    } catch (error) {
      console.error('PDF generation error:', error);
      throw new BadRequestException('Không thể tạo PDF: ' + error.message);
    }
  }

  // Get preview HTML (for client-side preview)
  async getPreviewHTML(id: string, user: IUser) {
    const cv = await this.findOne(id, user);
    const html = this.generateHTML(cv);
    return { html };
  }
}
