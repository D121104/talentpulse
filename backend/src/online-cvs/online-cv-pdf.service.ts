import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FilesService } from 'src/files/files.service';
import { OnlineCV } from './entities/online-cv.entity';
import { generateCvHtml } from './online-cv-template.utils';
import {
  escapeHtml,
  isTrustedPdfResource,
  sanitizePdfHtml,
} from './online-cv-pdf.utils';

let puppeteer: any;

@Injectable()
export class OnlineCvPdfService {
  constructor(
    @InjectRepository(OnlineCV)
    private readonly onlineCVRepo: Repository<OnlineCV>,
    private readonly filesService: FilesService,
  ) {
    void this.loadPuppeteer();
  }

  isAvailable(): boolean {
    return Boolean(puppeteer);
  }

  generateHTML(cv: OnlineCV): string {
    return generateCvHtml(cv);
  }

  private async loadPuppeteer(): Promise<void> {
    try {
      puppeteer = await import('puppeteer');
    } catch {
      console.warn('Puppeteer not available for PDF generation');
    }
  }

  async export(
    cv: OnlineCV,
    htmlContent: string | undefined,
    shouldRemoveWatermark: boolean,
  ) {
    if (!puppeteer) {
      throw new BadRequestException('PDF generation is not available');
    }
    try {
      let contentToUse = htmlContent || cv.htmlContent;
      let finalHtml = '';

      if (shouldRemoveWatermark && contentToUse) {
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

      const uploadResult = await this.filesService.uploadBuffer(
        pdfBuffer,
        `cv_${cv._id}_${Date.now()}.pdf`,
        'application/pdf',
      );
      await this.onlineCVRepo.update(cv._id, {
        pdfUrl: uploadResult.url,
        ...(contentToUse ? { htmlContent: contentToUse } : {}),
      });

      try {
        await this.onlineCVRepo.query(
          'UPDATE user_cvs SET url = $1 WHERE "onlineCvId" = $2',
          [uploadResult.url, cv._id],
        );
      } catch {
        // Ignore if the linked legacy record is absent.
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
}
