import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Award,
  BriefcaseBusiness,
  ChevronDown,
  ChevronUp,
  FolderKanban,
  GraduationCap,
  Globe,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Trophy,
  UserRound,
  UsersRound,
  Wrench,
} from 'lucide-react';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ApiError } from '../../lib/api';
import { careerProfileApi } from '../../lib/careerProfileApi';
import { mapCandidateCareerProfileToInput } from '../../lib/careerProfileTypes';
import type {
  CandidateCareerProfile,
  CareerActivityEntry,
  CareerAwardEntry,
  CareerCertificateEntry,
  CareerEducationEntry,
  CareerExperienceEntry,
  CareerProjectEntry,
  CareerProfileCvLocale,
} from '../../lib/careerProfileTypes';

type Entry = Record<string, string>;
type ListSectionKey =
  | 'experience'
  | 'education'
  | 'projects'
  | 'certificates'
  | 'skills'
  | 'activities'
  | 'awards';

type ProfileResponse = Partial<CandidateCareerProfile> & {
  workExperience?: unknown[];
  contact?: Record<string, unknown>;
  objective?: string | null;
};

class ProfileSaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProfileSaveError';
  }
}

const PROFILE_SAVE_RETRY_MESSAGE = 'Không thể lưu hồ sơ lúc này. Vui lòng kiểm tra lại và thử lại sau.';
const PROFILE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const createIdempotencyKey = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `cv-generation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const PROFILE_SECTION_LABELS: Record<ListSectionKey, string> = {
  experience: 'Kinh nghiệm làm việc',
  education: 'Học vấn',
  projects: 'Dự án',
  certificates: 'Chứng chỉ',
  skills: 'Kỹ năng',
  activities: 'Hoạt động',
  awards: 'Giải thưởng',
};

const emptyProfile = (name = '', email = ''): CandidateCareerProfile => ({
  contentVersion: 0,
  fullName: name,
  email,
  phone: '',
  link: '',
  address: '',
  headline: '',
  careerObjective: '',
  experience: [],
  education: [],
  projects: [],
  certificates: [],
  skills: [],
  activities: [],
  awards: [],
});

const emptyEntries: Record<ListSectionKey, Entry> = {
  experience: { companyName: '', position: '', startDate: '', endDate: '', description: '' },
  education: { schoolName: '', degree: '', major: '', startDate: '', endDate: '', description: '' },
  projects: { projectName: '', role: '', startDate: '', endDate: '', description: '', technologies: '' },
  certificates: { name: '', issuer: '', date: '', credentialUrl: '' },
  skills: { name: '', level: '' },
  activities: { organizationName: '', position: '', startDate: '', endDate: '', description: '' },
  awards: { name: '', issuer: '', date: '', description: '' },
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function entryLabel(entry: object, section: ListSectionKey, index: number): string {
  const item = asRecord(entry);
  const name = ['companyName', 'schoolName', 'projectName', 'name', 'organizationName']
    .map((key) => asText(item[key]).trim()).find(Boolean);
  const role = asText(item.position).trim() || asText(item.role).trim();
  return [name, role].filter(Boolean).join(' · ') || `${PROFILE_SECTION_LABELS[section]} ${index + 1}`;
}

function asTechnologies(value: unknown): string {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string').join(', ');
  }
  return asText(value);
}

function normalizeProfile(raw: ProfileResponse, name = '', email = ''): CandidateCareerProfile {
  const base = emptyProfile(name, email);
  const contact = asRecord(raw.contact);
  const experience = (Array.isArray(raw.experience)
    ? raw.experience
    : raw.workExperience) ?? [];
  const education = Array.isArray(raw.education) ? raw.education : [];
  const projects = Array.isArray(raw.projects) ? raw.projects : [];
  const certificates = Array.isArray(raw.certificates) ? raw.certificates : [];
  const skills = Array.isArray(raw.skills) ? raw.skills : [];
  const activities = Array.isArray(raw.activities) ? raw.activities : [];
  const awards = Array.isArray(raw.awards) ? raw.awards : [];

  return {
    ...base,
    contentVersion: Number.isFinite(Number(raw.contentVersion)) ? Number(raw.contentVersion) : 0,
    fullName: asText(raw.fullName ?? contact.fullName, name),
    email: asText(raw.email ?? contact.email, email),
    phone: asText(raw.phone ?? contact.phone),
    link: asText(raw.link ?? contact.link),
    address: asText(raw.address ?? contact.address),
    headline: asText(raw.headline),
    careerObjective: asText(raw.careerObjective ?? raw.objective),
    experience: experience.map((entry) => {
      const item = asRecord(entry);
      return {
        companyName: asText(item.companyName),
        position: asText(item.position),
        startDate: asText(item.startDate),
        endDate: asText(item.endDate),
        description: asText(item.description),
      };
    }),
    education: education.map((entry) => {
      const item = asRecord(entry);
      return {
        schoolName: asText(item.schoolName),
        degree: asText(item.degree),
        major: asText(item.major),
        startDate: asText(item.startDate),
        endDate: asText(item.endDate),
        description: asText(item.description),
      };
    }),
    projects: projects.map((entry) => {
      const item = asRecord(entry);
      return {
        projectName: asText(item.projectName),
        role: asText(item.role),
        startDate: asText(item.startDate),
        endDate: asText(item.endDate),
        description: asText(item.description),
        technologies: asTechnologies(item.technologies),
      };
    }),
    certificates: certificates.map((entry) => {
      const item = asRecord(entry);
      return {
        name: asText(item.name),
        issuer: asText(item.issuer),
        date: asText(item.date),
        credentialUrl: asText(item.credentialUrl),
      };
    }),
    skills: skills.map((entry) => {
      const item = asRecord(entry);
      return {
        name: asText(item.name),
        level: asText(item.level),
        ...(typeof item.description === 'string' ? { description: item.description } : {}),
      };
    }),
    activities: activities.map((entry) => {
      const item = asRecord(entry);
      return {
        organizationName: asText(item.organizationName),
        position: asText(item.position),
        startDate: asText(item.startDate),
        endDate: asText(item.endDate),
        description: asText(item.description),
      };
    }),
    awards: awards.map((entry) => {
      const item = asRecord(entry);
      return {
        name: asText(item.name),
        issuer: asText(item.issuer),
        date: asText(item.date),
        description: asText(item.description),
      };
    }),
  };
}

function isBlankEntry(entry: unknown): boolean {
  const item = asRecord(entry);
  return Object.values(item).every((value) => {
    if (Array.isArray(value)) return value.length === 0;
    return !asText(value).trim();
  });
}

function validateProfileBeforeSave(profile: CandidateCareerProfile): string | null {
  const email = profile.email.trim();
  if (!email) return 'Vui lòng nhập email để lưu hồ sơ.';
  if (!PROFILE_EMAIL_PATTERN.test(email)) return 'Email không hợp lệ. Vui lòng kiểm tra lại địa chỉ email.';

  for (const section of Object.keys(PROFILE_SECTION_LABELS) as ListSectionKey[]) {
    const entries = profile[section] as unknown as unknown[];
    if (entries.some(isBlankEntry)) {
      return `${PROFILE_SECTION_LABELS[section]} có mục đang để trống. Vui lòng điền thêm thông tin hoặc xóa mục này.`;
    }
  }
  return null;
}

function profileSaveErrorMessage(error: unknown): string {
  if (error instanceof ProfileSaveError) return error.message;
  if (!(error instanceof ApiError)) return PROFILE_SAVE_RETRY_MESSAGE;

  const serverMessage = error.message.toLowerCase();
  if (error.status === 409 || serverMessage.includes('contentversion') || serverMessage.includes('phiên bản')) {
    return 'Hồ sơ đã được cập nhật ở nơi khác. Hãy tải lại bản mới nhất trước khi lưu.';
  }
  if (error.status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  if (error.status === 403) return 'Bạn không có quyền chỉnh sửa hồ sơ này.';
  if (serverMessage.includes('email') || serverMessage.includes('isemail') || serverMessage.includes('must be an email')) {
    return 'Email không hợp lệ. Vui lòng kiểm tra lại địa chỉ email.';
  }

  for (const [section, label] of Object.entries(PROFILE_SECTION_LABELS) as [ListSectionKey, string][]) {
    if (serverMessage.includes(section) || serverMessage.includes(label.toLowerCase())) {
      return `${label} chưa hợp lệ. Vui lòng kiểm tra lại các trường trong mục này.`;
    }
  }
  if (error.status === 400 || error.status === 422) {
    return 'Một số thông tin trong hồ sơ chưa hợp lệ. Vui lòng kiểm tra lại các mục đã nhập.';
  }
  return PROFILE_SAVE_RETRY_MESSAGE;
}

const GENERATION_SAVE_ERRORS = {
  conflict: ['Hồ sơ đã thay đổi. Hãy tải lại bản mới nhất trước khi tạo CV.', 'The profile has changed. Reload the latest version before creating a CV.'],
  auth: ['Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 'Your session has expired. Please sign in again.'],
  permission: ['Bạn không có quyền chỉnh sửa hồ sơ này.', 'You do not have permission to edit this profile.'],
  email: ['Hãy nhập địa chỉ email hợp lệ trước khi tạo CV.', 'Enter a valid email address before creating a CV.'],
  skill: ['Thêm kỹ năng đang nhập trước khi tạo CV.', 'Add the skill you are typing before creating a CV.'],
  validation: ['Kiểm tra các mục còn trống hoặc chưa hợp lệ trong hồ sơ trước khi tạo CV.', 'Check empty or invalid profile entries before creating a CV.'],
  retry: ['Không thể lưu hồ sơ. Vui lòng thử lại trước khi tạo CV.', 'The profile could not be saved. Please try again before creating a CV.'],
} as const;
type GenerationSaveErrorCode = keyof typeof GENERATION_SAVE_ERRORS;
function generationSaveErrorCode(error: unknown): GenerationSaveErrorCode {
  const message = profileSaveErrorMessage(error).toLowerCase();
  if (/cập nhật ở nơi khác|mới nhất/.test(message)) return 'conflict';
  if (/đăng nhập/.test(message)) return 'auth';
  if (/quyền/.test(message)) return 'permission';
  if (/email/.test(message)) return 'email';
  if (/kỹ năng/.test(message)) return 'skill';
  if (/trống|hợp lệ/.test(message)) return 'validation';
  return 'retry';
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'month' | 'url' | 'email' | 'tel';
  autoComplete?: string;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{label}</span>
      <input
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
      />
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  autoGrow = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoGrow?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = textareaRef.current;
    if (!autoGrow || !element) return;
    const resize = () => {
      element.style.height = 'auto';
      const style = getComputedStyle(element);
      const border = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
      element.style.height = `${element.scrollHeight + border}px`;
    };
    resize();
    let previousWidth = element.getBoundingClientRect().width;
    const observer = new ResizeObserver(() => {
      const width = element.getBoundingClientRect().width;
      if (width !== previousWidth) {
        previousWidth = width;
        resize();
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [autoGrow, value]);
  return (
    <label className="space-y-1.5 sm:col-span-2">
      <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{label}</span>
      <textarea
        ref={textareaRef}
        rows={3}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`box-border w-full ${autoGrow ? 'resize-none overflow-hidden' : 'resize-y'} rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-slate-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15 dark:border-slate-700 dark:bg-slate-800 dark:text-white`}
      />
    </label>
  );
}

function ListSection<T extends object>({
  title,
  description,
  icon,
  entries,
  section,
  onAdd,
  onRemove,
  onMove,
  renderFields,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  entries: T[];
  section: ListSectionKey;
  onAdd: (section: ListSectionKey) => void;
  onRemove: (section: ListSectionKey, index: number) => void;
  onMove: (section: ListSectionKey, index: number, direction: -1 | 1) => void;
  renderFields: (entry: T, index: number) => ReactNode;
}) {
  const lastEntryRef = useRef<HTMLDivElement>(null);
  const pendingAdd = useRef(false);
  const add = () => {
    pendingAdd.current = true;
    onAdd(section);
  };
  useLayoutEffect(() => {
    if (!pendingAdd.current) return;
    pendingAdd.current = false;
    const input = lastEntryRef.current?.querySelector('input');
    input?.focus({ preventScroll: true });
    input?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }, [entries.length]);
  return (
    <section id={section} tabIndex={-1} aria-label={title} className="scroll-mt-28 rounded-3xl border border-slate-200/90 bg-white p-5 shadow-sm focus-visible:outline-2 focus-visible:outline-primary dark:border-slate-800 dark:bg-slate-900 sm:p-7">
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 dark:border-slate-800 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light">
            {icon}
          </span>
          <div>
            <h2 className="text-base font-black text-slate-900 dark:text-white sm:text-lg">{title}</h2>
            <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">Tuỳ chọn · {entries.filter((entry) => !isBlankEntry(entry)).length} mục đã nhập</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>
          </div>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
          <p>Chưa thêm {title.toLowerCase()}. Có thể bỏ qua nếu không phù hợp.</p>
          <button type="button" onClick={add} className="mt-3 min-h-11 rounded-xl px-4 text-sm font-semibold text-primary hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary dark:text-primary-light">Thêm {title.toLowerCase()}</button>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {entries.map((entry, index) => (
            <div id={`${section}-${index}`} tabIndex={-1} aria-label={entryLabel(entry, section, index)} ref={index === entries.length - 1 ? lastEntryRef : undefined} key={`${section}-${index}`} className="scroll-mt-28 rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 focus-visible:outline-2 focus-visible:outline-primary dark:border-slate-800 dark:bg-slate-800/35 sm:p-5 [&_input]:scroll-mt-28">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h3 className="min-w-0 break-words text-sm font-bold text-slate-700 dark:text-slate-200">{entryLabel(entry, section, index)}</h3>
                <div className="flex shrink-0 items-center gap-1 [&_button]:min-h-11 [&_button]:min-w-11 [&_button]:focus-visible:outline-2 [&_button]:focus-visible:outline-primary">
                  <button type="button" disabled={index === 0} onClick={() => onMove(section, index, -1)} aria-label="Đưa lên" className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white hover:text-primary disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-slate-700">
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button type="button" disabled={index === entries.length - 1} onClick={() => onMove(section, index, 1)} aria-label="Đưa xuống" className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white hover:text-primary disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-slate-700">
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => onRemove(section, index)} aria-label="Xóa mục" className="rounded-lg p-1.5 text-rose-500 transition hover:bg-rose-50 dark:hover:bg-rose-950/30">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{renderFields(entry, index)}</div>
            </div>
          ))}
        </div>
      )}
      <div className="group/add flex min-h-16 items-center justify-center">
        <button type="button" onClick={add} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-primary transition-opacity hover:bg-primary/10 group-hover/add:opacity-100 group-focus-within/add:opacity-100 dark:text-primary-light [@media(hover:hover)_and_(pointer:fine)_and_(not_(any-pointer:coarse))]:opacity-0">
          <Plus aria-hidden="true" className="h-4 w-4" />Thêm {title.toLowerCase()}
        </button>
      </div>
    </section>
  );
}

export default function CareerProfilePage() {
  const { i18n } = useTranslation();
  const uiVi = !(i18n.resolvedLanguage || i18n.language || 'vi').toLowerCase().startsWith('en');
  const generationCopy = (vi: string, en: string) =>
    (i18n.resolvedLanguage || i18n.language || 'vi').toLowerCase().startsWith('en') ? en : vi;
  const { user, accessToken } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<CandidateCareerProfile>(() => emptyProfile(user?.name, user?.email));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [generationSaveError, setGenerationSaveError] = useState<GenerationSaveErrorCode | null>(null);
  const generationSaveErrorText = generationSaveError ? GENERATION_SAVE_ERRORS[generationSaveError][uiVi ? 0 : 1] : '';
  const [isNew, setIsNew] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [templateType, setTemplateType] = useState<'template1' | 'template2'>('template1');
  const [jobId, setJobId] = useState('');
  const [generationLocale, setGenerationLocale] = useState<CareerProfileCvLocale>('vi-VN');
  const [skillDraft, setSkillDraft] = useState('');
  const [skillFeedback, setSkillFeedback] = useState('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const skillInputRef = useRef<HTMLInputElement>(null);
  const skillComposing = useRef(false);
  const pendingSkillMessage = 'Nhấn Thêm kỹ năng hoặc Enter để thêm kỹ năng đang nhập trước khi lưu hoặc tạo CV.';

  const addSkill = () => {
    if (skillComposing.current) return;
    const name = skillDraft.trim();
    if (!name) {
      setSkillFeedback('Nhập tên kỹ năng trước khi thêm.');
      skillInputRef.current?.focus();
      return;
    }
    if (profile.skills.some((skill) => skill.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setSkillFeedback('Kỹ năng này đã có trong danh sách.');
      skillInputRef.current?.focus();
      return;
    }
    updateProfile({ skills: [...profile.skills, { name, level: '' }] });
    setSkillDraft('');
    setSkillFeedback('');
    skillInputRef.current?.focus();
  };

  const loadProfile = useCallback(async () => {
    if (!accessToken) return;
    setGenerationSaveError(null);
    setIsLoading(true);
    setLoadError('');
    try {
      const response = await careerProfileApi.getMe(accessToken);
      setProfile(normalizeProfile(response, user?.name, user?.email));
      setIsNew(false);
      setSaveError('');
      setIsDirty(false);
      setConflict(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setProfile(emptyProfile(user?.name, user?.email));
        setIsDirty(false);
        setIsNew(true);
        setConflict(false);
        setSaveError('');
      } else {
        setLoadError('Không thể tải hồ sơ nghề nghiệp. Dữ liệu chưa được tải; hãy thử lại trước khi chỉnh sửa.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, user?.email, user?.name]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const updateProfile = (patch: Partial<CandidateCareerProfile>) => {
    setGenerationSaveError(null);
    setProfile((current) => ({ ...current, ...patch }));
    setIsDirty(true);
    setSaveError('');
  };

  const updateEntry = (section: ListSectionKey, index: number, key: string, value: string) => {
    setGenerationSaveError(null);
    setProfile((current) => ({
      ...current,
      [section]: (current[section] as unknown as Entry[]).map((entry, itemIndex) =>
        itemIndex === index ? { ...entry, [key]: value } : entry,
      ),
    }));
    setIsDirty(true);
    setSaveError('');
  };

  const addEntry = (section: ListSectionKey) => {
    setGenerationSaveError(null);
    setProfile((current) => ({
      ...current,
      [section]: [...(current[section] as unknown as Entry[]), { ...emptyEntries[section] }],
    }));
    setIsDirty(true);
  };

  const removeEntry = (section: ListSectionKey, index: number) => {
    setGenerationSaveError(null);
    setProfile((current) => ({
      ...current,
      [section]: (current[section] as unknown as Entry[]).filter((_, itemIndex) => itemIndex !== index),
    }));
    setIsDirty(true);
  };

  const moveEntry = (section: ListSectionKey, index: number, direction: -1 | 1) => {
    setProfile((current) => {
      const entries = [...(current[section] as unknown as Entry[])];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= entries.length) return current;
      [entries[index], entries[targetIndex]] = [entries[targetIndex], entries[index]];
      return { ...current, [section]: entries };
    });
    setIsDirty(true);
  };

  const saveProfile = useCallback(async (): Promise<CandidateCareerProfile> => {
    if (isLoading || loadError || conflict) throw new ProfileSaveError('Hãy tải hồ sơ mới nhất trước khi lưu.');
    if (skillDraft.trim()) throw new ProfileSaveError(pendingSkillMessage);
    const validationMessage = validateProfileBeforeSave(profile);
    if (validationMessage) throw new ProfileSaveError(validationMessage);
    if (!accessToken) throw new ProfileSaveError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');

    setIsSaving(true);
    setSaveError('');
    try {
      const input = mapCandidateCareerProfileToInput(profile);
      const response = await careerProfileApi.updateMe(input, accessToken);
      const saved = normalizeProfile(response, user?.name, user?.email);
      setProfile(saved);
      setIsDirty(false);
      setConflict(false);
      setIsNew(false);
      toast.success((i18n.resolvedLanguage || i18n.language || 'vi').toLowerCase().startsWith('en') ? 'Career profile saved' : 'Đã lưu hồ sơ nghề nghiệp');
      return saved;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) setConflict(true);
      throw new ProfileSaveError(profileSaveErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }, [accessToken, profile, toast, user?.email, user?.name, isLoading, loadError, conflict, skillDraft, i18n]);

  const handleSave = async () => {
    setGenerationSaveError(null);
    if (isSaving || isGenerating) return;
    try {
      await saveProfile();
    } catch (error) {
      setSaveError(profileSaveErrorMessage(error));
      toast.error('Không thể lưu hồ sơ', profileSaveErrorMessage(error));
    }
  };

  const handleGenerate = async () => {
    if (!accessToken || isLoading || loadError || conflict || isSaving || isGenerating) return;
    if (skillDraft.trim()) {
      setSkillFeedback(pendingSkillMessage);
      skillInputRef.current?.focus();
      return;
    }
    setIsGenerating(true);
    setGenerationSaveError(null);
    setSaveError('');
    try {
      const saved = isDirty || isNew ? await saveProfile() : profile;
      const response = await careerProfileApi.generateCvJob(
        {
          templateType,
          ...(jobId.trim() ? { jobId: jobId.trim() } : {}),
          locale: generationLocale,
          expectedProfileVersion: saved.contentVersion,
        },
        createIdempotencyKey(),
        accessToken,
      );
      if (!response.onlineCvId || !response.operationId) {
        throw new Error('Phản hồi tạo CV không hợp lệ.');
      }
      toast.success(generationCopy('Đã tiếp nhận yêu cầu tạo CV AI', 'AI CV request accepted'));
      navigate(`/cv-editor/${response.onlineCvId}?generation=${encodeURIComponent(response.operationId)}`);
    } catch (error) {
      if (error instanceof ProfileSaveError) {
        const code = generationSaveErrorCode(error);
        setGenerationSaveError(code);
        const [vi, en] = GENERATION_SAVE_ERRORS[code];
        toast.error(generationCopy('Không thể lưu hồ sơ', 'Could not save profile'), generationCopy(vi, en));
      } else {
        toast.error(generationCopy('Không thể tạo CV AI', 'Could not create AI CV'), generationCopy('Không thể tạo CV lúc này. Vui lòng thử lại sau.', 'The CV could not be created. Please try again later.'));
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const generationLanguageLabel = generationLocale === 'vi-VN' ? (uiVi ? 'Tiếng Việt' : 'Vietnamese') : (uiVi ? 'Tiếng Anh' : 'English');
  const status = generationSaveError ? (uiVi ? 'Chưa lưu được hồ sơ' : 'Profile not saved') : isGenerating ? (isSaving ? (uiVi ? 'Đang lưu hồ sơ…' : 'Saving profile…') : (uiVi ? 'Đang tạo CV…' : 'Creating CV…')) : isLoading ? 'Đang tải hồ sơ…' : loadError ? 'Chưa tải được hồ sơ' : conflict ? 'Cần tải lại hồ sơ' : isSaving ? 'Đang lưu hồ sơ…' : saveError ? 'Chưa lưu được hồ sơ' : isDirty ? 'Có thay đổi chưa lưu' : isNew ? 'Hồ sơ mới · chưa lưu' : 'Đã lưu hồ sơ';
  const validationMessage = skillDraft.trim() ? pendingSkillMessage : validateProfileBeforeSave(profile);
  const sections = [
    { id: 'base', label: 'Thông tin nền tảng', cue: profile.email.trim() ? 'Đã nhập email' : 'Chưa nhập email', children: [] },
    ...(['experience', 'education', 'projects', 'skills', 'certificates', 'activities', 'awards'] as ListSectionKey[]).map((key) => ({
      id: key, label: PROFILE_SECTION_LABELS[key],
      cue: `${key === 'skills' ? profile.skills.filter((skill) => skill.name.trim()).length : profile[key].filter((entry) => !isBlankEntry(entry)).length} mục`,
      children: key === 'skills' ? [] : profile[key].map((entry, index) => {
        const item = asRecord(entry);
        const name = ['companyName', 'schoolName', 'projectName', 'name', 'organizationName']
          .map((field) => asText(item[field]).trim()).find(Boolean);
        const role = asText(item.position).trim() || asText(item.role).trim();
        return { id: `${key}-${index}`, label: entryLabel(entry, key, index), primary: name || role || `${PROFILE_SECTION_LABELS[key]} ${index + 1}`, secondary: name && role !== name ? role : '' };
      }),
    })),
    { id: 'ai', label: 'Tạo CV AI', cue: 'Bản nháp mới', children: [] },
  ];
  const goToSection = (id: string) => {
    const target = document.getElementById(id);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ behavior: 'instant', block: 'start' });
  };

  const hasContent = useMemo(
    () => Boolean(profile.fullName.trim() || profile.experience.length || profile.education.length || profile.projects.length),
    [profile.education.length, profile.experience.length, profile.fullName, profile.projects.length],
  );

  if (user?.role !== 'USER' && user?.role !== 'ADMIN') {
    return <div className="p-8 text-center text-slate-600">Trang này chỉ dành cho ứng viên.</div>;
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 font-sans dark:bg-slate-950">
      <Header />
      <main className="flex-1 px-4 pb-48 pt-24 sm:px-6 sm:pt-28 lg:px-8 [&_button]:focus-visible:outline-2 [&_button]:focus-visible:outline-offset-2 [&_button]:focus-visible:outline-primary [&_select]:focus-visible:ring-2 [&_select]:focus-visible:ring-primary">
        <div className="mx-auto max-w-[1360px] space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">Hồ sơ nghề nghiệp</h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  Quản lý thông tin dùng chung cho các CV. Chọn mục cần cập nhật, lưu hồ sơ rồi tạo bản nháp CV bằng AI.
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-start gap-2">
                <p role="status" className="text-sm font-medium text-slate-600 dark:text-slate-300">{status}</p>
                <button type="button" disabled={isLoading || Boolean(loadError)} onClick={() => goToSection('ai')} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary/10 px-4 text-sm font-semibold text-primary disabled:opacity-50 dark:text-primary-light"><Sparkles className="h-4 w-4" />Đến phần tạo CV AI</button>
              </div>
            </div>
          </div>

          {conflict && (
            <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between">
              <span>Hồ sơ đã thay đổi trên thiết bị khác. Tải lại sẽ thay thế các thay đổi chưa lưu trên trang này.</span>
              <button type="button" disabled={isLoading || isSaving || isGenerating} onClick={() => { if (!isDirty || window.confirm('Thay thế thay đổi chưa lưu bằng hồ sơ mới nhất?')) void loadProfile(); }} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-700">Tải lại bản mới nhất</button>
            </div>
          )}

          {loadError && (
            <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300"><p>{loadError}</p><button type="button" onClick={() => void loadProfile()} className="mt-3 min-h-11 rounded-xl border border-current px-4 font-semibold">Thử tải lại</button></div>
          )}

          {isLoading ? (
            <div role="status" className="flex min-h-80 items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"><Loader2 className="h-6 w-6 animate-spin text-primary" />Đang tải hồ sơ…</div>
          ) : !loadError && (
            <div className="grid items-start gap-6 lg:grid-cols-[256px_minmax(0,1fr)] xl:grid-cols-[296px_minmax(0,1fr)]">
              <nav aria-label="Các mục trong hồ sơ" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 lg:hidden">Chuyển đến mục
                  <select defaultValue="" onChange={(event) => { goToSection(event.target.value); event.target.value = ''; }} className="mt-2 min-h-11 w-full min-w-0 max-w-full truncate rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"><option value="" disabled>Chọn mục trong hồ sơ</option>{sections.map((section) => <optgroup key={section.id} label={section.label}><option value={section.id}>{section.label} · {section.cue}</option>{section.children.map((child) => <option key={child.id} value={child.id}>{child.label}</option>)}</optgroup>)}</select>
                </label>
                <p className="hidden px-3 pb-3 pt-2 text-sm font-semibold text-slate-900 dark:text-slate-100 lg:block">Nội dung hồ sơ</p>
                <div className="hidden space-y-2 lg:block">{sections.map((section) => (
                  <div key={section.id}>
                    <div className="flex items-center">
                      <a href={`#${section.id}`} onClick={(event) => { event.preventDefault(); goToSection(section.id); }} className="flex min-h-12 min-w-0 flex-1 flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-xl px-3 py-2 text-sm font-semibold leading-5 text-slate-800 transition hover:bg-primary/10 hover:text-primary active:bg-primary/15 focus-visible:outline-2 focus-visible:outline-primary dark:text-slate-200"><span>{section.label}</span><span className="shrink-0 text-xs font-normal text-slate-600 dark:text-slate-400">{section.cue}</span></a>
                      {section.children.length > 0 && <button type="button" aria-label={`${expandedSections[section.id] ? 'Thu gọn' : 'Hiện mục con'}: ${section.label}`} aria-expanded={Boolean(expandedSections[section.id])} aria-controls={`nav-${section.id}`} onClick={() => setExpandedSections((current) => ({ ...current, [section.id]: !current[section.id] }))} className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-primary/10 hover:text-primary"><ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${expandedSections[section.id] ? 'rotate-180' : ''}`} /></button>}
                    </div>
                    {section.children.length > 0 && <ul id={`nav-${section.id}`} hidden={!expandedSections[section.id]} className="mb-2 ml-4 space-y-1 border-l-2 border-slate-200 pl-2 dark:border-slate-700">{section.children.map((child) => <li key={child.id}><a href={`#${child.id}`} title={child.label} onClick={(event) => { event.preventDefault(); goToSection(child.id); }} className="flex min-h-11 min-w-0 flex-col justify-center gap-1 break-words rounded-lg px-3 py-2 text-sm leading-5 text-slate-700 transition hover:bg-primary/10 hover:text-primary active:bg-primary/15 focus-visible:outline-2 focus-visible:outline-primary dark:text-slate-300 [overflow-wrap:anywhere]"><span className="font-medium">{child.primary}</span>{child.secondary && <span className="text-[13px] leading-5 text-slate-600 dark:text-slate-400">{child.secondary}</span>}</a></li>)}</ul>}
                  </div>
                ))}</div>
                <p className="hidden border-t border-slate-100 px-3 pt-3 text-xs leading-relaxed text-slate-500 dark:border-slate-800 dark:text-slate-400 lg:block">Chỉ thêm những mục phù hợp với bạn. Không cần điền tất cả.</p>
              </nav>
              <fieldset disabled={isLoading || Boolean(loadError) || isSaving || isGenerating} className="min-w-0 space-y-6 border-0 p-0 disabled:opacity-70" aria-label="Chỉnh sửa hồ sơ nghề nghiệp" aria-busy={isSaving || isGenerating}>
              <section id="base" tabIndex={-1} aria-label="Thông tin nền tảng" className="scroll-mt-28 rounded-3xl border border-slate-200/90 bg-white p-5 shadow-sm focus-visible:outline-2 focus-visible:outline-primary dark:border-slate-800 dark:bg-slate-900 sm:p-7">
                <div className="mb-5 flex items-start gap-3 border-b border-slate-100 pb-5 dark:border-slate-800">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light"><UserRound className="h-5 w-5" /></span>
                  <div><h2 className="text-base font-black text-slate-900 dark:text-white sm:text-lg">Thông tin nền tảng</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Email là thông tin bắt buộc để lưu. Các trường khác là tuỳ chọn.</p></div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Họ và tên" value={profile.fullName} onChange={(value) => updateProfile({ fullName: value })} placeholder="Nguyễn Văn A" />
                  <Field label="Email (bắt buộc)" value={profile.email} onChange={(value) => updateProfile({ email: value })} type="email" autoComplete="email" placeholder="email@example.com" />
                  <Field label="Số điện thoại" value={profile.phone} onChange={(value) => updateProfile({ phone: value })} type="tel" autoComplete="tel" placeholder="0901 234 567" />
                  <Field label="Liên kết cá nhân" value={profile.link} onChange={(value) => updateProfile({ link: value })} type="url" placeholder="LinkedIn, portfolio..." />
                  <Field label="Địa chỉ" value={profile.address} onChange={(value) => updateProfile({ address: value })} placeholder="Hà Nội" />
                  <Field label="Tiêu đề nghề nghiệp" value={profile.headline} onChange={(value) => updateProfile({ headline: value })} placeholder="Frontend Developer" />
                  <TextField label="Mục tiêu nghề nghiệp" value={profile.careerObjective} onChange={(value) => updateProfile({ careerObjective: value })} placeholder="Bạn muốn phát triển theo hướng nào?" />
                </div>
              </section>

              <ListSection section="experience" title="Kinh nghiệm làm việc" description="Các vị trí, trách nhiệm và kết quả nổi bật." icon={<BriefcaseBusiness className="h-5 w-5" />} entries={profile.experience as CareerExperienceEntry[]} onAdd={addEntry} onRemove={removeEntry} onMove={moveEntry} renderFields={(entry, index) => <><Field label="Công ty" value={entry.companyName} onChange={(value) => updateEntry('experience', index, 'companyName', value)} placeholder="Tên công ty" /><Field label="Vị trí" value={entry.position} onChange={(value) => updateEntry('experience', index, 'position', value)} placeholder="Chức danh" /><Field label="Từ tháng" value={entry.startDate} onChange={(value) => updateEntry('experience', index, 'startDate', value)} type="month" /><Field label="Đến tháng" value={entry.endDate} onChange={(value) => updateEntry('experience', index, 'endDate', value)} type="month" /><TextField autoGrow label="Mô tả và thành tựu" value={entry.description} onChange={(value) => updateEntry('experience', index, 'description', value)} placeholder="Mô tả trách nhiệm, kết quả, con số nổi bật..." /></>} />
              <ListSection section="education" title="Học vấn" description="Bằng cấp, chuyên ngành và quá trình đào tạo." icon={<GraduationCap className="h-5 w-5" />} entries={profile.education as CareerEducationEntry[]} onAdd={addEntry} onRemove={removeEntry} onMove={moveEntry} renderFields={(entry, index) => <><Field label="Trường / cơ sở đào tạo" value={entry.schoolName} onChange={(value) => updateEntry('education', index, 'schoolName', value)} placeholder="Tên trường" /><Field label="Bằng cấp" value={entry.degree} onChange={(value) => updateEntry('education', index, 'degree', value)} placeholder="Cử nhân, Kỹ sư..." /><Field label="Chuyên ngành" value={entry.major} onChange={(value) => updateEntry('education', index, 'major', value)} placeholder="Công nghệ thông tin" /><Field label="Từ tháng" value={entry.startDate} onChange={(value) => updateEntry('education', index, 'startDate', value)} type="month" /><Field label="Đến tháng" value={entry.endDate} onChange={(value) => updateEntry('education', index, 'endDate', value)} type="month" /><TextField label="Mô tả" value={entry.description} onChange={(value) => updateEntry('education', index, 'description', value)} placeholder="GPA, môn học hoặc hoạt động nổi bật..." /></>} />
              <ListSection section="projects" title="Dự án" description="Dự án cá nhân hoặc chuyên môn, tách biệt với hoạt động cộng đồng." icon={<FolderKanban className="h-5 w-5" />} entries={profile.projects as CareerProjectEntry[]} onAdd={addEntry} onRemove={removeEntry} onMove={moveEntry} renderFields={(entry, index) => <><Field label="Tên dự án" value={entry.projectName} onChange={(value) => updateEntry('projects', index, 'projectName', value)} placeholder="Tên sản phẩm / dự án" /><Field label="Vai trò" value={entry.role} onChange={(value) => updateEntry('projects', index, 'role', value)} placeholder="Người phát triển, trưởng nhóm..." /><Field label="Từ tháng" value={entry.startDate} onChange={(value) => updateEntry('projects', index, 'startDate', value)} type="month" /><Field label="Đến tháng" value={entry.endDate} onChange={(value) => updateEntry('projects', index, 'endDate', value)} type="month" /><Field label="Công nghệ sử dụng" value={entry.technologies} onChange={(value) => updateEntry('projects', index, 'technologies', value)} placeholder="React, NestJS, PostgreSQL" /><TextField autoGrow label="Mô tả dự án" value={entry.description} onChange={(value) => updateEntry('projects', index, 'description', value)} placeholder="Mục tiêu, đóng góp và kết quả..." /></>} />
              <section id="skills" tabIndex={-1} aria-label="Kỹ năng" className="min-w-0 scroll-mt-28 rounded-3xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">
                <div className="mb-5 flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary dark:text-primary-light"><Wrench className="h-5 w-5" /></span>
                  <div><h2 className="text-base font-black text-slate-900 dark:text-white sm:text-lg">Kỹ năng</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Tuỳ chọn · {profile.skills.filter((skill) => skill.name.trim()).length} kỹ năng đã nhập</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Thêm từng kỹ năng để AI chọn lọc theo vị trí ứng tuyển.</p></div>
                </div>
                <div className="flex min-w-0 flex-wrap gap-2">
                  {profile.skills.map((skill, index) => (
                    <span key={index} className="inline-flex max-w-full items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 pl-3 dark:border-slate-700 dark:bg-slate-800">
                      <span className="min-w-0 break-all text-sm text-slate-800 dark:text-slate-100">{skill.name.trim() || 'Kỹ năng chưa có tên'}</span>
                      <button type="button" aria-label={`Xóa kỹ năng ${skill.name || index + 1}`} onClick={() => removeEntry('skills', index)} className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:text-rose-600 dark:text-slate-400"><Trash2 aria-hidden="true" className="h-4 w-4" /></button>
                    </span>
                  ))}
                </div>
                {profile.skills.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">Chưa thêm kỹ năng.</p>}
                <div className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end">
                  <label className="min-w-0 flex-1 text-xs font-bold text-slate-700 dark:text-slate-200">Tên kỹ năng
                    <input ref={skillInputRef} value={skillDraft} onChange={(event) => { setSkillDraft(event.target.value); setSkillFeedback(''); }} onCompositionStart={() => { skillComposing.current = true; }} onCompositionEnd={() => { skillComposing.current = false; }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && !skillComposing.current && event.keyCode !== 229) { event.preventDefault(); addSkill(); } }} aria-describedby="skill-feedback" placeholder="Ví dụ: TypeScript" className="mt-1.5 min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                  </label>
                  <button type="button" onClick={addSkill} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark"><Plus aria-hidden="true" className="h-4 w-4" />Thêm kỹ năng</button>
                </div>
                <p id="skill-feedback" role="status" className="mt-2 text-xs text-slate-600 dark:text-slate-300">{skillFeedback || (skillDraft.trim() ? pendingSkillMessage : 'Nhấn Enter hoặc Thêm kỹ năng để thêm vào danh sách.')}</p>
              </section>
              <ListSection section="certificates" title="Chứng chỉ" description="Các chứng chỉ chuyên môn và liên kết xác thực (nếu có)." icon={<Award className="h-5 w-5" />} entries={profile.certificates as CareerCertificateEntry[]} onAdd={addEntry} onRemove={removeEntry} onMove={moveEntry} renderFields={(entry, index) => <><Field label="Tên chứng chỉ" value={entry.name} onChange={(value) => updateEntry('certificates', index, 'name', value)} placeholder="AWS Certified..." /><Field label="Đơn vị cấp" value={entry.issuer} onChange={(value) => updateEntry('certificates', index, 'issuer', value)} placeholder="Đơn vị cấp chứng chỉ" /><Field label="Ngày cấp" value={entry.date} onChange={(value) => updateEntry('certificates', index, 'date', value)} type="month" /><Field label="Liên kết xác thực" value={entry.credentialUrl} onChange={(value) => updateEntry('certificates', index, 'credentialUrl', value)} type="url" placeholder="https://..." /></>} />
              <ListSection section="activities" title="Hoạt động" description="Hoạt động câu lạc bộ, thiện nguyện hoặc cộng đồng." icon={<UsersRound className="h-5 w-5" />} entries={profile.activities as CareerActivityEntry[]} onAdd={addEntry} onRemove={removeEntry} onMove={moveEntry} renderFields={(entry, index) => <><Field label="Tổ chức" value={entry.organizationName} onChange={(value) => updateEntry('activities', index, 'organizationName', value)} placeholder="Tên tổ chức" /><Field label="Vai trò" value={entry.position} onChange={(value) => updateEntry('activities', index, 'position', value)} placeholder="Tình nguyện viên, thành viên..." /><Field label="Từ tháng" value={entry.startDate} onChange={(value) => updateEntry('activities', index, 'startDate', value)} type="month" /><Field label="Đến tháng" value={entry.endDate} onChange={(value) => updateEntry('activities', index, 'endDate', value)} type="month" /><TextField label="Mô tả hoạt động" value={entry.description} onChange={(value) => updateEntry('activities', index, 'description', value)} placeholder="Vai trò và đóng góp..." /></>} />
              <ListSection section="awards" title="Giải thưởng" description="Giải thưởng, học bổng hoặc ghi nhận nổi bật." icon={<Trophy className="h-5 w-5" />} entries={profile.awards as CareerAwardEntry[]} onAdd={addEntry} onRemove={removeEntry} onMove={moveEntry} renderFields={(entry, index) => <><Field label="Tên giải thưởng" value={entry.name} onChange={(value) => updateEntry('awards', index, 'name', value)} placeholder="Tên giải thưởng" /><Field label="Đơn vị trao" value={entry.issuer} onChange={(value) => updateEntry('awards', index, 'issuer', value)} placeholder="Đơn vị / cuộc thi" /><Field label="Thời điểm" value={entry.date} onChange={(value) => updateEntry('awards', index, 'date', value)} type="month" /><TextField label="Mô tả" value={entry.description} onChange={(value) => updateEntry('awards', index, 'description', value)} placeholder="Thành tích hoặc ý nghĩa giải thưởng..." /></>} />

              <section id="ai" tabIndex={-1} aria-label="Tạo CV AI" className="scroll-mt-28 rounded-3xl border border-primary/20 bg-primary/[0.04] p-5 shadow-sm focus-visible:outline-2 focus-visible:outline-primary dark:border-primary/30 dark:bg-primary/[0.08] sm:p-7">
                <div className="flex flex-col gap-5">
                  <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary dark:text-primary-light"><Sparkles className="h-5 w-5" /></span><div><h2 className="text-base font-black text-slate-900 dark:text-white sm:text-lg">Tạo CV AI từ hồ sơ này</h2><p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">AI sẽ tạo một bản nháp mới. Bạn vẫn có thể mở trình chỉnh sửa để thay đổi nội dung và bố cục trước khi sử dụng.</p></div></div>
                  <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                    <label className="space-y-1.5"><span className="text-xs font-bold text-slate-700 dark:text-slate-200">Mẫu CV</span><select value={templateType} onChange={(event) => setTemplateType(event.target.value as 'template1' | 'template2')} className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white"><option value="template1">Cổ điển chuyên nghiệp</option><option value="template2">Hiện đại nổi bật</option></select></label>
                    <label className="space-y-1.5"><span className="text-xs font-bold text-slate-700 dark:text-slate-200">Mã công việc (tuỳ chọn)</span><input value={jobId} onChange={(event) => setJobId(event.target.value)} placeholder="Dùng để tối ưu CV theo việc làm" className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></label>
                  </div>
                </div>
              <div className="mt-5 flex flex-col gap-4 border-t border-primary/10 pt-5">
                  <p className="text-sm text-slate-600 dark:text-slate-300">{hasContent ? 'Khi tạo CV, thay đổi chưa lưu sẽ được lưu trước. Nội dung CV sẽ dùng ngôn ngữ bạn chọn bên dưới.' : 'Thêm thông tin cơ bản trước khi tạo CV.'}</p>
                  <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-end">
                    <fieldset className="space-y-1.5">
                      <legend className="text-xs font-bold text-slate-700 dark:text-slate-200">Ngôn ngữ CV</legend>
                      <div className="inline-flex w-full items-center rounded-xl border border-slate-200/80 bg-slate-100 p-0.5 dark:border-slate-700/80 dark:bg-slate-800 sm:w-auto">
                        <button
                          type="button"
                          aria-pressed={generationLocale === 'vi-VN'}
                          onClick={() => setGenerationLocale('vi-VN')}
                          className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold transition-all sm:flex-none ${generationLocale === 'vi-VN' ? 'bg-white text-primary shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}
                        >
                          Tiếng Việt
                        </button>
                        <button
                          type="button"
                          aria-pressed={generationLocale === 'en-US'}
                          onClick={() => setGenerationLocale('en-US')}
                          className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold transition-all sm:flex-none ${generationLocale === 'en-US' ? 'bg-white text-primary shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}
                        >
                          English
                        </button>
                      </div>
                    </fieldset>
                    <button type="button" disabled={isGenerating || isSaving || !hasContent || conflict || Boolean(validationMessage)} onClick={() => void handleGenerate()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white shadow-md shadow-primary/20 transition hover:bg-primary-dark active:scale-95 disabled:cursor-not-allowed disabled:opacity-50" aria-label={`${uiVi ? 'Tạo CV AI bằng' : 'Create AI CV in'} ${generationLanguageLabel}`}>
                      {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Globe className="h-4 w-4" /><Sparkles className="h-4 w-4" /></>}
                      {isGenerating ? `${uiVi ? 'Đang tạo CV' : 'Creating CV'} · ${generationLanguageLabel}...` : `${uiVi ? 'Tạo CV AI' : 'Create AI CV'} · ${generationLanguageLabel}`}
                    </button>
                  </div>
                </div>
               </section>

              </fieldset>
            </div>
          )}
          <div className="sticky bottom-4 z-30 ml-auto mr-20 flex max-w-4xl flex-col gap-2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 sm:bottom-6 sm:mr-24 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-4 [&_button]:focus-visible:outline-2 [&_button]:focus-visible:outline-primary">
            <div className="min-w-0" aria-live="polite"><p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{status}</p><p className="mt-1 break-words text-xs leading-relaxed text-slate-500 dark:text-slate-400">{generationSaveErrorText || (isGenerating ? (uiVi ? 'Vui lòng chờ, các trường tạm khoá để giữ đúng nội dung.' : 'Please wait. Fields are temporarily locked to preserve your content.') : saveError || (isLoading ? 'Chờ tải dữ liệu trước khi chỉnh sửa.' : loadError ? 'Thử tải lại hồ sơ để tiếp tục.' : conflict ? 'Tải lại bản mới nhất trước khi lưu.' : isSaving ? 'Vui lòng chờ, các trường tạm khoá để giữ đúng nội dung.' : validationMessage || (!isDirty && !isNew ? 'Chưa có thay đổi mới để lưu.' : 'Nhấn Lưu hồ sơ để giữ lại thay đổi.')))}</p></div>
            <button type="button" onClick={() => void handleSave()} disabled={isLoading || Boolean(loadError) || conflict || (!isDirty && !isNew) || isSaving || isGenerating || Boolean(validationMessage)} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50">{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{isSaving ? 'Đang lưu…' : 'Lưu hồ sơ'}</button>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
