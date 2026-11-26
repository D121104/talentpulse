import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Building2,
  Search,
  X,
  Filter,
  ChevronRight,
  Loader2,
  Sparkles,
} from 'lucide-react';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import CompanyCard from '../../components/companies/CompanyCard';
import {
  CompanyListItem,
  getCompaniesDirectoryApi,
} from '../../lib/jobApi';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../context/ToastContext';

const SCALE_OPTIONS = [
  { id: '', label: 'Tất cả quy mô' },
  { id: '10-50', label: '10 - 50 nhân viên' },
  { id: '50-100', label: '50 - 100 nhân viên' },
  { id: '100-500', label: '100 - 500 nhân viên' },
  { id: '500+', label: 'Trên 500 nhân viên' },
];

const PAGE_SIZE = 9;

export default function CompanyListPage() {
  const { user, accessToken } = useAuth();
  const { error } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // Search query from URL or local state
  const initialSearch = searchParams.get('search') || '';
  const initialScale = searchParams.get('scale') || '';

  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [activeScale, setActiveScale] = useState(initialScale);
  const [submittedSearch, setSubmittedSearch] = useState(initialSearch);

  const [companies, setCompanies] = useState<CompanyListItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [loadingInitial, setLoadingInitial] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Fetch companies for page 1 on search or scale change
  const fetchCompanies = useCallback(
    async (page: number, isLoadMore = false) => {
      try {
        if (isLoadMore) {
          setLoadingMore(true);
        } else {
          setLoadingInitial(true);
        }

        const res = await getCompaniesDirectoryApi({
          current: page,
          pageSize: PAGE_SIZE,
          search: submittedSearch,
          scale: activeScale,
          userId: user?._id,
          accessToken: accessToken || undefined,
        });

        const list = Array.isArray(res.result) ? res.result : [];
        const totalRecords = res.meta?.total ?? list.length;

        setTotal(totalRecords);
        setCurrentPage(page);

        if (isLoadMore) {
          setCompanies((prev) => [...prev, ...list]);
        } else {
          setCompanies(list);
        }
      } catch (err: any) {
        error('Không thể tải danh sách công ty', err?.message);
      } finally {
        setLoadingInitial(false);
        setLoadingMore(false);
      }
    },
    [submittedSearch, activeScale, user?._id, accessToken, error],
  );

  // Trigger fetch on query change
  useEffect(() => {
    void fetchCompanies(1, false);
  }, [fetchCompanies]);

  // Handle Search Submit
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSearch = searchTerm.trim();
    setSubmittedSearch(cleanSearch);

    // Update URL query params
    const nextParams = new URLSearchParams();
    if (cleanSearch) nextParams.set('search', cleanSearch);
    if (activeScale) nextParams.set('scale', activeScale);
    setSearchParams(nextParams, { replace: true });
  };

  // Handle Clear Search
  const handleClearSearch = () => {
    setSearchTerm('');
    setSubmittedSearch('');
    const nextParams = new URLSearchParams();
    if (activeScale) nextParams.set('scale', activeScale);
    setSearchParams(nextParams, { replace: true });
    searchInputRef.current?.focus();
  };

  // Handle Scale Filter Change
  const handleScaleChange = (scaleValue: string) => {
    setActiveScale(scaleValue);
    const nextParams = new URLSearchParams();
    if (submittedSearch) nextParams.set('search', submittedSearch);
    if (scaleValue) nextParams.set('scale', scaleValue);
    setSearchParams(nextParams, { replace: true });
  };

  // Handle Load More (fetch next 9 companies)
  const handleLoadMore = () => {
    if (loadingMore || companies.length >= total) return;
    const nextPage = currentPage + 1;
    void fetchCompanies(nextPage, true);
  };

  const hasMore = companies.length < total;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans text-slate-800 dark:text-slate-100 flex flex-col selection:bg-primary/20 selection:text-primary transition-colors duration-200">
      <Header />

      {/* ================= HERO BANNER & SEARCH SECTION ================= */}
      <section className="relative overflow-hidden pt-26 sm:pt-32 pb-12 sm:pb-16 bg-gradient-to-b from-blue-50/80 via-white to-slate-50 dark:from-slate-900 dark:via-slate-900/90 dark:to-slate-950 border-b border-slate-200/80 dark:border-slate-800/80">
        {/* Subtle decorative glow balls */}
        <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[650px] h-[250px] bg-primary/10 dark:bg-primary/15 blur-[100px] rounded-full pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Breadcrumbs */}
          <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            <Link to="/" className="hover:text-primary transition-colors">
              Trang chủ
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="font-semibold text-slate-900 dark:text-white">
              Danh sách công ty
            </span>
          </nav>

          {/* Heading */}
          <div className="text-center max-w-3xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3.5 py-1 text-xs font-bold text-primary dark:bg-primary/20 dark:text-primary-light mb-3 shadow-2xs"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Hơn 500+ Doanh nghiệp & Tập đoàn công nghệ</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="text-2xl sm:text-4xl lg:text-5xl font-black text-slate-900 dark:text-white tracking-tight leading-tight"
            >
              Khám Phá <span className="text-primary">Văn Hoá Công Ty</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.15 }}
              className="mt-2.5 text-xs sm:text-base text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed"
            >
              Tìm hiểu văn hoá công ty, môi trường làm việc lý tưởng và chọn cho bạn nơi phát triển sự nghiệp vững chắc cùng các nhà tuyển dụng hàng đầu.
            </motion.p>
          </div>

          {/* Large Royal Blue Search Bar */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="mt-8 max-w-3xl mx-auto"
          >
            <form
              onSubmit={handleSearchSubmit}
              className="flex items-center gap-2 rounded-2xl bg-white dark:bg-slate-900 p-2 sm:p-2.5 border border-slate-200 dark:border-slate-700 shadow-xl shadow-slate-950/5 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 transition-all duration-200"
            >
              <div className="flex items-center pl-3 text-slate-400">
                <Search className="h-5 w-5 text-primary" />
              </div>

              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Nhập tên công ty, địa chỉ, khu vực tuyển dụng..."
                className="w-full bg-transparent px-3 py-2 text-xs sm:text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
              />

              {searchTerm && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors rounded-lg cursor-pointer"
                  title="Xóa tìm kiếm"
                >
                  <X className="h-4 w-4" />
                </button>
              )}

              <button
                type="submit"
                className="flex items-center gap-1.5 rounded-xl bg-primary hover:bg-primary-dark px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-primary/25 transition-all duration-150 active:scale-95 cursor-pointer shrink-0"
              >
                <span>Tìm kiếm</span>
              </button>
            </form>
          </motion.div>
        </div>
      </section>

      {/* ================= MAIN CONTENT SECTION ================= */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {/* Header Title + Scale Filter Dropdown Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200/80 dark:border-slate-800/80">
          <div>
            <h2 className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <span>Công ty nổi bật</span>
              <span className="text-primary font-bold text-base sm:text-xl">
                ({total.toLocaleString('vi-VN')})
              </span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {submittedSearch
                ? `Kết quả tìm kiếm cho "${submittedSearch}"`
                : 'Danh sách các doanh nghiệp đang tuyển dụng tích cực nhất trên TalentPulse.'}
            </p>
          </div>

          {/* Quick Filter Select */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative">
              <select
                value={activeScale}
                onChange={(e) => handleScaleChange(e.target.value)}
                className="appearance-none rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 pr-9 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 shadow-2xs hover:border-primary/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10 cursor-pointer"
              >
                {SCALE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <Filter className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* 1. INITIAL LOADING SKELETON (9 Cards Grid) */}
        {loadingInitial && (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: PAGE_SIZE }).map((_, idx) => (
              <div
                key={idx}
                className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 animate-pulse flex flex-col justify-between h-[360px]"
              >
                <div>
                  <div className="h-20 bg-slate-200 dark:bg-slate-800 rounded-xl mb-4 -mx-2 -mt-2" />
                  <div className="h-14 w-14 rounded-2xl bg-slate-200 dark:bg-slate-800 -mt-10 mb-3" />
                  <div className="h-4 w-3/4 bg-slate-200 dark:bg-slate-800 rounded mb-2" />
                  <div className="h-3 w-1/2 bg-slate-100 dark:bg-slate-800/60 rounded mb-4" />
                  <div className="space-y-2 mt-4">
                    <div className="h-10 bg-slate-100 dark:bg-slate-800/40 rounded-lg" />
                    <div className="h-10 bg-slate-100 dark:bg-slate-800/40 rounded-lg" />
                  </div>
                </div>
                <div className="h-9 bg-slate-200 dark:bg-slate-800 rounded-xl mt-4" />
              </div>
            ))}
          </div>
        )}

        {/* 2. EMPTY STATE */}
        {!loadingInitial && companies.length === 0 && (
          <div className="mt-12 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center max-w-lg mx-auto shadow-sm">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light">
              <Building2 className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Không tìm thấy công ty phù hợp
            </h3>
            <p className="mt-1.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              Không có doanh nghiệp nào khớp với từ khóa{' '}
              <strong className="text-slate-800 dark:text-slate-200">
                "{submittedSearch || activeScale}"
              </strong>
              . Vui lòng thử tìm kiếm bằng từ khóa khác hoặc xóa bộ lọc.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setSubmittedSearch('');
                setActiveScale('');
                setSearchParams({}, { replace: true });
              }}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-primary/20 hover:bg-primary-dark transition-all cursor-pointer active:scale-95"
            >
              <span>Xem tất cả công ty</span>
            </button>
          </div>
        )}

        {/* 3. COMPANIES 3-COLUMN GRID */}
        {!loadingInitial && companies.length > 0 && (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">
            {companies.map((company, index) => (
              <CompanyCard
                key={`${company._id}-${index}`}
                company={company}
                index={index}
                onFollowToggle={(id, followed) => {
                  setCompanies((prev) =>
                    prev.map((c) =>
                      c._id === id
                        ? {
                            ...c,
                            isFollowed: followed,
                            usersFollow: followed
                              ? [...(c.usersFollow || []), user?._id || '']
                              : (c.usersFollow || []).filter((f) => f !== user?._id),
                          }
                        : c,
                    ),
                  );
                }}
              />
            ))}
          </div>
        )}

        {/* 4. LOAD MORE BUTTON (9 items per load) */}
        {!loadingInitial && hasMore && (
          <div className="mt-12 text-center">
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="inline-flex items-center gap-2 rounded-2xl border border-primary/40 bg-white dark:bg-slate-900 px-8 py-3.5 text-xs sm:text-sm font-extrabold text-primary shadow-sm hover:bg-primary/5 dark:hover:bg-primary/10 hover:border-primary transition-all duration-200 cursor-pointer active:scale-95 disabled:opacity-60"
            >
              {loadingMore ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span>Đang tải thêm công ty...</span>
                </>
              ) : (
                <>
                  <span>Xem thêm công ty ({companies.length}/{total})</span>
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
