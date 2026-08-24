import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, BriefcaseBusiness, LogOut, Moon, ShieldCheck, Sun, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { LanguageSwitcher } from '../../components/common/LanguageSwitcher';

export default function DashboardEntryPage() {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  if (!user) return null;

  const roleConfig = {
    USER: {
      title: t('auth.dashboardCandidateTitle'),
      description: t('auth.dashboardCandidateDesc'),
      icon: UserRound,
      badgeColor: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
    },
    HR: {
      title: t('auth.dashboardHrTitle'),
      description: t('auth.dashboardHrDesc'),
      icon: BriefcaseBusiness,
      badgeColor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
    },
    ADMIN: {
      title: t('auth.dashboardAdminTitle'),
      description: t('auth.dashboardAdminDesc'),
      icon: ShieldCheck,
      badgeColor: 'bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300',
    },
  };

  const config = roleConfig[user.role] ?? roleConfig.USER;
  const RoleIcon = config.icon;

  return (
    <main className="relative min-h-screen bg-slate-50 px-4 py-12 dark:bg-slate-950 sm:px-6 flex items-center justify-center">
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

      <section className="w-full max-w-3xl rounded-[28px] border border-slate-200 bg-white p-8 shadow-xl shadow-slate-950/10 dark:border-slate-800 dark:bg-slate-900 sm:p-12">
        {/* Top bar with logo and logout */}
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-6 mb-8">
          <Link to="/">
            <img src="/logo-lightmode.svg" alt="TalentPulse" className="h-10 w-auto block dark:hidden" />
            <img src="/logo-darkmode.svg" alt="TalentPulse" className="h-10 w-auto hidden dark:block" />
          </Link>
          <button
            onClick={() => void handleLogout()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-600 transition hover:border-red-300 hover:text-red-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-red-800 cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            {t('auth.signOut')}
          </button>
        </div>

        {/* User Info Card */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 mb-8">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary dark:bg-primary/20 shrink-0">
            <RoleIcon className="h-8 w-8" />
          </span>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <p className="text-sm font-semibold text-primary">
                {t('auth.greeting')}, {user.name}
              </p>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${config.badgeColor}`}>
                {user.role}
              </span>
            </div>
            <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {config.title}
            </h1>
          </div>
        </div>

        <p className="max-w-2xl text-sm sm:text-base leading-relaxed text-slate-500 dark:text-slate-400 mb-8">
          {config.description}
        </p>

        {/* Action Button */}
        <div className="flex flex-wrap gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-white transition hover:bg-primary-dark shadow-lg shadow-primary/20 cursor-pointer"
          >
            {t('auth.exploreBtn')}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </main>
  );
}
