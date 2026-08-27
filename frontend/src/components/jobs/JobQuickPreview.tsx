import { Link } from 'react-router-dom';
import {
  X,
  MapPin,
  Briefcase,
  DollarSign,
  Building2,
  CheckCircle2,
  Heart,
  Send,
  Sparkles,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Clock,
} from 'lucide-react';
import {
  JobItem,
  formatSalary,
  formatLocation,
  formatDaysRemaining,
} from '../../lib/jobApi';
import JobHtmlDescription from './JobHtmlDescription';

interface JobQuickPreviewProps {
  job: JobItem;
  onClose: () => void;
  onApply: (job: JobItem) => void;
  isSaved?: boolean;
  onToggleSave?: (job: JobItem) => void;
}

export default function JobQuickPreview({
  job,
  onClose,
  onApply,
  isSaved = false,
  onToggleSave,
}: JobQuickPreviewProps) {
  const daysRemaining = formatDaysRemaining(job.endDate);

  return (
    <div className="sticky top-24 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl shadow-slate-900/5 dark:shadow-black/40 overflow-hidden flex flex-col h-[calc(100vh-7rem)]">
      {/* HEADER (Sticky at top of panel) */}
      <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 shrink-0">
        {/* Title & Close Button */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <Link
              to={`/jobs/${job._id}`}
              className="text-lg sm:text-2xl font-extrabold text-slate-900 dark:text-white hover:text-primary dark:hover:text-primary-light transition-colors leading-snug line-clamp-2"
            >
              {job.name}
            </Link>

            {/* Company Info */}
            <div className="mt-1.5 flex items-center gap-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                {job.company?.name || 'TalentPulse Employer'}
              </span>
              {job.company?.isActive && (
                <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
            title="Đóng mô tả chi tiết"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Metadata Badges & Underlined Link */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
            {/* Salary Pill */}
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200/60 dark:border-rose-900/60">
              <DollarSign className="w-3.5 h-3.5" />
              {formatSalary(job.salary)}
            </span>

            {/* Location Pill */}
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              <MapPin className="w-3.5 h-3.5 text-slate-400" />
              {formatLocation(job.location)}
            </span>

            {/* Level Pill */}
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              <Briefcase className="w-3.5 h-3.5 text-slate-400" />
              {job.level || 'Mọi cấp bậc'}
            </span>
          </div>

          {/* Underlined Full Detail Link */}
          <Link
            to={`/jobs/${job._id}`}
            className="inline-flex items-center gap-1 text-xs sm:text-sm font-bold text-primary hover:text-primary-dark dark:text-primary-light dark:hover:text-primary underline underline-offset-4 decoration-primary/40 hover:decoration-primary transition-all group shrink-0"
          >
            <span>Xem chi tiết</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>

        {/* Action Buttons Row */}
        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => onApply(job)}
            className="flex-1 py-3 px-6 bg-primary hover:bg-primary-dark active:scale-[0.98] text-white text-sm sm:text-base font-bold rounded-xl shadow-md shadow-primary/25 hover:shadow-primary/35 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>Ứng tuyển ngay</span>
          </button>

          <button
            type="button"
            onClick={() => onToggleSave?.(job)}
            className={`p-3 rounded-xl border transition-all cursor-pointer ${
              isSaved
                ? 'bg-rose-50 border-rose-200 text-rose-600 dark:bg-rose-950/40 dark:border-rose-900/60'
                : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-500 hover:border-rose-300 dark:hover:border-rose-800 bg-white dark:bg-slate-800'
            }`}
            title={isSaved ? 'Đã lưu việc làm' : 'Lưu việc làm'}
          >
            <Heart className={`w-5 h-5 ${isSaved ? 'fill-rose-500 text-rose-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* SCROLLABLE BODY */}
      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 text-sm text-slate-700 dark:text-slate-300 custom-scrollbar">
        {/* Required Skills Cloud */}
        {job.skills && job.skills.length > 0 && (
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2.5 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              Kỹ năng yêu cầu
            </h3>
            <div className="flex flex-wrap gap-2">
              {job.skills.map((skill, idx) => (
                <span
                  key={idx}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light border border-primary/20"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Job Description */}
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2.5 pb-2 border-b border-slate-100 dark:border-slate-800">
            Mô tả công việc & Yêu cầu
          </h3>
          <JobHtmlDescription content={job.description} />
        </div>

        {/* Location & Working Details */}
        <div className="p-4 sm:p-5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 space-y-2.5">
          <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium">
            <MapPin className="w-4 h-4 text-primary shrink-0" />
            <span>
              <strong>Địa điểm làm việc:</strong> {job.location || 'Toàn quốc'}
            </span>
          </div>
          {job.endDate && (
            <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium">
              <Clock className="w-4 h-4 text-amber-500 shrink-0" />
              <span>
                <strong>Hạn nộp hồ sơ:</strong> {daysRemaining}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Tin tuyển dụng đã được TalentPulse xác minh chính xác</span>
          </div>
        </div>

        {/* Bottom Full View Link Banner */}
        <div className="pt-2 pb-4 text-center">
          <Link
            to={`/jobs/${job._id}`}
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-primary hover:text-primary-dark dark:text-primary-light hover:underline underline-offset-4"
          >
            <span>Xem bài đăng đầy đủ và đánh giá công ty</span>
            <ExternalLink className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
