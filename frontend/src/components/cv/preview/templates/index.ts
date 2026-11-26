import type React from 'react';
import type { CVTemplateType } from '../../../../lib/cvTypes';
import type { CVPreviewTemplateProps } from '../CVPreviewTemplateProps';
import { PreviewTemplate1 } from './PreviewTemplate1';
import { PreviewTemplate2 } from './PreviewTemplate2';

export const CV_PREVIEW_TEMPLATES: Record<
  CVTemplateType,
  React.ComponentType<CVPreviewTemplateProps>
> = {
  template1: PreviewTemplate1,
  template2: PreviewTemplate2,
};

export { PreviewTemplate1, PreviewTemplate2 };
export type { CVPreviewTemplateProps };
