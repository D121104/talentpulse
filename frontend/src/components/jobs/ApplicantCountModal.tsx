import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Users,
  Sparkles,
  Crown,
  AlertCircle,
  Calendar,
  ChevronRight,
  Loader2,
  Briefcase,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';

interface ApplicantCountModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobName: string;
  isPremium: boolean;
  quotaRemaining: number;
  quotaMax: number;
  quotaUsed: number;
  nextResetDate?: string;
  onConfirmUnlock: () => Promise<void>;
  loading?: boolean;
}

export const ApplicantCountModal = ({
  isOpen,
  onClose,
  jobName,
  isPremium,
  quotaRemaining,
  quotaMax,
  quotaUsed,
  nextResetDate,
  onConfirmUnlock,
  loading = false,
}: ApplicantCountModalProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();

  if (!isOpen) return null;

  const formatDate = (isoString?: string) => {
    if (!isoString) return 'Thứ Hai tuần sau';
    try {
      const d = new Date(isoString);
      return `Thứ Hai, ${d.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })}`;
    } catch {
      return 'Thứ Hai tuần sau';
    }
  };

  const isGuest = !user;
  const isOutOfQuota = isPremium && quotaRemaining <= 0;
  const canUnlock = isPremium && quotaRemaining > 0;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity"
        />

        {/* Modal Content */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: 'spring', duration: 0.25 }}
          className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden z-10"
        >
          {/* Top Decorative Border */}
          <div className="h-1.5 bg-gradient-to-r from-amber-500 via-primary to-emerald-500" />

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3.5 right-3.5 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors cursor-pointer z-10"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="p-5 sm:p-6">
            {/* Scenario 1: Non-Premium (Guest or Free User) */}
            {!isPremium && (
              <div className="text-center">
                <div className="w-11 h-11 mx-auto rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-center justify-center text-amber-600 dark:text-amber-400 mb-3 shadow-xs">
                  <Crown className="w-5 h-5" />
                </div>

                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  Xem số người ứng tuyển
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Đặc quyền dành riêng cho tài khoản{' '}
                  <span className="font-semibold text-amber-600 dark:text-amber-400">
                    Candidate Premium
                  </span>{' '}
                  (tối đa 5 việc/tuần).
                </p>

                <div className="mt-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 text-left space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span>Nắm bắt tỉ lệ cạnh tranh thực tế trước khi ứng tuyển</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span>Ưu tiên hiển thị CV lên đầu danh sách nhà tuyển dụng</span>
                  </div>
                </div>

                <div className="mt-5 flex gap-2.5">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs sm:text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    Đóng
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      navigate(isGuest ? '/login' : '/premium');
                    }}
                    className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-xs sm:text-sm font-bold shadow-md shadow-amber-500/20 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Crown className="w-3.5 h-3.5" />
                    <span>{isGuest ? 'Đăng nhập' : 'Nâng cấp ngay'}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Scenario 2: Premium & Has Quota (Confirm Modal) */}
            {canUnlock && (
              <div>
                <div className="flex items-center gap-2.5 mb-3.5">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center text-primary dark:text-primary-light shrink-0">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                      Xem số người ứng tuyển?
                    </h3>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Gói Candidate Premium
                    </div>
                  </div>
                </div>

                {/* Job Box without overlapping or clipping */}
                <div className="flex items-start gap-2.5 p-3 bg-slate-50 dark:bg-slate-800/70 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-primary dark:text-primary-light flex items-center justify-center shrink-0 mt-0.5">
                    <Briefcase className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 leading-snug line-clamp-2 block break-words">
                      {jobName}
                    </span>
                  </div>
                </div>

                {/* Quota Card */}
                <div className="mt-3 p-3 rounded-xl bg-primary/5 dark:bg-primary/10 border border-primary/20 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-400 font-medium">
                      Hạn mức tuần:
                    </span>
                    <span className="font-bold text-primary dark:text-primary-light">
                      Còn {quotaRemaining} / {quotaMax} lượt{' '}
                      {quotaUsed > 0 && (
                        <span className="font-normal text-slate-400 text-[11px]">
                          (đã dùng {quotaUsed})
                        </span>
                      )}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-emerald-500 rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.max(0, ((quotaMax - quotaRemaining) / quotaMax) * 100),
                        )}%`,
                      }}
                    />
                  </div>

                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    ⚡ Tiêu tốn <strong>1 lượt</strong> (mở khóa xong xem lại thoải mái trong tuần).
                  </p>
                </div>

                {/* Actions */}
                <div className="mt-4 flex gap-2.5">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={onClose}
                    className="flex-1 py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs sm:text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={onConfirmUnlock}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-primary to-primary-hover text-white text-xs sm:text-sm font-bold shadow-md shadow-primary/20 flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-60"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Đang xử lý...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Xem ngay (1 lượt)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Scenario 3: Premium & Out of Quota */}
            {isOutOfQuota && (
              <div className="text-center">
                <div className="w-11 h-11 mx-auto rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 flex items-center justify-center text-rose-600 dark:text-rose-400 mb-3 shadow-xs">
                  <AlertCircle className="w-5 h-5" />
                </div>

                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  Đã hết lượt xem tuần này
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Bạn đã dùng hết {quotaMax}/{quotaMax} lượt xem công việc trong tuần.
                </p>

                {/* Reset Information Card */}
                <div className="mt-3.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <Calendar className="w-4 h-4 text-primary shrink-0" />
                  <span>
                    Làm mới lúc 00:00, <strong>{formatDate(nextResetDate)}</strong>
                  </span>
                </div>

                <div className="mt-4">
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 text-xs sm:text-sm font-bold transition-all cursor-pointer"
                  >
                    Đã hiểu
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
export default ApplicantCountModal;
