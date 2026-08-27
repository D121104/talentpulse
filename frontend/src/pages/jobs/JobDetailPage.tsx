import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Building2,
  MapPin,
  Briefcase,
  Clock,
  Users,
  Sparkles,
  Flame,
  Zap,
  Share2,
  ArrowLeft,
  CheckCircle2,
  Send,
  Loader2,
  ExternalLink,
  ChevronRight,
  GraduationCap,
  BellRing,
  Heart,
  Eye,
  FileText,
  Calculator,
} from 'lucide-react';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import JobApplyModal from '../../components/jobs/JobApplyModal';
import JobHtmlDescription from '../../components/jobs/JobHtmlDescription';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  JobItem,
  getJobDetailApi,
  getRelatedJobsApi,
  formatSalary,
  formatLocation,
  formatDaysRemaining,
  getCompanyInitial,
} from '../../lib/jobApi';
import { apiRequest } from '../../lib/api';

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { accessToken } = useAuth();
  const { success, info } = useToast();

  const [job, setJob] = useState<JobItem | null>(null);
  const [relatedJobs, setRelatedJobs] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [appliedInfo, setAppliedInfo] = useState<{ applied: boolean; date?: string } | null>(null);

  // Apply Modal
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [applyingRelatedJob, setApplyingRelatedJob] = useState<JobItem | null>(null);

  // Saved state
  const [isSaved, setIsSaved] = useState(false);
  const [savedJobIds, setSavedJobIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('talentpulse_saved_jobs');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (id) {
      loadJobData(id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [id]);

  const loadJobData = async (jobId: string) => {
    try {
      setLoading(true);
      const [jobData, relatedList] = await Promise.all([
        getJobDetailApi(jobId, accessToken),
        getRelatedJobsApi(jobId, 6, accessToken).catch(() => []),
      ]);

      setJob(jobData);
      setRelatedJobs(relatedList || []);

      // Check saved
      try {
        const saved = localStorage.getItem('talentpulse_saved_jobs');
        if (saved) {
          const list: string[] = JSON.parse(saved);
          setIsSaved(list.includes(jobId));
          setSavedJobIds(list);
        }
      } catch {
        // Ignore
      }

      // Check if user applied to this job
      if (accessToken) {
        try {
          const apps = await apiRequest<any[]>('/applications/my-applications', {
            accessToken,
          });
          if (Array.isArray(apps)) {
            const currentApp = apps.find(
              (a) => (a.job?._id || a.jobId?._id || a.jobId) === jobId,
            );
            if (currentApp) {
              setAppliedInfo({
                applied: true,
                date: new Date(currentApp.createdAt).toLocaleDateString('vi-VN'),
              });
            } else {
              setAppliedInfo(null);
            }
          }
        } catch {
          // Ignore
        }
      }
    } catch {
      setJob(null);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSave = () => {
    if (!id || !job) return;
    try {
      const saved = localStorage.getItem('talentpulse_saved_jobs');
      let list: string[] = saved ? JSON.parse(saved) : [];
      if (list.includes(id)) {
        list = list.filter((item) => item !== id);
        setIsSaved(false);
        info('Đã bỏ lưu việc làm');
      } else {
        list = [id, ...list];
        setIsSaved(true);
        info('Đã lưu việc làm vào danh sách yêu thích');
      }
      setSavedJobIds(list);
      localStorage.setItem('talentpulse_saved_jobs', JSON.stringify(list));
    } catch {
      // Ignore
    }
  };

  const handleToggleSaveRelated = (rJob: JobItem) => {
    try {
      const saved = localStorage.getItem('talentpulse_saved_jobs');
      let list: string[] = saved ? JSON.parse(saved) : [];
      if (list.includes(rJob._id)) {
        list = list.filter((item) => item !== rJob._id);
        info(`Đã bỏ lưu "${rJob.name}"`);
      } else {
        list = [rJob._id, ...list];
        success(`Đã lưu "${rJob.name}" vào danh sách yêu thích`);
      }
      setSavedJobIds(list);
      localStorage.setItem('talentpulse_saved_jobs', JSON.stringify(list));
    } catch {
      // Ignore
    }
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: job?.name,
        text: `Tuyển dụng ${job?.name} tại ${job?.company?.name}`,
        url: window.location.href,
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
      success('Đã sao chép liên kết tuyển dụng vào bộ nhớ tạm!');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950 font-sans">
        <Header />
        <main className="flex-1 flex items-center justify-center pt-24 pb-16">
          <div className="flex flex-col items-center gap-3 text-slate-500">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="text-sm font-medium">Đang tải thông tin chi tiết việc làm...</span>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950 font-sans">
        <Header />
        <main className="flex-1 flex items-center justify-center pt-24 pb-16 px-4">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl p-8 text-center border border-slate-200 dark:border-slate-800 shadow-xl">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Không tìm thấy việc làm
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Công việc này có thể đã hết hạn tuyển dụng hoặc đã bị gỡ bỏ bởi nhà tuyển dụng.
            </p>
            <Link
              to="/jobs"
              className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-dark text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-primary/25"
            >
              <ArrowLeft className="w-4 h-4" />
              Khám phá việc làm khác
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const deadlineFormatted = job.endDate
    ? new Date(job.endDate).toLocaleDateString('vi-VN')
    : 'Tuyển liên tục';

  return (
    <div className="flex min-h-screen flex-col bg-[#f4f7fa] dark:bg-slate-950 font-sans">
      <Header />

      <main className="flex-1 pt-22 pb-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* BREADCRUMB */}
          <nav className="flex items-center flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400 mb-5 select-none">
            <Link to="/" className="hover:text-primary transition-colors">
              Trang chủ
            </Link>
            <ChevronRight className="w-3 h-3 text-slate-400" />
            <Link to="/jobs" className="hover:text-primary transition-colors">
              Việc làm
            </Link>
            <ChevronRight className="w-3 h-3 text-slate-400" />
            <Link
              to={`/jobs?query=${encodeURIComponent(job.name)}`}
              className="hover:text-primary transition-colors truncate max-w-[200px]"
            >
              Việc làm {job.name}
            </Link>
            <ChevronRight className="w-3 h-3 text-slate-400" />
            <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[240px]">
              Tuyển {job.name}
            </span>
          </nav>

          {/* 2-COLUMN MAIN LAYOUT */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT COLUMN: HERO HEADER & JOB DETAILS & RELATED JOBS (~68%) */}
            <div className="lg:col-span-8 space-y-6">
              {/* 1. HERO JOB HEADER CARD */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 sm:p-7 border border-slate-200/80 dark:border-slate-800 shadow-sm">
                {/* Title */}
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white leading-snug tracking-tight">
                  {job.name}
                </h1>

                {/* Salary Row */}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <span className="text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400">
                    {formatSalary(job.salary)}
                  </span>
                  <span className="text-slate-300 dark:text-slate-700">|</span>
                  <Link
                    to={`/jobs?level=${encodeURIComponent(job.level || '')}`}
                    className="text-xs sm:text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-primary transition-colors"
                  >
                    Xem mức lương thị trường cho vị trí này &gt;
                  </Link>
                </div>

                {/* 3 Key Metric Badges */}
                <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                  {/* Location */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-950/40 text-primary dark:text-primary-light flex items-center justify-center shrink-0">
                      <MapPin className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[11px] text-slate-400 block font-medium">Địa điểm</span>
                      <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 truncate block">
                        {formatLocation(job.location)}
                      </span>
                    </div>
                  </div>

                  {/* Experience */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-950/40 text-primary dark:text-primary-light flex items-center justify-center shrink-0">
                      <Briefcase className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[11px] text-slate-400 block font-medium">Kinh nghiệm</span>
                      <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 truncate block">
                        {job.level || 'Không yêu cầu'}
                      </span>
                    </div>
                  </div>

                  {/* Deadline */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-950/40 text-primary dark:text-primary-light flex items-center justify-center shrink-0">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[11px] text-slate-400 block font-medium">Hạn ứng tuyển</span>
                      <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 truncate block">
                        {deadlineFormatted}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Application Stats Pill */}
                <div className="mt-4 flex items-center gap-2">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950/40 text-primary dark:text-primary-light border border-blue-200/60 dark:border-blue-900/60">
                    <Eye className="w-3.5 h-3.5" />
                    <span>Xem số người đã ứng tuyển</span>
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500 text-white">
                      ✨ New
                    </span>
                  </div>
                </div>

                {/* Big Action Buttons Row */}
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsApplyModalOpen(true)}
                    className="flex-1 min-w-[200px] py-3 px-8 bg-primary hover:bg-primary-dark active:scale-[0.98] text-white text-sm sm:text-base font-bold rounded-xl shadow-md shadow-primary/25 hover:shadow-primary/35 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                    <span>{appliedInfo?.applied ? 'Ứng tuyển lại' : 'Ứng tuyển ngay'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleToggleSave}
                    className={`px-4 py-3 rounded-xl border font-semibold text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer ${
                      isSaved
                        ? 'bg-rose-50 border-rose-200 text-rose-600 dark:bg-rose-950/40 dark:border-rose-900/60'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-rose-400 hover:text-rose-500 bg-white dark:bg-slate-800'
                    }`}
                  >
                    <Heart className={`w-4 h-4 ${isSaved ? 'fill-rose-500 text-rose-500' : ''}`} />
                    <span>{isSaved ? 'Đã lưu tin' : 'Lưu tin'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleShare}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-primary hover:border-primary bg-white dark:bg-slate-800 transition-all cursor-pointer"
                    title="Chia sẻ tin tuyển dụng"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Already applied note */}
                {appliedInfo?.applied && (
                  <div className="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                    <span>
                      Bạn đã gửi CV cho vị trí này ngày: <strong>{appliedInfo.date}</strong>.{' '}
                      <Link to="/my-cv" className="text-primary font-bold hover:underline">
                        Xem CV đã nộp
                      </Link>
                    </span>
                  </div>
                )}
              </div>

              {/* 2. CHI TIẾT TIN TUYỂN DỤNG CARD */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 sm:p-7 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-7">
                {/* SECTION: TỔNG QUAN */}
                <div>
                  <div className="flex items-center justify-between border-l-4 border-primary pl-3 mb-4">
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                      Tổng quan
                    </h2>
                    <Link
                      to="/saved-jobs"
                      className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                    >
                      <BellRing className="w-3.5 h-3.5" />
                      Gửi tôi việc làm tương tự
                    </Link>
                  </div>

                  <div className="space-y-3 text-xs sm:text-sm">
                    {/* Yêu cầu */}
                    <div className="flex items-start gap-3">
                      <span className="font-semibold text-slate-500 dark:text-slate-400 w-24 shrink-0">
                        Yêu cầu:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                          {job.level || '2 năm kinh nghiệm chuyên môn'}
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                          Đại Học trở lên
                        </span>
                      </div>
                    </div>

                    {/* Quyền lợi */}
                    <div className="flex items-start gap-3">
                      <span className="font-semibold text-slate-500 dark:text-slate-400 w-24 shrink-0">
                        Quyền lợi:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                          Bảo hiểm xã hội
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                          Du lịch hàng năm
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                          Thưởng tháng 13
                        </span>
                      </div>
                    </div>

                    {/* Chuyên môn / Skills */}
                    {Array.isArray(job.skills) && job.skills.length > 0 && (
                      <div className="flex items-start gap-3">
                        <span className="font-semibold text-slate-500 dark:text-slate-400 w-24 shrink-0">
                          Chuyên môn:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {job.skills.map((skill, idx) => (
                            <span
                              key={idx}
                              className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-primary dark:text-primary-light font-semibold border border-blue-200/50"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* SECTION: MÔ TẢ CÔNG VIỆC */}
                <div className="pt-5 border-t border-slate-100 dark:border-slate-800">
                  <div className="border-l-4 border-primary pl-3 mb-3">
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                      Mô tả công việc
                    </h2>
                  </div>
                  <JobHtmlDescription content={job.description} />
                </div>

                {/* SECTION: ĐỊA ĐIỂM LÀM VIỆC */}
                <div className="pt-5 border-t border-slate-100 dark:border-slate-800">
                  <div className="border-l-4 border-primary pl-3 mb-2.5">
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                      Địa điểm làm việc
                    </h2>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-primary shrink-0" />
                    <span>{job.location || 'Hà Nội / TP. Hồ Chí Minh / Toàn quốc'}</span>
                  </p>
                </div>

                {/* SECTION: CÁCH THỨC ỨNG TUYỂN & HẠN NỘP */}
                <div className="pt-5 border-t border-slate-100 dark:border-slate-800 space-y-4">
                  <div className="border-l-4 border-primary pl-3">
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                      Cách thức ứng tuyển
                    </h2>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 space-y-2 text-xs sm:text-sm">
                    <p className="text-slate-600 dark:text-slate-300">
                      Ứng viên nộp hồ sơ trực tuyến bằng cách bấm <strong>Ứng tuyển ngay</strong> dưới đây.
                    </p>
                    <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                      <span>
                        Hạn nộp hồ sơ: <strong>{deadlineFormatted}</strong>
                      </span>
                      <span>
                        Số lượng tuyển: <strong>{job.quantity || 1} người</strong>
                      </span>
                    </div>
                  </div>

                  {/* Apply CTA bottom */}
                  <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setIsApplyModalOpen(true)}
                      className="px-8 py-3 bg-primary hover:bg-primary-dark active:scale-[0.98] text-white text-sm font-bold rounded-xl shadow-md shadow-primary/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Send className="w-4 h-4" />
                      <span>{appliedInfo?.applied ? 'Ứng tuyển lại' : 'Ứng tuyển ngay'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleToggleSave}
                      className="px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-rose-500 hover:border-rose-300 transition-colors text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Heart className={`w-4 h-4 ${isSaved ? 'fill-rose-500 text-rose-500' : ''}`} />
                      <span>{isSaved ? 'Đã lưu việc làm' : 'Lưu việc làm'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 3. SECTION: VIỆC LÀM LIÊN QUAN (Related Jobs based on skills) */}
              <div className="space-y-4 pt-2">
                <div className="border-l-4 border-primary pl-3">
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                    Việc làm liên quan
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Các vị trí tuyển dụng tương tự dựa trên kỹ năng của công việc này
                  </p>
                </div>

                {relatedJobs.length === 0 ? (
                  <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-center text-xs text-slate-400">
                    Chưa có việc làm liên quan nào khác vào thời điểm hiện tại.
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {relatedJobs.map((rJob) => (
                      <div
                        key={rJob._id}
                        className="group bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 hover:border-primary/50 hover:shadow-lg transition-all duration-200"
                      >
                        <div className="flex items-start gap-3.5">
                          {/* Logo */}
                          <Link
                            to={`/jobs/${rJob._id}`}
                            className="shrink-0 w-12 h-12 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1 flex items-center justify-center group-hover:scale-105 transition-transform shadow-xs"
                          >
                            {rJob.company?.logo ? (
                              <img
                                src={rJob.company.logo}
                                alt={rJob.company.name || 'Company'}
                                className="w-full h-full object-contain rounded-lg"
                                loading="lazy"
                              />
                            ) : (
                              <div className="w-full h-full rounded-lg bg-gradient-to-br from-primary/10 to-blue-600/20 flex items-center justify-center text-primary font-bold text-xs">
                                {getCompanyInitial(rJob.company?.name)}
                              </div>
                            )}
                          </Link>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            {/* Badges & Title */}
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex flex-wrap items-center gap-1 mb-1">
                                  {rJob.isFeatured && (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-md text-[10px] font-bold bg-amber-500 text-white">
                                      <Sparkles className="w-2.5 h-2.5" />
                                      Nổi bật
                                    </span>
                                  )}
                                  {rJob.isHot && (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-md text-[10px] font-bold bg-gradient-to-r from-red-500 to-amber-500 text-white">
                                      <Flame className="w-2.5 h-2.5" />
                                      HOT
                                    </span>
                                  )}
                                </div>

                                <Link
                                  to={`/jobs/${rJob._id}`}
                                  className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100 group-hover:text-primary transition-colors line-clamp-1"
                                >
                                  {rJob.name}
                                </Link>
                              </div>

                              {/* Salary */}
                              <div className="shrink-0 text-xs sm:text-sm font-bold text-rose-600 dark:text-rose-400">
                                {formatSalary(rJob.salary)}
                              </div>
                            </div>

                            {/* Company Name */}
                            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300">
                                Pro
                              </span>
                              <span className="truncate max-w-[260px]">
                                {rJob.company?.name || 'TalentPulse Employer'}
                              </span>
                              {rJob.company?.isActive && (
                                <CheckCircle2 className="w-3 h-3 text-blue-500 shrink-0" />
                              )}
                            </div>

                            {/* Location & Exp + Actions */}
                            <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                                <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800">
                                  {formatLocation(rJob.location)}
                                </span>
                                {rJob.level && (
                                  <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800">
                                    {rJob.level}
                                  </span>
                                )}
                                <span>&bull; {formatDaysRemaining(rJob.endDate)}</span>
                              </div>

                              <div className="flex items-center gap-2">
                                {/* Hover Apply Button */}
                                <button
                                  type="button"
                                  onClick={() => setApplyingRelatedJob(rJob)}
                                  className="opacity-0 translate-x-1 pointer-events-none group-hover:opacity-100 group-hover:translate-x-0 group-hover:pointer-events-auto px-3 py-1 bg-primary hover:bg-primary-dark text-white text-xs font-semibold rounded-lg shadow-xs transition-all duration-200 flex items-center gap-1 cursor-pointer whitespace-nowrap"
                                >
                                  <Zap className="w-3 h-3 fill-white" />
                                  Ứng tuyển
                                </button>

                                {/* Save Button */}
                                <button
                                  type="button"
                                  onClick={() => handleToggleSaveRelated(rJob)}
                                  className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                                    savedJobIds.includes(rJob._id)
                                      ? 'bg-rose-50 border-rose-200 text-rose-600 dark:bg-rose-950/40 dark:border-rose-900/60'
                                      : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-500'
                                  }`}
                                  title="Lưu việc làm này"
                                >
                                  <Heart
                                    className={`w-4 h-4 ${
                                      savedJobIds.includes(rJob._id) ? 'fill-rose-500' : ''
                                    }`}
                                  />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN: SIDEBAR WIDGETS (~32%) */}
            <div className="lg:col-span-4 space-y-6 sticky top-24">
              {/* 1. COMPANY PROFILE CARD */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-start gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                  <div className="w-16 h-16 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1.5 shrink-0 flex items-center justify-center shadow-xs">
                    {job.company?.logo && !imageError ? (
                      <img
                        src={job.company.logo}
                        alt={job.company.name || 'Company'}
                        onError={() => setImageError(true)}
                        className="w-full h-full object-contain rounded-xl"
                      />
                    ) : (
                      <div className="w-full h-full rounded-xl bg-gradient-to-br from-primary/15 to-blue-600/30 flex items-center justify-center text-primary font-bold text-xl">
                        {getCompanyInitial(job.company?.name)}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white leading-snug">
                      {job.company?.name || 'TalentPulse Employer'}
                    </h3>
                  </div>
                </div>

                {/* Company Metadata List */}
                <div className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
                  <div className="flex items-center gap-2.5">
                    <Users className="w-4 h-4 text-slate-400 shrink-0" />
                    <span><strong>Quy mô:</strong> 25-99 nhân viên</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                    <span><strong>Lĩnh vực:</strong> IT - Phần mềm</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <span className="line-clamp-2">
                      <strong>Địa điểm:</strong> {job.location || 'Hà Nội'}
                    </span>
                  </div>
                </div>

                {/* Link to company page */}
                <Link
                  to={`/jobs?query=${encodeURIComponent(job.company?.name || '')}`}
                  className="w-full py-2.5 px-4 bg-blue-50 hover:bg-blue-100 text-primary dark:bg-blue-950/40 dark:text-primary-light dark:hover:bg-blue-900/50 border border-blue-200/60 dark:border-blue-800/60 text-xs font-bold rounded-xl transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Xem trang công ty</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>

              {/* 2. THÔNG TIN CHUNG CARD (Detailed general info) */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
                <h3 className="text-base font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3">
                  Thông tin chung
                </h3>

                <div className="space-y-3 text-xs">
                  {/* Cấp bậc */}
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 shrink-0">
                      <Briefcase className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Cấp bậc</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {job.level || 'Nhân viên'}
                      </span>
                    </div>
                  </div>

                  {/* Học vấn */}
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 shrink-0">
                      <GraduationCap className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Học vấn</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        Đại Học trở lên
                      </span>
                    </div>
                  </div>

                  {/* Số lượng tuyển */}
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 shrink-0">
                      <Users className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Số lượng tuyển</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {job.quantity || 1} người
                      </span>
                    </div>
                  </div>

                  {/* Hình thức làm việc */}
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 shrink-0">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Hình thức làm việc</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        Làm việc tại văn phòng / Onsite
                      </span>
                    </div>
                  </div>

                  {/* Hạn nộp */}
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 shrink-0">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Hạn nộp hồ sơ</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {deadlineFormatted}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. DANH MỤC NGHỀ LIÊN QUAN CARD */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Danh mục nghề liên quan
                </h3>
                <div className="flex flex-wrap gap-2">
                  {[
                    'Công nghệ Thông tin',
                    'Software Engineering',
                    'Fullstack Developer',
                    'Backend Developer',
                    'Frontend Developer',
                  ].map((tag, idx) => (
                    <Link
                      key={idx}
                      to={`/jobs?query=${encodeURIComponent(tag)}`}
                      className="px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 hover:text-primary dark:hover:bg-blue-950/40 dark:hover:text-primary-light transition-colors"
                    >
                      {tag}
                    </Link>
                  ))}
                </div>
              </div>

              {/* 4. BÁO CÁO TIN TUYỂN DỤNG & HỖ TRỢ */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3 text-xs">
                <div className="space-y-1 text-slate-600 dark:text-slate-400">
                  <p>Email: <strong>hotro@talentpulse.vn</strong></p>
                  <p>Hotline: <strong>1900 0688 | Nhánh 2</strong></p>
                </div>

                <button
                  type="button"
                  onClick={() => info('Cảm ơn bạn đã gửi phản hồi. Ban Quản trị sẽ kiểm tra tin tuyển dụng này.')}
                  className="w-full py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Báo cáo tin tuyển dụng
                </button>

                <p className="text-[11px] text-slate-400 italic">
                  Tìm hiểu thêm kinh nghiệm phòng tránh lừa đảo tuyển dụng tại TalentPulse.
                </p>
              </div>

              {/* 5. TALENTPULSE TIỆN ÍCH CAREER BANNERS */}
              <div className="space-y-3">
                <Link
                  to="/my-cv"
                  className="p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 border border-blue-200/70 dark:border-blue-800/50 flex items-center justify-between gap-3 group hover:shadow-md transition-all"
                >
                  <div className="space-y-0.5 min-w-0">
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white group-hover:text-primary transition-colors">
                      50+ Mẫu CV Xin Việc
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      Chuyên nghiệp, phù hợp với từng ngành nghề IT
                    </p>
                  </div>
                  <FileText className="w-7 h-7 text-primary shrink-0 group-hover:scale-110 transition-transform" />
                </Link>

                <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-sky-50 dark:from-blue-950/40 dark:to-sky-950/40 border border-blue-200/70 dark:border-blue-800/50 flex items-center justify-between gap-3 group hover:shadow-md transition-all cursor-pointer">
                  <div className="space-y-0.5 min-w-0">
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white group-hover:text-primary transition-colors">
                      Công cụ tính lương GROSS - NET
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      Chuyển đổi lương nhanh chóng và chính xác
                    </p>
                  </div>
                  <Calculator className="w-7 h-7 text-primary shrink-0 group-hover:scale-110 transition-transform" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* MAIN APPLY MODAL */}
      <JobApplyModal
        job={job}
        isOpen={isApplyModalOpen}
        onClose={() => setIsApplyModalOpen(false)}
        onSuccess={() => {
          setAppliedInfo({
            applied: true,
            date: new Date().toLocaleDateString('vi-VN'),
          });
        }}
      />

      {/* RELATED JOB APPLY MODAL */}
      <JobApplyModal
        job={applyingRelatedJob}
        isOpen={Boolean(applyingRelatedJob)}
        onClose={() => setApplyingRelatedJob(null)}
        onSuccess={() => {
          // Success
        }}
      />

      <Footer />
    </div>
  );
}
