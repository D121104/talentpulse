import { useState, useEffect, useRef } from 'react';
import {
  CheckCircle2,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  ChevronDown,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from 'lucide-react';
import { CV_FONTS } from '../../../lib/cvTypes';

// ================= RICH INLINE FORMATTING TYPES & TOOLBAR =================
export interface FieldFormatting {
  fontSize?: string;
  fontFamily?: string;
  color?: string;
  isBold?: boolean;
  isItalic?: boolean;
  isUnderline?: boolean;
  textAlign?: 'left' | 'center' | 'right';
}

export const PRESET_COLORS = [
  '#000000',
  '#2563EB',
  '#0F172A',
  '#0D9488',
  '#4F46E5',
  '#991B1B',
  '#16A34A',
  '#D97706',
];

export const PRESET_FONT_SIZES = [
  '10px', '11px', '12px', '13px', '14px', '15px', '16px', '17px', '18px', '19px', '20px',
  '21px', '22px', '24px', '26px', '28px', '30px', '32px', '34px', '36px', '38px', '40px',
];

export function resolveFontSizePx(sizeVal?: string | number, fallback: string = '14px'): string {
  if (!sizeVal) return fallback;
  if (typeof sizeVal === 'number') return `${Math.round(sizeVal)}px`;
  if (sizeVal.endsWith('px')) return sizeVal;
  if (sizeVal.endsWith('rem') || sizeVal.endsWith('em')) {
    const num = parseFloat(sizeVal);
    return `${Math.round(num * 16)}px`;
  }
  return `${sizeVal}`;
}

export interface FloatingFormatToolbarProps {
  formatting: FieldFormatting;
  onUpdateFormatting: (newFmt: Partial<FieldFormatting>) => void;
  defaultFontSizePx?: string;
  defaultFontFamily?: string;
  defaultColor?: string;
  defaultTextAlign?: 'left' | 'center' | 'right';
}

export function FloatingFormatToolbar({
  formatting,
  onUpdateFormatting,
  defaultFontSizePx = '14px',
  defaultFontFamily = 'Times New Roman',
  defaultColor = '#000000',
  defaultTextAlign = 'left',
}: FloatingFormatToolbarProps) {
  const [openDropdown, setOpenDropdown] = useState<'size' | 'font' | 'color' | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [shiftX, setShiftX] = useState<number>(0);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Ensure toolbar doesn't overflow outside the viewport when zoomed or near edges
  useEffect(() => {
    const adjustPosition = () => {
      if (!toolbarRef.current) return;
      const rect = toolbarRef.current.getBoundingClientRect();
      const padding = 16;
      const viewportWidth = window.innerWidth;

      if (rect.right > viewportWidth - padding) {
        setShiftX((prev) => prev - (rect.right - (viewportWidth - padding)));
      } else if (rect.left < padding) {
        setShiftX((prev) => prev + (padding - rect.left));
      }
    };

    const timer = setTimeout(adjustPosition, 20);
    window.addEventListener('resize', adjustPosition);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', adjustPosition);
    };
  }, []);

  const effectiveFontFamily = formatting.fontFamily || defaultFontFamily;
  const activeFont = CV_FONTS.find((f) => f.family === effectiveFontFamily) || CV_FONTS[0];
  const displayFontName = activeFont.name.split(' (')[0];
  const displayFontSize = formatting.fontSize || defaultFontSizePx;
  const effectiveColor = formatting.color || defaultColor;
  const effectiveAlign = formatting.textAlign || defaultTextAlign;

  return (
    <div
      ref={toolbarRef}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        left: '50%',
        bottom: 'calc(100% + 8px)',
        transform: `translateX(calc(-50% + ${shiftX}px))`,
      }}
      className="absolute z-40 flex items-center gap-1.5 rounded-2xl border border-slate-200/90 bg-white/95 px-3 py-1.5 shadow-xl shadow-slate-900/15 backdrop-blur-md dark:border-slate-700 dark:bg-slate-900/95 print:hidden select-none whitespace-nowrap animate-in fade-in zoom-in-95 duration-150"
    >
      {/* 1. Custom Font Size Dropdown */}
      <div className="relative">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setOpenDropdown((prev) => (prev === 'size' ? null : 'size'))}
          className="flex h-7 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
        >
          <span>{displayFontSize}</span>
          <ChevronDown className="h-3 w-3 text-slate-400" />
        </button>

        {openDropdown === 'size' && (
          <div className="absolute left-0 top-full mt-1.5 max-h-48 w-24 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-2xl dark:border-slate-700 dark:bg-slate-900 z-50">
            {PRESET_FONT_SIZES.map((sz) => {
              const isSelected = displayFontSize === sz;
              return (
                <button
                  key={sz}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onUpdateFormatting({ fontSize: sz });
                    setOpenDropdown(null);
                  }}
                  className={`flex w-full items-center justify-between px-2.5 py-1 text-xs font-medium hover:bg-primary/10 hover:text-primary transition cursor-pointer ${
                    isSelected
                      ? 'bg-primary/10 text-primary font-bold'
                      : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <span>{sz}</span>
                  {isSelected && <CheckCircle2 className="h-3 w-3 text-primary" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. Custom Font Family Dropdown */}
      <div className="relative">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setOpenDropdown((prev) => (prev === 'font' ? null : 'font'))}
          className="flex h-7 max-w-[140px] items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 truncate cursor-pointer"
        >
          <span className="truncate">{displayFontName}</span>
          <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
        </button>

        {openDropdown === 'font' && (
          <div className="absolute left-0 top-full mt-1.5 w-44 rounded-xl border border-slate-200 bg-white py-1 shadow-2xl dark:border-slate-700 dark:bg-slate-900 z-50">
            {CV_FONTS.map((font) => {
              const isSelected = effectiveFontFamily === font.family;
              return (
                <button
                  key={font.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onUpdateFormatting({ fontFamily: font.family });
                    setOpenDropdown(null);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-1.5 text-xs transition cursor-pointer ${
                    isSelected
                      ? 'bg-primary/10 text-primary font-bold'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  <span style={{ fontFamily: font.family }}>{font.name.split(' (')[0]}</span>
                  {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-700 mx-0.5" />

      {/* 3. Color Picker Swatch */}
      <div className="relative">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setOpenDropdown((prev) => (prev === 'color' ? null : 'color'))}
          className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-slate-200 transition hover:scale-110 shadow-xs cursor-pointer"
          style={{ backgroundColor: effectiveColor }}
          title="Chọn màu chữ"
        />

        {openDropdown === 'color' && (
          <div className="absolute left-0 top-full mt-2 w-36 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-2xl dark:border-slate-700 dark:bg-slate-900 z-50">
            <div className="grid grid-cols-4 gap-1.5">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onUpdateFormatting({ color: c });
                    setOpenDropdown(null);
                  }}
                  className="h-6 w-6 rounded-full border border-slate-200 transition hover:scale-115 cursor-pointer"
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <input
                type="color"
                value={effectiveColor}
                onChange={(e) => onUpdateFormatting({ color: e.target.value })}
                className="h-6 w-full rounded cursor-pointer border-0 bg-transparent"
              />
            </div>
          </div>
        )}
      </div>

      <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-700 mx-0.5" />

      {/* 4. Bold Button */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onUpdateFormatting({ isBold: !formatting.isBold })}
        className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold transition cursor-pointer ${
          formatting.isBold
            ? 'bg-primary text-white shadow-xs'
            : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
        }`}
        title="In đậm (Bold)"
      >
        <Bold className="h-3.5 w-3.5" />
      </button>

      {/* 5. Italic Button */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onUpdateFormatting({ isItalic: !formatting.isItalic })}
        className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold transition cursor-pointer ${
          formatting.isItalic
            ? 'bg-primary text-white shadow-xs'
            : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
        }`}
        title="In nghiêng (Italic)"
      >
        <Italic className="h-3.5 w-3.5" />
      </button>

      {/* 6. Underline Button */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onUpdateFormatting({ isUnderline: !formatting.isUnderline })}
        className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold transition cursor-pointer ${
          formatting.isUnderline
            ? 'bg-primary text-white shadow-xs'
            : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
        }`}
        title="Gạch chân (Underline)"
      >
        <UnderlineIcon className="h-3.5 w-3.5" />
      </button>

      <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-700 mx-0.5" />

      {/* 7. Align Left */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onUpdateFormatting({ textAlign: 'left' })}
        className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold transition cursor-pointer ${
          effectiveAlign === 'left'
            ? 'bg-primary text-white shadow-xs'
            : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
        }`}
        title="Căn trái"
      >
        <AlignLeft className="h-3.5 w-3.5" />
      </button>

      {/* 8. Align Center */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onUpdateFormatting({ textAlign: 'center' })}
        className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold transition cursor-pointer ${
          effectiveAlign === 'center'
            ? 'bg-primary text-white shadow-xs'
            : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
        }`}
        title="Căn giữa"
      >
        <AlignCenter className="h-3.5 w-3.5" />
      </button>

      {/* 9. Align Right */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onUpdateFormatting({ textAlign: 'right' })}
        className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold transition cursor-pointer ${
          effectiveAlign === 'right'
            ? 'bg-primary text-white shadow-xs'
            : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
        }`}
        title="Căn phải"
      >
        <AlignRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ================= INLINE EDITABLE TEXT FIELD COMPONENT =================
export interface InlineTextProps {
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  className?: string;
  style?: React.CSSProperties;
  multiline?: boolean;
  nowrap?: boolean;
  rows?: number;
  asTitle?: boolean;
  initialFormatting?: FieldFormatting;
  defaultFontSizePx?: string;
  defaultFontFamily?: string;
  defaultColor?: string;
  defaultTextAlign?: 'left' | 'center' | 'right';
}

export function InlineText({
  value,
  onChange,
  placeholder,
  className = '',
  style = {},
  multiline = false,
  nowrap = false,
  rows,
  asTitle = false,
  initialFormatting,
  defaultFontSizePx,
  defaultFontFamily,
  defaultColor,
  defaultTextAlign,
}: InlineTextProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [formatting, setFormatting] = useState<FieldFormatting>(initialFormatting || {});
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const initialRows = rows || (multiline ? 2 : 1);

  // Auto-grow textarea height so all text wraps and remains fully visible
  const adjustHeight = () => {
    if (nowrap) return;
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
    window.dispatchEvent(new CustomEvent('talentpulse:cv-content-change'));
  };

  useEffect(() => {
    adjustHeight();
  }, [value, formatting.fontSize, formatting.fontFamily, multiline, nowrap]);

  // Adjust on initial mount and window resize
  useEffect(() => {
    if (nowrap) return;
    const timer = setTimeout(adjustHeight, 50);
    window.addEventListener('resize', adjustHeight);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', adjustHeight);
    };
  }, [nowrap]);

  const handleUpdateFormatting = (newFmt: Partial<FieldFormatting>) => {
    setFormatting((prev) => ({ ...prev, ...newFmt }));
  };

  const computedDefaultFontSize = defaultFontSizePx || resolveFontSizePx(style?.fontSize);
  const computedDefaultFontFamily = defaultFontFamily || (style?.fontFamily as string) || 'Times New Roman';
  const computedDefaultColor = defaultColor || (style?.color as string) || '#1E293B';
  const computedDefaultTextAlign: 'left' | 'center' | 'right' =
    defaultTextAlign ||
    (style?.textAlign as 'left' | 'center' | 'right') ||
    (className.includes('text-center') ? 'center' : className.includes('text-right') ? 'right' : 'left');

  const dynamicStyle: React.CSSProperties = {
    ...style,
    background: 'transparent',
    fontSize: formatting.fontSize || style.fontSize,
    fontFamily: formatting.fontFamily || style.fontFamily,
    color: formatting.color || style.color,
    fontWeight: formatting.isBold !== undefined ? (formatting.isBold ? 'bold' : 'normal') : style.fontWeight,
    fontStyle: formatting.isItalic !== undefined ? (formatting.isItalic ? 'italic' : 'normal') : style.fontStyle,
    textDecoration: formatting.isUnderline !== undefined ? (formatting.isUnderline ? 'underline' : 'none') : style.textDecoration,
    textAlign: formatting.textAlign || computedDefaultTextAlign,
    textTransform: asTitle ? 'uppercase' : style.textTransform,
    wordBreak: nowrap ? 'normal' : 'break-word',
    overflowWrap: nowrap ? 'normal' : 'break-word',
    whiteSpace: nowrap ? 'nowrap' : 'pre-wrap',
    lineHeight: style.lineHeight || 1.35,
  };

  const hoverFocusClasses =
    'transition-all duration-150 rounded px-1 py-0.5 border border-dashed hover:border-red-400 hover:bg-red-50/20 dark:hover:border-red-400/80 dark:hover:bg-red-950/10 focus:border-solid focus:border-primary focus:bg-white focus:shadow-xs focus:outline-none dark:focus:bg-slate-900';

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (!multiline && e.key === 'Enter') {
      e.preventDefault();
      (e.target as HTMLElement)?.blur();
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative ${nowrap ? 'inline-block' : 'block min-w-0 max-w-full w-full'} ${className}`}
    >
      {/* Floating Toolbar appears when focused */}
      {isFocused && (
        <FloatingFormatToolbar
          formatting={formatting}
          onUpdateFormatting={handleUpdateFormatting}
          defaultFontSizePx={computedDefaultFontSize}
          defaultFontFamily={computedDefaultFontFamily}
          defaultColor={computedDefaultColor}
          defaultTextAlign={computedDefaultTextAlign}
        />
      )}

      {nowrap ? (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          style={{
            ...dynamicStyle,
            whiteSpace: 'nowrap',
            width: `${Math.max((value || placeholder).length + 1, 6)}ch`,
            maxWidth: '100%',
          }}
          className={`box-border inline-block ${
            !isFocused ? 'border-transparent' : ''
          } ${hoverFocusClasses} ${
            !value ? 'italic text-slate-400 placeholder:text-slate-400' : ''
          }`}
        />
      ) : (
        <textarea
          ref={textareaRef}
          rows={initialRows}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            adjustHeight();
          }}
          onInput={adjustHeight}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            setIsFocused(true);
            adjustHeight();
          }}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          style={dynamicStyle}
          className={`w-full max-w-full box-border resize-none overflow-hidden block ${
            !isFocused ? 'border-transparent' : ''
          } ${hoverFocusClasses} ${
            !value ? 'italic text-slate-400 placeholder:text-slate-400' : ''
          }`}
        />
      )}
    </div>
  );
}
