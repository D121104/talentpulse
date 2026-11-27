import { useState, useEffect, useRef, useMemo } from 'react';
import {
  MapPin,
  Search,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Globe2,
} from 'lucide-react';
import { FEATURED_CITIES, normalizeFilterText } from '../../lib/jobFilters';

interface LocationDropdownProps {
  value?: string;
  onChange: (locationStr: string) => void;
  className?: string;
  variant?: 'default' | 'hero';
  align?: 'left' | 'right';
  placeholder?: string;
}

export default function LocationDropdown({
  value = 'Tất cả địa điểm',
  onChange,
  className = '',
  variant = 'default',
  align = 'left',
  placeholder = 'Tất cả địa điểm',
}: LocationDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [citySearch, setCitySearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedCity = useMemo(() => {
    const trimmed = (value || '').trim();
    if (!trimmed || trimmed === 'Tất cả địa điểm') return '';
    // Handle legacy compound format gracefully (e.g. "Hà Nội - Cầu Giấy" -> "Hà Nội")
    const primaryPart = trimmed.split(';')[0].split('-')[0].trim();
    const folded = normalizeFilterText(primaryPart);
    const matched = FEATURED_CITIES.find(
      (city) =>
        normalizeFilterText(city.name) === folded ||
        city.aliases?.some((a) => folded.includes(a)) ||
        folded.includes(normalizeFilterText(city.name)),
    );
    return matched ? matched.name : primaryPart;
  }, [value]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Escape key listener to close dropdown
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const filteredCities = useMemo(() => {
    const q = normalizeFilterText(citySearch);
    if (!q) return FEATURED_CITIES;
    return FEATURED_CITIES.filter(
      (city) =>
        normalizeFilterText(city.name).includes(q) ||
        city.aliases?.some((alias) => alias.includes(q)),
    );
  }, [citySearch]);

  const handleSelectCity = (cityName: string) => {
    setCitySearch('');
    setIsOpen(false);
    onChange(cityName);
  };

  const displayLabel = selectedCity || placeholder || 'Tất cả địa điểm';
  const hasSelection = Boolean(selectedCity);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* TRIGGER BAR */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        aria-label="Chọn thành phố"
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen(!isOpen);
          } else if (e.key === 'Escape') {
            setIsOpen(false);
          }
        }}
        className={
          variant === 'hero'
            ? `group flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                isOpen
                  ? 'bg-slate-100 dark:bg-slate-700/80 ring-2 ring-primary/25 text-primary dark:text-primary-light'
                  : 'hover:bg-slate-100/70 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-200'
              }`
            : `flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                isOpen
                  ? 'border-primary ring-2 ring-primary/20 bg-white dark:bg-slate-800'
                  : 'border-slate-200/60 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/70 hover:border-primary/60 hover:bg-white dark:hover:bg-slate-800'
              }`
        }
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <MapPin
            className={`w-4 h-4 shrink-0 transition-colors ${
              hasSelection || isOpen
                ? 'text-primary'
                : 'text-slate-400 dark:text-slate-400 group-hover:text-primary'
            }`}
          />
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
              aria-label="Xóa thành phố đã chọn"
              onClick={(e) => {
                e.stopPropagation();
                handleSelectCity('Tất cả địa điểm');
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

      {/* CLEAN SINGLE-PANE CITY PICKER DROPDOWN */}
      {isOpen && (
        <div
          className={`absolute ${
            align === 'right' ? 'right-0 left-auto' : 'left-0 right-auto'
          } top-full mt-2 w-[calc(100vw-2rem)] sm:w-[340px] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-4 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150`}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
              Chọn tỉnh / thành phố
            </span>
            <span className="text-[11px] font-medium text-slate-400">
              Chọn để lọc ngay
            </span>
          </div>

          {/* Search Input */}
          <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 focus-within:border-primary transition-all">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              type="text"
              value={citySearch}
              onChange={(e) => setCitySearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (filteredCities.length > 0) {
                    handleSelectCity(filteredCities[0].name);
                  }
                }
              }}
              placeholder="Tìm thành phố (VD: Hà Nội, HCM, Đà Nẵng)..."
              className="w-full text-xs bg-transparent text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none font-medium"
            />
            {citySearch && (
              <button
                type="button"
                onClick={() => setCitySearch('')}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* All Locations Reset Option */}
          <button
            type="button"
            onClick={() => handleSelectCity('Tất cả địa điểm')}
            className={`mt-2.5 w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              !hasSelection
                ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light'
                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
          >
            <span className="flex items-center gap-2">
              <Globe2 className="w-3.5 h-3.5 text-primary" />
              <span>Tất cả địa điểm</span>
            </span>
            {!hasSelection && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
          </button>

          {/* Featured Vietnamese Cities Grid */}
          <div className="mt-2 max-h-64 overflow-y-auto pr-1 grid grid-cols-2 gap-1.5">
            {filteredCities.map((city) => {
              const isSelected = selectedCity === city.name;
              return (
                <button
                  key={city.name}
                  type="button"
                  onClick={() => handleSelectCity(city.name)}
                  className={`flex items-center justify-between gap-1.5 px-3 py-2 rounded-xl text-left text-xs transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-primary text-white font-bold shadow-xs shadow-primary/25'
                      : city.featured
                        ? 'bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-slate-100 font-semibold hover:bg-primary/10 hover:text-primary dark:hover:bg-primary/20'
                        : 'text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-primary'
                  }`}
                >
                  <span className="truncate">{city.name}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 shrink-0 stroke-[2.5]" />}
                </button>
              );
            })}
          </div>

          {filteredCities.length === 0 && (
            <p className="py-4 text-center text-xs text-slate-400">
              Không tìm thấy thành phố phù hợp.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
