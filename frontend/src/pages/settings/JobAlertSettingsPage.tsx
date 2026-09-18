import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mail,
  MailCheck,
  Sparkles,
  Search,
  Plus,
  X,
  Clock,
  Calendar,
  CheckCircle2,
  ShieldCheck,
  Crown,
  ChevronDown,
  Layers,
  FileText,
  Info,
  Loader2,
  Save,
  RotateCcw,
  Check,
  Briefcase,
  Zap,
} from 'lucide-react';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../context/ToastContext';
import { UserAvatar } from '../../components/common/UserAvatar';
import { employerApi } from '../../lib/employerApi';
import {
  subscriberApi,
  type SkillItem,
  type SubscriberSubscription,
} from '../../lib/subscriberApi';
import { formatDate } from '../../lib/dateUtils';

function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
  id,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

// Popular suggested skills for quick addition
const POPULAR_SKILL_SUGGESTIONS = [
  'REACT',
  'TYPESCRIPT',
  'JAVASCRIPT',
  'NEXTJS',
  'NODEJS',
  'NESTJS',
  'PYTHON',
  'FASTAPI',
  'JAVA',
  'SPRING BOOT',
  'GOLANG',
  'UI/UX',
  'TAILWINDCSS',
  'DOCKER',
  'DEVOPS',
  'FLUTTER',
  'SQL',
  'POSTGRESQL',
];

interface SelectedSkillTag {
  _id?: string; // Optional if newly created
  name: string;
  isNew?: boolean;
}

export function JobAlertSettingsPage() {
  const { user, accessToken } = useAuth();
  const { success, error: showError, info: showInfo } = useToast();

  // Subscription state
  const [subscription, setSubscription] =
    useState<SubscriberSubscription | null>(null);
  const [emailInput, setEmailInput] = useState(user?.email || '');
  const [selectedSkills, setSelectedSkills] = useState<SelectedSkillTag[]>([]);
  const [isAlertActive, setIsAlertActive] = useState(true);
  const [lastEmailSentAt, setLastEmailSentAt] = useState<string | null>(null);

  // Search & autocomplete state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SkillItem[]>([]);
  const [isSearchingSkills, setIsSearchingSkills] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Status & loading states
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTogglingEmail, setIsTogglingEmail] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Right sidebar user settings states (matching ProfileViewersPage)
  const [isJobSeeking, setIsJobSeeking] = useState(user?.isJobSeeking ?? true);
  const [isJobRecommendation, setIsJobRecommendation] = useState(
    user?.isJobRecommendation ?? true,
  );
  const [isSavingCandidateSettings, setIsSavingCandidateSettings] =
    useState(false);
  const [searchableCvCount, setSearchableCvCount] = useState(0);
  const [isInfoExpanded, setIsInfoExpanded] = useState(false);

  // Close skill dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch initial subscription data & profile info
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      if (!accessToken) {
        setIsLoadingInitial(false);
        return;
      }

      setIsLoadingInitial(true);
      try {
        // 1. Fetch user's subscription
        const subRes = await subscriberApi.getMySubscription(accessToken);
        if (isMounted && subRes) {
          setSubscription(subRes);
          setEmailInput(subRes.email || user?.email || '');
          setIsAlertActive(subRes.isActive ?? true);
          setLastEmailSentAt(subRes.lastEmailSentAt || null);

          if (subRes.skills && Array.isArray(subRes.skills)) {
            setSelectedSkills(
              subRes.skills.map((s) => ({
                _id: s._id,
                name: s.name,
              })),
            );
          }
        } else if (isMounted) {
          setEmailInput(user?.email || '');
          setIsAlertActive(true);
        }

        // 2. Fetch candidate views/settings stats if available
        try {
          const viewsRes = await employerApi.getCandidateEmployerViews(
            { current: 1, pageSize: 1 },
            accessToken,
          );
          if (isMounted && viewsRes?.stats) {
            setSearchableCvCount(viewsRes.stats.searchableCvCount || 0);
          }
        } catch {
          // Ignore if user is not candidate or endpoint not applicable
        }
      } catch (err: any) {
        console.error('Failed to load subscription settings:', err);
      } finally {
        if (isMounted) {
          setIsLoadingInitial(false);
        }
      }
    }

    void loadData();

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.email]);

  // Debounced skill search
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      setIsSearchingSkills(false);
      return;
    }

    setIsSearchingSkills(true);
    const timer = setTimeout(async () => {
      try {
        const res = await subscriberApi.searchSkills(trimmed, 15, accessToken || undefined);
        setSearchResults(res?.result || []);
      } catch (err) {
        console.error('Skill search error:', err);
        setSearchResults([]);
      } finally {
        setIsSearchingSkills(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [searchQuery, accessToken]);

  // Mark changes dirty
  const markChanged = () => {
    setHasChanges(true);
  };

  // Add skill to selection
  const handleAddSkill = (skillName: string, skillId?: string) => {
    const cleanName = skillName.trim().toUpperCase();
    if (!cleanName) return;

    // Check if already selected
    const alreadyExists = selectedSkills.some(
      (s) => s.name.toUpperCase() === cleanName,
    );

    if (alreadyExists) {
      showInfo(`Kỹ năng "${cleanName}" đã có trong danh sách.`);
      setSearchQuery('');
      setIsDropdownOpen(false);
      return;
    }

    const newTag: SelectedSkillTag = {
      _id: skillId,
      name: cleanName,
      isNew: !skillId,
    };

    setSelectedSkills((prev) => [...prev, newTag]);
    setSearchQuery('');
    setIsDropdownOpen(false);
    markChanged();
  };

  // Remove skill
  const handleRemoveSkill = (skillNameToRemove: string) => {
    setSelectedSkills((prev) =>
      prev.filter(
        (s) => s.name.toUpperCase() !== skillNameToRemove.toUpperCase(),
      ),
    );
    markChanged();
  };

  // Clear all skills
  const handleClearAllSkills = () => {
    if (selectedSkills.length === 0) return;
    setSelectedSkills([]);
    markChanged();
  };

  // Quick toggle subscription active status
  const handleToggleActive = async (newVal: boolean) => {
    setIsAlertActive(newVal);
    markChanged();

    // If subscription already exists in DB, save immediately for snappy experience
    if (subscription && accessToken) {
      setIsTogglingEmail(true);
      try {
        const res = await subscriberApi.toggleMySubscription(accessToken);
        setSubscription(res);
        setIsAlertActive(res.isActive);
        success(
          res.isActive
            ? 'Đã bật nhận email việc làm định kỳ.'
            : 'Đã tạm dừng nhận email việc làm.',
        );
      } catch (err: any) {
        setIsAlertActive(!newVal);
        showError(err?.message || 'Không thể thay đổi trạng thái nhận email');
      } finally {
        setIsTogglingEmail(false);
      }
    }
  };

  // Save full settings
  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!accessToken) {
      showError('Vui lòng đăng nhập để lưu cài đặt');
      return;
    }

    const targetEmail = emailInput.trim();
    if (!targetEmail) {
      showError('Vui lòng nhập địa chỉ email nhận thông báo');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(targetEmail)) {
      showError('Địa chỉ email không hợp lệ. Vui lòng kiểm tra lại.');
      return;
    }

    if (selectedSkills.length === 0) {
      showInfo(
        'Bạn chưa chọn kỹ năng nào. Vui lòng chọn ít nhất 1 kỹ năng để hệ thống lọc việc làm phù hợp.',
      );
    }

    setIsSaving(true);
    try {
      // Split into existing UUIDs and newly added custom skill names
      const existingSkillIds: string[] = [];
      const newSkillNames: string[] = [];

      selectedSkills.forEach((s) => {
        if (s._id) {
          existingSkillIds.push(s._id);
        } else {
          newSkillNames.push(s.name);
        }
      });

      const res = await subscriberApi.saveSubscription(
        {
          email: targetEmail,
          skills: existingSkillIds,
          newSkillNames: newSkillNames.length > 0 ? newSkillNames : undefined,
          isActive: isAlertActive,
        },
        accessToken,
      );

      setSubscription(res);
      setEmailInput(res.email);
      setIsAlertActive(res.isActive);
      if (res.skills && Array.isArray(res.skills)) {
        setSelectedSkills(
          res.skills.map((s) => ({
            _id: s._id,
            name: s.name,
          })),
        );
      }
      setHasChanges(false);
      success('Đã lưu cài đặt email việc làm.');
    } catch (err: any) {
      console.error('Failed to save subscription:', err);
      showError(err?.message || 'Không thể lưu cài đặt. Vui lòng thử lại.');
    } finally {
      setIsSaving(false);
    }
  };

  // Reset changes to last loaded state
  const handleResetChanges = () => {
    if (subscription) {
      setEmailInput(subscription.email || user?.email || '');
      setIsAlertActive(subscription.isActive ?? true);
      setSelectedSkills(
        (subscription.skills || []).map((s) => ({
          _id: s._id,
          name: s.name,
        })),
      );
    } else {
      setEmailInput(user?.email || '');
      setIsAlertActive(true);
      setSelectedSkills([]);
    }
    setHasChanges(false);
    showInfo('Đã khôi phục cài đặt.');
  };

  // Right sidebar toggle: Gợi ý việc làm
  const handleToggleRecommendation = async (newValue: boolean) => {
    if (!accessToken) return;
    setIsJobRecommendation(newValue);
    setIsSavingCandidateSettings(true);
    try {
      await employerApi.updateCandidateJobSettings(
        { isJobRecommendation: newValue },
        accessToken,
      );
      success(
        newValue
          ? 'Đã bật gợi ý việc làm.'
          : 'Đã tắt gợi ý việc làm.',
      );
    } catch (err: any) {
      setIsJobRecommendation(!newValue);
      showError(err?.message || 'Không thể cập nhật cài đặt.');
    } finally {
      setIsSavingCandidateSettings(false);
    }
  };

  // Right sidebar toggle: Trạng thái tìm việc
  const handleToggleJobSeeking = async (newValue: boolean) => {
    if (!accessToken) return;
    setIsJobSeeking(newValue);
    setIsSavingCandidateSettings(true);
    try {
      await employerApi.updateCandidateJobSettings(
        { isJobSeeking: newValue },
        accessToken,
      );
      success(
        newValue
          ? 'Đã bật trạng thái tìm việc.'
          : 'Đã tắt trạng thái tìm việc.',
      );
    } catch (err: any) {
      setIsJobSeeking(!newValue);
      showError(err?.message || 'Không thể cập nhật cài đặt.');
    } finally {
      setIsSavingCandidateSettings(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors duration-200 dark:bg-slate-950 dark:text-slate-100">
      <Header />

      <main className="container mx-auto px-4 py-6 sm:px-6 lg:px-8 max-w-7xl pt-24 sm:pt-28">
        {/* Breadcrumb Navigation */}
        <nav aria-label="Breadcrumb" className="mb-4">
          <ol className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <li>
              <Link
                to="/"
                className="hover:text-primary transition-colors cursor-pointer"
              >
                Trang chủ
              </Link>
            </li>
            <li>/</li>
            <li>
              <Link
                to="/settings/profile"
                className="hover:text-primary transition-colors cursor-pointer"
              >
                Cài đặt
              </Link>
            </li>
            <li>/</li>
            <li className="font-semibold text-slate-800 dark:text-slate-200">
              Nhận email việc làm
            </li>
          </ol>
        </nav>

        {/* Page Title Section */}
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light">
                <Mail className="h-5 w-5" />
              </span>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                Nhận việc làm qua email
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-3xl">
              Nhận danh sách việc làm phù hợp với kỹ năng của bạn qua email định kỳ mỗi tuần.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isAlertActive ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Đang bật
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200/70 px-3 py-1.5 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-300/50 dark:border-slate-700">
                <span className="h-2 w-2 rounded-full bg-slate-400" />
                Đang tắt
              </span>
            )}
          </div>
        </div>

        {isLoadingInitial ? (
          <div className="flex min-h-[380px] flex-col items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white p-12 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
              Đang tải cài đặt...
            </p>
          </div>
        ) : (
          /* Main 12-column Grid */
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column (8 cols): Main Email & Skill Subscription Settings */}
          <div className="lg:col-span-8 space-y-6">
            {/* 1. Hero Feature Status Banner */}
            <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-slate-900/5 to-primary/5 p-6 sm:p-7 shadow-xs dark:border-primary/30 dark:from-primary/20 dark:via-slate-900/80 dark:to-slate-900">
              <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2 max-w-xl">
                  <div className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-2.5 py-1 text-[11px] font-bold text-primary dark:text-primary-light">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Thông báo hàng tuần</span>
                  </div>
                  <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">
                    Việc làm mới theo kỹ năng của bạn
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    Chọn các kỹ năng bạn quan tâm. Hệ thống sẽ tự động lọc và gửi các tin tuyển dụng phù hợp vào hòm thư mỗi tuần.
                  </p>
                </div>

                {/* Quick Toggle Inside Banner */}
                <div className="flex sm:flex-col items-center sm:items-end justify-between gap-3 border-t border-slate-200/60 pt-3 sm:border-0 sm:pt-0 dark:border-slate-800">
                  <div className="text-right">
                    <span className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                      Nhận email định kỳ
                    </span>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                      {isAlertActive ? 'Đang bật' : 'Đang tắt'}
                    </span>
                  </div>
                  <ToggleSwitch
                    id="hero-toggle-subscription"
                    checked={isAlertActive}
                    onChange={handleToggleActive}
                    disabled={isTogglingEmail || isSaving}
                  />
                </div>
              </div>

              {/* Subtle background glow */}
              <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/15 blur-3xl" />
            </div>

            {/* 2. Email Address Card */}
            <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <MailCheck className="h-5 w-5 text-primary" />
                    <span>Hòm thư nhận thông báo</span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Email nhận danh sách việc làm hàng tuần.
                  </p>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <label
                  htmlFor="notification-email-input"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-300"
                >
                  Email nhận tin <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                    <Mail className="h-4 w-4" />
                  </span>
                  <input
                    id="notification-email-input"
                    type="email"
                    value={emailInput}
                    onChange={(e) => {
                      setEmailInput(e.target.value);
                      markChanged();
                    }}
                    placeholder="name@example.com"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 py-2.5 pl-10 pr-4 text-sm font-medium text-slate-900 placeholder:text-slate-400 transition focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800/60 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-slate-900"
                  />
                </div>
                <div className="flex items-center gap-1.5 text-[11.5px] text-slate-500 dark:text-slate-400">
                  <Info className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span>
                    Mặc định là email tài khoản của bạn. Bạn có thể đổi sang email khác nếu muốn.
                  </span>
                </div>
              </div>
            </div>

            {/* 3. Skills Selection & Dynamic Creation Card */}
            <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="space-y-1">
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Briefcase className="h-5 w-5 text-primary" />
                    <span>Kỹ năng quan tâm</span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Hệ thống sẽ gửi các tin tuyển dụng có chứa ít nhất một trong các kỹ năng này.
                  </p>
                </div>

                {selectedSkills.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllSkills}
                    className="text-xs font-bold text-rose-500 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer self-start sm:self-auto transition"
                  >
                    Xóa tất cả ({selectedSkills.length})
                  </button>
                )}
              </div>

              {/* Autocomplete Input with Live DB Search & Instant Add */}
              <div className="relative" ref={searchContainerRef}>
                <label
                  htmlFor="skill-search-input"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Tìm hoặc thêm kỹ năng
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                    <Search className="h-4 w-4" />
                  </span>
                  <input
                    id="skill-search-input"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setIsDropdownOpen(true);
                    }}
                    onFocus={() => setIsDropdownOpen(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (searchQuery.trim()) {
                          const trimmed = searchQuery.trim().toUpperCase();
                          const exactMatch = searchResults.find(
                            (r) => r.name.toUpperCase() === trimmed,
                          );
                          if (exactMatch) {
                            handleAddSkill(exactMatch.name, exactMatch._id);
                          } else {
                            handleAddSkill(searchQuery.trim());
                          }
                        }
                      }
                    }}
                    placeholder="Ví dụ: React, TypeScript, Python, Node.js, UI/UX..."
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 py-2.5 pl-10 pr-10 text-sm font-medium text-slate-900 placeholder:text-slate-400 transition focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800/60 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-slate-900"
                  />

                  {isSearchingSkills && (
                    <span className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-primary">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </span>
                  )}
                </div>

                {/* Dropdown Results & Add New Skill Option */}
                <AnimatePresence>
                  {isDropdownOpen && searchQuery.trim().length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={{ duration: 0.15 }}
                      className="absolute z-30 mt-2 max-h-64 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-800 dark:bg-slate-900"
                    >
                      {/* Option to create new skill if user typed something */}
                      <button
                        type="button"
                        onClick={() => handleAddSkill(searchQuery.trim())}
                        className="flex w-full items-center gap-2.5 rounded-xl bg-primary/10 px-3.5 py-2.5 text-xs font-bold text-primary hover:bg-primary/20 dark:bg-primary/20 dark:text-primary-light dark:hover:bg-primary/30 transition text-left cursor-pointer"
                      >
                        <Plus className="h-4 w-4 shrink-0" />
                        <span className="truncate">
                          Thêm kỹ năng: <strong>"{searchQuery.trim().toUpperCase()}"</strong>
                        </span>
                        <span className="ml-auto rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-black text-white">
                          Mới
                        </span>
                      </button>

                      {/* Matching skills from database */}
                      {searchResults.length > 0 && (
                        <div className="mt-2 border-t border-slate-100 pt-2 dark:border-slate-800 space-y-1">
                          <div className="px-3 py-1 text-[11px] font-bold text-slate-400">
                            Kỹ năng gợi ý:
                          </div>
                          {searchResults.map((skill) => {
                            const isSelected = selectedSkills.some(
                              (s) => s.name.toUpperCase() === skill.name.toUpperCase(),
                            );
                            return (
                              <button
                                key={skill._id}
                                type="button"
                                onClick={() =>
                                  !isSelected && handleAddSkill(skill.name, skill._id)
                                }
                                disabled={isSelected}
                                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition cursor-pointer ${
                                  isSelected
                                    ? 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 cursor-not-allowed'
                                    : 'text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                                }`}
                              >
                                <span>{skill.name}</span>
                                {isSelected ? (
                                  <span className="text-[11px] font-semibold text-slate-400">
                                    Đã chọn
                                  </span>
                                ) : (
                                  <Plus className="h-3.5 w-3.5 text-slate-400" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Selected Skills Tags Display */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Kỹ năng đã chọn ({selectedSkills.length})
                  </span>
                </div>

                {selectedSkills.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center dark:border-slate-800">
                    <Briefcase className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-600 mb-2" />
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      Chưa chọn kỹ năng nào.
                    </p>
                    <p className="text-[11.5px] text-slate-400 dark:text-slate-500 mt-1">
                      Chọn từ danh sách gợi ý bên dưới hoặc tìm kiếm ở trên để nhận thông báo việc làm.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {selectedSkills.map((skill) => (
                      <span
                        key={skill.name}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary dark:border-primary/30 dark:bg-primary/20 dark:text-primary-light shadow-xs transition hover:bg-primary/15"
                      >
                        <span>{skill.name}</span>
                        {skill.isNew && (
                          <span className="rounded-md bg-emerald-500/20 px-1 py-0.2 text-[9px] font-black text-emerald-600 dark:text-emerald-400">
                            mới
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveSkill(skill.name)}
                          className="rounded-full p-0.5 text-primary/70 hover:bg-primary/20 hover:text-primary dark:text-primary-light/70 dark:hover:bg-primary/40 dark:hover:text-primary-light cursor-pointer transition"
                          title={`Gỡ bỏ ${skill.name}`}
                          aria-label={`Gỡ bỏ ${skill.name}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick-Add Popular Suggestions */}
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <span className="block text-xs font-bold text-slate-600 dark:text-slate-400">
                  Gợi ý phổ biến:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {POPULAR_SKILL_SUGGESTIONS.map((skillName) => {
                    const isSelected = selectedSkills.some(
                      (s) => s.name.toUpperCase() === skillName.toUpperCase(),
                    );
                    return (
                      <button
                        key={skillName}
                        type="button"
                        onClick={() => !isSelected && handleAddSkill(skillName)}
                        disabled={isSelected}
                        className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-semibold transition cursor-pointer active:scale-95 ${
                          isSelected
                            ? 'bg-slate-100 text-slate-400 dark:bg-slate-800/80 dark:text-slate-500 cursor-not-allowed'
                            : 'border border-slate-200 bg-white hover:border-primary hover:text-primary dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-primary-light dark:hover:text-primary-light'
                        }`}
                      >
                        <span>{skillName}</span>
                        {isSelected ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <Plus className="h-3 w-3 text-slate-400" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 4. Delivery Schedule Card */}
            <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                <span>Lịch gửi email</span>
              </h3>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
                    <Calendar className="h-4 w-4 text-primary" />
                    <span>Tần suất gửi</span>
                  </div>
                  <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                    Hàng tuần
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                    Tự động gửi vào đầu mỗi tuần.
                  </p>
                </div>

                <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
                    <MailCheck className="h-4 w-4 text-emerald-500" />
                    <span>Lần gửi gần nhất</span>
                  </div>
                  <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                    {lastEmailSentAt ? formatDate(lastEmailSentAt) : 'Chưa gửi lần nào'}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                    Cập nhật sau mỗi đợt gửi thành công.
                  </p>
                </div>

                <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
                    <Zap className="h-4 w-4 text-amber-500" />
                    <span>Tiêu chí lọc</span>
                  </div>
                  <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                    Theo kỹ năng
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                    Chỉ gửi các tin tuyển dụng đang còn hạn ứng tuyển.
                  </p>
                </div>
              </div>
            </div>

            {/* 5. Action Bar (Save / Reset) */}
            <div className="sticky bottom-4 z-20 rounded-3xl border border-slate-200/90 bg-white/95 p-4 sm:p-5 backdrop-blur-md shadow-lg dark:border-slate-800 dark:bg-slate-900/95 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                {hasChanges ? (
                  <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-bold">
                    <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
                    Có thay đổi chưa lưu
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                    <Check className="h-4 w-4" />
                    Đã lưu tất cả thay đổi
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleResetChanges}
                  disabled={!hasChanges || isSaving}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition active:scale-95 cursor-pointer"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>Khôi phục</span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleSaveSettings()}
                  disabled={isSaving}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-primary-dark hover:opacity-95 px-6 py-2.5 text-xs font-extrabold text-white shadow-md transition active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Đang lưu...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      <span>Lưu cài đặt</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right Column (4 cols): Profile & Job Seeking Controls */}
          <div className="lg:col-span-4 space-y-6">
            {/* 1. Candidate / User Profile Card */}
            <div className="rounded-3xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-5">
              <div className="flex items-center gap-3.5">
                <div className="relative">
                  <UserAvatar
                    src={user?.avatar}
                    alt={user?.name || 'User'}
                    size="lg"
                    className="border border-slate-200 shadow-xs dark:border-slate-700"
                  />
                  {user?.isVerified && (
                    <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-sky-500 text-white shadow-xs">
                      <CheckCircle2 className="h-3 w-3" />
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-base sm:text-lg font-black text-slate-900 dark:text-white">
                    {user?.name || 'Thành viên'}
                  </h3>

                  <div className="mt-1 flex items-center gap-2">
                    {user?.isVerified ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/10 px-2 py-0.5 text-[11px] font-bold text-sky-700 dark:text-sky-300">
                        <ShieldCheck className="h-3 w-3" /> Tài khoản đã xác thực
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        Tài khoản thường
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Premium Button / Status */}
              <div>
                {user?.isPremium ? (
                  <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-amber-500/5 border border-amber-500/30 p-3 text-xs font-bold text-amber-700 dark:text-amber-300">
                    <div className="flex items-center gap-2">
                      <Crown className="h-4 w-4 text-amber-500" />
                      <span>Tài khoản Premium VIP</span>
                    </div>
                    <span className="rounded-md bg-amber-500 px-2 py-0.5 text-[10px] font-black text-white">
                      Đang kích hoạt
                    </span>
                  </div>
                ) : (
                  <Link
                    to="/premium"
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 px-4 py-2.5 text-xs font-black text-white shadow-xs transition active:scale-95 cursor-pointer"
                  >
                    <Crown className="h-4 w-4" />
                    <span>Nâng cấp Premium</span>
                  </Link>
                )}
              </div>

              {/* Toggles Section */}
              <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                {/* Toggle 1: Nhận email việc làm theo kỹ năng */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
                      Nhận email việc làm
                    </span>
                    <span
                      className="cursor-pointer text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                      title="Bật hoặc tắt nhận email việc làm theo kỹ năng"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </span>
                  </div>
                  <ToggleSwitch
                    id="sidebar-toggle-email"
                    checked={isAlertActive}
                    onChange={handleToggleActive}
                    disabled={isTogglingEmail || isSaving}
                  />
                </div>

                {/* Toggle 2: Gợi ý việc làm */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
                      Gợi ý việc làm
                    </span>
                    <span
                      className="cursor-pointer text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                      title="Gợi ý việc làm phù hợp với CV của bạn"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </span>
                  </div>
                  <ToggleSwitch
                    id="sidebar-toggle-recommendation"
                    checked={isJobRecommendation}
                    onChange={handleToggleRecommendation}
                    disabled={isSavingCandidateSettings}
                  />
                </div>

                {/* Toggle 3: Trạng thái tìm việc */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
                      Trạng thái tìm việc
                    </span>
                    <ToggleSwitch
                      id="sidebar-toggle-jobseeking"
                      checked={isJobSeeking}
                      onChange={handleToggleJobSeeking}
                      disabled={isSavingCandidateSettings}
                    />
                  </div>

                  <p className="text-[11.5px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Cho phép nhà tuyển dụng tìm thấy hồ sơ của bạn trên hệ thống khi bật trạng thái tìm việc.
                  </p>

                  <div className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-primary" />
                      <span>{searchableCvCount} CV đang hiển thị</span>
                    </span>
                    <Link
                      to="/my-cv"
                      className="font-bold text-primary hover:underline cursor-pointer"
                    >
                      Đổi CV
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Cho phép NTD tìm kiếm hồ sơ & Quản lý danh sách CV Card */}
            <div className="rounded-3xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <div>
                <h4 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                  Tìm kiếm hồ sơ
                </h4>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {searchableCvCount} CV đang cho phép nhà tuyển dụng tìm kiếm
                </p>
              </div>

              <Link
                to="/my-cv"
                className="flex items-center justify-center gap-2 rounded-2xl border-2 border-primary/40 hover:border-primary bg-primary/5 hover:bg-primary/10 px-4 py-2.5 text-xs font-bold text-primary dark:text-primary-light transition active:scale-95 cursor-pointer w-full"
              >
                <Layers className="h-4 w-4" />
                <span>Quản lý CV</span>
              </Link>

              {/* Explanatory Callout with Accordion */}
              <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 space-y-2 text-xs">
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  Khi bật tính năng này, nhà tuyển dụng có thể xem kinh nghiệm, học vấn và kỹ năng trên các CV bạn cho phép tìm kiếm.
                </p>

                <button
                  type="button"
                  onClick={() => setIsInfoExpanded(!isInfoExpanded)}
                  className="flex items-center gap-1 font-bold text-primary hover:underline cursor-pointer"
                >
                  <span>Tìm hiểu thêm</span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform duration-200 ${
                      isInfoExpanded ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                <AnimatePresence>
                  {isInfoExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="pt-2 text-[11.5px] text-slate-500 dark:text-slate-400 space-y-1.5 border-t border-slate-200/60 dark:border-slate-700/60"
                    >
                      <p>
                        • Email gửi định kỳ vào đầu tuần khi có tin tuyển dụng mới phù hợp.
                      </p>
                      <p>
                        • Bạn có thể thêm hoặc xóa kỹ năng bất cứ lúc nào.
                      </p>
                      <p>
                        • Nhà tuyển dụng chỉ xem được các CV bạn bật "Cho phép tìm kiếm".
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* 3. TalentPulse AI Matching Banner */}
            <div className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-slate-900/5 to-slate-900/10 p-5 dark:border-primary/30 dark:from-primary/20 dark:via-slate-900 dark:to-slate-900/60 space-y-3">
              <div className="flex items-center gap-2 text-primary dark:text-primary-light">
                <Sparkles className="h-5 w-5" />
                <span className="text-xs font-black uppercase tracking-wider">
                  AI Matching
                </span>
              </div>
              <h5 className="text-sm font-extrabold text-slate-900 dark:text-white">
                Gợi ý việc làm tự động
              </h5>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Hệ thống tự động so sánh kỹ năng trong hồ sơ với yêu cầu tuyển dụng để gửi các cơ hội việc làm phù hợp nhất.
              </p>
            </div>
          </div>
        </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

export default JobAlertSettingsPage;
