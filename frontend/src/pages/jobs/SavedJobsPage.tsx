import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  Flame,
  Heart,
  Loader2,
  Send,
  Sparkles,
  Zap,
  ArrowRight,
  Briefcase,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import JobApplyModal from '../../components/jobs/JobApplyModal';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  JobItem,
  getJobDetailApi,
  searchJobsApi,
  formatSalary,
  formatLocation,
  formatDaysRemaining,
  getCompanyInitial,
} from '../../lib/jobApi';
import { apiRequest } from '../../lib/api';

export default function SavedJobsPage() {
  const { accessToken } = useAuth();
  const { success, info } = useToast();

  const [savedJobs, setSavedJobs] = useState<JobItem[]>([]);
  const [savedTimestamps, setSavedTimestamps] = useState<Record<string, string>>({});
  const [similarJobs, setSimilarJobs] = useState<JobItem[]>([]);
  const [appliedJobIds, setAppliedJobIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSimilar, setLoadingSimilar] = useState(false);
  const [applyingJob, setApplyingJob] = useState<JobItem | null>(null);

  // Load Saved Job IDs and Timestamps from localStorage
  const loadSavedData = useCallback(() => {
    try {
      const rawSaved = localStorage.getItem('talentpulse_saved_jobs');
      const ids: string[] = rawSaved ? JSON.parse(rawSaved) : [];

      const rawTimestamps = localStorage.getItem('talentpulse_saved_jobs_timestamps');
      const timestamps: Record<string, string> = rawTimestamps
        ? JSON.parse(rawTimestamps)
        : {};

      return { ids, timestamps };
    } catch {
      return { ids: [], timestamps: {} };
    }
  }, []);

  // Fetch details for saved jobs & applied jobs
  useEffect(() => {
    let isMounted = true;

    async function fetchData() {
      try {
        setLoading(true);
        const { ids, timestamps } = loadSavedData();
        setSavedTimestamps(timestamps);

        // 1. Fetch user's applied jobs if logged in
        if (accessToken) {
          try {
            const appRes = await apiRequest<any[]>('/applications/my-applications', {
              accessToken,
            });
            if (Array.isArray(appRes)) {
              const appliedIds = appRes
                .map((app) => app.job?._id || app.jobId?._id || app.jobId)
                .filter(Boolean);
              if (isMounted) setAppliedJobIds(appliedIds);
            }
          } catch {
            // Ignore application fetch error
          }
        }

        // 2. Fetch details for each saved job ID in parallel
        if (ids.length > 0) {
          const results = await Promise.allSettled(
            ids.map((id) => getJobDetailApi(id, accessToken)),
          );

          const validJobs: JobItem[] = [];
          results.forEach((res) => {
            if (res.status === 'fulfilled' && res.value && res.value._id) {
              validJobs.push(res.value);
            }
          });

          if (isMounted) {
            setSavedJobs(validJobs);
            // Fetch similar jobs using skills of saved jobs
            fetchSimilarJobs(validJobs, ids);
          }
        } else {
          if (isMounted) {
            setSavedJobs([]);
            // Fetch popular recommendations
            fetchSimilarJobs([], []);
          }
        }
      } catch (err) {
        console.error('Error loading saved jobs:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [accessToken, loadSavedData]);

  // Fetch similar jobs from Elasticsearch based on skills of saved jobs
  const fetchSimilarJobs = async (jobs: JobItem[], currentSavedIds: string[]) => {
    try {
      setLoadingSimilar(true);

      // Extract unique skills
      const extractedSkills = Array.from(
        new Set(
          jobs.flatMap((j) => (Array.isArray(j.skills) ? j.skills : [])).filter(Boolean),
        ),
      );

      let res;
      if (extractedSkills.length > 0) {
        // Query by matching skills in Elasticsearch
        res = await searchJobsApi(
          {
            skills: extractedSkills.slice(0, 6),
            limit: 8,
            sort: 'relevance',
          },
          accessToken,
        );
      } else {
        // Fallback: Query newest hot jobs
        res = await searchJobsApi(
          {
            limit: 8,
            sort: 'newest',
          },
          accessToken,
        );
      }

      if (res && res.result) {
        // Exclude jobs that are already in saved list
        const filtered = res.result.filter((j) => !currentSavedIds.includes(j._id));
        setSimilarJobs(filtered.slice(0, 6));
      }
    } catch (err) {
      console.error('Error fetching similar jobs:', err);
    } finally {
      setLoadingSimilar(false);
    }
  };

  // Remove Job from Saved List
  const handleRemoveSavedJob = (job: JobItem) => {
    const nextSaved = savedJobs.filter((j) => j._id !== job._id);
    const nextIds = nextSaved.map((j) => j._id);
    setSavedJobs(nextSaved);

    localStorage.setItem('talentpulse_saved_jobs', JSON.stringify(nextIds));
    info(`Đã xóa việc làm "${job.name}" khỏi danh sách đã lưu`);
  };

  // Save a job from similar recommendations
  const handleSaveSimilarJob = (job: JobItem) => {
    const rawSaved = localStorage.getItem('talentpulse_saved_jobs');
    const ids: string[] = rawSaved ? JSON.parse(rawSaved) : [];

    if (!ids.includes(job._id)) {
      const nextIds = [job._id, ...ids];
      localStorage.setItem('talentpulse_saved_jobs', JSON.stringify(nextIds));

      // Update timestamps
      const rawTimestamps = localStorage.getItem('talentpulse_saved_jobs_timestamps');
      const timestamps: Record<string, string> = rawTimestamps
        ? JSON.parse(rawTimestamps)
        : {};
      timestamps[job._id] = new Date().toISOString();
      localStorage.setItem(
        'talentpulse_saved_jobs_timestamps',
        JSON.stringify(timestamps),
      );
      setSavedTimestamps(timestamps);

      // Add to saved list and remove from similar list
      setSavedJobs((prev) => [job, ...prev]);
      setSimilarJobs((prev) => prev.filter((j) => j._id !== job._id));
      success(`Đã lưu việc làm "${job.name}" vào danh sách yêu thích`);
    }
  };

  // Format Saved Date
  const formatSavedDate = (jobId: string) => {
    const iso = savedTimestamps[jobId];
    if (!iso) {
      const today = new Date();
      return `${today.toLocaleDateString('vi-VN')} - ${today.getHours().toString().padStart(2, '0')}:${today.getMinutes().toString().padStart(2, '0')}`;
    }
    const d = new Date(iso);
    return `${d.toLocaleDateString('vi-VN')} - ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950 font-sans">
      <Header />

      <main className="flex-1 pt-24 pb-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* BREADCRUMB */}
          <nav className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-6 select-none">
            <Link to="/" className="hover:text-primary transition-colors">
              Trang chủ
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <Link to="/jobs" className="hover:text-primary transition-colors">
              Việc làm
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              Việc làm đã lưu
            </span>
          </nav>

          {/* MAIN 2-COLUMN LAYOUT */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* LEFT COLUMN: SAVED JOBS & SIMILAR JOBS (~68%) */}
            <div className="lg:col-span-8 space-y-10">
              {/* 1. SAVED JOBS SECTION */}
              <section>
                <div className="flex items-center justify-between mb-5">
                  <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                    Danh sách{' '}
                    <span className="text-primary dark:text-primary-light font-black">
                      {savedJobs.length}
                    </span>{' '}
                    việc làm đã lưu
                  </h1>
                </div>

                {loading ? (
                  // Shimmer Loading
                  <div className="space-y-4">
                    {[1, 2].map((i) => (
                      <div
                        key={i}
                        className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 animate-pulse flex gap-4"
                      >
                        <div className="w-16 h-16 bg-slate-200 dark:bg-slate-800 rounded-2xl shrink-0" />
                        <div className="flex-1 space-y-2.5">
                          <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-2/3" />
                          <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/3" />
                          <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/4 pt-1" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : savedJobs.length === 0 ? (
                  // Empty State
                  <div className="bg-white dark:bg-slate-900 rounded-3xl p-10 sm:p-12 text-center border border-slate-200/80 dark:border-slate-800 shadow-sm">
                    <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-500 flex items-center justify-center mx-auto mb-4 border border-rose-100 dark:border-rose-900/40">
                      <Heart className="w-8 h-8 fill-rose-500/20" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                      Bạn chưa lưu công việc nào
                    </h3>
                    <p className="mt-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                      Hãy nhấn biểu tượng Trái tim khi xem danh sách việc làm để lưu lại những vị trí bạn quan tâm và ứng tuyển sau.
                    </p>
                    <Link
                      to="/jobs"
                      className="mt-6 inline-flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary-dark text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-primary/25"
                    >
                      <Briefcase className="w-4 h-4" />
                      <span>Khám phá việc làm ngay</span>
                    </Link>
                  </div>
                ) : (
                  // Saved Jobs List
                  <div className="space-y-4">
                    {savedJobs.map((job) => {
                      const isApplied = appliedJobIds.includes(job._id);
                      return (
                        <div
                          key={job._id}
                          className="group bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 relative"
                        >
                          <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-5">
                            {/* Company Logo */}
                            <Link
                              to={`/jobs/${job._id}`}
                              className="shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-slate-800 p-1.5 flex items-center justify-center group-hover:scale-105 transition-transform duration-300 shadow-xs"
                            >
                              {job.company?.logo ? (
                                <img
                                  src={job.company.logo}
                                  alt={job.company.name || 'Company'}
                                  className="w-full h-full object-contain rounded-xl"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="w-full h-full rounded-xl bg-gradient-to-br from-primary/10 to-blue-600/20 flex items-center justify-center text-primary font-bold text-base">
                                  {getCompanyInitial(job.company?.name)}
                                </div>
                              )}
                            </Link>

                            {/* Job Main Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <Link
                                  to={`/jobs/${job._id}`}
                                  className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100 group-hover:text-primary transition-colors line-clamp-2 leading-snug"
                                >
                                  {job.name}
                                </Link>

                                {/* Salary on Top Right */}
                                <div className="shrink-0 text-xs sm:text-sm font-bold text-rose-600 dark:text-rose-400 whitespace-nowrap">
                                  {formatSalary(job.salary)}
                                </div>
                              </div>

                              {/* Company Name */}
                              <div className="mt-1 flex items-center gap-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                                <span className="truncate max-w-[320px] font-medium">
                                  {job.company?.name || 'TalentPulse Employer'}
                                </span>
                                {job.company?.isActive && (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                )}
                              </div>

                              {/* Pills (Location, Exp) */}
                              <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
                                <span className="px-2.5 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                                  {formatLocation(job.location)}
                                </span>
                                {job.level && (
                                  <span className="px-2.5 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                                    {job.level}
                                  </span>
                                )}
                              </div>

                              {/* Bottom Details & Actions Row */}
                              <div className="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                {/* Saved Date & Post Time */}
                                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
                                  <span>Đã lưu: {formatSavedDate(job._id)}</span>
                                  <span className="hidden sm:inline">&bull;</span>
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3 text-slate-400" />
                                    {formatDaysRemaining(job.endDate)}
                                  </span>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2.5 self-end sm:self-auto">
                                  {isApplied ? (
                                    <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold select-none">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                                      Đã ứng tuyển
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setApplyingJob(job)}
                                      className="px-4 py-1.5 bg-primary hover:bg-primary-dark text-white text-xs font-bold rounded-xl shadow-sm shadow-primary/20 hover:shadow-md transition-all flex items-center gap-1 cursor-pointer"
                                    >
                                      <Send className="w-3.5 h-3.5" />
                                      <span>Ứng tuyển ngay</span>
                                    </button>
                                  )}

                                  {/* Remove Heart Button */}
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveSavedJob(job)}
                                    className="p-1.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-500 hover:bg-rose-100 transition-colors cursor-pointer"
                                    title="Bỏ lưu việc làm này"
                                    aria-label="Bỏ lưu việc làm"
                                  >
                                    <Heart className="w-4 h-4 fill-rose-500 text-rose-500" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* 2. SIMILAR JOBS SECTION (Việc làm tương tự việc bạn đã lưu) */}
              <section className="pt-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-primary" />
                      <span>Việc làm tương tự việc bạn đã lưu</span>
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                      Hệ thống tự động đề xuất dựa trên kỹ năng và vị trí của các công việc bạn quan tâm
                    </p>
                  </div>
                </div>

                {loadingSimilar ? (
                  <div className="flex items-center justify-center py-10 text-slate-400 gap-2 text-xs">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    <span>Đang tìm kiếm các việc làm tương tự...</span>
                  </div>
                ) : similarJobs.length === 0 ? (
                  <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-center text-xs text-slate-500">
                    Không tìm thấy việc làm tương tự phù hợp vào lúc này.
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {similarJobs.map((job) => (
                      <div
                        key={job._id}
                        className="group bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 hover:border-primary/50 hover:shadow-lg transition-all duration-200 relative"
                      >
                        <div className="flex items-start gap-3.5">
                          {/* Logo */}
                          <Link
                            to={`/jobs/${job._id}`}
                            className="shrink-0 w-12 h-12 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1 flex items-center justify-center group-hover:scale-105 transition-transform shadow-xs"
                          >
                            {job.company?.logo ? (
                              <img
                                src={job.company.logo}
                                alt={job.company.name || 'Company'}
                                className="w-full h-full object-contain rounded-lg"
                                loading="lazy"
                              />
                            ) : (
                              <div className="w-full h-full rounded-lg bg-gradient-to-br from-primary/10 to-blue-600/20 flex items-center justify-center text-primary font-bold text-xs">
                                {getCompanyInitial(job.company?.name)}
                              </div>
                            )}
                          </Link>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            {/* Badges & Title */}
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex flex-wrap items-center gap-1 mb-1">
                                  {job.isFeatured && (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-md text-[10px] font-bold bg-amber-500 text-white">
                                      <Sparkles className="w-2.5 h-2.5" />
                                      Nổi bật
                                    </span>
                                  )}
                                  {job.isHot && (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-md text-[10px] font-bold bg-gradient-to-r from-red-500 to-amber-500 text-white">
                                      <Flame className="w-2.5 h-2.5" />
                                      HOT
                                    </span>
                                  )}
                                </div>

                                <Link
                                  to={`/jobs/${job._id}`}
                                  className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100 group-hover:text-primary transition-colors line-clamp-1"
                                >
                                  {job.name}
                                </Link>
                              </div>

                              {/* Salary */}
                              <div className="shrink-0 text-xs sm:text-sm font-bold text-rose-600 dark:text-rose-400">
                                {formatSalary(job.salary)}
                              </div>
                            </div>

                            {/* Company Name */}
                            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300">
                                Pro
                              </span>
                              <span className="truncate max-w-[260px]">
                                {job.company?.name || 'TalentPulse Employer'}
                              </span>
                              {job.company?.isActive && (
                                <CheckCircle2 className="w-3 h-3 text-blue-500 shrink-0" />
                              )}
                            </div>

                            {/* Location & Exp + Actions */}
                            <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                                <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800">
                                  {formatLocation(job.location)}
                                </span>
                                {job.level && (
                                  <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800">
                                    {job.level}
                                  </span>
                                )}
                                <span>&bull; {formatDaysRemaining(job.endDate)}</span>
                              </div>

                              <div className="flex items-center gap-2">
                                {/* Hover Apply Button */}
                                <button
                                  type="button"
                                  onClick={() => setApplyingJob(job)}
                                  className="opacity-0 translate-x-1 pointer-events-none group-hover:opacity-100 group-hover:translate-x-0 group-hover:pointer-events-auto px-3 py-1 bg-primary hover:bg-primary-dark text-white text-xs font-semibold rounded-lg shadow-xs transition-all duration-200 flex items-center gap-1 cursor-pointer whitespace-nowrap"
                                >
                                  <Zap className="w-3 h-3 fill-white" />
                                  Ứng tuyển
                                </button>

                                {/* Save Button */}
                                <button
                                  type="button"
                                  onClick={() => handleSaveSimilarJob(job)}
                                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-500 hover:border-rose-300 dark:hover:border-rose-700 transition-colors cursor-pointer"
                                  title="Lưu việc làm này"
                                >
                                  <Heart className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            {/* RIGHT COLUMN: TALENTPULSE CV & CAREER BANNER (~32%) */}
            <div className="lg:col-span-4 sticky top-24 space-y-6">
              {/* CV PRO MARKETING CARD */}
              <div className="relative rounded-3xl overflow-hidden border border-blue-200/80 dark:border-blue-900/40 bg-gradient-to-b from-blue-50/90 via-sky-50/50 to-white dark:from-slate-900 dark:via-blue-950/30 dark:to-slate-900 p-6 sm:p-7 shadow-xl shadow-blue-500/5 text-center">
                {/* Brand Logo / Badge */}
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light border border-primary/20 mb-4">
                  <Sparkles className="w-3.5 h-3.5" />
                  TalentPulse CV Studio
                </div>

                {/* Banner Title */}
                <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
                  CV <span className="text-primary">"Hịn"</span> Trên Tay
                  <br />
                  Apply Ngay Việc Hot
                </h3>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Nền tảng tạo CV online và đề xuất cơ hội việc làm chuẩn chuyên nghiệp cho Developer & IT.
                </p>

                {/* CV Graphic Card Mockup */}
                <div className="my-6 p-4 rounded-2xl bg-white dark:bg-slate-800 shadow-md border border-slate-100 dark:border-slate-700 max-w-[260px] mx-auto text-left space-y-2.5 transform -rotate-1 hover:rotate-0 transition-transform duration-300">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs">
                      CV
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="h-2.5 bg-primary/30 rounded w-3/4" />
                      <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
                    </div>
                  </div>
                  <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded w-full" />
                  <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded w-5/6" />
                  <div className="flex gap-1 pt-1">
                    <div className="h-3.5 w-10 bg-blue-100 dark:bg-blue-900/60 rounded" />
                    <div className="h-3.5 w-12 bg-blue-100 dark:bg-blue-900/60 rounded" />
                  </div>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-5">
                  Tuyển chọn hàng chục mẫu CV chuẩn theo ngành nghề IT & ATS
                </p>

                {/* Big Action CTA */}
                <Link
                  to="/my-cv"
                  className="w-full py-3 px-6 bg-primary hover:bg-primary-dark active:scale-[0.98] text-white text-sm font-extrabold rounded-2xl shadow-lg shadow-primary/25 hover:shadow-primary/35 transition-all flex items-center justify-center gap-2 cursor-pointer group"
                >
                  <span>Xem ngay</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>

              {/* TIPS / AI RECRUITMENT ASSISTANT BOX */}
              <div className="rounded-2xl p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                  <ShieldCheck className="w-4 h-4 text-primary" />
                  <span>Bí quyết tìm việc nhanh</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Ứng tuyển sớm trong vòng <strong>24h</strong> kể từ khi tin đăng được duyệt giúp tăng tỷ lệ HR phản hồi lên đến <strong>85%</strong>.
                </p>
                <Link
                  to="/jobs"
                  className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                >
                  <span>Khám phá thêm việc làm HOT</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* QUICK APPLY MODAL */}
      <JobApplyModal
        job={applyingJob}
        isOpen={Boolean(applyingJob)}
        onClose={() => setApplyingJob(null)}
        onSuccess={() => {
          if (applyingJob) {
            setAppliedJobIds((prev) => [...prev, applyingJob._id]);
          }
        }}
      />

      <Footer />
    </div>
  );
}
