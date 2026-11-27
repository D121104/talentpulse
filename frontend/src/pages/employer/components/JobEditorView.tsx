import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Briefcase,
  Building2,
  Calendar,
  DollarSign,
  FileText,
  Loader2,
  MapPin,
  Save,
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
import LocationMapPicker from '../../../components/maps/LocationMapPicker';
import TagCombobox from '../../../components/employer/TagCombobox';

export interface JobFormData {
  name: string;
  skills: string[];
  salary: number;
  quantity: number;
  level: string;
  workingModel: string;
  education: string;
  benefits: string[];
  categories: string[];
  description: string;
  location: string;
  lat?: number | null;
  lon?: number | null;
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

const JOB_LEVEL_OPTIONS = [
  { value: 'INTERN', label: 'Thực tập sinh (Intern)' },
  { value: 'FRESHER', label: 'Mới đi làm (Fresher)' },
  { value: 'JUNIOR', label: 'Junior (1 - 2 năm)' },
  { value: 'MIDDLE', label: 'Middle (2 - 4 năm)' },
  { value: 'SENIOR', label: 'Senior (4+ năm)' },
  { value: 'LEAD', label: 'Trưởng nhóm (Lead)' },
  { value: 'MANAGER', label: 'Quản lý (Manager)' },
];

const WORKING_MODEL_OPTIONS = [
  { value: 'Làm việc tại văn phòng / Onsite', label: 'Onsite (Tại văn phòng)' },
  { value: 'Linh hoạt / Hybrid', label: 'Hybrid (Linh hoạt)' },
  { value: 'Làm từ xa / Remote', label: 'Remote (Làm từ xa)' },
];

const EDUCATION_OPTIONS = [
  { value: 'Không yêu cầu', label: 'Không yêu cầu' },
  { value: 'Trung cấp', label: 'Trung cấp' },
  { value: 'Cao đẳng', label: 'Cao đẳng' },
  { value: 'Đại học trở lên', label: 'Đại học trở lên' },
  { value: 'Thạc sĩ / Tiến sĩ', label: 'Thạc sĩ / Tiến sĩ' },
];

const SUGGESTED_BENEFITS = [
  'Bảo hiểm xã hội',
  'Du lịch hàng năm',
  'Thưởng tháng 13',
  'Khám sức khỏe định kỳ',
  'Phụ cấp ăn trưa',
  'Laptop / Thiết bị làm việc',
  'Review lương 2 lần/năm',
  'Đào tạo nâng cao',
];

const SUGGESTED_CATEGORIES = [
  'Công nghệ Thông tin',
  'Software Engineering',
  'Frontend Developer',
  'Backend Developer',
  'Fullstack Developer',
  'Mobile Developer',
  'DevOps / Cloud',
  'AI / Machine Learning',
  'QA / Tester',
];

function normalizeJobLevel(raw?: string): string {
  if (!raw) return 'MIDDLE';
  const upper = raw.trim().toUpperCase();
  const matched = JOB_LEVEL_OPTIONS.find((item) => item.value === upper);
  return matched ? matched.value : raw.trim();
}

function normalizeWorkingModel(raw?: string): string {
  if (!raw) return WORKING_MODEL_OPTIONS[0].value;
  const lower = raw.trim().toLowerCase();
  if (lower.includes('remote')) return 'Làm từ xa / Remote';
  if (lower.includes('hybrid')) return 'Linh hoạt / Hybrid';
  if (lower.includes('onsite') || lower.includes('văn phòng')) {
    return 'Làm việc tại văn phòng / Onsite';
  }
  return raw.trim();
}

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
      salary: editingJob?.salary ?? 15000000,
      quantity: editingJob?.quantity || 1,
      level: normalizeJobLevel(editingJob?.level),
      workingModel: normalizeWorkingModel(editingJob?.workingModel),
      education: editingJob?.education || 'Đại học trở lên',
      benefits:
        editingJob?.benefits && editingJob.benefits.length > 0
          ? editingJob.benefits
          : ['Bảo hiểm xã hội', 'Thưởng tháng 13'],
      categories:
        editingJob?.categories && editingJob.categories.length > 0
          ? editingJob.categories
          : ['Công nghệ Thông tin', 'Software Engineering'],
      description: editingJob?.description || '',
      location: editingJob?.location || company?.address || '',
      lat: editingJob?.lat ?? company?.lat ?? null,
      lon: editingJob?.lon ?? company?.lon ?? null,
      startDate: editingJob?.startDate
        ? new Date(editingJob.startDate).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
      endDate: editingJob?.endDate
        ? new Date(editingJob.endDate).toISOString().split('T')[0]
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      isActive: editingJob ? editingJob.isActive !== false : true,
    },
  );

  const hasEditedLocationRef = useRef(Boolean(editingJob || initialData));

  // Sync company HQ location asynchronously when creating a new job
  useEffect(() => {
    if (editingJob || initialData || !company || hasEditedLocationRef.current) return;
    setFormData((prev) => ({
      ...prev,
      location: company.address || prev.location || '',
      lat: company.lat ?? prev.lat ?? null,
      lon: company.lon ?? prev.lon ?? null,
    }));
  }, [company, editingJob, initialData]);

  // DB Skills search & auto-create
  const [dbSkills, setDbSkills] = useState<SkillItem[]>([]);
  const [skillQuery, setSkillQuery] = useState('');
  const [debouncedSkillQuery, setDebouncedSkillQuery] = useState('');
  const [isSearchingSkills, setIsSearchingSkills] = useState(false);

  useEffect(() => {
    let isMounted = true;
    void employerApi
      .getSkills({ pageSize: 100 }, accessToken || undefined)
      .then((res) => {
        if (isMounted && Array.isArray(res?.result)) {
          setDbSkills(res.result);
        }
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [accessToken]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSkillQuery(skillQuery.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [skillQuery]);

  useEffect(() => {
    if (!debouncedSkillQuery) return;
    let isCurrent = true;
    setIsSearchingSkills(true);

    void employerApi
      .getSkills({ name: debouncedSkillQuery, pageSize: 30 }, accessToken || undefined)
      .then((res) => {
        if (isCurrent && Array.isArray(res?.result)) {
          setDbSkills((prev) => {
            const map = new Map<string, SkillItem>();
            prev.forEach((s) => map.set(s.name.toLowerCase(), s));
            res.result.forEach((s) => map.set(s.name.toLowerCase(), s));
            return Array.from(map.values());
          });
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (isCurrent) setIsSearchingSkills(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [debouncedSkillQuery, accessToken]);

  const skillOptions = useMemo(
    () => dbSkills.map((s) => ({ id: s._id, name: s.name })),
    [dbSkills],
  );
  const benefitOptions = useMemo(
    () => SUGGESTED_BENEFITS.map((name) => ({ name })),
    [],
  );
  const categoryOptions = useMemo(
    () => SUGGESTED_CATEGORIES.map((name) => ({ name })),
    [],
  );

  const handleAddSkill = async (value: string, meta?: { isNew?: boolean }) => {
    const targetName = value.trim();
    if (!targetName) return;

    if (formData.skills.some((s) => s.toLowerCase() === targetName.toLowerCase())) {
      info(`Kỹ năng "${targetName}" đã có trong danh sách`);
      return;
    }

    if (meta?.isNew && accessToken) {
      try {
        const created = await employerApi.createSkill({ name: targetName }, accessToken);
        if (created?._id) {
          setDbSkills((prev) => [...prev, created]);
        }
        success(`Đã thêm kỹ năng "${targetName}" vào hệ thống`);
      } catch {
        // Skill may already exist on backend; still add to job
      }
    }

    setFormData((prev) => ({ ...prev, skills: [...prev.skills, targetName] }));
  };

  const handleAddTag = (field: 'benefits' | 'categories', value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setFormData((prev) => {
      if (prev[field].some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
        return prev;
      }
      return { ...prev, [field]: [...prev[field], trimmed] };
    });
  };

  const handleRemoveTag = (field: 'skills' | 'benefits' | 'categories', value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: prev[field].filter((item) => item !== value),
    }));
  };

  const daysRemaining = useMemo(() => {
    const end = new Date(formData.endDate).getTime();
    const diff = Math.ceil((end - Date.now()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  }, [formData.endDate]);

  const hasCustomLevelOption = !JOB_LEVEL_OPTIONS.some(
    (opt) => opt.value === formData.level,
  );
  const hasCustomWorkingModelOption = !WORKING_MODEL_OPTIONS.some(
    (opt) => opt.value === formData.workingModel,
  );
  const hasCustomEducationOption = !EDUCATION_OPTIONS.some(
    (opt) => opt.value === formData.education,
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.location.trim()) {
      info('Vui lòng chọn địa điểm làm việc');
      return;
    }
    if (
      formData.startDate &&
      formData.endDate &&
      new Date(formData.endDate) <= new Date(formData.startDate)
    ) {
      info('Hạn nộp hồ sơ phải sau ngày bắt đầu tuyển dụng');
      return;
    }
    void onSave(formData);
  };

  return (
    <div className="space-y-5 pb-14">
      {/* Compact Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-4 dark:border-slate-800">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onCancel}
            aria-label="Quay lại danh sách tin"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-primary hover:text-primary active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 cursor-pointer"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </button>

          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white truncate">
              {editingJob ? `Chỉnh sửa: ${editingJob.name}` : 'Đăng tin tuyển dụng mới'}
            </h1>
            {company?.name && (
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
                <span>{company.name}</span>
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 active:scale-95 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition cursor-pointer"
          >
            Hủy
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-xs font-bold text-white shadow-md shadow-primary/20 hover:bg-primary-dark active:scale-95 disabled:opacity-50 transition cursor-pointer"
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

      {/* Main 2-Column Layout */}
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-start">
          {/* LEFT COLUMN (7 cols): Job Details & Description */}
          <div className="space-y-5 lg:col-span-7">
            <section className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-5">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                <Briefcase className="h-4.5 w-4.5 text-primary" />
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  Thông tin vị trí
                </h2>
              </div>

              {/* Job Title */}
              <div>
                <label
                  htmlFor="job-title-input"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  {t('employer.jobsTab.jobNameLabel', 'Tiêu đề vị trí')}{' '}
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  id="job-title-input"
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="VD: Senior Fullstack React & Node.js Developer"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white transition"
                />
              </div>

              {/* 3 Compact Select Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label
                    htmlFor="job-level-select"
                    className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    {t('employer.jobsTab.levelLabel', 'Cấp bậc')}{' '}
                    <span className="text-rose-500">*</span>
                  </label>
                  <select
                    id="job-level-select"
                    value={formData.level}
                    onChange={(e) => setFormData({ ...formData, level: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs sm:text-sm font-medium text-slate-900 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white cursor-pointer"
                  >
                    {hasCustomLevelOption && formData.level && (
                      <option value={formData.level}>{formData.level}</option>
                    )}
                    {JOB_LEVEL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="job-working-model-select"
                    className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Hình thức làm việc <span className="text-rose-500">*</span>
                  </label>
                  <select
                    id="job-working-model-select"
                    value={formData.workingModel}
                    onChange={(e) => setFormData({ ...formData, workingModel: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs sm:text-sm font-medium text-slate-900 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white cursor-pointer"
                  >
                    {hasCustomWorkingModelOption && formData.workingModel && (
                      <option value={formData.workingModel}>{formData.workingModel}</option>
                    )}
                    {WORKING_MODEL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="job-education-select"
                    className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Học vấn <span className="text-rose-500">*</span>
                  </label>
                  <select
                    id="job-education-select"
                    value={formData.education}
                    onChange={(e) => setFormData({ ...formData, education: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs sm:text-sm font-medium text-slate-900 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white cursor-pointer"
                  >
                    {hasCustomEducationOption && formData.education && (
                      <option value={formData.education}>{formData.education}</option>
                    )}
                    {EDUCATION_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Skills Autocomplete */}
              <TagCombobox
                label="Kỹ năng yêu cầu"
                required
                placeholder="Tìm hoặc thêm kỹ năng (VD: React, Node.js, Docker)..."
                selected={formData.skills}
                options={skillOptions}
                onAdd={handleAddSkill}
                onRemove={(val) => handleRemoveTag('skills', val)}
                onQueryChange={setSkillQuery}
                isLoading={isSearchingSkills}
                createActionLabel="Tạo kỹ năng mới"
                chipTone="blue"
                emptyHint="Chọn ít nhất 1 kỹ năng yêu cầu."
              />

              {/* Benefits & Categories Comboboxes side-by-side */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 border-t border-slate-100 dark:border-slate-800">
                <TagCombobox
                  label="Quyền lợi"
                  placeholder="Chọn hoặc nhập quyền lợi..."
                  selected={formData.benefits}
                  options={benefitOptions}
                  onAdd={(val) => handleAddTag('benefits', val)}
                  onRemove={(val) => handleRemoveTag('benefits', val)}
                  chipTone="purple"
                />

                <TagCombobox
                  label="Danh mục nghề"
                  placeholder="Chọn hoặc nhập ngành nghề..."
                  selected={formData.categories}
                  options={categoryOptions}
                  onAdd={(val) => handleAddTag('categories', val)}
                  onRemove={(val) => handleRemoveTag('categories', val)}
                  chipTone="slate"
                />
              </div>
            </section>

            {/* Description Editor */}
            <section className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                <FileText className="h-4.5 w-4.5 text-emerald-600" />
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  Mô tả công việc & Yêu cầu <span className="text-rose-500">*</span>
                </h2>
              </div>

              <RichTextEditor
                value={formData.description}
                onChange={(html) => setFormData((prev) => ({ ...prev, description: html }))}
                placeholder="Mô tả trách nhiệm công việc, yêu cầu chuyên môn và chế độ đãi ngộ..."
                minHeight="320px"
              />
            </section>
          </div>

          {/* RIGHT COLUMN (5 cols): Salary, Dates & Interactive Map Location */}
          <div className="space-y-5 lg:col-span-5">
            {/* Compensation, Quantity & Schedule */}
            <section className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                <DollarSign className="h-4.5 w-4.5 text-emerald-600" />
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  Mức lương & Thời hạn
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1.5">
                    <label
                      htmlFor="job-salary-input"
                      className="text-xs font-bold text-slate-700 dark:text-slate-300"
                    >
                      Mức lương (VNĐ) <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                      {formData.salary > 0
                        ? `${formData.salary.toLocaleString('vi-VN')} ₫`
                        : 'Thỏa thuận'}
                    </span>
                  </div>
                  <input
                    id="job-salary-input"
                    type="number"
                    min={0}
                    step={500000}
                    required
                    value={formData.salary}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        salary: Math.max(0, Number(e.target.value)),
                      })
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-900 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label
                    htmlFor="job-quantity-input"
                    className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Số lượng tuyển <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      id="job-quantity-input"
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
                      className="w-full rounded-xl border border-slate-200 bg-white pl-3.5 pr-14 py-2 text-sm font-semibold text-slate-900 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                      người
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <label
                    htmlFor="job-start-date"
                    className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Ngày bắt đầu
                  </label>
                  <input
                    id="job-start-date"
                    type="date"
                    required
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between gap-1 mb-1.5">
                    <label
                      htmlFor="job-end-date"
                      className="text-xs font-bold text-slate-700 dark:text-slate-300"
                    >
                      Hạn nộp
                    </label>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                      <Calendar className="h-3 w-3" />
                      {daysRemaining} ngày
                    </span>
                  </div>
                  <input
                    id="job-end-date"
                    type="date"
                    required
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                    {t('employer.jobsTab.isActiveLabel', 'Hiển thị tin tuyển dụng')}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {formData.isActive ? 'Đang công khai với ứng viên' : 'Đang ẩn tạm thời'}
                  </span>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={formData.isActive}
                  aria-label="Bật tắt hiển thị tin tuyển dụng"
                  onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/25 ${
                    formData.isActive ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow-sm transition duration-200 ${
                      formData.isActive ? 'translate-x-5.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </section>

            {/* Workplace Location & Real Interactive Map */}
            <section className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-3.5">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4.5 w-4.5 text-primary" />
                  <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                    Địa điểm làm việc <span className="text-rose-500">*</span>
                  </h2>
                </div>
                <span className="text-[11px] text-slate-400">Mặc định theo công ty</span>
              </div>

              <LocationMapPicker
                address={formData.location}
                lat={formData.lat}
                lon={formData.lon}
                required
                markerTitle={formData.name || company?.name || 'Địa điểm làm việc'}
                placeholder="Tìm địa chỉ làm việc (mặc định theo công ty)..."
                modalTitle="Chọn địa điểm làm việc"
                modalSubtitle="Tìm địa chỉ hoặc nhấp/kéo ghim xanh để định vị nơi làm việc"
                mapHeightClass="h-56"
                companyFallback={
                  company
                    ? {
                        address: company.address,
                        lat: company.lat,
                        lon: company.lon,
                      }
                    : null
                }
                onChange={({ address, lat, lon }) => {
                  hasEditedLocationRef.current = true;
                  setFormData((prev) => ({
                    ...prev,
                    location: address,
                    lat,
                    lon,
                  }));
                }}
              />
            </section>

            {/* Submit Bar at Bottom of Right Column */}
            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={onCancel}
                disabled={isSubmitting}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 active:scale-95 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-xs sm:text-sm font-bold text-white shadow-lg shadow-primary/20 hover:bg-primary-dark active:scale-95 disabled:opacity-50 transition cursor-pointer"
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
        </div>
      </form>
    </div>
  );
}
