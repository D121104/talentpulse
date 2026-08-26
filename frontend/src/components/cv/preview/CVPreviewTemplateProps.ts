import type { OnlineCV, CVThemeOption } from '../../../lib/cvTypes';

export interface CVPreviewTemplateProps {
  data: Partial<OnlineCV>;
  currentTheme: CVThemeOption;
  fontMultiplier: number;
  isPremium?: boolean;
  langTitles: Record<string, string>;
}
