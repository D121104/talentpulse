import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, LoaderCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthContext';
import { ApiError } from '../../lib/api';

export default function GoogleCallbackPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { completeGoogleLogin } = useAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    if (!code) {
      setError(t('auth.googleInvalidCode'));
      return;
    }

    void completeGoogleLogin(code)
      .then((session) => {
        navigate(
          session.user.role === 'HR'
            ? (!session.user.isApproved ? '/pending-approval' : '/dashboard')
            : '/',
          { replace: true },
        );
      })
      .catch((exchangeError) => {
        setError(
          exchangeError instanceof ApiError
            ? exchangeError.message
            : t('auth.googleCallbackErrorFallback'),
        );
      });
  }, [completeGoogleLogin, navigate, searchParams, t]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-950/10 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-6 flex justify-center">
          <img src="/logo-lightmode.svg" alt="TalentPulse" className="h-9 w-auto block dark:hidden" />
          <img src="/logo-darkmode.svg" alt="TalentPulse" className="h-9 w-auto hidden dark:block" />
        </div>

        {error ? (
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 dark:bg-red-900/30 text-red-500 mb-4">
            <AlertCircle className="h-7 w-7" />
          </div>
        ) : (
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4">
            <LoaderCircle className="h-7 w-7 animate-spin" />
          </div>
        )}

        <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">
          {error ? t('auth.googleCallbackErrorTitle') : t('auth.googleCallbackLoadingTitle')}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          {error || t('auth.googleCallbackLoadingDesc')}
        </p>

        {error && (
          <Link
            to="/login"
            className="mt-6 inline-flex rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white transition hover:bg-primary-dark cursor-pointer shadow-sm"
          >
            {t('auth.backToLogin')}
          </Link>
        )}
      </section>
    </main>
  );
}
