import { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Rocket,
  ArrowRight,
  RefreshCw,
  Mail,
  Home,
} from 'lucide-react';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import { authApi } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../auth/AuthContext';

export default function VerifyAccountPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { user, refreshSession } = useAuth();
  const { success: toastSuccess, error: toastError } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [resendEmail, setResendEmail] = useState(user?.email || '');
  const [isResending, setIsResending] = useState(false);

  const verificationAttemptedRef = useRef(false);

  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      setErrorMessage('Không tìm thấy mã xác thực trong liên kết. Vui lòng kiểm tra lại email.');
      return;
    }

    if (verificationAttemptedRef.current) return;
    verificationAttemptedRef.current = true;

    const verify = async () => {
      try {
        setIsLoading(true);
        const res = await authApi.verifyAccount(token);
        setIsSuccess(true);
        toastSuccess(res.message || 'Xác thực tài khoản thành công!');
        // Refresh session to update user in AuthContext
        await refreshSession();
      } catch (err: any) {
        setIsSuccess(false);
        setErrorMessage(err?.message || 'Xác thực tài khoản thất bại hoặc mã xác thực đã hết hạn.');
      } finally {
        setIsLoading(false);
      }
    };

    verify();
  }, [token, refreshSession, toastSuccess]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail.trim()) {
      toastError('Vui lòng nhập địa chỉ email để gửi lại xác thực.');
      return;
    }

    setIsResending(true);
    try {
      const res = await authApi.resendVerification({ email: resendEmail.trim() });
      toastSuccess(res.message || 'Đã gửi lại email xác thực thành công!');
    } catch (err: any) {
      toastError(err?.message || 'Không thể gửi lại email xác thực.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100">
      <Header />

      <main className="flex-1 flex items-center justify-center py-20 px-4 sm:px-6">
        <div className="w-full max-w-lg">
          {/* Card Container */}
          <div className="overflow-hidden rounded-3xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200/80 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200">
            {/* Header with Gradient */}
            <div className="bg-gradient-to-r from-slate-900 via-primary-dark to-primary p-6 sm:p-8 text-white text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 shadow-inner mb-3">
                {isLoading ? (
                  <RefreshCw className="h-8 w-8 text-sky-300 animate-spin" />
                ) : isSuccess ? (
                  <ShieldCheck className="h-8 w-8 text-emerald-300 animate-bounce" />
                ) : (
                  <AlertTriangle className="h-8 w-8 text-amber-300" />
                )}
              </div>
              <h1 className="text-xl sm:text-2xl font-black">
                {isLoading
                  ? 'Đang Xác Thực Tài Khoản...'
                  : isSuccess
                  ? 'Xác Thực Tài Khoản Thành Công!'
                  : 'Xác Thực Không Thành Công'}
              </h1>
              <p className="text-xs text-sky-100 mt-1">
                {isSuccess ? 'Chúc mừng bạn đã nâng cấp lên hạng ĐÃ XÁC THỰC' : 'Nền tảng Tuyển dụng TalentPulse'}
              </p>
            </div>

            {/* Body */}
            <div className="p-6 sm:p-8 space-y-6">
              {isLoading ? (
                <div className="py-8 text-center space-y-3">
                  <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Hệ thống đang kiểm tra mã xác minh danh tính của bạn...
                  </p>
                </div>
              ) : isSuccess ? (
                <div className="space-y-6 animate-in fade-in duration-300">
                  <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-5 space-y-3">
                    <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-extrabold text-sm">
                      <CheckCircle2 className="h-5 w-5" />
                      <span>Đặc Quyền Mới Của Bạn:</span>
                    </div>
                    <ul className="text-xs space-y-2 text-slate-700 dark:text-slate-300">
                      <li className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span>Hạn mức tạo tối đa: <strong>6 CV chuyên nghiệp</strong> (thay vì 3 CV)</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Rocket className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span>Quyền <strong>Đẩy Top hồ sơ 1 lần/tuần</strong> lên đầu tìm kiếm của NTD</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span>Huy hiệu <strong>Tích Xanh Xác Minh</strong> hiển thị trên hồ sơ</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span>Thời gian chờ xuất PDF giảm xuống <strong>chỉ còn 3s</strong></span>
                      </li>
                    </ul>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <Link
                      to="/cv/my-cv"
                      className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-primary hover:bg-primary-dark text-white font-extrabold text-xs sm:text-sm shadow-lg shadow-primary/25 transition cursor-pointer"
                    >
                      <FileText className="h-4 w-4" />
                      <span>Quản Lý &amp; Tạo CV Ngay</span>
                      <ArrowRight className="h-4 w-4 ml-1" />
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="space-y-6 animate-in fade-in duration-300">
                  <div className="rounded-2xl bg-rose-500/10 border border-rose-500/20 p-4 text-xs text-rose-700 dark:text-rose-400">
                    <p className="font-bold">{errorMessage}</p>
                    <p className="mt-1 text-slate-600 dark:text-slate-400">
                      Liên kết xác thực có thể đã hết hạn (sau 24h) hoặc đã được sử dụng trước đó.
                    </p>
                  </div>

                  {/* Resend Form */}
                  <form onSubmit={handleResend} className="space-y-3 border-t border-slate-100 dark:border-slate-800 pt-4">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                      Gửi lại email xác thực:
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                          type="email"
                          value={resendEmail}
                          onChange={(e) => setResendEmail(e.target.value)}
                          placeholder="Nhập email của bạn..."
                          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={isResending}
                        className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-800 dark:hover:bg-slate-700 px-4 py-2 text-xs font-bold transition cursor-pointer disabled:opacity-50"
                      >
                        {isResending ? 'Đang gửi...' : 'Gửi lại'}
                      </button>
                    </div>
                  </form>

                  <div className="pt-2 flex justify-center">
                    <Link
                      to="/"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-primary transition"
                    >
                      <Home className="h-4 w-4" />
                      <span>Về Trang Chủ</span>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
