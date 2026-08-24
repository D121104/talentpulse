import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { Menu, X, Sun, Moon, Globe, ChevronDown } from 'lucide-react';

export default function Header() {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const switchLang = (lang: string) => {
    i18n.changeLanguage(lang);
    setLangDropdownOpen(false);
  };

  const navLinks = [
    { label: t('nav.jobs'), href: '#featured-jobs' },
    { label: t('nav.companies'), href: '#categories' },
    { label: t('nav.aiMatching'), href: '#ai-features' },
    { label: t('nav.premium'), href: '#premium' },
  ];

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-gray-200/60 dark:border-slate-700/60 shadow-sm'
          : 'bg-transparent'
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 lg:h-18 items-center justify-between">
          {/* Logo */}
          <a href="/" className="flex items-center gap-2 shrink-0">
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
          </a>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-primary dark:hover:text-primary-light rounded-lg hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-all duration-200"
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-2">
            {/* Language Switcher */}
            <div className="relative">
              <button
                onClick={() => setLangDropdownOpen(!langDropdownOpen)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 rounded-lg transition-all duration-200 cursor-pointer"
                aria-label="Switch language"
              >
                <Globe className="w-4 h-4" />
                <span className="hidden sm:inline">{i18n.language === 'vi' ? 'VI' : 'EN'}</span>
                <ChevronDown className="w-3 h-3" />
              </button>
              {langDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setLangDropdownOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 z-20 w-36 rounded-xl bg-white dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 shadow-lg overflow-hidden">
                    <button
                      onClick={() => switchLang('vi')}
                      className={`w-full px-4 py-2.5 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors cursor-pointer ${
                        i18n.language === 'vi' ? 'text-primary font-semibold' : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      🇻🇳 Tiếng Việt
                    </button>
                    <button
                      onClick={() => switchLang('en')}
                      className={`w-full px-4 py-2.5 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors cursor-pointer ${
                        i18n.language === 'en' ? 'text-primary font-semibold' : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      🇬🇧 English
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 rounded-lg transition-all duration-200 cursor-pointer"
              aria-label="Toggle dark mode"
            >
              {theme === 'dark' ? <Sun className="w-4.5 h-4.5" /> : <Moon className="w-4.5 h-4.5" />}
            </button>

            {/* Auth Buttons (Desktop) */}
            <div className="hidden lg:flex items-center gap-2 ml-2">
              <a
                href="/login"
                className="px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 rounded-lg transition-all duration-200 cursor-pointer"
              >
                {t('nav.signIn')}
              </a>
              <a
                href="/register"
                className="px-5 py-2.5 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-xl shadow-sm shadow-primary/20 hover:shadow-md hover:shadow-primary/30 transition-all duration-300 active:scale-95 cursor-pointer"
              >
                {t('nav.signUp')}
              </a>
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

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-gray-200/60 dark:border-slate-700/60">
          <div className="px-4 py-4 space-y-1">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="block px-4 py-3 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-primary hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                {link.label}
              </a>
            ))}
            <div className="pt-3 border-t border-gray-200/60 dark:border-slate-700 flex flex-col gap-2">
              <a href="/login" className="px-4 py-3 text-sm font-semibold text-center text-slate-700 dark:text-slate-200 border border-gray-200 dark:border-slate-700 rounded-xl">
                {t('nav.signIn')}
              </a>
              <a href="/register" className="px-4 py-3 text-sm font-semibold text-center text-white bg-primary rounded-xl">
                {t('nav.signUp')}
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
