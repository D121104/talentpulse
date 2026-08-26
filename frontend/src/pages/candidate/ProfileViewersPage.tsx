import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Eye,
  Crown,
  Sparkles,
  MapPin,
  Clock,
  FileText,
  ChevronDown,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Info,
  Loader2,
  Layers,
} from 'lucide-react';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  employerApi,
  type CandidateEmployerViewItem,
} from '../../lib/employerApi';
import { formatTimeAgo } from '../../lib/dateUtils';
import { UserAvatar } from '../../components/common/UserAvatar';

function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${
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

export function ProfileViewersPage() {
  const { user, accessToken } = useAuth();
  const { success, error } = useToast();

  const [views, setViews] = useState<CandidateEmployerViewItem[]>([]);
  const [stats, setStats] = useState({
    viewsThisWeek: 0,
    viewsThisMonth: 0,
    totalViews: 0,
    searchableCvCount: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Settings states
  const [isJobSeeking, setIsJobSeeking] = useState(user?.isJobSeeking ?? true);
  const [isJobRecommendation, setIsJobRecommendation] = useState(
    user?.isJobRecommendation ?? true,
  );
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isInfoExpanded, setIsInfoExpanded] = useState(false);

  // Fetch employer views
  const fetchViews = async (pageNum = 1) => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const res = await employerApi.getCandidateEmployerViews(
        { current: pageNum, pageSize: 10 },
        accessToken,
      );
      setViews(res.result || []);
      setStats(
        res.stats || {
          viewsThisWeek: 0,
          viewsThisMonth: 0,
          totalViews: 0,
          searchableCvCount: 0,
        },
      );
      setTotalPages(res.meta?.pages || 1);
      setTotalCount(res.meta?.total || 0);
      setPage(pageNum);
    } catch (err: any) {
      console.error('Failed to load profile views', err);
      error(err?.message || 'Không thể tải danh sách nhà tuyển dụng đã xem CV');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchViews(1);
  }, [accessToken]);

  // Handle toggles
  const handleToggleJobSeeking = async (newValue: boolean) => {
    if (!accessToken) return;
    setIsJobSeeking(newValue);
    setIsSavingSettings(true);
    try {
      await employerApi.updateCandidateJobSettings(
        { isJobSeeking: newValue },
        accessToken,
      );
      success(
        newValue
          ? 'Đã bật trạng thái tìm việc. Nhà tuyển dụng có thể tiếp cận hồ sơ của bạn.'
          : 'Đã tắt trạng thái tìm việc.',
      );
    } catch (err: any) {
      setIsJobSeeking(!newValue);
      error(err?.message || 'Không thể cập nhật cài đặt');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleToggleRecommendation = async (newValue: boolean) => {
    if (!accessToken) return;
    setIsJobRecommendation(newValue);
    setIsSavingSettings(true);
    try {
      await employerApi.updateCandidateJobSettings(
        { isJobRecommendation: newValue },
        accessToken,
      );
      success(
        newValue
          ? 'Đã bật gợi ý việc làm phù hợp.'
          : 'Đã tắt gợi ý việc làm.',
      );
    } catch (err: any) {
      setIsJobRecommendation(!newValue);
      error(err?.message || 'Không thể cập nhật cài đặt');
    } finally {
      setIsSavingSettings(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/70 dark:bg-slate-950 flex flex-col text-slate-900 dark:text-slate-100 transition-colors">
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-24 sm:pt-28 pb-16">
        {/* Breadcrumb / Page Title */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1">
              <Link to="/" className="hover:text-primary transition-colors">
                Trang chủ
              </Link>
              <span>/</span>
              <Link to="/my-cv" className="hover:text-primary transition-colors">
                Quản lý CV
              </Link>
              <span>/</span>
              <span className="text-slate-900 dark:text-white font-semibold">
                Nhà tuyển dụng đã xem CV
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10 text-primary dark:bg-primary/20">
                <Eye className="h-5 w-5" />
              </span>
              Nhà tuyển dụng đã xem CV
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/my-cv"
              className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 transition active:scale-95 cursor-pointer"
            >
              <FileText className="h-4 w-4 text-primary" />
              <span>Quản lý hồ sơ CV</span>
            </Link>
          </div>
        </div>

        {/* Main Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          {/* Left Column (8 cols): Hero Counter Card + Viewers List */}
          <div className="lg:col-span-8 space-y-6">
            {/* 1. Hero Counter Card */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-blue-50/60 to-indigo-50/40 p-6 sm:p-8 shadow-sm dark:border-primary/30 dark:bg-gradient-to-br dark:from-primary/20 dark:via-slate-900/90 dark:to-slate-900"
            >
              {/* Background ambient lighting */}
              <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-primary/20 blur-3xl dark:bg-primary/25" />
              <div className="pointer-events-none absolute -left-10 -bottom-10 h-48 w-48 rounded-full bg-indigo-500/15 blur-3xl dark:bg-indigo-500/20" />

              <div className="relative flex flex-col-reverse sm:flex-row items-center justify-between gap-6">
                <div className="space-y-3 sm:max-w-md text-center sm:text-left">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-black uppercase tracking-wider text-primary dark:text-primary-light">
                    <Sparkles className="h-3.5 w-3.5" /> Thống kê lượt quan tâm
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white leading-tight">
                    NTD đã xem CV của bạn trong tuần qua
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    Bạn có biết mỗi lượt Nhà tuyển dụng xem CV mang đến một cơ hội cho bạn gần hơn với công việc phù hợp? Cập nhật thường xuyên để được nhà tuyển dụng xem CV nhiều hơn.
                  </p>
                  <div className="pt-2 flex justify-center sm:justify-start">
                    <Link
                      to="/my-cv"
                      className="inline-flex items-center gap-2 rounded-2xl bg-primary hover:bg-primary-dark px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-primary/25 transition active:scale-95 cursor-pointer"
                    >
                      <FileText className="h-4 w-4" />
                      <span>Cập nhật CV ngay</span>
                    </Link>
                  </div>
                </div>

                {/* Big Circular Counter Badge in Primary Blue */}
                <div className="relative shrink-0 flex flex-col items-center">
                  <div className="flex h-28 w-28 sm:h-32 sm:w-32 flex-col items-center justify-center rounded-full bg-gradient-to-br from-primary via-blue-600 to-indigo-700 text-white shadow-xl shadow-primary/30 border-4 border-white dark:border-slate-800 ring-4 ring-primary/20">
                    <span className="text-3xl sm:text-4xl font-black tracking-tight">
                      {stats.viewsThisWeek}
                    </span>
                    <span className="text-xs sm:text-sm font-extrabold uppercase tracking-wider opacity-90">
                      lượt
                    </span>
                  </div>
                  <div className="mt-2 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    Tổng cộng: {stats.totalViews} lượt xem
                  </div>
                </div>
              </div>
            </motion.div>

            {/* 2. Section: Danh sách Nhà tuyển dụng xem CV */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Danh sách Nhà tuyển dụng xem CV</span>
                  {totalCount > 0 && (
                    <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary dark:bg-primary/20">
                      {totalCount}
                    </span>
                  )}
                </h3>
              </div>

              {isLoading ? (
                <div className="py-20 text-center rounded-3xl border border-slate-200/90 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-xs">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                    Đang tải danh sách nhà tuyển dụng đã xem hồ sơ...
                  </p>
                </div>
              ) : views.length > 0 ? (
                <div className="space-y-3">
                  {views.map((item) => (
                    <motion.div
                      key={item._id}
                      whileHover={{ y: -2 }}
                      className="group rounded-3xl border border-slate-200/90 bg-white p-4.5 sm:p-5 shadow-xs hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 transition duration-200"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        {/* Company Logo + Names */}
                        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                          <div className="h-13 w-13 shrink-0 rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800 flex items-center justify-center overflow-hidden p-1 shadow-xs">
                            {item.company.logo ? (
                              <img
                                src={item.company.logo}
                                alt={item.company.name}
                                className="h-full w-full object-contain"
                              />
                            ) : (
                              <div className="h-full w-full rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary flex items-center justify-center font-black text-lg">
                                {item.company.name ? item.company.name[0].toUpperCase() : 'C'}
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white group-hover:text-primary transition-colors">
                                {item.company.name}
                              </h4>
                              {item.hr?.roleTitle && (
                                <span className="inline-flex items-center rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                  {item.hr.name ? `${item.hr.name} • ${item.hr.roleTitle}` : item.hr.roleTitle}
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                              {item.company.address && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                  <span className="truncate max-w-xs">{item.company.address}</span>
                                </span>
                              )}
                              <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                                <FileText className="h-3 w-3" />
                                <span>{item.cv.title || 'Hồ sơ CV'}</span>
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Right side: Time ago badge */}
                        <div className="shrink-0 flex sm:flex-col items-center sm:items-end justify-between border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100 dark:border-slate-800 text-xs">
                          <span className="flex items-center gap-1 font-semibold text-slate-500 dark:text-slate-400">
                            <Clock className="h-3.5 w-3.5 text-slate-400" />
                            <span>{formatTimeAgo(item.accessedAt)}</span>
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  ))}

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 pt-4">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => fetchViews(p)}
                          className={`h-9 w-9 rounded-xl text-xs font-bold transition cursor-pointer ${
                            page === p
                              ? 'bg-primary text-white shadow-sm'
                              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* Empty state */
                <div className="rounded-3xl border border-slate-200/90 bg-white p-8 sm:p-12 text-center shadow-xs dark:border-slate-800 dark:bg-slate-900">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10 text-primary dark:bg-primary/20">
                    <Eye className="h-8 w-8" />
                  </div>
                  <h4 className="mt-4 text-base sm:text-lg font-black text-slate-900 dark:text-white">
                    Chưa có Nhà tuyển dụng nào xem CV của bạn
                  </h4>
                  <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                    Hãy đảm bảo rằng bạn đã bật tính năng <strong>Cho phép NTD tìm kiếm hồ sơ</strong> và cập nhật đầy đủ thông tin kỹ năng để tiếp cận nhiều cơ hội việc làm hơn!
                  </p>
                  <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                    <Link
                      to="/my-cv"
                      className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-primary/20 hover:bg-primary-dark transition active:scale-95 cursor-pointer"
                    >
                      <FileText className="h-4 w-4" />
                      <span>Bật cho phép NTD tìm kiếm</span>
                    </Link>
                    <Link
                      to="/cv-templates"
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-xs sm:text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 transition active:scale-95 cursor-pointer"
                    >
                      <Sparkles className="h-4 w-4 text-amber-500" />
                      <span>Tạo thêm mẫu CV mới</span>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column (4 cols): User Profile Summary + Job Seeking Status + Searchable CV Card */}
          <div className="lg:col-span-4 space-y-6">
            {/* 1. Candidate Profile Card */}
            <div className="rounded-3xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-5">
              <div className="flex items-center gap-3.5">
                <div className="relative">
                  <UserAvatar
                    src={user?.avatar}
                    alt={user?.name || 'Candidate'}
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
                  <div className="text-xs text-slate-400 dark:text-slate-500 font-medium">
                    Chào bạn trở lại,
                  </div>
                  <h3 className="truncate text-base sm:text-lg font-black text-slate-900 dark:text-white">
                    {user?.name || 'Ứng viên'}
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
                      <span>Tài khoản Candidate Premium VIP</span>
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
                    <span>Nâng cấp tài khoản Premium</span>
                  </Link>
                )}
              </div>

              {/* Toggles Section */}
              <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                {/* Toggle: Gợi ý việc làm */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
                      Gợi ý việc làm
                    </span>
                    <span
                      className="cursor-pointer text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                      title="Hệ thống sẽ gửi thông báo các công việc phù hợp với kỹ năng trên CV của bạn"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </span>
                  </div>
                  <ToggleSwitch
                    checked={isJobRecommendation}
                    onChange={handleToggleRecommendation}
                    disabled={isSavingSettings}
                  />
                </div>

                {/* Toggle: Trạng thái tìm việc */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
                      Trạng thái tìm việc {isJobSeeking ? 'đang bật' : 'đang tắt'}
                    </span>
                    <ToggleSwitch
                      checked={isJobSeeking}
                      onChange={handleToggleJobSeeking}
                      disabled={isSavingSettings}
                    />
                  </div>

                  <p className="text-[11.5px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Trạng thái <strong className="text-primary">{isJobSeeking ? 'Bật tìm việc' : 'Tắt tìm việc'}</strong> cho phép hệ thống giới thiệu hồ sơ của bạn đến các nhà tuyển dụng hàng đầu.
                  </p>

                  <div className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-primary" />
                      <span>{stats.searchableCvCount} CV đang được chọn</span>
                    </span>
                    <Link
                      to="/my-cv"
                      className="font-bold text-primary hover:underline"
                    >
                      Thay đổi
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Cho phép NTD tìm kiếm hồ sơ Card */}
            <div className="rounded-3xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <div>
                <h4 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                  Cho phép NTD tìm kiếm hồ sơ
                </h4>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Có <strong className="text-primary font-bold">{stats.searchableCvCount} CV</strong> đang bật cho phép NTD tìm kiếm
                </p>
              </div>

              <Link
                to="/my-cv"
                className="flex items-center justify-center gap-2 rounded-2xl border-2 border-primary/40 hover:border-primary bg-primary/5 hover:bg-primary/10 px-4 py-2.5 text-xs font-bold text-primary dark:text-primary-light transition active:scale-95 cursor-pointer w-full"
              >
                <Layers className="h-4 w-4" />
                <span>Quản lý danh sách CV</span>
              </Link>

              {/* Explanatory Callout */}
              <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 space-y-2 text-xs">
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  Khi bạn cho phép Nhà tuyển dụng (NTD) tìm kiếm hồ sơ, các NTD uy tín có thể tiếp cận thông tin kinh nghiệm làm việc, học vấn, kỹ năng... trên CV của bạn.
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
                      className="overflow-hidden space-y-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-[11.5px] text-slate-500 dark:text-slate-400"
                    >
                      <div className="flex items-start gap-1.5">
                        <span className="text-primary font-bold">•</span>
                        <span>Thông tin liên hệ như SĐT, Email chỉ hiển thị khi HR mở khóa hồ sơ hợp lệ.</span>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <span className="text-primary font-bold">•</span>
                        <span>Hồ sơ được cập nhật thường xuyên sẽ có thứ hạng ưu tiên cao hơn trên kết quả tìm kiếm.</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* 3. TalentPulse Smart Mobile App & Ecosystem Card */}
            <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-slate-900 to-indigo-950 p-5 text-white shadow-md">
              <div className="relative z-10 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-primary px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                    TalentPulse AI
                  </span>
                </div>
                <h4 className="text-sm sm:text-base font-black text-white">
                  Tăng 300% cơ hội việc làm
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Tối ưu hóa từ khóa chuyên môn trên CV giúp công nghệ AI tự động kết nối bạn với các doanh nghiệp đang tuyển dụng ngay lập tức!
                </p>
                <div className="pt-2">
                  <Link
                    to="/cv-templates"
                    className="inline-flex items-center gap-1.5 text-xs font-black text-primary-light hover:underline"
                  >
                    <span>Khám phá mẫu CV chuẩn AI</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
