import type { OnlineCV, CVThemeOption, CVTemplateLabels, CVLocale } from '../../../lib/cvTypes';

export interface CVPreviewTemplateProps {
  data: Partial<OnlineCV>;
  currentTheme: CVThemeOption;
  fontMultiplier: number;
  isPremium?: boolean;
  langTitles: Record<string, string>;
  locale: CVLocale;
  labels: CVTemplateLabels;
}
