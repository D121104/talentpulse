import { forwardRef } from 'react';
import type { OnlineCV, CVFontOption, CVThemeOption, CVLocale } from '../../lib/cvTypes';
import {
  CV_FONTS,
  CV_THEMES,
  CV_TEMPLATE_LABELS,
  normalizeCvPreviewData,
  resolveLoadedCvLocale,
} from '../../lib/cvTypes';
import { CV_PREVIEW_TEMPLATES } from './preview/templates';

interface CVPreviewCanvasProps {
  data: Partial<OnlineCV>;
  fontFamilyId?: string;
  themeColorId?: string;
  fontSize?: 'small' | 'medium' | 'large';
  lineSpacing?: number;
  isPremium?: boolean;
  scale?: number;
  className?: string;
  cvLanguage?: 'vi' | 'en';
  cvLocale?: CVLocale;
}

const SECTION_TITLES = {
  vi: {
    objective: 'Mục tiêu nghề nghiệp',
    education: 'Học vấn',
    experience: 'Kinh nghiệm làm việc',
    skills: 'Kỹ năng chuyên môn',
    activities: 'Hoạt động ngoại khóa & Dự án',
    certificates: 'Chứng chỉ',
    awards: 'Giải thưởng & Danh hiệu',
    contact: 'Thông tin liên hệ',
    personalInfo: 'Thông tin cá nhân',
  },
  en: {
    objective: 'Career Objective',
    education: 'Education',
    experience: 'Work Experience',
    skills: 'Professional Skills',
    activities: 'Activities & Projects',
    certificates: 'Certificates',
    awards: 'Honors & Awards',
    contact: 'Contact Information',
    personalInfo: 'Personal Information',
  },
};

export const CVPreviewCanvas = forwardRef<HTMLDivElement, CVPreviewCanvasProps>(
  (
    {
      data,
      fontFamilyId = 'inter',
      themeColorId = 'primary-blue',
      fontSize = 'medium',
      lineSpacing = 1.3,
      isPremium = false,
      scale = 1,
      className = '',
      cvLanguage = 'vi',
      cvLocale,
    },
    ref,
  ) => {
    const currentFont: CVFontOption =
      CV_FONTS.find((f) => f.id === fontFamilyId) || CV_FONTS[0];
    const currentTheme: CVThemeOption =
      CV_THEMES.find((t) => t.id === themeColorId) || CV_THEMES[0];

    const fontSizeMultipliers = {
      small: 0.9,
      medium: 1.0,
      large: 1.1,
    };
    const fontMultiplier = fontSizeMultipliers[fontSize] || 1.0;

    const normalizedData = normalizeCvPreviewData(data);
    const templateType = normalizedData.templateType || 'template1';
    const resolvedLocale: CVLocale = resolveLoadedCvLocale(
      normalizedData.revision,
      cvLocale || (cvLanguage === 'en' ? 'en-US' : 'vi-VN'),
    );
    const resolvedLanguage = resolvedLocale === 'en-US' ? 'en' : 'vi';
    const langTitles = SECTION_TITLES[resolvedLanguage] || SECTION_TITLES.vi;
    const labels = CV_TEMPLATE_LABELS[resolvedLocale];

    const TemplateComponent =
      CV_PREVIEW_TEMPLATES[templateType] || CV_PREVIEW_TEMPLATES.template1;

    return (
      <div
        className={`relative bg-white shadow-2xl transition-all select-text overflow-hidden shrink-0 h-auto ${className}`}
        style={{
          transform: scale !== 1 ? `scale(${scale})` : undefined,
          transformOrigin: 'top center',
          width: '210mm',
          minHeight: '297mm',
          height: 'auto',
          fontFamily: currentFont.family,
          lineHeight: lineSpacing,
          color: '#1E293B',
        }}
        ref={ref}
        id="cv-print-area"
      >
        <TemplateComponent
          data={normalizedData}
          currentTheme={currentTheme}
          fontMultiplier={fontMultiplier}
          isPremium={isPremium}
          langTitles={langTitles}
          locale={resolvedLocale}
          labels={labels}
        />
      </div>
    );
  },
);

CVPreviewCanvas.displayName = 'CVPreviewCanvas';
