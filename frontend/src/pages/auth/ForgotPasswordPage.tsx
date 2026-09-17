import { useState, useEffect, useRef, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Mail,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AuthLayout } from './AuthLayout';
import { authApi, ApiError } from '../../lib/api';
import { useToast } from '../../context/ToastContext';

type Step = 'EMAIL' | 'OTP' | 'NEW_PASSWORD' | 'SUCCESS';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { success } = useToast();

  const [step, setStep] = useState<Step>('EMAIL');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Resend OTP countdown (60s)
  const [resendCountdown, setResendCountdown] = useState(0);
  const [verifiedToken, setVerifiedToken] = useState('');

  // OTP inputs ref for autofocus
  const otpInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let timer: any;
    if (resendCountdown > 0) {
      timer = setTimeout(() => setResendCountdown((prev) => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCountdown]);

  // Focus OTP input when switching to OTP step
  useEffect(() => {
    if (step === 'OTP') {
      setTimeout(() => otpInputRef.current?.focus(), 150);
    }
  }, [step]);

  // Password criteria checks
  const hasMinLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  const criteriaCount = [hasMinLength, (hasUpper && hasLower), hasNumber, hasSpecial].filter(Boolean).length;
  const isPasswordValid = hasMinLength;
  const doPasswordsMatch = password.length > 0 && password === confirmPassword;

  // Step 1: Request OTP
  const handleRequestOtp = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError(t('auth.emailRequired') || 'Vui lòng nhập địa chỉ email của bạn.');
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      await authApi.forgotPassword(cleanEmail);
      success('Mã xác thực OTP đã được gửi đến email của bạn!');
      setStep('OTP');
      setResendCountdown(60);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Không thể gửi mã xác thực. Vui lòng thử lại sau.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    const cleanOtp = otp.trim();
    if (!cleanOtp || cleanOtp.length < 4) {
      setError('Vui lòng nhập đầy đủ mã xác thực OTP.');
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      const res = await authApi.verifyOtp(cleanOtp);
      setVerifiedToken(res.token || cleanOtp);
      success('Xác thực mã OTP thành công!');
      setStep('NEW_PASSWORD');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Mã xác thực không đúng hoặc đã hết hạn.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 3: Reset Password
  const handleResetPassword = async (e: FormEvent) => {
    e.preventDefault();
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
        token: verifiedToken || otp.trim(),
        password,
      });
      success('Đặt lại mật khẩu thành công!');
      setStep('SUCCESS');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Không thể đặt lại mật khẩu. Vui lòng kiểm tra lại mã OTP.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <div className="w-full max-w-md mx-auto">
        {/* Step Indicator */}
        {step !== 'SUCCESS' && (
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`h-2 rounded-full transition-all duration-300 ${
                  step === 'EMAIL' ? 'w-8 bg-primary' : 'w-2 bg-primary/40'
                }`}
              />
              <span
                className={`h-2 rounded-full transition-all duration-300 ${
                  step === 'OTP' ? 'w-8 bg-primary' : 'w-2 bg-primary/40'
                }`}
              />
              <span
                className={`h-2 rounded-full transition-all duration-300 ${
                  step === 'NEW_PASSWORD' ? 'w-8 bg-primary' : 'w-2 bg-slate-200 dark:bg-slate-700'
                }`}
              />
            </div>
            <span className="text-xs font-semibold text-slate-400">
              {step === 'EMAIL' && 'Bước 1/3'}
              {step === 'OTP' && 'Bước 2/3'}
              {step === 'NEW_PASSWORD' && 'Bước 3/3'}
            </span>
          </div>
        )}

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

        {/* STEP 1: ENTER EMAIL */}
        {step === 'EMAIL' && (
          <div>
            <div className="mb-6">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4 dark:bg-primary/20">
                <KeyRound className="h-6 w-6" />
              </div>
              <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                Quên mật khẩu?
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Đừng lo lắng! Nhập địa chỉ email đăng ký tài khoản của bạn để nhận mã xác thực OTP khôi phục mật khẩu.
              </p>
            </div>

            <form onSubmit={handleRequestOtp} className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Địa chỉ Email
                </span>
                <span className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 shadow-xs transition focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 dark:border-slate-700 dark:bg-slate-800">
                  <Mail className="h-4 w-4 shrink-0 text-slate-400" />
                  <input
                    required
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
                    placeholder="you@example.com"
                  />
                </span>
              </label>

              <button
                disabled={isSubmitting}
                type="submit"
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary-dark active:scale-98 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer mt-2"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Đang gửi mã...</span>
                  </>
                ) : (
                  <>
                    <span>Gửi mã xác thực</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 text-center">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-primary dark:text-slate-400 dark:hover:text-white transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Quay lại Đăng nhập</span>
              </Link>
            </div>
          </div>
        )}

        {/* STEP 2: ENTER OTP */}
        {step === 'OTP' && (
          <div>
            <div className="mb-6">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 mb-4 dark:bg-blue-950/50 dark:text-blue-400">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                Nhập mã xác thực OTP
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Mã xác thực gồm 6 chữ số đã được gửi tới{' '}
                <span className="font-semibold text-slate-900 dark:text-white">{email}</span>. Vui lòng kiểm tra hộp thư
                (hoặc thư mục Spam/Rác).
              </p>
            </div>

            <form onSubmit={handleVerifyOtp} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                  Mã OTP 6 số
                </label>
                <input
                  ref={otpInputRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={10}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="------"
                  className="h-14 w-full rounded-2xl border-2 border-slate-200 bg-white text-center text-2xl font-black tracking-[12px] text-slate-900 shadow-xs transition focus:border-primary focus:ring-4 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white placeholder:tracking-[8px] placeholder:text-slate-300 dark:placeholder:text-slate-600 font-mono"
                  required
                />
              </div>

              <button
                disabled={isSubmitting || otp.length < 4}
                type="submit"
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary-dark active:scale-98 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Đang kiểm tra...</span>
                  </>
                ) : (
                  <>
                    <span>Xác thực mã OTP</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>

              <div className="flex items-center justify-between pt-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setStep('EMAIL');
                  }}
                  className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition cursor-pointer"
                >
                  Thay đổi địa chỉ email
                </button>

                {resendCountdown > 0 ? (
                  <span className="text-slate-400 font-medium">Gửi lại mã sau {resendCountdown}s</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleRequestOtp()}
                    disabled={isSubmitting}
                    className="font-bold text-primary hover:text-primary-dark transition cursor-pointer"
                  >
                    Gửi lại mã OTP
                  </button>
                )}
              </div>
            </form>
          </div>
        )}

        {/* STEP 3: SET NEW PASSWORD */}
        {step === 'NEW_PASSWORD' && (
          <div>
            <div className="mb-6">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 mb-4 dark:bg-emerald-950/50 dark:text-emerald-400">
                <LockKeyhole className="h-6 w-6" />
              </div>
              <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                Đặt lại mật khẩu mới
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Hãy tạo một mật khẩu mạnh để tăng cường tính bảo mật cho tài khoản của bạn.
              </p>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-4">
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

        {/* STEP 4: SUCCESS */}
        {step === 'SUCCESS' && (
          <div className="text-center py-4">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-50 ring-8 ring-emerald-50/50 dark:bg-emerald-950/40 dark:ring-emerald-950/20 text-emerald-600 dark:text-emerald-400 animate-in zoom-in-90 duration-300">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white sm:text-3xl">
              Đặt lại mật khẩu thành công!
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400 max-w-sm mx-auto">
              Mật khẩu mới của bạn đã được cập nhật thành công vào hệ thống. Bây giờ bạn có thể đăng nhập và tiếp tục công việc.
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
      </div>
    </AuthLayout>
  );
}
