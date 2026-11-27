import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import CandidateNarrative from './CandidateNarrative';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Search,
  Eye,
  XCircle,
  Video,
  Sparkles,
  Download,
  ExternalLink,
  Loader2,
  X,
  FileText,
  Clock,
  CheckCircle2,
  Bookmark,
  Calendar,
  MinusCircle,
  MapPin,
  Briefcase,
  GraduationCap,
  Award,
  ChevronDown,
  ChevronRight,
  Mail,
  User as UserIcon,
  RefreshCw,
} from 'lucide-react';
import {
  employerApi,
  type ApplicationItem,
  type ApplicationStatusType,
  type AIRankedCandidate,
  type HrJobItem,
  type CompanyInfo,
} from '../../../lib/employerApi';
import { useToast } from '../../../context/ToastContext';
import { CompanyRequiredGate } from '../components/CompanyRequiredGate';
import { formatDate, formatDateTime } from '../../../lib/dateUtils';
import { applicationCsv } from '../../../lib/applicationCsv';
import { userApi } from '../../../lib/userApi';
import { analysisComponent, analysisPercent } from '../../../lib/hrMatchingAnalysis';

const TERMINAL_STATUSES = new Set<ApplicationStatusType>([
  'SUITABLE',
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
]);

const STATUS_OPTIONS: {
  value: ApplicationStatusType;
  label: string;
  selectClass: string;
}[] = [
  {
    value: 'PENDING',
    label: 'Chờ xử lý',
    selectClass:
      'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
  },
  {
    value: 'REVIEWING',
    label: 'Đã xem CV',
    selectClass:
      'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/80 dark:bg-blue-950/60 dark:text-blue-300',
  },
  {
    value: 'CONSIDERING',
    label: 'Cân nhắc',
    selectClass:
      'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/80 dark:bg-amber-950/60 dark:text-amber-300',
  },
  {
    value: 'INTERVIEWING',
    label: 'Phỏng vấn',
    selectClass:
      'border-primary/30 bg-primary/10 text-primary dark:border-primary/40 dark:bg-primary/20 dark:text-primary-light',
  },
  {
    value: 'SUITABLE',
    label: 'Phù hợp',
    selectClass:
      'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/80 dark:bg-emerald-950/60 dark:text-emerald-300',
  },
  {
    value: 'APPROVED',
    label: 'Phù hợp',
    selectClass:
      'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/80 dark:bg-emerald-950/60 dark:text-emerald-300',
  },
  {
    value: 'REJECTED',
    label: 'Chưa phù hợp',
    selectClass:
      'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/80 dark:bg-rose-950/60 dark:text-rose-300',
  },
  {
    value: 'WITHDRAWN',
    label: 'Đã rút đơn',
    selectClass:
      'border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400',
  },
];

const getAvailableStatusTargets = (
  currentStatus: ApplicationStatusType,
): ApplicationStatusType[] => {
  switch (currentStatus) {
    case 'PENDING':
      return ['REVIEWING', 'CONSIDERING', 'INTERVIEWING', 'SUITABLE', 'REJECTED'];
    case 'REVIEWING':
      return ['CONSIDERING', 'INTERVIEWING', 'SUITABLE', 'REJECTED'];
    case 'CONSIDERING':
      return ['INTERVIEWING', 'SUITABLE', 'REJECTED'];
    case 'INTERVIEWING':
      return ['SUITABLE', 'REJECTED'];
    default:
      return [];
  }
};

const getStatusSelectOptions = (currentStatus: ApplicationStatusType) => {
  const allowed = new Set<ApplicationStatusType>([
    currentStatus,
    ...getAvailableStatusTargets(currentStatus),
  ]);
  return STATUS_OPTIONS.filter(
    (opt) => opt.value !== 'APPROVED' || currentStatus === 'APPROVED',
  ).filter((opt) => allowed.has(opt.value));
};

const getStatusMeta = (status: ApplicationStatusType) =>
  STATUS_OPTIONS.find((opt) => opt.value === status) || STATUS_OPTIONS[0];

const formatJobSalary = (salary?: number) => {
  if (!salary || salary <= 0) return 'Thỏa thuận';
  if (salary >= 1_000_000) {
    const millions = salary / 1_000_000;
    return `${Number.isInteger(millions) ? millions : millions.toFixed(1)} triệu đ`;
  }
  return `${salary.toLocaleString('vi-VN')} đ`;
};

const formatGenderLabel = (gender?: string) => {
  if (!gender) return null;
  const normalized = gender.trim().toLowerCase();
  if (normalized === 'male' || normalized === 'nam') return 'Nam';
  if (normalized === 'female' || normalized === 'nu' || normalized === 'nữ') return 'Nữ';
  return gender;
};

const isPreviewableUrl = (url?: string) =>
  Boolean(url && (/^https?:\/\//i.test(url) || url.startsWith('/')));

const getApplicationAiPercent = (score?: ApplicationItem['aiScore']) =>
  score?.status === 'COMPLETED' ? analysisPercent(score.overallScore) : null;

const getApplicationAiBadgeMeta = (score?: ApplicationItem['aiScore']) => {
  const percentText = getApplicationAiPercent(score);
  if (score?.status === 'COMPLETED' && percentText !== null) {
    const pct = Math.round((score.overallScore || 0) * 100);
    if (pct >= 75) {
      return {
        label: `AI ${percentText}`,
        percentText,
        className:
          'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/80 dark:bg-emerald-950/60 dark:text-emerald-300',
        title: `Mức độ phù hợp giữa CV và tin tuyển dụng đạt ${percentText}`,
      };
    }
    if (pct >= 50) {
      return {
        label: `AI ${percentText}`,
        percentText,
        className:
          'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800/80 dark:bg-indigo-950/60 dark:text-indigo-300',
        title: `Mức độ phù hợp giữa CV và tin tuyển dụng đạt ${percentText}`,
      };
    }
    return {
      label: `AI ${percentText}`,
      percentText,
      className:
        'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/80 dark:bg-amber-950/60 dark:text-amber-300',
      title: `Mức độ phù hợp giữa CV và tin tuyển dụng đạt ${percentText}`,
    };
  }

  switch (score?.status) {
    case 'PENDING':
    case 'PROCESSING':
      return {
        label: 'Đang chấm AI',
        percentText: null,
        className:
          'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/80 dark:bg-blue-950/60 dark:text-blue-300',
        title: 'Hệ thống đang phân tích và chấm điểm CV trong nền',
      };
    case 'STALE':
      return {
        label: 'Điểm AI cũ',
        percentText: null,
        className:
          'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/80 dark:bg-amber-950/60 dark:text-amber-300',
        title: 'Điểm AI đã cũ do tin tuyển dụng hoặc CV đã thay đổi / xóa',
      };
    case 'FAILED':
      return {
        label: 'Chấm AI lỗi',
        percentText: null,
        className:
          'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/80 dark:bg-rose-950/60 dark:text-rose-300',
        title: 'Không thể hoàn tất chấm điểm AI cho hồ sơ này',
      };
    case 'MISSING':
      return {
        label: 'Chưa chấm AI',
        percentText: null,
        className:
          'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
        title: 'Chưa có bản ghi điểm AI cho cặp CV và tin tuyển dụng này',
      };
    case 'UNAVAILABLE':
    default:
      return {
        label: 'Chưa khả dụng',
        percentText: null,
        className:
          'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-400',
        title:
          'Chỉ hiển thị điểm AI khi tin còn mở, ứng viên đồng ý AI matching khi nộp đơn và hồ sơ chưa kết thúc/phỏng vấn',
      };
  }
};

interface CandidateManagementTabProps {
  company: CompanyInfo | null;
  hasCompany: boolean;
  accessToken: string | null;
  filterJobId?: string | null;
  openAiRank?: boolean;
  selectedApplicationId?: string | null;
  onNavigateTab?: (tab: string, extraData?: any) => void;
  onRefreshStats: () => Promise<void>;
}

export function CandidateManagementTab({
  company,
  hasCompany,
  accessToken,
  filterJobId,
  openAiRank,
  selectedApplicationId,
  onNavigateTab,
  onRefreshStats,
}: CandidateManagementTabProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage?.startsWith('en') ? 'en' : 'vi';
  const rankingRequest = useRef<AbortController | null>(null);
  const { success, error, info } = useToast();

  const [applications, setApplications] = useState<ApplicationItem[]>([]);
  const [jobs, setJobs] = useState<HrJobItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [exportAccess, setExportAccess] = useState<{ token: string; allowed: boolean } | null>(null);
  const canExportAiScores = exportAccess?.token === accessToken && exportAccess?.allowed === true;

  useEffect(() => {
    let cancelled = false;
    setExportAccess(null);
    if (accessToken && hasCompany) {
      void userApi.getMyEntitlements(accessToken).then((result) => {
        if (!cancelled) setExportAccess({ token: accessToken, allowed: result.limits.canExportAiScores });
      }).catch(() => {
        if (!cancelled) setExportAccess({ token: accessToken, allowed: false });
      });
    }
    return () => { cancelled = true; };
  }, [accessToken, hasCompany]);

  // Filters
  const [selectedJobId, setSelectedJobId] = useState<string>(filterJobId || 'ALL');
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'PENDING' | 'REVIEWING' | 'CONSIDERING' | 'INTERVIEWING' | 'SUITABLE' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN'
  >('ALL');
  const [searchName, setSearchName] = useState('');

  // Modals & Active items
  const [viewingApp, setViewingApp] = useState<ApplicationItem | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

  // AI Rank Modal
  const [isAiRankModalOpen, setIsAiRankModalOpen] = useState(false);
  const [aiRankingJobId, setAiRankingJobId] = useState<string>('');
  const [aiRankingData, setAiRankingData] = useState<{
    jobId: string;
    jobName: string;
    totalApplications: number;
    rankedCandidates: AIRankedCandidate[];
    processingStatus?: {
      total: number;
      completed: number;
      processing: number;
      pending: number;
      failed: number;
      stale?: number;
    };
    processedAt: string;
  } | null>(null);
  const [isLoadingAiRank, setIsLoadingAiRank] = useState(false);

  useEffect(() => {
    rankingRequest.current?.abort();
    setAiRankingData(null);
    setAiRankingJobId('');
    setIsAiRankModalOpen(false);
    setIsLoadingAiRank(false);
    return () => { rankingRequest.current?.abort(); };
  }, [accessToken, company?._id, hasCompany, locale]);

  const closeRanking = () => {
    rankingRequest.current?.abort();
    setAiRankingData(null);
    setAiRankingJobId('');
    setIsAiRankModalOpen(false);
  };

  // Interview & Email Modal
  const [interviewApp, setInterviewApp] = useState<ApplicationItem | null>(null);
  const [isInterviewModalOpen, setIsInterviewModalOpen] = useState(false);
  const [interviewForm, setInterviewForm] = useState({
    sendEmail: true,
    customSubject: '',
    customContent: '',
    note: '',
  });
  const [isSubmittingInterview, setIsSubmittingInterview] = useState(false);

  const fetchJobs = async () => {
    if (!accessToken || !hasCompany) return;
    try {
      const res = await employerApi.getHrJobs({ pageSize: 100 }, accessToken);
      setJobs(res.result || []);
    } catch (err) {
      console.error('Failed to load jobs for filter', err);
    }
  };

  const fetchApplications = async (): Promise<ApplicationItem[]> => {
    if (!accessToken || !hasCompany) {
      setApplications([]);
      setIsLoading(false);
      return [];
    }
    setIsLoading(true);
    try {
      const res =
        selectedJobId && selectedJobId !== 'ALL'
          ? await employerApi.getApplicationsByJob(
              selectedJobId,
              { status: statusFilter === 'ALL' ? undefined : statusFilter, pageSize: 50 },
              accessToken,
            )
          : await employerApi.getApplications(
              { status: statusFilter === 'ALL' ? undefined : statusFilter, pageSize: 50 },
              accessToken,
            );
      const items = res.result || [];
      setApplications(items);
      return items;
    } catch (err) {
      console.error('Failed to load applications', err);
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchJobs();
  }, [accessToken, hasCompany]);

  useEffect(() => {
    void fetchApplications();
  }, [accessToken, hasCompany, selectedJobId, statusFilter]);

  useEffect(() => {
    if (filterJobId) {
      setSelectedJobId(filterJobId);
    }
    if (openAiRank && filterJobId) {
      void handleOpenAiRanking(filterJobId);
    }
  }, [filterJobId, openAiRank]);

  useEffect(() => {
    if (selectedApplicationId && applications.length > 0) {
      const app = applications.find((a) => a._id === selectedApplicationId);
      if (app) void handleViewCv(app);
    }
  }, [selectedApplicationId, applications]);

  // When HR clicks row: transitions PENDING to REVIEWING & triggers socket notification to applicant
  const handleViewCv = async (app: ApplicationItem) => {
    setViewingApp(app);
    if (app.status === 'PENDING' && accessToken) {
      try {
        const updated = await employerApi.markApplicationAsViewed(app._id, accessToken);
        setApplications((prev) =>
          prev.map((item) =>
            item._id === app._id
              ? {
                  ...item,
                  status: 'REVIEWING',
                  version: typeof updated?.version === 'number' ? updated.version : item.version,
                  history: Array.isArray(updated?.history) ? updated.history : item.history,
                }
              : item,
          ),
        );
        setViewingApp((prev) =>
          prev && prev._id === app._id
            ? {
                ...prev,
                status: 'REVIEWING',
                version: typeof updated?.version === 'number' ? updated.version : prev.version,
                history: Array.isArray(updated?.history) ? updated.history : prev.history,
              }
            : prev,
        );
        void onRefreshStats();
      } catch (err) {
        console.error('Failed to mark application as viewed', err);
      }
    }
  };

  const handleUpdateStatus = async (
    applicationId: string,
    newStatus: ApplicationStatusType,
    options?: {
      note?: string;
      reason?: string;
      sendEmail?: boolean;
      customEmailSubject?: string;
      customEmailContent?: string;
      expectedVersion?: number;
      currentStatus?: ApplicationStatusType;
    },
  ) => {
    if (!accessToken) return;
    setUpdatingStatusId(applicationId);
    try {
      const { currentStatus, expectedVersion, ...restOptions } = options || {};
      const effectiveCurrentStatus =
        currentStatus || applications.find((a) => a._id === applicationId)?.status;
      let nextExpectedVersion = expectedVersion;

      if (
        effectiveCurrentStatus === 'PENDING' &&
        newStatus !== 'REVIEWING' &&
        newStatus !== 'REJECTED'
      ) {
        const viewed = await employerApi.markApplicationAsViewed(applicationId, accessToken);
        nextExpectedVersion =
          typeof viewed?.version === 'number' ? viewed.version : undefined;
      }

      if (newStatus === 'REVIEWING' && effectiveCurrentStatus === 'PENDING') {
        await employerApi.markApplicationAsViewed(applicationId, accessToken);
      } else {
        await employerApi.updateApplicationStatus(
          applicationId,
          newStatus,
          accessToken,
          {
            ...restOptions,
            expectedVersion: nextExpectedVersion,
          },
        );
      }

      const label = getStatusMeta(newStatus).label;
      success(`Đã cập nhật trạng thái hồ sơ: ${label}`);
      const refreshed = await fetchApplications();
      await onRefreshStats();
      if (viewingApp?._id === applicationId) {
        const updatedItem = refreshed.find((item) => item._id === applicationId);
        setViewingApp((prev) =>
          updatedItem || (prev ? { ...prev, status: newStatus } : null),
        );
      }
    } catch (err: any) {
      error(err.message || 'Cập nhật trạng thái thất bại');
    } finally {
      setUpdatingStatusId((prev) => (prev === applicationId ? null : prev));
    }
  };

  const handleStatusSelectChange = (
    app: ApplicationItem,
    nextStatus: ApplicationStatusType,
  ) => {
    if (!nextStatus || nextStatus === app.status) return;
    if (nextStatus === 'INTERVIEWING') {
      handleOpenInterview(app);
      return;
    }
    void handleUpdateStatus(app._id, nextStatus, {
      currentStatus: app.status,
      expectedVersion: app.version,
    });
  };

  const renderStatusSelect = (app: ApplicationItem, compact = false) => {
    const isTerminal = TERMINAL_STATUSES.has(app.status);
    const isUpdating = updatingStatusId === app._id;
    const statusMeta = getStatusMeta(app.status);
    const options = getStatusSelectOptions(app.status);

    return (
      <div className="relative inline-flex items-center">
        <select
          value={app.status}
          disabled={isTerminal || isUpdating}
          aria-label={`Trạng thái hồ sơ của ${app.userId?.name || 'ứng viên'}`}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) =>
            handleStatusSelectChange(app, e.target.value as ApplicationStatusType)
          }
          className={`appearance-none rounded-xl border font-bold transition focus:border-primary focus:outline-none ${
            compact ? 'py-1.5 pl-3 pr-7 text-xs' : 'py-2 pl-3.5 pr-8 text-xs'
          } ${statusMeta.selectClass} ${
            isTerminal || isUpdating
              ? 'cursor-not-allowed opacity-85'
              : 'cursor-pointer hover:brightness-95'
          }`}
        >
          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
              className="bg-white text-slate-900 dark:bg-slate-900 dark:text-white"
            >
              {option.label}
            </option>
          ))}
        </select>
        {!isTerminal && (
          <ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 opacity-70" />
        )}
      </div>
    );
  };

  const handleOpenAiRanking = async (jobId: string) => {
    if (!accessToken || !jobId) return;
    rankingRequest.current?.abort();
    const controller = new AbortController();
    rankingRequest.current = controller;
    setAiRankingJobId(jobId);
    setAiRankingData(null);
    setIsLoadingAiRank(true);
    setIsAiRankModalOpen(true);
    try {
      const res = await employerApi.getAIRankedCandidates(jobId, 15, accessToken, controller.signal);
      if (controller.signal.aborted) return;
      setAiRankingData(res);
    } catch (err: any) {
      if (controller.signal.aborted) return;
      console.error(err);
      error(err?.message || 'Không thể lấy kết quả phân tích AI');
    } finally {
      if (!controller.signal.aborted) setIsLoadingAiRank(false);
    }
  };

  const handleOpenAiRankingFromToolbar = () => {
    const targetJobId = selectedJobId !== 'ALL' ? selectedJobId : jobs[0]?._id;
    if (!targetJobId) {
      info('Cần có ít nhất 1 tin tuyển dụng đang hoạt động để chạy AI Xếp hạng.');
      return;
    }
    void handleOpenAiRanking(targetJobId);
  };

  const handleOpenRankedCandidateDetail = async (candidate: AIRankedCandidate) => {
    const existing = applications.find((item) => item._id === candidate.applicationId);
    if (existing) {
      closeRanking();
      void handleViewCv(existing);
      return;
    }
    if (!accessToken || !candidate.applicationId) return;
    try {
      const fetched = await employerApi.getApplicationDetail(candidate.applicationId, accessToken);
      closeRanking();
      void handleViewCv(fetched);
    } catch (err: any) {
      error(err?.message || 'Không thể tải chi tiết hồ sơ ứng viên');
    }
  };

  const handleOpenInterview = (app: ApplicationItem) => {
    setInterviewApp(app);
    const candidateName = app.userId?.name || 'Ứng viên';
    const jobName = app.jobId?.name || 'Vị trí tuyển dụng';
    const companyName = company?.name || 'Doanh nghiệp';

    setInterviewForm({
      sendEmail: true,
      customSubject: `[TalentPulse] Thông báo phỏng vấn vị trí ${jobName} - ${companyName}`,
      customContent: `Xin chào ${candidateName},\n\nCông ty ${companyName} xin thông báo hồ sơ của bạn cho vị trí ${jobName} đã được đánh giá phù hợp và chuyển sang giai đoạn phỏng vấn.\n\nBộ phận tuyển dụng sẽ sớm gửi lịch phỏng vấn chi tiết để bạn xác nhận thời gian tham gia.\n\nTrân trọng.`,
      note: 'Chuyển sang giai đoạn phỏng vấn',
    });
    setIsInterviewModalOpen(true);
  };

  const handleConfirmInterviewStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!interviewApp || !accessToken) return;

    setIsSubmittingInterview(true);
    try {
      await handleUpdateStatus(interviewApp._id, 'INTERVIEWING', {
        sendEmail: interviewForm.sendEmail,
        customEmailSubject: interviewForm.sendEmail
          ? interviewForm.customSubject.trim()
          : undefined,
        customEmailContent: interviewForm.sendEmail
          ? interviewForm.customContent.trim()
          : undefined,
        note: interviewForm.note.trim() || undefined,
        expectedVersion: interviewApp.version,
        currentStatus: interviewApp.status,
      });
      setIsInterviewModalOpen(false);
    } finally {
      setIsSubmittingInterview(false);
    }
  };

  const handleExportCSV = () => {
    if (!canExportAiScores || isLoading) return;
    if (applications.length === 0) {
      info(t('employer.candidatesTab.noCandidatesFound'));
      return;
    }

    const csvContent = applicationCsv(applications, t, formatDate);
    const url = URL.createObjectURL(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Bao_cao_ung_vien_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    success(t('employer.candidatesTab.exportCsvBtn'));
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'SUITABLE':
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/80">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Phù hợp</span>
          </span>
        );
      case 'INTERVIEWING':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary border border-primary/30 dark:bg-primary/20 dark:text-primary-light">
            <Calendar className="h-3.5 w-3.5 text-primary" />
            <span>Phỏng vấn</span>
          </span>
        );
      case 'CONSIDERING':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/80">
            <Bookmark className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            <span>{t('employer.dashboardTab.statusConsidering')}</span>
          </span>
        );
      case 'REVIEWING':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/80">
            <Eye className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            <span>{t('employer.dashboardTab.statusReviewing')}</span>
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/80">
            <XCircle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
            <span>{t('employer.dashboardTab.statusRejected')}</span>
          </span>
        );
      case 'WITHDRAWN':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
            <MinusCircle className="h-3.5 w-3.5 text-slate-500" />
            <span>Đã rút đơn</span>
          </span>
        );
      case 'PENDING':
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
            <Clock className="h-3.5 w-3.5 text-slate-500" />
            <span>{t('employer.dashboardTab.statusPending')}</span>
          </span>
        );
    }
  };

  const filteredApps = applications.filter((app) => {
    if (searchName.trim()) {
      const nameMatch = app.userId?.name?.toLowerCase().includes(searchName.toLowerCase());
      const emailMatch = app.userId?.email?.toLowerCase().includes(searchName.toLowerCase());
      if (!nameMatch && !emailMatch) return false;
    }
    return true;
  });

  if (!hasCompany) {
    return (
      <CompanyRequiredGate
        title="Quản lý Hồ sơ CV & Ứng viên"
        description="Danh sách hồ sơ ứng tuyển và tính năng AI Xếp hạng ứng viên chỉ hiển thị cho nhân sự thuộc về doanh nghiệp đã kích hoạt."
        onNavigateTab={onNavigateTab || (() => {})}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
            {t('employer.candidatesTab.title')}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            {t('employer.candidatesTab.subtitle')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={jobs.length === 0}
            onClick={handleOpenAiRankingFromToolbar}
            title={
              jobs.length === 0
                ? 'Cần có tin tuyển dụng đang hoạt động để chạy AI Xếp hạng'
                : 'Mở bảng AI xếp hạng mức độ phù hợp CV theo vị trí tuyển dụng'
            }
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent px-4 py-2 text-xs sm:text-sm font-bold text-white shadow-md shadow-primary/20 hover:opacity-95 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Sparkles className="h-4 w-4" />
            <span>{t('employer.candidatesTab.aiRankBtn')}</span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            disabled={!canExportAiScores || isLoading || applications.length === 0}
            title={t(!canExportAiScores ? 'employer.candidatesTab.exportAccessUnavailable' : 'employer.candidatesTab.exportScope')}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs sm:text-sm font-bold text-slate-700 hover:bg-slate-50 shadow-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 cursor-pointer"
          >
            <Download className="h-4 w-4 text-slate-500" />
            <span>{t('employer.candidatesTab.exportCsvBtn')}</span>
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        {t('employer.candidatesTab.exportScope')}
      </p>

      {/* 2. Filters Row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            placeholder={t('employer.candidatesTab.searchNamePlaceholder')}
            className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-sm text-slate-900 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>

        <div>
          <select
            value={selectedJobId}
            onChange={(e) => setSelectedJobId(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            <option value="ALL">{t('employer.candidatesTab.filterAllJobs')} ({jobs.length})</option>
            {jobs.map((job) => (
              <option key={job._id} value={job._id}>
                {job.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            <option value="ALL">Tất cả trạng thái ({applications.length})</option>
            <option value="PENDING">Chờ xử lý</option>
            <option value="REVIEWING">Đã xem CV</option>
            <option value="CONSIDERING">Cân nhắc</option>
            <option value="INTERVIEWING">Phỏng vấn</option>
            <option value="SUITABLE">Phù hợp</option>
            <option value="REJECTED">Chưa phù hợp</option>
            <option value="WITHDRAWN">Đã rút đơn</option>
          </select>
        </div>
      </div>

      {/* 3. Candidate Applications Table */}
      {isLoading ? (
        <div className="py-20 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="mt-2 text-xs text-slate-400">{t('employer.jobsTab.submittingBtn')}</p>
        </div>
      ) : filteredApps.length > 0 ? (
        <div className="overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700 dark:text-slate-300">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                <tr>
                  <th className="px-6 py-4">{t('employer.candidatesTab.colCandidate')}</th>
                  <th className="px-6 py-4">{t('employer.candidatesTab.colJob')}</th>
                  <th className="px-4 py-4 text-center">AI Matching</th>
                  <th className="px-6 py-4">{t('employer.candidatesTab.colApplyDate')}</th>
                  <th className="px-6 py-4 text-right">{t('employer.candidatesTab.colStatus')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredApps.map((app) => {
                  const aiBadge = getApplicationAiBadgeMeta(app.aiScore);
                  const jobTitle = app.jobId?.name || 'Tin tuyển dụng đã xóa';
                  const isJobDeleted = Boolean(app.jobId?.isDeleted || !app.jobId?.name);
                  return (
                    <tr
                      key={app._id}
                      onClick={() => void handleViewCv(app)}
                      className="group cursor-pointer transition hover:bg-primary/[0.04] dark:hover:bg-slate-800/50"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="relative h-10 w-10 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-sm shrink-0 border border-primary/20">
                            {app.userId?.avatar ? (
                              <img
                                src={app.userId.avatar}
                                alt={app.userId.name}
                                className="h-full w-full rounded-full object-cover"
                              />
                            ) : (
                              (app.userId?.name?.[0] || 'U').toUpperCase()
                            )}
                            {app.status === 'PENDING' && (
                              <span
                                title="Hồ sơ mới chưa xem"
                                className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white dark:ring-slate-900"
                              />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 group-hover:text-primary transition dark:text-white truncate">
                              {app.userId?.name || 'Ứng viên'}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {app.userId?.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-slate-900 dark:text-white">
                            {jobTitle}
                          </span>
                          {isJobDeleted && (
                            <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                              Tin đã xóa
                            </span>
                          )}
                        </div>
                        {(app.jobId?.level || app.jobId?.salary) && (
                          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            {[
                              app.jobId?.level,
                              app.jobId?.salary ? formatJobSalary(app.jobId.salary) : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-4 text-center whitespace-nowrap">
                        <span
                          title={aiBadge.title}
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${aiBadge.className}`}
                        >
                          {aiBadge.percentText !== null && (
                            <Sparkles className="h-3 w-3 shrink-0" />
                          )}
                          <span>{aiBadge.label}</span>
                        </span>
                      </td>

                      <td className="px-6 py-4 text-xs text-slate-500 dark:text-slate-400">
                        <div>{formatDateTime(app.createdAt)}</div>
                        <div className="mt-0.5 text-[11px] text-slate-400 group-hover:text-primary transition">
                          Nhấn để xem CV
                        </div>
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center justify-end gap-2"
                        >
                          {renderStatusSelect(app, true)}
                          <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-primary transition dark:text-slate-600" />
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
          <Users className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600 mb-3" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            {t('employer.candidatesTab.noCandidatesFound')}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            {t('employer.searchCvTab.noResultsDesc')}
          </p>
        </div>
      )}

      {/* 4. Candidate Full CV Detail Modal */}
      {createPortal(
        <AnimatePresence>
          {viewingApp && (
            <div
              onClick={() => setViewingApp(null)}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                onClick={(e) => e.stopPropagation()}
                className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-2xl dark:border-slate-800 dark:bg-slate-900 my-4 space-y-6"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5 dark:border-slate-800">
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary font-bold flex items-center justify-center text-lg shrink-0 border border-primary/20 overflow-hidden">
                      {viewingApp.userId?.avatar ? (
                        <img
                          src={viewingApp.userId.avatar}
                          alt={viewingApp.userId.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        (viewingApp.userId?.name?.[0] || 'U').toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                          {viewingApp.userId?.name || 'Ứng viên'}
                        </h3>
                        {renderStatusBadge(viewingApp.status)}
                        {(() => {
                          const detailAiBadge = getApplicationAiBadgeMeta(viewingApp.aiScore);
                          return (
                            <span
                              title={detailAiBadge.title}
                              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold ${detailAiBadge.className}`}
                            >
                              {detailAiBadge.percentText !== null && (
                                <Sparkles className="h-3 w-3 shrink-0" />
                              )}
                              <span>
                                {detailAiBadge.percentText !== null
                                  ? `Độ phù hợp AI: ${detailAiBadge.percentText}`
                                  : detailAiBadge.label}
                              </span>
                            </span>
                          );
                        })()}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                        {viewingApp.userId?.email && (
                          <a
                            href={`mailto:${viewingApp.userId.email}`}
                            className="inline-flex items-center gap-1.5 hover:text-primary transition"
                          >
                            <Mail className="h-3.5 w-3.5" />
                            <span>{viewingApp.userId.email}</span>
                          </a>
                        )}
                        {(formatGenderLabel(viewingApp.userId?.gender) ||
                          viewingApp.userId?.age) && (
                          <span className="inline-flex items-center gap-1.5">
                            <UserIcon className="h-3.5 w-3.5" />
                            <span>
                              {[
                                formatGenderLabel(viewingApp.userId?.gender),
                                viewingApp.userId?.age
                                  ? `${viewingApp.userId.age} tuổi`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          </span>
                        )}
                        {viewingApp.userId?.address && (
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5" />
                            <span>{viewingApp.userId.address}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setViewingApp(null)}
                    className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition dark:hover:bg-slate-800 cursor-pointer shrink-0"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Body Grid */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                  {/* Left column: Job metadata, CV parsed details, cover letter, history */}
                  <div className="space-y-5 lg:col-span-5">
                    {/* Applied Job Card */}
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                            {t('employer.candidatesTab.colJob')}
                          </div>
                          <div className="mt-0.5 text-sm font-bold text-slate-900 dark:text-white">
                            {viewingApp.jobId?.name || 'Tin tuyển dụng đã xóa'}
                          </div>
                        </div>
                        {(viewingApp.jobId?.isDeleted || !viewingApp.jobId?.name) && (
                          <span className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 shrink-0">
                            Tin đã xóa
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/70 text-xs dark:border-slate-700/70">
                        <div>
                          <span className="text-slate-400">Cấp bậc: </span>
                          <span className="font-semibold text-slate-700 dark:text-slate-200">
                            {viewingApp.jobId?.level || 'Chưa cập nhật'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400">Mức lương: </span>
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                            {formatJobSalary(viewingApp.jobId?.salary)}
                          </span>
                        </div>
                        {viewingApp.jobId?.workingModel && (
                          <div>
                            <span className="text-slate-400">Hình thức: </span>
                            <span className="font-semibold text-slate-700 dark:text-slate-200">
                              {viewingApp.jobId.workingModel}
                            </span>
                          </div>
                        )}
                        <div>
                          <span className="text-slate-400">Ngày nộp: </span>
                          <span className="font-semibold text-slate-700 dark:text-slate-200">
                            {formatDateTime(viewingApp.createdAt)}
                          </span>
                        </div>
                        {viewingApp.jobId?.location && (
                          <div className="col-span-2">
                            <span className="text-slate-400">Địa điểm: </span>
                            <span className="font-semibold text-slate-700 dark:text-slate-200">
                              {viewingApp.jobId.location}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* AI Matching Summary Card */}
                    {(() => {
                      const aiBadge = getApplicationAiBadgeMeta(viewingApp.aiScore);
                      return (
                        <div className="rounded-2xl border border-indigo-200/80 bg-indigo-50/40 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/20 space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                              <Sparkles className="h-4 w-4 text-primary" />
                              <span>Đánh giá AI Matching</span>
                            </div>
                            <span
                              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${aiBadge.className}`}
                            >
                              {aiBadge.label}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                            {aiBadge.title}.
                          </p>
                          {!viewingApp.jobId?.isDeleted && viewingApp.jobId?._id && (
                            <button
                              type="button"
                              onClick={() => {
                                const targetJobId = viewingApp.jobId._id;
                                setViewingApp(null);
                                void handleOpenAiRanking(targetJobId);
                              }}
                              className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline cursor-pointer"
                            >
                              <Sparkles className="h-3.5 w-3.5" />
                              <span>Mở bảng AI Xếp hạng & phân tích chi tiết của vị trí này</span>
                            </button>
                          )}
                        </div>
                      );
                    })()}

                    {/* Extracted CV Highlights */}
                    {(viewingApp.cvId?.skills?.length ||
                      viewingApp.cvId?.experience?.length ||
                      viewingApp.cvId?.education?.length ||
                      viewingApp.cvId?.certificates?.length) ? (
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/60 space-y-3.5">
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          Thông tin trích xuất từ CV
                        </div>

                        {viewingApp.cvId?.skills && viewingApp.cvId.skills.length > 0 && (
                          <div>
                            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 mb-1.5">
                              <Briefcase className="h-3.5 w-3.5 text-primary" />
                              <span>Kỹ năng</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {viewingApp.cvId.skills.slice(0, 14).map((skill) => (
                                <span
                                  key={skill}
                                  className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                >
                                  {skill}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {viewingApp.cvId?.experience && viewingApp.cvId.experience.length > 0 && (
                          <div>
                            <div className="text-[11px] font-semibold text-slate-500 mb-1">
                              Kinh nghiệm
                            </div>
                            <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300 list-disc pl-4">
                              {viewingApp.cvId.experience.slice(0, 4).map((item, idx) => (
                                <li key={`${idx}-${item}`}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {viewingApp.cvId?.education && viewingApp.cvId.education.length > 0 && (
                          <div>
                            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 mb-1">
                              <GraduationCap className="h-3.5 w-3.5 text-primary" />
                              <span>Học vấn</span>
                            </div>
                            <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300 list-disc pl-4">
                              {viewingApp.cvId.education.slice(0, 3).map((item, idx) => (
                                <li key={`${idx}-${item}`}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {viewingApp.cvId?.certificates && viewingApp.cvId.certificates.length > 0 && (
                          <div>
                            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 mb-1">
                              <Award className="h-3.5 w-3.5 text-amber-500" />
                              <span>Chứng chỉ</span>
                            </div>
                            <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300 list-disc pl-4">
                              {viewingApp.cvId.certificates.slice(0, 3).map((item, idx) => (
                                <li key={`${idx}-${item}`}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ) : null}

                    {/* Cover Letter */}
                    {viewingApp.coverLetter && (
                      <div className="space-y-1.5">
                        <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          {t('employer.candidatesTab.modalCvCoverLetter')}
                        </h4>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 text-xs text-slate-700 leading-relaxed whitespace-pre-line dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300">
                          {viewingApp.coverLetter}
                        </div>
                      </div>
                    )}

                    {/* Withdraw reason if withdrawn */}
                    {viewingApp.withdrawReason && (
                      <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-3.5 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300">
                        <span className="font-bold">Lý do rút đơn: </span>
                        {viewingApp.withdrawReason}
                      </div>
                    )}

                    {/* Status History Timeline */}
                    {viewingApp.history && viewingApp.history.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          Lịch sử xử lý hồ sơ
                        </h4>
                        <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/50 p-3.5 dark:border-slate-800 dark:bg-slate-800/30">
                          {viewingApp.history.map((entry, idx) => (
                            <div
                              key={`${entry.status}-${entry.updatedAt}-${idx}`}
                              className="flex items-start justify-between gap-2 text-xs border-b last:border-b-0 border-slate-200/70 pb-2 last:pb-0 dark:border-slate-700/60"
                            >
                              <div className="min-w-0">
                                <div className="font-bold text-slate-800 dark:text-slate-200">
                                  {getStatusMeta(entry.status as ApplicationStatusType).label}
                                </div>
                                {(entry.note || entry.reason) && (
                                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                    {entry.note || entry.reason}
                                  </div>
                                )}
                                {entry.updatedBy?.email && (
                                  <div className="text-[11px] text-slate-400">
                                    Bởi {entry.updatedBy.email}
                                  </div>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 shrink-0">
                                {formatDateTime(entry.updatedAt)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right column: Attached CV & Inline Preview */}
                  <div className="space-y-3 lg:col-span-7">
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="h-8 w-8 text-primary shrink-0" />
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                            {viewingApp.cvId?.title || 'CV ứng viên'}
                          </div>
                          <div className="text-xs text-slate-500">
                            {viewingApp.cvId?.onlineCvId
                              ? 'CV tạo trên TalentPulse'
                              : `Tài liệu ${(viewingApp.cvId?.fileType || 'PDF').toUpperCase()}`}
                          </div>
                        </div>
                      </div>

                      {isPreviewableUrl(viewingApp.cvId?.url) && (
                        <a
                          href={viewingApp.cvId.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-primary-dark transition shrink-0"
                        >
                          <span>{t('employer.candidatesTab.modalCvDownload')}</span>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>

                    {isPreviewableUrl(viewingApp.cvId?.url) ? (
                      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
                        <iframe
                          src={viewingApp.cvId.url}
                          title={viewingApp.cvId?.title || 'Xem trước CV'}
                          className="h-[460px] w-full bg-white"
                        />
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                        Không có tệp PDF xem trước trực tiếp cho hồ sơ này.
                      </div>
                    )}
                  </div>
                </div>

                {/* Status Update & Footer Action Bar */}
                <div className="border-t border-slate-100 pt-5 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Trạng thái hồ sơ:
                    </span>
                    {renderStatusSelect(viewingApp)}
                    {getAvailableStatusTargets(viewingApp.status).includes('INTERVIEWING') && (
                      <button
                        type="button"
                        onClick={() => handleOpenInterview(viewingApp)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-primary-dark transition cursor-pointer"
                      >
                        <Video className="h-4 w-4" />
                        <span>{t('employer.candidatesTab.btnInviteInterview')}</span>
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setViewingApp(null)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white cursor-pointer"
                  >
                    Đóng
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* 5. AI Ranking Modal */}
      {createPortal(
        <AnimatePresence>
          {isAiRankModalOpen && (
            <div
              onClick={closeRanking}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onClick={(e) => e.stopPropagation()}
                className="relative w-full max-w-4xl rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-2xl dark:border-slate-800 dark:bg-slate-900 my-8 space-y-5"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-white shadow-md shadow-primary/25 shrink-0">
                      <Sparkles className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                        {t('employer.candidatesTab.modalAiRankTitle')}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {t('employer.candidatesTab.modalAiRankDesc')} &bull;{' '}
                        <span className="font-bold text-primary">
                          {aiRankingData?.jobName ||
                            jobs.find((j) => j._id === aiRankingJobId)?.name ||
                            'Đang tải'}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {jobs.length > 0 && (
                      <select
                        value={aiRankingJobId || aiRankingData?.jobId || ''}
                        onChange={(e) => {
                          if (e.target.value) void handleOpenAiRanking(e.target.value);
                        }}
                        aria-label="Chọn tin tuyển dụng để xếp hạng AI"
                        className="max-w-[230px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      >
                        {jobs.map((job) => (
                          <option key={job._id} value={job._id}>
                            {job.name}
                          </option>
                        ))}
                      </select>
                    )}

                    <button
                      type="button"
                      disabled={isLoadingAiRank || !aiRankingJobId}
                      onClick={() => aiRankingJobId && void handleOpenAiRanking(aiRankingJobId)}
                      title="Làm mới kết quả xếp hạng AI"
                      className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-100 hover:text-primary transition dark:border-slate-700 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`h-4 w-4 ${isLoadingAiRank ? 'animate-spin' : ''}`} />
                    </button>

                    <button
                      type="button"
                      onClick={closeRanking}
                      className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                {!isLoadingAiRank && aiRankingData && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-800/40">
                    <div className="flex flex-wrap items-center gap-3 text-slate-600 dark:text-slate-300">
                      <span>
                        Tổng hồ sơ: <strong className="text-slate-900 dark:text-white">{aiRankingData.totalApplications}</strong>
                      </span>
                      {aiRankingData.processingStatus && (
                        <>
                          <span>
                            Đã chấm AI: <strong className="text-emerald-600 dark:text-emerald-400">{aiRankingData.processingStatus.completed}</strong>
                          </span>
                          {(aiRankingData.processingStatus.processing + aiRankingData.processingStatus.pending) > 0 && (
                            <span className="rounded-md bg-blue-50 px-2 py-0.5 font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                              Đang xử lý: {aiRankingData.processingStatus.processing + aiRankingData.processingStatus.pending}
                            </span>
                          )}
                          {(aiRankingData.processingStatus.stale ?? 0) > 0 && (
                            <span className="rounded-md bg-amber-50 px-2 py-0.5 font-semibold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                              Cần cập nhật: {aiRankingData.processingStatus.stale}
                            </span>
                          )}
                          {aiRankingData.processingStatus.failed > 0 && (
                            <span className="rounded-md bg-rose-50 px-2 py-0.5 font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                              Lỗi: {aiRankingData.processingStatus.failed}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400">
                      Cập nhật: {formatDateTime(aiRankingData.processedAt)}
                    </span>
                  </div>
                )}

                {isLoadingAiRank ? (
                  <div className="py-20 text-center">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                    <p className="mt-2 text-xs text-slate-400">{t('employer.candidatesTab.modalAiRankLoading')}</p>
                  </div>
                ) : aiRankingData?.rankedCandidates && aiRankingData.rankedCandidates.length > 0 ? (
                  <div className="space-y-3.5 max-h-[60vh] overflow-y-auto pr-1">
                    {aiRankingData.rankedCandidates.map((candidate, idx) => {
                      const scoreText = analysisPercent(candidate.matchScore);
                      const scoreNumeric = Math.max(0, Math.min(100, Math.round((candidate.matchScore || 0) * 100)));
                      const semanticStat = analysisComponent(candidate.aiAnalysis?.components?.semantic);
                      const skillsStat = analysisComponent(candidate.aiAnalysis?.components?.skills);
                      const experienceStat = analysisComponent(candidate.aiAnalysis?.components?.experience);

                      return (
                        <div
                          key={candidate.applicationId}
                          className="rounded-2xl border border-slate-200/90 bg-slate-50/70 p-4 transition hover:border-primary/40 dark:border-slate-800 dark:bg-slate-800/40 space-y-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <span
                                className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-black shrink-0 ${
                                  idx === 0
                                    ? 'bg-amber-500 text-white'
                                    : idx === 1
                                    ? 'bg-slate-300 text-slate-800'
                                    : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                                }`}
                              >
                                #{idx + 1}
                              </span>
                              <div className="h-9 w-9 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs shrink-0 overflow-hidden border border-primary/20">
                                {candidate.candidateAvatar ? (
                                  <img
                                    src={candidate.candidateAvatar}
                                    alt={candidate.candidateName}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  (candidate.candidateName?.[0] || 'U').toUpperCase()
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                                    {candidate.candidateName}
                                  </h4>
                                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                    {getStatusMeta(candidate.applicationStatus as ApplicationStatusType).label}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-500 truncate">
                                  {candidate.candidateEmail} &bull; Nộp lúc {formatDateTime(candidate.appliedAt)}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2.5 shrink-0">
                              <div className="text-right">
                                <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                                  {scoreText ?? t('employer.candidatesTab.analysis.unavailable')} {t('employer.candidatesTab.aiMatchScore')}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => void handleOpenRankedCandidateDetail(candidate)}
                                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:border-primary hover:text-primary transition dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
                              >
                                Xem hồ sơ
                              </button>
                              {candidate.cvUrl && isPreviewableUrl(candidate.cvUrl) && (
                                <a
                                  href={candidate.cvUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="rounded-lg bg-primary/10 p-1.5 text-primary hover:bg-primary hover:text-white transition"
                                  title={t('employer.candidatesTab.modalCvDownload')}
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              )}
                            </div>
                          </div>

                          {/* Overall score meter */}
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-700">
                            <div
                              className={`h-full rounded-full transition-all ${
                                scoreNumeric >= 75
                                  ? 'bg-emerald-500'
                                  : scoreNumeric >= 50
                                  ? 'bg-primary'
                                  : 'bg-amber-500'
                              }`}
                              style={{ width: `${scoreNumeric}%` }}
                            />
                          </div>

                          {/* Component metrics & skills breakdown for Premium HR */}
                          {candidate.analysisAvailable && (
                            <div className="space-y-2">
                              {candidate.aiAnalysis && (
                                <div className="grid grid-cols-3 gap-2 text-xs">
                                  <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900/70">
                                    <div className="text-[11px] text-slate-500">{t('employer.candidatesTab.analysis.semantic')}</div>
                                    <div className="font-bold text-slate-900 dark:text-white">
                                      {semanticStat.score ?? 'Chưa có'}
                                    </div>
                                  </div>
                                  <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900/70">
                                    <div className="text-[11px] text-slate-500">{t('employer.candidatesTab.analysis.skills')}</div>
                                    <div className="font-bold text-slate-900 dark:text-white">
                                      {skillsStat.score ?? 'Chưa có'}
                                    </div>
                                  </div>
                                  <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900/70">
                                    <div className="text-[11px] text-slate-500">{t('employer.candidatesTab.analysis.experience')}</div>
                                    <div className="font-bold text-slate-900 dark:text-white">
                                      {experienceStat.score ?? 'Chưa có'}
                                    </div>
                                  </div>
                                </div>
                              )}

                              {(candidate.matchedSkills?.length > 0 || candidate.missingSkills?.length > 0) && (
                                <div className="flex flex-wrap gap-1.5">
                                  {candidate.matchedSkills?.map((skill) => (
                                    <span
                                      key={`m-${skill}`}
                                      className="rounded-md bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:border-emerald-800/70 dark:text-emerald-300"
                                    >
                                      + {skill}
                                    </span>
                                  ))}
                                  {candidate.missingSkills?.map((skill) => (
                                    <span
                                      key={`g-${skill}`}
                                      className="rounded-md bg-rose-50 border border-rose-200/80 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-950/50 dark:border-rose-800/70 dark:text-rose-300"
                                    >
                                      Thiếu: {skill}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Explanation & Skills */}

                          {!candidate.analysisAvailable ? (
                            <div className="text-xs text-slate-600 dark:text-slate-300">
                              <p>{t('employer.candidatesTab.aiAnalysisLocked')}</p>
                              {onNavigateTab && <button type="button" onClick={() => { closeRanking(); onNavigateTab('premium'); }} className="mt-2 font-bold text-primary underline">{t('employer.searchCvTab.upgradeAdvanced')}</button>}
                            </div>
                          ) : candidate.analysisVersionKey && accessToken ? <CandidateNarrative
                            key={`${aiRankingData.jobId}/${candidate.applicationId}/${candidate.analysisVersionKey}/${locale}`}
                            jobId={aiRankingData.jobId} applicationId={candidate.applicationId}
                            version={candidate.analysisVersionKey} locale={locale} accessToken={accessToken}
                            aiAnalysis={candidate.aiAnalysis}
                            onForbidden={() => { closeRanking(); error(t('employer.candidatesTab.aiAnalysisLocked')); }}
                            onRefresh={() => void handleOpenAiRanking(aiRankingData.jobId)}
                          /> : <p className="text-xs text-slate-500">{t('employer.candidatesTab.narrative.refresh')}</p>}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-12 text-center space-y-2">
                    <Sparkles className="mx-auto h-9 w-9 text-slate-300 dark:text-slate-600" />
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                      {aiRankingData?.totalApplications === 0
                        ? 'Tin tuyển dụng này chưa có hồ sơ ứng tuyển nào'
                        : (aiRankingData?.processingStatus?.processing || 0) +
                            (aiRankingData?.processingStatus?.pending || 0) >
                          0
                        ? 'Hệ thống đang phân tích và chấm điểm AI cho các hồ sơ'
                        : 'Chưa có ứng viên nào có điểm AI khả dụng cho tin này'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                      {aiRankingData?.totalApplications === 0
                        ? 'Khi có ứng viên nộp hồ sơ vào vị trí này, kết quả chấm điểm AI sẽ tự động xuất hiện.'
                        : 'Chỉ các hồ sơ có sự đồng ý chấm điểm AI từ ứng viên, đang ở trạng thái Chờ xử lý / Đã xem / Cân nhắc / Phù hợp và tin chưa chỉnh sửa sau khi chấm mới xuất hiện trong bảng xếp hạng.'}
                    </p>
                  </div>
                )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* 6. Interview Modal */}
      {createPortal(
        <AnimatePresence>
          {isInterviewModalOpen && interviewApp && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs overflow-y-auto">
              <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-2xl dark:border-slate-800 dark:bg-slate-900 my-8 space-y-6"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-primary/10 text-primary dark:bg-primary/20">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Chuyển sang giai đoạn Phỏng vấn
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {interviewApp.userId?.name} ({interviewApp.userId?.email}) • {interviewApp.jobId?.name}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsInterviewModalOpen(false)}
                  className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleConfirmInterviewStatus} className="space-y-4 text-xs">
                {/* Email toggle */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                  <label className="flex items-center gap-2.5 font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={interviewForm.sendEmail}
                      onChange={(e) =>
                        setInterviewForm((prev) => ({
                          ...prev,
                          sendEmail: e.target.checked,
                        }))
                      }
                      className="rounded text-primary focus:ring-primary h-4 w-4"
                    />
                    <span>Gửi email thông báo mời phỏng vấn đến ứng viên</span>
                  </label>

                  {interviewForm.sendEmail && (
                    <div className="mt-3 space-y-3 pt-3 border-t border-slate-200/80 dark:border-slate-700/80">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                          Tiêu đề email
                        </label>
                        <input
                          type="text"
                          required={interviewForm.sendEmail}
                          value={interviewForm.customSubject}
                          onChange={(e) =>
                            setInterviewForm((prev) => ({
                              ...prev,
                              customSubject: e.target.value,
                            }))
                          }
                          className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-900 focus:border-primary focus:outline-hidden dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                          Nội dung email
                        </label>
                        <textarea
                          rows={4}
                          required={interviewForm.sendEmail}
                          value={interviewForm.customContent}
                          onChange={(e) =>
                            setInterviewForm((prev) => ({
                              ...prev,
                              customContent: e.target.value,
                            }))
                          }
                          className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-900 focus:border-primary focus:outline-hidden dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Ghi chú nội bộ
                  </label>
                  <input
                    type="text"
                    value={interviewForm.note}
                    onChange={(e) =>
                      setInterviewForm((prev) => ({
                        ...prev,
                        note: e.target.value,
                      }))
                    }
                    placeholder="Ghi chú đánh giá vòng hồ sơ..."
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-900 focus:border-primary focus:outline-hidden dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                  {onNavigateTab && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsInterviewModalOpen(false);
                        onNavigateTab('calendar');
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline cursor-pointer"
                    >
                      <Calendar className="h-4 w-4" />
                      <span>Mở Lịch phỏng vấn</span>
                    </button>
                  )}

                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      type="button"
                      onClick={() => setIsInterviewModalOpen(false)}
                      className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingInterview}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2 text-xs font-bold text-white shadow-md shadow-primary/25 hover:bg-primary-dark transition disabled:opacity-50 cursor-pointer"
                    >
                      {isSubmittingInterview ? (
                        <span>Đang xử lý...</span>
                      ) : (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Xác nhận chuyển trạng thái</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>,
      document.body
    )}
    </div>
  );
}
