import { useState, useMemo } from 'react';
import {
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';
import { SettingsLayout } from './SettingsLayout';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../context/ToastContext';
import { userApi } from '../../lib/userApi';

export default function ChangePasswordPage() {
  const { accessToken } = useAuth();
  const { success, error, info } = useToast();

  // Form states
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Password visibility toggles
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Loading state
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Criteria calculations for password strength
  const criteria = useMemo(() => {
    return {
      minLength: newPassword.length >= 6,
      hasMixedCase: /[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword),
      hasNumber: /\d/.test(newPassword),
      hasSpecial: /[^A-Za-z0-9]/.test(newPassword),
    };
  }, [newPassword]);

  // Score from 0 to 4
  const strengthScore = useMemo(() => {
    if (!newPassword) return 0;
    let score = 0;
    if (criteria.minLength) score += 1;
    if (criteria.hasMixedCase) score += 1;
    if (criteria.hasNumber) score += 1;
    if (criteria.hasSpecial) score += 1;
    return score;
  }, [newPassword, criteria]);

  // Strength label & color
  const strengthInfo = useMemo(() => {
    switch (strengthScore) {
      case 1:
        return { label: 'Rất yếu', color: 'bg-rose-500', text: 'text-rose-500', width: '25%' };
      case 2:
        return { label: 'Yếu', color: 'bg-amber-500', text: 'text-amber-500', width: '50%' };
      case 3:
        return { label: 'Trung bình', color: 'bg-sky-500', text: 'text-sky-500', width: '75%' };
      case 4:
        return { label: 'Mạnh', color: 'bg-emerald-500', text: 'text-emerald-500', width: '100%' };
      default:
        return { label: 'Chưa nhập', color: 'bg-slate-200 dark:bg-slate-700', text: 'text-slate-400', width: '0%' };
    }
  }, [strengthScore]);

  // Password match indicator
  const isMatch = Boolean(newPassword && confirmPassword && newPassword === confirmPassword);
  const isMismatch = Boolean(confirmPassword && newPassword !== confirmPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;

    if (!currentPassword) {
      info('Vui lòng nhập mật khẩu hiện tại');
      return;
    }

    if (newPassword.length < 6) {
      info('Mật khẩu mới phải có ít nhất 6 ký tự');
      return;
    }

    if (newPassword !== confirmPassword) {
      error('Mật khẩu xác nhận không khớp');
      return;
    }

    if (currentPassword === newPassword) {
      info('Mật khẩu mới không được trùng với mật khẩu hiện tại');
      return;
    }

    setIsSubmitting(true);
    try {
      await userApi.changePassword(
        {
          currentPassword,
          oldPassword: currentPassword,
          newPassword,
        },
        accessToken,
      );

      success('Đổi mật khẩu thành công! Hãy lưu ý ghi nhớ mật khẩu mới.');
      // Reset form
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      error(err.message || 'Đổi mật khẩu thất bại. Vui lòng kiểm tra lại mật khẩu hiện tại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SettingsLayout activeTab="password">
      <div className="space-y-6">
        {/* Main Password Change Form Card */}
        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-sm space-y-7"
        >
          <div className="border-b border-slate-100 dark:border-slate-800 pb-5">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
              <KeyRound className="h-5 w-5 text-primary" />
              <span>Đổi mật khẩu đăng nhập</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Nên sử dụng mật khẩu mạnh có kết hợp chữ hoa, chữ thường, số và ký hiệu đặc biệt.
            </p>
          </div>

          <div className="space-y-5">
            {/* Field 1: Current Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <span>Mật khẩu hiện tại</span>
                <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type={showCurrent ? 'text' : 'password'}
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Nhập mật khẩu bạn đang sử dụng"
                  className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 pl-10 pr-11 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                >
                  {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Field 2: New Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <span>Mật khẩu mới</span>
                  <span className="text-rose-500">*</span>
                </span>
                {newPassword && (
                  <span className={`text-[11px] font-bold ${strengthInfo.text}`}>
                    Độ mạnh: {strengthInfo.label}
                  </span>
                )}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <KeyRound className="h-4 w-4" />
                </div>
                <input
                  type={showNew ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Nhập mật khẩu mới (tối thiểu 6 ký tự)"
                  className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 pl-10 pr-11 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {/* Strength Progress Bar */}
              {newPassword && (
                <div className="space-y-3 pt-2">
                  <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${strengthInfo.color} transition-all duration-300 rounded-full`}
                      style={{ width: strengthInfo.width }}
                    />
                  </div>

                  {/* Checklist criteria */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                    <div className="flex items-center gap-1.5">
                      {criteria.minLength ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0 ml-1 mr-1" />
                      )}
                      <span className={criteria.minLength ? 'text-slate-700 dark:text-slate-300 font-medium' : 'text-slate-400 dark:text-slate-500'}>
                        Tối thiểu 6 ký tự
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {criteria.hasMixedCase ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0 ml-1 mr-1" />
                      )}
                      <span className={criteria.hasMixedCase ? 'text-slate-700 dark:text-slate-300 font-medium' : 'text-slate-400 dark:text-slate-500'}>
                        Chữ hoa & chữ thường
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {criteria.hasNumber ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0 ml-1 mr-1" />
                      )}
                      <span className={criteria.hasNumber ? 'text-slate-700 dark:text-slate-300 font-medium' : 'text-slate-400 dark:text-slate-500'}>
                        Ít nhất một chữ số (0-9)
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {criteria.hasSpecial ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0 ml-1 mr-1" />
                      )}
                      <span className={criteria.hasSpecial ? 'text-slate-700 dark:text-slate-300 font-medium' : 'text-slate-400 dark:text-slate-500'}>
                        Ký tự đặc biệt (!@#$...)
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Field 3: Confirm New Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <span>Xác nhận mật khẩu mới</span>
                  <span className="text-rose-500">*</span>
                </span>
                {confirmPassword && (
                  <span
                    className={`text-[11px] font-bold flex items-center gap-1 ${
                      isMatch ? 'text-emerald-500' : 'text-rose-500'
                    }`}
                  >
                    {isMatch ? (
                      <>
                        <CheckCircle2 className="h-3 w-3" />
                        <span>Mật khẩu trùng khớp</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-3 w-3" />
                        <span>Chưa trùng khớp</span>
                      </>
                    )}
                  </span>
                )}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type={showConfirm ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Nhập lại mật khẩu mới vừa đặt"
                  className={`w-full rounded-2xl border bg-white dark:bg-slate-800/80 pl-10 pr-11 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none transition ${
                    isMismatch
                      ? 'border-rose-300 dark:border-rose-700 focus:ring-2 focus:ring-rose-500/20'
                      : isMatch
                      ? 'border-emerald-300 dark:border-emerald-700 focus:ring-2 focus:ring-emerald-500/20'
                      : 'border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary/20 focus:border-primary'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className="flex items-center justify-end pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="submit"
              disabled={isSubmitting || (Boolean(confirmPassword) && !isMatch)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-primary text-white text-sm font-bold shadow-lg shadow-primary/25 hover:bg-primary-dark transition active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Đang cập nhật...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" />
                  <span>Cập nhật mật khẩu</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Security Tips Card */}
        <div className="rounded-3xl border border-sky-100 dark:border-sky-950/60 bg-gradient-to-br from-sky-50/70 to-indigo-50/40 dark:from-sky-950/20 dark:to-indigo-950/20 p-6 space-y-3">
          <div className="flex items-center gap-2 text-sky-800 dark:text-sky-300 font-bold text-sm">
            <ShieldCheck className="h-4.5 w-4.5 text-sky-600 dark:text-sky-400" />
            <span>Mẹo bảo vệ tài khoản an toàn</span>
          </div>
          <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-2 leading-relaxed list-disc list-inside">
            <li>Không nên sử dụng lại mật khẩu đã dùng cho các trang web hoặc tài khoản mạng xã hội khác.</li>
            <li>Nên thay đổi mật khẩu định kỳ 3 - 6 tháng một lần để phòng ngừa rủi ro rò rỉ dữ liệu.</li>
            <li>Không chia sẻ mật khẩu tài khoản hoặc mã OTP cho bất kỳ ai, kể cả nhân viên hỗ trợ TalentPulse.</li>
          </ul>
        </div>
      </div>
    </SettingsLayout>
  );
}
