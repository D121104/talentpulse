import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Building2, CheckCircle2, Eye, EyeOff, Hash, LockKeyhole, Mail, Users2, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AuthLayout } from './AuthLayout';
import { ApiError, authApi } from '../../lib/api';

type AccountType = 'candidate' | 'hr';

export default function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [accountType, setAccountType] = useState<AccountType>('candidate');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [taxCode, setTaxCode] = useState('');
  const [companyScale, setCompanyScale] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }

    setIsSubmitting(true);
    try {
      const request = { name, email, password };
      if (accountType === 'candidate') {
        await authApi.register(request);
        navigate('/login?registered=1', { replace: true });
      } else {
        await authApi.registerHr({
          ...request,
          companyName,
          taxCode,
          companyScale,
        });
        navigate('/pending-approval', { replace: true });
      }
    } catch (submissionError) {
      setError(
        submissionError instanceof ApiError
          ? submissionError.message
          : t('auth.registerErrorFallback'),
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
        <div className="mb-6">
          <span className="inline-block rounded-lg bg-primary/10 px-3 py-1 text-xs font-bold text-primary dark:bg-primary/20">
            {t('auth.registerWelcome')}
          </span>
          <h2 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            {t('auth.registerTitle')}
          </h2>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            {t('auth.registerSubtitle')}
          </p>
        </div>

        {/* Account Type Selector Tabs */}
        <div className="mb-5 grid grid-cols-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60">
          <button
            type="button"
            onClick={() => setAccountType('candidate')}
            className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-bold transition-all cursor-pointer ${
              accountType === 'candidate'
                ? 'bg-white text-primary shadow-sm dark:bg-slate-700 dark:text-white'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <UserRound className="h-4 w-4" />
            {t('auth.roleCandidate')}
          </button>
          <button
            type="button"
            onClick={() => setAccountType('hr')}
            className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-bold transition-all cursor-pointer ${
              accountType === 'hr'
                ? 'bg-white text-primary shadow-sm dark:bg-slate-700 dark:text-white'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Building2 className="h-4 w-4" />
            {t('auth.roleHr')}
          </button>
        </div>

        {/* Error Banner */}
        {error && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
          >
            <AlertCircle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form className="space-y-3.5" onSubmit={submit} noValidate>
          <AuthField label={t('auth.nameLabel')} icon={UserRound}>
            <input
              required
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('auth.namePlaceholder')}
            />
          </AuthField>

          <AuthField label={t('auth.emailLabel')} icon={Mail}>
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('auth.emailPlaceholder')}
            />
          </AuthField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <AuthField
              label={t('auth.passwordLabel')}
              icon={LockKeyhole}
              trailing={
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="p-1 text-slate-400 hover:text-primary transition-colors cursor-pointer"
                  aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
            >
              <input
                required
                minLength={8}
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('auth.passwordMinLength')}
              />
            </AuthField>

            <AuthField
              label={t('auth.confirmPasswordLabel')}
              icon={CheckCircle2}
              trailing={
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="p-1 text-slate-400 hover:text-primary transition-colors cursor-pointer"
                  aria-label={showConfirmPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
            >
              <input
                required
                minLength={8}
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t('auth.confirmPasswordPlaceholder')}
              />
            </AuthField>
          </div>

          {/* HR Company Information Section */}
          {accountType === 'hr' && (
            <div className="space-y-3.5 rounded-2xl border border-primary/20 bg-primary/[0.03] p-4.5 dark:bg-primary/5 dark:border-primary/30 mt-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                <p className="text-xs font-bold uppercase tracking-wider text-primary">
                  {t('auth.companySectionTitle')}
                </p>
              </div>

              <AuthField label={t('auth.companyNameLabel')} icon={Building2}>
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder={t('auth.companyNamePlaceholder')}
                />
              </AuthField>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <AuthField label={t('auth.taxCodeLabel')} icon={Hash}>
                  <input
                    value={taxCode}
                    onChange={(e) => setTaxCode(e.target.value)}
                    placeholder={t('auth.taxCodePlaceholder')}
                  />
                </AuthField>
                <AuthField label={t('auth.companyScaleLabel')} icon={Users2}>
                  <input
                    value={companyScale}
                    onChange={(e) => setCompanyScale(e.target.value)}
                    placeholder={t('auth.companyScalePlaceholder')}
                  />
                </AuthField>
              </div>
            </div>
          )}

          <button
            disabled={isSubmitting}
            type="submit"
            className="mt-3 flex h-12 w-full items-center justify-center rounded-xl bg-primary text-sm font-bold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary-dark active:scale-98 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
          >
            {isSubmitting
              ? t('auth.creatingAccount')
              : accountType === 'hr'
                ? t('auth.requestHrBtn')
                : t('auth.createCandidateBtn')}
          </button>
        </form>

        {accountType === 'hr' && (
          <p className="mt-3.5 text-center text-xs leading-relaxed text-slate-400 dark:text-slate-500">
            {t('auth.hrApprovalNotice')}
          </p>
        )}

        <p className="mt-5 text-center text-sm text-slate-500 dark:text-slate-400">
          {t('auth.hasAccount')}{' '}
          <Link className="font-bold text-primary hover:text-primary-dark transition-colors" to="/login">
            {t('auth.signInNow')}
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}

interface AuthFieldProps {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  trailing?: React.ReactNode;
  children: React.ReactElement<React.InputHTMLAttributes<HTMLInputElement>>;
}

function AuthField({ label, icon: Icon, trailing, children }: AuthFieldProps) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200">
        {label}
      </span>
      <span className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 shadow-sm transition focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 dark:border-slate-700 dark:bg-slate-800">
        <Icon className="h-4 w-4 shrink-0 text-slate-400" />
        <span className="flex-1 [&>input]:h-11 [&>input]:w-full [&>input]:bg-transparent [&>input]:text-sm [&>input]:text-slate-900 [&>input]:outline-none [&>input]:placeholder:text-slate-400 dark:[&>input]:text-white">
          {children}
        </span>
        {trailing}
      </span>
    </label>
  );
}
