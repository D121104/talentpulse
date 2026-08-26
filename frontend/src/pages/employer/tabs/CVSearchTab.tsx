import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  MapPin,
  Loader2,
  Unlock,
  Eye,
  Download,
  Crown,
  Sparkles,
  Phone,
  Mail,
  CheckCircle2,
  FileText,
  Briefcase,
  GraduationCap,
  X,
  PlusCircle,
} from 'lucide-react';
import {
  employerApi,
  type CandidatePublicItem,
  type UnlockedCandidateInfo,
  type CandidateQuotaInfo,
} from '../../../lib/employerApi';
import { useToast } from '../../../context/ToastContext';
import { CompanyRequiredGate } from '../components/CompanyRequiredGate';
import { formatDate } from '../../../lib/dateUtils';
import { UserAvatar } from '../../../components/common/UserAvatar';

interface CVSearchTabProps {
  accessToken: string | null;
  hasCompany?: boolean;
  onNavigateTab: (tab: string, extraData?: any) => void;
}

export function CVSearchTab({
  accessToken,
  hasCompany = false,
  onNavigateTab,
}: CVSearchTabProps) {
  const { success, error } = useToast();

  // Search filter criteria
  const [searchCriteria, setSearchCriteria] = useState({
    keyword: '',
    skills: '',
    location: '',
  });

  // State
  const [results, setResults] = useState<CandidatePublicItem[]>([]);
  const [quota, setQuota] = useState<CandidateQuotaInfo | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasCompanyJobs, setHasCompanyJobs] = useState<boolean | null>(null);

  // Unlocking states
  const [unlockingCvId, setUnlockingCvId] = useState<string | null>(null);
  const [unlockedModalData, setUnlockedModalData] = useState<UnlockedCandidateInfo | null>(null);
  const [showPremiumPromptModal, setShowPremiumPromptModal] = useState(false);
  const [showConfirmUnlockModal, setShowConfirmUnlockModal] = useState<{
    candidate: CandidatePublicItem;
  } | null>(null);

  // Load quota
  const loadQuota = async () => {
    if (!accessToken || !hasCompany) return;
    try {
      const res = await employerApi.getCandidateQuota(accessToken);
      setQuota(res);
    } catch (err) {
      console.error('Failed to load quota', err);
    }
  };

  // Perform search
  const performSearch = async (pageNum = 1) => {
    if (!accessToken || !hasCompany) return;

    setIsSearching(true);
    setPage(pageNum);

    try {
      const res = await employerApi.searchCandidatesGlobal(
        {
          keyword: searchCriteria.keyword.trim() || undefined,
          skills: searchCriteria.skills.trim() || undefined,
          location: searchCriteria.location.trim() || undefined,
          current: pageNum,
          pageSize: 12,
        },
        accessToken,
      );

      setResults(res.result || []);
      setTotalPages(res.meta?.pages || 1);
      setTotalCount(res.meta?.total || 0);
      setHasCompanyJobs(res.meta?.hasCompanyJobs !== undefined ? res.meta.hasCompanyJobs : true);
    } catch (err: any) {
      console.error('Candidate search failed', err);
      error(err?.message || 'Không thể tìm kiếm ứng viên');
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    void loadQuota();
    void performSearch(1);
  }, [accessToken, hasCompany]);

  if (!hasCompany) {
    return (
      <CompanyRequiredGate
        title="Tìm kiếm Hồ sơ & CV Ứng viên"
        description="Tính năng tìm kiếm và mở khóa hồ sơ ứng viên theo bộ kỹ năng chỉ dành cho HR đã liên kết với doanh nghiệp tuyển dụng."
        onNavigateTab={onNavigateTab}
      />
    );
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void performSearch(1);
  };

  const handleResetSearch = () => {
    setSearchCriteria({ keyword: '', skills: '', location: '' });
    setTimeout(() => {
      void performSearch(1);
    }, 0);
  };

  // Handler when HR clicks to unlock / view
  const handleInitiateUnlock = (candidate: CandidatePublicItem) => {
    // If already unlocked -> directly unlock/fetch full info without confirm
    if (candidate.isUnlocked) {
      void executeUnlock(candidate);
      return;
    }

    // Check quota if free HR
    if (quota && !quota.isUnlimited && quota.remaining <= 0) {
      setShowPremiumPromptModal(true);
      return;
    }

    // Show confirmation dialog before consuming 1 credit
    setShowConfirmUnlockModal({ candidate });
  };

  // Execute unlock API
  const executeUnlock = async (candidate: CandidatePublicItem) => {
    if (!accessToken) return;
    setUnlockingCvId(candidate.cvId);
    setShowConfirmUnlockModal(null);

    try {
      const res = await employerApi.unlockCandidate(
        candidate.candidateUserId,
        {
          cvType: candidate.cvType,
          cvId: candidate.cvId,
        },
        accessToken,
      );

      // Update in results list
      setResults((prev) =>
        prev.map((c) =>
          c.cvId === candidate.cvId ? { ...c, isUnlocked: true } : c,
        ),
      );

      // Refresh quota
      await loadQuota();

      // Show unlocked full info modal
      setUnlockedModalData(res);

      if (res.isNewUnlock) {
        success(res.message || 'Mở khóa thông tin ứng viên thành công!');
      }
    } catch (err: any) {
      console.error('Failed to unlock candidate', err);
      const msg = err?.response?.data?.message || err?.message || 'Không thể mở khóa hồ sơ';
      if (msg.includes('hết hạn mức') || msg.includes('HR Premium')) {
        setShowPremiumPromptModal(true);
      } else {
        error(msg);
      }
    } finally {
      setUnlockingCvId(null);
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* 1. Header & Quota Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/90 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Search className="h-5 w-5" />
            </span>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              Tìm kiếm Ứng viên &amp; Mở khóa CV
            </h1>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Tìm kiếm hàng ngàn ứng viên tài năng theo kỹ năng, vị trí và mở khóa thông tin liên lạc trực tiếp.
          </p>
        </div>

        {/* Quota Widget */}
        <div className="shrink-0">
          {quota?.isUnlimited ? (
            <div className="flex items-center gap-2.5 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-amber-500/5 px-4 py-2.5 shadow-xs">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500 text-white shadow-xs">
                <Crown className="h-4 w-4" />
              </span>
              <div>
                <div className="text-xs font-black text-amber-700 dark:text-amber-300">
                  Gói HR Premium VIP
                </div>
                <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  Mở khóa &amp; Tải CV không giới hạn
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Lượt mở khóa hôm nay:
                  </span>
                  <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-black text-primary">
                    {quota?.usedToday ?? 0}/5 CV
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Còn lại <strong className="text-emerald-600 dark:text-emerald-400">{quota?.remaining ?? 5} lượt</strong> (Reset 00:00 UTC+7)
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('premium')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 px-3 py-1.5 text-xs font-black text-white shadow-xs transition active:scale-95 cursor-pointer shrink-0"
              >
                <Crown className="h-3.5 w-3.5" />
                <span>Nâng cấp Premium</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 2. Search Criteria Card */}
      <div className="rounded-3xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <form onSubmit={handleSearchSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            {/* Keyword */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Từ khóa / Vị trí / Mục tiêu
              </label>
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchCriteria.keyword}
                  onChange={(e) => setSearchCriteria({ ...searchCriteria, keyword: e.target.value })}
                  placeholder="Ví dụ: Backend Developer, Trưởng phòng..."
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/70 pl-10 pr-3.5 py-2.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary focus:bg-white focus:outline-none dark:border-slate-700/80 dark:bg-slate-800/80 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:border-primary transition-colors"
                />
              </div>
            </div>

            {/* Skills */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Kỹ năng chuyên môn
              </label>
              <input
                type="text"
                value={searchCriteria.skills}
                onChange={(e) => setSearchCriteria({ ...searchCriteria, skills: e.target.value })}
                placeholder="Ví dụ: React, Java, NodeJS, UI/UX..."
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary focus:bg-white focus:outline-none dark:border-slate-700/80 dark:bg-slate-800/80 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:border-primary transition-colors"
              />
            </div>

            {/* Location */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Khu vực / Tỉnh thành
              </label>
              <div className="relative">
                <MapPin className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchCriteria.location}
                  onChange={(e) => setSearchCriteria({ ...searchCriteria, location: e.target.value })}
                  placeholder="Ví dụ: Hà Nội, TP.HCM, Đà Nẵng..."
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/70 pl-10 pr-3.5 py-2.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary focus:bg-white focus:outline-none dark:border-slate-700/80 dark:bg-slate-800/80 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:border-primary transition-colors"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={handleResetSearch}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 transition dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 cursor-pointer"
            >
              Xóa bộ lọc
            </button>
            <button
              type="submit"
              disabled={isSearching}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-xs sm:text-sm font-bold text-white shadow-md shadow-primary/20 hover:bg-primary-dark transition active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span>Tìm kiếm ứng viên</span>
            </button>
          </div>
        </form>
      </div>

      {/* 2.5 Banner: Prompt to post first job if company has no jobs */}
      {hasCompanyJobs === false && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-3xl border border-blue-200/90 bg-gradient-to-br from-blue-50/80 via-indigo-50/50 to-purple-50/80 p-5 sm:p-6 shadow-xs dark:border-blue-500/30 dark:bg-gradient-to-br dark:from-blue-950/40 dark:via-slate-900 dark:to-indigo-950/30"
        >
          {/* Decorative ambient lights */}
          <div className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 rounded-full bg-blue-500/15 blur-2xl dark:bg-blue-500/20" />
          <div className="pointer-events-none absolute -left-6 -bottom-6 h-32 w-32 rounded-full bg-indigo-500/15 blur-2xl dark:bg-indigo-500/20" />

          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/25">
                <Sparkles className="h-6 w-6 animate-pulse" />
              </span>
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-600/10 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
                  <Briefcase className="h-3 w-3" /> Tối ưu trải nghiệm tuyển dụng
                </div>
                <h3 className="mt-1 text-base sm:text-lg font-black text-slate-900 dark:text-white">
                  Đăng tin tuyển dụng để được hệ thống tự động gợi ý CV tiềm năng
                </h3>
                <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-2xl leading-relaxed">
                  Công ty của bạn chưa tạo tin tuyển dụng nào. Hãy đăng tin tuyển dụng đầu tiên để hệ thống phân tích kỹ năng và tự động gợi ý các hồ sơ ứng viên tài năng, chuẩn xác nhất cho bạn!
                </p>
              </div>
            </div>

            <div className="shrink-0 flex items-center justify-end">
              <button
                type="button"
                onClick={() => onNavigateTab('jobs')}
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 px-5 py-3 text-xs sm:text-sm font-extrabold text-white shadow-md shadow-blue-500/25 transition active:scale-95 cursor-pointer whitespace-nowrap"
              >
                <PlusCircle className="h-4 w-4" />
                <span>Đăng tin tuyển dụng ngay</span>
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* 3. Search Results Grid */}
      {isSearching ? (
        <div className="py-24 text-center rounded-3xl border border-slate-200/90 bg-white dark:border-slate-800 dark:bg-slate-900">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Đang tìm kiếm hồ sơ ứng viên phù hợp...</p>
        </div>
      ) : results.length > 0 ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>
              Tìm thấy <strong className="text-slate-900 dark:text-white font-bold">{totalCount}</strong> ứng viên phù hợp
            </span>
            <span>Trang {page} / {totalPages}</span>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {results.map((candidate) => {
              const isUnlockingThis = unlockingCvId === candidate.cvId;

              return (
                <motion.div
                  key={`${candidate.candidateUserId}_${candidate.cvId}`}
                  whileHover={{ y: -3 }}
                  className={`flex flex-col justify-between rounded-3xl border p-5 shadow-xs transition duration-200 ${
                    candidate.isBoosted
                      ? 'border-indigo-300/80 bg-gradient-to-br from-indigo-50/70 via-white to-indigo-50/30 dark:border-indigo-500/40 dark:bg-gradient-to-br dark:from-indigo-950/40 dark:via-slate-900 dark:to-slate-900 dark:shadow-indigo-950/40 shadow-sm'
                      : candidate.isUnlocked
                      ? 'border-emerald-300/80 bg-gradient-to-br from-emerald-50/60 via-white to-emerald-50/20 dark:border-emerald-500/40 dark:bg-gradient-to-br dark:from-emerald-950/30 dark:via-slate-900 dark:to-slate-900 shadow-sm'
                      : 'border-slate-200/90 bg-white hover:border-primary/40 dark:border-slate-800/90 dark:bg-slate-900/90 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-3.5">
                    {/* Top: Avatar & Candidate Badges */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative shrink-0">
                          <UserAvatar
                            src={candidate.avatar}
                            alt={candidate.name}
                            shape="rounded"
                            size="custom"
                            className="h-12 w-12 rounded-2xl border border-primary/20 dark:border-primary/30"
                          />
                          {candidate.isBoosted && (
                            <span className="absolute -top-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-indigo-600 text-[10px] text-white shadow-xs z-10">
                              🚀
                            </span>
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 truncate">
                              {candidate.name}
                            </h3>
                            {candidate.isPremium && (
                              <span title="Candidate Premium" className="text-xs">
                                👑
                              </span>
                            )}
                            {candidate.isVerified && (
                              <span title="Ứng viên đã xác thực" className="text-xs text-sky-500">
                                🛡️
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-bold text-primary dark:text-blue-400 truncate">
                            {candidate.title}
                          </p>
                        </div>
                      </div>

                      {/* Boost badge */}
                      {candidate.isBoosted && (
                        <span className="shrink-0 rounded-full bg-indigo-500/15 border border-indigo-500/30 px-2 py-0.5 text-[10px] font-black text-indigo-700 dark:text-indigo-300 animate-pulse">
                          🚀 TOP
                        </span>
                      )}
                    </div>

                    {/* Location & Experience Meta */}
                    <div className="flex flex-wrap items-center gap-y-1.5 gap-x-3 text-xs text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                        <span className="truncate max-w-[140px]">{candidate.location}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Briefcase className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {candidate.experienceSummary ||
                            (candidate.experienceYears && candidate.experienceYears > 0
                              ? `${candidate.experienceYears} năm kinh nghiệm`
                              : 'Mới tốt nghiệp / Fresher')}
                        </span>
                      </div>
                    </div>

                    {/* Company Smart Personalization Match */}
                    {candidate.isRecommendedForCompany && (
                      <div className="flex items-center gap-1.5 rounded-xl bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 text-[11px] font-bold text-blue-700 dark:text-blue-300">
                        <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                        <span className="truncate">
                          {candidate.recommendationReason || 'Phù hợp định hướng tuyển dụng của công ty'}
                        </span>
                      </div>
                    )}

                    {/* Skills Badges */}
                    {candidate.skills && candidate.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {candidate.skills.slice(0, 5).map((sk) => (
                          <span
                            key={sk}
                            className="rounded-lg bg-slate-100/90 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:border dark:border-slate-700/60 dark:text-slate-300"
                          >
                            {sk}
                          </span>
                        ))}
                        {candidate.skills.length > 5 && (
                          <span className="rounded-lg bg-slate-100/90 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:border dark:border-slate-700/60 dark:text-slate-400">
                            +{candidate.skills.length - 5}
                          </span>
                        )}
                      </div>
                    )}

                    {/* CV Type Pill */}
                    <div className="pt-1">
                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100/90 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:border dark:border-slate-700/60 dark:text-slate-300">
                        <FileText className="h-3 w-3 text-primary dark:text-blue-400" />
                        {candidate.cvType === 'ONLINE_CV' ? 'CV Online trực tuyến' : 'File CV đính kèm (PDF)'}
                      </span>
                    </div>
                  </div>

                  {/* Bottom Action Button */}
                  <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                      {formatDate(candidate.createdAt)}
                    </span>

                    {candidate.isUnlocked ? (
                      <button
                        type="button"
                        onClick={() => handleInitiateUnlock(candidate)}
                        disabled={isUnlockingThis}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition active:scale-95 cursor-pointer"
                      >
                        {isUnlockingThis ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                        <span>Xem thông tin đã mở</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleInitiateUnlock(candidate)}
                        disabled={isUnlockingThis}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-primary hover:bg-primary-dark px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition active:scale-95 cursor-pointer"
                      >
                        {isUnlockingThis ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Unlock className="h-3.5 w-3.5" />
                        )}
                        <span>Mở khóa liên hệ &amp; CV</span>
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-6">
              <button
                type="button"
                onClick={() => performSearch(Math.max(1, page - 1))}
                disabled={page <= 1 || isSearching}
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
              >
                &larr; Trang trước
              </button>
              <span className="text-xs font-bold text-slate-500 px-2">
                Trang {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => performSearch(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages || isSearching}
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
              >
                Trang sau &rarr;
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-3xl border border-slate-200 bg-white p-16 text-center dark:border-slate-800 dark:bg-slate-900">
          <Search className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600 mb-3" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Không tìm thấy ứng viên nào phù hợp
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            Hãy thử thay đổi từ khóa, kỹ năng hoặc mở rộng khu vực địa lý để tiếp cận nhiều ứng viên tiềm năng hơn.
          </p>
        </div>
      )}

      {/* 4. Confirmation Modal Before Unlocking */}
      {createPortal(
        <AnimatePresence>
          {showConfirmUnlockModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary dark:bg-primary/20 dark:text-blue-400">
                    <Unlock className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                      Xác nhận mở khóa thông tin ứng viên
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Ứng viên: <strong className="text-slate-900 dark:text-slate-200">{showConfirmUnlockModal.candidate.name}</strong>
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/70 dark:border dark:border-slate-700/60 text-xs space-y-2 text-slate-600 dark:text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Vị trí / CV:</span>
                    <strong className="text-slate-900 dark:text-white">{showConfirmUnlockModal.candidate.title}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Hạn mức hôm nay:</span>
                    <span>
                      {quota?.isUnlimited ? (
                        <strong className="text-amber-600 dark:text-amber-400">Không giới hạn (HR Premium)</strong>
                      ) : (
                        <>
                          Đã dùng <strong className="text-slate-900 dark:text-white">{quota?.usedToday ?? 0}/5</strong> (Còn lại <strong className="text-emerald-600 dark:text-emerald-400">{quota?.remaining ?? 5} lượt</strong>)
                        </>
                      )}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                    {quota?.isUnlimited
                      ? 'Bạn sở hữu gói HR Premium nên có thể mở khóa thông tin không giới hạn.'
                      : 'Thao tác này sẽ trừ 1 lượt mở khóa trong hạn mức 5 CV/ngày của tài khoản.'}
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowConfirmUnlockModal(null)}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition cursor-pointer"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="button"
                    onClick={() => executeUnlock(showConfirmUnlockModal.candidate)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2 text-xs font-bold text-white shadow-md shadow-primary/20 hover:bg-primary-dark transition active:scale-95 cursor-pointer"
                  >
                    <Unlock className="h-3.5 w-3.5" />
                    <span>Xác nhận mở khóa</span>
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* 5. Full Unlocked Candidate Details Modal */}
      {createPortal(
        <AnimatePresence>
          {unlockedModalData && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs overflow-y-auto">
              <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative my-8 w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-2xl dark:border-slate-800 dark:bg-slate-900 max-h-[90vh] overflow-y-auto"
            >
              <button
                type="button"
                onClick={() => setUnlockedModalData(null)}
                className="absolute top-5 right-5 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
              >
                <X className="h-5 w-5" />
              </button>

              {/* Header Profile */}
              <div className="flex items-start gap-4">
                <UserAvatar
                  src={unlockedModalData.candidate.avatar}
                  alt={unlockedModalData.candidate.name}
                  shape="rounded"
                  size="custom"
                  className="h-16 w-16 rounded-2xl border border-primary/20 dark:border-primary/30 text-xl"
                />

                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                      {unlockedModalData.candidate.name}
                    </h2>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-black text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      <CheckCircle2 className="h-3 w-3" /> Đã Mở Khóa
                    </span>
                  </div>
                  <p className="text-xs font-bold text-primary dark:text-blue-400 mt-0.5">
                    {unlockedModalData.cv.title}
                  </p>
                </div>
              </div>

              {/* Contact Information Box */}
              <div className="mt-5 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5 dark:border-primary/30 dark:bg-primary/10">
                <h4 className="text-xs font-black uppercase tracking-wider text-primary">
                  Thông Tin Liên Lạc Trực Tiếp
                </h4>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
                  <div className="flex items-center gap-2.5 text-slate-700 dark:text-slate-200">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-primary shadow-xs dark:bg-slate-800">
                      <Phone className="h-3.5 w-3.5" />
                    </span>
                    <div>
                      <div className="text-[10px] text-slate-400 font-medium">Số điện thoại</div>
                      <strong className="text-sm font-black">{unlockedModalData.candidate.phone || 'Chưa cập nhật'}</strong>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 text-slate-700 dark:text-slate-200">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-primary shadow-xs dark:bg-slate-800">
                      <Mail className="h-3.5 w-3.5" />
                    </span>
                    <div>
                      <div className="text-[10px] text-slate-400 font-medium">Email liên hệ</div>
                      <strong className="text-xs sm:text-sm font-black">{unlockedModalData.candidate.email}</strong>
                    </div>
                  </div>

                  <div className="sm:col-span-2 flex items-center gap-2.5 text-slate-700 dark:text-slate-200">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-primary shadow-xs dark:bg-slate-800">
                      <MapPin className="h-3.5 w-3.5" />
                    </span>
                    <div>
                      <div className="text-[10px] text-slate-400 font-medium">Địa chỉ</div>
                      <span className="font-semibold">{unlockedModalData.candidate.address || 'Chưa cập nhật'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* CV Content Section */}
              <div className="mt-6 space-y-4">
                {/* Online CV Details */}
                {unlockedModalData.cv.type === 'ONLINE_CV' ? (
                  <div className="space-y-4">
                    {/* Career Objective */}
                    {unlockedModalData.cv.careerObjective && (
                      <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/70 dark:border dark:border-slate-700/60">
                        <h4 className="text-xs font-black uppercase text-slate-500 dark:text-slate-400 mb-1.5">
                          Mục Tiêu Nghề Nghiệp
                        </h4>
                        <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-line">
                          {unlockedModalData.cv.careerObjective}
                        </p>
                      </div>
                    )}

                    {/* Work Experience */}
                    {unlockedModalData.cv.workExperience && unlockedModalData.cv.workExperience.length > 0 && (
                      <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/70 dark:border dark:border-slate-700/60 space-y-3">
                        <h4 className="text-xs font-black uppercase text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                          <Briefcase className="h-3.5 w-3.5 text-primary dark:text-blue-400" /> Kinh Nghiệm Làm Việc
                        </h4>
                        <div className="space-y-3 divide-y divide-slate-200/60 dark:divide-slate-700/70">
                          {unlockedModalData.cv.workExperience.map((exp: any, idx: number) => (
                            <div key={idx} className={idx > 0 ? 'pt-3' : ''}>
                              <div className="flex justify-between items-start text-xs">
                                <div>
                                  <strong className="text-slate-900 dark:text-white font-bold">{exp.position}</strong>
                                  <div className="text-primary dark:text-blue-400 font-semibold">{exp.companyName}</div>
                                </div>
                                <span className="text-[10px] text-slate-500 dark:text-slate-300 bg-white dark:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-200/60 dark:border-slate-700">
                                  {exp.startDate} - {exp.endDate}
                                </span>
                              </div>
                              {exp.description && (
                                <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                                  {exp.description}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Education */}
                    {unlockedModalData.cv.education && unlockedModalData.cv.education.length > 0 && (
                      <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/70 dark:border dark:border-slate-700/60 space-y-3">
                        <h4 className="text-xs font-black uppercase text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                          <GraduationCap className="h-3.5 w-3.5 text-primary dark:text-blue-400" /> Học Vấn &amp; Bằng Cấp
                        </h4>
                        <div className="space-y-2.5">
                          {unlockedModalData.cv.education.map((edu: any, idx: number) => (
                            <div key={idx} className="flex justify-between items-start text-xs">
                              <div>
                                <strong className="text-slate-900 dark:text-white font-bold">{edu.major}</strong>
                                <div className="text-slate-500 dark:text-slate-400">{edu.schoolName}</div>
                              </div>
                              <span className="text-[10px] text-slate-500 dark:text-slate-300 bg-white dark:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-200/60 dark:border-slate-700">
                                {edu.startDate} - {edu.endDate}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Skills */}
                    {unlockedModalData.cv.skills && unlockedModalData.cv.skills.length > 0 && (
                      <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/70 dark:border dark:border-slate-700/60">
                        <h4 className="text-xs font-black uppercase text-slate-500 dark:text-slate-400 mb-2">
                          Kỹ Năng
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {unlockedModalData.cv.skills.map((sk: any, idx: number) => {
                            if (typeof sk === 'string') {
                              return (
                                <span
                                  key={idx}
                                  className="rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-xs border border-slate-200/80 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700"
                                >
                                  {sk}
                                </span>
                              );
                            }
                            const rawName = (sk?.name || '').trim();
                            const rawDesc = (sk?.description || '').trim();
                            const isGenericName = [
                              'tên kỹ năng',
                              'kỹ năng chuyên môn',
                              'kỹ năng',
                              'mô tả kỹ năng',
                              'mức độ thành thạo',
                              'skills',
                              'skill',
                            ].includes(rawName.toLowerCase());

                            const displayName = isGenericName
                              ? rawDesc || rawName
                              : rawName && rawDesc && !['thành thạo', 'cơ bản', 'mức độ thành thạo', 'nâng cao', 'chuyên sâu'].includes(rawDesc.toLowerCase())
                              ? `${rawName}: ${rawDesc}`
                              : rawName || rawDesc;

                            if (!displayName) return null;

                            return (
                              <span
                                key={idx}
                                className="rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-xs border border-slate-200/80 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700"
                              >
                                {displayName}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Action PDF Download */}
                    {unlockedModalData.cv.pdfUrl && (
                      <div className="pt-2 flex justify-end">
                        <a
                          href={unlockedModalData.cv.pdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-primary/20 hover:bg-primary-dark transition cursor-pointer"
                        >
                          <Download className="h-4 w-4" />
                          <span>Tải bản PDF CV chính thức</span>
                        </a>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Uploaded File CV Details */
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700/80 dark:bg-slate-800/70 flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary dark:bg-primary/20 dark:text-blue-400">
                          <FileText className="h-5 w-5" />
                        </span>
                        <div>
                          <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                            {unlockedModalData.cv.title || 'File CV Ứng Viên'}
                          </h4>
                          <span className="text-[11px] text-slate-400 dark:text-slate-400 uppercase font-semibold">
                            Định dạng: {unlockedModalData.cv.fileType || 'PDF'}
                          </span>
                        </div>
                      </div>

                      {unlockedModalData.cv.downloadUrl && (
                        <a
                          href={unlockedModalData.cv.downloadUrl}
                          target="_blank"
                          rel="noreferrer"
                          download
                          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-primary/20 hover:bg-primary-dark transition active:scale-95 cursor-pointer"
                        >
                          <Download className="h-4 w-4" />
                          <span>Tải File CV Đính Kèm</span>
                        </a>
                      )}
                    </div>

                    {unlockedModalData.cv.skills && unlockedModalData.cv.skills.length > 0 && (
                      <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/70 dark:border dark:border-slate-700/60">
                        <h4 className="text-xs font-black uppercase text-slate-500 dark:text-slate-400 mb-2">
                          Kỹ Năng Trích Xuất Từ CV
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {unlockedModalData.cv.skills.map((sk: string, idx: number) => (
                            <span
                              key={idx}
                              className="rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-xs border border-slate-200/80 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700"
                            >
                              {sk}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>,
      document.body
    )}

      {/* 6. Premium Upgrade Prompt Modal */}
      {createPortal(
        <AnimatePresence>
          {showPremiumPromptModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
              <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-lg rounded-3xl border border-amber-500/30 bg-white p-6 sm:p-8 shadow-2xl dark:border-amber-500/40 dark:bg-slate-900 text-center"
            >
              <button
                type="button"
                onClick={() => setShowPremiumPromptModal(false)}
                className="absolute top-5 right-5 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
              >
                <X className="h-5 w-5" />
              </button>

              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-lg shadow-amber-500/30">
                <Crown className="h-7 w-7" />
              </span>

              <h3 className="mt-4 text-xl font-extrabold text-slate-900 dark:text-white">
                Hết Lượt Mở Khóa CV Miễn Phí Hôm Nay
              </h3>

              <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                Tài khoản HR Standard đã sử dụng hết <strong>5 lượt mở khóa CV miễn phí trong ngày</strong> (reset lúc 00:00 theo giờ Việt Nam UTC+7).
              </p>

              <div className="mt-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 p-4 text-left text-xs space-y-2 text-amber-900 dark:text-amber-200 dark:bg-amber-500/15">
                <div className="font-bold flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
                  <Sparkles className="h-4 w-4" /> Đặc Quyền Khi Nâng Cấp HR Premium:
                </div>
                <ul className="space-y-1.5 pl-4 list-disc text-slate-700 dark:text-slate-300">
                  <li><strong>Mở khóa không giới hạn:</strong> Xem full SĐT, Email và tải CV không giới hạn.</li>
                  <li><strong>Đẩy TOP tin tuyển dụng:</strong> Đưa tin lên vị trí #1 với nhãn HOT ngọn lửa nổi bật.</li>
                  <li><strong>Đăng tin không giới hạn:</strong> Mở rộng không giới hạn các chiến dịch tuyển dụng.</li>
                </ul>
              </div>

              <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowPremiumPromptModal(false)}
                  className="w-full sm:w-auto rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition"
                >
                  Để sau
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowPremiumPromptModal(false);
                    onNavigateTab('premium');
                  }}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 px-6 py-2.5 text-xs font-extrabold text-white shadow-lg shadow-amber-500/25 transition active:scale-95 cursor-pointer"
                >
                  <Crown className="h-4 w-4" />
                  <span>Nâng cấp HR Premium Ngay</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>,
      document.body
    )}
    </div>
  );
}
