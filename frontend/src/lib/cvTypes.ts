export type CVTemplateType = 'template1' | 'template2';

export interface EducationEntry {
  schoolName?: string;
  major?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
}

export interface WorkExperienceEntry {
  companyName?: string;
  position?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
}

export interface SkillEntry {
  name?: string;
  description?: string;
}

export interface ActivityEntry {
  organizationName?: string;
  position?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
}

export interface CertificateEntry {
  name?: string;
  date?: string;
}

export interface AwardEntry {
  name?: string;
  date?: string;
}

export interface OnlineCV {
  _id: string;
  templateType: CVTemplateType;
  title?: string;
  fullName: string;
  position?: string;
  phone?: string;
  email?: string;
  link?: string;
  address?: string;
  avatar?: string;
  careerObjective?: string;
  education?: EducationEntry[];
  workExperience?: WorkExperienceEntry[];
  skills?: SkillEntry[];
  activities?: ActivityEntry[];
  certificates?: CertificateEntry[];
  awards?: AwardEntry[];
  pdfUrl?: string;
  isSearchable?: boolean;
  isPrimary?: boolean;
  userId: string;
  createdAt: string;
  updatedAt: string;
  // Visual customizations stored in UI state or metadata
  sectionOrder?: string[];
  fontFamily?: string;
  themeColor?: string;
  fontSize?: 'small' | 'medium' | 'large';
  lineSpacing?: number;
  customFormatting?: any;
}

export interface CreateOnlineCVDto {
  templateType: CVTemplateType;
  title?: string;
  fullName: string;
  position?: string;
  phone?: string;
  email?: string;
  link?: string;
  address?: string;
  avatar?: string;
  careerObjective?: string;
  education?: EducationEntry[];
  workExperience?: WorkExperienceEntry[];
  skills?: SkillEntry[];
  activities?: ActivityEntry[];
  certificates?: CertificateEntry[];
  awards?: AwardEntry[];
  sectionOrder?: string[];
  fontFamily?: string;
  themeColor?: string;
  fontSize?: 'small' | 'medium' | 'large';
  htmlContent?: string;
  customFormatting?: any;
  isSearchable?: boolean;
}

export interface UpdateOnlineCVDto extends Partial<CreateOnlineCVDto> {}

export interface UserCV {
  _id: string;
  url: string;
  title?: string;
  description?: string;
  onlineCvId?: string;
  fileType: string;
  parsedText?: string;
  skills?: string[];
  education?: string[];
  experience?: string[];
  certificates?: string[];
  isPrimary?: boolean;
  isSearchable?: boolean;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserCVDto {
  url: string;
  title?: string;
  description?: string;
  isPrimary?: boolean;
  isSearchable?: boolean;
  onlineCvId?: string;
  fileType?: string;
  parsedText?: string;
  skills?: string[];
  education?: string[];
  experience?: string[];
  certificates?: string[];
}

export interface CVThemeOption {
  id: string;
  name: string;
  color: string;
  textColor: string;
  bgLight: string;
}

export interface CVFontOption {
  id: string;
  name: string;
  family: string;
  styleClass: string;
}

export const CV_FONTS: CVFontOption[] = [
  { id: 'inter', name: 'Inter (Hiện đại)', family: "'Inter', sans-serif", styleClass: 'font-sans' },
  { id: 'roboto', name: 'Roboto (Chuẩn mực)', family: "'Roboto', sans-serif", styleClass: 'font-sans' },
  { id: 'times', name: 'Times New Roman (Cổ điển)', family: "'Times New Roman', Times, serif", styleClass: 'font-serif' },
  { id: 'merriweather', name: 'Merriweather (Thanh lịch)', family: "'Merriweather', Georgia, serif", styleClass: 'font-serif' },
  { id: 'jakarta', name: 'Plus Jakarta Sans (Công nghệ)', family: "'Plus Jakarta Sans', sans-serif", styleClass: 'font-sans' },
];

export const CV_THEMES: CVThemeOption[] = [
  { id: 'primary-blue', name: 'Xanh TalentPulse', color: '#2563EB', textColor: '#ffffff', bgLight: '#eff6ff' },
  { id: 'midnight-slate', name: 'Xanh Đen Tinh Tế', color: '#0F172A', textColor: '#ffffff', bgLight: '#f8fafc' },
  { id: 'emerald-teal', name: 'Xanh Ngọc Năng Động', color: '#0D9488', textColor: '#ffffff', bgLight: '#f0fdfa' },
  { id: 'indigo-purple', name: 'Tím Chuyên Nghiệp', color: '#4F46E5', textColor: '#ffffff', bgLight: '#eef2ff' },
  { id: 'deep-ruby', name: 'Đỏ Ruby Quý Phái', color: '#991B1B', textColor: '#ffffff', bgLight: '#fef2f2' },
];
