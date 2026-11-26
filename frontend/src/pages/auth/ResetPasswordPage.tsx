import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { AuthLayout } from './AuthLayout';
import { authApi, ApiError } from '../../lib/api';
import { useToast } from '../../context/ToastContext';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { success } = useToast();

  const tokenParam = searchParams.get('token') || '';
  const emailParam = searchParams.get('email') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Password criteria checks
  const hasMinLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  const criteriaCount = [hasMinLength, hasUpper && hasLower, hasNumber, hasSpecial].filter(Boolean).length;
  const isPasswordValid = hasMinLength;
  const doPasswordsMatch = password.length > 0 && password === confirmPassword;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!tokenParam) {
      setError('Mã xác thực không tồn tại hoặc đường dẫn không hợp lệ.');
      return;
    }
    if (!hasMinLength) {
      setError('Mật khẩu mới phải có tối thiểu 8 ký tự.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Xác nhận mật khẩu không khớp. Vui lòng kiểm tra lại.');
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      await authApi.resetPassword({
        token: tokenParam.trim(),
        password,
      });
      success('Đặt lại mật khẩu thành công!');
      setIsSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Không thể đặt lại mật khẩu. Mã xác thực có thể đã hết hạn hoặc không hợp lệ.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <div className="w-full max-w-md mx-auto">
        {/* Missing Token Warning */}
        {!tokenParam && (
          <div className="text-center py-6">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
              <AlertCircle className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
              Đường dẫn không hợp lệ
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Liên kết đặt lại mật khẩu thiếu mã xác thực hợp lệ. Vui lòng gửi lại yêu cầu quên mật khẩu để nhận mã mới.
            </p>
            <div className="mt-6">
              <Link
                to="/forgot-password"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-white shadow-md shadow-primary/20 hover:bg-primary-dark transition"
              >
                <span>Yêu cầu mã mới</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}

        {/* Success Screen */}
        {isSuccess && (
          <div className="text-center py-4">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-50 ring-8 ring-emerald-50/50 dark:bg-emerald-950/40 dark:ring-emerald-950/20 text-emerald-600 dark:text-emerald-400 animate-in zoom-in-90 duration-300">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white sm:text-3xl">
              Đặt lại mật khẩu thành công!
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400 max-w-sm mx-auto">
              Mật khẩu mới của bạn đã được cập nhật thành công vào hệ thống. Bạn có thể sử dụng mật khẩu mới này để đăng nhập ngay bây giờ.
            </p>

            <div className="mt-8 space-y-3">
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary-dark active:scale-98 cursor-pointer"
              >
                <span>Đăng nhập ngay</span>
                <ArrowRight className="h-4 w-4" />
              </button>
              <Link
                to="/"
                className="block text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition py-1"
              >
                Về trang chủ TalentPulse
              </Link>
            </div>
          </div>
        )}

        {/* Form to Reset Password */}
        {tokenParam && !isSuccess && (
          <div>
            <div className="mb-6">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4 dark:bg-primary/20">
                <KeyRound className="h-6 w-6" />
              </div>
              <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                Đặt lại mật khẩu
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                {emailParam ? (
                  <>
                    Thiết lập mật khẩu mới cho tài khoản{' '}
                    <span className="font-semibold text-slate-900 dark:text-white">{emailParam}</span>.
                  </>
                ) : (
                  'Nhập mật khẩu mới an toàn cho tài khoản của bạn.'
                )}
              </p>
            </div>

            {/* Error Alert */}
            {error && (
              <div
                role="alert"
                className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 animate-in fade-in slide-in-from-top-2 duration-200"
              >
                <AlertCircle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
                <span className="min-w-0 flex-1">{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* New Password Input */}
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Mật khẩu mới
                </span>
                <span className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 shadow-xs transition focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 dark:border-slate-700 dark:bg-slate-800">
                  <LockKeyhole className="h-4 w-4 shrink-0 text-slate-400" />
                  <input
                    required
                    minLength={8}
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
                    placeholder="Nhập mật khẩu mới (tối thiểu 8 ký tự)"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-primary dark:hover:bg-slate-700 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </span>
              </label>

              {/* Password Strength Meter */}
              {password.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-slate-500 dark:text-slate-400">Độ mạnh mật khẩu:</span>
                    <span
                      className={
                        criteriaCount <= 1
                          ? 'text-rose-500'
                          : criteriaCount === 2
                          ? 'text-amber-500'
                          : criteriaCount === 3
                          ? 'text-blue-500'
                          : 'text-emerald-500'
                      }
                    >
                      {criteriaCount <= 1 && 'Yếu'}
                      {criteriaCount === 2 && 'Trung bình'}
                      {criteriaCount === 3 && 'Khá tốt'}
                      {criteriaCount >= 4 && 'Rất mạnh ✨'}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 h-1.5">
                    {[1, 2, 3, 4].map((bar) => (
                      <div
                        key={bar}
                        className={`h-full rounded-full transition-all duration-300 ${
                          criteriaCount >= bar
                            ? bar === 1
                              ? 'bg-rose-500'
                              : bar === 2
                              ? 'bg-amber-500'
                              : bar === 3
                              ? 'bg-blue-500'
                              : 'bg-emerald-500'
                            : 'bg-slate-200 dark:bg-slate-700'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Confirm Password Input */}
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Xác nhận mật khẩu mới
                </span>
                <span className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 shadow-xs transition focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 dark:border-slate-700 dark:bg-slate-800">
                  <LockKeyhole className="h-4 w-4 shrink-0 text-slate-400" />
                  <input
                    required
                    minLength={8}
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="h-12 w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
                    placeholder="Nhập lại mật khẩu mới"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-primary dark:hover:bg-slate-700 cursor-pointer"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </span>
              </label>

              {/* Requirements Checklist */}
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-800/50 space-y-1.5">
                <div className="flex items-center gap-2">
                  {hasMinLength ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <span className="h-3.5 w-3.5 rounded-full border border-slate-300 dark:border-slate-600 shrink-0" />
                  )}
                  <span className={hasMinLength ? 'text-slate-700 dark:text-slate-200 font-medium' : 'text-slate-400'}>
                    Tối thiểu 8 ký tự
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {hasUpper && hasLower ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <span className="h-3.5 w-3.5 rounded-full border border-slate-300 dark:border-slate-600 shrink-0" />
                  )}
                  <span className={hasUpper && hasLower ? 'text-slate-700 dark:text-slate-200 font-medium' : 'text-slate-400'}>
                    Bao gồm cả chữ hoa và chữ thường
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {hasNumber || hasSpecial ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <span className="h-3.5 w-3.5 rounded-full border border-slate-300 dark:border-slate-600 shrink-0" />
                  )}
                  <span className={hasNumber || hasSpecial ? 'text-slate-700 dark:text-slate-200 font-medium' : 'text-slate-400'}>
                    Bao gồm số hoặc ký tự đặc biệt
                  </span>
                </div>
                {confirmPassword.length > 0 && (
                  <div className="flex items-center gap-2 pt-1 border-t border-slate-200 dark:border-slate-700">
                    {doPasswordsMatch ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                    )}
                    <span className={doPasswordsMatch ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-rose-500'}>
                      {doPasswordsMatch ? 'Mật khẩu xác nhận đã trùng khớp' : 'Mật khẩu xác nhận chưa khớp'}
                    </span>
                  </div>
                )}
              </div>

              <button
                disabled={isSubmitting || !isPasswordValid || !doPasswordsMatch}
                type="submit"
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary-dark active:scale-98 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer mt-3"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Đang cập nhật...</span>
                  </>
                ) : (
                  <>
                    <span>Hoàn tất đặt lại mật khẩu</span>
                    <Sparkles className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
