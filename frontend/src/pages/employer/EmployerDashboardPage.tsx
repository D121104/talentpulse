import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams, useLocation, useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Briefcase,
  Users,
  Search,
  Building2,
  Bell,
  LogOut,
  Moon,
  Sun,
  Menu,
  X,
  Sparkles,
  ChevronRight,
  Loader2,
  Crown,
  Receipt,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { LanguageSwitcher } from '../../components/common/LanguageSwitcher';
import { useToast } from '../../context/ToastContext';
import {
  employerApi,
  type HrDashboardStats,
  type HrJobItem,
} from '../../lib/employerApi';

import { DashboardOverviewTab } from './tabs/DashboardOverviewTab';
import { CompanyProfileTab } from './tabs/CompanyProfileTab';
import { JobManagementTab } from './tabs/JobManagementTab';
import { CandidateManagementTab } from './tabs/CandidateManagementTab';
import { CVSearchTab } from './tabs/CVSearchTab';
import { HrAccountTab } from './tabs/HrAccountTab';
import { NotificationsTab } from './tabs/NotificationsTab';
import { HrPremiumTab } from './tabs/HrPremiumTab';
import { HrPaymentHistoryTab } from './tabs/HrPaymentHistoryTab';
import { JobEditorView, type JobFormData } from './components/JobEditorView';

export type EmployerTabType =
  | 'dashboard'
  | 'jobs'
  | 'candidates'
  | 'search-cv'
  | 'company'
  | 'account'
  | 'notifications'
  | 'premium'
  | 'payments';

export default function EmployerDashboardPage() {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const { user, accessToken, logout } = useAuth();
  const { info, success, error } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { id: routeJobId } = useParams<{ id?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  // Detect if current URL is a dedicated Job Editor route (/hr/jobs/create or /hr/jobs/edit/:id)
  const isCreateJobRoute =
    location.pathname.startsWith('/hr/jobs/create') ||
    location.pathname.startsWith('/employer/jobs/create');

  const isEditJobRoute =
    Boolean(routeJobId) ||
    location.pathname.includes('/jobs/edit/') ||
    location.pathname.includes('/hr/jobs/edit/');

  const isJobEditorRoute = isCreateJobRoute || isEditJobRoute;

  const isHrPremiumRoute =
    location.pathname.startsWith('/hr/premium') ||
    location.pathname.startsWith('/employer/premium');

  const [activeTab, setActiveTab] = useState<EmployerTabType>(
    isJobEditorRoute
      ? 'jobs'
      : isHrPremiumRoute
      ? 'premium'
      : (searchParams.get('tab') as EmployerTabType) || 'dashboard',
  );

  const [statsData, setStatsData] = useState<HrDashboardStats | null>(null);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState<number>(0);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Editing Job state for dedicated route
  const [editingJob, setEditingJob] = useState<HrJobItem | null>(null);
  const [isLoadingJobDetail, setIsLoadingJobDetail] = useState(false);
  const [isSubmittingJob, setIsSubmittingJob] = useState(false);

  // Extra sub-routing state for candidate filters
  const [tabExtraData, setTabExtraData] = useState<{
    filterJobId?: string | null;
    openAiRank?: boolean;
    selectedApplicationId?: string | null;
  }>({});

  // Sync active tab when URL changes
  useEffect(() => {
    if (isJobEditorRoute) {
      setActiveTab('jobs');
    } else if (isHrPremiumRoute) {
      setActiveTab('premium');
    } else {
      const tabFromQuery = (searchParams.get('tab') as EmployerTabType) || 'dashboard';
      setActiveTab(tabFromQuery);
    }
  }, [location.pathname, searchParams, isJobEditorRoute, isHrPremiumRoute]);

  // Fetch job detail if on edit route
  useEffect(() => {
    if (isEditJobRoute && routeJobId && accessToken) {
      setIsLoadingJobDetail(true);
      employerApi
        .getJobById(routeJobId, accessToken)
        .then((job) => {
          setEditingJob(job);
        })
        .catch((err) => {
          console.error('Failed to load job detail for editing', err);
          error('Không tìm thấy tin tuyển dụng hoặc không thể tải dữ liệu');
          navigate('/dashboard?tab=jobs');
        })
        .finally(() => {
          setIsLoadingJobDetail(false);
        });
    } else if (isCreateJobRoute) {
      setEditingJob(null);
    }
  }, [isEditJobRoute, isCreateJobRoute, routeJobId, accessToken, navigate, error]);

  const fetchUnreadNotifications = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await employerApi.getUnreadNotificationsCount(accessToken);
      const count =
        typeof res === 'number'
          ? res
          : typeof (res as any)?.count === 'number'
            ? (res as any).count
            : Number(res) || 0;
      setUnreadNotificationsCount(count);
    } catch (err) {
      console.error('Failed to load unread notifications count', err);
    }
  }, [accessToken]);

  const fetchDashboardData = useCallback(async () => {
    if (!accessToken) return;
    try {
      const data = await employerApi.getDashboardStats(accessToken);
      setStatsData(data);
    } catch (err) {
      console.error('Failed to load HR dashboard stats', err);
    } finally {
      setIsLoadingStats(false);
    }
  }, [accessToken]);

  const refreshAll = useCallback(async () => {
    await Promise.allSettled([fetchDashboardData(), fetchUnreadNotifications()]);
  }, [fetchDashboardData, fetchUnreadNotifications]);

  useEffect(() => {
    void refreshAll();
    const interval = setInterval(() => {
      void fetchUnreadNotifications();
    }, 25000);
    return () => clearInterval(interval);
  }, [refreshAll, fetchUnreadNotifications]);

  const handleNavigateTab = (tab: string, extraData?: any) => {
    if (isJobEditorRoute) {
      navigate(`/dashboard?tab=${tab}`);
    } else {
      setActiveTab(tab as EmployerTabType);
      setSearchParams({ tab });
    }
    if (extraData) {
      setTabExtraData(extraData);
    } else {
      setTabExtraData({});
    }
    setIsMobileSidebarOpen(false);
    if (tab === 'notifications') {
      void fetchUnreadNotifications();
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  const handleOpenCreateJob = () => {
    if (!statsData?.hasCompany || !statsData?.isProfileComplete) {
      info(t('employer.dashboardTab.onboardingTitle', 'Vui lòng hoàn tất hồ sơ doanh nghiệp trước khi đăng tin'));
      handleNavigateTab('company');
      return;
    }
    if (
      statsData?.stats &&
      statsData.stats.todayJobsPostedCount >= statsData.stats.maxDailyJobs
    ) {
      info(
        `${t('employer.jobsTab.todayQuotaUsed')} ${statsData.stats.maxDailyJobs}/${statsData.stats.maxDailyJobs} ${t('employer.sidebar.freeTierDailyJobs')}`,
      );
      return;
    }
    navigate('/hr/jobs/create');
  };

  const handleSaveJobFromRoute = async (formData: JobFormData) => {
    if (!accessToken || !statsData?.company) return;

    if (!formData.name.trim()) {
      info(t('employer.jobsTab.jobNameLabel', 'Vui lòng nhập tiêu đề việc làm'));
      return;
    }

    if (formData.skills.length === 0) {
      info(t('employer.jobsTab.skillsLabel', 'Vui lòng thêm ít nhất 1 kỹ năng yêu cầu'));
      return;
    }

    if (!formData.description.trim() || formData.description === '<p></p>') {
      info(t('employer.jobsTab.descLabel', 'Vui lòng nhập mô tả công việc & yêu cầu'));
      return;
    }

    setIsSubmittingJob(true);
    try {
      if (isEditJobRoute && routeJobId) {
        await employerApi.updateJob(
          routeJobId,
          {
            name: formData.name,
            skills: formData.skills,
            salary: Number(formData.salary),
            quantity: Number(formData.quantity),
            level: formData.level,
            description: formData.description,
            location: formData.location,
            startDate: new Date(formData.startDate).toISOString(),
            endDate: new Date(formData.endDate).toISOString(),
            isActive: formData.isActive,
          },
          accessToken,
        );
        success(t('employer.jobsTab.submitEditBtn', 'Cập nhật tin tuyển dụng thành công!'));
      } else {
        await employerApi.createJob(
          {
            name: formData.name,
            skills: formData.skills,
            company: {
              _id: statsData.company._id,
              name: statsData.company.name,
              logo: statsData.company.logo,
            },
            salary: Number(formData.salary),
            quantity: Number(formData.quantity),
            level: formData.level,
            description: formData.description,
            location: formData.location,
            startDate: new Date(formData.startDate).toISOString(),
            endDate: new Date(formData.endDate).toISOString(),
            isActive: formData.isActive,
          },
          accessToken,
        );
        success(t('employer.jobsTab.submitCreateBtn', 'Đăng tin tuyển dụng thành công!'));
      }

      await refreshAll();
      navigate('/dashboard?tab=jobs');
    } catch (err: any) {
      console.error('Failed to save job', err);
      error(err?.response?.data?.message || 'Không thể lưu tin tuyển dụng');
    } finally {
      setIsSubmittingJob(false);
    }
  };

  const navItems = [
    {
      id: 'dashboard',
      label: t('employer.sidebar.menuDashboard', 'Dashboard Thống kê'),
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'jobs',
      label: t('employer.sidebar.menuJobs', 'Chiến dịch tuyển dụng'),
      icon: Briefcase,
      badge: statsData?.stats?.activeJobs ? `${statsData.stats.activeJobs}` : null,
    },
    {
      id: 'candidates',
      label: t('employer.sidebar.menuCandidates', 'Quản lý CV & Ứng viên'),
      icon: Users,
      badge: statsData?.stats?.pendingApplications ? `${statsData.stats.pendingApplications}` : null,
    },
    {
      id: 'search-cv',
      label: t('employer.sidebar.menuSearchCv', 'Tìm kiếm CV'),
      icon: Search,
      badge: null,
    },
    {
      id: 'company',
      label: t('employer.sidebar.menuCompany', 'Thông tin công ty'),
      icon: Building2,
      badge: !statsData?.isProfileComplete ? t('employer.sidebar.needUpdate', 'Cần cập nhật') : null,
      badgeColor: !statsData?.isProfileComplete ? 'bg-amber-500 text-white' : undefined,
    },
    {
      id: 'premium',
      label: 'Gói HR Premium',
      icon: Crown,
      badge: statsData?.isPremium ? 'PREMIUM' : 'Nâng cấp',
      badgeColor: statsData?.isPremium
        ? 'bg-amber-400 text-slate-950 font-black'
        : 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light',
    },
    {
      id: 'payments',
      label: 'Lịch sử thanh toán',
      icon: Receipt,
      badge: null,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100 transition-colors duration-200">
      <div className="flex min-h-screen">
        {/* ========================================================================= */}
        {/* 1. DESKTOP SIDEBAR                                                        */}
        {/* ========================================================================= */}
        <aside className="hidden lg:flex w-72 flex-col border-r border-slate-200/90 bg-white dark:border-slate-800 dark:bg-slate-900 z-20 shrink-0 select-none shadow-xs">
          {/* Logo Branding */}
          <div className="flex h-20 items-center justify-between px-6 border-b border-slate-100 dark:border-slate-800">
            <Link to="/dashboard?tab=dashboard" className="flex items-center gap-2.5">
              <img src="/logo-lightmode.svg" alt="TalentPulse" className="h-9 w-auto block dark:hidden" />
              <img src="/logo-darkmode.svg" alt="TalentPulse" className="h-9 w-auto hidden dark:block" />
            </Link>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-primary dark:bg-primary/20 dark:text-primary-light">
              HR Suite
            </span>
          </div>

          {/* User Profile Overview */}
          <div className="p-4 border-b border-slate-100 dark:border-slate-800">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 p-4 border border-slate-200/80 dark:from-slate-800/80 dark:to-slate-800/40 dark:border-slate-700/60 shadow-2xs">
              <div className="flex items-center gap-3">
                <div className="relative h-12 w-12 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-base shrink-0 border border-primary/20 overflow-hidden">
                  {user?.avatar ? (
                    <img src={user.avatar} alt={user.name} className="h-full w-full object-cover" />
                  ) : (
                    (user?.name?.[0] || 'H').toUpperCase()
                  )}
                  <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h4 className="truncate text-sm font-extrabold text-slate-900 dark:text-white">
                      {user?.name || 'HR Manager'}
                    </h4>
                  </div>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {user?.email}
                  </p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="rounded-md bg-primary/15 px-1.5 py-0.2 text-[10px] font-bold text-primary dark:text-primary-light">
                      {t('employer.sidebar.verifiedBadge', 'HR Verified')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
            <div className="px-3 pb-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {t('employer.sidebar.mainMenu', 'Quản lý tuyển dụng')}
            </div>

            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavigateTab(item.id)}
                  className={`group relative flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-bold transition-all duration-200 cursor-pointer ${
                    isActive
                      ? 'bg-primary text-white shadow-md shadow-primary/25'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      className={`h-4.5 w-4.5 transition-transform duration-200 group-hover:scale-110 ${
                        isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-700 dark:text-slate-500 dark:group-hover:text-slate-200'
                      }`}
                    />
                    <span>{item.label}</span>
                  </div>

                  {item.badge && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                        item.badgeColor
                          ? item.badgeColor
                          : isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Logout & Footer */}
          <div className="p-3 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={() => void handleLogout()}
              className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 cursor-pointer"
            >
              <LogOut className="h-4.5 w-4.5" />
              <span>{t('employer.sidebar.logout', 'Đăng xuất')}</span>
            </button>
          </div>
        </aside>

        {/* ========================================================================= */}
        {/* 2. MOBILE SIDEBAR DRAWER                                                  */}
        {/* ========================================================================= */}
        <AnimatePresence>
          {isMobileSidebarOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsMobileSidebarOpen(false)}
                className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-xs lg:hidden"
              />
              <motion.aside
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-white dark:bg-slate-900 shadow-2xl lg:hidden"
              >
                <div className="flex h-20 items-center justify-between px-6 border-b border-slate-100 dark:border-slate-800">
                  <Link to="/dashboard?tab=dashboard" className="flex items-center gap-2">
                    <img src="/logo-lightmode.svg" alt="TalentPulse" className="h-8 w-auto block dark:hidden" />
                    <img src="/logo-darkmode.svg" alt="TalentPulse" className="h-8 w-auto hidden dark:block" />
                  </Link>
                  <button
                    onClick={() => setIsMobileSidebarOpen(false)}
                    className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleNavigateTab(item.id)}
                        className={`flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-bold transition cursor-pointer ${
                          isActive
                            ? 'bg-primary text-white'
                            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className="h-4.5 w-4.5" />
                          <span>{item.label}</span>
                        </div>
                        {item.badge && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                              item.badgeColor || (isActive ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary')
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="p-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => void handleLogout()}
                    className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                  >
                    <LogOut className="h-4.5 w-4.5" />
                    <span>{t('employer.sidebar.logout', 'Đăng xuất')}</span>
                  </button>
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* ========================================================================= */}
        {/* 3. MAIN CONTENT CONTAINER WITH TOPBAR                                     */}
        {/* ========================================================================= */}
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          {/* Top Bar Header */}
          <header className="sticky top-0 z-30 flex h-20 items-center justify-between border-b border-slate-200/90 bg-white/80 px-4 sm:px-8 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/80">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsMobileSidebarOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 lg:hidden cursor-pointer shadow-xs"
              >
                <Menu className="h-5 w-5" />
              </button>

              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                <span className="hidden sm:inline">Portal Nhà Tuyển Dụng</span>
                <ChevronRight className="h-3.5 w-3.5 hidden sm:inline" />
                <span className="font-bold text-slate-900 dark:text-white capitalize">
                  {isJobEditorRoute
                    ? (isEditJobRoute ? 'Chỉnh sửa tin tuyển dụng' : 'Đăng tin tuyển dụng mới')
                    : navItems.find((n) => n.id === activeTab)?.label || 'Dashboard'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              {/* Post Job Quick CTA */}
              {!isJobEditorRoute && (
                <button
                  type="button"
                  onClick={handleOpenCreateJob}
                  className="hidden md:inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-md shadow-primary/20 hover:bg-primary-dark transition active:scale-95 cursor-pointer"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>{t('employer.jobsTab.postJobBtn', 'Đăng tin mới')}</span>
                </button>
              )}

              {/* Notifications Icon Button */}
              <button
                type="button"
                onClick={() => handleNavigateTab('notifications')}
                className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/80 bg-white/80 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700/80 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-white backdrop-blur-md transition-colors duration-200 cursor-pointer shadow-xs"
                title={t('employer.sidebar.menuNotifications', 'Thông báo')}
              >
                <Bell className="h-4 w-4" />
                {unreadNotificationsCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-rose-500 text-[9px] font-black text-white ring-2 ring-white dark:ring-slate-900 shadow-sm animate-in fade-in zoom-in-75">
                    {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
                  </span>
                )}
              </button>

              {/* Language Switcher */}
              <LanguageSwitcher variant="dropdown" />

              {/* Dark / Light Theme Toggle */}
              <button
                type="button"
                onClick={toggleTheme}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/80 bg-white/80 text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700/80 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-700/60 dark:hover:text-white backdrop-blur-md transition-colors duration-200 cursor-pointer shadow-xs"
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            </div>
          </header>

          {/* Body Content */}
          <main className="flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto">
            {/* --------------------------------------------------------------- */}
            {/* A. DEDICATED JOB EDITOR VIEW (/hr/jobs/create & /hr/jobs/edit/:id) */}
            {/* --------------------------------------------------------------- */}
            {isJobEditorRoute ? (
              isLoadingJobDetail ? (
                <div className="py-24 text-center">
                  <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
                  <p className="mt-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Đang tải chi tiết tin tuyển dụng...
                  </p>
                </div>
              ) : (
                <JobEditorView
                  company={statsData?.company ?? null}
                  editingJob={editingJob}
                  isSubmitting={isSubmittingJob}
                  onSave={handleSaveJobFromRoute}
                  onCancel={() => navigate('/dashboard?tab=jobs')}
                />
              )
            ) : (
              /* --------------------------------------------------------------- */
              /* B. REGULAR EMPLOYER DASHBOARD TABS                              */
              /* --------------------------------------------------------------- */
              <>
                {activeTab === 'dashboard' && (
                  <DashboardOverviewTab
                    data={statsData}
                    isLoading={isLoadingStats}
                    onNavigateTab={handleNavigateTab}
                    onOpenCreateJob={handleOpenCreateJob}
                  />
                )}

                {activeTab === 'company' && (
                  <CompanyProfileTab
                    company={statsData?.company ?? null}
                    hasCompany={statsData?.hasCompany ?? false}
                    accessToken={accessToken}
                    onRefreshData={refreshAll}
                  />
                )}

                {activeTab === 'jobs' && (
                  <JobManagementTab
                    company={statsData?.company ?? null}
                    hasCompany={statsData?.hasCompany ?? false}
                    isProfileComplete={statsData?.isProfileComplete ?? false}
                    accessToken={accessToken}
                    todayPostedCount={statsData?.stats?.todayJobsPostedCount ?? 0}
                    maxDailyJobs={statsData?.stats?.maxDailyJobs ?? 5}
                    onNavigateTab={handleNavigateTab}
                    onRefreshStats={refreshAll}
                  />
                )}

                {activeTab === 'candidates' && (
                  <CandidateManagementTab
                    company={statsData?.company ?? null}
                    hasCompany={statsData?.hasCompany ?? false}
                    accessToken={accessToken}
                    filterJobId={tabExtraData.filterJobId}
                    openAiRank={tabExtraData.openAiRank}
                    selectedApplicationId={tabExtraData.selectedApplicationId}
                    onNavigateTab={handleNavigateTab}
                    onRefreshStats={refreshAll}
                  />
                )}

                {activeTab === 'search-cv' && (
                  <CVSearchTab
                    accessToken={accessToken}
                    hasCompany={statsData?.hasCompany ?? false}
                    onNavigateTab={handleNavigateTab}
                  />
                )}

                {activeTab === 'account' && (
                  <HrAccountTab
                    accessToken={accessToken}
                    onRefreshUser={refreshAll}
                  />
                )}

                {activeTab === 'notifications' && (
                  <NotificationsTab
                    accessToken={accessToken}
                    onRefreshStats={refreshAll}
                  />
                )}

                {activeTab === 'premium' && (
                  <HrPremiumTab
                    statsData={statsData}
                    accessToken={accessToken}
                    onRefreshStats={refreshAll}
                  />
                )}

                {activeTab === 'payments' && (
                  <HrPaymentHistoryTab />
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
