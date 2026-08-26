import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import {
  employerApi,
  type HrJobItem,
  type CompanyInfo,
} from '../../../lib/employerApi';
import { useToast } from '../../../context/ToastContext';
import { CompanyRequiredGate } from '../components/CompanyRequiredGate';
import { formatDate } from '../../../lib/dateUtils';

interface JobManagementTabProps {
  company: CompanyInfo | null;
  hasCompany: boolean;
  isProfileComplete: boolean;
  accessToken: string | null;
  todayPostedCount: number;
  maxDailyJobs: number;
  onNavigateTab: (tab: string, extraData?: any) => void;
  onRefreshStats: () => Promise<void>;
}

export function JobManagementTab({
  company,
  hasCompany,
  isProfileComplete,
  accessToken,
  maxDailyJobs,
  onNavigateTab,
  onRefreshStats,
}: JobManagementTabProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { success, error, info } = useToast();

  const [jobs, setJobs] = useState<HrJobItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'EXPIRED' | 'HOT'>('ALL');
  const [boostingJobId, setBoostingJobId] = useState<string | null>(null);
  const [showPremiumModal, setShowPremiumModal] = useState(false);

  const isPremium = maxDailyJobs >= 999;
  const maxActiveJobs = isPremium ? 999999 : 6;

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
  const hotJobsCount = jobs.filter((j) => j.isHot && j.isActive !== false && new Date(j.endDate) >= new Date()).length;

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

  // Handle Boosting Job to TOP (Premium Perk)
  const handleBoostJob = async (job: HrJobItem) => {
    if (!accessToken) return;

    if (!isPremium) {
      setShowPremiumModal(true);
      return;
    }

    setBoostingJobId(job._id);
    try {
      const res = await employerApi.boostJob(job._id, accessToken);
      success(res.message || '🚀 Đã đẩy TOP tin tuyển dụng thành công! Tin sẽ hiển thị đầu trang với nhãn HOT.');
      await fetchJobs();
      await onRefreshStats();
    } catch (err: any) {
      console.error('Failed to boost job', err);
      error(err?.response?.data?.message || 'Không thể đẩy TOP tin tuyển dụng');
    } finally {
      setBoostingJobId(null);
    }
  };

  // Filter Jobs
  const filteredJobs = jobs.filter((job) => {
    if (statusFilter === 'HOT') {
      return job.isHot === true;
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
                    Gói tài khoản: <strong className="text-amber-600 dark:text-amber-400 font-extrabold">HR Premium (Không giới hạn tin & Đẩy TOP HOT)</strong>
                  </>
                ) : (
                  <>
                    Tin đang hoạt động:{' '}
                    <strong
                      className={`font-black ${
                        activeCount >= maxActiveJobs ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {activeCount}/{maxActiveJobs}
                    </strong>{' '}
                    tin ({activeCount >= maxActiveJobs ? 'Đã đạt giới hạn' : `Còn lại ${maxActiveJobs - activeCount}`})
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
            <span>HOT / TOP ({hotJobsCount})</span>
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
                  <th className="px-6 py-4">{t('employer.jobsTab.colJobName')}</th>
                  <th className="px-6 py-4">{t('employer.jobsTab.colLevel')}</th>
                  <th className="px-6 py-4">{t('employer.jobsTab.colDates')}</th>
                  <th className="px-6 py-4 text-center">{t('employer.jobsTab.colApplications')}</th>
                  <th className="px-6 py-4 text-center">{t('employer.jobsTab.colStatus')}</th>
                  <th className="px-6 py-4 text-right">{t('employer.jobsTab.colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredJobs.map((job) => {
                  const isExpired = new Date(job.endDate) < new Date();
                  const isVisible = job.isActive !== false;
                  const isBoosting = boostingJobId === job._id;

                  return (
                    <tr
                      key={job._id}
                      className={`transition ${
                        job.isHot
                          ? 'bg-amber-50/25 hover:bg-amber-50/50 dark:bg-amber-950/10 dark:hover:bg-amber-950/20'
                          : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      {/* Job Title, HOT Badge & Skills */}
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900 dark:text-white flex flex-wrap items-center gap-2">
                          <span className="text-sm sm:text-base">{job.name}</span>

                          {/* HOT / TOP Badge */}
                          {job.isHot && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-red-500 to-amber-500 text-white font-extrabold text-[10.5px] shadow-xs animate-pulse tracking-wide select-none">
                              <Flame className="h-3 w-3 fill-white" />
                              <span>HOT TOP</span>
                            </span>
                          )}

                          {!isVisible && (
                            <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
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
                            <span className="text-[10px] text-slate-400 font-medium">
                              +{(job.skills || []).length - 4}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Salary & Level */}
                      <td className="px-6 py-4">
                        <div className="font-bold text-emerald-600 dark:text-emerald-400">
                          {job.salary ? `${job.salary.toLocaleString('vi-VN')} ₫` : 'Thương lượng'}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {job.level} &bull; {job.location}
                        </div>
                      </td>

                      {/* Dates */}
                      <td className="px-6 py-4 text-xs text-slate-500 dark:text-slate-400">
                        <div>
                          Hết hạn:{' '}
                          <strong className={isExpired ? 'text-rose-500' : 'text-slate-700 dark:text-slate-300'}>
                            {formatDate(job.endDate)}
                          </strong>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Tạo: {formatDate(job.createdAt)}
                        </div>
                      </td>

                      {/* Applications count & Candidate shortcut */}
                      <td className="px-6 py-4 text-center">
                        <button
                          type="button"
                          onClick={() => onNavigateTab('candidates', { filterJobId: job._id })}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-50 px-3 py-1 text-xs font-bold text-primary hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900 transition cursor-pointer"
                        >
                          <Users className="h-3.5 w-3.5" />
                          <span>{job.applicationsCount || 0} hồ sơ</span>
                        </button>
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4 text-center">
                        {isExpired ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                            {t('employer.jobsTab.statusExpired')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                            {t('employer.jobsTab.statusActive')}
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* Boost to TOP Button */}
                          <button
                            type="button"
                            disabled={isBoosting || isExpired}
                            onClick={() => handleBoostJob(job)}
                            className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold transition shadow-2xs cursor-pointer ${
                              job.isHot
                                ? 'border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-xs'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                            title={job.isHot ? 'Đã ở TOP, nhấn để làm mới vị trí' : 'Đẩy tin lên đầu trang tìm kiếm với nhãn HOT'}
                          >
                            {isBoosting ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Flame className={`h-3.5 w-3.5 ${job.isHot ? 'text-amber-600 dark:text-amber-400 fill-amber-500' : ''}`} />
                            )}
                            <span>{job.isHot ? 'Đẩy lại TOP' : 'Đẩy TOP'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenEdit(job)}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:border-primary hover:text-primary transition dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-primary-light cursor-pointer shadow-2xs"
                            title={t('employer.jobsTab.editJobBtn')}
                          >
                            <Edit className="h-3.5 w-3.5" />
                            <span>Sửa</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteJob(job._id)}
                            className="rounded-xl p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-600 transition dark:hover:bg-rose-950/40 cursor-pointer"
                            title={t('employer.jobsTab.deleteJobBtn')}
                          >
                            <Trash2 className="h-4 w-4" />
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
      {showPremiumModal && (
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
              Tài khoản HR miễn phí chỉ có tối đa <strong>6 tin tuyển dụng hoạt động cùng lúc</strong> và không thể đẩy TOP. Nâng cấp ngay gói <strong>HR Premium</strong> để sở hữu toàn bộ đặc quyền:
            </p>

            <div className="mt-5 space-y-3 rounded-2xl bg-amber-50/70 p-4 border border-amber-200/70 dark:bg-amber-950/40 dark:border-amber-800/60">
              <div className="flex items-start gap-2.5 text-xs text-amber-950 dark:text-amber-200">
                <Flame className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <span><strong>Đẩy TOP không giới hạn:</strong> Đưa tin tuyển dụng lên vị trí #1 trang tìm kiếm việc làm</span>
              </div>
              <div className="flex items-start gap-2.5 text-xs text-amber-950 dark:text-amber-200">
                <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <span><strong>Gắn nhãn HOT nổi bật:</strong> Thu hút gấp 3 lần ứng viên xuất sắc ứng tuyển</span>
              </div>
              <div className="flex items-start gap-2.5 text-xs text-amber-950 dark:text-amber-200">
                <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <span><strong>Đăng tin không giới hạn:</strong> Mở rộng quy mô tuyển dụng không bị giới hạn 6 tin</span>
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
        </div>
      )}
    </div>
  );
}
