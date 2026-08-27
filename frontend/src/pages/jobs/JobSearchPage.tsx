import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Flame,
  Zap,
  Sparkles,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Inbox,
} from 'lucide-react';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import JobSearchBar from '../../components/jobs/JobSearchBar';
import JobCardHorizontal from '../../components/jobs/JobCardHorizontal';
import JobSidebarWidgets from '../../components/jobs/JobSidebarWidgets';
import JobQuickPreview from '../../components/jobs/JobQuickPreview';
import JobApplyModal from '../../components/jobs/JobApplyModal';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  JobItem,
  SearchJobsParams,
  searchJobsApi,
} from '../../lib/jobApi';

export default function JobSearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { accessToken } = useAuth();
  const { info } = useToast();

  // Read URL query params
  const paramQuery = searchParams.get('query') || '';
  const paramLocation = searchParams.get('location') || 'Tất cả địa điểm';
  const paramLevel = searchParams.get('level') || 'Tất cả cấp bậc';
  const paramSalaryRange = searchParams.get('salaryRange') || '';
  const paramSort = (searchParams.get('sort') as any) || 'relevance';
  const paramIsHot = searchParams.get('isHot') === 'true';
  const paramIsUrgent = searchParams.get('isUrgent') === 'true';
  const paramIsFeatured = searchParams.get('isFeatured') === 'true';
  const paramPage = parseInt(searchParams.get('page') || '1', 10);

  // States
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(paramPage);
  const [loading, setLoading] = useState(true);

  // Filter toggles
  const [sortBy, setSortBy] = useState<'relevance' | 'newest' | 'salary_desc' | 'salary_asc'>(paramSort);
  const [filterHot, setFilterHot] = useState(paramIsHot);
  const [filterUrgent, setFilterUrgent] = useState(paramIsUrgent);
  const [filterFeatured, setFilterFeatured] = useState(paramIsFeatured);

  // Saved Jobs tracking (localStorage)
  const [savedJobIds, setSavedJobIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('talentpulse_saved_jobs');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Apply Modal state
  const [applyingJob, setApplyingJob] = useState<JobItem | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobItem | null>(null);

  // Perform search
  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true);

      let minSalary: number | undefined;
      let maxSalary: number | undefined;

      if (paramSalaryRange && paramSalaryRange !== 'negotiable') {
        const [min, max] = paramSalaryRange.split('-').map(Number);
        if (!isNaN(min)) minSalary = min;
        if (!isNaN(max)) maxSalary = max;
      }

      const params: SearchJobsParams = {
        query: paramQuery || undefined,
        location: paramLocation !== 'Tất cả địa điểm' ? paramLocation : undefined,
        level: paramLevel !== 'Tất cả cấp bậc' ? paramLevel : undefined,
        minSalary,
        maxSalary,
        sort: sortBy,
        isHot: filterHot ? true : undefined,
        isUrgent: filterUrgent ? true : undefined,
        isFeatured: filterFeatured ? true : undefined,
        page: currentPage,
        limit: 10,
      };

      const res = await searchJobsApi(params, accessToken);
      setJobs(res.result || []);
      setTotalRecords(res.meta?.total || 0);
      setTotalPages(res.meta?.pages || 1);
    } catch {
      setJobs([]);
      setTotalRecords(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [
    paramQuery,
    paramLocation,
    paramLevel,
    paramSalaryRange,
    sortBy,
    filterHot,
    filterUrgent,
    filterFeatured,
    currentPage,
    accessToken,
  ]);

  useEffect(() => {
    fetchJobs();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [fetchJobs]);

  // Handle Search Bar submit
  const handleSearch = (newParams: {
    query: string;
    location: string;
    level: string;
    salaryRange: string;
  }) => {
    const updated = new URLSearchParams(searchParams);
    if (newParams.query) updated.set('query', newParams.query);
    else updated.delete('query');

    if (newParams.location && newParams.location !== 'Tất cả địa điểm')
      updated.set('location', newParams.location);
    else updated.delete('location');

    if (newParams.level && newParams.level !== 'Tất cả cấp bậc')
      updated.set('level', newParams.level);
    else updated.delete('level');

    if (newParams.salaryRange) updated.set('salaryRange', newParams.salaryRange);
    else updated.delete('salaryRange');

    updated.set('page', '1');
    setCurrentPage(1);
    setSearchParams(updated);
  };

  // Handle Quick Skill click in sidebar
  const handleSkillSelect = (skill: string) => {
    const updated = new URLSearchParams(searchParams);
    updated.set('query', skill);
    updated.set('page', '1');
    setCurrentPage(1);
    setSearchParams(updated);
  };

  // Toggle Save Job
  const handleToggleSave = (job: JobItem) => {
    let nextSaved: string[];
    if (savedJobIds.includes(job._id)) {
      nextSaved = savedJobIds.filter((id) => id !== job._id);
      info('Đã bỏ lưu việc làm');
    } else {
      nextSaved = [...savedJobIds, job._id];
      info('Đã lưu việc làm vào danh sách yêu thích');
    }
    setSavedJobIds(nextSaved);
    localStorage.setItem('talentpulse_saved_jobs', JSON.stringify(nextSaved));
  };

  // Reset all filters
  const handleResetFilters = () => {
    setSelectedJob(null);
    setSortBy('relevance');
    setFilterHot(false);
    setFilterUrgent(false);
    setFilterFeatured(false);
    setCurrentPage(1);
    setSearchParams(new URLSearchParams());
  };

  // Title generation
  const getPageHeading = () => {
    const parts: string[] = [];
    if (paramQuery) parts.push(`"${paramQuery}"`);
    else parts.push('Full Stack, Developer & Công nghệ thông tin');

    if (paramLocation && paramLocation !== 'Tất cả địa điểm') {
      parts.push(`tại ${paramLocation}`);
    }
    return parts.join(' ');
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950 font-sans">
      <Header />

      <main className="flex-1 pt-20 pb-16">
        {/* HERO SEARCH SECTION */}
        <section className="relative bg-gradient-to-b from-blue-600/10 via-primary/5 to-transparent dark:from-blue-950/40 dark:via-slate-900/40 dark:to-transparent py-8 sm:py-12 px-4 border-b border-slate-200/60 dark:border-slate-800">
          <div className="mx-auto max-w-7xl">
            <div className="text-center max-w-3xl mx-auto mb-6 sm:mb-8">
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light border border-primary/20 mb-3">
                <Sparkles className="w-3.5 h-3.5" />
                Khám phá 1.000+ Việc làm IT Hot
              </span>
              <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight">
                Tìm kiếm cơ hội việc làm IT hàng đầu
              </h1>
              <p className="mt-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                Khám phá hàng ngàn vị trí tuyển dụng với mức lương hấp dẫn và môi trường chuyên nghiệp.
              </p>
            </div>

            {/* Embedded Search Bar */}
            <div className="max-w-5xl mx-auto">
              <JobSearchBar
                initialQuery={paramQuery}
                initialLocation={paramLocation}
                initialLevel={paramLevel}
                initialSalaryRange={paramSalaryRange}
                onSearch={handleSearch}
              />
            </div>
          </div>
        </section>

        {/* SEARCH RESULTS 2-COLUMN SECTION */}
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT COLUMN: RESULTS & CARDS (5 cols when preview is active, 8 cols when default) */}
            <div className={`${selectedJob ? 'lg:col-span-5' : 'lg:col-span-8'} space-y-4`}>
              {/* RESULTS TOOLBAR HEADER */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>Tuyển dụng {getPageHeading()}</span>
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                    Tìm thấy <span className="font-bold text-primary dark:text-primary-light">{totalRecords}</span> việc làm phù hợp
                  </p>
                </div>

                {/* Sort Dropdown */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap flex items-center gap-1">
                    <ArrowUpDown className="w-3.5 h-3.5" />
                    Ưu tiên:
                  </span>
                  <select
                    value={sortBy}
                    onChange={(e) => {
                      const newSort = e.target.value as any;
                      setSortBy(newSort);
                      const updated = new URLSearchParams(searchParams);
                      updated.set('sort', newSort);
                      setSearchParams(updated);
                    }}
                    className="text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl px-3 py-2 outline-none cursor-pointer hover:border-primary transition-colors"
                  >
                    <option value="relevance">Phù hợp nhất</option>
                    <option value="newest">Mới nhất</option>
                    <option value="salary_desc">Lương cao nhất</option>
                    <option value="salary_asc">Lương thấp nhất</option>
                  </select>
                </div>
              </div>

              {/* QUICK FILTER CHIPS BAR */}
              <div className="flex items-center flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setFilterHot(!filterHot)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-semibold transition-all cursor-pointer ${
                    filterHot
                      ? 'bg-gradient-to-r from-red-500 to-amber-500 text-white border-transparent shadow-xs shadow-red-500/20'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-red-400'
                  }`}
                >
                  <Flame className={`w-3.5 h-3.5 ${filterHot ? 'fill-white' : 'text-red-500'}`} />
                  Tin HOT
                </button>

                <button
                  type="button"
                  onClick={() => setFilterUrgent(!filterUrgent)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-semibold transition-all cursor-pointer ${
                    filterUrgent
                      ? 'bg-amber-500 text-white border-amber-500 shadow-xs shadow-amber-500/20'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-amber-400'
                  }`}
                >
                  <Zap className={`w-3.5 h-3.5 ${filterUrgent ? 'fill-white' : 'text-amber-500'}`} />
                  Tuyển gấp
                </button>

                <button
                  type="button"
                  onClick={() => setFilterFeatured(!filterFeatured)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-semibold transition-all cursor-pointer ${
                    filterFeatured
                      ? 'bg-primary text-white border-primary shadow-xs shadow-primary/20'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-primary'
                  }`}
                >
                  <Sparkles className={`w-3.5 h-3.5 ${filterFeatured ? 'fill-white' : 'text-primary'}`} />
                  Nổi bật
                </button>

                {(paramQuery ||
                  paramLocation !== 'Tất cả địa điểm' ||
                  paramLevel !== 'Tất cả cấp bậc' ||
                  paramSalaryRange ||
                  filterHot ||
                  filterUrgent ||
                  filterFeatured) && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors ml-auto cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Xóa bộ lọc
                  </button>
                )}
              </div>

              {/* JOB CARDS LIST */}
              {loading ? (
                // Shimmer Loading Skeletons
                <div className="space-y-4">
                  {[...Array(6)].map((_, idx) => (
                    <div
                      key={idx}
                      className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 animate-pulse space-y-3"
                    >
                      <div className="flex items-start gap-4">
                        <div className="w-14 h-14 bg-slate-200 dark:bg-slate-800 rounded-2xl shrink-0" />
                        <div className="flex-1 space-y-2">
                          <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded-md w-3/4" />
                          <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded-md w-1/2" />
                          <div className="flex gap-2 pt-1">
                            <div className="h-6 w-20 bg-slate-200 dark:bg-slate-800 rounded-lg" />
                            <div className="h-6 w-24 bg-slate-200 dark:bg-slate-800 rounded-lg" />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : jobs.length === 0 ? (
                // Empty state
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-12 text-center border border-slate-200/80 dark:border-slate-800 shadow-sm">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
                    <Inbox className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                    Không tìm thấy việc làm phù hợp
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                    Thử tìm kiếm với từ khóa khác, nới lỏng các tiêu chí lọc địa điểm hoặc mức lương để có thêm kết quả.
                  </p>
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="mt-6 px-5 py-2.5 bg-primary hover:bg-primary-dark text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-primary/25 cursor-pointer"
                  >
                    Xem tất cả việc làm
                  </button>
                </div>
              ) : (
                // Job List
                <div className="space-y-3.5">
                  {jobs.map((job) => (
                    <JobCardHorizontal
                      key={job._id}
                      job={job}
                      isCompact={Boolean(selectedJob)}
                      isSelected={selectedJob?._id === job._id}
                      onSelect={(j) => setSelectedJob(j)}
                      isSaved={savedJobIds.includes(job._id)}
                      onToggleSave={handleToggleSave}
                      onQuickApply={(j) => setApplyingJob(j)}
                    />
                  ))}
                </div>
              )}

              {/* PAGINATION */}
              {totalPages > 1 && !loading && (
                <div className="mt-8 flex items-center justify-between bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 shadow-xs select-none">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Trang <span className="font-bold text-slate-800 dark:text-slate-200">{currentPage}</span> / {totalPages}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {/* Prev Button */}
                    <button
                      type="button"
                      disabled={currentPage <= 1}
                      onClick={() => {
                        const next = Math.max(1, currentPage - 1);
                        setCurrentPage(next);
                        const updated = new URLSearchParams(searchParams);
                        updated.set('page', next.toString());
                        setSearchParams(updated);
                      }}
                      className="w-8 h-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:border-primary hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    {/* Page Numbers */}
                    {Array.from({ length: Math.min(totalPages, 7) }).map((_, idx) => {
                      const pageNum = idx + 1;
                      const isActive = pageNum === currentPage;
                      return (
                        <button
                          key={pageNum}
                          type="button"
                          onClick={() => {
                            setCurrentPage(pageNum);
                            const updated = new URLSearchParams(searchParams);
                            updated.set('page', pageNum.toString());
                            setSearchParams(updated);
                          }}
                          className={`w-8 h-8 rounded-xl text-xs font-bold transition-all ${
                            isActive
                              ? 'bg-primary text-white shadow-sm shadow-primary/30'
                              : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-primary hover:text-primary'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}

                    {/* Next Button */}
                    <button
                      type="button"
                      disabled={currentPage >= totalPages}
                      onClick={() => {
                        const next = Math.min(totalPages, currentPage + 1);
                        setCurrentPage(next);
                        const updated = new URLSearchParams(searchParams);
                        updated.set('page', next.toString());
                        setSearchParams(updated);
                      }}
                      className="w-8 h-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:border-primary hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT COLUMN: PREVIEW PANEL OR SIDEBAR WIDGETS (7 cols when preview open, 4 cols when default) */}
            <div className={`${selectedJob ? 'lg:col-span-7' : 'lg:col-span-4'} sticky top-24`}>
              {selectedJob ? (
                <JobQuickPreview
                  job={selectedJob}
                  onClose={() => setSelectedJob(null)}
                  onApply={(j) => setApplyingJob(j)}
                  isSaved={savedJobIds.includes(selectedJob._id)}
                  onToggleSave={handleToggleSave}
                />
              ) : (
                <JobSidebarWidgets onSelectSkill={handleSkillSelect} />
              )}
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
          // Can refresh or show congratulation
        }}
      />

      <Footer />
    </div>
  );
}
