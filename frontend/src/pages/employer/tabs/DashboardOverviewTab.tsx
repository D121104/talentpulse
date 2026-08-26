import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  Briefcase,
  Users,
  CheckCircle2,
  Building2,
  TrendingUp,
  ArrowUpRight,
  Sparkles,
  AlertCircle,
  PlusCircle,
  Search,
  Eye,
  ChevronRight,
  ShieldCheck,
  Zap,
  Crown,
} from 'lucide-react';
import type { HrDashboardStats } from '../../../lib/employerApi';

import { CompanyRequiredGate } from '../components/CompanyRequiredGate';

interface DashboardOverviewTabProps {
  data: HrDashboardStats | null;
  isLoading: boolean;
  onNavigateTab: (tab: string, extraData?: any) => void;
  onOpenCreateJob: () => void;
}

export function DashboardOverviewTab({
  data,
  isLoading,
  onNavigateTab,
  onOpenCreateJob,
}: DashboardOverviewTabProps) {
  const { t } = useTranslation();
  const [hoveredDayIndex, setHoveredDayIndex] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-32 rounded-3xl bg-slate-200 dark:bg-slate-800" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-2xl bg-slate-200 dark:bg-slate-800" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="h-80 rounded-3xl bg-slate-200 dark:bg-slate-800 lg:col-span-2" />
          <div className="h-80 rounded-3xl bg-slate-200 dark:bg-slate-800" />
        </div>
      </div>
    );
  }

  const hasCompany = data?.hasCompany ?? false;
  const isProfileComplete = data?.isProfileComplete ?? false;
  const stats = data?.stats;
  const company = data?.company;

  if (!hasCompany) {
    return (
      <CompanyRequiredGate
        title="Báo cáo & Thống kê Hiệu quả Tuyển dụng"
        description="Dashboard phân tích số liệu tuyển dụng, biểu đồ ứng tuyển 7 ngày và danh sách hồ sơ mới nhất chỉ khả dụng khi bạn đã tham gia hoặc khởi tạo doanh nghiệp."
        onNavigateTab={onNavigateTab}
      />
    );
  }

  const dailyStats = stats?.dailyApplicationStats || [];
  const maxDailyCount = Math.max(...dailyStats.map((d) => d.count), 5);

  const maxDailyJobs = stats?.maxDailyJobs ?? 5;

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Top Policy & Benefits Announcement Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-blue-900 via-primary-dark to-slate-900 px-5 py-3.5 text-white shadow-md shadow-blue-950/20">
        <div className="flex items-center gap-3 text-xs sm:text-sm font-medium">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-primary-light backdrop-blur-sm">
            <Zap className="h-4 w-4" />
          </span>
          <div>
            <span className="font-semibold text-blue-200">{t('employer.sidebar.freeTierTitle')}:</span> {t('employer.dashboardTab.policyNotice')}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigateTab('jobs')}
            className="text-xs font-semibold text-white/90 hover:text-white underline underline-offset-4 cursor-pointer"
          >
            {t('employer.sidebar.menuJobs')}
          </button>
          <span className="text-white/40">&bull;</span>
          <button
            onClick={() => onNavigateTab('company')}
            className="text-xs font-semibold text-blue-300 hover:text-blue-200 cursor-pointer"
          >
            {t('employer.sidebar.menuCompany')} &rarr;
          </button>
        </div>
      </div>

      {/* 2. Incomplete Company Profile Banner Gate */}
      {(!hasCompany || !isProfileComplete) && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-3xl border border-amber-200/80 bg-gradient-to-br from-amber-50/90 via-white to-blue-50/50 p-6 sm:p-8 shadow-xl shadow-amber-950/5 dark:border-amber-900/40 dark:from-amber-950/30 dark:via-slate-900 dark:to-slate-900"
        >
          <div className="pointer-events-none absolute -right-12 -top-12 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
          <div className="pointer-events-none absolute -left-12 -bottom-12 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl" />

          <div className="relative flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex-1 space-y-3 text-center md:text-left">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/80 bg-amber-100/80 px-3 py-1 text-xs font-bold text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/50 dark:text-amber-300">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>{t('employer.sidebar.needUpdate')}</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                {t('employer.dashboardTab.onboardingTitle')}
              </h2>
              <p className="max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {t('employer.dashboardTab.onboardingDesc')}
              </p>
              <div className="pt-2 flex flex-wrap items-center justify-center md:justify-start gap-3">
                <button
                  type="button"
                  onClick={() => onNavigateTab('company')}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 transition hover:from-emerald-700 hover:to-teal-700 active:scale-95 cursor-pointer"
                >
                  <Building2 className="h-4 w-4" />
                  <span>{t('employer.dashboardTab.updateCompanyBtn')}</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="relative shrink-0 flex items-center justify-center">
              <div className="relative flex h-36 w-36 sm:h-44 sm:w-44 items-center justify-center rounded-3xl bg-gradient-to-tr from-primary/10 to-teal-500/10 border border-primary/20 p-4">
                <div className="absolute inset-0 flex items-center justify-center animate-pulse">
                  <div className="h-28 w-28 rounded-full bg-primary/10 blur-xl" />
                </div>
                <div className="relative flex flex-col items-center text-center space-y-2">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent text-white shadow-lg shadow-primary/30">
                    <Sparkles className="h-7 w-7" />
                  </span>
                  <span className="text-[11px] font-bold tracking-wider uppercase text-primary dark:text-primary-light">
                    AI Talent Match
                  </span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}


      {/* 3. Core Key Metrics Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Metric 1: Total Jobs */}
        <motion.div
          whileHover={{ y: -2 }}
          className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t('employer.dashboardTab.statTotalJobs')}
            </span>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-primary dark:bg-blue-950/60 dark:text-primary-light">
              <Briefcase className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 dark:text-white">
              {stats?.totalJobs ?? 0}
            </span>
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              {stats?.activeJobs ?? 0} {t('employer.dashboardTab.statTotalJobsSub')}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{maxDailyJobs >= 999 ? 'Gói tuyển dụng:' : 'Tin đang hoạt động:'}</span>
            <span className="font-bold text-slate-800 dark:text-slate-200">
              {maxDailyJobs >= 999 ? (
                <span className="text-amber-600 dark:text-amber-400 font-extrabold flex items-center gap-1">
                  <Crown className="h-3.5 w-3.5" /> Không giới hạn
                </span>
              ) : (
                `${stats?.activeJobs ?? 0}/6 tin`
              )}
            </span>
          </div>
        </motion.div>

        {/* Metric 2: Total Applications */}
        <motion.div
          whileHover={{ y: -2 }}
          className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t('employer.dashboardTab.statTotalApps')}
            </span>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <Users className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 dark:text-white">
              {stats?.totalApplications ?? 0}
            </span>
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
              {stats?.pendingApplications ?? 0} {t('employer.dashboardTab.statTotalAppsSub')}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{t('employer.dashboardTab.statusReviewing')}:</span>
            <span className="font-bold text-slate-800 dark:text-slate-200">
              {stats?.reviewingApplications ?? 0} {t('employer.dashboardTab.statApprovedSub')}
            </span>
          </div>
        </motion.div>

        {/* Metric 3: Approved & Hired */}
        <motion.div
          whileHover={{ y: -2 }}
          className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t('employer.dashboardTab.statApproved')}
            </span>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400">
              <CheckCircle2 className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 dark:text-white">
              {stats?.approvedApplications ?? 0}
            </span>
            <span className="text-xs font-semibold text-slate-500">
              {t('employer.dashboardTab.statusApproved')}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{t('employer.dashboardTab.statusRejected')}:</span>
            <span className="font-bold text-rose-500">
              {stats?.rejectedApplications ?? 0}
            </span>
          </div>
        </motion.div>

        {/* Metric 4: Followers & Quota */}
        <motion.div
          whileHover={{ y: -2 }}
          className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t('employer.dashboardTab.statFollowers')}
            </span>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
              <TrendingUp className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 dark:text-white">
              {stats?.followersCount ?? 0}
            </span>
            <span className="text-xs font-semibold text-primary">
              {t('employer.dashboardTab.statFollowersSub')}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Giới hạn tin:</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">
              {maxDailyJobs >= 999 ? 'Không giới hạn' : 'Tối đa 6 tin cùng lúc'}
            </span>
          </div>
        </motion.div>
      </div>

      {/* 4. Interactive 7-Day Application Trend Chart & Quick Recruitment Actions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left 2 Cols: 7-Day Trend Chart */}
        <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800/80 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <TrendingUp className="h-3.5 w-3.5" />
                </span>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  {t('employer.dashboardTab.chartTitle')}
                </h3>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {t('employer.dashboardTab.chartSubtitle')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-primary dark:bg-blue-950/60 dark:text-primary-light">
                <span className="h-2 w-2 rounded-full bg-primary" />
                {t('employer.dashboardTab.chartTooltip')}
              </span>
            </div>
          </div>

          {/* SVG Interactive Bar Chart */}
          <div className="pt-6">
            <div className="h-56 w-full flex items-end justify-between gap-2 sm:gap-4 px-2">
              {dailyStats.map((day, idx) => {
                const heightPercent = Math.max(
                  8,
                  Math.round((day.count / maxDailyCount) * 100),
                );
                const isHovered = hoveredDayIndex === idx;

                return (
                  <div
                    key={day.date}
                    className="relative flex flex-1 flex-col items-center h-full justify-end group cursor-pointer"
                    onMouseEnter={() => setHoveredDayIndex(idx)}
                    onMouseLeave={() => setHoveredDayIndex(null)}
                  >
                    {/* Tooltip */}
                    <div
                      className={`absolute -top-10 z-20 rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-bold text-white shadow-lg transition-all dark:bg-white dark:text-slate-900 pointer-events-none whitespace-nowrap ${
                        isHovered ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
                      }`}
                    >
                      {day.count} {t('employer.dashboardTab.chartTooltip')} ({day.label})
                    </div>

                    {/* Bar Pill */}
                    <div className="w-full max-w-[42px] flex flex-col justify-end h-full">
                      <div
                        style={{ height: `${heightPercent}%` }}
                        className={`w-full rounded-t-xl transition-all duration-300 ${
                          isHovered
                            ? 'bg-gradient-to-t from-primary-dark to-accent shadow-md shadow-primary/30'
                            : 'bg-gradient-to-t from-primary to-blue-400/90 dark:from-primary-dark dark:to-primary'
                        }`}
                      />
                    </div>

                    {/* X-axis date label */}
                    <span className="mt-3 text-[11px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {day.label}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-400 dark:border-slate-800">
              <span>{t('employer.dashboardTab.chartSubtitle')}</span>
              <button
                onClick={() => onNavigateTab('candidates')}
                className="font-bold text-primary hover:underline cursor-pointer"
              >
                {t('employer.dashboardTab.viewAllBtn')} &rarr;
              </button>
            </div>
          </div>
        </div>

        {/* Right 1 Col: Quick Recruitment Actions & Quota Meter */}
        <div className="space-y-4">
          {/* Quick Actions Card */}
          <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">
              {t('employer.header.adminSection')}
            </h3>
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={onOpenCreateJob}
                className="w-full flex items-center justify-between rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-md shadow-primary/20 transition hover:bg-primary-dark active:scale-95 cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <PlusCircle className="h-4.5 w-4.5" />
                  <span>{t('employer.jobsTab.postJobBtn')}</span>
                </div>
                <ArrowUpRight className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('search-cv')}
                className="w-full flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-primary hover:bg-primary/5 hover:text-primary dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:border-primary-light cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <Search className="h-4.5 w-4.5 text-slate-400" />
                  <span>{t('employer.searchCvTab.title')}</span>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('company')}
                className="w-full flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-primary hover:bg-primary/5 hover:text-primary dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:border-primary-light cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <Building2 className="h-4.5 w-4.5 text-slate-400" />
                  <span>{t('employer.companyTab.title')}</span>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>
            </div>
          </div>

          {/* Company Status Mini Widget */}
          <div className="rounded-3xl border border-slate-200/90 bg-gradient-to-br from-slate-900 to-slate-950 p-5 text-white shadow-lg shadow-slate-950/20">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-primary-light">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <h4 className="text-sm font-extrabold truncate">
                  {company?.name || t('employer.sidebar.noCompany')}
                </h4>
                <p className="text-xs text-slate-400">
                  {isProfileComplete ? t('employer.sidebar.verifiedBadge') : t('employer.sidebar.needUpdate')}
                </p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800 text-xs flex justify-between text-slate-300">
              <span>Tin đang hoạt động:</span>
              <span className="font-bold text-emerald-400">
                {maxDailyJobs >= 999 ? 'Không giới hạn' : `${stats?.activeJobs ?? 0}/6 tin`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Top Jobs & Recent Applications Feed */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: Top Jobs by Application Count */}
        <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-4 mb-4">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
                <Briefcase className="h-3.5 w-3.5" />
              </span>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {t('employer.dashboardTab.topJobsTitle')}
              </h3>
            </div>
            <button
              onClick={() => onNavigateTab('jobs')}
              className="text-xs font-bold text-primary hover:underline cursor-pointer"
            >
              {t('employer.jobsTab.filterAll')} &rarr;
            </button>
          </div>

          {stats?.topJobs && stats.topJobs.length > 0 ? (
            <div className="space-y-3">
              {stats.topJobs.map((job, index) => (
                <div
                  key={job._id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-3.5 transition hover:border-primary/40 hover:bg-primary/5 dark:border-slate-800 dark:bg-slate-800/40"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-black shrink-0 ${
                        index === 0
                          ? 'bg-amber-500 text-white shadow-xs'
                          : index === 1
                          ? 'bg-slate-300 text-slate-800'
                          : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                      }`}
                    >
                      #{index + 1}
                    </span>
                    <div className="min-w-0">
                      <h4 className="truncate text-sm font-bold text-slate-900 dark:text-white">
                        {job.name}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {job.salary ? `${job.salary.toLocaleString('vi-VN')} VND` : 'Thương lượng'} &bull; {job.level}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-extrabold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                      <Users className="h-3 w-3" />
                      {job.applicationsCount} {t('employer.dashboardTab.applicantsCount')}
                    </span>
                    <button
                      type="button"
                      onClick={() => onNavigateTab('candidates', { filterJobId: job._id })}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200 cursor-pointer"
                      title={t('employer.dashboardTab.viewApplicantsBtn')}
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400">
              <Briefcase className="mx-auto h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">{t('employer.dashboardTab.noTopJobs')}</p>
              <button
                type="button"
                onClick={onOpenCreateJob}
                className="mt-3 text-xs font-bold text-primary hover:underline cursor-pointer"
              >
                {t('employer.jobsTab.postJobBtn')}
              </button>
            </div>
          )}
        </div>

        {/* Right: Recent Candidate Applications Stream */}
        <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-4 mb-4">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                <Users className="h-3.5 w-3.5" />
              </span>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {t('employer.dashboardTab.recentAppsTitle')}
              </h3>
            </div>
            <button
              onClick={() => onNavigateTab('candidates')}
              className="text-xs font-bold text-primary hover:underline cursor-pointer"
            >
              {t('employer.dashboardTab.viewAllBtn')} &rarr;
            </button>
          </div>

          {stats?.recentApplications && stats.recentApplications.length > 0 ? (
            <div className="space-y-3">
              {stats.recentApplications.map((app) => (
                <div
                  key={app._id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-3.5 transition hover:border-primary/40 hover:bg-primary/5 dark:border-slate-800 dark:bg-slate-800/40"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden border border-primary/20">
                      {app.user?.avatar ? (
                        <img src={app.user.avatar} alt={app.user.name} className="h-full w-full object-cover" />
                      ) : (
                        (app.user?.name?.[0] || 'U').toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="truncate text-sm font-bold text-slate-900 dark:text-white">
                        {app.user?.name || 'Candidate'}
                      </h4>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {app.job?.name}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        app.status === 'APPROVED'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : app.status === 'CONSIDERING'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                          : app.status === 'REVIEWING'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                          : app.status === 'REJECTED'
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {app.status === 'APPROVED'
                        ? t('employer.dashboardTab.statusApproved')
                        : app.status === 'CONSIDERING'
                        ? t('employer.dashboardTab.statusConsidering')
                        : app.status === 'REVIEWING'
                        ? t('employer.dashboardTab.statusReviewing')
                        : app.status === 'REJECTED'
                        ? t('employer.dashboardTab.statusRejected')
                        : t('employer.dashboardTab.statusPending')}
                    </span>
                    <button
                      type="button"
                      onClick={() => onNavigateTab('candidates', { selectedApplicationId: app._id })}
                      className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary hover:bg-primary hover:text-white transition cursor-pointer"
                    >
                      <span>{t('employer.dashboardTab.viewCvBtn')}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400">
              <Users className="mx-auto h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">{t('employer.dashboardTab.noRecentApps')}</p>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
