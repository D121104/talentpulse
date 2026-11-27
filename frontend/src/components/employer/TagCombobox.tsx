import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, Plus, Search, Sparkles, X } from 'lucide-react';
import { foldVietnameseText } from '../../lib/geocoding';

export interface TagOption {
  id?: string;
  name: string;
}

interface TagComboboxProps {
  label: string;
  required?: boolean;
  placeholder: string;
  selected: string[];
  options: TagOption[];
  onAdd: (value: string, meta?: { isNew?: boolean }) => void | Promise<void>;
  onRemove: (value: string) => void;
  onQueryChange?: (query: string) => void;
  isLoading?: boolean;
  allowCreate?: boolean;
  createActionLabel?: string;
  chipTone?: 'blue' | 'purple' | 'slate';
  emptyHint?: string;
}

const CHIP_STYLES = {
  blue: 'bg-blue-50 text-primary border-blue-200/80 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-300',
  purple: 'bg-purple-50 text-purple-700 border-purple-200/80 dark:bg-purple-950/40 dark:border-purple-800 dark:text-purple-300',
  slate: 'bg-slate-100 text-slate-700 border-slate-200/80 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200',
};

export default function TagCombobox({
  label,
  required = false,
  placeholder,
  selected,
  options,
  onAdd,
  onRemove,
  onQueryChange,
  isLoading = false,
  allowCreate = true,
  createActionLabel = 'Thêm mới',
  chipTone = 'blue',
  emptyHint,
}: TagComboboxProps) {
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const suggestions = useMemo(() => {
    const trimmed = inputValue.trim();
    const foldedQuery = foldVietnameseText(trimmed);

    const matched = options.filter((opt) =>
      foldedQuery ? foldVietnameseText(opt.name).includes(foldedQuery) : true,
    );

    const hasExactMatch = options.some(
      (opt) => foldVietnameseText(opt.name) === foldedQuery,
    );

    const items: Array<{ id?: string; name: string; isNew?: boolean }> = matched.slice(0, 8);
    if (allowCreate && trimmed.length > 0 && !hasExactMatch) {
      items.push({ name: trimmed, isNew: true });
    }
    return items;
  }, [options, inputValue, allowCreate]);

  const commitItem = async (item: { name: string; isNew?: boolean }) => {
    const cleaned = item.name.trim();
    if (!cleaned) return;
    await onAdd(cleaned, { isNew: item.isNew });
    setInputValue('');
    onQueryChange?.('');
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleManualSubmit = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    const exact = options.find(
      (o) => foldVietnameseText(o.name) === foldVietnameseText(trimmed),
    );
    if (exact) {
      void commitItem({ name: exact.name });
    } else if (allowCreate) {
      void commitItem({ name: trimmed, isNew: true });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setIsOpen(true);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        suggestions.length === 0 ? -1 : prev < suggestions.length - 1 ? prev + 1 : 0,
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        suggestions.length === 0 ? -1 : prev > 0 ? prev - 1 : suggestions.length - 1,
      );
    } else if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        void commitItem(suggestions[highlightedIndex]);
      } else {
        handleManualSubmit();
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
        <span className="text-[11px] font-semibold text-slate-400">
          {selected.length} đã chọn
        </span>
      </div>

      {/* Input & Quick Add */}
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onFocus={() => setIsOpen(true)}
              onChange={(e) => {
                const next = e.target.value;
                setInputValue(next);
                onQueryChange?.(next);
                setIsOpen(true);
                setHighlightedIndex(-1);
              }}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-8 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white transition"
            />
            {isLoading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />
            )}
          </div>

          <button
            type="button"
            onClick={handleManualSubmit}
            disabled={!inputValue.trim()}
            aria-label={`Thêm ${label.toLowerCase()}`}
            className="inline-flex items-center gap-1 rounded-xl bg-slate-900 dark:bg-white px-3.5 py-2 text-xs font-bold text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-40 transition cursor-pointer shrink-0 active:scale-95"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Thêm</span>
          </button>
        </div>

        {/* Autocomplete Dropdown */}
        {isOpen && (
          <div className="absolute left-0 right-0 top-full mt-1.5 z-30 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            {suggestions.length > 0 ? (
              <div className="space-y-0.5">
                {suggestions.map((item, idx) => {
                  const isHighlighted = idx === highlightedIndex;
                  const isSelected = selected.some(
                    (s) => foldVietnameseText(s) === foldVietnameseText(item.name),
                  );

                  if (item.isNew) {
                    return (
                      <button
                        key="__create_tag__"
                        type="button"
                        onClick={() => void commitItem(item)}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold text-left transition cursor-pointer ${
                          isHighlighted
                            ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200'
                            : 'bg-amber-50/60 text-amber-800 hover:bg-amber-100/70 dark:bg-amber-950/30 dark:text-amber-300'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                          <span>
                            {createActionLabel}: <strong>{item.name}</strong>
                          </span>
                        </span>
                        <span className="text-[11px] font-bold">+ Thêm</span>
                      </button>
                    );
                  }

                  return (
                    <button
                      key={item.id || item.name}
                      type="button"
                      onClick={() => void commitItem(item)}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-left transition cursor-pointer ${
                        isHighlighted
                          ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light'
                          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span>{item.name}</span>
                      {isSelected && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                          <Check className="h-3.5 w-3.5" />
                          <span>Đã chọn</span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="py-4 text-center text-xs text-slate-400">
                Không có gợi ý phù hợp
              </div>
            )}
          </div>
        )}
      </div>

      {/* Selected Chips */}
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((item) => (
            <span
              key={item}
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold ${CHIP_STYLES[chipTone]}`}
            >
              <span>{item}</span>
              <button
                type="button"
                onClick={() => onRemove(item)}
                aria-label={`Xóa ${item}`}
                className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10 transition cursor-pointer"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        emptyHint && (
          <p className="text-xs text-amber-600 dark:text-amber-400">{emptyHint}</p>
        )
      )}
    </div>
  );
}
