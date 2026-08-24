import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock3, LogOut, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { LanguageSwitcher } from '../../components/common/LanguageSwitcher';

export default function PendingApprovalPage() {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 dark:bg-slate-950">
      {/* Top Right Quick Controls */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2 sm:top-6 sm:right-6">
        <LanguageSwitcher variant="dropdown" />
        <button
          onClick={toggleTheme}
          className="inline-flex items-center justify-center rounded-xl border border-slate-200/80 bg-white/80 p-2.5 text-slate-700 backdrop-blur-md transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer shadow-sm"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>

      <section className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-950/10 dark:border-slate-800 dark:bg-slate-900 sm:p-12">
        <div className="mb-6 flex justify-center">
          <img src="/logo-lightmode.svg" alt="TalentPulse" className="h-10 w-auto block dark:hidden" />
          <img src="/logo-darkmode.svg" alt="TalentPulse" className="h-10 w-auto hidden dark:block" />
        </div>

        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300 shadow-sm">
          <Clock3 className="h-8 w-8" />
        </span>

        <span className="mt-6 inline-block rounded-lg bg-primary/10 px-3 py-1 text-xs font-bold text-primary dark:bg-primary/20">
          {t('auth.pendingBadge')}
        </span>

        <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          {t('auth.pendingTitle')}
        </h1>

        {user?.email && (
          <p className="mt-2 text-xs font-medium text-slate-400">
            {t('auth.pendingAccountPrefix')}
            <span className="font-semibold text-slate-700 dark:text-slate-200">{user.email}</span>
          </p>
        )}

        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          {t('auth.pendingDesc')}
        </p>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 transition hover:border-primary hover:text-primary dark:border-slate-700 dark:text-slate-200 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('auth.backToHome')}
          </Link>
          <button
            onClick={() => void handleLogout()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white transition hover:bg-primary-dark cursor-pointer shadow-sm"
          >
            <LogOut className="h-4 w-4" />
            {t('auth.signOut')}
          </button>
        </div>
      </section>
    </main>
  );
}
