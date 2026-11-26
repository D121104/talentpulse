import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Briefcase,
  PlusCircle,
  Search,
  Users,
  Sparkles,
  Edit,
  Trash2,
  Loader2,
  Crown,
  Flame,
  Zap,
  ArrowRight,
  X,
  Clock,
  XCircle,
  RefreshCw,
} from 'lucide-react';
import {
  employerApi,
  type HrJobItem,
  type CompanyInfo,
} from '../../../lib/employerApi';
import { useToast } from '../../../context/ToastContext';
import { CompanyRequiredGate } from '../components/CompanyRequiredGate';
import { formatDate } from '../../../lib/dateUtils';

export const isJobHotActive = (job: HrJobItem): boolean => {
  if (!job.isHot || !job.boostExpiresAt) return false;
  return new Date(job.boostExpiresAt).getTime() > Date.now();
};

function HotCountdownTimer({
  expiresAt,
  onExpire,
}: {
  expiresAt: string;
  onExpire?: () => void;
}) {
  const calculateRemaining = () => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) {
      return { hours: 0, minutes: 0, seconds: 0, isExpired: true };
    }
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    return { hours, minutes, seconds, isExpired: false };
  };

  const [timeLeft, setTimeLeft] = useState(calculateRemaining);

  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = calculateRemaining();
      setTimeLeft(remaining);
      if (remaining.isExpired) {
        clearInterval(timer);
        onExpire?.();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [expiresAt, onExpire]);

  if (timeLeft.isExpired) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-900/50 dark:text-rose-400">
        Hết hạn HOT
      </span>
    );
  }

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-mono font-extrabold text-amber-700 dark:text-amber-300 border border-amber-500/30 shadow-2xs"
      title={`Hết hạn lúc: ${new Date(expiresAt).toLocaleString('vi-VN')}`}
    >
      <Clock className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
      <span>
        {pad(timeLeft.hours)}:{pad(timeLeft.minutes)}:{pad(timeLeft.seconds)}
      </span>
    </span>
  );
}

interface JobManagementTabProps {
  company: CompanyInfo | null;
  hasCompany: boolean;
  isProfileComplete: boolean;
  accessToken: string | null;
  todayPostedCount: number;
  maxDailyJobs: number;
  maxActiveJobsProp?: number;
  hotJobLimit?: number;
  isPremium?: boolean;
  packageName?: string;
  onNavigateTab: (tab: string, extraData?: any) => void;
  onRefreshStats: () => Promise<void>;
}

export function JobManagementTab({
  company,
  hasCompany,
  isProfileComplete,
  accessToken,
  maxDailyJobs,
  maxActiveJobsProp,
  hotJobLimit,
  isPremium: isPremiumProp,
  packageName,
  onNavigateTab,
  onRefreshStats,
}: JobManagementTabProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { success, error, info } = useToast();

  const effectiveHotJobLimit = typeof hotJobLimit === 'number' && hotJobLimit > 0 ? hotJobLimit : 5;

  const [jobs, setJobs] = useState<HrJobItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'EXPIRED' | 'HOT'>('ALL');
  const [boostingJobId, setBoostingJobId] = useState<string | null>(null);
  const [unboostingJobId, setUnboostingJobId] = useState<string | null>(null);
  const [showPremiumModal, setShowPremiumModal] = useState(false);

  const isPremium = isPremiumProp !== undefined ? isPremiumProp : maxDailyJobs >= 999;
  const maxActiveJobs = maxActiveJobsProp ?? (isPremium ? 999999 : 6);

  const fetchJobs = async () => {
    if (!accessToken || !hasCompany) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      if (searchQuery.trim()) {
        const res = await employerApi.searchHrJobs(searchQuery, { current: 1, pageSize: 50 }, accessToken);
        setJobs(res.result || []);
      } else {
        const res = await employerApi.getHrJobs({ current: 1, pageSize: 50 }, accessToken);
        setJobs(res.result || []);
      }
    } catch (err) {
      console.error('Failed to load HR jobs', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchJobs();
  }, [accessToken, hasCompany, searchQuery]);

  // Calculate statistics
  const activeJobs = jobs.filter((j) => j.isActive !== false && new Date(j.endDate) >= new Date());
  const activeCount = activeJobs.length;
  const expiredCount = jobs.filter((j) => new Date(j.endDate) < new Date()).length;
  const hotJobsCount = jobs.filter(
    (j) => isJobHotActive(j) && j.isActive !== false && new Date(j.endDate) >= new Date(),
  ).length;

  const handleOpenCreate = () => {
    if (!hasCompany || !isProfileComplete) {
      info(t('employer.dashboardTab.onboardingTitle', 'Vui lòng cập nhật đầy đủ thông tin doanh nghiệp trước khi đăng tin'));
      onNavigateTab('company');
      return;
    }

    if (!isPremium && activeCount >= maxActiveJobs) {
      info(`Tài khoản HR miễn phí chỉ được tối đa ${maxActiveJobs} tin tuyển dụng đang hoạt động cùng lúc (${activeCount}/${maxActiveJobs}). Hãy nâng cấp HR Premium để đăng tin không giới hạn!`);
      setShowPremiumModal(true);
      return;
    }

    navigate('/hr/jobs/create');
  };

  const handleOpenEdit = (job: HrJobItem) => {
    navigate(`/hr/jobs/edit/${job._id}`);
  };

  const handleDeleteJob = async (jobId: string) => {
    if (!window.confirm(t('employer.jobsTab.deleteConfirm', 'Bạn có chắc muốn xóa tin tuyển dụng này?'))) return;
    if (!accessToken) return;

    try {
      await employerApi.deleteJob(jobId, accessToken);
      success('Đã xóa tin tuyển dụng thành công');
      await fetchJobs();
      await onRefreshStats();
    } catch (err: any) {
      console.error('Failed to delete job', err);
      error(err?.response?.data?.message || 'Không thể xóa tin tuyển dụng');
    }
  };

  // Handle Boosting Job to TOP (HOT 24h)
  const handleBoostJob = async (job: HrJobItem) => {
    if (!accessToken) return;

    if (!isPremium && hotJobsCount >= 1) {
      error(
        'Tài khoản HR Thường chỉ được đẩy HOT 1 tin trong 1 tháng (bạn đã sử dụng lượt của tháng này). Vui lòng nâng cấp HR Premium để đẩy HOT đồng thời nhiều tin tuyển dụng và tự do đổi tin!',
      );
      setShowPremiumModal(true);
      return;
    }

    setBoostingJobId(job._id);
    try {
      const res = await employerApi.boostJob(job._id, accessToken);
      success(
        res.message ||
          '🚀 Đã đẩy TOP tin tuyển dụng thành công (hiệu lực 24 giờ)! Tin sẽ hiển thị đầu trang với nhãn HOT.',
      );
      await fetchJobs();
      await onRefreshStats();
    } catch (err: any) {
      console.error('Failed to boost job', err);
      const errMsg =
        err?.response?.data?.message || err?.message || 'Không thể đẩy TOP tin tuyển dụng';
      error(errMsg);
      if (!isPremium && (errMsg.includes('HR Standard') || errMsg.includes('1 tháng'))) {
        setShowPremiumModal(true);
      }
    } finally {
      setBoostingJobId(null);
    }
  };

  // Handle Unboosting Job (Free up HOT slot - Premium only)
  const handleUnboostJob = async (job: HrJobItem) => {
    if (!accessToken) return;

    setUnboostingJobId(job._id);
    try {
      const res = await employerApi.unboostJob(job._id, accessToken);
      success(res.message || 'Đã gỡ nhãn HOT của tin tuyển dụng thành công! Đã giải phóng 1 slot đẩy HOT.');
      await fetchJobs();
      await onRefreshStats();
    } catch (err: any) {
      console.error('Failed to unboost job', err);
      error(err?.response?.data?.message || err?.message || 'Không thể gỡ nhãn HOT');
    } finally {
      setUnboostingJobId(null);
    }
  };

  // Filter Jobs
  const filteredJobs = jobs.filter((job) => {
    if (statusFilter === 'HOT') {
      return isJobHotActive(job);
    }
    if (statusFilter === 'ACTIVE') {
      return job.isActive !== false && new Date(job.endDate) >= new Date();
    }
    if (statusFilter === 'EXPIRED') {
      return new Date(job.endDate) < new Date();
    }
    return true;
  });

  if (!hasCompany) {
    return (
      <CompanyRequiredGate
        title={t('employer.jobsTab.title')}
        description="Bạn cần tham gia hoặc khởi tạo một doanh nghiệp trước khi có thể đăng tải tin tuyển dụng và quản lý các vị trí việc làm."
        onNavigateTab={onNavigateTab}
      />
    );
  }

  // =========================================================================
  // JOB LISTINGS TABLE & DASHBOARD VIEW
  // =========================================================================
  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* 1. Header & Quota Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-3xl border border-slate-200/90 bg-white p-6 sm:p-8 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary dark:bg-primary/20">
              <Briefcase className="h-5 w-5" />
            </span>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {t('employer.jobsTab.title')}
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            {t('employer.jobsTab.subtitle')} &bull; <span className="font-bold text-primary">{company?.name}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Active Jobs Quota Pill */}
          <div
            className={`rounded-2xl border px-4 py-2.5 text-xs font-medium transition shadow-2xs ${
              isPremium
                ? 'border-amber-300/80 bg-amber-50/80 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200'
                : activeCount >= maxActiveJobs
                ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200'
                : 'border-slate-200 bg-slate-50/80 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {isPremium ? (
                <Crown className="h-4 w-4 text-amber-500 shrink-0" />
              ) : (
                <Sparkles className="h-4 w-4 text-primary shrink-0" />
              )}
              <span>
                {isPremium ? (
                  <>
                    Gói tài khoản: <strong className="text-amber-600 dark:text-amber-400 font-extrabold">{packageName || 'HR Premium'}</strong> &bull; Đang đẩy HOT: <strong className={`font-black ${hotJobsCount >= effectiveHotJobLimit ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>{hotJobsCount}/{effectiveHotJobLimit} tin</strong> (Hạn 24h/tin)
                  </>
                ) : (
                  <>
                    Tin hoạt động:{' '}
                    <strong
                      className={`font-black ${
                        activeCount >= maxActiveJobs ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {activeCount}/{maxActiveJobs}
                    </strong>{' '}
                    tin &bull; Đẩy HOT: <strong className="text-amber-600 dark:text-amber-400 font-bold">{hotJobsCount > 0 ? `${hotJobsCount} tin đang HOT (24h)` : '1 lần/tháng'}</strong>
                  </>
                )}
              </span>
            </div>
          </div>

          {/* Upgrade to HR Premium CTA when on Free quota */}
          {!isPremium && (
            <button
              type="button"
              onClick={() => onNavigateTab('premium')}
              className="inline-flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-600 hover:to-orange-700 px-4 py-2.5 text-xs font-black text-white shadow-md shadow-amber-500/20 active:scale-95 transition cursor-pointer"
            >
              <Crown className="h-4 w-4" />
              <span>Nâng cấp HR Premium</span>
            </button>
          )}

          {/* Post Job CTA */}
          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-lg shadow-primary/25 hover:bg-primary-dark transition active:scale-95 cursor-pointer"
          >
            <PlusCircle className="h-4.5 w-4.5" />
            <span>{t('employer.jobsTab.postJobBtn')}</span>
          </button>
        </div>
      </div>

      {/* 2. Filters & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('employer.jobsTab.searchPlaceholder')}
            className="w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-xs sm:text-sm text-slate-900 shadow-xs focus:border-primary focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white"
          />
        </div>

        <div className="flex items-center gap-1.5 self-start sm:self-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition cursor-pointer ${
              statusFilter === 'ALL'
                ? 'bg-primary text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
            }`}
          >
            {t('employer.jobsTab.filterAll')} ({jobs.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('ACTIVE')}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition cursor-pointer ${
              statusFilter === 'ACTIVE'
                ? 'bg-primary text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
            }`}
          >
            {t('employer.jobsTab.filterActive')} ({activeCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('EXPIRED')}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition cursor-pointer ${
              statusFilter === 'EXPIRED'
                ? 'bg-primary text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
            }`}
          >
            {t('employer.jobsTab.filterExpired')} ({expiredCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('HOT')}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
              statusFilter === 'HOT'
                ? 'bg-gradient-to-r from-red-500 to-amber-500 text-white shadow-xs'
                : 'text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/40'
            }`}
          >
            <Flame className="h-3.5 w-3.5" />
            <span>HOT / TOP ({hotJobsCount}{isPremium ? `/${hotJobLimit}` : ''})</span>
          </button>
        </div>
      </div>

      {/* 3. Job Listings Table / Cards */}
      {isLoading ? (
        <div className="py-20 text-center rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="mt-2 text-xs text-slate-400">{t('employer.jobsTab.submittingBtn')}</p>
        </div>
      ) : filteredJobs.length > 0 ? (
        <div className="overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700 dark:text-slate-300">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                <tr>
                  <th className="px-6 py-4 min-w-[260px]">{t('employer.jobsTab.colJobName')}</th>
                  <th className="px-6 py-4 whitespace-nowrap">{t('employer.jobsTab.colLevel')}</th>
                  <th className="px-6 py-4 whitespace-nowrap">{t('employer.jobsTab.colDates')}</th>
                  <th className="px-6 py-4 text-center whitespace-nowrap">{t('employer.jobsTab.colApplications')}</th>
                  <th className="px-6 py-4 text-center whitespace-nowrap">{t('employer.jobsTab.colStatus')}</th>
                  <th className="px-6 py-4 text-right whitespace-nowrap">{t('employer.jobsTab.colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredJobs.map((job) => {
                  const isExpired = new Date(job.endDate) < new Date();
                  const isVisible = job.isActive !== false;
                  const isHot = isJobHotActive(job);
                  const isBoosting = boostingJobId === job._id;
                  const isUnboosting = unboostingJobId === job._id;

                  return (
                    <tr
                      key={job._id}
                      className={`transition ${
                        isHot
                          ? 'bg-amber-50/30 hover:bg-amber-50/50 dark:bg-amber-950/15 dark:hover:bg-amber-950/25'
                          : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      {/* Job Title, HOT Badge & Skills */}
                      <td className="px-6 py-4 min-w-[260px]">
                        <div className="font-bold text-slate-900 dark:text-white flex flex-wrap items-center gap-2">
                          <span className="text-sm sm:text-base leading-snug">{job.name}</span>

                          {/* HOT / TOP Badge with Countdown */}
                          {isHot && (
                            <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-red-500 to-amber-500 text-white font-extrabold text-[10.5px] shadow-xs animate-pulse tracking-wide select-none whitespace-nowrap">
                                <Flame className="h-3 w-3 fill-white shrink-0" />
                                <span>HOT TOP</span>
                              </span>
                              {job.boostExpiresAt && (
                                <HotCountdownTimer
                                  expiresAt={job.boostExpiresAt}
                                  onExpire={fetchJobs}
                                />
                              )}
                            </div>
                          )}

                          {!isVisible && (
                            <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300 whitespace-nowrap">
                              {t('employer.jobsTab.isActiveOff')}
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {(job.skills || []).slice(0, 4).map((sk) => (
                            <span
                              key={sk}
                              className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                            >
                              {sk}
                            </span>
                          ))}
                          {(job.skills || []).length > 4 && (
                            <span className="text-[10px] text-slate-400 font-medium self-center">
                              +{(job.skills || []).length - 4}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Salary & Level */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-extrabold text-emerald-600 dark:text-emerald-400 text-sm">
                          {job.salary ? `${Number(job.salary).toLocaleString('vi-VN')} ₫` : 'Thương lượng'}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 whitespace-nowrap">
                          {job.level} &bull; {job.location}
                        </div>
                      </td>

                      {/* Dates */}
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <span>Hết hạn:</span>
                          <strong className={isExpired ? 'text-rose-500 font-bold' : 'text-slate-800 dark:text-slate-200 font-bold'}>
                            {job.endDate ? formatDate(job.endDate) : '--'}
                          </strong>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Tạo: {job.createdAt ? formatDate(job.createdAt) : '--'}
                        </div>
                        {isHot && job.boostExpiresAt && (
                          <div className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold mt-1 flex items-center gap-1">
                            <Flame className="h-3 w-3 shrink-0 fill-amber-500 text-amber-500" />
                            <span>HOT đến: {new Date(job.boostExpiresAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} {formatDate(job.boostExpiresAt)}</span>
                          </div>
                        )}
                      </td>

                      {/* Applications count & Candidate shortcut */}
                      <td className="px-6 py-4 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onNavigateTab('candidates', { filterJobId: job._id })}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-bold text-primary hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900 transition cursor-pointer whitespace-nowrap shadow-2xs"
                        >
                          <Users className="h-3.5 w-3.5 shrink-0" />
                          <span>{job.applicationsCount || 0} hồ sơ</span>
                        </button>
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4 text-center whitespace-nowrap">
                        {isExpired ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 whitespace-nowrap">
                            {t('employer.jobsTab.statusExpired')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 whitespace-nowrap">
                            {t('employer.jobsTab.statusActive')}
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          {/* Boost to TOP or Unboost Actions */}
                          {isHot ? (
                            isPremium ? (
                              <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                {/* Nút Gỡ HOT cho Premium */}
                                <button
                                  type="button"
                                  disabled={isUnboosting}
                                  onClick={() => handleUnboostJob(job)}
                                  className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300 transition shadow-2xs cursor-pointer disabled:opacity-50 whitespace-nowrap"
                                  title="Gỡ nhãn HOT để nhường slot đẩy cho tin khác (Đặc quyền Premium)"
                                >
                                  {isUnboosting ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-rose-600 shrink-0" />
                                  ) : (
                                    <XCircle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                                  )}
                                  <span>Gỡ HOT</span>
                                </button>

                                {/* Nút Gia hạn HOT (24h) cho Premium */}
                                <button
                                  type="button"
                                  disabled={isBoosting || isExpired}
                                  onClick={() => handleBoostJob(job)}
                                  className="inline-flex items-center gap-1 rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300 transition shadow-2xs cursor-pointer disabled:opacity-50 whitespace-nowrap"
                                  title="Gia hạn thêm 24h đẩy HOT cho tin này"
                                >
                                  {isBoosting ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600 shrink-0" />
                                  ) : (
                                    <RefreshCw className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                                  )}
                                  <span>Gia hạn HOT</span>
                                </button>
                              </div>
                            ) : (
                              /* HR Thường: Không có nút gỡ hay gia hạn, hiển thị badge Đang HOT */
                              <div
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 text-xs font-bold whitespace-nowrap select-none"
                                title="Tin đang được đẩy HOT (1 lượt/tháng). Tài khoản thường không thể gỡ thu hồi hay đổi sang tin khác."
                              >
                                <Flame className="h-3.5 w-3.5 fill-amber-500 text-amber-500 animate-pulse shrink-0" />
                                <span>Đang HOT (24h)</span>
                              </div>
                            )
                          ) : (
                            <button
                              type="button"
                              disabled={isBoosting || isExpired}
                              onClick={() => handleBoostJob(job)}
                              className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold text-white shadow-xs transition cursor-pointer whitespace-nowrap ${
                                !isPremium && hotJobsCount >= 1
                                  ? 'bg-slate-400 dark:bg-slate-700 hover:bg-slate-500 cursor-pointer'
                                  : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600'
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                              title={
                                isPremium
                                  ? `Đẩy tin lên đầu trang với nhãn HOT trong 24h (Tối đa ${effectiveHotJobLimit} tin cùng lúc)`
                                  : hotJobsCount >= 1
                                  ? 'Bạn đã sử dụng lượt đẩy HOT của tháng này. Nâng cấp HR Premium để đẩy nhiều tin cùng lúc!'
                                  : 'Đẩy tin lên đầu trang với nhãn HOT trong 24h (1 tin/tháng với tài khoản thường)'
                              }
                            >
                              {isBoosting ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                              ) : (
                                <Flame className="h-3.5 w-3.5 shrink-0" />
                              )}
                              <span>Đẩy TOP</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleOpenEdit(job)}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:border-primary hover:text-primary transition dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-primary-light cursor-pointer shadow-2xs whitespace-nowrap"
                            title={t('employer.jobsTab.editJobBtn')}
                          >
                            <Edit className="h-3.5 w-3.5 shrink-0" />
                            <span>Sửa</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteJob(job._id)}
                            className="rounded-xl p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-600 transition dark:hover:bg-rose-950/40 cursor-pointer whitespace-nowrap"
                            title={t('employer.jobsTab.deleteJobBtn')}
                          >
                            <Trash2 className="h-4 w-4 shrink-0" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
          <Briefcase className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600 mb-3" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            {t('employer.jobsTab.noJobsFound')}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            {t('employer.jobsTab.subtitle')}
          </p>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-primary/20 hover:bg-primary-dark transition cursor-pointer"
          >
            <PlusCircle className="h-4 w-4" />
            <span>{t('employer.jobsTab.postJobBtn')}</span>
          </button>
        </div>
      )}

      {/* ================= PREMIUM UPGRADE PROMPT MODAL ================= */}
      {showPremiumModal &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="relative w-full max-w-md rounded-3xl bg-white p-6 sm:p-8 shadow-2xl dark:bg-slate-900 border border-amber-200 dark:border-amber-800/80">
              <button
                type="button"
                onClick={() => setShowPremiumModal(false)}
                className="absolute right-4 top-4 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/30 mb-5">
                <Crown className="h-7 w-7" />
              </div>

              <h3 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">
                Đặc Quyền HR Premium VIP
              </h3>
              <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Tài khoản HR miễn phí chỉ được đăng tối đa <strong>6 tin hoạt động</strong> và chỉ được <strong>đẩy HOT 1 tin trong 1 tháng</strong> (hiệu lực 24 giờ). Nâng cấp <strong>HR Premium</strong> để sở hữu toàn bộ đặc quyền bứt phá tuyển dụng:
              </p>

              <div className="mt-5 space-y-3 rounded-2xl bg-amber-50/70 p-4 border border-amber-200/70 dark:bg-amber-950/40 dark:border-amber-800/60">
                <div className="flex items-start gap-2.5 text-xs text-amber-950 dark:text-amber-200">
                  <Flame className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <span><strong>Đẩy HOT đồng thời:</strong> Đẩy thoải mái không giới hạn lượt, tối đa lên đến 10 tin tùy gói dịch vụ. Mỗi tin hiệu lực 24h và có thể gỡ HOT bất kỳ lúc nào để nhường slot cho tin khác!</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs text-amber-950 dark:text-amber-200">
                  <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <span><strong>Vị trí HOT TOP độc quyền:</strong> Đưa tin lên vị trí số #1 trang tìm kiếm việc làm, thu hút ứng viên xuất sắc nhất.</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs text-amber-950 dark:text-amber-200">
                  <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <span><strong>Đăng tin không giới hạn:</strong> Thoải mái mở rộng quy mô tuyển dụng doanh nghiệp không lo chạm trần 6 tin.</span>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowPremiumModal(false)}
                  className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Để sau
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowPremiumModal(false);
                    onNavigateTab('premium');
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 px-5 py-2.5 text-xs font-black text-white shadow-lg shadow-amber-500/25 hover:from-amber-600 hover:to-orange-600 cursor-pointer transition active:scale-95"
                >
                  <span>Nâng cấp ngay</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
