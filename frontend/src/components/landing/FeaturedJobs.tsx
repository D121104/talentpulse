import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Flame,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Sparkles,
  Building2,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { apiRequest } from '../../lib/api';
import { Link } from 'react-router-dom';

interface JobItem {
  _id: string;
  name: string;
  description?: string;
  skills?: string[];
  company?: {
    _id?: string;
    name?: string;
    logo?: string;
    isActive?: boolean;
  };
  salary?: number | string;
  location?: string;
  level?: string;
  isHot?: boolean;
  isFeatured?: boolean;
  createdAt?: string;
}

interface ApiResponse {
  meta: {
    current: number;
    pageSize: number;
    pages: number;
    total: number;
    isPersonalized?: boolean;
  };
  result: JobItem[];
}

function formatSalary(salary: number | string | null | undefined): string {
  if (
    salary === null ||
    salary === undefined ||
    salary === '' ||
    salary === 0 ||
    salary === '0'
  ) {
    return 'Thương lượng';
  }
  const num = typeof salary === 'string' ? parseFloat(salary) : salary;
  if (isNaN(num) || num <= 0) return 'Thương lượng';
  if (num >= 1000000) {
    const millions = (num / 1000000).toLocaleString('vi-VN', {
      maximumFractionDigits: 1,
    });
    return `Tới ${millions} triệu`;
  }
  return `${num.toLocaleString('vi-VN')} đ`;
}

function getCompanyInitial(name?: string): string {
  if (!name) return 'TP';
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function formatLocation(loc?: string): string {
  if (!loc) return 'Toàn quốc';
  // If location has comma or long address, pick city or main part
  const parts = loc.split(',');
  const lastPart = parts[parts.length - 1].trim();
  if (lastPart.toLowerCase().includes('hà nội')) return 'Hà Nội';
  if (
    lastPart.toLowerCase().includes('hồ chí minh') ||
    lastPart.toLowerCase().includes('hcm')
  )
    return 'Hồ Chí Minh';
  if (lastPart.toLowerCase().includes('đà nẵng')) return 'Đà Nẵng';
  return parts.length > 1 ? lastPart : loc;
}

export default function FeaturedJobs() {
  const { accessToken } = useAuth();

  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isPersonalized, setIsPersonalized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  const fetchJobs = async (page: number) => {
    try {
      setLoading(true);
      const res = await apiRequest<ApiResponse>(
        `/jobs/landing-popular?page=${page}&limit=9`,
        {
          accessToken,
        },
      );

      if (res && res.result) {
        setJobs(res.result);
        setCurrentPage(res.meta?.current || page);
        setTotalPages(res.meta?.pages || 1);
        setIsPersonalized(Boolean(res.meta?.isPersonalized));
      }
    } catch (err) {
      console.error('Failed to load landing popular jobs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs(currentPage);
  }, [currentPage, accessToken]);

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage((p) => p - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage((p) => p + 1);
    }
  };

  const handleImageError = (jobId: string) => {
    setImageErrors((prev) => ({ ...prev, [jobId]: true }));
  };

  return (
    <section id="featured-jobs" className="bg-slate-50/60 dark:bg-slate-950 py-16 sm:py-20 lg:py-24 border-y border-slate-200/40 dark:border-slate-800/40 transition-colors">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 sm:mb-10">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center gap-2">
              <div className="w-2.5 h-8 rounded-full bg-gradient-to-b from-primary via-blue-500 to-indigo-600 shadow-sm shadow-primary/30" />
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                Việc Làm Tốt Nhất
              </h2>
            </div>

            {isPersonalized && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20 shadow-sm animate-pulse">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Gợi ý cho bạn</span>
              </span>
            )}
          </div>

          <Link
            to="/jobs"
            className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:text-blue-700 dark:hover:text-primary-light transition-colors group self-start sm:self-auto tracking-wide uppercase"
          >
            <span>XEM TẤT CẢ</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        {/* Jobs 3x3 Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {Array.from({ length: 9 }).map((_, index) => (
              <div
                key={index}
                className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 rounded-2xl p-4 sm:p-5 flex items-center gap-4 animate-pulse shadow-sm"
              >
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-slate-200 dark:bg-slate-800 shrink-0" />
                <div className="flex-1 space-y-2.5">
                  <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
                  <div className="h-3 bg-slate-100 dark:bg-slate-800/60 rounded w-1/2" />
                  <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <Building2 className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <p className="text-slate-600 dark:text-slate-400 font-medium">
              Hiện tại chưa có việc làm nào phù hợp. Vui lòng quay lại sau!
            </p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={currentPage}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.28, ease: 'easeOut' }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5"
            >
              {jobs.map((job) => {
                const companyName = job.company?.name || 'Doanh nghiệp tuyển dụng';
                const hasLogo = job.company?.logo && !imageErrors[job._id];

                return (
                  <Link
                    key={job._id}
                    to={`/jobs/${job._id}`}
                    className="group relative flex items-center gap-3.5 sm:gap-4 p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-sm hover:shadow-lg hover:border-primary/50 dark:hover:border-primary/50 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer overflow-hidden"
                  >
                    {/* Hover subtle glow */}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-primary/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                    {/* Company Logo / Squircle */}
                    <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-800/80 flex items-center justify-center p-1.5 shrink-0 shadow-sm overflow-hidden group-hover:scale-[1.02] transition-transform duration-300">
                      {hasLogo ? (
                        <img
                          src={job.company?.logo}
                          alt={companyName}
                          onError={() => handleImageError(job._id)}
                          className="w-full h-full object-contain"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full rounded-lg bg-gradient-to-br from-primary/15 via-blue-500/10 to-indigo-500/15 text-primary dark:text-blue-400 font-extrabold text-sm sm:text-base flex items-center justify-center select-none">
                          {getCompanyInitial(companyName)}
                        </div>
                      )}
                    </div>

                    {/* Job Details */}
                    <div className="flex-1 min-w-0">
                      {/* Title & Hot Badge */}
                      <div className="flex items-start justify-between gap-1.5">
                        <h3
                          title={job.name}
                          className="text-sm sm:text-[15px] font-bold text-slate-900 dark:text-slate-100 truncate group-hover:text-primary transition-colors flex-1 leading-snug"
                        >
                          {job.name}
                        </h3>

                        {job.isHot && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-extrabold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/60 border border-red-200/80 dark:border-red-800/60 shrink-0 shadow-sm select-none">
                            <Flame className="w-3 h-3 fill-red-500 text-red-500 animate-pulse" />
                            <span>Hot</span>
                          </span>
                        )}
                      </div>

                      {/* Company Name */}
                      <p
                        title={companyName}
                        className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5 font-normal"
                      >
                        {companyName}
                      </p>

                      {/* Salary & Location Row */}
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="text-xs sm:text-sm font-semibold text-rose-600 dark:text-rose-400 truncate">
                          {formatSalary(job.salary)}
                        </span>

                        <span className="text-xs text-slate-500 dark:text-slate-400 truncate shrink-0 max-w-[120px]">
                          {formatLocation(job.location)}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </motion.div>
          </AnimatePresence>
        )}

        {/* Carousel / Pagination Navigation Controls */}
        {totalPages > 1 && (
          <div className="mt-8 sm:mt-10 flex items-center justify-center gap-2 select-none">
            {/* Prev Button */}
            <button
              onClick={handlePrevPage}
              disabled={currentPage <= 1 || loading}
              aria-label="Previous page"
              className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:border-primary hover:text-primary dark:hover:border-primary transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-sm hover:shadow"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Pagination Dots */}
            <div className="flex items-center gap-1.5 mx-2">
              {Array.from({ length: Math.min(totalPages, 10) }).map((_, idx) => {
                const pageNum = idx + 1;
                const isActive = pageNum === currentPage;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    aria-label={`Go to page ${pageNum}`}
                    className={`transition-all duration-300 ${
                      isActive
                        ? 'w-6 h-2 bg-primary rounded-full shadow-sm shadow-primary/40'
                        : 'w-2 h-2 bg-slate-300 dark:bg-slate-700 rounded-full hover:bg-slate-400 dark:hover:bg-slate-600'
                    }`}
                  />
                );
              })}
            </div>

            {/* Next Button */}
            <button
              onClick={handleNextPage}
              disabled={currentPage >= totalPages || loading}
              aria-label="Next page"
              className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:border-primary hover:text-primary dark:hover:border-primary transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-sm hover:shadow"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
