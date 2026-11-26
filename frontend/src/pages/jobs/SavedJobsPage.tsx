import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  Flame,
  Heart,
  Loader2,
  Send,
  Sparkles,
  ArrowRight,
  Briefcase,
  ChevronRight,
  ShieldCheck,
  LogIn,
} from 'lucide-react';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import JobApplyModal from '../../components/jobs/JobApplyModal';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  JobItem,
  getMySavedJobsApi,
  removeSavedJobApi,
  toggleSaveJobApi,
  searchJobsApi,
  formatSalary,
  formatLocation,
  formatDaysRemaining,
  getCompanyInitial,
} from '../../lib/jobApi';
import { apiRequest } from '../../lib/api';

export default function SavedJobsPage() {
  const { accessToken } = useAuth();
  const { success, error, info } = useToast();
  const navigate = useNavigate();

  const [savedJobs, setSavedJobs] = useState<JobItem[]>([]);
  const [similarJobs, setSimilarJobs] = useState<JobItem[]>([]);
  const [appliedJobIds, setAppliedJobIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSimilar, setLoadingSimilar] = useState(false);
  const [applyingJob, setApplyingJob] = useState<JobItem | null>(null);

  // Fetch saved jobs from backend PostgreSQL DB
  const fetchSavedJobsFromDb = async () => {
    if (!accessToken) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // 1. Fetch user's applied jobs
      try {
        const appRes = await apiRequest<any[]>('/applications/my-applications', {
          accessToken,
        });
        if (Array.isArray(appRes)) {
          const appliedIds = appRes
            .map((app) => app.job?._id || app.jobId?._id || app.jobId)
            .filter(Boolean);
          setAppliedJobIds(appliedIds);
        }
      } catch {
        // Ignore application fetch error
      }

      // 2. Fetch saved jobs
      const res = await getMySavedJobsApi(accessToken, { current: 1, pageSize: 50 });
      const jobs = res?.result || [];
      setSavedJobs(jobs);

      // 3. Fetch similar jobs
      void fetchSimilarJobs(jobs);
    } catch (err: any) {
      console.error('Error loading saved jobs:', err);
      error(err?.message || 'Không thể tải danh sách việc làm đã lưu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSavedJobsFromDb();
  }, [accessToken]);

  // Fetch similar jobs from Elasticsearch based on skills of saved jobs
  const fetchSimilarJobs = async (jobs: JobItem[]) => {
    try {
      setLoadingSimilar(true);

      const savedIds = jobs.map((j) => j._id);
      const extractedSkills = Array.from(
        new Set(
          jobs.flatMap((j) => (Array.isArray(j.skills) ? j.skills : [])).filter(Boolean),
        ),
      );

      let res;
      if (extractedSkills.length > 0) {
        res = await searchJobsApi(
          {
            skills: extractedSkills.slice(0, 6),
            limit: 8,
            sort: 'relevance',
          },
          accessToken,
        );
      } else {
        res = await searchJobsApi(
          {
            limit: 8,
            sort: 'newest',
          },
          accessToken,
        );
      }

      if (res && res.result) {
        const filtered = res.result.filter((j) => !savedIds.includes(j._id));
        setSimilarJobs(filtered.slice(0, 6));
      }
    } catch (err) {
      console.error('Error fetching similar jobs:', err);
    } finally {
      setLoadingSimilar(false);
    }
  };

  // Remove Job from Saved List
  const handleRemoveSavedJob = async (job: JobItem) => {
    if (!accessToken) return;

    try {
      await removeSavedJobApi(job._id, accessToken);
      setSavedJobs((prev) => prev.filter((j) => j._id !== job._id));
      info(`Đã xóa việc làm "${job.name}" khỏi danh sách đã lưu`);
    } catch (err: any) {
      error(err?.message || 'Không thể xóa việc làm đã lưu');
    }
  };

  // Save a job from similar recommendations
  const handleSaveSimilarJob = async (job: JobItem) => {
    if (!accessToken) {
      info('Vui lòng đăng nhập để lưu việc làm');
      navigate('/login');
      return;
    }

    try {
      await toggleSaveJobApi(job._id, accessToken);
      setSavedJobs((prev) => [{ ...job, savedAt: new Date().toISOString() }, ...prev]);
      setSimilarJobs((prev) => prev.filter((j) => j._id !== job._id));
      success(`Đã lưu việc làm "${job.name}" vào danh sách yêu thích`);
    } catch (err: any) {
      error(err?.message || 'Không thể lưu việc làm');
    }
  };

  // Format Saved Date
  const formatSavedDate = (savedAt?: string | Date) => {
    if (!savedAt) {
      const today = new Date();
      return `${today.toLocaleDateString('vi-VN')} - ${today.getHours().toString().padStart(2, '0')}:${today.getMinutes().toString().padStart(2, '0')}`;
    }
    const d = new Date(savedAt);
    return `${d.toLocaleDateString('vi-VN')} - ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans text-slate-800 dark:text-slate-100 flex flex-col justify-between selection:bg-primary/20 selection:text-primary">
      <Header />

      <main className="flex-1 pb-16 pt-24 sm:pt-28">
        <div className="container mx-auto px-4 max-w-7xl">
          {/* Breadcrumbs */}
          <nav className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-6">
            <Link to="/" className="hover:text-primary transition-colors">
              Trang chủ
            </Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <Link to="/jobs" className="hover:text-primary transition-colors">
              Việc làm
            </Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-slate-900 dark:text-white font-bold">
              Việc làm đã lưu
            </span>
          </nav>

          {/* Not logged in State */}
          {!accessToken ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-12 text-center max-w-lg mx-auto shadow-sm my-12 space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
                <Heart className="w-8 h-8 fill-primary" />
              </div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white">
                Vui lòng đăng nhập để xem việc làm đã lưu
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                Đăng nhập để đồng bộ và lưu giữ tất cả các cơ hội việc làm IT hấp dẫn nhất trên hệ thống TalentPulse của bạn.
              </p>
              <div className="pt-2">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-primary hover:bg-primary-dark text-white text-sm font-bold shadow-md shadow-primary/20 transition active:scale-95"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Đăng nhập ngay</span>
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left Column: List of Saved Jobs (8 Cols) */}
              <div className="lg:col-span-8 space-y-6">
                {/* Header Title Card */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
                      <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-red-50 text-red-500 dark:bg-red-500/10">
                        <Heart className="h-5 w-5 fill-red-500" />
                      </span>
                      <span>Việc làm đã lưu</span>
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                      Danh sách các cơ hội nghề nghiệp bạn đã đánh dấu quan tâm và lưu lại để ứng tuyển.
                    </p>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                      Tổng số:
                    </span>
                    <span className="px-3 py-1 rounded-xl bg-primary/10 text-primary font-black text-xs">
                      {savedJobs.length} việc làm
                    </span>
                  </div>
                </div>

                {/* Loading State */}
                {loading ? (
                  <div className="py-24 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
                    <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
                    <p className="text-xs text-slate-500">Đang tải danh sách việc làm đã lưu...</p>
                  </div>
                ) : savedJobs.length === 0 ? (
                  /* Empty State */
                  <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 p-12 text-center space-y-4 shadow-xs">
                    <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
                      <Heart className="w-8 h-8" />
                    </div>
                    <div>
                      <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                        Bạn chưa lưu việc làm nào
                      </h3>
                      <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
                        Hãy khám phá hàng ngàn công việc IT hấp dẫn trên TalentPulse và bấm vào biểu tượng Trái tim để lưu lại xem sau.
                      </p>
                    </div>
                    <div className="pt-2">
                      <Link
                        to="/jobs"
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-dark text-white text-xs sm:text-sm font-bold shadow-md shadow-primary/20 transition active:scale-95"
                      >
                        <Briefcase className="w-4 h-4" />
                        <span>Khám phá việc làm ngay</span>
                      </Link>
                    </div>
                  </div>
                ) : (
                  /* List of Saved Job Cards */
                  <div className="space-y-4">
                    {savedJobs.map((job) => {
                      const isApplied = appliedJobIds.includes(job._id);
                      const daysRem = formatDaysRemaining(job.endDate);
                      const isExpired = daysRem === 'Hết hạn';

                      return (
                        <div
                          key={job._id}
                          className="group relative bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 shadow-xs hover:shadow-md hover:border-primary/40 dark:hover:border-primary/40 transition-all duration-200 flex flex-col justify-between"
                        >
                          <div>
                            {/* Top Info Header */}
                            <div className="flex items-start gap-4">
                              {/* Company Logo */}
                              <Link
                                to={`/jobs/${job._id}`}
                                className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-1 flex items-center justify-center shrink-0 overflow-hidden shadow-xs group-hover:scale-105 transition-transform"
                              >
                                {job.company?.logo ? (
                                  <img
                                    src={job.company.logo}
                                    alt={job.company.name}
                                    className="w-full h-full object-contain rounded-xl"
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none';
                                      if (e.currentTarget.parentElement) {
                                        e.currentTarget.parentElement.innerText =
                                          getCompanyInitial(job.company?.name);
                                      }
                                    }}
                                  />
                                ) : (
                                  <span className="text-base font-black text-primary">
                                    {getCompanyInitial(job.company?.name)}
                                  </span>
                                )}
                              </Link>

                              {/* Title & Company */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {job.isHot && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-500 text-[10px] font-black text-white shadow-xs">
                                      <Flame className="w-3 h-3" /> HOT
                                    </span>
                                  )}
                                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-0.5 rounded-md border border-emerald-200/60 dark:border-emerald-900/40">
                                    {formatSalary(job.salary)}
                                  </span>
                                </div>

                                <Link
                                  to={`/jobs/${job._id}`}
                                  className="block mt-1 text-sm sm:text-base font-black text-slate-900 dark:text-white group-hover:text-primary transition-colors line-clamp-1"
                                >
                                  {job.name}
                                </Link>

                                <p className="text-xs font-bold text-slate-600 dark:text-slate-400 mt-0.5 truncate">
                                  {job.company?.name || 'Doanh nghiệp tuyển dụng'}
                                </p>
                              </div>
                            </div>

                            {/* Middle Details: Location, Deadline, Saved Date */}
                            <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs text-slate-500 dark:text-slate-400">
                              <div className="flex items-center gap-1.5 truncate">
                                <span className="text-slate-400">Địa điểm:</span>
                                <span className="font-semibold text-slate-700 dark:text-slate-300 truncate">
                                  {formatLocation(job.location)}
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5 truncate">
                                <span className="text-slate-400">Hạn nộp:</span>
                                <span
                                  className={`font-semibold ${
                                    isExpired
                                      ? 'text-red-500'
                                      : 'text-slate-700 dark:text-slate-300'
                                  }`}
                                >
                                  {daysRem}
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5 truncate">
                                <span className="text-slate-400">Đã lưu lúc:</span>
                                <span className="font-semibold text-slate-700 dark:text-slate-300">
                                  {formatSavedDate(job.savedAt)}
                                </span>
                              </div>
                            </div>

                            {/* Skills Tags */}
                            {job.skills && job.skills.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-1.5">
                                {job.skills.slice(0, 5).map((skill) => (
                                  <span
                                    key={skill}
                                    className="px-2.5 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60"
                                  >
                                    {skill}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Bottom Action Buttons */}
                          <div className="mt-5 pt-3.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-3">
                            <button
                              type="button"
                              onClick={() => handleRemoveSavedJob(job)}
                              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-red-500 transition cursor-pointer"
                            >
                              <Heart className="w-4 h-4 fill-red-500 text-red-500" />
                              <span>Bỏ lưu</span>
                            </button>

                            <div className="flex items-center gap-2">
                              <Link
                                to={`/jobs/${job._id}`}
                                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                              >
                                Xem chi tiết
                              </Link>

                              {isApplied ? (
                                <button
                                  type="button"
                                  disabled
                                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Đã ứng tuyển</span>
                                </button>
                              ) : isExpired ? (
                                <button
                                  type="button"
                                  disabled
                                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 text-xs font-bold cursor-not-allowed"
                                >
                                  Hết hạn nộp
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setApplyingJob(job)}
                                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary-dark text-white text-xs font-extrabold shadow-sm shadow-primary/20 transition active:scale-95 cursor-pointer"
                                >
                                  <Send className="w-3.5 h-3.5" />
                                  <span>Ứng tuyển ngay</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right Column: AI Job Recommendations & Matching Sidebar (4 Cols) */}
              <div className="lg:col-span-4 space-y-6">
                {/* Similar Jobs Recommendation Widget */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 p-6 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      <span>Việc làm tương tự việc bạn đã lưu</span>
                    </h3>
                  </div>

                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Dựa trên kỹ năng và vị trí từ danh sách việc làm bạn đã quan tâm.
                  </p>

                  {loadingSimilar ? (
                    <div className="py-8 text-center">
                      <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto mb-2" />
                      <span className="text-xs text-slate-400">Đang tìm việc phù hợp...</span>
                    </div>
                  ) : similarJobs.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-400">
                      Chưa tìm thấy thêm gợi ý tương tự phù hợp.
                    </div>
                  ) : (
                    <div className="space-y-3.5">
                      {similarJobs.map((simJob) => (
                        <div
                          key={simJob._id}
                          className="group p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-800/40 hover:bg-white dark:hover:bg-slate-800 hover:border-primary/30 transition duration-200"
                        >
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl border border-slate-200/60 bg-white dark:bg-slate-800 p-0.5 flex items-center justify-center shrink-0 overflow-hidden">
                              {simJob.company?.logo ? (
                                <img
                                  src={simJob.company.logo}
                                  alt={simJob.company.name}
                                  className="w-full h-full object-contain rounded-lg"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    if (e.currentTarget.parentElement) {
                                      e.currentTarget.parentElement.innerText =
                                        getCompanyInitial(simJob.company?.name);
                                    }
                                  }}
                                />
                              ) : (
                                <span className="text-xs font-bold text-primary">
                                  {getCompanyInitial(simJob.company?.name)}
                                </span>
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <Link
                                to={`/jobs/${simJob._id}`}
                                className="text-xs font-black text-slate-900 dark:text-white group-hover:text-primary transition-colors line-clamp-1"
                              >
                                {simJob.name}
                              </Link>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                {simJob.company?.name}
                              </p>
                              <div className="mt-1 flex items-center justify-between text-[11px]">
                                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                  {formatSalary(simJob.salary)}
                                </span>
                                <span className="text-slate-400">
                                  {formatLocation(simJob.location)}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="mt-2.5 pt-2 border-t border-slate-200/40 dark:border-slate-700/40 flex items-center justify-between">
                            <button
                              type="button"
                              onClick={() => handleSaveSimilarJob(simJob)}
                              className="text-[11px] font-bold text-slate-500 hover:text-red-500 flex items-center gap-1 transition cursor-pointer"
                            >
                              <Heart className="w-3.5 h-3.5" />
                              <span>Lưu tin</span>
                            </button>

                            <Link
                              to={`/jobs/${simJob._id}`}
                              className="text-[11px] font-bold text-primary hover:underline inline-flex items-center gap-0.5"
                            >
                              <span>Ứng tuyển</span>
                              <ChevronRight className="w-3 h-3" />
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <Link
                    to="/jobs"
                    className="block text-center py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition"
                  >
                    Xem thêm hàng ngàn việc làm khác &rarr;
                  </Link>
                </div>

                {/* Useful career tips banner */}
                <div className="rounded-3xl border border-blue-200/80 bg-gradient-to-br from-blue-50/80 to-indigo-50/80 p-6 dark:border-blue-900/40 dark:bg-slate-900 dark:from-blue-950/20 dark:to-indigo-950/20 space-y-3">
                  <div className="flex items-center gap-2 text-primary font-black text-xs uppercase tracking-wider">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Mẹo ứng tuyển thành công</span>
                  </div>
                  <h4 className="text-sm font-black text-slate-900 dark:text-white">
                    Tùy chỉnh CV trước khi nộp
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Nghiên cứu kỹ mô tả công việc của các vị trí đã lưu và bổ sung những kỹ năng trọng tâm vào CV trực tuyến để đạt điểm AI Matching cao hơn!
                  </p>
                  <Link
                    to="/my-cv"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline pt-1"
                  >
                    <span>Cập nhật CV Online của bạn</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <Footer />

      {/* Apply Modal */}
      {applyingJob && (
        <JobApplyModal
          job={applyingJob}
          isOpen={true}
          onClose={() => setApplyingJob(null)}
          onSuccess={() => {
            setApplyingJob(null);
            setAppliedJobIds((prev) => [...prev, applyingJob._id]);
            success(`Ứng tuyển thành công công việc "${applyingJob.name}"!`);
          }}
        />
      )}
    </div>
  );
}
