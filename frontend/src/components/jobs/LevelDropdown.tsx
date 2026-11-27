import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Briefcase,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Search,
} from 'lucide-react';
import { JOB_LEVEL_OPTIONS, normalizeFilterText } from '../../lib/jobFilters';

interface LevelDropdownProps {
  value?: string;
  onChange: (levelStr: string) => void;
  className?: string;
}

export default function LevelDropdown({
  value = 'Tất cả cấp bậc',
  onChange,
  className = '',
}: LevelDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedLevel = useMemo(() => {
    const trimmed = (value || '').trim();
    if (!trimmed || trimmed === 'Tất cả cấp bậc') return '';
    return trimmed.split(',')[0].trim();
  }, [value]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const filteredOptions = useMemo(() => {
    const q = normalizeFilterText(searchQuery);
    if (!q) return JOB_LEVEL_OPTIONS;
    return JOB_LEVEL_OPTIONS.filter(
      (opt) =>
        normalizeFilterText(opt.label).includes(q) ||
        normalizeFilterText(opt.desc).includes(q),
    );
  }, [searchQuery]);

  const handleSelectLevel = (nextValue: string) => {
    setSearchQuery('');
    setIsOpen(false);
    onChange(nextValue);
  };

  const hasSelection = Boolean(selectedLevel);
  const displayLabel = selectedLevel || 'Tất cả cấp bậc';

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* TRIGGER BAR */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        aria-label="Chọn cấp bậc"
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen(!isOpen);
          } else if (e.key === 'Escape') {
            setIsOpen(false);
          }
        }}
        className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
          isOpen
            ? 'border-primary ring-2 ring-primary/20 bg-white dark:bg-slate-800'
            : 'border-slate-200/60 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/70 hover:border-primary/60 hover:bg-white dark:hover:bg-slate-800'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Briefcase className="w-4 h-4 text-primary shrink-0" />
          <span
            className={`text-sm truncate font-medium ${
              hasSelection
                ? 'text-slate-900 dark:text-white font-semibold'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            {displayLabel}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {hasSelection && (
            <button
              type="button"
              aria-label="Xóa cấp bậc"
              onClick={(e) => {
                e.stopPropagation();
                handleSelectLevel('Tất cả cấp bậc');
              }}
              className="p-0.5 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </div>

      {/* FLOATING DROPDOWN POPUP */}
      {isOpen && (
        <div className="absolute left-0 sm:left-auto right-0 sm:right-auto md:-left-8 lg:left-0 top-full mt-2 w-[calc(100vw-2rem)] sm:w-[320px] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-4 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
              Chọn cấp bậc
            </span>
            <span className="text-[11px] font-medium text-slate-400">
              Chọn để lọc ngay
            </span>
          </div>

          {/* Quick Search */}
          <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus-within:border-primary">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm nhanh cấp bậc..."
              className="w-full text-xs bg-transparent text-slate-800 dark:text-slate-200 placeholder:text-slate-400 outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Instant-apply Options List */}
          <div className="mt-2.5 max-h-64 overflow-y-auto pr-1 space-y-1">
            <button
              type="button"
              onClick={() => handleSelectLevel('Tất cả cấp bậc')}
              className={`w-full flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all text-left ${
                !hasSelection
                  ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light font-bold'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
              }`}
            >
              <div>
                <span className="text-xs font-semibold block">Tất cả cấp bậc</span>
                <span className="text-[11px] text-slate-400 font-normal">Không giới hạn cấp bậc</span>
              </div>
              {!hasSelection && <Check className="w-4 h-4 shrink-0 stroke-[2.5]" />}
            </button>

            {filteredOptions.map((opt) => {
              const isSelected = selectedLevel.toLowerCase() === opt.id.toLowerCase();
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSelectLevel(opt.id)}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all text-left ${
                    isSelected
                      ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light font-bold'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div>
                    <span className="text-xs font-semibold block">{opt.label}</span>
                    <span className="text-[11px] text-slate-400 font-normal">{opt.desc}</span>
                  </div>
                  {isSelected && <Check className="w-4 h-4 shrink-0 stroke-[2.5]" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
