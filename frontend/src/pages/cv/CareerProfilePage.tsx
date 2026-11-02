import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
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
  CareerSkillEntry,
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

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'month' | 'url';
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{label}</span>
      <input
        type={type}
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="space-y-1.5 sm:col-span-2">
      <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{label}</span>
      <textarea
        rows={3}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
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
  return (
    <section className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 dark:border-slate-800 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light">
            {icon}
          </span>
          <div>
            <h2 className="text-base font-black text-slate-900 dark:text-white sm:text-lg">{title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onAdd(section)}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-primary-dark active:scale-95"
        >
          <Plus className="h-4 w-4" /> Thêm mục
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-500">
          Chưa có dữ liệu. Bạn có thể thêm mục đầu tiên để dùng lại cho nhiều CV.
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {entries.map((entry, index) => (
            <div key={`${section}-${index}`} className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-800/35 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Mục {index + 1}</span>
                <div className="flex items-center gap-1">
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
    </section>
  );
}

export default function CareerProfilePage() {
  const { user, accessToken } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<CandidateCareerProfile>(() => emptyProfile(user?.name, user?.email));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [templateType, setTemplateType] = useState<'template1' | 'template2'>('template1');
  const [jobId, setJobId] = useState('');
  const [generationLocale, setGenerationLocale] = useState<CareerProfileCvLocale>('vi-VN');

  const loadProfile = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setLoadError('');
    try {
      const response = await careerProfileApi.getMe(accessToken);
      setProfile(normalizeProfile(response, user?.name, user?.email));
      setIsDirty(false);
      setConflict(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setProfile(emptyProfile(user?.name, user?.email));
        setIsDirty(false);
      } else {
        setLoadError(error instanceof Error ? error.message : 'Không thể tải hồ sơ nghề nghiệp.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, user?.email, user?.name]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const updateProfile = (patch: Partial<CandidateCareerProfile>) => {
    setProfile((current) => ({ ...current, ...patch }));
    setIsDirty(true);
    setConflict(false);
  };

  const updateEntry = (section: ListSectionKey, index: number, key: string, value: string) => {
    setProfile((current) => ({
      ...current,
      [section]: (current[section] as unknown as Entry[]).map((entry, itemIndex) =>
        itemIndex === index ? { ...entry, [key]: value } : entry,
      ),
    }));
    setIsDirty(true);
    setConflict(false);
  };

  const addEntry = (section: ListSectionKey) => {
    setProfile((current) => ({
      ...current,
      [section]: [...(current[section] as unknown as Entry[]), { ...emptyEntries[section] }],
    }));
    setIsDirty(true);
  };

  const removeEntry = (section: ListSectionKey, index: number) => {
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
    const validationMessage = validateProfileBeforeSave(profile);
    if (validationMessage) throw new ProfileSaveError(validationMessage);
    if (!accessToken) throw new ProfileSaveError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');

    setIsSaving(true);
    try {
      const input = mapCandidateCareerProfileToInput(profile);
      const response = await careerProfileApi.updateMe(input, accessToken);
      const saved = normalizeProfile(response, user?.name, user?.email);
      setProfile(saved);
      setIsDirty(false);
      setConflict(false);
      toast.success('Đã lưu hồ sơ nghề nghiệp');
      return saved;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) setConflict(true);
      throw new ProfileSaveError(profileSaveErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }, [accessToken, profile, toast, user?.email, user?.name]);

  const handleSave = async () => {
    try {
      await saveProfile();
    } catch (error) {
      toast.error('Không thể lưu hồ sơ', profileSaveErrorMessage(error));
    }
  };

  const handleGenerate = async () => {
    if (!accessToken) return;
    setIsGenerating(true);
    try {
      const saved = isDirty ? await saveProfile() : profile;
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
      toast.success('Đã tiếp nhận yêu cầu tạo CV AI');
      navigate(`/cv-editor/${response.onlineCvId}?generation=${encodeURIComponent(response.operationId)}`);
    } catch (error) {
      if (error instanceof ProfileSaveError) {
        toast.error('Không thể lưu hồ sơ', error.message);
      } else {
        toast.error('Không thể tạo CV AI', 'Không thể tạo CV lúc này. Vui lòng thử lại sau.');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const generationLanguageLabel = generationLocale === 'vi-VN' ? 'Tiếng Việt' : 'English';

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
      <main className="flex-1 px-4 pb-16 pt-24 sm:px-6 sm:pt-28 lg:px-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="relative overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-r from-primary/10 via-sky-500/10 to-indigo-500/10 p-6 dark:border-primary/20 sm:p-8">
            <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary dark:text-primary-light">
                  <BriefcaseBusiness className="h-3.5 w-3.5" /> Hồ sơ nghề nghiệp
                </div>
                <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-3xl">Một hồ sơ, nhiều CV phù hợp</h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  Lưu kinh nghiệm, học vấn và thành tích một lần. Khi tạo CV AI, dữ liệu này sẽ được dùng lại để bạn chỉ cần tinh chỉnh bản CV cuối cùng.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 rounded-2xl border border-white/70 bg-white/70 px-3.5 py-2.5 text-xs text-slate-600 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-300">
                <span className={`h-2 w-2 rounded-full ${isDirty ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                {isDirty ? 'Có thay đổi chưa lưu' : `Phiên bản ${profile.contentVersion}`}
              </div>
            </div>
          </div>

          {conflict && (
            <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between">
              <span>Hồ sơ đã thay đổi trên thiết bị khác. Bản đang nhập chưa bị xóa; hãy tải dữ liệu mới nhất trước khi tiếp tục.</span>
              <button type="button" onClick={() => void loadProfile()} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-700">Tải lại bản mới nhất</button>
            </div>
          )}

          {loadError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">{loadError}</div>
          )}

          {isLoading ? (
            <div className="flex min-h-80 items-center justify-center rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : (
            <>
              <section className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">
                <div className="mb-5 flex items-start gap-3 border-b border-slate-100 pb-5 dark:border-slate-800">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light"><UserRound className="h-5 w-5" /></span>
                  <div><h2 className="text-base font-black text-slate-900 dark:text-white sm:text-lg">Thông tin nền tảng</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Thông tin liên hệ và định hướng có thể dùng trong mọi CV.</p></div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Họ và tên" value={profile.fullName} onChange={(value) => updateProfile({ fullName: value })} placeholder="Nguyễn Văn A" />
                  <Field label="Email" value={profile.email} onChange={(value) => updateProfile({ email: value })} type="text" placeholder="email@example.com" />
                  <Field label="Số điện thoại" value={profile.phone} onChange={(value) => updateProfile({ phone: value })} placeholder="0901 234 567" />
                  <Field label="Liên kết cá nhân" value={profile.link} onChange={(value) => updateProfile({ link: value })} type="url" placeholder="LinkedIn, portfolio..." />
                  <Field label="Địa chỉ" value={profile.address} onChange={(value) => updateProfile({ address: value })} placeholder="Hà Nội" />
                  <Field label="Tiêu đề nghề nghiệp" value={profile.headline} onChange={(value) => updateProfile({ headline: value })} placeholder="Frontend Developer" />
                  <TextField label="Mục tiêu nghề nghiệp" value={profile.careerObjective} onChange={(value) => updateProfile({ careerObjective: value })} placeholder="Bạn muốn phát triển theo hướng nào?" />
                </div>
              </section>

              <ListSection section="experience" title="Kinh nghiệm làm việc" description="Các vị trí, trách nhiệm và kết quả nổi bật." icon={<BriefcaseBusiness className="h-5 w-5" />} entries={profile.experience as CareerExperienceEntry[]} onAdd={addEntry} onRemove={removeEntry} onMove={moveEntry} renderFields={(entry, index) => <><Field label="Công ty" value={entry.companyName} onChange={(value) => updateEntry('experience', index, 'companyName', value)} placeholder="Tên công ty" /><Field label="Vị trí" value={entry.position} onChange={(value) => updateEntry('experience', index, 'position', value)} placeholder="Chức danh" /><Field label="Từ tháng" value={entry.startDate} onChange={(value) => updateEntry('experience', index, 'startDate', value)} type="month" /><Field label="Đến tháng" value={entry.endDate} onChange={(value) => updateEntry('experience', index, 'endDate', value)} type="month" /><TextField label="Mô tả và thành tựu" value={entry.description} onChange={(value) => updateEntry('experience', index, 'description', value)} placeholder="Mô tả trách nhiệm, kết quả, con số nổi bật..." /></>} />
              <ListSection section="education" title="Học vấn" description="Bằng cấp, chuyên ngành và quá trình đào tạo." icon={<GraduationCap className="h-5 w-5" />} entries={profile.education as CareerEducationEntry[]} onAdd={addEntry} onRemove={removeEntry} onMove={moveEntry} renderFields={(entry, index) => <><Field label="Trường / cơ sở đào tạo" value={entry.schoolName} onChange={(value) => updateEntry('education', index, 'schoolName', value)} placeholder="Tên trường" /><Field label="Bằng cấp" value={entry.degree} onChange={(value) => updateEntry('education', index, 'degree', value)} placeholder="Cử nhân, Kỹ sư..." /><Field label="Chuyên ngành" value={entry.major} onChange={(value) => updateEntry('education', index, 'major', value)} placeholder="Công nghệ thông tin" /><Field label="Từ tháng" value={entry.startDate} onChange={(value) => updateEntry('education', index, 'startDate', value)} type="month" /><Field label="Đến tháng" value={entry.endDate} onChange={(value) => updateEntry('education', index, 'endDate', value)} type="month" /><TextField label="Mô tả" value={entry.description} onChange={(value) => updateEntry('education', index, 'description', value)} placeholder="GPA, môn học hoặc hoạt động nổi bật..." /></>} />
              <ListSection section="projects" title="Dự án" description="Dự án cá nhân hoặc chuyên môn, tách biệt với hoạt động cộng đồng." icon={<FolderKanban className="h-5 w-5" />} entries={profile.projects as CareerProjectEntry[]} onAdd={addEntry} onRemove={removeEntry} onMove={moveEntry} renderFields={(entry, index) => <><Field label="Tên dự án" value={entry.projectName} onChange={(value) => updateEntry('projects', index, 'projectName', value)} placeholder="Tên sản phẩm / dự án" /><Field label="Vai trò" value={entry.role} onChange={(value) => updateEntry('projects', index, 'role', value)} placeholder="Người phát triển, trưởng nhóm..." /><Field label="Từ tháng" value={entry.startDate} onChange={(value) => updateEntry('projects', index, 'startDate', value)} type="month" /><Field label="Đến tháng" value={entry.endDate} onChange={(value) => updateEntry('projects', index, 'endDate', value)} type="month" /><Field label="Công nghệ sử dụng" value={entry.technologies} onChange={(value) => updateEntry('projects', index, 'technologies', value)} placeholder="React, NestJS, PostgreSQL" /><TextField label="Mô tả dự án" value={entry.description} onChange={(value) => updateEntry('projects', index, 'description', value)} placeholder="Mục tiêu, đóng góp và kết quả..." /></>} />
              <ListSection section="skills" title="Kỹ năng" description="Danh sách kỹ năng để AI chọn lọc theo từng vị trí ứng tuyển." icon={<Wrench className="h-5 w-5" />} entries={profile.skills as CareerSkillEntry[]} onAdd={addEntry} onRemove={removeEntry} onMove={moveEntry} renderFields={(entry, index) => <><Field label="Kỹ năng" value={entry.name} onChange={(value) => updateEntry('skills', index, 'name', value)} placeholder="TypeScript" /><Field label="Mức độ / ghi chú" value={entry.level} onChange={(value) => updateEntry('skills', index, 'level', value)} placeholder="Thành thạo, 3 năm kinh nghiệm..." /></>} />
              <ListSection section="certificates" title="Chứng chỉ" description="Các chứng chỉ chuyên môn và liên kết xác thực (nếu có)." icon={<Award className="h-5 w-5" />} entries={profile.certificates as CareerCertificateEntry[]} onAdd={addEntry} onRemove={removeEntry} onMove={moveEntry} renderFields={(entry, index) => <><Field label="Tên chứng chỉ" value={entry.name} onChange={(value) => updateEntry('certificates', index, 'name', value)} placeholder="AWS Certified..." /><Field label="Đơn vị cấp" value={entry.issuer} onChange={(value) => updateEntry('certificates', index, 'issuer', value)} placeholder="Đơn vị cấp chứng chỉ" /><Field label="Ngày cấp" value={entry.date} onChange={(value) => updateEntry('certificates', index, 'date', value)} type="month" /><Field label="Liên kết xác thực" value={entry.credentialUrl} onChange={(value) => updateEntry('certificates', index, 'credentialUrl', value)} type="url" placeholder="https://..." /></>} />
              <ListSection section="activities" title="Hoạt động" description="Hoạt động câu lạc bộ, thiện nguyện hoặc cộng đồng." icon={<UsersRound className="h-5 w-5" />} entries={profile.activities as CareerActivityEntry[]} onAdd={addEntry} onRemove={removeEntry} onMove={moveEntry} renderFields={(entry, index) => <><Field label="Tổ chức" value={entry.organizationName} onChange={(value) => updateEntry('activities', index, 'organizationName', value)} placeholder="Tên tổ chức" /><Field label="Vai trò" value={entry.position} onChange={(value) => updateEntry('activities', index, 'position', value)} placeholder="Tình nguyện viên, thành viên..." /><Field label="Từ tháng" value={entry.startDate} onChange={(value) => updateEntry('activities', index, 'startDate', value)} type="month" /><Field label="Đến tháng" value={entry.endDate} onChange={(value) => updateEntry('activities', index, 'endDate', value)} type="month" /><TextField label="Mô tả hoạt động" value={entry.description} onChange={(value) => updateEntry('activities', index, 'description', value)} placeholder="Vai trò và đóng góp..." /></>} />
              <ListSection section="awards" title="Giải thưởng" description="Giải thưởng, học bổng hoặc ghi nhận nổi bật." icon={<Trophy className="h-5 w-5" />} entries={profile.awards as CareerAwardEntry[]} onAdd={addEntry} onRemove={removeEntry} onMove={moveEntry} renderFields={(entry, index) => <><Field label="Tên giải thưởng" value={entry.name} onChange={(value) => updateEntry('awards', index, 'name', value)} placeholder="Tên giải thưởng" /><Field label="Đơn vị trao" value={entry.issuer} onChange={(value) => updateEntry('awards', index, 'issuer', value)} placeholder="Đơn vị / cuộc thi" /><Field label="Thời điểm" value={entry.date} onChange={(value) => updateEntry('awards', index, 'date', value)} type="month" /><TextField label="Mô tả" value={entry.description} onChange={(value) => updateEntry('awards', index, 'description', value)} placeholder="Thành tích hoặc ý nghĩa giải thưởng..." /></>} />

              <section className="rounded-3xl border border-primary/20 bg-primary/[0.04] p-5 shadow-sm dark:border-primary/30 dark:bg-primary/[0.08] sm:p-7">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary dark:text-primary-light"><Sparkles className="h-5 w-5" /></span><div><h2 className="text-base font-black text-slate-900 dark:text-white sm:text-lg">Tạo CV AI từ hồ sơ này</h2><p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">AI sẽ tạo một bản nháp mới. Bạn vẫn có thể mở trình chỉnh sửa để thay đổi nội dung và bố cục trước khi sử dụng.</p></div></div>
                  <div className="flex w-full flex-col gap-3 sm:w-auto sm:min-w-64">
                    <label className="space-y-1.5"><span className="text-xs font-bold text-slate-700 dark:text-slate-200">Mẫu CV</span><select value={templateType} onChange={(event) => setTemplateType(event.target.value as 'template1' | 'template2')} className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white"><option value="template1">Cổ điển chuyên nghiệp</option><option value="template2">Hiện đại nổi bật</option></select></label>
                    <label className="space-y-1.5"><span className="text-xs font-bold text-slate-700 dark:text-slate-200">Mã công việc (tuỳ chọn)</span><input value={jobId} onChange={(event) => setJobId(event.target.value)} placeholder="Dùng để tối ưu CV theo việc làm" className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></label>
                  </div>
                </div>
              <div className="mt-5 flex flex-col-reverse gap-4 border-t border-primary/10 pt-5 sm:flex-row sm:items-end sm:justify-between">
                  <p className="text-xs text-slate-500 dark:text-slate-400">{hasContent ? 'Dữ liệu sẽ được lưu làm nguồn dùng chung cho các CV sau.' : 'Thêm ít nhất thông tin cơ bản trước khi tạo CV.'}</p>
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
                    <button type="button" disabled={isGenerating || isSaving || !hasContent} onClick={() => void handleGenerate()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white shadow-md shadow-primary/20 transition hover:bg-primary-dark active:scale-95 disabled:cursor-not-allowed disabled:opacity-50" aria-label={`Tạo CV AI bằng ${generationLanguageLabel}`}>
                      {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Globe className="h-4 w-4" /><Sparkles className="h-4 w-4" /></>}
                      {isGenerating ? `Đang tạo CV · ${generationLanguageLabel}...` : `Tạo CV AI · ${generationLanguageLabel}`}
                    </button>
                  </div>
                </div>
               </section>

              <div className="sticky bottom-4 z-10 flex flex-col items-stretch justify-end gap-3 rounded-2xl border border-slate-200/80 bg-white/95 p-3 shadow-xl backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 sm:flex-row sm:items-center">
                {isDirty && <span className="mr-auto text-xs text-amber-600 dark:text-amber-400">Bạn có thay đổi chưa lưu</span>}
                <button type="button" onClick={() => void handleSave()} disabled={!isDirty || isSaving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-primary/20 transition hover:bg-primary-dark active:scale-95 disabled:cursor-not-allowed disabled:opacity-50">{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{isSaving ? 'Đang lưu...' : 'Lưu hồ sơ'}</button>
              </div>
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
