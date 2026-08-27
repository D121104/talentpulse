import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Flame,
  Zap,
  MapPin,
  Briefcase,
  Clock,
  Heart,
  Building2,
  CheckCircle2,
  Sparkles,
  ArrowUpRight,
} from 'lucide-react';
import {
  JobItem,
  formatSalary,
  formatLocation,
  formatDaysRemaining,
  getCompanyInitial,
} from '../../lib/jobApi';

interface JobCardHorizontalProps {
  job: JobItem;
  onQuickApply?: (job: JobItem) => void;
  isSaved?: boolean;
  onToggleSave?: (job: JobItem) => void;
  isSelected?: boolean;
  onSelect?: (job: JobItem) => void;
  isCompact?: boolean;
}

export default function JobCardHorizontal({
  job,
  onQuickApply,
  isSaved = false,
  onToggleSave,
  isSelected = false,
  onSelect,
  isCompact = false,
}: JobCardHorizontalProps) {
  const [imageError, setImageError] = useState(false);

  const daysRemaining = formatDaysRemaining(job.endDate);
  const isExpiringSoon =
    daysRemaining.includes('1 ngày') || daysRemaining.includes('2 ngày');

  // COMPACT MODE (When Split-View Preview is Open, matching TopCV)
  if (isCompact) {
    return (
      <div
        onClick={() => onSelect?.(job)}
        className={`group relative rounded-2xl p-3.5 sm:p-4 border transition-all duration-200 cursor-pointer ${
          isSelected
            ? 'border-primary ring-2 ring-primary/25 bg-blue-50/60 dark:bg-blue-950/30 shadow-md'
            : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-primary/50 dark:hover:border-primary/50 hover:shadow-lg hover:shadow-blue-500/5 dark:hover:shadow-black/30'
        }`}
      >
        <div className="flex items-start gap-3">
          {/* Logo */}
          <Link
            to={`/jobs/${job._id}`}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 relative w-12 h-12 rounded-xl overflow-hidden border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-slate-800 p-1 flex items-center justify-center group-hover:scale-105 transition-transform duration-200 shadow-xs"
          >
            {job.company?.logo && !imageError ? (
              <img
                src={job.company.logo}
                alt={job.company.name || 'Company'}
                onError={() => setImageError(true)}
                className="w-full h-full object-contain rounded-lg"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full rounded-lg bg-gradient-to-br from-primary/10 to-blue-600/20 dark:from-primary/20 dark:to-blue-600/30 flex items-center justify-center text-primary font-bold text-sm">
                {getCompanyInitial(job.company?.name)}
              </div>
            )}
          </Link>

          {/* Info */}
          <div className="flex-1 min-w-0">
            {/* Badges */}
            <div className="flex flex-wrap items-center gap-1 mb-1">
              {job.isHot && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-md text-[10px] font-bold bg-gradient-to-r from-red-500 to-amber-500 text-white shadow-xs">
                  <Flame className="w-2.5 h-2.5 animate-pulse" />
                  HOT
                </span>
              )}
              {job.isUrgent && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-md text-[10px] font-bold bg-amber-500 text-white">
                  <Zap className="w-2.5 h-2.5" />
                  Tuyển gấp
                </span>
              )}
              {job.isFeatured && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-md text-[10px] font-semibold bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light">
                  <Sparkles className="w-2.5 h-2.5" />
                  Nổi bật
                </span>
              )}
            </div>

            {/* Title */}
            <Link
              to={`/jobs/${job._id}`}
              onClick={(e) => e.stopPropagation()}
              className="block text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100 group-hover:text-primary dark:group-hover:text-primary-light transition-colors line-clamp-2 leading-snug"
            >
              {job.name}
            </Link>

            {/* Company Name */}
            <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <span className="truncate max-w-[200px]">
                {job.company?.name || 'TalentPulse Employer'}
              </span>
              {job.company?.isActive && (
                <CheckCircle2 className="w-3 h-3 text-blue-500 shrink-0" />
              )}
            </div>

            {/* Salary */}
            <div className="mt-1.5 font-bold text-xs sm:text-sm text-rose-600 dark:text-rose-400">
              {formatSalary(job.salary)}
            </div>

            {/* Tags (Location, Exp) */}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800">
                {formatLocation(job.location)}
              </span>
              {job.level && (
                <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800">
                  {job.level}
                </span>
              )}
            </div>

            {/* Bottom Row: Skills & Bookmark & Apply on hover */}
            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
              <div className="text-[11px] text-slate-400 truncate max-w-[170px]">
                {Array.isArray(job.skills) && job.skills.length > 0 ? (
                  <span>
                    {job.skills.slice(0, 2).join(', ')}
                    {job.skills.length > 2 ? ` +${job.skills.length - 2}` : ''}
                  </span>
                ) : (
                  <span>{daysRemaining}</span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {onQuickApply && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onQuickApply(job);
                    }}
                    className="opacity-0 translate-y-1 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto px-2.5 py-1 bg-primary hover:bg-primary-dark text-white text-[11px] font-semibold rounded-lg shadow-xs transition-all duration-200 flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <Zap className="w-3 h-3 fill-white" />
                    Ứng tuyển
                  </button>
                )}

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSave?.(job);
                  }}
                  className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                    isSaved
                      ? 'bg-rose-50 border-rose-200 text-rose-600 dark:bg-rose-950/40 dark:border-rose-900/60'
                      : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-500 hover:border-rose-300'
                  }`}
                  title={isSaved ? 'Đã lưu việc làm' : 'Lưu việc làm'}
                >
                  <Heart className={`w-3.5 h-3.5 ${isSaved ? 'fill-rose-500 text-rose-500' : ''}`} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // STANDARD FULL CARD MODE
  return (
    <div
      onClick={() => onSelect?.(job)}
      className={`group relative rounded-2xl p-4 sm:p-5 border transition-all duration-300 cursor-pointer ${
        isSelected
          ? 'border-primary ring-2 ring-primary/25 bg-blue-50/50 dark:bg-blue-950/25 shadow-lg shadow-primary/5'
          : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-primary/50 dark:hover:border-primary/50 hover:shadow-xl hover:shadow-blue-500/5 dark:hover:shadow-black/30'
      }`}
    >
      <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-5">
        {/* Company Logo Squircle */}
        <Link
          to={`/jobs/${job._id}`}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-slate-800 p-1.5 flex items-center justify-center group-hover:scale-105 transition-transform duration-300 shadow-sm"
        >
          {job.company?.logo && !imageError ? (
            <img
              src={job.company.logo}
              alt={job.company.name || 'Company'}
              onError={() => setImageError(true)}
              className="w-full h-full object-contain rounded-xl"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full rounded-xl bg-gradient-to-br from-primary/10 to-blue-600/20 dark:from-primary/20 dark:to-blue-600/30 flex items-center justify-center text-primary font-bold text-base sm:text-lg">
              {getCompanyInitial(job.company?.name)}
            </div>
          )}
        </Link>

        {/* Job Info Center Column */}
        <div className="flex-1 min-w-0">
          {/* Row 1: Badges & Job Title */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              {job.isHot && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-gradient-to-r from-red-500 to-amber-500 text-white shadow-xs">
                  <Flame className="w-3 h-3 animate-pulse" />
                  HOT
                </span>
              )}
              {job.isUrgent && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-500 text-white">
                  <Zap className="w-3 h-3" />
                  Tuyển gấp
                </span>
              )}
              {job.isFeatured && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light">
                  <Sparkles className="w-3 h-3" />
                  Nổi bật
                </span>
              )}
            </div>

            {/* Mobile Save Bookmark */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSave?.(job);
              }}
              className="sm:hidden text-slate-400 hover:text-rose-500 transition-colors p-1"
              aria-label="Lưu việc làm"
            >
              <Heart
                className={`w-4 h-4 ${isSaved ? 'fill-rose-500 text-rose-500' : ''}`}
              />
            </button>
          </div>

          <Link
            to={`/jobs/${job._id}`}
            onClick={(e) => e.stopPropagation()}
            className="block text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100 group-hover:text-primary dark:group-hover:text-primary-light transition-colors line-clamp-2 leading-snug"
          >
            {job.name}
          </Link>

          {/* Row 2: Company Name */}
          <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400">
            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="truncate max-w-[320px]">
              {job.company?.name || 'TalentPulse Employer'}
            </span>
            {job.company?.isActive && (
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            )}
          </div>

          {/* Row 3: Key Pills (Salary, Location, Level) */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {/* Salary Pill */}
            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-900/40">
              {formatSalary(job.salary)}
            </span>

            {/* Location Pill */}
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60">
              <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
              {formatLocation(job.location)}
            </span>

            {/* Level Pill */}
            {job.level && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60">
                <Briefcase className="w-3 h-3 text-slate-400 shrink-0" />
                {job.level}
              </span>
            )}
          </div>

          {/* Row 4: Skill Tags */}
          {Array.isArray(job.skills) && job.skills.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {job.skills.slice(0, 5).map((skill, sIdx) => (
                <span
                  key={sIdx}
                  className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-100/80 dark:border-blue-900/30"
                >
                  {skill}
                </span>
              ))}
              {job.skills.length > 5 && (
                <span className="text-[11px] text-slate-400">
                  +{job.skills.length - 5}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right Action Column */}
        <div className="shrink-0 flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto border-t sm:border-t-0 border-slate-100 dark:border-slate-800/80 pt-3 sm:pt-0 mt-2 sm:mt-0 gap-3">
          {/* Expiration or Post Time */}
          <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span className={isExpiringSoon ? 'text-amber-600 dark:text-amber-400 font-semibold' : ''}>
              {daysRemaining}
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Quick Apply Button - Only shown on hover with smooth transition */}
            {onQuickApply && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onQuickApply(job);
                }}
                className="opacity-0 translate-x-2 pointer-events-none group-hover:opacity-100 group-hover:translate-x-0 group-hover:pointer-events-auto px-3.5 py-2 bg-primary hover:bg-primary-dark active:scale-95 text-white text-xs font-semibold rounded-xl shadow-sm shadow-primary/25 hover:shadow-primary/35 transition-all duration-300 ease-out flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Zap className="w-3.5 h-3.5 fill-white" />
                Ứng tuyển
              </button>
            )}

            {/* Desktop Bookmark */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSave?.(job);
              }}
              className="hidden sm:flex items-center justify-center w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-rose-400 text-slate-400 hover:text-rose-500 bg-white dark:bg-slate-800 transition-all cursor-pointer shadow-xs"
              title={isSaved ? 'Đã lưu việc làm' : 'Lưu việc làm'}
            >
              <Heart
                className={`w-4 h-4 ${isSaved ? 'fill-rose-500 text-rose-500' : ''}`}
              />
            </button>

            {/* Detail Link */}
            <Link
              to={`/jobs/${job._id}`}
              onClick={(e) => e.stopPropagation()}
              className="p-2 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-xl transition-colors"
              title="Xem chi tiết"
            >
              <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
