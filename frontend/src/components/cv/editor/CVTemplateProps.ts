import type React from 'react';
import type {
  EducationEntry,
  WorkExperienceEntry,
  SkillEntry,
  ActivityEntry,
  CertificateEntry,
  AwardEntry,
  CVFontOption,
  CVThemeOption,
} from '../../../lib/cvTypes';

export interface CVEditorTemplateProps {
  // Theme & Typography
  currentTheme: CVThemeOption;
  currentFont: CVFontOption;
  fontMultiplier: number;
  lineSpacing: number;

  // Basic Info
  fullName: string;
  setFullName: (v: string) => void;
  position: string;
  setPosition: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  link: string;
  setLink: (v: string) => void;
  address: string;
  setAddress: (v: string) => void;
  careerObjective: string;
  setCareerObjective: (v: string) => void;

  // Array Sections
  education: EducationEntry[];
  setEducation: React.Dispatch<React.SetStateAction<EducationEntry[]>>;
  workExperience: WorkExperienceEntry[];
  setWorkExperience: React.Dispatch<React.SetStateAction<WorkExperienceEntry[]>>;
  skills: SkillEntry[];
  setSkills: React.Dispatch<React.SetStateAction<SkillEntry[]>>;
  activities: ActivityEntry[];
  setActivities: React.Dispatch<React.SetStateAction<ActivityEntry[]>>;
  certificates: CertificateEntry[];
  setCertificates: React.Dispatch<React.SetStateAction<CertificateEntry[]>>;
  awards: AwardEntry[];
  setAwards: React.Dispatch<React.SetStateAction<AwardEntry[]>>;

  // Controls & Config
  visibleSections: Record<string, boolean>;
  sectionOrder: string[];
  moveSection: (sectionKey: string, direction: 'up' | 'down') => void;
  sectionLabels: Record<string, string>;
  markDirty: () => void;
  pageCount: number;
}
