export type CVTemplateType = "template1" | "template2";

export type CVLocale = "vi-VN" | "en-US";
export type CVLanguage = "vi" | "en";

export interface CVTemplateLabels {
  sections: Record<string, string>;
  fullNamePlaceholder: string;
  positionPlaceholder: string;
  objectivePlaceholder: string;
  schoolPlaceholder: string;
  companyPlaceholder: string;
  addressPlaceholder: string;
  workPositionPlaceholder: string;
  activityNamePlaceholder: string;
  activityPositionPlaceholder: string;
  majorPlaceholder: string;
  degreePlaceholder: string;
  educationDescriptionPlaceholder: string;
  workDescriptionPlaceholder: string;
  activityDescriptionPlaceholder: string;
  skillNamePlaceholder: string;
  skillDescriptionPlaceholder: string;
  certificateNamePlaceholder: string;
  certificateIssuerPlaceholder: string;
  credentialUrlPlaceholder: string;
  awardNamePlaceholder: string;
  awardIssuerPlaceholder: string;
  awardDescriptionPlaceholder: string;
  startDatePlaceholder: string;
  endDatePlaceholder: string;
  yearPlaceholder: string;
  add: string;
  moveUp: string;
  moveDown: string;
  removeSection: string;
  removeSkill: string;
  removeCertificate: string;
  removeAward: string;
  pageCount: string;
  page: string;
  createdBy: string;
  nameFallback: string;
  positionFallback: string;
  schoolFallback: string;
  companyFallback: string;
  statusFallback: string;
  statusMixed: string;
  statusAi: string;
  modalReady: string;
  modalNoEvidence: string;
  modalDegraded: string;
  warningsTitle: string;
}

export const CV_TEMPLATE_LABELS: Record<CVLocale, CVTemplateLabels> = {
  "vi-VN": {
    sections: {
      objective: "MỤC TIÊU NGHỀ NGHIỆP",
      education: "HỌC VẤN",
      experience: "KINH NGHIỆM LÀM VIỆC",
      skills: "KỸ NĂNG CHUYÊN MÔN",
      activities: "HOẠT ĐỘNG & DỰ ÁN",
      certificates: "CHỨNG CHỈ",
      awards: "GIẢI THƯỞNG & DANH HIỆU",
      personalInfo: "THÔNG TIN CÁ NHÂN",
      contact: "THÔNG TIN LIÊN HỆ",
    },
    fullNamePlaceholder: "HỌ VÀ TÊN",
    positionPlaceholder: "Vị trí ứng tuyển",
    objectivePlaceholder:
      "Mục tiêu nghề nghiệp của bạn, bao gồm mục tiêu ngắn hạn và dài hạn...",
    schoolPlaceholder: "Tên trường học",
    companyPlaceholder: "Tên công ty",
    addressPlaceholder: "Hà Nội, Việt Nam",
    workPositionPlaceholder: "Vị trí công việc",
    activityNamePlaceholder: "Tên tổ chức / Dự án",
    activityPositionPlaceholder: "Vị trí / Vai trò tham gia",
    majorPlaceholder: "Ngành học / Môn học",
    degreePlaceholder: "Bằng cấp",
    educationDescriptionPlaceholder:
      "Mô tả quá trình học tập hoặc thành tích của bạn",
    workDescriptionPlaceholder: "Mô tả kinh nghiệm làm việc của bạn...",
    activityDescriptionPlaceholder: "Mô tả hoạt động",
    skillNamePlaceholder: "Kỹ năng / Danh mục",
    skillDescriptionPlaceholder: "Chi tiết kỹ năng (vd: Python, React, ...)",
    certificateNamePlaceholder: "Tên chứng chỉ",
    certificateIssuerPlaceholder: "Đơn vị cấp",
    credentialUrlPlaceholder: "Liên kết xác thực",
    awardNamePlaceholder: "Tên giải thưởng",
    awardIssuerPlaceholder: "Đơn vị trao",
    awardDescriptionPlaceholder: "Mô tả thành tích",
    startDatePlaceholder: "Bắt đầu",
    endDatePlaceholder: "Kết thúc",
    yearPlaceholder: "Năm",
    add: "Thêm",
    moveUp: "Di chuyển lên",
    moveDown: "Di chuyển xuống",
    removeSection: "Xóa mục này",
    removeSkill: "Xóa kỹ năng",
    removeCertificate: "Xóa chứng chỉ",
    removeAward: "Xóa giải thưởng",
    pageCount: "Tổng số trang",
    page: "Trang",
    createdBy: "Được tạo bởi",
    nameFallback: "HỌ VÀ TÊN CỦA BẠN",
    positionFallback: "Vị trí công việc ứng tuyển",
    schoolFallback: "Tên trường học / Viện đào tạo",
    companyFallback: "Tên công ty / Doanh nghiệp",
    statusFallback:
      "Bản nháp chỉ dùng nội dung an toàn từ hồ sơ (không có phần AI).",
    statusMixed:
      "Bản nháp kết hợp nội dung AI và phương án dự phòng an toàn từ hồ sơ.",
    statusAi: "Bản nháp được AI tạo và có thể chỉnh sửa.",
    modalReady: "Đã tạo bản nháp. Hãy kiểm tra nội dung trước khi lưu.",
    modalNoEvidence:
      "Chưa có đủ dữ liệu để tối ưu theo mục tiêu. Bản nháp hiện tại vẫn được giữ lại.",
    modalDegraded:
      "Đã tạo bản nháp ở chế độ an toàn. Hãy kiểm tra các trường được cảnh báo.",
    warningsTitle: "Một số lưu ý cần kiểm tra",
  },
  "en-US": {
    sections: {
      objective: "CAREER OBJECTIVE",
      education: "EDUCATION",
      experience: "WORK EXPERIENCE",
      skills: "PROFESSIONAL SKILLS",
      activities: "ACTIVITIES & PROJECTS",
      certificates: "CERTIFICATES",
      awards: "HONORS & AWARDS",
      personalInfo: "PERSONAL INFORMATION",
      contact: "CONTACT INFORMATION",
    },
    fullNamePlaceholder: "FULL NAME",
    positionPlaceholder: "Target position",
    objectivePlaceholder: "Describe your short- and long-term career goals...",
    schoolPlaceholder: "School or institution",
    companyPlaceholder: "Company name",
    addressPlaceholder: "Hanoi, Vietnam",
    workPositionPlaceholder: "Job title",
    activityNamePlaceholder: "Organization / project name",
    activityPositionPlaceholder: "Role or position",
    majorPlaceholder: "Field of study / Major",
    degreePlaceholder: "Degree",
    educationDescriptionPlaceholder:
      "Describe your studies or notable achievements",
    workDescriptionPlaceholder: "Describe your work experience...",
    activityDescriptionPlaceholder: "Describe the activity",
    skillNamePlaceholder: "Skill / category",
    skillDescriptionPlaceholder: "Skill details (e.g. Python, React, ...)",
    certificateNamePlaceholder: "Certificate name",
    certificateIssuerPlaceholder: "Issuer",
    credentialUrlPlaceholder: "Credential URL",
    awardNamePlaceholder: "Award name",
    awardIssuerPlaceholder: "Awarded by",
    awardDescriptionPlaceholder: "Achievement description",
    startDatePlaceholder: "Start date",
    endDatePlaceholder: "End date",
    yearPlaceholder: "Year",
    add: "Add",
    moveUp: "Move up",
    moveDown: "Move down",
    removeSection: "Remove item",
    removeSkill: "Remove skill",
    removeCertificate: "Remove certificate",
    removeAward: "Remove award",
    pageCount: "Total pages",
    page: "Page",
    createdBy: "Created by",
    nameFallback: "YOUR FULL NAME",
    positionFallback: "Target position",
    schoolFallback: "School / institution",
    companyFallback: "Company / organization",
    statusFallback: "Fallback-only draft using safe content from your profile.",
    statusMixed: "The draft combines AI content with a safe profile fallback.",
    statusAi: "AI created an editable draft.",
    modalReady: "Draft created. Review the content before saving.",
    modalNoEvidence:
      "There is not enough data to tailor this draft. The current draft was kept.",
    modalDegraded: "A safe draft was created. Review the flagged fields.",
    warningsTitle: "Notes to review",
  },
};

export type CVGenerationMode = "MANUAL" | "EDITOR_ONLY";

export interface AiCvGenerationConsentPolicy {
  scope: "cv_generation";
  consentVersion: string;
  policyHash: string;
}

export interface AiCvGenerationConsent {
  _id: string;
  scope: "cv_generation";
  consentVersion: string;
  policyHash: string;
  status: "GRANTED" | "REVOKED";
  grantedAt?: string | null;
  revokedAt?: string | null;
}

export type CVGenerationResultStatus = "COMPLETE" | "DEGRADED" | "NO_EVIDENCE";

export type CVGenerationJobStatus =
  | "QUEUED"
  | "PROCESSING"
  | "CANCEL_REQUESTED"
  | "COMPLETE"
  | "DEGRADED"
  | "STALE"
  | "FAILED"
  | "CANCELLED";

export type CVGenerationStatus =
  | "IDLE"
  | "GENERATING"
  | CVGenerationResultStatus
  | "QUEUED"
  | "PROCESSING"
  | "STALE"
  | "CANCELLED"
  | "FAILED";

export interface EducationEntry {
  schoolName?: string;
  degree?: string;
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

export interface ProjectEntry {
  projectName?: string;
  role?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  technologies?: string[];
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
  issuer?: string;
  date?: string;
  credentialUrl?: string;
}

export interface AwardEntry {
  name?: string;
  issuer?: string;
  date?: string;
  description?: string;
}

export function hasMeaningfulCvEntry(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).some((field) => {
    if (typeof field === "string") return field.trim().length > 0;
    if (Array.isArray(field)) {
      return field.some(
        (item) => typeof item === "string" && item.trim().length > 0,
      );
    }
    return false;
  });
}

export function filterMeaningfulCvEntries<T extends object>(
  entries: readonly T[] | null | undefined,
): T[] {
  if (!Array.isArray(entries)) return [];
  return entries.filter(hasMeaningfulCvEntry);
}

export function normalizeCvPreviewData(
  data: Partial<OnlineCV>,
): Partial<OnlineCV> {
  return {
    ...data,
    education: filterMeaningfulCvEntries(data.education),
    workExperience: filterMeaningfulCvEntries(data.workExperience),
    skills: filterMeaningfulCvEntries(data.skills),
    activities: filterMeaningfulCvEntries(data.activities),
    projects: filterMeaningfulCvEntries(data.projects),
    certificates: filterMeaningfulCvEntries(data.certificates),
    awards: filterMeaningfulCvEntries(data.awards),
  };
}

export interface CVTimelineEntry {
  kind: "activity" | "project";
  index: number;
  entry: ActivityEntry;
}

/** Combine the two source collections without rendering placeholders twice. */
export function getCvTimelineEntries(
  activities: readonly ActivityEntry[] | null | undefined,
  projects: readonly ProjectEntry[] | null | undefined,
): CVTimelineEntry[] {
  const timeline: CVTimelineEntry[] = [];
  (activities || []).forEach((entry, index) => {
    if (hasMeaningfulCvEntry(entry))
      timeline.push({ kind: "activity", index, entry });
  });
  (projects || []).forEach((entry, index) => {
    if (!hasMeaningfulCvEntry(entry)) return;
    timeline.push({
      kind: "project",
      index,
      entry: {
        organizationName: entry.projectName,
        position: entry.role,
        startDate: entry.startDate,
        endDate: entry.endDate,
        description:
          entry.description ||
          entry.technologies
            ?.filter((technology) => technology.trim())
            .join(", "),
      },
    });
  });
  return timeline;
}

export interface OnlineCV {
  _id: string;
  templateType: CVTemplateType;
  generationMode?: CVGenerationMode;
  contentVersion?: number;
  sourceVersion?: string | null;
  generatedBy?: string | null;
  targetJobId?: string | null;
  revision?: OnlineCVRevision | null;
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
  projects?: ProjectEntry[];
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
  fontSize?: "small" | "medium" | "large";
  lineSpacing?: number;
  customFormatting?: any;
}

export interface OnlineCVRevision {
  contentVersion: number;
  locale?: CVLocale;
  generatedAt?: string;
  warnings?: string[];
  sourceTrace?: Record<string, unknown>;
}

/** Resolve the exact locale stored on a CV revision; legacy revisions are Vietnamese. */
export function resolveLoadedCvLocale(
  revision: Pick<OnlineCVRevision, "locale"> | null | undefined,
  legacyFallback: CVLocale = "vi-VN",
): CVLocale {
  if (revision?.locale === "en-US") return "en-US";
  if (revision?.locale === "vi-VN") return "vi-VN";
  return legacyFallback;
}

export interface CreateOnlineCVDto {
  templateType: CVTemplateType;
  locale?: CVLocale;
  generationMode?: CVGenerationMode;
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
  projects?: ProjectEntry[];
  certificates?: CertificateEntry[];
  awards?: AwardEntry[];
  sectionOrder?: string[];
  fontFamily?: string;
  themeColor?: string;
  fontSize?: "small" | "medium" | "large";
  htmlContent?: string;
  customFormatting?: any;
  isSearchable?: boolean;
}

export interface UpdateOnlineCVDto extends Partial<CreateOnlineCVDto> {
  expectedContentVersion: number;
}

export type CVGenerationDraft = Partial<
  Pick<
    OnlineCV,
    | "title"
    | "fullName"
    | "position"
    | "phone"
    | "email"
    | "link"
    | "address"
    | "avatar"
    | "careerObjective"
    | "education"
    | "workExperience"
    | "skills"
    | "activities"
    | "projects"
    | "certificates"
    | "awards"
    | "sectionOrder"
    | "fontFamily"
    | "themeColor"
    | "fontSize"
    | "lineSpacing"
    | "customFormatting"
  >
>;

export interface GenerateOnlineCVDraftRequest {
  jobId?: string;
}

export interface GenerateOnlineCVJobRequest extends GenerateOnlineCVDraftRequest {
  templateType?: CVTemplateType;
  locale?: CVLocale;
  expectedProfileVersion?: number;
  expectedContentVersion?: number;
  sourceVersion?: string;
}

export interface GenerateOnlineCVJobAcceptedResponse {
  operationId: string;
  onlineCvId: string;
  status: "QUEUED";
  pollAfterSeconds: number;
  acceptedAt: string;
}

export interface GenerateOnlineCVJobStatusResponse {
  operationId: string;
  onlineCvId: string;
  status: CVGenerationJobStatus;
  pollAfterSeconds?: number;
  acceptedAt?: string;
  updatedAt?: string;
  errorCode?: string | null;
  current?: OnlineCV | null;
  draft?: CVGenerationDraft;
  warnings?: string[];
  generationMode?: CVGenerationMode;
  contentVersion?: number;
  sourceVersion?: string | null;
  generatedBy?: string | null;
  targetJobId?: string | null;
  revision?: OnlineCVRevision | null;
  locale?: CVLocale;
}

export interface GenerateOnlineCVDraftResponse {
  status: CVGenerationResultStatus;
  draft: CVGenerationDraft;
  warnings: string[];
  generationMode?: CVGenerationMode;
  contentVersion?: number;
  sourceVersion?: string | null;
  generatedBy?: string | null;
  targetJobId?: string | null;
  revision?: OnlineCVRevision | null;
}

export type UserCvParseStatus = "PENDING" | "PROCESSING" | "READY" | "FAILED";

export interface UserCV {
  _id: string;
  url: string;
  title?: string;
  description?: string;
  onlineCvId?: string;
  fileType: string;
  parseStatus?: UserCvParseStatus;
  parseErrorCode?: string | null;
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
  {
    id: "inter",
    name: "Inter (Hiện đại)",
    family: "'Inter', sans-serif",
    styleClass: "font-sans",
  },
  {
    id: "roboto",
    name: "Roboto (Chuẩn mực)",
    family: "'Roboto', sans-serif",
    styleClass: "font-sans",
  },
  {
    id: "times",
    name: "Times New Roman (Cổ điển)",
    family: "'Times New Roman', Times, serif",
    styleClass: "font-serif",
  },
  {
    id: "merriweather",
    name: "Merriweather (Thanh lịch)",
    family: "'Merriweather', Georgia, serif",
    styleClass: "font-serif",
  },
  {
    id: "jakarta",
    name: "Plus Jakarta Sans (Công nghệ)",
    family: "'Plus Jakarta Sans', sans-serif",
    styleClass: "font-sans",
  },
];

export const CV_THEMES: CVThemeOption[] = [
  {
    id: "primary-blue",
    name: "Xanh TalentPulse",
    color: "#2563EB",
    textColor: "#ffffff",
    bgLight: "#eff6ff",
  },
  {
    id: "midnight-slate",
    name: "Xanh Đen Tinh Tế",
    color: "#0F172A",
    textColor: "#ffffff",
    bgLight: "#f8fafc",
  },
  {
    id: "emerald-teal",
    name: "Xanh Ngọc Năng Động",
    color: "#0D9488",
    textColor: "#ffffff",
    bgLight: "#f0fdfa",
  },
  {
    id: "indigo-purple",
    name: "Tím Chuyên Nghiệp",
    color: "#4F46E5",
    textColor: "#ffffff",
    bgLight: "#eef2ff",
  },
  {
    id: "deep-ruby",
    name: "Đỏ Ruby Quý Phái",
    color: "#991B1B",
    textColor: "#ffffff",
    bgLight: "#fef2f2",
  },
];
