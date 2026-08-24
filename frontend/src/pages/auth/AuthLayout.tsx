import { Link } from 'react-router-dom';
import { ArrowLeft, Moon, Sparkles, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { LanguageSwitcher } from '../../components/common/LanguageSwitcher';
import type { ReactNode } from 'react';

export function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-50 px-4 py-8 dark:bg-slate-950 sm:px-6 lg:flex lg:items-center lg:justify-center">
      {/* Background Glows */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl dark:bg-primary/15" />
        <div className="absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-accent/10 blur-3xl dark:bg-accent/15" />
      </div>

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

      <section className="relative z-10 mx-auto grid w-full max-w-5xl overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-2xl shadow-slate-950/10 dark:border-slate-800 dark:bg-slate-900 lg:grid-cols-[0.95fr_1.05fr]">
        {/* Left Sidebar (Desktop) */}
        <aside className="hidden min-h-full flex-col justify-between bg-gradient-to-br from-primary via-primary-dark to-slate-900 p-10 text-white lg:flex relative overflow-hidden">
          {/* Subtle pattern */}
          <div className="pointer-events-none absolute inset-0 opacity-10">
            <div
              className="size-full"
              style={{
                backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
                backgroundSize: '24px 24px',
              }}
            />
          </div>

          <div className="relative z-10">
            <Link to="/" className="inline-block transition-transform duration-200 hover:scale-102">
              <img src="/logo-darkmode.svg" alt="TalentPulse" className="h-10 w-auto" />
            </Link>
          </div>

          <div className="relative z-10 my-auto py-8">
            <span className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-semibold ring-1 ring-white/15 backdrop-blur-sm">
              <Sparkles className="h-3.5 w-3.5 text-accent-light" />
              {t('auth.sidebarBadge')}
            </span>
            <h1 className="max-w-sm text-3xl xl:text-4xl font-extrabold leading-tight tracking-tight text-white">
              {t('auth.sidebarTitle')}
            </h1>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-white/80">
              {t('auth.sidebarSubtitle')}
            </p>
          </div>

          <div className="relative z-10 flex items-center justify-between border-t border-white/10 pt-4 text-xs text-white/60">
            <Link to="/" className="inline-flex items-center gap-1.5 text-white/80 hover:text-white transition-colors">
              <ArrowLeft className="h-3.5 w-3.5" />
              {t('auth.backToHome')}
            </Link>
            <span>TalentPulse &copy; 2024</span>
          </div>
        </aside>

        {/* Right Form Content */}
        <div className="p-6 sm:p-10 lg:p-12 relative flex flex-col justify-center">{children}</div>
      </section>
    </main>
  );
}
