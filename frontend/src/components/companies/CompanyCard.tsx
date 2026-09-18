import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Building2,
  MapPin,
  Users,
  Check,
  Plus,
  Briefcase,
  Crown,
  ChevronRight,
} from 'lucide-react';
import { CompanyListItem, followCompanyApi, unfollowCompanyApi, formatSalary } from '../../lib/jobApi';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../context/ToastContext';

interface CompanyCardProps {
  company: CompanyListItem;
  index?: number;
  onFollowToggle?: (companyId: string, isFollowed: boolean) => void;
}

// Curated aesthetic fallback cover gradients for companies
const COVER_GRADIENTS = [
  'from-blue-600 via-indigo-600 to-primary-dark',
  'from-sky-600 via-blue-700 to-indigo-800',
  'from-slate-800 via-blue-900 to-primary-900',
  'from-indigo-600 via-primary to-blue-700',
  'from-primary-600 via-sky-700 to-blue-900',
  'from-blue-700 via-indigo-800 to-slate-900',
];

export default function CompanyCard({
  company,
  index = 0,
  onFollowToggle,
}: CompanyCardProps) {
  const { accessToken } = useAuth();
  const { success, error, info } = useToast();

  const [isFollowed, setIsFollowed] = useState<boolean>(!!company.isFollowed);
  const [followerCount, setFollowerCount] = useState<number>(
    Array.isArray(company.usersFollow) ? company.usersFollow.length : 0,
  );
  const [isTogglingFollow, setIsTogglingFollow] = useState(false);

  const coverGradient = COVER_GRADIENTS[index % COVER_GRADIENTS.length];
  const topJobs = company.topJobs || [];

  const handleToggleFollow = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!accessToken) {
      info('Vui lòng đăng nhập', 'Bạn cần đăng nhập để theo dõi công ty.');
      return;
    }

    if (isTogglingFollow) return;

    try {
      setIsTogglingFollow(true);
      const nextFollowed = !isFollowed;
      setIsFollowed(nextFollowed);
      setFollowerCount((prev) => (nextFollowed ? prev + 1 : Math.max(0, prev - 1)));

      if (nextFollowed) {
        await followCompanyApi(company._id, accessToken);
        success('Đã theo dõi công ty', `Bạn sẽ nhận được thông báo khi ${company.name} đăng tuyển việc làm mới.`);
      } else {
        await unfollowCompanyApi(company._id, accessToken);
        info('Đã hủy theo dõi', `Bạn đã bỏ theo dõi ${company.name}.`);
      }

      onFollowToggle?.(company._id, nextFollowed);
    } catch (err: any) {
      // Revert on error
      setIsFollowed(!isFollowed);
      setFollowerCount((prev) => (!isFollowed ? Math.max(0, prev - 1) : prev + 1));
      error('Thao tác thất bại', err?.message || 'Không thể cập nhật trạng thái theo dõi.');
    } finally {
      setIsTogglingFollow(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.05, 0.4) }}
      className={`group relative flex flex-col justify-between rounded-2xl border bg-white dark:bg-slate-900 transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-1 overflow-hidden ${
        company.isPremium
          ? 'border-amber-400/60 dark:border-amber-500/50 ring-1 ring-amber-400/20 shadow-md shadow-amber-500/5 hover:border-amber-400'
          : 'border-slate-200/90 dark:border-slate-800/90 shadow-xs hover:border-primary/40 dark:hover:border-primary/40'
      }`}
    >
      {/* 1. TOP COVER BANNER */}
      <div className={`relative h-24 sm:h-28 w-full bg-gradient-to-r ${coverGradient} overflow-hidden`}>
        {/* Subtle geometric overlay shapes */}
        <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:12px_12px]" />
        <div className="absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-white/10 blur-xl pointer-events-none" />

        {/* HR Premium Spotlight Badge with Crown icon & PRO */}
        {company.isPremium && (
          <div className="absolute top-2.5 right-2.5 z-10">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 px-3 py-1 text-[11px] font-black text-white shadow-lg shadow-amber-500/30 ring-2 ring-white/70 dark:ring-slate-900/70 backdrop-blur-md">
              <Crown className="h-3.5 w-3.5 text-amber-100 fill-amber-200" />
              <span>PRO</span>
            </span>
          </div>
        )}

        {/* Open Jobs Tag on Banner */}
        {company.jobCount !== undefined && company.jobCount > 0 && (
          <div className="absolute top-2.5 left-2.5 z-10">
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-900/60 backdrop-blur-md px-2 py-0.5 text-[10px] font-bold text-white shadow-xs">
              <Briefcase className="h-3 w-3 text-sky-400" />
              <span>{company.jobCount} việc làm</span>
            </span>
          </div>
        )}
      </div>

      {/* 2. LOGO + COMPANY IDENTITY ROW */}
      <div className="px-5 pt-0 pb-3 flex-1 flex flex-col">
        {/* Elevated Logo & Follow Action */}
        <div className="flex items-end justify-between -mt-8 sm:-mt-9 mb-3">
          {/* Company Logo Box */}
          <Link
            to={`/companies/${company._id}`}
            className="relative flex h-16 w-16 sm:h-18 sm:w-18 flex-shrink-0 items-center justify-center rounded-2xl border-2 border-white dark:border-slate-800 bg-white dark:bg-slate-800 p-2 shadow-lg shadow-slate-950/10 hover:scale-105 transition-transform"
            title={`Xem chi tiết ${company.name}`}
          >
            {company.logo ? (
              <img
                src={company.logo}
                alt={company.name}
                className="h-full w-full rounded-xl object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            ) : (
              <Building2 className="h-8 w-8 text-primary" />
            )}
          </Link>

          {/* Follow Button */}
          <button
            type="button"
            onClick={handleToggleFollow}
            disabled={isTogglingFollow}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all duration-200 active:scale-95 cursor-pointer ${
              isFollowed
                ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                : 'bg-primary/10 text-primary hover:bg-primary hover:text-white dark:bg-primary/20 dark:text-primary-light dark:hover:bg-primary dark:hover:text-white border border-primary/30 shadow-xs'
            }`}
          >
            {isFollowed ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Đang theo dõi</span>
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" />
                <span>Theo dõi</span>
              </>
            )}
          </button>
        </div>

        {/* Company Title + PRO Tag */}
        <div>
          <div className="flex items-center gap-1.5">
            <h3 className="text-[15px] sm:text-base font-extrabold text-slate-900 dark:text-white group-hover:text-primary transition-colors line-clamp-1 flex-1">
              <Link to={`/companies/${company._id}`} title={company.name}>
                {company.name}
              </Link>
            </h3>
            {company.isPremium && (
              <span
                className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-black text-amber-600 dark:text-amber-400 shrink-0"
                title="Doanh nghiệp HR Premium"
              >
                <Crown className="h-3 w-3 text-amber-500 fill-amber-400" />
                <span>PRO</span>
              </span>
            )}
          </div>

          {/* Follower Count & Scale */}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1 font-medium">
              <Users className="h-3.5 w-3.5 text-slate-400" />
              <span>{followerCount.toLocaleString('vi-VN')} lượt theo dõi</span>
            </span>
            {company.scale && (
              <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                {company.scale}
              </span>
            )}
          </div>

          {/* Location snippet */}
          {company.address && (
            <p className="mt-1.5 flex items-start gap-1 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
              <MapPin className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
              <span className="truncate">{company.address}</span>
            </p>
          )}
        </div>

        {/* 3. BOX: 2 RECENT JOBS CREATED BY THIS COMPANY */}
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex-1 flex flex-col justify-center">
          {topJobs.length > 0 ? (
            <div className="space-y-2">
              {topJobs.map((job) => (
                <Link
                  key={job._id}
                  to={`/jobs/${job._id}`}
                  className="group/job block rounded-xl bg-slate-50/80 dark:bg-slate-800/50 hover:bg-primary/5 dark:hover:bg-primary/10 border border-slate-100/90 dark:border-slate-800/80 p-2.5 transition-all"
                >
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover/job:text-primary transition-colors line-clamp-1">
                    {job.name}
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
                    {/* Salary Tag formatted */}
                    <span className="font-extrabold text-primary dark:text-primary-light">
                      {formatSalary(job.salary)}
                    </span>
                    {/* Location */}
                    {job.location && (
                      <span className="text-slate-400 dark:text-slate-500 truncate max-w-[120px]">
                        {job.location.split(',')[0]}
                      </span>
                    )}
                  </div>
                </Link>
              ))}

              {/* If only 1 job, fill placeholder row */}
              {topJobs.length === 1 && (
                <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800/80 p-2 text-center text-[11px] text-slate-400">
                  <span>Đang mở tuyển thêm vị trí mới</span>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800/80 p-4 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-1 min-h-[96px]">
              <Briefcase className="h-5 w-5 text-slate-300 dark:text-slate-600" />
              <span>Hiện chưa có việc làm mới</span>
            </div>
          )}
        </div>
      </div>

      {/* 4. CARD FOOTER: "XEM CHI TIẾT CÔNG TY" CTA */}
      <div className="px-5 pb-4 pt-1">
        <Link
          to={`/companies/${company._id}`}
          className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary hover:text-white py-2.5 text-xs sm:text-sm font-bold text-primary dark:text-primary-light dark:hover:text-white transition-all duration-200 shadow-2xs group-hover:border-primary cursor-pointer active:scale-98"
        >
          <span>Xem chi tiết công ty</span>
          <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </motion.div>
  );
}
