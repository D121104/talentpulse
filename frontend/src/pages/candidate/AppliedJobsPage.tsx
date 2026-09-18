import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Flame,
  Layers,
  Loader2,
  MessageSquare,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Clock,
  ArrowRight,
  HelpCircle,
  Bot,
  Video,
  MinusCircle,
  X,
} from 'lucide-react';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../context/ToastContext';
import { apiRequest } from '../../lib/api';
import { UserAvatar } from '../../components/common/UserAvatar';
import { userCvApi, onlineCvApi } from '../../lib/cvApi';
import {
  employerApi,
  type InterviewRoundItem,
  type ApplicationStatusType,
} from '../../lib/employerApi';

export interface AppliedJobItem {
  _id: string;
  status: ApplicationStatusType;
  version?: number;
  withdrawnAt?: string;
  withdrawReason?: string;
  coverLetter?: string;
  createdAt: string;
  updatedAt?: string;
  matchScore?: number;
  history?: {
    status: string;
    updatedAt: string;
    updatedBy?: {
      _id: string;
      email: string;
    };
    reason?: string;
    note?: string;
  }[];
  cvId?: {
    _id: string;
    title?: string;
    url?: string;
    fileType?: string;
    onlineCvId?: string;
  };
  cv?: {
    _id: string;
    title?: string;
    url?: string;
    fileType?: string;
    onlineCvId?: string;
  };
  companyId?: {
    _id: string;
    name?: string;
    logo?: string;
  };
  company?: {
    _id: string;
    name?: string;
    logo?: string;
  };
  jobId?: {
    _id: string;
    name?: string;
    salary?: number;
    level?: string;
    location?: string;
  };
  job?: {
    _id: string;
    name?: string;
    salary?: number;
    level?: string;
    location?: string;
  };
}

// 8 Filter tabs
type StatusFilter =
  | 'ALL'
  | 'PENDING'
  | 'REVIEWING'
  | 'CONSIDERING'
  | 'INTERVIEWING'
  | 'SUITABLE'
  | 'APPROVED'
  | 'REJECTED'
  | 'WITHDRAWN';

interface TabConfig {
  id: StatusFilter;
  label: string;
}

const FILTER_TABS: TabConfig[] = [
  { id: 'ALL', label: 'Tất cả' },
  { id: 'PENDING', label: 'Chờ xử lý' },
  { id: 'REVIEWING', label: 'Đã xem' },
  { id: 'CONSIDERING', label: 'Cân nhắc' },
  { id: 'INTERVIEWING', label: 'Phỏng vấn' },
  { id: 'SUITABLE', label: 'Phù hợp' },
  { id: 'REJECTED', label: 'Chưa phù hợp' },
  { id: 'WITHDRAWN', label: 'Đã rút đơn' },
];

export default function AppliedJobsPage() {
  const { user, accessToken } = useAuth();
  const { success, error, info } = useToast();

  const [applications, setApplications] = useState<AppliedJobItem[]>([]);
  const [interviews, setInterviews] = useState<InterviewRoundItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<StatusFilter>('ALL');

  // Expanded accordions for detailed application history
  const [expandedAppIds, setExpandedAppIds] = useState<Record<string, boolean>>({});

  // Reminding state tracker for each application
  const [remindingIds, setRemindingIds] = useState<Record<string, boolean>>({});

  // Right sidebar candidate controls state
  const [suggestJobs, setSuggestJobs] = useState(true);
  const [jobSearchActive, setJobSearchActive] = useState(true);
  const [totalCvCount, setTotalCvCount] = useState<number>(1);

  // Modals state
  const [withdrawModalApp, setWithdrawModalApp] = useState<AppliedJobItem | null>(null);
  const [withdrawReason, setWithdrawReason] = useState('');
  const [isSubmittingWithdraw, setIsSubmittingWithdraw] = useState(false);

  const [declineModalRound, setDeclineModalRound] = useState<InterviewRoundItem | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [isSubmittingDecline, setIsSubmittingDecline] = useState(false);
  const [isConfirmingRoundId, setIsConfirmingRoundId] = useState<string | null>(null);

  // Load user applications, interviews, and CV counts
  useEffect(() => {
    if (!accessToken) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        // 1. Fetch applications
        const res = await apiRequest<AppliedJobItem[]>('/applications/my-applications', {
          accessToken,
        });
        const list = Array.isArray(res)
          ? res
          : Array.isArray((res as any)?.data)
          ? (res as any).data
          : [];
        setApplications(list);

        // 1b. Fetch candidate interviews
        try {
          const ivList = await employerApi.getInterviews({}, accessToken);
          setInterviews(Array.isArray(ivList) ? ivList : []);
        } catch {
          // Ignore secondary interview fetch errors
        }

        // 2. Fetch CVs count for candidate widget
        try {
          const [uCvs, oCvs] = await Promise.all([
            userCvApi.findAll(accessToken).catch(() => []),
            onlineCvApi.findAll(accessToken).catch(() => []),
          ]);
          const total = (Array.isArray(uCvs) ? uCvs.length : 0) + (Array.isArray(oCvs) ? oCvs.length : 0);
          setTotalCvCount(Math.max(1, total));
        } catch {
          // Ignore secondary fetch errors
        }
      } catch (err: any) {
        error('Không thể tải danh sách việc làm đã ứng tuyển', err?.message);
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [accessToken, error]);

  // Toggle detail accordion for an application
  const toggleAccordion = (id: string) => {
    setExpandedAppIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Handle Nudge / Remind Recruiter action
  const handleRemindHR = async (appId: string, companyName = 'Nhà tuyển dụng') => {
    if (!accessToken) return;
    try {
      setRemindingIds((prev) => ({ ...prev, [appId]: true }));
      await apiRequest(`/applications/${appId}/remind`, {
        method: 'POST',
        accessToken,
      });
      success(
        'Đã gửi lời nhắc thành công',
        `TalentPulse đã gửi thông báo nhắc nhở tới ${companyName}.`,
      );
    } catch (err: any) {
      info(
        'Đã ghi nhận yêu cầu nhắc nhở',
        err?.message || 'Lời nhắc của bạn đã được chuyển tới nhà tuyển dụng.',
      );
    } finally {
      setRemindingIds((prev) => ({ ...prev, [appId]: false }));
    }
  };

  // Candidate confirms interview
  const handleConfirmInterview = async (roundId: string) => {
    if (!accessToken) return;
    try {
      setIsConfirmingRoundId(roundId);
      await employerApi.confirmInterview(
        roundId,
        { action: 'CONFIRM' },
        accessToken,
      );
      setInterviews((prev) =>
        prev.map((iv) => (iv._id === roundId ? { ...iv, status: 'CONFIRMED' } : iv)),
      );
      success('Đã xác nhận tham gia phỏng vấn', 'Lịch phỏng vấn đã được kích hoạt thành công.');
    } catch (err: any) {
      error('Xác nhận thất bại', err?.message || 'Không thể xác nhận lịch phỏng vấn');
    } finally {
      setIsConfirmingRoundId(null);
    }
  };

  // Candidate declines interview
  const handleDeclineInterview = async () => {
    if (!accessToken || !declineModalRound) return;
    try {
      setIsSubmittingDecline(true);
      await employerApi.confirmInterview(
        declineModalRound._id,
        { action: 'DECLINE', feedback: declineReason.trim() || undefined },
        accessToken,
      );
      setInterviews((prev) =>
        prev.map((iv) =>
          iv._id === declineModalRound._id ? { ...iv, status: 'DECLINED' } : iv,
        ),
      );
      success('Đã gửi phản hồi', 'Bạn đã từ chối lịch phỏng vấn này.');
      setDeclineModalRound(null);
      setDeclineReason('');
    } catch (err: any) {
      error('Lỗi phản hồi', err?.message || 'Không thể từ chối lịch phỏng vấn');
    } finally {
      setIsSubmittingDecline(false);
    }
  };

  // Candidate withdraws application
  const handleWithdrawApplication = async () => {
    if (!accessToken || !withdrawModalApp) return;
    try {
      setIsSubmittingWithdraw(true);
      await employerApi.withdrawApplication(
        withdrawModalApp._id,
        accessToken,
        {
          reason: withdrawReason.trim() || undefined,
          expectedVersion: withdrawModalApp.version,
        },
      );
      setApplications((prev) =>
        prev.map((app) =>
          app._id === withdrawModalApp._id
            ? {
                ...app,
                status: 'WITHDRAWN',
                withdrawnAt: new Date().toISOString(),
                withdrawReason: withdrawReason.trim() || undefined,
                version: (app.version || 0) + 1,
              }
            : app,
        ),
      );
      success('Đã rút hồ sơ thành công', 'Bạn đã hủy hồ sơ ứng tuyển này.');
      setWithdrawModalApp(null);
      setWithdrawReason('');
    } catch (err: any) {
      error('Không thể rút hồ sơ', err?.message || 'Đã có lỗi xảy ra hoặc hồ sơ đã được xử lý');
    } finally {
      setIsSubmittingWithdraw(false);
    }
  };

  // Filtered applications list based on active tab
  const filteredApplications = useMemo(() => {
    if (activeTab === 'ALL') return applications;
    return applications.filter((app) => app.status === activeTab);
  }, [applications, activeTab]);

  // Helper to format date & time
  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  // Calculate days passed since application
  const getDaysSinceApplied = (dateStr?: string) => {
    if (!dateStr) return 0;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 0;
    const diff = Date.now() - d.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  // Helper to get step status index (1 to 5)
  // 1: UV nộp CV, 2: Tiếp nhận CV, 3: NTD xem CV, 4: Phỏng vấn, 5: Kết quả (Phù hợp / Từ chối)
  const getStepperActiveIndex = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 2;
      case 'REVIEWING':
        return 3;
      case 'CONSIDERING':
        return 3;
      case 'INTERVIEWING':
        return 4;
      case 'SUITABLE':
      case 'APPROVED':
      case 'REJECTED':
        return 5;
      case 'WITHDRAWN':
        return 1;
      default:
        return 2;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans text-slate-800 dark:text-slate-100 flex flex-col transition-colors duration-200">
      <Header />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 sm:pt-28 pb-12 sm:pb-16">
        {/* Breadcrumb Navigation */}
        <nav aria-label="Breadcrumb" className="mb-5 flex items-center gap-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          <Link to="/" className="hover:text-primary transition-colors">
            Trang chủ
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="font-semibold text-slate-900 dark:text-white">
            Việc làm đã ứng tuyển
          </span>
        </nav>

        {/* Main 2-Column Responsive Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* ================= LEFT COLUMN: Applications List (8 cols) ================= */}
          <div className="lg:col-span-8 space-y-5">
            {/* Title */}
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Việc làm đã ứng tuyển
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                Theo dõi tiến trình xét duyệt hồ sơ và phản hồi từ các nhà tuyển dụng.
              </p>
            </div>

            {/* Smart Reminder Banner (matches reference mockup top banner) */}
            <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-blue-50/70 dark:bg-blue-950/30 p-4 sm:p-5 text-slate-700 dark:text-slate-300 shadow-xs">
              <div className="flex items-start gap-3.5">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary dark:bg-primary/25 dark:text-primary-light">
                  <Bot className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm leading-relaxed">
                    Bạn có thể nhấn nút <strong className="text-primary font-bold">"Nhắc NTD"</strong> nếu đã quá 7 ngày từ lúc ứng tuyển mà vẫn chưa được phản hồi. <strong className="font-semibold text-slate-900 dark:text-white">TalentPulse</strong> sẽ thay bạn gửi một lời nhắn chuyên nghiệp tới NTD.
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Tìm nút <span className="font-semibold text-primary">"Nhắc NTD"</span> tại từng lượt ứng tuyển bên dưới.
                  </p>
                </div>
              </div>
            </div>

            {/* Horizontal Filter Tabs (TalentPulse Royal Blue Theme - NO TOPCV GREEN) */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              {FILTER_TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                const count =
                  tab.id === 'ALL'
                    ? applications.length
                    : applications.filter((a) => a.status === tab.id).length;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`whitespace-nowrap rounded-full px-4 py-2 text-xs sm:text-sm transition-all duration-150 cursor-pointer flex items-center gap-1.5 ${
                      isActive
                        ? 'border border-primary/40 bg-primary/10 font-bold text-primary shadow-xs dark:border-primary/50 dark:bg-primary/20 dark:text-primary-light'
                        : 'border border-slate-200/80 bg-white font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/80 dark:hover:text-slate-200'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`text-[11px] px-1.5 py-0.2 rounded-full font-bold ${
                        isActive
                          ? 'bg-primary text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Loading State */}
            {loading && (
              <div className="space-y-4">
                {[1, 2, 3].map((n) => (
                  <div
                    key={n}
                    className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 animate-pulse"
                  >
                    <div className="flex items-start gap-4">
                      <div className="h-14 w-14 rounded-xl bg-slate-200 dark:bg-slate-800 flex-shrink-0" />
                      <div className="flex-1 space-y-2.5">
                        <div className="h-4 w-1/2 bg-slate-200 dark:bg-slate-800 rounded" />
                        <div className="h-3 w-1/3 bg-slate-100 dark:bg-slate-800/60 rounded" />
                        <div className="h-3 w-1/4 bg-slate-100 dark:bg-slate-800/60 rounded" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty State */}
            {!loading && filteredApplications.length === 0 && (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center flex flex-col items-center justify-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light">
                  <Briefcase className="h-8 w-8" />
                </div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  Chưa có việc làm nào trong mục này
                </h3>
                <p className="mt-1.5 max-w-md text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                  {activeTab === 'ALL'
                    ? 'Bạn chưa nộp hồ sơ vào công việc nào. Khám phá hàng ngàn cơ hội việc làm hấp dẫn ngay hôm nay!'
                    : `Không có đơn ứng tuyển nào ở trạng thái "${FILTER_TABS.find((t) => t.id === activeTab)?.label}".`}
                </p>
                <Link
                  to="/jobs"
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-primary/20 hover:bg-primary-dark transition-all active:scale-95 cursor-pointer"
                >
                  <Search className="h-4 w-4" />
                  <span>Tìm việc làm phù hợp ngay</span>
                </Link>
              </div>
            )}

            {/* Application Cards List */}
            {!loading && filteredApplications.length > 0 && (
              <div className="space-y-4">
                {filteredApplications.map((app) => {
                  const job = app.job || app.jobId;
                  const company = app.company || app.companyId;
                  const cv = app.cv || app.cvId;
                  const companyName = company?.name || 'Doanh nghiệp tuyển dụng';
                  const jobName = job?.name || 'Vị trí tuyển dụng';
                  const jobId = job?._id;
                  const isExpanded = !!expandedAppIds[app._id];
                  const isReminding = !!remindingIds[app._id];
                  const daysSinceApplied = getDaysSinceApplied(app.createdAt);
                  const hasNoStatusTransition = !app.history || app.history.length <= 1 || app.history.every((h) => h.status === 'PENDING');
                  const canNudge = daysSinceApplied >= 7 && app.status === 'PENDING' && hasNoStatusTransition;
                  const stepperStep = getStepperActiveIndex(app.status);

                  return (
                    <motion.div
                      key={app._id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs hover:border-primary/40 dark:hover:border-primary/40 transition-all"
                    >
                      {/* Top Row: Company Logo + Job Details */}
                      <div className="flex items-start gap-3.5 sm:gap-4">
                        {/* Company Logo */}
                        <div className="flex h-12 w-12 sm:h-14 sm:w-14 flex-shrink-0 items-center justify-center rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-800 p-1.5 shadow-xs">
                          {company?.logo ? (
                            <img
                              src={company.logo}
                              alt={companyName}
                              className="h-full w-full rounded-lg object-contain"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          ) : (
                            <Building2 className="h-6 w-6 text-primary" />
                          )}
                        </div>

                        {/* Job & Application Meta */}
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary dark:bg-primary/20 dark:text-primary-light">
                              <Sparkles className="h-3 w-3" />
                              TOP
                            </span>
                            {job?.level && (
                              <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-300">
                                {job.level}
                              </span>
                            )}
                          </div>

                          {/* Job Title Clickable */}
                          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-snug">
                            {jobId ? (
                              <Link
                                to={`/jobs/${jobId}`}
                                className="hover:text-primary transition-colors inline-flex items-center gap-1 group"
                              >
                                <span>{jobName}</span>
                                <ExternalLink className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </Link>
                            ) : (
                              <span>{jobName}</span>
                            )}
                          </h2>

                          {/* Company Name */}
                          <p className="mt-0.5 text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400 truncate">
                            {companyName}
                          </p>

                          {/* Meta: Applied Date & CV link */}
                          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 text-slate-400" />
                              <span>Ứng tuyển: <strong className="text-slate-700 dark:text-slate-300">{formatDateTime(app.createdAt)}</strong></span>
                            </div>

                            {cv && (
                              <div className="flex items-center gap-1.5">
                                <FileText className="h-3.5 w-3.5 text-primary" />
                                {cv.url ? (
                                  <a
                                    href={cv.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="font-semibold text-primary hover:underline truncate max-w-[220px]"
                                  >
                                    CV - {cv.title || user?.name || 'Hồ sơ ứng tuyển'}
                                  </a>
                                ) : (
                                  <span className="font-semibold text-primary truncate max-w-[220px]">
                                    CV - {cv.title || user?.name || 'Hồ sơ ứng tuyển'}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Match Score Badge if available */}
                          {app.matchScore !== undefined && app.matchScore > 0 && (
                            <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-emerald-200/80 bg-emerald-50/70 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                              <span>Độ phù hợp AI: {app.matchScore}% • CV đạt chuẩn tuyển dụng</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Status Highlight Banner & Actions */}
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 px-3.5 py-2.5">
                        {/* Status Message with Date */}
                        <div className="text-xs sm:text-sm font-semibold">
                          {app.status === 'PENDING' && (
                            <span className="text-primary dark:text-primary-light">
                              NTD đã nhận được CV ({formatDateTime(app.createdAt)})
                            </span>
                          )}
                          {app.status === 'REVIEWING' && (
                            <span className="text-blue-600 dark:text-blue-400">
                              NTD đã mở xem CV của bạn ({formatDateTime(app.updatedAt || app.createdAt)})
                            </span>
                          )}
                          {app.status === 'CONSIDERING' && (
                            <span className="text-amber-600 dark:text-amber-400">
                              Hồ sơ đang được phòng ban chuyên môn đánh giá ({formatDateTime(app.updatedAt)})
                            </span>
                          )}
                          {app.status === 'INTERVIEWING' && (
                            <span className="text-primary dark:text-primary-light flex items-center gap-1.5 font-bold">
                              <Video className="h-4 w-4" />
                              Hồ sơ đang ở giai đoạn Phỏng vấn
                            </span>
                          )}
                          {(app.status === 'SUITABLE' || app.status === 'APPROVED') && (
                            <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                              <CheckCircle2 className="h-4 w-4" />
                              Hồ sơ của bạn được NTD đánh giá Phù hợp!
                            </span>
                          )}
                          {app.status === 'REJECTED' && (
                            <span className="text-slate-600 dark:text-slate-400">
                              NTD đánh giá CV của bạn "Chưa phù hợp" ({formatDateTime(app.updatedAt)})
                            </span>
                          )}
                          {app.status === 'WITHDRAWN' && (
                            <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                              <MinusCircle className="h-4 w-4" />
                              Bạn đã rút hồ sơ ứng tuyển vị trí này
                            </span>
                          )}
                        </div>

                        {/* Action Buttons: Hủy đơn (chỉ active khi PENDING), Nhắc NTD (chỉ hiện khi đủ điều kiện) & Nhắn tin */}
                        <div className="flex items-center gap-2">
                          {app.status === 'PENDING' ? (
                            <button
                              type="button"
                              onClick={() => {
                                setWithdrawModalApp(app);
                                setWithdrawReason('');
                              }}
                              title="Hủy đơn ứng tuyển này (khi hồ sơ còn ở trạng thái Chờ xử lý)"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 px-3 py-1.5 text-xs font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors cursor-pointer active:scale-95 shadow-xs"
                            >
                              <MinusCircle className="h-3.5 w-3.5" />
                              <span>Hủy đơn</span>
                            </button>
                          ) : app.status === 'WITHDRAWN' ? (
                            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/60 px-3 py-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                              <MinusCircle className="h-3.5 w-3.5" />
                              <span>Đã hủy đơn</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled
                              title="Chỉ có thể hủy đơn khi hồ sơ ở trạng thái Chờ xử lý (PENDING). Nhà tuyển dụng đã tiếp nhận hoặc đang xét duyệt hồ sơ này."
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800/40 px-3 py-1.5 text-xs font-medium text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-60"
                            >
                              <MinusCircle className="h-3.5 w-3.5" />
                              <span>Hủy đơn</span>
                            </button>
                          )}

                          {/* "Nhắc NTD" Button - Chỉ hiển thị nếu sau 7 ngày mà CV chưa được chuyển trạng thái bất cứ lần nào */}
                          {canNudge && (
                            <button
                              type="button"
                              onClick={() => void handleRemindHR(app._id, companyName)}
                              disabled={isReminding}
                              title="Nhắc NTD phản hồi về hồ sơ ứng tuyển của bạn"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 dark:bg-primary/20 dark:text-primary-light shadow-xs transition-all duration-150 cursor-pointer active:scale-95"
                            >
                              {isReminding ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Send className="h-3.5 w-3.5" />
                              )}
                              <span>Nhắc NTD</span>
                            </button>
                          )}

                          {/* "Nhắn tin" Button */}
                          <button
                            type="button"
                            onClick={() => {
                              info(
                                'Kết nối với NTD',
                                `Bạn có thể nhắn tin hoặc theo dõi phản hồi từ ${companyName} trong hộp thư thông báo.`,
                              );
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer active:scale-95"
                          >
                            <MessageSquare className="h-3.5 w-3.5 text-slate-400" />
                            <span>Nhắn tin</span>
                          </button>
                        </div>
                      </div>

                      {/* Associated Interview Rounds Banner */}
                      {interviews.filter((iv) => iv.applicationId === app._id || (iv.application as any)?._id === app._id).length > 0 && (
                        <div className="mt-3 space-y-2.5">
                          {interviews
                            .filter((iv) => iv.applicationId === app._id || (iv.application as any)?._id === app._id)
                            .map((iv) => {
                              const isPending = iv.status === 'PENDING_CONFIRMATION';
                              const isConfirmed = iv.status === 'CONFIRMED';
                              const isInProgress = iv.status === 'IN_PROGRESS';
                              const isCompleted = iv.status === 'COMPLETED';
                              const isDeclined = iv.status === 'DECLINED';
                              const isCancelled = iv.status === 'CANCELLED';

                              return (
                                <div
                                  key={iv._id}
                                  className={`rounded-xl border p-4 transition-all ${
                                    isPending
                                      ? 'border-amber-300 bg-amber-50/60 dark:border-amber-800/80 dark:bg-amber-950/20 shadow-xs'
                                      : isInProgress
                                      ? 'border-primary/50 bg-primary/5 dark:border-primary/60 dark:bg-primary/10 shadow-xs'
                                      : isConfirmed
                                      ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/50 dark:bg-emerald-950/20'
                                      : 'border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-800/40'
                                  }`}
                                >
                                  {/* Header */}
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2.5">
                                      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                                        iv.isOnline
                                          ? 'bg-primary/10 text-primary dark:bg-primary/20'
                                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                                      }`}>
                                        {iv.isOnline ? <Video className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
                                      </span>
                                      <div>
                                        <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                                          {iv.title}
                                        </h4>
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                          {iv.roundNumber ? `Vòng ${iv.roundNumber} • ` : ''}
                                          {iv.isOnline ? 'Phỏng vấn trực tuyến (WebRTC Video HD)' : 'Phỏng vấn trực tiếp'} • {iv.durationMinutes} phút
                                        </p>
                                      </div>
                                    </div>

                                    {/* Badge */}
                                    <span className={`inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 text-xs font-bold ${
                                      isPending
                                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                                        : isConfirmed
                                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                        : isInProgress
                                        ? 'bg-primary text-white shadow-xs animate-pulse'
                                        : isDeclined
                                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300'
                                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                                    }`}>
                                      {isPending && 'Chờ bạn xác nhận'}
                                      {isConfirmed && 'Đã xác nhận tham gia'}
                                      {isInProgress && 'Đang diễn ra'}
                                      {isCompleted && 'Đã hoàn thành'}
                                      {isDeclined && 'Đã từ chối'}
                                      {isCancelled && 'Đã hủy'}
                                    </span>
                                  </div>

                                  {/* Time & Location */}
                                  <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
                                    <div className="flex items-center gap-1.5">
                                      <Clock className="h-3.5 w-3.5 text-primary" />
                                      <span>Thời gian: <strong className="text-slate-900 dark:text-white">{formatDateTime(iv.scheduledAt)} - {formatDateTime(iv.scheduledEndAt)}</strong></span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <Building2 className="h-3.5 w-3.5 text-slate-400" />
                                      <span>Địa điểm: <strong className="text-slate-900 dark:text-white">{iv.isOnline ? 'Phòng họp trực tuyến TalentPulse' : (iv.location || 'Văn phòng công ty')}</strong></span>
                                    </div>
                                  </div>

                                  {iv.description && (
                                    <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 bg-white/70 dark:bg-slate-900/50 rounded-lg p-2 border border-slate-100 dark:border-slate-800">
                                      <span className="font-semibold text-slate-800 dark:text-slate-200">Ghi chú từ NTD: </span>
                                      {iv.description}
                                    </p>
                                  )}

                                  {/* Action Row */}
                                  <div className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                                    {isPending && (
                                      <>
                                        <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">
                                          Vui lòng xác nhận để lịch phỏng vấn được kích hoạt trên hệ thống.
                                        </p>
                                        <div className="flex items-center gap-2">
                                          <button
                                            type="button"
                                            onClick={() => void handleConfirmInterview(iv._id)}
                                            disabled={isConfirmingRoundId === iv._id}
                                            className="inline-flex items-center gap-1.5 rounded-lg bg-primary hover:bg-primary-dark px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                                          >
                                            {isConfirmingRoundId === iv._id ? (
                                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : (
                                              <CheckCircle2 className="h-3.5 w-3.5" />
                                            )}
                                            <span>Đồng ý tham gia</span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setDeclineModalRound(iv);
                                              setDeclineReason('');
                                            }}
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                                          >
                                            <X className="h-3.5 w-3.5" />
                                            <span>Từ chối</span>
                                          </button>
                                        </div>
                                      </>
                                    )}

                                    {(isConfirmed || isInProgress) && iv.isOnline && (
                                      <div className="w-full flex flex-wrap items-center justify-between gap-2">
                                        <p className="text-xs text-slate-600 dark:text-slate-300">
                                          {isInProgress || iv.inviteSentAt
                                            ? 'Phòng họp trực tuyến đã sẵn sàng. Bạn có thể tham gia ngay bây giờ.'
                                            : 'Phòng họp trực tuyến sẽ mở khi đến giờ hẹn hoặc khi NTD gửi lời mời.'}
                                        </p>
                                        <Link
                                          to={`/interview-room/${iv.roomId}`}
                                          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold text-white shadow-xs transition-all cursor-pointer active:scale-95 ${
                                            isInProgress || iv.inviteSentAt
                                              ? 'bg-primary hover:bg-primary-dark shadow-primary/20'
                                              : 'bg-primary/80 hover:bg-primary'
                                          }`}
                                        >
                                          <Video className="h-4 w-4" />
                                          <span>Vào phòng phỏng vấn</span>
                                        </Link>
                                      </div>
                                    )}

                                    {isCompleted && (
                                      <div className="w-full text-xs text-slate-600 dark:text-slate-400">
                                        <span>Kết quả phỏng vấn: </span>
                                        <strong className={
                                          iv.result === 'PASSED'
                                            ? 'text-emerald-600 font-bold'
                                            : iv.result === 'FAILED'
                                            ? 'text-rose-600 font-bold'
                                            : 'text-slate-700 font-bold'
                                        }>
                                          {iv.result === 'PASSED' ? 'Đạt yêu cầu' : iv.result === 'FAILED' ? 'Chưa đạt yêu cầu' : 'Đang chờ cập nhật'}
                                        </strong>
                                        {iv.feedback && <p className="mt-1 text-slate-500">{iv.feedback}</p>}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      )}

                      {/* 5-Step Horizontal Stepper (Tiến trình ứng tuyển) */}
                      <div className="mt-5 px-1 sm:px-4">
                        <div className="relative flex items-center justify-between">
                          {/* Stepper Steps Definition */}
                          {[
                            { step: 1, label: 'Nộp hồ sơ' },
                            { step: 2, label: 'Tiếp nhận' },
                            { step: 3, label: 'Đã xem' },
                            { step: 4, label: 'Phỏng vấn' },
                            { step: 5, label: 'Kết quả' },
                          ].map((item, idx, arr) => {
                            const isCompleted = stepperStep >= item.step;

                            return (
                              <div
                                key={item.step}
                                className="relative z-10 flex flex-col items-center flex-1"
                              >
                                {/* Circle Node */}
                                <div
                                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-all duration-200 ${
                                    isCompleted
                                      ? 'bg-primary text-white shadow-xs shadow-primary/30 ring-2 ring-primary/20'
                                      : 'border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-400'
                                  }`}
                                >
                                  {isCompleted ? (
                                    <CheckCircle2 className="h-4 w-4" />
                                  ) : (
                                    <span className="h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-700" />
                                  )}
                                </div>

                                {/* Step Label */}
                                <span
                                  className={`mt-2 text-[10px] sm:text-xs text-center line-clamp-1 font-medium ${
                                    isCompleted
                                      ? 'text-primary dark:text-primary-light font-bold'
                                      : 'text-slate-500 dark:text-slate-400'
                                  }`}
                                >
                                  {item.label}
                                </span>

                                {/* Connecting Line to next step */}
                                {idx < arr.length - 1 && (
                                  <div
                                    className={`absolute top-3 left-1/2 w-full h-0.5 -z-1 transition-colors duration-200 ${
                                      stepperStep > item.step
                                        ? 'bg-primary'
                                        : 'bg-slate-200 dark:bg-slate-800'
                                    }`}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Collapsible Timeline: Chi tiết tiến trình ứng tuyển */}
                      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                        <button
                          type="button"
                          onClick={() => toggleAccordion(app._id)}
                          className="w-full flex items-center justify-between py-1 text-xs sm:text-sm font-semibold text-slate-600 hover:text-primary dark:text-slate-300 dark:hover:text-primary-light transition-colors cursor-pointer"
                        >
                          <span className="flex items-center gap-1.5">
                            <Clock className="h-4 w-4 text-primary" />
                            <span>Chi tiết tiến trình ứng tuyển</span>
                          </span>
                          <ChevronDown
                            className={`h-4 w-4 transition-transform duration-200 ${
                              isExpanded ? 'rotate-180 text-primary' : 'text-slate-400'
                            }`}
                          />
                        </button>

                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="mt-3 pl-3 sm:pl-6 border-l-2 border-primary/30 dark:border-primary/40 space-y-3 py-1 text-xs">
                                {/* If application has history items */}
                                {app.history && app.history.length > 0 ? (
                                  [...app.history].reverse().map((h, i) => (
                                    <div key={i} className="relative">
                                      {/* Timeline Bullet */}
                                      <span className="absolute -left-[19px] sm:-left-[31px] top-1 h-3 w-3 rounded-full bg-primary ring-4 ring-white dark:ring-slate-900" />
                                      <div className="flex items-center gap-2">
                                        {i === 0 && (
                                          <span className="inline-flex rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary dark:bg-primary/25 dark:text-primary-light">
                                            Mới nhất
                                          </span>
                                        )}
                                        <p className="font-bold text-slate-900 dark:text-white">
                                          {h.status === 'REVIEWING'
                                            ? 'NTD đã xem hồ sơ ứng tuyển'
                                            : h.status === 'CONSIDERING'
                                            ? 'NTD chuyển hồ sơ sang Cân nhắc'
                                            : h.status === 'INTERVIEWING'
                                            ? 'NTD chuyển hồ sơ sang Phỏng vấn'
                                            : h.status === 'SUITABLE' || h.status === 'APPROVED'
                                            ? 'NTD đánh giá hồ sơ Phù hợp'
                                            : h.status === 'REJECTED'
                                            ? 'NTD đánh giá Chưa phù hợp'
                                            : h.status === 'WITHDRAWN'
                                            ? 'Ứng viên đã hủy đơn ứng tuyển'
                                            : 'NTD đã tiếp nhận hồ sơ'}
                                        </p>
                                      </div>
                                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                        {formatDateTime(h.updatedAt)}
                                      </p>
                                    </div>
                                  ))
                                ) : (
                                  <>
                                    <div className="relative">
                                      <span className="absolute -left-[19px] sm:-left-[31px] top-1 h-3 w-3 rounded-full bg-primary ring-4 ring-white dark:ring-slate-900" />
                                      <div className="flex items-center gap-2">
                                        <span className="inline-flex rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary dark:bg-primary/25 dark:text-primary-light">
                                          Mới nhất
                                        </span>
                                        <p className="font-bold text-slate-900 dark:text-white">
                                          NTD đã tiếp nhận hồ sơ
                                        </p>
                                      </div>
                                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                        {formatDateTime(app.createdAt)}
                                      </p>
                                    </div>
                                    <div className="relative">
                                      <span className="absolute -left-[19px] sm:-left-[31px] top-1 h-3 w-3 rounded-full bg-slate-300 dark:bg-slate-700 ring-4 ring-white dark:ring-slate-900" />
                                      <p className="font-semibold text-slate-700 dark:text-slate-300">
                                        Ứng viên gửi hồ sơ thành công
                                      </p>
                                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                        {formatDateTime(app.createdAt)}
                                      </p>
                                    </div>
                                  </>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ================= RIGHT COLUMN: Candidate Sidebar Widgets (4 cols) ================= */}
          <div className="lg:col-span-4 space-y-5">
            {/* 1. Candidate Profile Card */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
              <div className="flex items-center gap-3.5">
                <div className="relative">
                  <UserAvatar src={user?.avatar} alt={user?.name || 'Candidate'} size="lg" />
                  <span
                    className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white ring-2 ring-white dark:ring-slate-900 shadow-xs"
                    title="Tài khoản đã xác thực"
                  >
                    <ShieldCheck className="h-3 w-3" />
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-400 font-medium">Chào bạn trở lại,</p>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base truncate">
                    {user?.name || 'Ứng viên TalentPulse'}
                  </h3>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                      <UserCheck className="h-3 w-3 text-primary" />
                      Tài khoản đã xác thực
                    </span>
                  </div>
                </div>
              </div>

              {/* Upgrade to Candidate Premium CTA */}
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                <Link
                  to="/premium"
                  className="flex items-center justify-between rounded-xl bg-primary/5 hover:bg-primary/10 border border-primary/20 px-3.5 py-2.5 text-xs font-bold text-primary dark:text-primary-light transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    <span>
                      {user?.isPremium ? 'Tài khoản Candidate Premium' : 'Nâng cấp tài khoản'}
                    </span>
                  </div>
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>

              {/* Toggle Switches: Job Alerts & Open to Work */}
              <div className="mt-4 space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                    <span>Gợi ý việc làm</span>
                    <span title="Nhận thông báo khi có việc làm mới phù hợp với CV của bạn">
                      <HelpCircle className="h-3.5 w-3.5 text-slate-400 cursor-help" />
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={suggestJobs}
                    onClick={() => setSuggestJobs(!suggestJobs)}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      suggestJobs ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        suggestJobs ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-primary dark:text-primary-light">
                      Trạng thái tìm việc đang bật
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Hồ sơ luôn sẵn sàng để nhận lời mời tuyển dụng
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={jobSearchActive}
                    onClick={() => setJobSearchActive(!jobSearchActive)}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      jobSearchActive ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        jobSearchActive ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Selected CVs summary */}
              <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 border border-slate-100 dark:border-slate-800 text-xs">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-slate-400" />
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {totalCvCount} CV đang được chọn
                  </span>
                </div>
                <Link
                  to="/my-cv"
                  className="font-bold text-primary hover:text-primary-dark transition-colors"
                >
                  Thay đổi
                </Link>
              </div>
            </div>

            {/* 2. "Cho phép NTD tìm kiếm hồ sơ" Box */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <Search className="h-4 w-4 text-primary" />
                <span>Cho phép NTD tìm kiếm hồ sơ</span>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                Có <strong className="text-primary font-bold">{totalCvCount} CV</strong> đang bật chế độ cho phép NTD tìm kiếm và xem chi tiết.
              </p>

              <Link
                to="/my-cv"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 hover:bg-primary/20 py-2.5 text-xs font-bold text-primary dark:text-primary-light transition-colors"
              >
                <Layers className="h-3.5 w-3.5" />
                <span>Quản lý danh sách CV</span>
              </Link>

              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Khi bạn cho phép Nhà tuyển dụng (NTD) tìm kiếm hồ sơ, các doanh nghiệp uy tín có thể chủ động tiếp cận thông tin kinh nghiệm, kỹ năng và gửi thư mời phỏng vấn trực tiếp.
              </div>
            </div>

            {/* 3. TalentPulse Premium / Active Candidate Promo Card (Blue Theme) */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-blue-600 to-indigo-700 p-5 text-white shadow-md shadow-primary/20">
              {/* Decorative Glow */}
              <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-xl pointer-events-none" />

              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20 text-white backdrop-blur-xs">
                  <Flame className="h-4 w-4 text-amber-300" />
                </span>
                <span className="text-[11px] font-black uppercase tracking-wider text-amber-300">
                  Trải nghiệm ngay
                </span>
              </div>

              <h4 className="mt-2.5 text-base font-black leading-snug">
                Bạn có muốn CV của mình được ưu tiên xem trước?
              </h4>

              <div className="mt-3 space-y-2 text-xs text-blue-50/90 font-medium">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-amber-300 flex-shrink-0 mt-0.5" />
                  <span>CV được ghim trong top đầu danh sách ứng viên gửi đến NTD</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-amber-300 flex-shrink-0 mt-0.5" />
                  <span>Huy hiệu Tìm việc tích cực giúp nhân đôi cơ hội được phỏng vấn</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-amber-300 flex-shrink-0 mt-0.5" />
                  <span>Báo cáo phân tích AI Matching điểm mạnh & gợi ý cải thiện CV</span>
                </div>
              </div>

              <Link
                to="/premium"
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-white py-2.5 text-xs font-black text-primary shadow-sm hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <span>Nâng cấp Candidate Premium</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>

        {/* Modal Xác nhận rút hồ sơ ứng tuyển */}
        <AnimatePresence>
          {withdrawModalApp && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800"
              >
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Hủy đơn ứng tuyển
                  </h3>
                  <button
                    type="button"
                    onClick={() => setWithdrawModalApp(null)}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="mt-4 space-y-3 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                  <p>
                    Bạn đang yêu cầu hủy đơn ứng tuyển cho vị trí{' '}
                    <strong className="text-slate-900 dark:text-white">
                      {withdrawModalApp.job?.name || withdrawModalApp.jobId?.name || 'Vị trí này'}
                    </strong>{' '}
                    tại{' '}
                    <strong className="text-slate-900 dark:text-white">
                      {withdrawModalApp.company?.name || withdrawModalApp.companyId?.name || 'Nhà tuyển dụng'}
                    </strong>.
                  </p>
                  <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 p-3 border border-amber-200 dark:border-amber-900/50 text-xs text-amber-800 dark:text-amber-300">
                    Lưu ý: Chỉ đơn ứng tuyển ở trạng thái <strong>Chờ xử lý (PENDING)</strong> mới có thể hủy. Sau khi hủy, đơn ứng tuyển sẽ được đóng lại vĩnh viễn.
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Lý do hủy đơn (không bắt buộc)
                    </label>
                    <textarea
                      rows={3}
                      value={withdrawReason}
                      onChange={(e) => setWithdrawReason(e.target.value)}
                      placeholder="Nhập lý do của bạn..."
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs text-slate-900 dark:text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setWithdrawModalApp(null)}
                    disabled={isSubmittingWithdraw}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Đóng
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleWithdrawApplication()}
                    disabled={isSubmittingWithdraw}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 px-4 py-2 text-xs font-bold text-white shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {isSubmittingWithdraw ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <MinusCircle className="h-4 w-4" />
                    )}
                    <span>Xác nhận hủy đơn</span>
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Modal Từ chối lịch phỏng vấn */}
        <AnimatePresence>
          {declineModalRound && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800"
              >
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Từ chối lịch phỏng vấn
                  </h3>
                  <button
                    type="button"
                    onClick={() => setDeclineModalRound(null)}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="mt-4 space-y-3 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                  <p>
                    Bạn đang từ chối lịch phỏng vấn{' '}
                    <strong className="text-slate-900 dark:text-white">
                      {declineModalRound.title}
                    </strong>{' '}
                    vào lúc{' '}
                    <strong className="text-slate-900 dark:text-white">
                      {formatDateTime(declineModalRound.scheduledAt)}
                    </strong>.
                  </p>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Lý do từ chối (không bắt buộc)
                    </label>
                    <textarea
                      rows={3}
                      value={declineReason}
                      onChange={(e) => setDeclineReason(e.target.value)}
                      placeholder="Nhập lý do hoặc mong muốn dời lịch..."
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs text-slate-900 dark:text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setDeclineModalRound(null)}
                    disabled={isSubmittingDecline}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Quay lại
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeclineInterview()}
                    disabled={isSubmittingDecline}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 px-4 py-2 text-xs font-bold text-white shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {isSubmittingDecline ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <X className="h-4 w-4" />
                    )}
                    <span>Xác nhận từ chối</span>
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>

      <Footer />
    </div>
  );
}
