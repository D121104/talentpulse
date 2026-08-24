import { useState, useEffect, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, CheckCircle2, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AuthLayout } from './AuthLayout';
import { ApiError, getGoogleLoginUrl } from '../../lib/api';
import { useAuth } from '../../auth/AuthContext';

function getDestination(user: { role: string; isApproved?: boolean }) {
  return user.role === 'HR' && !user.isApproved ? '/pending-approval' : '/dashboard';
}

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryParams = new URLSearchParams(location.search);
  const registered = queryParams.get('registered');
  const queryError = queryParams.get('error');

  useEffect(() => {
    if (queryError) {
      setError(t('auth.googleCallbackErrorFallback'));
    }
  }, [queryError, t]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const session = await login({ email, password });
      navigate(getDestination(session.user), { replace: true });
    } catch (submissionError) {
      setError(
        submissionError instanceof ApiError
          ? submissionError.message
          : t('auth.loginErrorFallback'),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <div className="mx-auto w-full max-w-md">
        {/* Mobile Header Link */}
        <div className="mb-6 flex items-center justify-between lg:hidden">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-primary transition-colors">
            <ArrowLeft className="h-4 w-4" />
            {t('auth.backToHome')}
          </Link>
          <img src="/logo-lightmode.svg" alt="TalentPulse" className="h-8 w-auto block dark:hidden" />
          <img src="/logo-darkmode.svg" alt="TalentPulse" className="h-8 w-auto hidden dark:block" />
        </div>

        {/* Title */}
        <div className="mb-7">
          <span className="inline-block rounded-lg bg-primary/10 px-3 py-1 text-xs font-bold text-primary dark:bg-primary/20">
            {t('auth.loginWelcome')}
          </span>
          <h2 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            {t('auth.loginTitle')}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            {t('auth.loginSubtitle')}
          </p>
        </div>

        {/* Registration Success Banner */}
        {registered && (
          <div
            role="status"
            className="mb-5 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300"
          >
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
            <span>{t('auth.registeredSuccess')}</span>
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div
            role="alert"
            className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
          >
            <AlertCircle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-200">
              {t('auth.emailLabel')}
            </span>
            <span className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 shadow-sm transition focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 dark:border-slate-700 dark:bg-slate-800">
              <Mail className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
                placeholder={t('auth.emailPlaceholder')}
              />
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 flex items-center justify-between text-sm font-semibold text-slate-700 dark:text-slate-200">
              <span>{t('auth.passwordLabel')}</span>
              <span className="text-xs font-medium text-slate-400">{t('auth.passwordMinLength')}</span>
            </span>
            <span className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 shadow-sm transition focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 dark:border-slate-700 dark:bg-slate-800">
              <LockKeyhole className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                required
                minLength={8}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
                placeholder={t('auth.passwordPlaceholder')}
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-primary dark:hover:bg-slate-700 cursor-pointer"
                aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </span>
          </label>

          <button
            disabled={isSubmitting}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-primary text-sm font-bold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary-dark active:scale-98 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer mt-2"
            type="submit"
          >
            {isSubmitting ? t('auth.signingIn') : t('auth.signInBtn')}
          </button>
        </form>

        {/* Divider */}
        <div className="my-6 flex items-center gap-3 text-xs font-medium uppercase tracking-wider text-slate-400">
          <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
          <span>{t('auth.or')}</span>
          <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        </div>

        {/* Google OAuth Button */}
        <a
          href={getGoogleLoginUrl()}
          className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/80 cursor-pointer active:scale-98"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          {t('auth.continueWithGoogle')}
        </a>

        {/* Footer info */}
        <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
          {t('auth.noAccount')}{' '}
          <Link className="font-bold text-primary hover:text-primary-dark transition-colors" to="/register">
            {t('auth.signUpNow')}
          </Link>
        </p>

        <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
          {t('auth.secureSessionNotice')}
        </p>
      </div>
    </AuthLayout>
  );
}
