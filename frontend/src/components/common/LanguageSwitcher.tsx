import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Globe } from 'lucide-react';

interface LanguageSwitcherProps {
  variant?: 'dropdown' | 'segmented';
  className?: string;
}

export function LanguageSwitcher({ variant = 'dropdown', className = '' }: LanguageSwitcherProps) {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const currentLang = (i18n.resolvedLanguage || i18n.language || 'vi').toLowerCase().startsWith('en')
    ? 'en'
    : 'vi';

  const switchLang = (lang: 'vi' | 'en') => {
    void i18n.changeLanguage(lang);
    localStorage.setItem('i18nextLng', lang);
    setIsOpen(false);
  };

  if (variant === 'segmented') {
    return (
      <div
        className={`inline-flex items-center rounded-xl bg-slate-100 p-0.5 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 ${className}`}
      >
        <button
          type="button"
          onClick={() => switchLang('vi')}
          className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
            currentLang === 'vi'
              ? 'bg-white text-primary shadow-sm dark:bg-slate-700 dark:text-white'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          🇻🇳 VI
        </button>
        <button
          type="button"
          onClick={() => switchLang('en')}
          className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
            currentLang === 'en'
              ? 'bg-white text-primary shadow-sm dark:bg-slate-700 dark:text-white'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          🇬🇧 EN
        </button>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md transition-all cursor-pointer shadow-sm"
        aria-label="Switch language"
      >
        <Globe className="w-4 h-4 text-slate-500 dark:text-slate-400" />
        <span>{currentLang === 'vi' ? 'VI' : 'EN'}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 z-50 w-40 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 shadow-xl shadow-slate-950/10 overflow-hidden py-1">
            <button
              type="button"
              onClick={() => switchLang('vi')}
              className={`w-full px-4 py-2.5 text-xs sm:text-sm text-left flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors cursor-pointer ${
                currentLang === 'vi'
                  ? 'text-primary font-bold bg-primary/5 dark:bg-primary/10'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <span>🇻🇳 Tiếng Việt</span>
              {currentLang === 'vi' && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
            </button>
            <button
              type="button"
              onClick={() => switchLang('en')}
              className={`w-full px-4 py-2.5 text-xs sm:text-sm text-left flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors cursor-pointer ${
                currentLang === 'en'
                  ? 'text-primary font-bold bg-primary/5 dark:bg-primary/10'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <span>🇬🇧 English</span>
              {currentLang === 'en' && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
