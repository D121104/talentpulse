import { useState, useEffect, useRef, useMemo } from 'react';
import {
  DollarSign,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  SlidersHorizontal,
} from 'lucide-react';

export const SALARY_PRESETS = [
  { id: '', label: 'Tất cả mức lương', desc: 'Không giới hạn khoảng lương' },
  { id: '0-10000000', label: 'Dưới 10 triệu', desc: '< 10 triệu VNĐ' },
  { id: '10000000-15000000', label: '10 - 15 triệu', desc: '10M - 15M VNĐ' },
  { id: '15000000-20000000', label: '15 - 20 triệu', desc: '15M - 20M VNĐ' },
  { id: '20000000-25000000', label: '20 - 25 triệu', desc: '20M - 25M VNĐ' },
  { id: '25000000-30000000', label: '25 - 30 triệu', desc: '25M - 30M VNĐ' },
  { id: '30000000-50000000', label: '30 - 50 triệu', desc: '30M - 50M VNĐ' },
  { id: '50000000-999999999', label: 'Trên 50 triệu', desc: '> 50 triệu VNĐ' },
  { id: 'negotiable', label: 'Thỏa thuận', desc: 'Lương thương lượng khi phỏng vấn' },
];

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
  const [selectedPreset, setSelectedPreset] = useState<string>(value);
  const [customMin, setCustomMin] = useState<string>('');
  const [customMax, setCustomMax] = useState<string>('');
  const [isCustomMode, setIsCustomMode] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Sync prop value
  useEffect(() => {
    setSelectedPreset(value || '');
    if (value && value.includes('-') && !SALARY_PRESETS.some((p) => p.id === value)) {
      const [min, max] = value.split('-').map(Number);
      if (!isNaN(min) && min > 0) setCustomMin((min / 1000000).toString());
      if (!isNaN(max) && max > 0 && max < 999999999)
        setCustomMax((max / 1000000).toString());
      setIsCustomMode(true);
    } else {
      setIsCustomMode(false);
    }
  }, [value]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectPreset = (presetId: string) => {
    setSelectedPreset(presetId);
    setIsCustomMode(false);
    setCustomMin('');
    setCustomMax('');
  };

  const handleApplyCustom = () => {
    const minNum = parseFloat(customMin) || 0;
    const maxNum = parseFloat(customMax) || 0;

    if (minNum > 0 || maxNum > 0) {
      const minVal = minNum > 0 ? minNum * 1000000 : 0;
      const maxVal = maxNum > 0 ? maxNum * 1000000 : 999999999;
      const rangeStr = `${minVal}-${maxVal}`;
      setSelectedPreset(rangeStr);
      setIsCustomMode(true);
    }
  };

  const handleApply = () => {
    setIsOpen(false);
    if (isCustomMode) {
      handleApplyCustom();
      const minNum = parseFloat(customMin) || 0;
      const maxNum = parseFloat(customMax) || 0;
      const minVal = minNum > 0 ? minNum * 1000000 : 0;
      const maxVal = maxNum > 0 ? maxNum * 1000000 : 999999999;
      onChange(`${minVal}-${maxVal}`);
    } else {
      onChange(selectedPreset);
    }
  };

  const handleClearAll = () => {
    setSelectedPreset('');
    setIsCustomMode(false);
    setCustomMin('');
    setCustomMax('');
  };

  const displayLabel = useMemo(() => {
    if (isCustomMode && (customMin || customMax)) {
      if (customMin && customMax) return `${customMin} - ${customMax} triệu`;
      if (customMin) return `Từ ${customMin} triệu`;
      if (customMax) return `Tới ${customMax} triệu`;
    }
    const found = SALARY_PRESETS.find((p) => p.id === selectedPreset);
    return found ? found.label : 'Tất cả mức lương';
  }, [selectedPreset, isCustomMode, customMin, customMax]);

  const hasSelection = Boolean(selectedPreset) || (isCustomMode && Boolean(customMin || customMax));

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* TRIGGER BAR */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border cursor-pointer transition-all ${
          isOpen
            ? 'border-primary ring-2 ring-primary/20 bg-white dark:bg-slate-800'
            : 'border-slate-200/60 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/70 hover:border-primary/60 hover:bg-white dark:hover:bg-slate-800'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <DollarSign className="w-4 h-4 text-primary shrink-0" />
          <span
            className={`text-sm truncate font-medium ${
              hasSelection && displayLabel !== 'Tất cả mức lương'
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
              onClick={(e) => {
                e.stopPropagation();
                handleClearAll();
                onChange('');
              }}
              className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
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
        <div className="absolute left-0 sm:left-auto right-0 sm:right-auto md:-left-8 lg:left-0 top-full mt-2 w-[calc(100vw-2rem)] sm:w-[380px] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-4 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
              Chọn khoảng mức lương
            </span>
            <span className="text-[11px] font-medium text-slate-400">
              Đơn vị: VNĐ / Tháng
            </span>
          </div>

          {/* Custom Range Inputs */}
          <div className="mt-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 space-y-2">
            <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
              <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
              Tùy chỉnh khoảng lương (triệu VNĐ):
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 focus-within:border-primary">
                <input
                  type="number"
                  min="0"
                  max="500"
                  step="1"
                  value={customMin}
                  onChange={(e) => {
                    setCustomMin(e.target.value);
                    setIsCustomMode(true);
                    setSelectedPreset('');
                  }}
                  placeholder="Từ..."
                  className="w-full text-xs bg-transparent text-slate-800 dark:text-slate-100 outline-none"
                />
                <span className="text-[11px] text-slate-400 font-medium ml-1">Tr</span>
              </div>
              <span className="text-slate-400 text-xs">-</span>
              <div className="flex-1 flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 focus-within:border-primary">
                <input
                  type="number"
                  min="0"
                  max="500"
                  step="1"
                  value={customMax}
                  onChange={(e) => {
                    setCustomMax(e.target.value);
                    setIsCustomMode(true);
                    setSelectedPreset('');
                  }}
                  placeholder="Đến..."
                  className="w-full text-xs bg-transparent text-slate-800 dark:text-slate-100 outline-none"
                />
                <span className="text-[11px] text-slate-400 font-medium ml-1">Tr</span>
              </div>
            </div>
          </div>

          {/* Preset Options Checkbox List */}
          <div className="mt-3 max-h-56 overflow-y-auto pr-1 space-y-1">
            {SALARY_PRESETS.map((preset) => {
              const isChecked = !isCustomMode && selectedPreset === preset.id;

              return (
                <div
                  key={preset.id}
                  onClick={() => handleSelectPreset(preset.id)}
                  className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all ${
                    isChecked
                      ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light font-bold'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${
                        isChecked
                          ? 'bg-primary border-primary text-white shadow-xs'
                          : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                      }`}
                    >
                      {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <div>
                      <span className="text-xs font-semibold block">{preset.label}</span>
                      <span className="text-[11px] text-slate-400 font-normal">{preset.desc}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer Action Bar */}
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <button
              type="button"
              onClick={handleClearAll}
              className="text-xs font-bold text-slate-500 hover:text-rose-500 dark:text-slate-400 dark:hover:text-rose-400 transition-colors cursor-pointer"
            >
              Bỏ chọn
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Đóng
              </button>

              <button
                type="button"
                onClick={handleApply}
                className="px-5 py-1.5 bg-primary hover:bg-primary-dark active:scale-95 text-white text-xs font-bold rounded-xl shadow-md shadow-primary/25 hover:shadow-primary/35 transition-all cursor-pointer"
              >
                Áp dụng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
