import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  FileText,
  UploadCloud,
  LayoutTemplate,
} from 'lucide-react';

export function CVDropdownMenu() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 180);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  const handleNavigate = (path: string, state?: Record<string, unknown>, hash?: string) => {
    setIsOpen(false);
    const isCurrentPage = window.location.pathname === path;

    if (isCurrentPage) {
      if (hash === '#upload' || state?.scrollTo === 'upload') {
        const el = document.getElementById('upload-cv-section');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        window.history.replaceState(null, '', `${path}#upload`);
        window.dispatchEvent(new CustomEvent('talentpulse:scroll-upload'));
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else {
      navigate({ pathname: path, hash: hash || '' }, { state });
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`group flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg transition-all duration-200 cursor-pointer ${
          isOpen
            ? 'text-primary dark:text-primary-light bg-slate-100/80 dark:bg-slate-800/80'
            : 'text-slate-600 dark:text-slate-300 hover:text-primary dark:hover:text-primary-light hover:bg-slate-100/60 dark:hover:bg-slate-800/60'
        }`}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label="CV & Cover letter menu"
      >
        <span>{t('nav.cvDropdown', 'CV & cover letter')}</span>
        <ChevronDown
          className={`h-4 w-4 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-primary dark:text-primary-light' : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'
          }`}
        />
      </button>

      {/* Dropdown Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="absolute left-0 top-full mt-2 w-[310px] sm:w-[330px] rounded-[24px] border border-slate-200/90 bg-white/95 p-3.5 shadow-2xl shadow-slate-950/15 backdrop-blur-2xl dark:border-slate-700/90 dark:bg-slate-900/95 dark:shadow-black/40 z-50"
          >
            {/* Header Title inside Dropdown */}
            <div className="px-3 pt-2 pb-2">
              <h3 className="text-[16px] font-black text-slate-900 dark:text-white tracking-tight">
                {t('nav.cvMenuTitle', 'CV & Cover letter')}
              </h3>
            </div>

            {/* Menu Items List */}
            <div className="space-y-1">
              {/* Item 1: Quản lý CV */}
              <button
                type="button"
                onClick={() => handleNavigate('/my-cv')}
                className="group flex w-full items-center gap-3 rounded-xl p-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100/80 hover:text-primary dark:text-slate-200 dark:hover:bg-slate-800/80 dark:hover:text-primary-light transition-all cursor-pointer"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 group-hover:bg-primary/10 group-hover:text-primary dark:bg-slate-800 dark:text-slate-300 dark:group-hover:bg-primary/20 dark:group-hover:text-primary-light transition-colors">
                  <FileText className="h-4.5 w-4.5" />
                </span>
                <span className="truncate">{t('nav.manageCv', 'Quản lý CV')}</span>
              </button>

              {/* Item 2: Tải CV lên */}
              <button
                type="button"
                onClick={() => handleNavigate('/my-cv', { scrollTo: 'upload', timestamp: Date.now() }, '#upload')}
                className="group flex w-full items-center gap-3 rounded-xl p-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100/80 hover:text-primary dark:text-slate-200 dark:hover:bg-slate-800/80 dark:hover:text-primary-light transition-all cursor-pointer"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 group-hover:bg-primary/10 group-hover:text-primary dark:bg-slate-800 dark:text-slate-300 dark:group-hover:bg-primary/20 dark:group-hover:text-primary-light transition-colors">
                  <UploadCloud className="h-4.5 w-4.5" />
                </span>
                <span className="truncate">{t('nav.uploadCv', 'Tải CV lên')}</span>
              </button>

              {/* Subtle Divider */}
              <div className="my-1.5 border-t border-slate-100 dark:border-slate-800/80" />

              {/* Item 3: Tạo CV - Kho mẫu CV 🔥Hot */}
              <button
                type="button"
                onClick={() => handleNavigate('/cv-templates')}
                className="group flex w-full items-center gap-3 rounded-xl p-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100/80 hover:text-primary dark:text-slate-200 dark:hover:bg-slate-800/80 dark:hover:text-primary-light transition-all cursor-pointer"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 group-hover:bg-primary/10 group-hover:text-primary dark:bg-slate-800 dark:text-slate-300 dark:group-hover:bg-primary/20 dark:group-hover:text-primary-light transition-colors">
                  <LayoutTemplate className="h-4.5 w-4.5" />
                </span>
                <div className="flex flex-1 items-center justify-between min-w-0 pr-1">
                  <span className="truncate">{t('nav.cvTemplatesHot', 'Tạo CV - Kho mẫu CV')}</span>
                  <span className="ml-2 shrink-0 inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-black bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/50 shadow-2xs">
                    🔥{t('nav.hotBadge', 'Hot')}
                  </span>
                </div>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
