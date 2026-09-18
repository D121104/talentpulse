import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  const { t } = useTranslation();
  const { success, error, info } = useToast();

  const [applications, setApplications] = useState<ApplicationItem[]>([]);
  const [jobs, setJobs] = useState<HrJobItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Filters
  const [selectedJobId, setSelectedJobId] = useState<string>(filterJobId || 'ALL');
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'PENDING' | 'REVIEWING' | 'CONSIDERING' | 'INTERVIEWING' | 'SUITABLE' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN'
  >('ALL');
  const [searchName, setSearchName] = useState('');

  // Modals & Active items
  const [viewingApp, setViewingApp] = useState<ApplicationItem | null>(null);

  // AI Rank Modal
  const [isAiRankModalOpen, setIsAiRankModalOpen] = useState(false);
  const [aiRankingData, setAiRankingData] = useState<{
    jobId: string;
    jobName: string;
    totalApplications: number;
    rankedCandidates: AIRankedCandidate[];
    processedAt: string;
  } | null>(null);
  const [isLoadingAiRank, setIsLoadingAiRank] = useState(false);

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

  const fetchApplications = async () => {
    if (!accessToken || !hasCompany) {
      setApplications([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      if (selectedJobId && selectedJobId !== 'ALL') {
        const res = await employerApi.getApplicationsByJob(
          selectedJobId,
          { status: statusFilter === 'ALL' ? undefined : statusFilter, pageSize: 50 },
          accessToken,
        );
        setApplications(res.result || []);
      } else {
        const res = await employerApi.getApplications(
          { status: statusFilter === 'ALL' ? undefined : statusFilter, pageSize: 50 },
          accessToken,
        );
        setApplications(res.result || []);
      }
    } catch (err) {
      console.error('Failed to load applications', err);
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

  // When HR clicks View CV: transitions PENDING to REVIEWING & triggers socket notification to applicant
  const handleViewCv = async (app: ApplicationItem) => {
    setViewingApp(app);
    if (app.status === 'PENDING' && accessToken) {
      try {
        await employerApi.markApplicationAsViewed(app._id, accessToken);
        setApplications((prev) =>
          prev.map((item) =>
            item._id === app._id ? { ...item, status: 'REVIEWING' } : item,
          ),
        );
        setViewingApp((prev) => (prev ? { ...prev, status: 'REVIEWING' } : null));
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
    },
  ) => {
    if (!accessToken) return;
    try {
      await employerApi.updateApplicationStatus(
        applicationId,
        newStatus,
        accessToken,
        options,
      );
      const label =
        newStatus === 'SUITABLE' || newStatus === 'APPROVED'
          ? 'PHÙ HỢP'
          : newStatus === 'CONSIDERING'
          ? 'CÂN NHẮC'
          : newStatus === 'INTERVIEWING'
          ? 'PHỎNG VẤN'
          : newStatus === 'REJECTED'
          ? 'CHƯA PHÙ HỢP'
          : newStatus;
      success(`Đã cập nhật trạng thái hồ sơ: ${label}`);
      await fetchApplications();
      await onRefreshStats();
      if (viewingApp?._id === applicationId) {
        setViewingApp((prev) => (prev ? { ...prev, status: newStatus } : null));
      }
    } catch (err: any) {
      error(err.message || 'Cập nhật trạng thái thất bại');
    }
  };

  const handleOpenAiRanking = async (jobId: string) => {
    if (!accessToken) return;
    setIsLoadingAiRank(true);
    setIsAiRankModalOpen(true);
    try {
      const res = await employerApi.getAIRankedCandidates(jobId, 15, accessToken);
      setAiRankingData(res);
    } catch (err: any) {
      console.error(err);
      error('Không thể lấy kết quả phân tích AI');
    } finally {
      setIsLoadingAiRank(false);
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
      });
      setIsInterviewModalOpen(false);
    } finally {
      setIsSubmittingInterview(false);
    }
  };

  const handleExportCSV = () => {
    if (applications.length === 0) {
      info(t('employer.candidatesTab.noCandidatesFound'));
      return;
    }

    const headers = ['Họ tên', 'Email', 'Vị trí nộp', 'Trạng thái', 'Ngày nộp', 'Link CV'];
    const rows = applications.map((app) => [
      `"${app.userId?.name || ''}"`,
      `"${app.userId?.email || ''}"`,
      `"${app.jobId?.name || ''}"`,
      app.status,
      formatDate(app.createdAt),
      `"${app.cvId?.url || ''}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Bao_cao_ung_vien_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

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
          {selectedJobId !== 'ALL' && (
            <button
              type="button"
              onClick={() => handleOpenAiRanking(selectedJobId)}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent px-4 py-2 text-xs sm:text-sm font-bold text-white shadow-md shadow-primary/20 hover:opacity-95 transition cursor-pointer"
            >
              <Sparkles className="h-4 w-4" />
              <span>{t('employer.candidatesTab.aiRankBtn')}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs sm:text-sm font-bold text-slate-700 hover:bg-slate-50 shadow-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 cursor-pointer"
          >
            <Download className="h-4 w-4 text-slate-500" />
            <span>{t('employer.candidatesTab.exportCsvBtn')}</span>
          </button>
        </div>
      </div>

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
                  <th className="px-6 py-4">{t('employer.candidatesTab.colApplyDate')}</th>
                  <th className="px-6 py-4 text-center">{t('employer.candidatesTab.colStatus')}</th>
                  <th className="px-6 py-4 text-right">{t('employer.candidatesTab.colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredApps.map((app) => (
                  <tr
                    key={app._id}
                    className="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-sm shrink-0 border border-primary/20">
                          {app.userId?.avatar ? (
                            <img src={app.userId.avatar} alt={app.userId.name} className="h-full w-full rounded-full object-cover" />
                          ) : (
                            (app.userId?.name?.[0] || 'U').toUpperCase()
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white">
                            {app.userId?.name || 'Candidate'}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {app.userId?.email}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900 dark:text-white">
                        {app.jobId?.name || 'Job Position'}
                      </div>
                    </td>

                    <td className="px-6 py-4 text-xs text-slate-500 dark:text-slate-400">
                      {formatDateTime(app.createdAt)}
                    </td>

                    <td className="px-6 py-4 text-center">
                      {renderStatusBadge(app.status)}
                    </td>

                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleViewCv(app)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-primary/10 px-3.5 py-1.5 text-xs font-bold text-primary hover:bg-primary hover:text-white transition cursor-pointer"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>{t('employer.candidatesTab.btnViewCv')}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(app._id, 'CONSIDERING')}
                          className="rounded-lg p-1.5 text-amber-600 hover:bg-amber-50 transition dark:hover:bg-amber-950/40 cursor-pointer"
                          title="Đánh giá cân nhắc"
                        >
                          <Bookmark className="h-4 w-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenInterview(app)}
                          className="rounded-lg p-1.5 text-primary hover:bg-primary/10 transition cursor-pointer"
                          title="Chuyển sang phỏng vấn & gửi email"
                        >
                          <Calendar className="h-4 w-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(app._id, 'SUITABLE')}
                          className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50 transition dark:hover:bg-emerald-950/40 cursor-pointer"
                          title="Đánh giá phù hợp"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(app._id, 'REJECTED')}
                          className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 transition dark:hover:bg-rose-950/40 cursor-pointer"
                          title="Đánh giá chưa phù hợp"
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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

      {/* 4. Candidate Full CV Detail Modal with 3 Assessment Actions */}
      {createPortal(
        <AnimatePresence>
          {viewingApp && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs overflow-y-auto">
              <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-2xl dark:border-slate-800 dark:bg-slate-900 my-8 space-y-6"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-base shrink-0">
                    {(viewingApp.userId?.name?.[0] || 'U').toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                      {viewingApp.userId?.name}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {viewingApp.userId?.email}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setViewingApp(null)}
                  className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Applied Job Info & Current Status */}
              <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-slate-500">{t('employer.candidatesTab.colJob')}:</div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    {viewingApp.jobId?.name}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-xs text-slate-500">{t('employer.candidatesTab.colApplyDate')}:</div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {formatDateTime(viewingApp.createdAt)}
                    </div>
                  </div>
                  <div>
                    {renderStatusBadge(viewingApp.status)}
                  </div>
                </div>
              </div>

              {/* Cover Letter */}
              {viewingApp.coverLetter && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {t('employer.candidatesTab.modalCvCoverLetter')}
                  </h4>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 text-xs text-slate-700 leading-relaxed dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300">
                    {viewingApp.coverLetter}
                  </div>
                </div>
              )}

              {/* Attached CV File Preview Link */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {t('employer.candidatesTab.modalCvAttachment')}
                </h4>
                <div className="flex items-center justify-between rounded-2xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">
                  <div className="flex items-center gap-3">
                    <FileText className="h-8 w-8 text-primary" />
                    <div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white">
                        {viewingApp.cvId?.title || 'CV Resume'}
                      </div>
                      <div className="text-xs text-slate-500">TalentPulse Verified CV</div>
                    </div>
                  </div>

                  {viewingApp.cvId?.url && (
                    <a
                      href={viewingApp.cvId.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-primary-dark transition"
                    >
                      <span>{t('employer.candidatesTab.modalCvDownload')}</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </div>

              {/* Status Update & Evaluation Action Bar */}
              <div className="border-t border-slate-100 pt-5 dark:border-slate-800 space-y-3">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {t('employer.candidatesTab.evaluationHeader')}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(viewingApp._id, 'CONSIDERING')}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition shadow-xs cursor-pointer ${
                        viewingApp.status === 'CONSIDERING'
                          ? 'bg-amber-500 text-white shadow-amber-500/20'
                          : 'border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                      }`}
                    >
                      <Bookmark className="h-4 w-4" />
                      <span>{t('employer.candidatesTab.btnConsider')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenInterview(viewingApp)}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition shadow-xs cursor-pointer ${
                        viewingApp.status === 'INTERVIEWING'
                          ? 'bg-primary text-white shadow-primary/20'
                          : 'border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20'
                      }`}
                    >
                      <Calendar className="h-4 w-4" />
                      <span>Phỏng vấn & Gửi email</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(viewingApp._id, 'SUITABLE')}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition shadow-xs cursor-pointer ${
                        viewingApp.status === 'SUITABLE' || viewingApp.status === 'APPROVED'
                          ? 'bg-emerald-600 text-white shadow-emerald-600/20'
                          : 'border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                      }`}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Phù hợp</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(viewingApp._id, 'REJECTED')}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition shadow-xs cursor-pointer ${
                        viewingApp.status === 'REJECTED'
                          ? 'bg-rose-600 text-white shadow-rose-600/20'
                          : 'border border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
                      }`}
                    >
                      <XCircle className="h-4 w-4" />
                      <span>Chưa phù hợp</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenInterview(viewingApp)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-primary-dark transition cursor-pointer"
                    >
                      <Video className="h-4 w-4" />
                      <span>{t('employer.candidatesTab.btnInviteInterview')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setViewingApp(null)}
                      className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white cursor-pointer"
                    >
                      {t('employer.jobsTab.cancelBtn')}
                    </button>
                  </div>
                </div>
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
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs overflow-y-auto">
              <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-2xl dark:border-slate-800 dark:bg-slate-900 my-8 space-y-6"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-white shadow-md shadow-primary/25">
                    <Sparkles className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                      {t('employer.candidatesTab.modalAiRankTitle')}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {t('employer.candidatesTab.modalAiRankDesc')} &bull; <span className="font-bold text-primary">{aiRankingData?.jobName || 'Analysis'}</span>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsAiRankModalOpen(false)}
                  className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {isLoadingAiRank ? (
                <div className="py-20 text-center">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                  <p className="mt-2 text-xs text-slate-400">{t('employer.searchCvTab.searchingBtn')}</p>
                </div>
              ) : aiRankingData?.rankedCandidates && aiRankingData.rankedCandidates.length > 0 ? (
                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                  {aiRankingData.rankedCandidates.map((candidate, idx) => (
                    <div
                      key={candidate.applicationId}
                      className="rounded-2xl border border-slate-200/90 bg-slate-50/70 p-4 transition hover:border-primary/40 dark:border-slate-800 dark:bg-slate-800/40 space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span
                            className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-black ${
                              idx === 0
                                ? 'bg-amber-500 text-white'
                                : idx === 1
                                ? 'bg-slate-300 text-slate-800'
                                : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                            }`}
                          >
                            #{idx + 1}
                          </span>
                          <div>
                            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                              {candidate.candidateName}
                            </h4>
                            <p className="text-xs text-slate-500">{candidate.candidateEmail}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                              {Math.round(candidate.matchScore * 100)}% {t('employer.candidatesTab.aiMatchScore')}
                            </span>
                          </div>
                          {candidate.cvUrl && (
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

                      {/* Explanation & Skills */}
                      {candidate.shortExplanation && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 italic bg-white/70 dark:bg-slate-900/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                          &ldquo;{candidate.shortExplanation}&rdquo;
                        </p>
                      )}

                      <div className="flex flex-wrap gap-1">
                        {candidate.matchedSkills.map((sk) => (
                          <span
                            key={sk}
                            className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          >
                            +{sk}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-slate-400">
                  <p className="text-sm">{t('employer.candidatesTab.noCandidatesFound')}</p>
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

