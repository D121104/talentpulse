import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Building2,
  MapPin,
  Users,
  Briefcase,
  Globe,
  Crown,
  Check,
  Plus,
  Share2,
  Copy,
  ChevronRight,
  Search,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Heart,
  Loader2,
  Sparkles,
  ArrowRight,
  Flame,
  Clock,
  ShieldCheck,
  CheckCircle2,
  Layers,
  Facebook,
  Linkedin,
  Send,
} from 'lucide-react';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import CompanyMap from '../../components/companies/CompanyMap';
import {
  CompanyDetail,
  getCompanyDetailApi,
  followCompanyApi,
  unfollowCompanyApi,
  getCompanyJobsApi,
  JobItem,
  formatSalary,
  formatDaysRemaining,
  getCompanyInitial,
  toggleSaveJobApi,
  getMySavedJobIdsApi,
} from '../../lib/jobApi';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../context/ToastContext';

// Rating options for company feedback
const RATING_OPTIONS = [
  { id: 1, emoji: '😠', label: 'Không đáng tin cậy & rõ ràng' },
  { id: 2, emoji: '😕', label: 'Ít đáng tin cậy & rõ ràng' },
  { id: 3, emoji: '😐', label: 'Bình thường' },
  { id: 4, emoji: '😊', label: 'Đáng tin cậy & rõ ràng' },
  { id: 5, emoji: '😍', label: 'Rất đáng tin cậy & rõ ràng' },
];

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { accessToken, user } = useAuth();
  const { success, error, info } = useToast();

  // Company state
  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [loadingCompany, setLoadingCompany] = useState(true);

  // Tabs: 'overview' (Tổng quan) | 'jobs' (Tin tuyển dụng)
  const [activeTab, setActiveTab] = useState<'overview' | 'jobs'>('overview');

  // Description expand/collapse state
  const [isDescExpanded, setIsDescExpanded] = useState(false);

  // Rating feedback state
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [hasRated, setHasRated] = useState(false);

  // Follow state
  const [isFollowed, setIsFollowed] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [isTogglingFollow, setIsTogglingFollow] = useState(false);

  // Copy link state
  const [copiedLink, setCopiedLink] = useState(false);

  // Saved Jobs state
  const [savedJobIds, setSavedJobIds] = useState<string[]>([]);

  // Jobs tab states & filters
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [totalJobs, setTotalJobs] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(8);
  const [loadingJobs, setLoadingJobs] = useState(false);

  // Filter inputs
  const [searchName, setSearchName] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');

  // Overview preview jobs search
  const [overviewSearchName, setOverviewSearchName] = useState('');
  const [overviewSearchLocation, setOverviewSearchLocation] = useState('');

  // 1. Fetch Company Details
  const fetchCompanyDetails = useCallback(async () => {
    if (!id) return;
    setLoadingCompany(true);
    try {
      const data = await getCompanyDetailApi(id, accessToken || undefined);
      setCompany(data);
      const isUserFollow = Boolean(
        user?._id &&
          Array.isArray(data.usersFollow) &&
          data.usersFollow.includes(user._id),
      );
      setIsFollowed(isUserFollow || Boolean(data.isFollowed));
      setFollowerCount(
        Array.isArray(data.usersFollow) ? data.usersFollow.length : 0,
      );
    } catch (err: any) {
      console.error('Failed to load company detail', err);
      error(
        'Không thể tải thông tin công ty',
        err?.message || 'Vui lòng kiểm tra lại liên kết.',
      );
    } finally {
      setLoadingCompany(false);
    }
  }, [id, accessToken, user?._id]);

  // 2. Fetch Jobs belonging to this company
  const fetchCompanyJobs = useCallback(
    async (page: number, nameQuery = '', locQuery = '') => {
      if (!id) return;
      setLoadingJobs(true);
      try {
        const res = await getCompanyJobsApi({
          companyId: id,
          current: page,
          pageSize,
          name: nameQuery || undefined,
          location: locQuery || undefined,
          accessToken: accessToken || undefined,
        });
        setJobs(res?.result || []);
        setTotalJobs(res?.meta?.total ?? 0);
        setCurrentPage(res?.meta?.current ?? 1);
      } catch (err) {
        console.error('Failed to load company jobs', err);
      } finally {
        setLoadingJobs(false);
      }
    },
    [id, pageSize, accessToken],
  );

  // 3. Fetch Saved Job IDs for user
  useEffect(() => {
    if (accessToken) {
      void getMySavedJobIdsApi(accessToken)
        .then((ids) => {
          if (Array.isArray(ids)) setSavedJobIds(ids);
        })
        .catch(() => {});
    }
  }, [accessToken]);

  // Initial load
  useEffect(() => {
    void fetchCompanyDetails();
    void fetchCompanyJobs(1);
  }, [fetchCompanyDetails, fetchCompanyJobs]);

  // Handle Follow / Unfollow Toggle
  const handleToggleFollow = async () => {
    if (!company) return;
    if (!accessToken) {
      info('Vui lòng đăng nhập', 'Bạn cần đăng nhập để theo dõi công ty.');
      return;
    }
    if (isTogglingFollow) return;

    try {
      setIsTogglingFollow(true);
      const nextFollow = !isFollowed;
      setIsFollowed(nextFollow);
      setFollowerCount((prev) => (nextFollow ? prev + 1 : Math.max(0, prev - 1)));

      if (nextFollow) {
        await followCompanyApi(company._id, accessToken);
        success(
          'Đã theo dõi công ty',
          `Bạn sẽ nhận được thông báo khi ${company.name} đăng tuyển việc làm mới.`,
        );
      } else {
        await unfollowCompanyApi(company._id, accessToken);
        info('Đã hủy theo dõi', `Bạn đã bỏ theo dõi ${company.name}.`);
      }
    } catch (err: any) {
      // Revert on error
      setIsFollowed(!isFollowed);
      setFollowerCount((prev) => (!isFollowed ? Math.max(0, prev - 1) : prev + 1));
      error(
        'Thao tác thất bại',
        err?.message || 'Không thể cập nhật trạng thái theo dõi.',
      );
    } finally {
      setIsTogglingFollow(false);
    }
  };

  // Toggle Save Job
  const handleToggleSaveJob = async (jobId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!accessToken) {
      info('Vui lòng đăng nhập', 'Bạn cần đăng nhập để lưu việc làm.');
      return;
    }

    try {
      const res = await toggleSaveJobApi(jobId, accessToken);
      if (res.isSaved) {
        setSavedJobIds((prev) => [...prev, jobId]);
        success('Đã lưu việc làm vào danh sách yêu thích');
      } else {
        setSavedJobIds((prev) => prev.filter((item) => item !== jobId));
        info('Đã bỏ lưu việc làm');
      }
    } catch (err: any) {
      error('Lỗi', err?.message || 'Không thể lưu việc làm');
    }
  };

  // Copy Page Link
  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    success('Đã sao chép liên kết!', 'Đường dẫn công ty đã được lưu vào clipboard.');
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Handle Search in Jobs Tab
  const handleSearchJobs = (e: React.FormEvent) => {
    e.preventDefault();
    void fetchCompanyJobs(1, searchName, filterLocation);
  };

  // Handle Overview Search (switches tab and applies search)
  const handleOverviewSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchName(overviewSearchName);
    setFilterLocation(overviewSearchLocation);
    setActiveTab('jobs');
    void fetchCompanyJobs(1, overviewSearchName, overviewSearchLocation);
  };

  // Distinct categories / skills derived from company's jobs for sidebar
  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>();
    jobs.forEach((j) => {
      const catList = Array.isArray(j.categories) && j.categories.length > 0
        ? j.categories
        : Array.isArray(j.skills)
        ? j.skills.slice(0, 3)
        : [];
      catList.forEach((c) => {
        if (c && typeof c === 'string') {
          const norm = c.trim();
          if (norm) map.set(norm, (map.get(norm) || 0) + 1);
        }
      });
    });
    return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
  }, [jobs]);

  // Filtered jobs by category in Jobs tab
  const displayedJobs = useMemo(() => {
    if (filterCategory === 'all') return jobs;
    return jobs.filter((j) => {
      const allSkills = [
        ...(j.categories || []),
        ...(j.skills || []),
      ].map((s) => (typeof s === 'string' ? s.toLowerCase() : ''));
      return allSkills.includes(filterCategory.toLowerCase());
    });
  }, [jobs, filterCategory]);

  const totalPages = Math.ceil(totalJobs / pageSize) || 1;

  if (loadingCompany) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950">
        <Header />
        <div className="flex-1 flex flex-col items-center justify-center pt-24 pb-16 p-8">
          <Loader2 className="w-10 h-10 animate-spin text-primary mb-3" />
          <p className="text-sm font-bold text-slate-600 dark:text-slate-400">
            Đang tải thông tin doanh nghiệp...
          </p>
        </div>
        <Footer />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950">
        <Header />
        <div className="flex-1 flex flex-col items-center justify-center pt-24 pb-16 p-8 text-center max-w-md mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-500 flex items-center justify-center mb-4">
            <Building2 className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white">
            Không tìm thấy doanh nghiệp
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 mb-6">
            Doanh nghiệp bạn tìm kiếm không tồn tại hoặc đã ngừng hoạt động trên hệ thống.
          </p>
          <Link
            to="/companies"
            className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-dark text-white text-sm font-bold shadow-md shadow-primary/25 transition-all"
          >
            Quay lại danh sách công ty
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/70 dark:bg-slate-950 text-slate-900 dark:text-slate-100 selection:bg-primary/20">
      <Header />

      <main className="flex-1 pt-20 sm:pt-24 pb-16">
        {/* ========================================================================= */}
        {/* 1. BREADCRUMBS                                                           */}
        {/* ========================================================================= */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex items-center gap-1.5 py-3.5 text-xs text-slate-500 dark:text-slate-400 overflow-x-auto whitespace-nowrap">
            <Link to="/" className="hover:text-primary transition-colors">
              Trang chủ
            </Link>
            <ChevronRight className="w-3.5 h-3.5 shrink-0 text-slate-400" />
            <Link to="/companies" className="hover:text-primary transition-colors">
              Danh sách công ty
            </Link>
            <ChevronRight className="w-3.5 h-3.5 shrink-0 text-slate-400" />
            <span className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[280px]">
              {company.name}
            </span>
          </nav>
        </div>

        {/* ========================================================================= */}
        {/* 2. HERO COVER BANNER (TALENTPULSE SIGNATURE BLUE)                        */}
        {/* ========================================================================= */}
        <div className="relative w-full h-44 sm:h-56 md:h-64 bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 overflow-hidden">
          {/* Subtle geometric dot grid pattern */}
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#fff_1.2px,transparent_1.2px)] [background-size:16px_16px]" />
          <div className="absolute -top-12 -left-12 w-64 h-64 rounded-full bg-sky-400/20 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-12 -right-12 w-72 h-72 rounded-full bg-blue-500/20 blur-3xl pointer-events-none" />

          {/* Slogan & Verification Badge Center */}
          <div className="relative h-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center justify-center text-center pb-8 sm:pb-12">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs font-black text-white shadow-lg tracking-wide uppercase">
              <Sparkles className="w-3.5 h-3.5 text-sky-300" />
              <span>TalentPulse Pro &bull; Doanh nghiệp uy tín</span>
            </div>
            <p className="mt-2 text-xs sm:text-sm md:text-base font-bold text-sky-100/90 drop-shadow-sm max-w-lg">
              Lợi thế cho Ứng viên chất &bull; Gia nhập Doanh nghiệp hàng đầu
            </p>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 3. FLOATING COMPANY PROFILE CARD                                         */}
        {/* ========================================================================= */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-16 sm:-mt-20 relative z-20">
          <div className="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-xl shadow-slate-950/5">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              {/* Left Identity Group */}
              <div className="flex items-start sm:items-center gap-5 sm:gap-6 min-w-0 flex-1">
                {/* Logo Box with PRO badge */}
                <div className="relative h-20 w-20 sm:h-24 sm:w-24 shrink-0 rounded-2xl border-2 border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 shadow-lg shadow-slate-950/10 flex items-center justify-center overflow-hidden">
                  {company.logo ? (
                    <img
                      src={company.logo}
                      alt={company.name}
                      className="h-full w-full object-contain rounded-xl"
                    />
                  ) : (
                    <div className="w-full h-full rounded-xl bg-gradient-to-br from-primary/10 to-blue-600/20 flex items-center justify-center text-primary font-black text-2xl">
                      {getCompanyInitial(company.name)}
                    </div>
                  )}

                  {/* PRO Badge on Logo */}
                  {company.isPremium && (
                    <div className="absolute top-1 right-1">
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 px-1.5 py-0.2 text-[9px] font-black text-white shadow-xs">
                        <Crown className="w-2.5 h-2.5 fill-current" />
                        PRO
                      </span>
                    </div>
                  )}
                </div>

                {/* Name & Links */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 dark:text-white tracking-tight leading-snug">
                      {company.name}
                    </h1>
                    {company.isPremium && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-xs font-black text-amber-600 dark:text-amber-400">
                        <Crown className="w-3 h-3 fill-current" />
                        <span>DOANH NGHIỆP PRO</span>
                      </span>
                    )}
                  </div>

                  {/* Metadata Row: Website & Followers */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
                    {company.website ? (
                      <a
                        href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-primary hover:underline font-semibold"
                        title={company.website}
                      >
                        <Globe className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate max-w-[200px] sm:max-w-xs">{company.website}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    ) : (
                      <span className="flex items-center gap-1.5 text-slate-400">
                        <Globe className="w-3.5 h-3.5 shrink-0" />
                        <span>Chưa có website</span>
                      </span>
                    )}

                    <span className="flex items-center gap-1.5 font-medium">
                      <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span><strong>{followerCount.toLocaleString('vi-VN')}</strong> người theo dõi</span>
                    </span>

                    <span className="flex items-center gap-1.5 font-medium">
                      <Briefcase className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span><strong>{totalJobs}</strong> vị trí đang tuyển</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Action: Follow Button */}
              <div className="w-full md:w-auto flex items-center justify-end">
                <button
                  type="button"
                  onClick={handleToggleFollow}
                  disabled={isTogglingFollow}
                  className={`w-full md:w-auto inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3 text-sm font-bold transition-all duration-200 active:scale-95 cursor-pointer shadow-sm ${
                    isFollowed
                      ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                      : 'bg-primary hover:bg-primary-dark text-white shadow-primary/25 hover:shadow-md hover:shadow-primary/30'
                  }`}
                >
                  {isFollowed ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 stroke-[3]" />
                      <span>Đang theo dõi</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 stroke-[3]" />
                      <span>+ Theo dõi</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Navigation Tabs Header */}
            <div className="mt-8 border-t border-slate-100 dark:border-slate-800 pt-3 flex items-center gap-8">
              <button
                type="button"
                onClick={() => setActiveTab('overview')}
                className={`relative pb-3 text-sm font-extrabold transition-colors cursor-pointer ${
                  activeTab === 'overview'
                    ? 'text-primary'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                <span>Tổng quan</span>
                {activeTab === 'overview' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-primary" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('jobs')}
                className={`relative pb-3 text-sm font-extrabold transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'jobs'
                    ? 'text-primary'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                <span>Tin tuyển dụng</span>
                <span className="px-2 py-0.5 rounded-full bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary-light text-xs font-black">
                  {totalJobs}
                </span>
                {activeTab === 'jobs' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-primary" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 4. TAB CONTENT: TỔNG QUAN (OVERVIEW)                                     */}
        {/* ========================================================================= */}
        {activeTab === 'overview' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* LEFT COLUMN: 8 COLS */}
              <div className="lg:col-span-8 space-y-6">
                {/* 1. Box Giới thiệu công ty (Clamp + Xem thêm) */}
                <div className="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-7 shadow-sm">
                  <div className="border-l-4 border-primary pl-3 mb-4">
                    <h2 className="text-lg font-black text-slate-900 dark:text-white">
                      Giới thiệu công ty
                    </h2>
                  </div>

                  {company.description ? (
                    <div className="relative">
                      {/* Truncated container with fade effect */}
                      <div
                        className={`text-sm text-slate-600 dark:text-slate-300 leading-relaxed transition-all duration-300 overflow-hidden ${
                          isDescExpanded ? 'max-h-none' : 'max-h-36'
                        }`}
                      >
                        <div
                          dangerouslySetInnerHTML={{ __html: company.description }}
                          className="prose prose-slate dark:prose-invert max-w-none text-sm"
                        />
                      </div>

                      {/* Gradient fade overlay when collapsed */}
                      {!isDescExpanded && (
                        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white dark:from-slate-900 to-transparent pointer-events-none" />
                      )}

                      {/* Expand / Collapse Button */}
                      <div className="mt-3 pt-2 text-center">
                        <button
                          type="button"
                          onClick={() => setIsDescExpanded(!isDescExpanded)}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary-dark transition-colors cursor-pointer"
                        >
                          <span>{isDescExpanded ? 'Thu gọn nội dung' : 'Xem thêm'}</span>
                          {isDescExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">
                      Doanh nghiệp chưa cập nhật phần giới thiệu chi tiết.
                    </p>
                  )}
                </div>

                {/* 2. Box Khảo sát Độ tin cậy & Rõ ràng (Rating Feedback) */}
                <div className="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-7 shadow-sm">
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                    Bạn thấy độ tin cậy & rõ ràng của thông tin công ty này thế nào?
                  </h3>

                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                    {RATING_OPTIONS.map((item) => {
                      const isSelected = selectedRating === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setSelectedRating(item.id);
                            setHasRated(true);
                            success(
                              'Cảm ơn bạn!',
                              'Ý kiến đánh giá độ tin cậy của bạn đã được ghi nhận.',
                            );
                          }}
                          className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center justify-between min-h-[96px] cursor-pointer ${
                            isSelected
                              ? 'border-primary bg-primary/10 text-primary shadow-sm ring-2 ring-primary/20'
                              : 'border-slate-200/80 dark:border-slate-800 hover:border-primary/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          <span className="text-2xl sm:text-3xl filter drop-shadow-xs">{item.emoji}</span>
                          <span className="mt-2 text-[11px] font-semibold leading-tight line-clamp-2">
                            {item.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {hasRated && (
                    <div className="mt-3.5 flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 p-2.5 rounded-xl border border-emerald-200/60 dark:border-emerald-800/60 animate-fade-in">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>Cảm ơn đóng góp của bạn để xây dựng cộng đồng tuyển dụng minh bạch!</span>
                    </div>
                  )}
                </div>

                {/* 3. Box Tin tuyển dụng xem trước (Preview Jobs with Quick Search) */}
                <div className="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-7 shadow-sm space-y-4">
                  <div className="border-l-4 border-primary pl-3">
                    <h2 className="text-lg font-black text-slate-900 dark:text-white">
                      Tin tuyển dụng
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Các vị trí đang mở ứng tuyển tại {company.name}
                    </p>
                  </div>

                  {/* Quick Search Toolbar */}
                  <form
                    onSubmit={handleOverviewSearch}
                    className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row gap-2.5 items-center"
                  >
                    <div className="relative flex-1 w-full">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        value={overviewSearchName}
                        onChange={(e) => setOverviewSearchName(e.target.value)}
                        placeholder="Tên công việc, vị trí ứng tuyển..."
                        className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-primary"
                      />
                    </div>

                    <div className="relative w-full sm:w-48">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        value={overviewSearchLocation}
                        onChange={(e) => setOverviewSearchLocation(e.target.value)}
                        placeholder="Địa điểm..."
                        className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-primary"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full sm:w-auto px-5 py-2 rounded-xl bg-primary hover:bg-primary-dark text-white text-xs font-bold shadow-md shadow-primary/20 transition cursor-pointer shrink-0"
                    >
                      Tìm kiếm
                    </button>
                  </form>

                  {/* Jobs List (Preview top 3) */}
                  {jobs.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400">
                      Hiện doanh nghiệp chưa có tin tuyển dụng nào đang hoạt động.
                    </div>
                  ) : (
                    <div className="space-y-3 pt-2">
                      {jobs.slice(0, 3).map((job) => {
                        const isSaved = savedJobIds.includes(job._id);
                        return (
                          <div
                            key={job._id}
                            className="group rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 hover:border-primary/50 hover:shadow-md transition-all flex items-start gap-4"
                          >
                            {/* Company Logo */}
                            <Link
                              to={`/jobs/${job._id}`}
                              className="w-12 h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1 shrink-0 flex items-center justify-center overflow-hidden"
                            >
                              {company.logo ? (
                                <img
                                  src={company.logo}
                                  alt={company.name}
                                  className="w-full h-full object-contain"
                                />
                              ) : (
                                <div className="w-full h-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center">
                                  {getCompanyInitial(company.name)}
                                </div>
                              )}
                            </Link>

                            {/* Job Info */}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <h4 className="text-sm font-extrabold text-slate-900 dark:text-white group-hover:text-primary transition-colors line-clamp-1">
                                    <Link to={`/jobs/${job._id}`}>{job.name}</Link>
                                  </h4>
                                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                                    {company.name}
                                  </p>
                                </div>

                                {/* Salary Badge */}
                                <span className="font-extrabold text-xs text-primary dark:text-primary-light shrink-0">
                                  {formatSalary(job.salary)}
                                </span>
                              </div>

                              {/* Tags & Save Button */}
                              <div className="mt-3 flex items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                                  {job.location && (
                                    <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                      {job.location.split(',')[0]}
                                    </span>
                                  )}
                                  {job.level && (
                                    <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                      {job.level}
                                    </span>
                                  )}
                                </div>

                                <button
                                  type="button"
                                  onClick={(e) => handleToggleSaveJob(job._id, e)}
                                  className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                                    isSaved
                                      ? 'bg-rose-50 border-rose-200 text-rose-500 dark:bg-rose-950/40 dark:border-rose-900/60'
                                      : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-500'
                                  }`}
                                  title="Lưu tin"
                                >
                                  <Heart
                                    className={`w-4 h-4 ${isSaved ? 'fill-rose-500' : ''}`}
                                  />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Xem thêm việc làm button -> switches to jobs tab */}
                      {totalJobs > 3 && (
                        <div className="pt-2 text-center">
                          <button
                            type="button"
                            onClick={() => setActiveTab('jobs')}
                            className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary hover:text-white text-xs font-bold text-primary dark:text-primary-light dark:hover:text-white transition-all cursor-pointer shadow-xs active:scale-95"
                          >
                            <span>Xem thêm {totalJobs - 3} việc làm khác</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT COLUMN: 4 COLS (SIDEBAR WIDGETS) */}
              <div className="lg:col-span-4 space-y-6 sticky top-24">
                {/* 1. Thông tin chung */}
                <div className="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-4">
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3">
                    Thông tin chung
                  </h3>

                  <div className="space-y-3.5 text-xs">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-primary flex items-center justify-center shrink-0">
                        <Users className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px] font-medium">Quy mô nhân sự</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {company.scale || '25-99 nhân viên'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-primary flex items-center justify-center shrink-0">
                        <Layers className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px] font-medium">Ngành nghề kinh doanh</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          Công nghệ thông tin & Phần mềm
                        </span>
                      </div>
                    </div>

                    {company.taxCode && (
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-primary flex items-center justify-center shrink-0">
                          <ShieldCheck className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[11px] font-medium">Mã số thuế</span>
                          <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                            {company.taxCode}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Địa điểm công ty (Address & Leaflet Map) */}
                <div className="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-3.5">
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3">
                    Địa điểm công ty
                  </h3>

                  {company.address ? (
                    <div className="space-y-3">
                      <div className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300">
                        <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <span className="font-medium leading-relaxed">{company.address}</span>
                      </div>

                      {/* Embedded Interactive Leaflet Map */}
                      <CompanyMap
                        companyName={company.name}
                        address={company.address}
                        lat={company.lat}
                        lon={company.lon}
                        logo={company.logo}
                        className="h-56 w-full rounded-2xl"
                      />
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">
                      Doanh nghiệp chưa cập nhật địa chỉ trụ sở.
                    </p>
                  )}
                </div>

                {/* 3. Chia sẻ công ty */}
                <div className="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-4">
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-2">
                    <Share2 className="w-4 h-4 text-primary" />
                    <span>Chia sẻ công ty</span>
                  </h3>

                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                      Sao chép đường dẫn
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={window.location.href}
                        className="flex-1 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 select-all truncate"
                      />
                      <button
                        type="button"
                        onClick={handleCopyLink}
                        className="p-2.5 rounded-xl bg-primary hover:bg-primary-dark text-white transition shadow-sm cursor-pointer active:scale-95"
                        title="Sao chép"
                      >
                        {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Social share icons */}
                  <div className="pt-2">
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-2">
                      Chia sẻ qua mạng xã hội
                    </span>
                    <div className="flex items-center gap-2">
                      <a
                        href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-9 h-9 rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition shadow-xs cursor-pointer"
                        title="Chia sẻ lên Facebook"
                      >
                        <Facebook className="w-4 h-4" />
                      </a>
                      <a
                        href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.href)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-9 h-9 rounded-xl bg-sky-700 hover:bg-sky-800 text-white flex items-center justify-center transition shadow-xs cursor-pointer"
                        title="Chia sẻ lên LinkedIn"
                      >
                        <Linkedin className="w-4 h-4" />
                      </a>
                      <a
                        href={`https://t.me/share/url?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(`Khám phá cơ hội nghề nghiệp tại ${company.name}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-9 h-9 rounded-xl bg-sky-500 hover:bg-sky-600 text-white flex items-center justify-center transition shadow-xs cursor-pointer"
                        title="Chia sẻ qua Telegram"
                      >
                        <Send className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 5. TAB CONTENT: TIN TUYỂN DỤNG (JOBS TAB - LAYOUT ẢNH 3 & 4)              */}
        {/* ========================================================================= */}
        {activeTab === 'jobs' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 space-y-6">
            {/* Title Header */}
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Việc làm tại {company.name}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Khám phá các vị trí tuyển dụng hấp dẫn và ứng tuyển ngay hôm nay
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* LEFT COLUMN: 4 COLS (CATEGORY FILTER SIDEBAR) */}
              <div className="lg:col-span-4 space-y-6">
                <div className="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-4">
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3">
                    Danh mục nghề / Kỹ năng
                  </h3>

                  <div className="space-y-1.5">
                    {/* All Categories Option */}
                    <button
                      type="button"
                      onClick={() => setFilterCategory('all')}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        filterCategory === 'all'
                          ? 'bg-primary text-white shadow-sm shadow-primary/25'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                      }`}
                    >
                      <span>Tất cả vị trí</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                          filterCategory === 'all'
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {totalJobs}
                      </span>
                    </button>

                    {/* Derived Categories */}
                    {categoryCounts.map((cat) => {
                      const isSelected = filterCategory === cat.name;
                      return (
                        <button
                          key={cat.name}
                          type="button"
                          onClick={() => setFilterCategory(cat.name)}
                          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-primary text-white shadow-sm shadow-primary/25'
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                          }`}
                        >
                          <span className="truncate">{cat.name}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                              isSelected
                                ? 'bg-white/20 text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {cat.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Company Mini Card in Sidebar */}
                <div className="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-3">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                    Thông tin thêm
                  </span>
                  <div className="text-xs text-slate-600 dark:text-slate-300 space-y-2">
                    <p>
                      Hồ sơ của bạn sẽ được chuyển thẳng đến đội ngũ tuyển dụng của <strong>{company.name}</strong>.
                    </p>
                    <p>
                      Mỗi hồ sơ ứng tuyển đều được phân tích độ tương đồng tự động bằng <strong>AI Matching</strong> để phản hồi nhanh nhất.
                    </p>
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN: 8 COLS (SEARCH BAR & JOBS LIST) */}
              <div className="lg:col-span-8 space-y-5">
                {/* Search Header Bar */}
                <form
                  onSubmit={handleSearchJobs}
                  className="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm flex flex-col sm:flex-row gap-3 items-center"
                >
                  <div className="relative flex-1 w-full">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={searchName}
                      onChange={(e) => setSearchName(e.target.value)}
                      placeholder="Tên công việc, vị trí ứng tuyển..."
                      className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div className="relative w-full sm:w-52">
                    <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={filterLocation}
                      onChange={(e) => setFilterLocation(e.target.value)}
                      placeholder="Tất cả tỉnh/thành phố..."
                      className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:border-primary"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-dark text-white text-xs sm:text-sm font-bold shadow-md shadow-primary/25 transition cursor-pointer shrink-0 active:scale-95"
                  >
                    Tìm kiếm
                  </button>
                </form>

                {/* Job Cards List */}
                {loadingJobs ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
                    <span className="text-xs font-semibold text-slate-500">Đang tìm việc làm...</span>
                  </div>
                ) : displayedJobs.length === 0 ? (
                  <div className="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center shadow-sm">
                    <Briefcase className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                    <h4 className="text-base font-bold text-slate-800 dark:text-slate-200">
                      Không tìm thấy việc làm phù hợp
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Hãy thử đổi từ khóa tìm kiếm hoặc bấm xem tất cả vị trí.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {displayedJobs.map((job) => {
                      const isSaved = savedJobIds.includes(job._id);
                      return (
                        <div
                          key={job._id}
                          className="group rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:border-primary hover:shadow-lg transition-all flex flex-col sm:flex-row items-start gap-4"
                        >
                          {/* Logo */}
                          <Link
                            to={`/jobs/${job._id}`}
                            className="w-14 h-14 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1.5 shrink-0 flex items-center justify-center overflow-hidden group-hover:scale-105 transition-transform"
                          >
                            {company.logo ? (
                              <img
                                src={company.logo}
                                alt={company.name}
                                className="w-full h-full object-contain"
                              />
                            ) : (
                              <div className="w-full h-full bg-primary/10 text-primary font-black text-sm flex items-center justify-center">
                                {getCompanyInitial(company.name)}
                              </div>
                            )}
                          </Link>

                          {/* Content Group */}
                          <div className="min-w-0 flex-1 w-full">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {job.isHot && (
                                    <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-black text-white shadow-xs">
                                      <Flame className="w-3 h-3 fill-current" />
                                      HOT
                                    </span>
                                  )}
                                  <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white group-hover:text-primary transition-colors line-clamp-1">
                                    <Link to={`/jobs/${job._id}`}>{job.name}</Link>
                                  </h3>
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
                                  {company.name}
                                </p>
                              </div>

                              {/* Salary */}
                              <span className="text-sm font-black text-primary dark:text-primary-light shrink-0">
                                {formatSalary(job.salary)}
                              </span>
                            </div>

                            {/* Meta & Tags Row */}
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800/80 pt-3">
                              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                {job.location && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                                    <MapPin className="w-3 h-3 text-primary" />
                                    <span>{job.location.split(',')[0]}</span>
                                  </span>
                                )}

                                {job.level && (
                                  <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                                    {job.level}
                                  </span>
                                )}

                                <span className="flex items-center gap-1 text-[11px] text-slate-400">
                                  <Clock className="w-3 h-3" />
                                  <span>{formatDaysRemaining(job.endDate)}</span>
                                </span>
                              </div>

                              {/* Save Heart Button */}
                              <button
                                type="button"
                                onClick={(e) => handleToggleSaveJob(job._id, e)}
                                className={`p-2 rounded-xl border transition-all cursor-pointer ${
                                  isSaved
                                    ? 'bg-rose-50 border-rose-200 text-rose-500 dark:bg-rose-950/40 dark:border-rose-900/60 shadow-xs'
                                    : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-500 hover:border-rose-300'
                                }`}
                                title="Lưu việc làm này"
                              >
                                <Heart className={`w-4 h-4 ${isSaved ? 'fill-rose-500' : ''}`} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Full Pagination Controls */}
                {totalJobs > pageSize && (
                  <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-200 dark:border-slate-800">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Hiển thị <strong>{(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, totalJobs)}</strong> trong tổng số <strong>{totalJobs}</strong> việc làm
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const prev = Math.max(1, currentPage - 1);
                          setCurrentPage(prev);
                          void fetchCompanyJobs(prev, searchName, filterLocation);
                        }}
                        disabled={currentPage === 1}
                        className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition cursor-pointer"
                      >
                        Trước
                      </button>

                      <span className="px-3 py-1.5 rounded-xl bg-primary/10 text-primary font-bold text-xs">
                        {currentPage} / {totalPages} trang
                      </span>

                      <button
                        type="button"
                        onClick={() => {
                          const next = Math.min(totalPages, currentPage + 1);
                          setCurrentPage(next);
                          void fetchCompanyJobs(next, searchName, filterLocation);
                        }}
                        disabled={currentPage === totalPages}
                        className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition cursor-pointer"
                      >
                        Sau
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
