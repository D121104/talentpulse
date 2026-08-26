import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { Menu, X, Sun, Moon, LogOut, Briefcase, FileText, Sparkles, CheckCircle2, UploadCloud, LayoutTemplate } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { LanguageSwitcher } from '../common/LanguageSwitcher';
import { UserAvatar } from '../common/UserAvatar';
import { UserDropdownMenu } from './UserDropdownMenu';
import { CVDropdownMenu } from './CVDropdownMenu';

export default function Header() {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const { user, status, logout } = useAuth();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl border-b border-gray-200/60 dark:border-slate-700/60 shadow-sm'
          : 'bg-transparent'
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 lg:h-18 items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <img
              src="/logo-lightmode.svg"
              alt="TalentPulse"
              className="h-10 sm:h-12 w-auto block dark:hidden transition-all duration-200"
            />
            <img
              src="/logo-darkmode.svg"
              alt="TalentPulse"
              className="h-10 sm:h-12 w-auto hidden dark:block transition-all duration-200"
            />
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-1">
            <a
              href="/#featured-jobs"
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-primary dark:hover:text-primary-light rounded-lg hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-all duration-200"
            >
              {t('nav.jobs')}
            </a>
            <a
              href="/#categories"
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-primary dark:hover:text-primary-light rounded-lg hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-all duration-200"
            >
              {t('nav.companies')}
            </a>

            {/* CV Dropdown Menu (Replaces AI Matching) */}
            <CVDropdownMenu />

            <Link
              to={status === 'authenticated' ? (user?.role === 'HR' ? '/dashboard?tab=premium' : '/premium') : '/login'}
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-primary dark:hover:text-primary-light rounded-lg hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-all duration-200"
            >
              {t('nav.premium')}
            </Link>
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Language Switcher */}
            <LanguageSwitcher variant="dropdown" />

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 rounded-xl transition-all duration-200 cursor-pointer"
              aria-label="Toggle dark mode"
            >
              {theme === 'dark' ? <Sun className="w-4.5 h-4.5" /> : <Moon className="w-4.5 h-4.5" />}
            </button>

            {/* Auth Buttons / Profile Menu (Desktop) */}
            <div className="hidden lg:flex items-center gap-2 ml-1">
              {status === 'authenticated' && user ? (
                <UserDropdownMenu />
              ) : (
                <>
                  <Link
                    to="/login"
                    className="px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 rounded-lg transition-all duration-200 cursor-pointer"
                  >
                    {t('nav.signIn')}
                  </Link>
                  <Link
                    to="/register"
                    className="px-5 py-2.5 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-xl shadow-sm shadow-primary/20 hover:shadow-md hover:shadow-primary/30 transition-all duration-300 active:scale-95 cursor-pointer"
                  >
                    {t('nav.signUp')}
                  </Link>
                </>
              )}
            </div>

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-gray-200/60 dark:border-slate-700/60 max-h-[85vh] overflow-y-auto">
          <div className="px-4 py-4 space-y-1">
            {/* Authenticated User Header on Mobile */}
            {status === 'authenticated' && user && (
              <div className="mb-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-4 border border-slate-200/60 dark:border-slate-700/60">
                <div className="flex items-center gap-3">
                  <UserAvatar src={user.avatar} alt={user.name} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{user.name}</p>
                    <div className="flex items-center gap-1 text-xs">
                      {user.isPremium ? (
                        <span className="text-amber-500 font-bold flex items-center gap-1">
                          👑 {user.role === 'HR' ? 'HR Premium' : 'Candidate Premium'}
                        </span>
                      ) : user.isVerified ? (
                        <span className="text-sky-600 dark:text-sky-400 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          {t('userMenu.verifiedAccount', 'Tài khoản đã xác thực')}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-medium">
                          Tài khoản thường (Chưa xác thực)
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-slate-400">{user.email}</p>
                  </div>
                </div>

                {/* Quick Shortcuts */}
                <div className="mt-3 grid grid-cols-2 gap-2 pt-3 border-t border-slate-200/60 dark:border-slate-700/60 text-xs">
                  <Link
                    to="/saved-jobs"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-1.5 p-2 rounded-lg bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                  >
                    <Briefcase className="h-3.5 w-3.5 text-primary" />
                    <span>{t('userMenu.jobManagement')}</span>
                  </Link>
                  <Link
                    to="/my-cv"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-1.5 p-2 rounded-lg bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                  >
                    <FileText className="h-3.5 w-3.5 text-primary" />
                    <span>{t('userMenu.myCvs')}</span>
                  </Link>
                </div>
              </div>
            )}

            {/* Standard Nav Links */}
            <a
              href="/#featured-jobs"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-primary hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              {t('nav.jobs')}
            </a>
            <a
              href="/#categories"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-primary hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              {t('nav.companies')}
            </a>

            {/* Mobile CV Group */}
            <div className="my-1.5 p-2 rounded-2xl bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 space-y-1">
              <div className="px-2.5 py-1 text-xs font-bold text-slate-400 uppercase tracking-wider">
                {t('nav.cvMenuTitle', 'CV & Cover letter')}
              </div>
              <Link
                to="/my-cv"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:text-primary rounded-xl hover:bg-white dark:hover:bg-slate-700 transition-colors"
              >
                <FileText className="h-4 w-4 text-slate-400" />
                <span>{t('nav.manageCv', 'Quản lý CV')}</span>
              </Link>
              <Link
                to="/my-cv#upload"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setTimeout(() => {
                    const el = document.getElementById('upload-cv-section');
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    window.dispatchEvent(new CustomEvent('talentpulse:scroll-upload'));
                  }, 150);
                }}
                className="flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:text-primary rounded-xl hover:bg-white dark:hover:bg-slate-700 transition-colors"
              >
                <UploadCloud className="h-4 w-4 text-slate-400" />
                <span>{t('nav.uploadCv', 'Tải CV lên')}</span>
              </Link>
              <Link
                to="/cv-templates"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:text-primary rounded-xl hover:bg-white dark:hover:bg-slate-700 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <LayoutTemplate className="h-4 w-4 text-slate-400" />
                  <span>{t('nav.cvTemplatesHot', 'Tạo CV - Kho mẫu CV')}</span>
                </div>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-black bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/50">
                  🔥{t('nav.hotBadge', 'Hot')}
                </span>
              </Link>
            </div>

            <Link
              to={status === 'authenticated' ? (user?.role === 'HR' ? '/dashboard?tab=premium' : '/premium') : '/login'}
              onClick={() => setMobileMenuOpen(false)}
              className="block px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-primary hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              {t('nav.premium')}
            </Link>

            {/* Auth CTAs */}
            <div className="pt-3 border-t border-gray-200/60 dark:border-slate-700 flex flex-col gap-2">
              {status === 'authenticated' && user ? (
                <>
                  {user.role === 'HR' && (
                    <Link
                      to="/dashboard"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-center text-primary bg-primary/10 dark:bg-primary/20 rounded-xl"
                    >
                      <Sparkles className="h-4 w-4" />
                      {t('nav.myDashboard')}
                    </Link>
                  )}
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      void handleLogout();
                    }}
                    className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-center text-white bg-red-600 hover:bg-red-700 rounded-xl cursor-pointer"
                  >
                    <LogOut className="h-4 w-4" />
                    {t('nav.signOut')}
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="px-4 py-3 text-sm font-semibold text-center text-slate-700 dark:text-slate-200 border border-gray-200 dark:border-slate-700 rounded-xl"
                  >
                    {t('nav.signIn')}
                  </Link>
                  <Link
                    to="/register"
                    onClick={() => setMobileMenuOpen(false)}
                    className="px-4 py-3 text-sm font-semibold text-center text-white bg-primary rounded-xl"
                  >
                    {t('nav.signUp')}
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
