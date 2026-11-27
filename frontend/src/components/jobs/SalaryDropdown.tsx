import { useState, useEffect, useRef, useMemo } from 'react';
import {
  DollarSign,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  SlidersHorizontal,
} from 'lucide-react';
import { SALARY_PRESETS } from '../../lib/jobFilters';

interface SalaryDropdownProps {
  value?: string;
  onChange: (salaryRangeStr: string) => void;
  className?: string;
}

export default function SalaryDropdown({
  value = '',
  onChange,
  className = '',
}: SalaryDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [customMin, setCustomMin] = useState<string>('');
  const [customMax, setCustomMax] = useState<string>('');

  const containerRef = useRef<HTMLDivElement>(null);

  const isCustomPreset = Boolean(
    value && value.includes('-') && !SALARY_PRESETS.some((p) => p.id === value),
  );

  // Sync custom numeric inputs when external value is a custom range
  useEffect(() => {
    if (value && value.includes('-') && !SALARY_PRESETS.some((p) => p.id === value)) {
      const [min, max] = value.split('-').map(Number);
      setCustomMin(!isNaN(min) && min > 0 ? (min / 1000000).toString() : '');
      setCustomMax(!isNaN(max) && max > 0 && max < 999999999 ? (max / 1000000).toString() : '');
    } else {
      setCustomMin('');
      setCustomMax('');
    }
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

  const handleSelectPreset = (presetId: string) => {
    setCustomMin('');
    setCustomMax('');
    setIsOpen(false);
    onChange(presetId);
  };

  const handleApplyCustom = () => {
    const minNum = parseFloat(customMin) || 0;
    const maxNum = parseFloat(customMax) || 0;

    if (minNum <= 0 && maxNum <= 0) {
      setIsOpen(false);
      onChange('');
      return;
    }

    const minVal = minNum > 0 ? minNum * 1000000 : 0;
    const maxVal = maxNum > 0 ? maxNum * 1000000 : 999999999;
    setIsOpen(false);
    onChange(`${minVal}-${maxVal}`);
  };

  const displayLabel = useMemo(() => {
    if (isCustomPreset && (customMin || customMax)) {
      if (customMin && customMax) return `${customMin} - ${customMax} triệu`;
      if (customMin) return `Từ ${customMin} triệu`;
      if (customMax) return `Tới ${customMax} triệu`;
    }
    const found = SALARY_PRESETS.find((p) => p.id === (value || ''));
    return found ? found.label : 'Tất cả mức lương';
  }, [value, isCustomPreset, customMin, customMax]);

  const hasSelection = Boolean(value);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* TRIGGER BAR */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        aria-label="Chọn mức lương"
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
          <DollarSign className="w-4 h-4 text-primary shrink-0" />
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
              aria-label="Xóa mức lương"
              onClick={(e) => {
                e.stopPropagation();
                handleSelectPreset('');
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
        <div className="absolute left-0 sm:left-auto right-0 sm:right-auto md:-left-8 lg:right-0 lg:left-auto top-full mt-2 w-[calc(100vw-2rem)] sm:w-[340px] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-4 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
              Chọn khoảng mức lương
            </span>
            <span className="text-[11px] font-medium text-slate-400">
              Chọn để lọc ngay
            </span>
          </div>

          {/* Preset Options - 1 Click Instant Apply */}
          <div className="mt-2.5 max-h-60 overflow-y-auto pr-1 space-y-1">
            {SALARY_PRESETS.map((preset) => {
              const isSelected = !isCustomPreset && (value || '') === preset.id;

              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset.id)}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all text-left ${
                    isSelected
                      ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light font-bold'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div>
                    <span className="text-xs font-semibold block">{preset.label}</span>
                    <span className="text-[11px] text-slate-400 font-normal">{preset.desc}</span>
                  </div>
                  {isSelected && <Check className="w-4 h-4 shrink-0 stroke-[2.5]" />}
                </button>
              );
            })}
          </div>

          {/* Custom Numeric Range Input */}
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
              <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
              Hoặc nhập khoảng tùy chỉnh (triệu VNĐ):
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 focus-within:border-primary">
                <input
                  type="number"
                  min="0"
                  max="500"
                  step="1"
                  value={customMin}
                  onChange={(e) => setCustomMin(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleApplyCustom();
                    }
                  }}
                  placeholder="Từ..."
                  className="w-full text-xs bg-transparent text-slate-800 dark:text-slate-100 outline-none"
                />
                <span className="text-[11px] text-slate-400 font-medium ml-1">Tr</span>
              </div>
              <span className="text-slate-400 text-xs">-</span>
              <div className="flex-1 flex items-center bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 focus-within:border-primary">
                <input
                  type="number"
                  min="0"
                  max="500"
                  step="1"
                  value={customMax}
                  onChange={(e) => setCustomMax(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleApplyCustom();
                    }
                  }}
                  placeholder="Đến..."
                  className="w-full text-xs bg-transparent text-slate-800 dark:text-slate-100 outline-none"
                />
                <span className="text-[11px] text-slate-400 font-medium ml-1">Tr</span>
              </div>
              <button
                type="button"
                disabled={!customMin && !customMax}
                onClick={handleApplyCustom}
                className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-dark disabled:opacity-40 transition-colors cursor-pointer shrink-0"
              >
                Lọc
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
