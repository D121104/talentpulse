import { useState, useEffect, useRef } from 'react';
import { Search, X, Sparkles } from 'lucide-react';
import { getSearchSuggestionsApi } from '../../lib/jobApi';
import LocationDropdown from './LocationDropdown';
import LevelDropdown from './LevelDropdown';
import SalaryDropdown from './SalaryDropdown';

interface JobSearchBarProps {
  initialQuery?: string;
  initialLocation?: string;
  initialLevel?: string;
  initialSalaryRange?: string;
  onSearch: (params: {
    query: string;
    location: string;
    level: string;
    salaryRange: string;
  }) => void;
}

export const LOCATIONS = [
  'Tất cả địa điểm',
  'Hà Nội',
  'Hồ Chí Minh',
  'Đà Nẵng',
  'Cần Thơ',
  'Hải Phòng',
  'Bình Dương',
];

export const LEVELS = [
  'Tất cả cấp bậc',
  'Intern',
  'Fresher',
  'Junior',
  'Middle',
  'Senior',
  'Lead',
  'Manager',
];

export const SALARY_RANGES = [
  { label: 'Tất cả mức lương', value: '' },
  { label: 'Dưới 10 triệu', value: '0-10000000' },
  { label: '10 - 15 triệu', value: '10000000-15000000' },
  { label: '15 - 20 triệu', value: '15000000-20000000' },
  { label: '20 - 30 triệu', value: '20000000-30000000' },
  { label: '30 - 50 triệu', value: '30000000-50000000' },
  { label: 'Trên 50 triệu', value: '50000000-999999999' },
  { label: 'Thỏa thuận', value: 'negotiable' },
];

export const TRENDING_TAGS = [
  'Fullstack',
  'ReactJS',
  'NodeJS',
  'Python',
  'Java',
  'Golang',
  'DevOps',
  'Docker',
  'AWS',
  'Fresher',
  'Senior',
];

export default function JobSearchBar({
  initialQuery = '',
  initialLocation = 'Tất cả địa điểm',
  initialLevel = 'Tất cả cấp bậc',
  initialSalaryRange = '',
  onSearch,
}: JobSearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const [location, setLocation] = useState(initialLocation);
  const [level, setLevel] = useState(initialLevel);
  const [salaryRange, setSalaryRange] = useState(initialSalaryRange);

  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Sync props changes
  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    setLocation(initialLocation);
  }, [initialLocation]);

  useEffect(() => {
    setLevel(initialLevel);
  }, [initialLevel]);

  useEffect(() => {
    setSalaryRange(initialSalaryRange);
  }, [initialSalaryRange]);

  // Autocomplete debounce fetch
  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const list = await getSearchSuggestionsApi(query, 6);
        setSuggestions(list);
      } catch {
        setSuggestions([]);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  // Click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setShowSuggestions(false);
    onSearch({
      query: query.trim(),
      location,
      level,
      salaryRange,
    });
  };

  const handleSelectSuggestion = (text: string) => {
    setQuery(text);
    setShowSuggestions(false);
    onSearch({
      query: text,
      location,
      level,
      salaryRange,
    });
  };

  const handleQuickTagClick = (tag: string) => {
    setQuery(tag);
    setShowSuggestions(false);
    onSearch({
      query: tag,
      location,
      level,
      salaryRange,
    });
  };

  return (
    <div className="w-full">
      <form
        onSubmit={handleSubmit}
        className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-blue-500/5 dark:shadow-black/30 border border-slate-200/80 dark:border-slate-800 p-2.5 sm:p-3 transition-all"
      >
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 sm:gap-3 items-center">
          {/* Main Keyword Input */}
          <div
            ref={searchContainerRef}
            className="relative md:col-span-4 flex items-center bg-slate-50 dark:bg-slate-800/70 rounded-xl px-3.5 py-2.5 border border-slate-200/60 dark:border-slate-700/60 focus-within:border-primary focus-within:bg-white dark:focus-within:bg-slate-800 focus-within:ring-2 focus-within:ring-primary/20 transition-all"
          >
            <Search className="w-4 h-4 text-primary shrink-0 mr-2.5" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => {
                if (suggestions.length > 0) setShowSuggestions(true);
              }}
              placeholder="Tên công việc, vị trí, kỹ năng..."
              className="w-full text-sm bg-transparent text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none font-medium"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setSuggestions([]);
                }}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Suggestions Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-2 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-2 z-50 overflow-hidden">
                <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-primary" />
                  Gợi ý tìm kiếm
                </div>
                {suggestions.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectSuggestion(item)}
                    className="w-full text-left px-3.5 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-primary/10 hover:text-primary dark:hover:bg-primary/20 transition-colors flex items-center gap-2"
                  >
                    <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{item}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Location Select (2-column popup dropdown) */}
          <div className="md:col-span-3">
            <LocationDropdown
              value={location}
              onChange={(newLoc) => {
                setLocation(newLoc);
                onSearch({
                  query: query.trim(),
                  location: newLoc,
                  level,
                  salaryRange,
                });
              }}
            />
          </div>

          {/* Experience / Level Select (Custom Checkbox Dropdown) */}
          <div className="md:col-span-2">
            <LevelDropdown
              value={level}
              onChange={(newLevel) => {
                setLevel(newLevel);
                onSearch({
                  query: query.trim(),
                  location,
                  level: newLevel,
                  salaryRange,
                });
              }}
            />
          </div>

          {/* Salary Range Select (Custom Checkbox & Range Dropdown) */}
          <div className="md:col-span-2">
            <SalaryDropdown
              value={salaryRange}
              onChange={(newSalary) => {
                setSalaryRange(newSalary);
                onSearch({
                  query: query.trim(),
                  location,
                  level,
                  salaryRange: newSalary,
                });
              }}
            />
          </div>

          {/* Submit Button */}
          <div className="md:col-span-1">
            <button
              type="submit"
              className="w-full py-2.5 px-4 bg-primary hover:bg-primary-dark active:scale-[0.98] text-white text-sm font-semibold rounded-xl transition-all shadow-md shadow-primary/25 hover:shadow-primary/35 flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Search className="w-4 h-4" />
              <span className="md:hidden">Tìm việc</span>
            </button>
          </div>
        </div>
      </form>

      {/* Quick Trending Tags */}
      <div className="mt-3.5 flex items-center flex-wrap gap-2 select-none">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1 mr-1">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          Từ khóa phổ biến:
        </span>
        {TRENDING_TAGS.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => handleQuickTagClick(tag)}
            className={`text-xs font-medium px-2.5 py-1 rounded-lg border transition-all ${
              query.toLowerCase() === tag.toLowerCase()
                ? 'bg-primary text-white border-primary shadow-sm shadow-primary/20'
                : 'bg-white/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-slate-700/80 hover:border-primary hover:text-primary dark:hover:border-primary'
            }`}
          >
            {tag}
          </button>
        ))}
      </div>
    </div>
  );
}
