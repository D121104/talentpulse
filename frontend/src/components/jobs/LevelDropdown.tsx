import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Briefcase,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Search,
} from 'lucide-react';

export const LEVEL_OPTIONS = [
  { id: 'Intern', label: 'Intern', desc: 'Thực tập sinh' },
  { id: 'Fresher', label: 'Fresher', desc: 'Dưới 1 năm kinh nghiệm' },
  { id: 'Junior', label: 'Junior', desc: '1 - 2 năm kinh nghiệm' },
  { id: 'Middle', label: 'Middle', desc: '2 - 4 năm kinh nghiệm' },
  { id: 'Senior', label: 'Senior', desc: '5+ năm kinh nghiệm' },
  { id: 'Lead', label: 'Lead / Trưởng nhóm', desc: 'Quản lý nhóm kỹ thuật' },
  { id: 'Manager', label: 'Manager / Trưởng phòng', desc: 'Quản lý bộ phận' },
  { id: 'Director', label: 'Director / Giám đốc', desc: 'Cấp quản lý cấp cao' },
];

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
  const [selectedLevels, setSelectedLevels] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync prop value to internal array
  useEffect(() => {
    if (!value || value === 'Tất cả cấp bậc') {
      setSelectedLevels([]);
      return;
    }
    const parts = value.split(',').map((s) => s.trim()).filter(Boolean);
    setSelectedLevels(parts);
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

  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return LEVEL_OPTIONS;
    const q = searchQuery.trim().toLowerCase();
    return LEVEL_OPTIONS.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) || opt.desc.toLowerCase().includes(q),
    );
  }, [searchQuery]);

  const isAllSelected = selectedLevels.length === 0;

  const handleToggleSelectAll = () => {
    setSelectedLevels([]);
  };

  const handleToggleLevel = (levelId: string) => {
    setSelectedLevels((prev) => {
      if (prev.includes(levelId)) {
        return prev.filter((id) => id !== levelId);
      } else {
        return [...prev, levelId];
      }
    });
  };

  const handleApply = () => {
    setIsOpen(false);
    if (selectedLevels.length === 0) {
      onChange('Tất cả cấp bậc');
    } else {
      onChange(selectedLevels.join(', '));
    }
  };

  const handleClearAll = () => {
    setSelectedLevels([]);
  };

  const displayLabel = useMemo(() => {
    if (selectedLevels.length === 0) return value || 'Tất cả cấp bậc';
    if (selectedLevels.length === 1) return selectedLevels[0];
    if (selectedLevels.length === 2) return selectedLevels.join(', ');
    return `${selectedLevels[0]} +${selectedLevels.length - 1} cấp bậc`;
  }, [selectedLevels, value]);

  const hasSelection = selectedLevels.length > 0;

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
          <Briefcase className="w-4 h-4 text-primary shrink-0" />
          <span
            className={`text-sm truncate font-medium ${
              hasSelection && displayLabel !== 'Tất cả cấp bậc'
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
                setSelectedLevels([]);
                onChange('Tất cả cấp bậc');
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
        <div className="absolute left-0 sm:left-auto right-0 sm:right-auto md:-left-8 lg:left-0 top-full mt-2 w-[calc(100vw-2rem)] sm:w-[360px] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-4 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
              Chọn cấp bậc kinh nghiệm
            </span>
            {hasSelection && (
              <span className="text-[11px] font-semibold text-primary px-2 py-0.5 rounded-full bg-primary/10">
                Đã chọn {selectedLevels.length}
              </span>
            )}
          </div>

          {/* Quick Search */}
          <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus-within:border-primary">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm cấp bậc..."
              className="w-full text-xs bg-transparent text-slate-800 dark:text-slate-200 placeholder:text-slate-400 outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Options Checkbox List */}
          <div className="mt-3 max-h-60 overflow-y-auto pr-1 space-y-1">
            {/* Select All */}
            <div
              onClick={handleToggleSelectAll}
              className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all ${
                isAllSelected
                  ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light font-bold'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${
                    isAllSelected
                      ? 'bg-primary border-primary text-white shadow-xs'
                      : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                  }`}
                >
                  {isAllSelected && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
                <div>
                  <span className="text-xs font-semibold block">Tất cả cấp bậc</span>
                  <span className="text-[11px] text-slate-400 font-normal">Không giới hạn cấp bậc</span>
                </div>
              </div>
            </div>

            {/* Individual Level Checkboxes */}
            {filteredOptions.map((opt) => {
              const isChecked = selectedLevels.includes(opt.id);

              return (
                <div
                  key={opt.id}
                  onClick={() => handleToggleLevel(opt.id)}
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
                      <span className="text-xs font-semibold block">{opt.label}</span>
                      <span className="text-[11px] text-slate-400 font-normal">{opt.desc}</span>
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
