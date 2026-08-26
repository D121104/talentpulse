import { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Briefcase,
  Calendar,
  Check,
  CheckCircle2,
  Database,
  DollarSign,
  Layers,
  Loader2,
  MapPin,
  Plus,
  Save,
  Search,
  Sparkles,
  Tag,
  X,
  Zap,
} from 'lucide-react';
import {
  employerApi,
  type CompanyInfo,
  type HrJobItem,
  type SkillItem,
} from '../../../lib/employerApi';
import { useAuth } from '../../../auth/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { RichTextEditor } from '../../../components/common/RichTextEditor';

export interface JobFormData {
  name: string;
  skills: string[];
  salary: number;
  quantity: number;
  level: string;
  description: string;
  location: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

interface JobEditorViewProps {
  company: CompanyInfo | null;
  editingJob: HrJobItem | null;
  initialData?: JobFormData;
  isSubmitting: boolean;
  onSave: (data: JobFormData) => Promise<void>;
  onCancel: () => void;
}

const JOB_LEVELS = [
  { value: 'INTERN', label: 'Thực tập sinh (Intern)' },
  { value: 'FRESHER', label: 'Mới đi làm (Fresher)' },
  { value: 'JUNIOR', label: 'Junior (1 - 2 năm)' },
  { value: 'MIDDLE', label: 'Middle (2 - 4 năm)' },
  { value: 'SENIOR', label: 'Senior (4+ năm)' },
  { value: 'LEAD', label: 'Trưởng nhóm (Lead)' },
  { value: 'MANAGER', label: 'Quản lý (Manager)' },
];

const QUICK_LOCATIONS = [
  'Hà Nội',
  'TP. Hồ Chí Minh',
  'Đà Nẵng',
  'Cần Thơ',
  'Hải Phòng',
  'Remote / Làm từ xa',
  'Hybrid / Linh hoạt',
];

const DEFAULT_FALLBACK_SKILLS = [
  'React',
  'TypeScript',
  'Node.js',
  'NestJS',
  'PostgreSQL',
  'TailwindCSS',
  'Next.js',
  'Python',
  'Java',
  'Docker',
  'Redis',
  'AWS',
  'Figma',
  'Golang',
  'Vue.js',
];

export function JobEditorView({
  company,
  editingJob,
  initialData,
  isSubmitting,
  onSave,
  onCancel,
}: JobEditorViewProps) {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const { success, info } = useToast();

  const [formData, setFormData] = useState<JobFormData>(
    initialData || {
      name: editingJob?.name || '',
      skills: editingJob?.skills || ['React', 'TypeScript'],
      salary: editingJob?.salary || 15000000,
      quantity: editingJob?.quantity || 1,
      level: editingJob?.level || 'MIDDLE',
      description: editingJob?.description || '',
      location: editingJob?.location || company?.address || 'Hà Nội',
      startDate: editingJob?.startDate
        ? new Date(editingJob.startDate).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
      endDate: editingJob?.endDate
        ? new Date(editingJob.endDate).toISOString().split('T')[0]
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      isActive: editingJob ? editingJob.isActive !== false : true,
    },
  );

  // =========================================================================
  // SKILLS FROM DATABASE & DEBOUNCE SEARCH STATE
  // =========================================================================
  const [dbSkills, setDbSkills] = useState<SkillItem[]>([]);
  const [skillInput, setSkillInput] = useState('');
  const [debouncedSkillInput, setDebouncedSkillInput] = useState('');
  const [isSearchingSkills, setIsSearchingSkills] = useState(false);
  const [isCreatingSkill, setIsCreatingSkill] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const skillInputRef = useRef<HTMLInputElement>(null);
  const skillDropdownRef = useRef<HTMLDivElement>(null);

  // 1. Initial Load of Skills from Database
  useEffect(() => {
    let isMounted = true;
    const fetchInitialSkills = async () => {
      try {
        const res = await employerApi.getSkills({ pageSize: 100 }, accessToken || undefined);
        if (isMounted && res?.result && Array.isArray(res.result)) {
          setDbSkills(res.result);
        }
      } catch (err) {
        console.error('Failed to load initial skills from database', err);
      }
    };

    void fetchInitialSkills();
    return () => {
      isMounted = false;
    };
  }, [accessToken]);

  // 2. Debounce skillInput changes (250ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSkillInput(skillInput.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [skillInput]);

  // 3. Search DB when debounced input changes
  useEffect(() => {
    let isCurrent = true;
    const searchSkillsInDb = async () => {
      if (!debouncedSkillInput) return;
      setIsSearchingSkills(true);
      try {
        const res = await employerApi.getSkills(
          { name: debouncedSkillInput, pageSize: 30 },
          accessToken || undefined,
        );
        if (isCurrent && res?.result && Array.isArray(res.result)) {
          // Merge with existing skills in state without duplicating
          setDbSkills((prev) => {
            const map = new Map<string, SkillItem>();
            prev.forEach((s) => map.set(s.name.toLowerCase(), s));
            res.result.forEach((s) => map.set(s.name.toLowerCase(), s));
            return Array.from(map.values());
          });
        }
      } catch (err) {
        console.error('Failed to search skills in DB', err);
      } finally {
        if (isCurrent) {
          setIsSearchingSkills(false);
        }
      }
    };

    void searchSkillsInDb();
    return () => {
      isCurrent = false;
    };
  }, [debouncedSkillInput, accessToken]);

  // 4. Click outside dropdown listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        skillDropdownRef.current &&
        !skillDropdownRef.current.contains(e.target as Node) &&
        skillInputRef.current &&
        !skillInputRef.current.contains(e.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 5. Suggestions computation (matching existing skills + new skill option)
  const suggestions = useMemo(() => {
    const trimmed = skillInput.trim().toLowerCase();

    // Match existing skills in DB
    const matches = dbSkills.filter((s) =>
      trimmed ? s.name.toLowerCase().includes(trimmed) : true,
    );

    // Check if there is an exact match
    const hasExactMatch = dbSkills.some((s) => s.name.toLowerCase() === trimmed);

    const list: Array<{ _id?: string; name: string; isNew?: boolean }> = matches.slice(0, 8);

    // If user typed something not matching any existing skill in DB, add "Create New Skill" option
    if (trimmed.length > 0 && !hasExactMatch) {
      list.push({
        name: skillInput.trim(),
        isNew: true,
      });
    }

    return list;
  }, [dbSkills, skillInput]);

  // 6. Handle Adding or Creating Skill
  const handleSelectSkill = async (item: { name: string; isNew?: boolean }) => {
    const targetName = item.name.trim();
    if (!targetName) return;

    // Check if skill is already selected in the job form
    const isAlreadyAdded = formData.skills.some(
      (s) => s.toLowerCase() === targetName.toLowerCase(),
    );

    if (isAlreadyAdded) {
      info(`Kỹ năng "${targetName}" đã có trong danh sách yêu cầu`);
      setSkillInput('');
      setIsDropdownOpen(false);
      return;
    }

    // Case A: Create new skill in DB automatically
    if (item.isNew) {
      setIsCreatingSkill(true);
      try {
        if (accessToken) {
          const created = await employerApi.createSkill({ name: targetName }, accessToken);
          if (created && created._id) {
            setDbSkills((prev) => [...prev, created]);
          }
          success(`✨ Đã tự động tạo kỹ năng mới "${targetName}" trong cơ sở dữ liệu hệ thống!`);
        }
      } catch (err: any) {
        // If skill already existed on backend, still proceed gracefully
        console.warn('Skill create response:', err?.message);
      } finally {
        setIsCreatingSkill(false);
      }
    }

    // Add skill to Job form
    setFormData((prev) => ({
      ...prev,
      skills: [...prev.skills, targetName],
    }));

    setSkillInput('');
    setIsDropdownOpen(false);
    setHighlightedIndex(-1);
    skillInputRef.current?.focus();
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    setFormData((prev) => ({
      ...prev,
      skills: prev.skills.filter((s) => s !== skillToRemove),
    }));
  };

  // Keyboard navigation for dropdown
  const handleKeyDownSkill = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isDropdownOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setIsDropdownOpen(true);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        void handleSelectSkill(suggestions[highlightedIndex]);
      } else if (skillInput.trim()) {
        const exactMatch = dbSkills.find(
          (s) => s.name.toLowerCase() === skillInput.trim().toLowerCase(),
        );
        if (exactMatch) {
          void handleSelectSkill({ name: exactMatch.name });
        } else {
          void handleSelectSkill({ name: skillInput.trim(), isNew: true });
        }
      }
    } else if (e.key === 'Escape') {
      setIsDropdownOpen(false);
    }
  };

  // Top suggested skills chips from DB or fallback
  const topSuggestedSkills = useMemo(() => {
    if (dbSkills.length > 0) {
      return dbSkills.slice(0, 16).map((s) => s.name);
    }
    return DEFAULT_FALLBACK_SKILLS;
  }, [dbSkills]);

  // Readiness Checklist Calculation (For AI Job-Candidate Matching)
  const checklist = useMemo(() => {
    const isNameOk = formData.name.trim().length >= 5;
    const isSkillsOk = formData.skills.length >= 2;
    const isDescOk = formData.description.trim().length >= 40 && formData.description !== '<p></p>';
    const isSalaryOk = Number(formData.salary) > 0;
    const isLocationOk = formData.location.trim().length > 0;
    const isDateOk = new Date(formData.endDate) > new Date(formData.startDate);

    let score = 0;
    if (isNameOk) score += 20;
    if (isSkillsOk) score += 20;
    if (isDescOk) score += 30;
    if (isSalaryOk) score += 10;
    if (isLocationOk) score += 10;
    if (isDateOk) score += 10;

    return {
      isNameOk,
      isSkillsOk,
      isDescOk,
      isSalaryOk,
      isLocationOk,
      isDateOk,
      score,
    };
  }, [formData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void onSave(formData);
  };

  const daysRemaining = useMemo(() => {
    const end = new Date(formData.endDate).getTime();
    const now = new Date().getTime();
    const diff = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  }, [formData.endDate]);

  return (
    <div className="space-y-6 pb-16 animate-fade-in-up">
      {/* ========================================================================= */}
      {/* 1. TOP HEADER & BREADCRUMB BAR                                            */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-4 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="group flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-primary hover:bg-primary/5 hover:text-primary active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 cursor-pointer shadow-2xs"
            title="Quay lại danh sách tin"
          >
            <ArrowLeft className="h-5 w-5 transition group-hover:-translate-x-0.5" />
          </button>

          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <span
                onClick={onCancel}
                className="hover:text-primary cursor-pointer transition"
              >
                {t('employer.jobsTab.title', 'Chiến dịch tuyển dụng')}
              </span>
              <span>/</span>
              <span className="text-primary font-bold">
                {editingJob ? 'Chỉnh sửa tin' : 'Đăng tin mới'}
              </span>
            </div>
            <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">
              {editingJob
                ? `Chỉnh sửa: ${editingJob.name}`
                : 'Tạo chiến dịch / Đăng tin tuyển dụng mới'}
            </h1>
          </div>
        </div>

        {/* Action CTAs */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 active:scale-95 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition cursor-pointer"
          >
            Hủy bỏ
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-dark px-6 py-2.5 text-xs font-bold text-white shadow-lg shadow-primary/25 hover:from-primary-dark hover:to-primary active:scale-95 disabled:opacity-50 transition cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Đang lưu...</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                <span>
                  {editingJob
                    ? t('employer.jobsTab.submitEditBtn', 'Cập nhật tin')
                    : t('employer.jobsTab.submitCreateBtn', 'Đăng tin tuyển dụng')}
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. MAIN 2-COLUMN EDITOR LAYOUT                                            */}
      {/* ========================================================================= */}
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* --------------------------------------------------------------------- */}
          {/* LEFT COLUMN: PRIMARY DETAILS & RICH TEXT CANVAS (8 COLS)             */}
          {/* --------------------------------------------------------------------- */}
          <div className="space-y-6 lg:col-span-8">
            {/* Card 1: Job Title & Level */}
            <div className="rounded-3xl border border-slate-200/90 bg-white p-6 sm:p-7 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary dark:bg-primary/20">
                    <Briefcase className="h-4.5 w-4.5" />
                  </span>
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      1. Tiêu đề & Cấp bậc vị trí
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Tên vị trí rõ ràng giúp ứng viên tìm thấy nhanh hơn và tăng độ chính xác của AI Matching
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {/* Title Input */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    {t('employer.jobsTab.jobNameLabel', 'Tiêu đề vị trí tuyển dụng')}{' '}
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="VD: Senior Fullstack React & Node.js Developer (Lương tới 40M)..."
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white transition"
                  />
                </div>

                {/* Level Quick Select */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                    {t('employer.jobsTab.levelLabel', 'Cấp bậc ứng tuyển')}{' '}
                    <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {JOB_LEVELS.map((lvl) => {
                      const isSelected = formData.level === lvl.value;
                      return (
                        <button
                          key={lvl.value}
                          type="button"
                          onClick={() => setFormData({ ...formData, level: lvl.value })}
                          className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition active:scale-95 cursor-pointer ${
                            isSelected
                              ? 'bg-primary text-white shadow-md shadow-primary/20'
                              : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                          }`}
                        >
                          {isSelected && <Check className="h-3.5 w-3.5" />}
                          <span>{lvl.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: Skill Requirements Builder with Real-time DB Search & Auto-Create */}
            <div className="rounded-3xl border border-slate-200/90 bg-white p-6 sm:p-7 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
                    <Sparkles className="h-4.5 w-4.5" />
                  </span>
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <span>2. Kỹ năng & Công nghệ yêu cầu</span>
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                        <Database className="h-3 w-3" />
                        <span>Đồng bộ CSDL</span>
                      </span>
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Gõ tên kỹ năng để tìm kiếm từ cơ sở dữ liệu. Nếu kỹ năng chưa có, hệ thống sẽ tự động tạo mới vào CSDL khi bạn thêm.
                    </p>
                  </div>
                </div>

                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-extrabold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {formData.skills.length} kỹ năng đã chọn
                </span>
              </div>

              <div className="space-y-4">
                {/* Autocomplete Input & Dropdown */}
                <div className="relative">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        ref={skillInputRef}
                        type="text"
                        value={skillInput}
                        onFocus={() => setIsDropdownOpen(true)}
                        onChange={(e) => {
                          setSkillInput(e.target.value);
                          setIsDropdownOpen(true);
                          setHighlightedIndex(-1);
                        }}
                        onKeyDown={handleKeyDownSkill}
                        placeholder="Nhập tên kỹ năng (vd: React, Docker, Python, Spring Boot)..."
                        className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-10 py-2.5 text-sm text-slate-900 focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white transition"
                      />

                      {/* Searching Spinner */}
                      {(isSearchingSkills || isCreatingSkill) && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (skillInput.trim()) {
                          const exact = dbSkills.find(
                            (s) => s.name.toLowerCase() === skillInput.trim().toLowerCase(),
                          );
                          if (exact) {
                            void handleSelectSkill({ name: exact.name });
                          } else {
                            void handleSelectSkill({ name: skillInput.trim(), isNew: true });
                          }
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white hover:bg-slate-800 active:scale-95 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition cursor-pointer shrink-0"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Thêm</span>
                    </button>
                  </div>

                  {/* DEBOUNCED SEARCH DROPDOWN MENU */}
                  <AnimatePresence>
                    {isDropdownOpen && (
                      <motion.div
                        ref={skillDropdownRef}
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
                      >
                        <div className="flex items-center justify-between px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800 mb-1">
                          <span>Gợi ý từ Cơ sở dữ liệu ({dbSkills.length} kỹ năng)</span>
                          {isSearchingSkills && (
                            <span className="flex items-center gap-1 text-primary lowercase font-normal">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              đang tìm...
                            </span>
                          )}
                        </div>

                        {suggestions.length > 0 ? (
                          <div className="space-y-0.5">
                            {suggestions.map((item, index) => {
                              const isHighlighted = index === highlightedIndex;
                              const isAlreadyAdded = formData.skills.some(
                                (s) => s.toLowerCase() === item.name.toLowerCase(),
                              );

                              if (item.isNew) {
                                return (
                                  <button
                                    key="__new_skill__"
                                    type="button"
                                    onClick={() => void handleSelectSkill(item)}
                                    className={`flex w-full items-center justify-between rounded-xl p-3 text-left transition cursor-pointer border ${
                                      isHighlighted
                                        ? 'bg-amber-50 border-amber-300 dark:bg-amber-950/40 dark:border-amber-700'
                                        : 'bg-amber-50/50 border-amber-200/80 hover:bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800/60 dark:hover:bg-amber-950/40'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2.5">
                                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400">
                                        <Sparkles className="h-4 w-4" />
                                      </span>
                                      <div>
                                        <div className="text-xs font-bold text-amber-900 dark:text-amber-200">
                                          Tạo mới kỹ năng: <strong className="text-amber-700 dark:text-amber-400 underline">{item.name}</strong>
                                        </div>
                                        <div className="text-[11px] text-amber-700/80 dark:text-amber-400/80">
                                          Chưa có trong CSDL, hệ thống sẽ tự động lưu vào hệ thống
                                        </div>
                                      </div>
                                    </div>
                                    <span className="rounded-lg bg-amber-600 px-2.5 py-1 text-[10px] font-extrabold text-white shadow-2xs">
                                      + Tự động tạo & Thêm
                                    </span>
                                  </button>
                                );
                              }

                              return (
                                <button
                                  key={item._id || item.name}
                                  type="button"
                                  onClick={() => void handleSelectSkill(item)}
                                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium text-left transition cursor-pointer ${
                                    isHighlighted
                                      ? 'bg-primary/10 text-primary font-bold dark:bg-primary/20 dark:text-primary-light'
                                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    <Tag className="h-3.5 w-3.5 text-slate-400" />
                                    <span>{item.name}</span>
                                  </div>

                                  {isAlreadyAdded ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                                      <Check className="h-3.5 w-3.5" />
                                      <span>Đã thêm</span>
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-semibold text-slate-400 group-hover:text-primary">
                                      Nhấn để thêm
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="py-6 text-center text-xs text-slate-400">
                            Không tìm thấy kỹ năng phù hợp trong CSDL
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Selected Skills Badges */}
                {formData.skills.length > 0 ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <AnimatePresence>
                      {formData.skills.map((skill) => (
                        <motion.span
                          key={skill}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-bold text-primary border border-blue-200/80 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-300 shadow-2xs"
                        >
                          <span>{skill}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveSkill(skill)}
                            className="rounded-full p-0.5 hover:bg-blue-200/60 dark:hover:bg-blue-800 transition cursor-pointer"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </motion.span>
                      ))}
                    </AnimatePresence>
                  </div>
                ) : (
                  <p className="text-xs italic text-amber-600 dark:text-amber-400">
                    Vui lòng chọn hoặc thêm ít nhất 1 kỹ năng yêu cầu cho vị trí này.
                  </p>
                )}

                {/* Quick Suggestion Skills from DB */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                    Kỹ năng phổ biến có trong CSDL:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {topSuggestedSkills.map((sk) => {
                      const isAdded = formData.skills.some(
                        (s) => s.toLowerCase() === sk.toLowerCase(),
                      );
                      return (
                        <button
                          key={sk}
                          type="button"
                          disabled={isAdded}
                          onClick={() => void handleSelectSkill({ name: sk })}
                          className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition cursor-pointer ${
                            isAdded
                              ? 'bg-slate-100 text-slate-400 opacity-60 dark:bg-slate-800 dark:text-slate-600 cursor-default'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 active:scale-95 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                          }`}
                        >
                          {isAdded ? `✓ ${sk}` : `+ ${sk}`}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3: Word-like TipTap Rich Text Description */}
            <div className="rounded-3xl border border-slate-200/90 bg-white p-6 sm:p-7 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                    <Layers className="h-4.5 w-4.5" />
                  </span>
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      3. Mô tả chi tiết, Yêu cầu & Quyền lợi ứng viên
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Soạn thảo trực tiếp với đầy đủ phông chữ, cỡ chữ, bảng biểu, màu sắc và gạch đầu dòng chuẩn Microsoft Word
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <RichTextEditor
                  value={formData.description}
                  onChange={(html) => setFormData((prev) => ({ ...prev, description: html }))}
                  placeholder="Nhập mô tả chi tiết trách nhiệm công việc, yêu cầu chuyên môn, quyền lợi & chế độ đãi ngộ dành cho vị trí tuyển dụng này..."
                  minHeight="380px"
                />
              </div>
            </div>
          </div>

          {/* --------------------------------------------------------------------- */}
          {/* RIGHT COLUMN: METADATA & SETTINGS SIDEBAR (4 COLS)                    */}
          {/* --------------------------------------------------------------------- */}
          <div className="space-y-6 lg:col-span-4">
            {/* Card A: Salary & Quantity */}
            <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                <DollarSign className="h-4 w-4 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Mức lương & Chỉ tiêu
                </h3>
              </div>

              <div className="space-y-4">
                {/* Monthly Salary */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('employer.jobsTab.salaryLabel', 'Mức lương hàng tháng (VNĐ)')}{' '}
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={500000}
                    required
                    value={formData.salary}
                    onChange={(e) =>
                      setFormData({ ...formData, salary: Math.max(0, Number(e.target.value)) })
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-900 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span>Định dạng hiển thị:</span>
                    <strong className="text-emerald-600 dark:text-emerald-400 font-extrabold text-xs">
                      {formData.salary > 0
                        ? `${formData.salary.toLocaleString('vi-VN')} ₫ / tháng`
                        : 'Thỏa thuận'}
                    </strong>
                  </div>
                </div>

                {/* Headcount Quantity */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('employer.jobsTab.quantityLabel', 'Số lượng cần tuyển')}{' '}
                    <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      required
                      value={formData.quantity}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          quantity: Math.max(1, Number(e.target.value)),
                        })
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-900 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                    <span className="text-xs font-bold text-slate-500 shrink-0">ứng viên</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Card B: Location & Duration */}
            <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                <MapPin className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Địa điểm & Thời hạn
                </h3>
              </div>

              <div className="space-y-4">
                {/* Location */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('employer.jobsTab.locationLabel', 'Địa điểm làm việc')}{' '}
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    placeholder="VD: Cầu Giấy, Hà Nội..."
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                  <div className="mt-2 flex flex-wrap gap-1">
                    {QUICK_LOCATIONS.map((loc) => (
                      <button
                        key={loc}
                        type="button"
                        onClick={() => setFormData({ ...formData, location: loc })}
                        className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition cursor-pointer"
                      >
                        {loc}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Start Date & End Date */}
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      {t('employer.jobsTab.startDateLabel', 'Ngày bắt đầu')}
                    </label>
                    <input
                      type="date"
                      required
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      {t('employer.jobsTab.endDateLabel', 'Hạn nộp hồ sơ')}
                    </label>
                    <input
                      type="date"
                      required
                      value={formData.endDate}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-primary" />
                    <span>Thời hạn hiển thị:</span>
                  </span>
                  <strong className="font-bold text-primary">{daysRemaining} ngày còn lại</strong>
                </div>
              </div>
            </div>

            {/* Card C: Publishing Status Toggle */}
            <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {t('employer.jobsTab.isActiveLabel', 'Trạng thái hiển thị')}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {formData.isActive ? 'Đang công khai cho ứng viên' : 'Đang ẩn tạm thời'}
                  </p>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={formData.isActive}
                  onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                    formData.isActive ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      formData.isActive ? 'translate-x-5.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Card D: AI Matching Readiness Bento Card */}
            <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/5 via-white to-blue-50/40 p-6 shadow-xs dark:from-primary/10 dark:via-slate-900 dark:to-slate-900 dark:border-primary/30">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary animate-pulse" />
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                    Chỉ số sẵn sàng AI Matching
                  </h3>
                </div>
                <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-black text-white">
                  {checklist.score}%
                </span>
              </div>

              {/* Progress Bar */}
              <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-300"
                  style={{ width: `${checklist.score}%` }}
                />
              </div>

              {/* Checklist items */}
              <div className="space-y-1.5 text-xs">
                <div
                  className={`flex items-center gap-2 ${
                    checklist.isNameOk
                      ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                      : 'text-slate-400'
                  }`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Tiêu đề rõ ràng (&gt; 5 ký tự)</span>
                </div>
                <div
                  className={`flex items-center gap-2 ${
                    checklist.isSkillsOk
                      ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                      : 'text-slate-400'
                  }`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Kỹ năng yêu cầu (&ge; 2 kỹ năng)</span>
                </div>
                <div
                  className={`flex items-center gap-2 ${
                    checklist.isDescOk
                      ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                      : 'text-slate-400'
                  }`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Mô tả chi tiết và định dạng chuẩn</span>
                </div>
                <div
                  className={`flex items-center gap-2 ${
                    checklist.isSalaryOk
                      ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                      : 'text-slate-400'
                  }`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Mức lương minh bạch</span>
                </div>
              </div>
            </div>

            {/* Sticky Save CTA in Sidebar */}
            <div className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-white shadow-lg shadow-primary/25 hover:bg-primary-dark active:scale-95 disabled:opacity-50 transition cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Đang lưu tin tuyển dụng...</span>
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    <span>
                      {editingJob
                        ? t('employer.jobsTab.submitEditBtn', 'Cập nhật tin')
                        : t('employer.jobsTab.submitCreateBtn', 'Đăng tin tuyển dụng')}
                    </span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onCancel}
                disabled={isSubmitting}
                className="w-full text-center py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition cursor-pointer"
              >
                Hủy bỏ và quay lại danh sách
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
