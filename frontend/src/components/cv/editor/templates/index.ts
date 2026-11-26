import type React from 'react';
import type { CVTemplateType } from '../../../../lib/cvTypes';
import type { CVEditorTemplateProps } from '../CVTemplateProps';
import { Template1ClassicATS } from './Template1ClassicATS';
import { Template2ModernTimeline } from './Template2ModernTimeline';

export const CV_EDITOR_TEMPLATES: Record<
  CVTemplateType,
  React.ComponentType<CVEditorTemplateProps>
> = {
  template1: Template1ClassicATS,
  template2: Template2ModernTimeline,
};

export { Template1ClassicATS, Template2ModernTimeline };
export type { CVEditorTemplateProps };
