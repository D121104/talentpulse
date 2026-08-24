import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Save,
  Type,
  LayoutGrid,
  Sparkles,
  Plus,
  Trash2,
  Layers,
  ZoomIn,
  ZoomOut,
  Crown,
  CheckCircle2,
  X,
  Phone,
  Mail,
  MapPin,
  Globe,
  MoveUp,
  MoveDown,
  Sun,
  Moon,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  ChevronDown,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { onlineCvApi } from '../../lib/cvApi';
import { CV_FONTS, CV_THEMES } from '../../lib/cvTypes';
import type {
  OnlineCV,
  CVTemplateType,
  EducationEntry,
  WorkExperienceEntry,
  SkillEntry,
  ActivityEntry,
  CertificateEntry,
  AwardEntry,
  CVFontOption,
  CVThemeOption,
} from '../../lib/cvTypes';

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

const PRESET_COLORS = [
  '#000000',
  '#2563EB',
  '#0F172A',
  '#0D9488',
  '#4F46E5',
  '#991B1B',
  '#16A34A',
  '#D97706',
];

const PRESET_FONT_SIZES = [
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

interface FloatingFormatToolbarProps {
  formatting: FieldFormatting;
  onUpdateFormatting: (newFmt: Partial<FieldFormatting>) => void;
  defaultFontSizePx?: string;
  defaultFontFamily?: string;
  defaultColor?: string;
  defaultTextAlign?: 'left' | 'center' | 'right';
}

function FloatingFormatToolbar({
  formatting,
  onUpdateFormatting,
  defaultFontSizePx = '14px',
  defaultFontFamily = 'Times New Roman',
  defaultColor = '#000000',
  defaultTextAlign = 'left',
}: FloatingFormatToolbarProps) {
  const [openDropdown, setOpenDropdown] = useState<'size' | 'font' | 'color' | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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
      className="absolute -top-12 left-0 z-40 flex items-center gap-1.5 rounded-2xl border border-slate-200/90 bg-white/95 px-3 py-1.5 shadow-xl shadow-slate-900/15 backdrop-blur-md dark:border-slate-700 dark:bg-slate-900/95 print:hidden select-none animate-in fade-in zoom-in-95 duration-150"
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
interface InlineTextProps {
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  className?: string;
  style?: React.CSSProperties;
  multiline?: boolean;
  rows?: number;
  asTitle?: boolean;
  initialFormatting?: FieldFormatting;
  defaultFontSizePx?: string;
  defaultFontFamily?: string;
  defaultColor?: string;
  defaultTextAlign?: 'left' | 'center' | 'right';
}

function InlineText({
  value,
  onChange,
  placeholder,
  className = '',
  style = {},
  multiline = false,
  rows = 2,
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

  // Auto-grow textarea height
  useEffect(() => {
    if (multiline && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [value, multiline, formatting.fontSize]);

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
  };

  const hoverFocusClasses =
    'transition-all duration-150 rounded px-1.5 py-0.5 border border-dashed hover:border-red-400 hover:bg-red-50/20 dark:hover:border-red-400/80 dark:hover:bg-red-950/10 focus:border-solid focus:border-primary focus:bg-white focus:shadow-xs focus:outline-none dark:focus:bg-slate-900';

  return (
    <div ref={containerRef} className={`relative block min-w-0 max-w-full ${className}`}>
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

      {multiline ? (
        <textarea
          ref={textareaRef}
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          style={dynamicStyle}
          className={`w-full max-w-full box-border resize-none overflow-hidden block ${
            !isFocused ? 'border-transparent' : ''
          } ${hoverFocusClasses} ${
            !value ? 'italic text-slate-400 placeholder:text-slate-400' : ''
          }`}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          style={dynamicStyle}
          className={`w-full max-w-full box-border block ${
            !isFocused ? 'border-transparent' : ''
          } ${hoverFocusClasses} ${
            !value ? 'italic text-slate-400 placeholder:text-slate-400' : ''
          } ${asTitle ? 'uppercase' : ''}`}
        />
      )}
    </div>
  );
}

// ================= MAIN CV EDITOR PAGE =================
export default function CVEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, accessToken } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const isNew = id === 'new' || !id;
  const initialTemplate = (searchParams.get('template') as CVTemplateType) || 'template1';

  // Core Form State
  const [title, setTitle] = useState<string>('CV Chưa đặt tên');
  const [templateType, setTemplateType] = useState<CVTemplateType>(initialTemplate);
  const [fontFamilyId, setFontFamilyId] = useState<string>(
    initialTemplate === 'template1' ? 'times' : 'inter',
  );
  const [themeColorId, setThemeColorId] = useState<string>('primary-blue');
  const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [lineSpacing, setLineSpacing] = useState<number>(1.3);

  // Form Fields
  const [fullName, setFullName] = useState<string>(user?.name || 'Trần Quốc An');
  const [position, setPosition] = useState<string>('Vị trí ứng tuyển');
  const [phone, setPhone] = useState<string>('0123 456 789');
  const [email, setEmail] = useState<string>(user?.email || 'email@example.com');
  const [link, setLink] = useState<string>('linkedin.com/in/username');
  const [address, setAddress] = useState<string>('Hà Nội, Việt Nam');
  const [careerObjective, setCareerObjective] = useState<string>(
    'Mục tiêu nghề nghiệp của bạn, bao gồm mục tiêu ngắn hạn và dài hạn',
  );

  const [education, setEducation] = useState<EducationEntry[]>([
    {
      schoolName: 'Tên trường học',
      major: 'Ngành học / Môn học',
      startDate: 'Bắt đầu',
      endDate: 'Kết thúc',
      description: 'Mô tả quá trình học tập hoặc thành tích của bạn',
    },
  ]);

  const [workExperience, setWorkExperience] = useState<WorkExperienceEntry[]>([
    {
      companyName: 'Tên công ty',
      position: 'Vị trí công việc',
      startDate: 'Bắt đầu',
      endDate: 'Kết thúc',
      description: 'Mô tả kinh nghiệm làm việc của bạn',
    },
  ]);

  const [skills, setSkills] = useState<SkillEntry[]>([
    { name: 'Tên kỹ năng', description: 'Mô tả kỹ năng' },
    { name: 'Kỹ năng chuyên môn', description: 'Mức độ thành thạo' },
  ]);

  const [activities, setActivities] = useState<ActivityEntry[]>([
    {
      organizationName: 'Tên tổ chức',
      position: 'Vị trí của bạn',
      startDate: 'Bắt đầu',
      endDate: 'Kết thúc',
      description: 'Mô tả hoạt động',
    },
  ]);

  const [certificates, setCertificates] = useState<CertificateEntry[]>([
    { name: 'Tên chứng chỉ', date: 'Năm' },
  ]);

  const [awards, setAwards] = useState<AwardEntry[]>([
    { name: 'Tên giải thưởng', date: 'Năm' },
  ]);

  // Section Visibility
  const [visibleSections, setVisibleSections] = useState({
    objective: true,
    education: true,
    experience: true,
    skills: true,
    activities: true,
    certificates: false,
    awards: false,
  });

  // Dynamic Section Order
  const DEFAULT_SECTION_ORDER = [
    'objective',
    'education',
    'experience',
    'skills',
    'activities',
    'certificates',
    'awards',
  ];
  const [sectionOrder, setSectionOrder] = useState<string[]>(DEFAULT_SECTION_ORDER);

  const moveSection = (sectionKey: string, direction: 'up' | 'down') => {
    setSectionOrder((prev) => {
      const idx = prev.indexOf(sectionKey);
      if (idx === -1) return prev;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(targetIdx, 0, item);
      markDirty();
      return next;
    });
  };

  // CV Display Language
  const [cvLanguage, setCvLanguage] = useState<'vi' | 'en'>('vi');

  const SECTION_LABELS = {
    vi: {
      objective: 'MỤC TIÊU NGHỀ NGHIỆP',
      education: 'HỌC VẤN',
      experience: 'KINH NGHIỆM LÀM VIỆC',
      skills: 'KỸ NĂNG CHUYÊN MÔN',
      activities: 'HOẠT ĐỘNG & DỰ ÁN',
      certificates: 'CHỨNG CHỈ',
      awards: 'GIẢI THƯỞNG',
      personalInfo: 'THÔNG TIN CÁ NHÂN',
      contact: 'THÔNG TIN LIÊN HỆ',
    },
    en: {
      objective: 'CAREER OBJECTIVE',
      education: 'EDUCATION',
      experience: 'WORK EXPERIENCE',
      skills: 'PROFESSIONAL SKILLS',
      activities: 'ACTIVITIES & PROJECTS',
      certificates: 'CERTIFICATES',
      awards: 'HONORS & AWARDS',
      personalInfo: 'PERSONAL INFORMATION',
      contact: 'CONTACT INFORMATION',
    },
  };

  // UI States
  const [activeSidebarTool, setActiveSidebarTool] = useState<
    'design' | 'sections' | 'templates' | 'language' | 'ai' | 'library' | null
  >('design');
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [zoomScale, setZoomScale] = useState<number>(0.9);
  const [showAiModal, setShowAiModal] = useState(false);
  const [existingCvs, setExistingCvs] = useState<OnlineCV[]>([]);

  const currentFont: CVFontOption =
    CV_FONTS.find((f) => f.id === fontFamilyId) || CV_FONTS[0];
  const currentTheme: CVThemeOption =
    CV_THEMES.find((t) => t.id === themeColorId) || CV_THEMES[0];

  const fontSizeMultipliers = {
    small: 0.9,
    medium: 1.0,
    large: 1.1,
  };
  const fontMultiplier = fontSizeMultipliers[fontSize] || 1.0;

  // Mark dirty
  const markDirty = () => {
    if (!isDirty) setIsDirty(true);
  };

  // Prevent accidental page close / reload when dirty
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Load existing CV data if editing
  useEffect(() => {
    if (!isNew && id && accessToken) {
      void (async () => {
        try {
          const cv = await onlineCvApi.findOne(id, accessToken);
          if (cv) {
            setTitle(`CV - ${cv.fullName || 'Chưa đặt tên'}`);
            setTemplateType(cv.templateType || 'template1');
            setFullName(cv.fullName || '');
            setPosition(cv.position || '');
            setPhone(cv.phone || '');
            setEmail(cv.email || '');
            setLink(cv.link || '');
            setAddress(cv.address || '');
            setCareerObjective(cv.careerObjective || '');

            if (cv.sectionOrder && Array.isArray(cv.sectionOrder) && cv.sectionOrder.length > 0) {
              setSectionOrder(cv.sectionOrder);
            }
            if (cv.fontFamily) setFontFamilyId(cv.fontFamily);
            if (cv.themeColor) setThemeColorId(cv.themeColor);
            if (cv.fontSize) setFontSize(cv.fontSize);

            if (cv.education && cv.education.length > 0) setEducation(cv.education);
            if (cv.workExperience && cv.workExperience.length > 0)
              setWorkExperience(cv.workExperience);
            if (cv.skills && cv.skills.length > 0) setSkills(cv.skills);
            if (cv.activities && cv.activities.length > 0) {
              setActivities(cv.activities);
              setVisibleSections((prev) => ({ ...prev, activities: true }));
            }
            if (cv.certificates && cv.certificates.length > 0) {
              setCertificates(cv.certificates);
              setVisibleSections((prev) => ({ ...prev, certificates: true }));
            }
            if (cv.awards && cv.awards.length > 0) {
              setAwards(cv.awards);
              setVisibleSections((prev) => ({ ...prev, awards: true }));
            }
          }
        } catch (error) {
          console.error('Failed to load CV:', error);
        }
      })();
    }
  }, [id, isNew, accessToken]);

  // Fetch existing user CVs for library tool
  useEffect(() => {
    if (accessToken) {
      onlineCvApi
        .findAll(accessToken)
        .then((data) => setExistingCvs(data || []))
        .catch(() => {});
    }
  }, [accessToken]);

  // Auto-set title on initial name/position change
  useEffect(() => {
    if (isNew && fullName) {
      setTitle(`CV - ${fullName}${position ? ` - ${position}` : ''}`);
    }
  }, [fullName, position, isNew]);

  // Serializes the live interactive canvas into clean, static HTML for Puppeteer
  const generateStaticPrintHtml = (rootEl: HTMLElement): string => {
    const clone = rootEl.cloneNode(true) as HTMLElement;
    clone.style.transform = 'none';
    clone.style.margin = '0 auto';
    clone.style.boxShadow = 'none';

    // Remove any interactive UI elements, edit buttons, toolbars, popovers
    clone.querySelectorAll('.print\\:hidden, button, [role="toolbar"], [data-toolbar]').forEach((el) => el.remove());

    const liveInputs = rootEl.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
    const cloneInputs = clone.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea');

    cloneInputs.forEach((input, index) => {
      const liveInput = liveInputs[index];
      const isTextarea = input.tagName === 'TEXTAREA';
      const tag = isTextarea ? 'div' : 'span';
      const replacement = document.createElement(tag);

      replacement.className = input.className
        .replace(/border-[^\s]+/g, '')
        .replace(/focus:[^\s]+/g, '')
        .replace(/hover:[^\s]+/g, '');
      replacement.style.cssText = input.style.cssText;
      replacement.style.border = 'none';
      replacement.style.outline = 'none';
      replacement.style.background = 'transparent';
      replacement.style.boxShadow = 'none';
      replacement.style.display = isTextarea ? 'block' : 'inline-block';
      replacement.style.whiteSpace = 'pre-wrap';
      replacement.style.wordBreak = 'break-word';

      const textVal = liveInput ? liveInput.value : (input.value || input.getAttribute('value') || '');
      replacement.textContent = textVal;

      input.parentNode?.replaceChild(replacement, input);
    });

    return clone.outerHTML;
  };

  // Manual Save Handler
  const handleSaveCV = async () => {
    if (!fullName.trim()) {
      alert('Vui lòng nhập Họ và tên trong CV!');
      return;
    }

    setIsSaving(true);
    try {
      // Clean HTML snapshot of CV print canvas
      let htmlContent = '';
      const printCanvas = document.getElementById('cv-print-area');
      if (printCanvas) {
        htmlContent = generateStaticPrintHtml(printCanvas);
      }

      const payload = {
        templateType,
        fullName: fullName.trim(),
        position: position.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        link: link.trim() || undefined,
        address: address.trim() || undefined,
        careerObjective: visibleSections.objective ? careerObjective.trim() : undefined,
        education: visibleSections.education ? education.filter((e) => e.schoolName) : [],
        workExperience: visibleSections.experience
          ? workExperience.filter((w) => w.companyName)
          : [],
        skills: visibleSections.skills ? skills.filter((s) => s.name) : [],
        activities: visibleSections.activities
          ? activities.filter((a) => a.organizationName)
          : [],
        certificates: visibleSections.certificates
          ? certificates.filter((c) => c.name)
          : [],
        awards: visibleSections.awards ? awards.filter((a) => a.name) : [],
        sectionOrder,
        fontFamily: fontFamilyId,
        themeColor: themeColorId,
        fontSize,
        htmlContent,
      };

      if (isNew) {
        await onlineCvApi.create(payload, accessToken);
      } else {
        await onlineCvApi.update(id, payload, accessToken);
      }

      setIsDirty(false);

      // Redirect to /my-cv
      setTimeout(() => {
        navigate('/my-cv');
      }, 300);
    } catch (error: any) {
      alert(error.message || 'Không thể lưu CV. Vui lòng thử lại!');
    } finally {
      setIsSaving(false);
    }
  };


  return (
    <div className="flex h-screen flex-col bg-slate-200 dark:bg-slate-950 font-sans overflow-hidden">
      {/* 1. TOP BAR */}
      <header className="h-16 shrink-0 border-b border-slate-200/80 bg-white px-4 sm:px-6 flex items-center justify-between z-30 shadow-xs dark:border-slate-800 dark:bg-slate-900 print:hidden">
        {/* Left: Back & Title */}
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/my-cv"
            onClick={(e) => {
              if (isDirty && !window.confirm('Bạn có thay đổi chưa lưu. Bạn có chắc muốn rời đi?')) {
                e.preventDefault();
              }
            }}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition cursor-pointer shrink-0"
            title="Quay lại danh sách CV"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </Link>

          {/* Editable CV Title */}
          <div className="flex items-center gap-2 min-w-0">
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                markDirty();
              }}
              placeholder="Nhập tên CV..."
              className="font-bold text-sm sm:text-base text-slate-900 dark:text-white bg-transparent border-b border-transparent hover:border-slate-300 focus:border-primary focus:outline-none px-1 py-0.5 max-w-[200px] sm:max-w-[320px] truncate"
            />
            {isDirty && (
              <span className="flex h-2 w-2 rounded-full bg-amber-500 shrink-0" title="Có thay đổi chưa lưu" />
            )}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Dark / Light Mode Toggle Button */}
          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-100/80 text-slate-600 hover:bg-slate-200 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition cursor-pointer"
            title={theme === 'dark' ? 'Chuyển sang chế độ Sáng' : 'Chuyển sang chế độ Tối'}
            aria-label="Toggle Theme"
          >
            {theme === 'dark' ? (
              <Sun className="h-4.5 w-4.5 text-amber-400" />
            ) : (
              <Moon className="h-4.5 w-4.5 text-slate-600" />
            )}
          </button>

          {/* Manual Save Button */}
          <button
            type="button"
            onClick={handleSaveCV}
            disabled={isSaving}
            className="flex h-10 items-center gap-2 rounded-xl bg-primary px-4 sm:px-6 text-xs sm:text-sm font-extrabold text-white shadow-md shadow-primary/25 transition hover:bg-primary-dark active:scale-98 cursor-pointer disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            <span>{isSaving ? 'Đang lưu...' : 'Lưu CV'}</span>
          </button>
        </div>
      </header>

      {/* 2. MAIN WORKSPACE */}
      <div className="flex flex-1 overflow-hidden">
        {/* SIDEBAR TOOLBAR (Icons Column - 64px) */}
        <aside className="w-16 shrink-0 border-r border-slate-200/80 bg-white py-4 flex flex-col items-center justify-between dark:border-slate-800 dark:bg-slate-900 z-20 print:hidden">
          <div className="flex flex-col items-center gap-2">
            {/* Tool 1: Design & Font */}
            <button
              type="button"
              onClick={() =>
                setActiveSidebarTool((prev) => (prev === 'design' ? null : 'design'))
              }
              className={`flex h-11 w-11 flex-col items-center justify-center rounded-xl text-[10px] font-bold transition-all cursor-pointer ${
                activeSidebarTool === 'design'
                  ? 'bg-primary text-white shadow-md shadow-primary/25'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
              }`}
              title="Thiết kế & Font chữ"
            >
              <Type className="h-4.5 w-4.5" />
              <span className="mt-0.5 scale-90">Font</span>
            </button>

            {/* Tool 2: Add Sections */}
            <button
              type="button"
              onClick={() =>
                setActiveSidebarTool((prev) => (prev === 'sections' ? null : 'sections'))
              }
              className={`flex h-11 w-11 flex-col items-center justify-center rounded-xl text-[10px] font-bold transition-all cursor-pointer ${
                activeSidebarTool === 'sections'
                  ? 'bg-primary text-white shadow-md shadow-primary/25'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
              }`}
              title="Thêm mục"
            >
              <Plus className="h-4.5 w-4.5" />
              <span className="mt-0.5 scale-90">Mục</span>
            </button>

            {/* Tool 3: Templates */}
            <button
              type="button"
              onClick={() =>
                setActiveSidebarTool((prev) => (prev === 'templates' ? null : 'templates'))
              }
              className={`flex h-11 w-11 flex-col items-center justify-center rounded-xl text-[10px] font-bold transition-all cursor-pointer ${
                activeSidebarTool === 'templates'
                  ? 'bg-primary text-white shadow-md shadow-primary/25'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
              }`}
              title="Đổi mẫu CV"
            >
              <LayoutGrid className="h-4.5 w-4.5" />
              <span className="mt-0.5 scale-90">Mẫu</span>
            </button>

            {/* Tool 4: Language (Việt / Anh) */}
            <button
              type="button"
              onClick={() =>
                setActiveSidebarTool((prev) => (prev === 'language' ? null : 'language'))
              }
              className={`flex h-11 w-11 flex-col items-center justify-center rounded-xl text-[10px] font-bold transition-all cursor-pointer ${
                activeSidebarTool === 'language'
                  ? 'bg-primary text-white shadow-md shadow-primary/25'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
              }`}
              title="Ngôn ngữ CV (Việt / Anh)"
            >
              <Globe className="h-4.5 w-4.5" />
              <span className="mt-0.5 scale-90">Ngôn ngữ</span>
            </button>

            {/* Tool 5: AI Career Assistant (Premium) */}
            <button
              type="button"
              onClick={() => setShowAiModal(true)}
              className="flex h-11 w-11 flex-col items-center justify-center rounded-xl text-[10px] font-bold text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-all cursor-pointer relative"
              title="AI Hỗ trợ viết CV (Gói Premium)"
            >
              <Sparkles className="h-4.5 w-4.5 text-amber-500" />
              <span className="mt-0.5 scale-90 text-amber-600 dark:text-amber-400">AI</span>
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] text-white font-bold">
                <Crown className="h-2.5 w-2.5" />
              </span>
            </button>

            {/* Tool 6: Library */}
            <button
              type="button"
              onClick={() =>
                setActiveSidebarTool((prev) => (prev === 'library' ? null : 'library'))
              }
              className={`flex h-11 w-11 flex-col items-center justify-center rounded-xl text-[10px] font-bold transition-all cursor-pointer ${
                activeSidebarTool === 'library'
                  ? 'bg-primary text-white shadow-md shadow-primary/25'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
              }`}
              title="Thư viện CV của bạn"
            >
              <Layers className="h-4.5 w-4.5" />
              <span className="mt-0.5 scale-90">CV</span>
            </button>
          </div>
        </aside>

        {/* TOOL CONFIG FLYOUT PANEL (300px - Expandable) */}
        <AnimatePresence>
          {activeSidebarTool && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 300, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="w-[300px] shrink-0 border-r border-slate-200/80 bg-white p-5 overflow-y-auto dark:border-slate-800 dark:bg-slate-900 z-10 print:hidden shadow-lg"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                  {activeSidebarTool === 'design' && 'Thiết kế & Font chữ'}
                  {activeSidebarTool === 'sections' && 'Bật / Tắt mục CV'}
                  {activeSidebarTool === 'templates' && 'Đổi mẫu giao diện'}
                  {activeSidebarTool === 'language' && 'Ngôn ngữ CV'}
                  {activeSidebarTool === 'library' && 'Thư viện CV của bạn'}
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveSidebarTool(null)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* TOOL 1: Design & Font */}
              {activeSidebarTool === 'design' && (
                <div className="space-y-5 text-xs">
                  {/* Font Selection */}
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-2">
                      Font chữ toàn trang ({CV_FONTS.length} loại)
                    </label>
                    <div className="space-y-1.5">
                      {CV_FONTS.map((font) => (
                        <button
                          key={font.id}
                          type="button"
                          onClick={() => {
                            setFontFamilyId(font.id);
                            markDirty();
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left font-medium transition cursor-pointer ${
                            fontFamilyId === font.id
                              ? 'bg-primary/10 text-primary border border-primary/30 font-bold dark:bg-primary/20'
                              : 'bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-slate-800/60 dark:text-slate-300'
                          }`}
                        >
                          <span style={{ fontFamily: font.family }}>{font.name}</span>
                          {fontFamilyId === font.id && <CheckCircle2 className="h-4 w-4 text-primary" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Theme Colors */}
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-2">
                      Màu sắc chủ đạo
                    </label>
                    <div className="grid grid-cols-5 gap-2">
                      {CV_THEMES.map((theme) => (
                        <button
                          key={theme.id}
                          type="button"
                          onClick={() => {
                            setThemeColorId(theme.id);
                            markDirty();
                          }}
                          className={`h-9 w-full rounded-xl transition-all flex items-center justify-center cursor-pointer ${
                            themeColorId === theme.id
                              ? 'ring-2 ring-primary ring-offset-2 scale-105 shadow-md'
                              : 'hover:scale-105 opacity-85 hover:opacity-100'
                          }`}
                          style={{ backgroundColor: theme.color }}
                          title={theme.name}
                        >
                          {themeColorId === theme.id && <CheckCircle2 className="h-4 w-4 text-white" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Font Size Slider */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="font-bold text-slate-700 dark:text-slate-300">Cỡ chữ cơ sở</label>
                      <span className="text-slate-500 font-semibold capitalize">
                        {fontSize === 'small' ? 'Nhỏ (~13px)' : fontSize === 'medium' ? 'Vừa (~14px)' : 'Lớn (~16px)'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                      {(['small', 'medium', 'large'] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => {
                            setFontSize(s);
                            markDirty();
                          }}
                          className={`py-1.5 rounded-lg text-center font-bold text-xs transition cursor-pointer ${
                            fontSize === s
                              ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          {s === 'small' ? 'Nhỏ' : s === 'medium' ? 'Vừa' : 'Lớn'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Line Spacing */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="font-bold text-slate-700 dark:text-slate-300">Khoảng cách dòng</label>
                      <span className="text-slate-500 font-semibold">{lineSpacing}</span>
                    </div>
                    <input
                      type="range"
                      min="1.0"
                      max="1.8"
                      step="0.1"
                      value={lineSpacing}
                      onChange={(e) => {
                        setLineSpacing(parseFloat(e.target.value));
                        markDirty();
                      }}
                      className="w-full accent-primary cursor-pointer"
                    />
                  </div>
                </div>
              )}

              {/* TOOL 2: Add / Remove & Reorder Sections */}
              {activeSidebarTool === 'sections' && (
                <div className="space-y-2 text-xs">
                  <p className="text-slate-500 text-[11px] mb-2">
                    Bật tắt & sắp xếp thứ tự hiển thị các khối thông tin trên CV:
                  </p>

                  {sectionOrder.map((secId, idx) => {
                    const labelMap: Record<string, string> = {
                      objective: 'Mục tiêu nghề nghiệp',
                      education: 'Học vấn',
                      experience: 'Kinh nghiệm làm việc',
                      skills: 'Kỹ năng chuyên môn',
                      activities: 'Hoạt động & Dự án',
                      certificates: 'Chứng chỉ',
                      awards: 'Giải thưởng & Danh hiệu',
                    };
                    const label = labelMap[secId] || secId;
                    return (
                      <div
                        key={secId}
                        className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {/* Reorder Up/Down */}
                          <div className="flex flex-col gap-0.5 shrink-0">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => moveSection(secId, 'up')}
                              className="p-0.5 rounded text-slate-400 hover:text-primary disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                              title="Di chuyển lên"
                            >
                              <MoveUp className="h-2.5 w-2.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === sectionOrder.length - 1}
                              onClick={() => moveSection(secId, 'down')}
                              className="p-0.5 rounded text-slate-400 hover:text-primary disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                              title="Di chuyển xuống"
                            >
                              <MoveDown className="h-2.5 w-2.5" />
                            </button>
                          </div>
                          <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                            {label}
                          </span>
                        </div>

                        <input
                          type="checkbox"
                          checked={visibleSections[secId as keyof typeof visibleSections]}
                          onChange={(e) => {
                            setVisibleSections((prev) => ({
                              ...prev,
                              [secId]: e.target.checked,
                            }));
                            markDirty();
                          }}
                          className="h-4 w-4 rounded-md text-primary focus:ring-primary accent-primary cursor-pointer shrink-0 ml-2"
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* TOOL 3: Switch Template */}
              {activeSidebarTool === 'templates' && (
                <div className="space-y-4 text-xs">
                  <div
                    onClick={() => {
                      setTemplateType('template1');
                      markDirty();
                    }}
                    className={`p-3 rounded-2xl border-2 transition cursor-pointer ${
                      templateType === 'template1'
                        ? 'border-primary bg-primary/5 dark:bg-primary/10'
                        : 'border-slate-200 hover:border-slate-300 dark:border-slate-800'
                    }`}
                  >
                    <p className="font-extrabold text-slate-900 dark:text-white">
                      Mẫu 1: Tiêu chuẩn ATS (Classic)
                    </p>
                    <p className="text-slate-500 mt-1 text-[11px]">
                      Bố cục 1 cột truyền thống, dễ đọc và tối ưu điểm quét ATS.
                    </p>
                  </div>

                  <div
                    onClick={() => {
                      setTemplateType('template2');
                      markDirty();
                    }}
                    className={`p-3 rounded-2xl border-2 transition cursor-pointer ${
                      templateType === 'template2'
                        ? 'border-primary bg-primary/5 dark:bg-primary/10'
                        : 'border-slate-200 hover:border-slate-300 dark:border-slate-800'
                    }`}
                  >
                    <p className="font-extrabold text-slate-900 dark:text-white">
                      Mẫu 2: Hiện đại 2 Cột (Modern Timeline)
                    </p>
                    <p className="text-slate-500 mt-1 text-[11px]">
                      Bố cục 2 cột năng động với dòng thời gian trực quan.
                    </p>
                  </div>
                </div>
              )}

              {/* TOOL 4: Language (Việt / Anh) */}
              {activeSidebarTool === 'language' && (
                <div className="space-y-4 text-xs">
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Ngôn ngữ hiển thị tiêu đề CV
                    </label>
                    <p className="text-[11.5px] text-slate-500 mb-3 leading-relaxed">
                      Chuyển đổi các tiêu đề mục lớn (Mục tiêu, Học vấn, Kinh nghiệm, Kỹ năng,...) giữa Tiếng Việt và Tiếng Anh.
                    </p>
                  </div>

                  <div className="space-y-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setCvLanguage('vi');
                        markDirty();
                      }}
                      className={`w-full flex items-center justify-between p-3.5 rounded-2xl border-2 transition cursor-pointer ${
                        cvLanguage === 'vi'
                          ? 'border-primary bg-primary/5 dark:bg-primary/10 text-slate-900 dark:text-white font-bold shadow-xs'
                          : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl">🇻🇳</span>
                        <div className="text-left">
                          <p className="font-bold text-xs text-slate-900 dark:text-white">Tiếng Việt</p>
                          <p className="text-[10.5px] text-slate-400">Mục tiêu, Học vấn, Kinh nghiệm, Kỹ năng...</p>
                        </div>
                      </div>
                      {cvLanguage === 'vi' && <CheckCircle2 className="h-4 w-4 text-primary" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setCvLanguage('en');
                        markDirty();
                      }}
                      className={`w-full flex items-center justify-between p-3.5 rounded-2xl border-2 transition cursor-pointer ${
                        cvLanguage === 'en'
                          ? 'border-primary bg-primary/5 dark:bg-primary/10 text-slate-900 dark:text-white font-bold shadow-xs'
                          : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl">🇬🇧</span>
                        <div className="text-left">
                          <p className="font-bold text-xs text-slate-900 dark:text-white">English (Tiếng Anh)</p>
                          <p className="text-[10.5px] text-slate-400">Objective, Education, Experience, Skills...</p>
                        </div>
                      </div>
                      {cvLanguage === 'en' && <CheckCircle2 className="h-4 w-4 text-primary" />}
                    </button>
                  </div>
                </div>
              )}

              {/* TOOL 5: Existing CVs */}
              {activeSidebarTool === 'library' && (
                <div className="space-y-3 text-xs">
                  <p className="text-slate-500 text-[11px]">Các CV bạn đã lưu:</p>
                  {existingCvs.length === 0 ? (
                    <p className="italic text-slate-400">Chưa có CV nào khác.</p>
                  ) : (
                    existingCvs.map((cv) => (
                      <button
                        key={cv._id}
                        type="button"
                        onClick={() => {
                          if (isDirty && !window.confirm('Rời khỏi CV hiện tại mà không lưu?')) return;
                          navigate(`/cv-editor/${cv._id}`);
                        }}
                        className={`w-full p-2.5 text-left rounded-xl border transition cursor-pointer ${
                          cv._id === id
                            ? 'border-primary bg-primary/10 text-primary font-bold'
                            : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <p className="font-bold truncate">{cv.fullName || 'CV không tên'}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {cv.templateType === 'template1' ? 'Mẫu 1' : 'Mẫu 2'} &bull;{' '}
                          {new Date(cv.createdAt).toLocaleDateString('vi-VN')}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* 3. CENTER WYSIWYG A4 CANVAS (Interactive In-Place Editing) */}
        <div className="flex-1 overflow-auto flex flex-col items-center py-6 px-4 sm:px-8 relative select-none">
          {/* Zoom & Canvas Floating Controls */}
          <div className="sticky top-2 z-20 mb-6 flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/90 px-4 py-1.5 shadow-lg shadow-slate-900/10 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90 print:hidden select-none">
            <button
              type="button"
              onClick={() => setZoomScale((s) => Math.max(0.4, s - 0.1))}
              className="flex h-7 w-7 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
              title="Thu nhỏ"
            >
              <ZoomOut className="h-4 w-4" />
            </button>

            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 w-12 text-center">
              {Math.round(zoomScale * 100)}%
            </span>

            <button
              type="button"
              onClick={() => setZoomScale((s) => Math.min(1.4, s + 0.1))}
              className="flex h-7 w-7 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
              title="Phóng to"
            >
              <ZoomIn className="h-4 w-4" />
            </button>

            <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-700 mx-1.5" />

            <button
              type="button"
              onClick={() => setZoomScale(0.9)}
              className="px-2.5 py-0.5 rounded-md text-[11px] font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
            >
              Chuẩn A4
            </button>

            <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-700 mx-1.5" />

            <span className="text-[11px] text-slate-400 italic hidden sm:inline">
              💡 Rê chuột vào từng ô để định dạng cỡ chữ, màu sắc, font, in đậm/nghiêng
            </span>
          </div>

          {/* ================= IN-PLACE A4 PAPER CANVAS ================= */}
          <div
            id="cv-print-area"
            className="relative bg-white shadow-2xl transition-transform select-text overflow-visible rounded-md print:shadow-none print:rounded-none print:m-0"
            style={{
              transform: zoomScale !== 1 ? `scale(${zoomScale})` : undefined,
              transformOrigin: 'top center',
              width: '210mm',
              minHeight: '297mm',
              fontFamily: currentFont.family,
              lineHeight: lineSpacing,
              color: '#1E293B',
            }}
          >
            {/* ================= TEMPLATE 1: CLASSIC SINGLE-COLUMN ATS ================= */}
            {templateType === 'template1' && (
              <div className="p-10 sm:p-12 flex flex-col justify-between min-h-[297mm]">
                <div>
                  {/* Header: Name, Position, Contacts */}
                  <div
                    className="text-center pb-5 mb-6 border-b-2"
                    style={{ borderColor: currentTheme.color }}
                  >
                    {/* Full Name */}
                    <div className="mb-1 flex justify-center">
                      <InlineText
                        value={fullName}
                        onChange={(v) => {
                          setFullName(v);
                          markDirty();
                        }}
                        placeholder="HỌ VÀ TÊN"
                        asTitle={true}
                        className="font-extrabold text-center tracking-wide max-w-full"
                        style={{
                          color: currentTheme.color,
                          fontSize: `${1.8 * fontMultiplier}rem`,
                        }}
                        defaultFontSizePx={resolveFontSizePx(1.8 * fontMultiplier * 16)}
                        defaultFontFamily={currentFont.family}
                        defaultColor={currentTheme.color}
                      />
                    </div>

                    {/* Position */}
                    <div className="mb-3 flex justify-center">
                      <InlineText
                        value={position}
                        onChange={(v) => {
                          setPosition(v);
                          markDirty();
                        }}
                        placeholder="Vị trí ứng tuyển"
                        className="font-medium text-slate-600 text-center tracking-wide italic max-w-full"
                        style={{ fontSize: `${1.05 * fontMultiplier}rem` }}
                        defaultFontSizePx={resolveFontSizePx(1.05 * fontMultiplier * 16)}
                        defaultFontFamily={currentFont.family}
                        defaultColor="#475569"
                      />
                    </div>

                    {/* Contact Info Items - Always Single Line */}
                    <div
                      className="flex flex-nowrap items-center justify-center gap-x-2 sm:gap-x-3.5 text-slate-600 max-w-full"
                      style={{ fontSize: `${0.85 * fontMultiplier}rem` }}
                    >
                      <div className="inline-flex items-center gap-1 shrink-0">
                        <Phone className="h-3.5 w-3.5 shrink-0" style={{ color: currentTheme.color }} />
                        <InlineText
                          value={phone}
                          onChange={(v) => {
                            setPhone(v);
                            markDirty();
                          }}
                          placeholder="0123 456 789"
                          className="w-24 text-center"
                          defaultFontSizePx={resolveFontSizePx(0.85 * fontMultiplier * 16)}
                          defaultFontFamily={currentFont.family}
                        />
                      </div>

                      <span className="text-slate-300 select-none">&bull;</span>

                      <div className="inline-flex items-center gap-1 shrink-0">
                        <Mail className="h-3.5 w-3.5 shrink-0" style={{ color: currentTheme.color }} />
                        <InlineText
                          value={email}
                          onChange={(v) => {
                            setEmail(v);
                            markDirty();
                          }}
                          placeholder="email@example.com"
                          className="w-40 text-center"
                          defaultFontSizePx={resolveFontSizePx(0.85 * fontMultiplier * 16)}
                          defaultFontFamily={currentFont.family}
                        />
                      </div>

                      <span className="text-slate-300 select-none">&bull;</span>

                      <div className="inline-flex items-center gap-1 shrink-0">
                        <Globe className="h-3.5 w-3.5 shrink-0" style={{ color: currentTheme.color }} />
                        <InlineText
                          value={link}
                          onChange={(v) => {
                            setLink(v);
                            markDirty();
                          }}
                          placeholder="linkedin.com/in/username"
                          className="w-36 text-center"
                          defaultFontSizePx={resolveFontSizePx(0.85 * fontMultiplier * 16)}
                          defaultFontFamily={currentFont.family}
                        />
                      </div>

                      <span className="text-slate-300 select-none">&bull;</span>

                      <div className="inline-flex items-center gap-1 shrink-0">
                        <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: currentTheme.color }} />
                        <InlineText
                          value={address}
                          onChange={(v) => {
                            setAddress(v);
                            markDirty();
                          }}
                          placeholder="Hà Nội, Việt Nam"
                          className="w-32 text-center"
                          defaultFontSizePx={resolveFontSizePx(0.85 * fontMultiplier * 16)}
                          defaultFontFamily={currentFont.family}
                        />
                      </div>
                    </div>
                  </div>

                  {/* DYNAMIC SECTIONS ORDER (Controlled via sectionOrder state) */}
                  {sectionOrder.map((sectionKey, secIdx) => {
                    // 1. MỤC TIÊU NGHỀ NGHIỆP
                    if (sectionKey === 'objective' && visibleSections.objective) {
                      return (
                        <div key="objective" className="mb-5 group/sec relative">
                          <div className="flex items-center justify-between pb-1 mb-2 border-b border-slate-200">
                            <h2
                              className="font-bold uppercase tracking-wider"
                              style={{
                                color: currentTheme.color,
                                fontSize: `${0.95 * fontMultiplier}rem`,
                              }}
                            >
                              {SECTION_LABELS[cvLanguage].objective}
                            </h2>
                            <div className="flex items-center gap-1 opacity-0 group-hover/sec:opacity-100 transition-opacity print:hidden">
                              {secIdx > 0 && (
                                <button
                                  type="button"
                                  onClick={() => moveSection('objective', 'up')}
                                  className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                                  title="Đưa mục này lên trên"
                                >
                                  <MoveUp className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {secIdx < sectionOrder.length - 1 && (
                                <button
                                  type="button"
                                  onClick={() => moveSection('objective', 'down')}
                                  className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                                  title="Đưa mục này xuống dưới"
                                >
                                  <MoveDown className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                          <InlineText
                            multiline={true}
                            rows={2}
                            value={careerObjective}
                            onChange={(v) => {
                              setCareerObjective(v);
                              markDirty();
                            }}
                            placeholder="Mục tiêu nghề nghiệp của bạn, bao gồm mục tiêu ngắn hạn và dài hạn..."
                            className="text-slate-700 leading-relaxed text-justify"
                            style={{ fontSize: `${0.875 * fontMultiplier}rem` }}
                            defaultFontSizePx={resolveFontSizePx(0.875 * fontMultiplier * 16)}
                            defaultFontFamily={currentFont.family}
                          />
                        </div>
                      );
                    }

                    // 2. HỌC VẤN
                    if (sectionKey === 'education' && visibleSections.education) {
                      return (
                        <div key="education" className="mb-5 group/sec relative">
                          <div className="flex items-center justify-between pb-1 mb-2.5 border-b border-slate-200">
                            <h2
                              className="font-bold uppercase tracking-wider"
                              style={{
                                color: currentTheme.color,
                                fontSize: `${0.95 * fontMultiplier}rem`,
                              }}
                            >
                              {SECTION_LABELS[cvLanguage].education}
                            </h2>
                            <div className="flex items-center gap-1 print:hidden">
                              <div className="flex items-center gap-1 opacity-0 group-hover/sec:opacity-100 transition-opacity">
                                {secIdx > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => moveSection('education', 'up')}
                                    className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                                    title="Đưa mục này lên trên"
                                  >
                                    <MoveUp className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                {secIdx < sectionOrder.length - 1 && (
                                  <button
                                    type="button"
                                    onClick={() => moveSection('education', 'down')}
                                    className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                                    title="Đưa mục này xuống dưới"
                                  >
                                    <MoveDown className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setEducation((prev) => [
                                    ...prev,
                                    { schoolName: '', major: '', startDate: '', endDate: '', description: '' },
                                  ]);
                                  markDirty();
                                }}
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline cursor-pointer opacity-70 hover:opacity-100 ml-1"
                              >
                                <Plus className="h-3 w-3" />
                                <span>Thêm</span>
                              </button>
                            </div>
                          </div>

                          <div className="space-y-3">
                            {education.map((edu, idx) => (
                              <div
                                key={idx}
                                className="group relative p-2 rounded-lg hover:bg-slate-50/80 transition-all border border-transparent hover:border-slate-200 pr-14"
                              >
                                {/* Floating Action Buttons */}
                                <div className="absolute right-2 top-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 bg-white border border-slate-200 shadow-sm rounded-lg p-0.5 print:hidden">
                                  {idx > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEducation((prev) => {
                                          const arr = [...prev];
                                          const temp = arr[idx];
                                          arr[idx] = arr[idx - 1];
                                          arr[idx - 1] = temp;
                                          return arr;
                                        });
                                        markDirty();
                                      }}
                                      className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                                      title="Di chuyển lên"
                                    >
                                      <MoveUp className="h-3 w-3" />
                                    </button>
                                  )}
                                  {idx < education.length - 1 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEducation((prev) => {
                                          const arr = [...prev];
                                          const temp = arr[idx];
                                          arr[idx] = arr[idx + 1];
                                          arr[idx + 1] = temp;
                                          return arr;
                                        });
                                        markDirty();
                                      }}
                                      className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                                      title="Di chuyển xuống"
                                    >
                                      <MoveDown className="h-3 w-3" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEducation((prev) => prev.filter((_, i) => i !== idx));
                                      markDirty();
                                    }}
                                    className="p-1 hover:bg-red-50 rounded text-red-500 cursor-pointer"
                                    title="Xóa mục này"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>

                                <div className="flex items-baseline justify-between gap-4">
                                  <div className="flex-1 min-w-0">
                                    <InlineText
                                      value={edu.schoolName || ''}
                                      onChange={(v) => {
                                        setEducation((prev) =>
                                          prev.map((item, i) => (i === idx ? { ...item, schoolName: v } : item)),
                                        );
                                        markDirty();
                                      }}
                                      placeholder="Tên trường học"
                                      className="font-bold text-slate-900"
                                      style={{ fontSize: `${0.9 * fontMultiplier}rem` }}
                                      defaultFontSizePx={resolveFontSizePx(0.9 * fontMultiplier * 16)}
                                      defaultFontFamily={currentFont.family}
                                    />
                                  </div>

                                  <div className="flex items-center gap-1 text-slate-500 text-xs italic shrink-0">
                                    <InlineText
                                      value={edu.startDate || ''}
                                      onChange={(v) => {
                                        setEducation((prev) =>
                                          prev.map((item, i) => (i === idx ? { ...item, startDate: v } : item)),
                                        );
                                        markDirty();
                                      }}
                                      placeholder="Bắt đầu"
                                      className="w-16 text-right"
                                      defaultFontSizePx={resolveFontSizePx(0.8 * fontMultiplier * 16)}
                                      defaultFontFamily={currentFont.family}
                                    />
                                    <span>-</span>
                                    <InlineText
                                      value={edu.endDate || ''}
                                      onChange={(v) => {
                                        setEducation((prev) =>
                                          prev.map((item, i) => (i === idx ? { ...item, endDate: v } : item)),
                                        );
                                        markDirty();
                                      }}
                                      placeholder="Kết thúc"
                                      className="w-16"
                                      defaultFontSizePx={resolveFontSizePx(0.8 * fontMultiplier * 16)}
                                      defaultFontFamily={currentFont.family}
                                    />
                                  </div>
                                </div>

                                <InlineText
                                  value={edu.major || ''}
                                  onChange={(v) => {
                                    setEducation((prev) =>
                                      prev.map((item, i) => (i === idx ? { ...item, major: v } : item)),
                                    );
                                    markDirty();
                                  }}
                                  placeholder="Ngành học / Môn học"
                                  className="font-medium text-slate-700 italic block mt-0.5"
                                  style={{ fontSize: `${0.85 * fontMultiplier}rem` }}
                                  defaultFontSizePx={resolveFontSizePx(0.85 * fontMultiplier * 16)}
                                  defaultFontFamily={currentFont.family}
                                />

                                <InlineText
                                  multiline={true}
                                  rows={1}
                                  value={edu.description || ''}
                                  onChange={(v) => {
                                    setEducation((prev) =>
                                      prev.map((item, i) => (i === idx ? { ...item, description: v } : item)),
                                    );
                                    markDirty();
                                  }}
                                  placeholder="Mô tả quá trình học tập hoặc thành tích của bạn"
                                  className="text-slate-600 mt-1 block"
                                  style={{ fontSize: `${0.825 * fontMultiplier}rem` }}
                                  defaultFontSizePx={resolveFontSizePx(0.825 * fontMultiplier * 16)}
                                  defaultFontFamily={currentFont.family}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }

                    // 3. KINH NGHIỆM LÀM VIỆC
                    if (sectionKey === 'experience' && visibleSections.experience) {
                      return (
                        <div key="experience" className="mb-5 group/sec relative">
                          <div className="flex items-center justify-between pb-1 mb-2.5 border-b border-slate-200">
                            <h2
                              className="font-bold uppercase tracking-wider"
                              style={{
                                color: currentTheme.color,
                                fontSize: `${0.95 * fontMultiplier}rem`,
                              }}
                            >
                              {SECTION_LABELS[cvLanguage].experience}
                            </h2>
                            <div className="flex items-center gap-1 print:hidden">
                              <div className="flex items-center gap-1 opacity-0 group-hover/sec:opacity-100 transition-opacity">
                                {secIdx > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => moveSection('experience', 'up')}
                                    className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                                    title="Đưa mục này lên trên"
                                  >
                                    <MoveUp className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                {secIdx < sectionOrder.length - 1 && (
                                  <button
                                    type="button"
                                    onClick={() => moveSection('experience', 'down')}
                                    className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                                    title="Đưa mục này xuống dưới"
                                  >
                                    <MoveDown className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setWorkExperience((prev) => [
                                    ...prev,
                                    { companyName: '', position: '', startDate: '', endDate: '', description: '' },
                                  ]);
                                  markDirty();
                                }}
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline cursor-pointer opacity-70 hover:opacity-100 ml-1"
                              >
                                <Plus className="h-3 w-3" />
                                <span>Thêm</span>
                              </button>
                            </div>
                          </div>

                          <div className="space-y-3.5">
                            {workExperience.map((exp, idx) => (
                              <div
                                key={idx}
                                className="group relative p-2 rounded-lg hover:bg-slate-50/80 transition-all border border-transparent hover:border-slate-200 pr-14"
                              >
                                {/* Floating Action Buttons */}
                                <div className="absolute right-2 top-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 bg-white border border-slate-200 shadow-sm rounded-lg p-0.5 print:hidden">
                                  {idx > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setWorkExperience((prev) => {
                                          const arr = [...prev];
                                          const temp = arr[idx];
                                          arr[idx] = arr[idx - 1];
                                          arr[idx - 1] = temp;
                                          return arr;
                                        });
                                        markDirty();
                                      }}
                                      className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                                      title="Di chuyển lên"
                                    >
                                      <MoveUp className="h-3 w-3" />
                                    </button>
                                  )}
                                  {idx < workExperience.length - 1 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setWorkExperience((prev) => {
                                          const arr = [...prev];
                                          const temp = arr[idx];
                                          arr[idx] = arr[idx + 1];
                                          arr[idx + 1] = temp;
                                          return arr;
                                        });
                                        markDirty();
                                      }}
                                      className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                                      title="Di chuyển xuống"
                                    >
                                      <MoveDown className="h-3 w-3" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setWorkExperience((prev) => prev.filter((_, i) => i !== idx));
                                      markDirty();
                                    }}
                                    className="p-1 hover:bg-red-50 rounded text-red-500 cursor-pointer"
                                    title="Xóa mục này"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>

                                <div className="flex items-baseline justify-between gap-4">
                                  <div className="flex-1 min-w-0">
                                    <InlineText
                                      value={exp.companyName || ''}
                                      onChange={(v) => {
                                        setWorkExperience((prev) =>
                                          prev.map((item, i) => (i === idx ? { ...item, companyName: v } : item)),
                                        );
                                        markDirty();
                                      }}
                                      placeholder="Tên công ty"
                                      className="font-bold text-slate-900"
                                      style={{ fontSize: `${0.9 * fontMultiplier}rem` }}
                                      defaultFontSizePx={resolveFontSizePx(0.9 * fontMultiplier * 16)}
                                      defaultFontFamily={currentFont.family}
                                    />
                                  </div>

                                  <div className="flex items-center gap-1 text-slate-500 text-xs italic shrink-0">
                                    <InlineText
                                      value={exp.startDate || ''}
                                      onChange={(v) => {
                                        setWorkExperience((prev) =>
                                          prev.map((item, i) => (i === idx ? { ...item, startDate: v } : item)),
                                        );
                                        markDirty();
                                      }}
                                      placeholder="Bắt đầu"
                                      className="w-16 text-right"
                                      defaultFontSizePx={resolveFontSizePx(0.8 * fontMultiplier * 16)}
                                      defaultFontFamily={currentFont.family}
                                    />
                                    <span>-</span>
                                    <InlineText
                                      value={exp.endDate || ''}
                                      onChange={(v) => {
                                        setWorkExperience((prev) =>
                                          prev.map((item, i) => (i === idx ? { ...item, endDate: v } : item)),
                                        );
                                        markDirty();
                                      }}
                                      placeholder="Kết thúc"
                                      className="w-16"
                                      defaultFontSizePx={resolveFontSizePx(0.8 * fontMultiplier * 16)}
                                      defaultFontFamily={currentFont.family}
                                    />
                                  </div>
                                </div>

                                <InlineText
                                  value={exp.position || ''}
                                  onChange={(v) => {
                                    setWorkExperience((prev) =>
                                      prev.map((item, i) => (i === idx ? { ...item, position: v } : item)),
                                    );
                                    markDirty();
                                  }}
                                  placeholder="Vị trí công việc"
                                  className="font-semibold text-slate-700 italic block mt-0.5"
                                  style={{
                                    color: currentTheme.color,
                                    fontSize: `${0.85 * fontMultiplier}rem`,
                                  }}
                                  defaultFontSizePx={resolveFontSizePx(0.85 * fontMultiplier * 16)}
                                  defaultFontFamily={currentFont.family}
                                  defaultColor={currentTheme.color}
                                />

                                <InlineText
                                  multiline={true}
                                  rows={2}
                                  value={exp.description || ''}
                                  onChange={(v) => {
                                    setWorkExperience((prev) =>
                                      prev.map((item, i) => (i === idx ? { ...item, description: v } : item)),
                                    );
                                    markDirty();
                                  }}
                                  placeholder="Mô tả kinh nghiệm làm việc của bạn..."
                                  className="text-slate-600 mt-1 block leading-relaxed text-justify"
                                  style={{ fontSize: `${0.825 * fontMultiplier}rem` }}
                                  defaultFontSizePx={resolveFontSizePx(0.825 * fontMultiplier * 16)}
                                  defaultFontFamily={currentFont.family}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }

                    // 4. KỸ NĂNG
                    if (sectionKey === 'skills' && visibleSections.skills) {
                      return (
                        <div key="skills" className="mb-5 group/sec relative">
                          <div className="flex items-center justify-between pb-1 mb-2.5 border-b border-slate-200">
                            <h2
                              className="font-bold uppercase tracking-wider"
                              style={{
                                color: currentTheme.color,
                                fontSize: `${0.95 * fontMultiplier}rem`,
                              }}
                            >
                              {SECTION_LABELS[cvLanguage].skills}
                            </h2>
                            <div className="flex items-center gap-1 print:hidden">
                              <div className="flex items-center gap-1 opacity-0 group-hover/sec:opacity-100 transition-opacity">
                                {secIdx > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => moveSection('skills', 'up')}
                                    className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                                    title="Đưa mục này lên trên"
                                  >
                                    <MoveUp className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                {secIdx < sectionOrder.length - 1 && (
                                  <button
                                    type="button"
                                    onClick={() => moveSection('skills', 'down')}
                                    className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                                    title="Đưa mục này xuống dưới"
                                  >
                                    <MoveDown className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setSkills((prev) => [...prev, { name: '', description: '' }]);
                                  markDirty();
                                }}
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline cursor-pointer opacity-70 hover:opacity-100 ml-1"
                              >
                                <Plus className="h-3 w-3" />
                                <span>Thêm</span>
                              </button>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            {skills.map((skill, idx) => (
                              <div
                                key={idx}
                                className="group relative flex items-center gap-3 p-1.5 rounded-lg hover:bg-slate-50/80 border border-transparent hover:border-slate-200 transition-all pr-14"
                              >
                                <div className="w-40 shrink-0">
                                  <InlineText
                                    value={skill.name || ''}
                                    onChange={(v) => {
                                      setSkills((prev) =>
                                        prev.map((item, i) => (i === idx ? { ...item, name: v } : item)),
                                      );
                                      markDirty();
                                    }}
                                    placeholder="Tên kỹ năng"
                                    className="font-bold text-slate-900"
                                    style={{ fontSize: `${0.85 * fontMultiplier}rem` }}
                                    defaultFontSizePx={resolveFontSizePx(0.85 * fontMultiplier * 16)}
                                    defaultFontFamily={currentFont.family}
                                  />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <InlineText
                                    value={skill.description || ''}
                                    onChange={(v) => {
                                      setSkills((prev) =>
                                        prev.map((item, i) => (i === idx ? { ...item, description: v } : item)),
                                      );
                                      markDirty();
                                    }}
                                    placeholder="Mô tả kỹ năng"
                                    className="text-slate-600"
                                    style={{ fontSize: `${0.85 * fontMultiplier}rem` }}
                                    defaultFontSizePx={resolveFontSizePx(0.85 * fontMultiplier * 16)}
                                    defaultFontFamily={currentFont.family}
                                  />
                                </div>

                                {/* Floating Action Buttons */}
                                <div className="absolute right-1.5 top-1/2 -translate-y-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 bg-white border border-slate-200 shadow-sm rounded-lg p-0.5 print:hidden">
                                  {idx > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSkills((prev) => {
                                          const arr = [...prev];
                                          const temp = arr[idx];
                                          arr[idx] = arr[idx - 1];
                                          arr[idx - 1] = temp;
                                          return arr;
                                        });
                                        markDirty();
                                      }}
                                      className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                                      title="Di chuyển lên"
                                    >
                                      <MoveUp className="h-3 w-3" />
                                    </button>
                                  )}
                                  {idx < skills.length - 1 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSkills((prev) => {
                                          const arr = [...prev];
                                          const temp = arr[idx];
                                          arr[idx] = arr[idx + 1];
                                          arr[idx + 1] = temp;
                                          return arr;
                                        });
                                        markDirty();
                                      }}
                                      className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                                      title="Di chuyển xuống"
                                    >
                                      <MoveDown className="h-3 w-3" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSkills((prev) => prev.filter((_, i) => i !== idx));
                                      markDirty();
                                    }}
                                    className="p-1 hover:bg-red-50 rounded text-red-500 cursor-pointer"
                                    title="Xóa kỹ năng"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }

                    // 5. HOẠT ĐỘNG
                    if (sectionKey === 'activities' && visibleSections.activities) {
                      return (
                        <div key="activities" className="mb-5 group/sec relative">
                          <div className="flex items-center justify-between pb-1 mb-2.5 border-b border-slate-200">
                            <h2
                              className="font-bold uppercase tracking-wider"
                              style={{
                                color: currentTheme.color,
                                fontSize: `${0.95 * fontMultiplier}rem`,
                              }}
                            >
                              {SECTION_LABELS[cvLanguage].activities}
                            </h2>
                            <div className="flex items-center gap-1 print:hidden">
                              <div className="flex items-center gap-1 opacity-0 group-hover/sec:opacity-100 transition-opacity">
                                {secIdx > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => moveSection('activities', 'up')}
                                    className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                                    title="Đưa mục này lên trên"
                                  >
                                    <MoveUp className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                {secIdx < sectionOrder.length - 1 && (
                                  <button
                                    type="button"
                                    onClick={() => moveSection('activities', 'down')}
                                    className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                                    title="Đưa mục này xuống dưới"
                                  >
                                    <MoveDown className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setActivities((prev) => [
                                    ...prev,
                                    { organizationName: '', position: '', startDate: '', endDate: '', description: '' },
                                  ]);
                                  markDirty();
                                }}
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline cursor-pointer opacity-70 hover:opacity-100 ml-1"
                              >
                                <Plus className="h-3 w-3" />
                                <span>Thêm</span>
                              </button>
                            </div>
                          </div>

                          <div className="space-y-3">
                            {activities.map((act, idx) => (
                              <div
                                key={idx}
                                className="group relative p-2 rounded-lg hover:bg-slate-50/80 transition-all border border-transparent hover:border-slate-200 pr-14"
                              >
                                <div className="absolute right-2 top-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 bg-white border border-slate-200 shadow-sm rounded-lg p-0.5 print:hidden">
                                  {idx > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActivities((prev) => {
                                          const arr = [...prev];
                                          const temp = arr[idx];
                                          arr[idx] = arr[idx - 1];
                                          arr[idx - 1] = temp;
                                          return arr;
                                        });
                                        markDirty();
                                      }}
                                      className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                                      title="Di chuyển lên"
                                    >
                                      <MoveUp className="h-3 w-3" />
                                    </button>
                                  )}
                                  {idx < activities.length - 1 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActivities((prev) => {
                                          const arr = [...prev];
                                          const temp = arr[idx];
                                          arr[idx] = arr[idx + 1];
                                          arr[idx + 1] = temp;
                                          return arr;
                                        });
                                        markDirty();
                                      }}
                                      className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                                      title="Di chuyển xuống"
                                    >
                                      <MoveDown className="h-3 w-3" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActivities((prev) => prev.filter((_, i) => i !== idx));
                                      markDirty();
                                    }}
                                    className="p-1 hover:bg-red-50 rounded text-red-500 cursor-pointer"
                                    title="Xóa mục này"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>

                                <div className="flex items-baseline justify-between gap-4">
                                  <div className="flex-1 min-w-0">
                                    <InlineText
                                      value={act.organizationName || ''}
                                      onChange={(v) => {
                                        setActivities((prev) =>
                                          prev.map((item, i) => (i === idx ? { ...item, organizationName: v } : item)),
                                        );
                                        markDirty();
                                      }}
                                      placeholder="Tên tổ chức"
                                      className="font-bold text-slate-900"
                                      style={{ fontSize: `${0.9 * fontMultiplier}rem` }}
                                      defaultFontSizePx={resolveFontSizePx(0.9 * fontMultiplier * 16)}
                                      defaultFontFamily={currentFont.family}
                                    />
                                  </div>

                                  <div className="flex items-center gap-1 text-slate-500 text-xs italic shrink-0">
                                    <InlineText
                                      value={act.startDate || ''}
                                      onChange={(v) => {
                                        setActivities((prev) =>
                                          prev.map((item, i) => (i === idx ? { ...item, startDate: v } : item)),
                                        );
                                        markDirty();
                                      }}
                                      placeholder="Bắt đầu"
                                      className="w-16 text-right"
                                      defaultFontSizePx={resolveFontSizePx(0.8 * fontMultiplier * 16)}
                                      defaultFontFamily={currentFont.family}
                                    />
                                    <span>-</span>
                                    <InlineText
                                      value={act.endDate || ''}
                                      onChange={(v) => {
                                        setActivities((prev) =>
                                          prev.map((item, i) => (i === idx ? { ...item, endDate: v } : item)),
                                        );
                                        markDirty();
                                      }}
                                      placeholder="Kết thúc"
                                      className="w-16"
                                      defaultFontSizePx={resolveFontSizePx(0.8 * fontMultiplier * 16)}
                                      defaultFontFamily={currentFont.family}
                                    />
                                  </div>
                                </div>

                                <InlineText
                                  value={act.position || ''}
                                  onChange={(v) => {
                                    setActivities((prev) =>
                                      prev.map((item, i) => (i === idx ? { ...item, position: v } : item)),
                                    );
                                    markDirty();
                                  }}
                                  placeholder="Vị trí của bạn"
                                  className="font-medium text-slate-700 italic block mt-0.5"
                                  style={{ fontSize: `${0.85 * fontMultiplier}rem` }}
                                  defaultFontSizePx={resolveFontSizePx(0.85 * fontMultiplier * 16)}
                                  defaultFontFamily={currentFont.family}
                                />

                                <InlineText
                                  multiline={true}
                                  rows={1}
                                  value={act.description || ''}
                                  onChange={(v) => {
                                    setActivities((prev) =>
                                      prev.map((item, i) => (i === idx ? { ...item, description: v } : item)),
                                    );
                                    markDirty();
                                  }}
                                  placeholder="Mô tả hoạt động"
                                  className="text-slate-600 mt-1 block"
                                  style={{ fontSize: `${0.825 * fontMultiplier}rem` }}
                                  defaultFontSizePx={resolveFontSizePx(0.825 * fontMultiplier * 16)}
                                  defaultFontFamily={currentFont.family}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }

                    // 6. CHỨNG CHỈ
                    if (sectionKey === 'certificates' && visibleSections.certificates) {
                      return (
                        <div key="certificates" className="mb-5 group/sec relative">
                          <div className="flex items-center justify-between pb-1 mb-2 border-b border-slate-200">
                            <h2
                              className="font-bold uppercase tracking-wider"
                              style={{
                                color: currentTheme.color,
                                fontSize: `${0.95 * fontMultiplier}rem`,
                              }}
                            >
                              {SECTION_LABELS[cvLanguage].certificates}
                            </h2>
                            <div className="flex items-center gap-1 print:hidden">
                              <div className="flex items-center gap-1 opacity-0 group-hover/sec:opacity-100 transition-opacity">
                                {secIdx > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => moveSection('certificates', 'up')}
                                    className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                                    title="Đưa mục này lên trên"
                                  >
                                    <MoveUp className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                {secIdx < sectionOrder.length - 1 && (
                                  <button
                                    type="button"
                                    onClick={() => moveSection('certificates', 'down')}
                                    className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                                    title="Đưa mục này xuống dưới"
                                  >
                                    <MoveDown className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setCertificates((prev) => [...prev, { name: '', date: '' }]);
                                  markDirty();
                                }}
                                className="text-[11px] font-bold text-primary hover:underline cursor-pointer opacity-70 hover:opacity-100 ml-1"
                              >
                                + Thêm
                              </button>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            {certificates.map((cert, idx) => (
                              <div key={idx} className="group relative flex items-center gap-2 p-1 rounded hover:bg-slate-50/80 pr-8">
                                <div className="flex-1 min-w-0">
                                  <InlineText
                                    value={cert.name || ''}
                                    onChange={(v) => {
                                      setCertificates((prev) =>
                                        prev.map((item, i) => (i === idx ? { ...item, name: v } : item)),
                                      );
                                      markDirty();
                                    }}
                                    placeholder="Tên chứng chỉ"
                                    className="text-slate-800 font-semibold"
                                    style={{ fontSize: `${0.85 * fontMultiplier}rem` }}
                                    defaultFontSizePx={resolveFontSizePx(0.85 * fontMultiplier * 16)}
                                    defaultFontFamily={currentFont.family}
                                  />
                                </div>
                                <div className="w-14 shrink-0">
                                  <InlineText
                                    value={cert.date || ''}
                                    onChange={(v) => {
                                      setCertificates((prev) =>
                                        prev.map((item, i) => (i === idx ? { ...item, date: v } : item)),
                                      );
                                      markDirty();
                                    }}
                                    placeholder="Năm"
                                    className="text-center text-slate-500 text-xs"
                                    defaultFontSizePx={resolveFontSizePx(0.75 * fontMultiplier * 16)}
                                    defaultFontFamily={currentFont.family}
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCertificates((prev) => prev.filter((_, i) => i !== idx));
                                    markDirty();
                                  }}
                                  className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-400 hover:text-red-500 rounded bg-white print:hidden cursor-pointer"
                                  title="Xóa chứng chỉ"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }

                    // 7. GIẢI THƯỞNG
                    if (sectionKey === 'awards' && visibleSections.awards) {
                      return (
                        <div key="awards" className="mb-5 group/sec relative">
                          <div className="flex items-center justify-between pb-1 mb-2 border-b border-slate-200">
                            <h2
                              className="font-bold uppercase tracking-wider"
                              style={{
                                color: currentTheme.color,
                                fontSize: `${0.95 * fontMultiplier}rem`,
                              }}
                            >
                              {SECTION_LABELS[cvLanguage].awards}
                            </h2>
                            <div className="flex items-center gap-1 print:hidden">
                              <div className="flex items-center gap-1 opacity-0 group-hover/sec:opacity-100 transition-opacity">
                                {secIdx > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => moveSection('awards', 'up')}
                                    className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                                    title="Đưa mục này lên trên"
                                  >
                                    <MoveUp className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                {secIdx < sectionOrder.length - 1 && (
                                  <button
                                    type="button"
                                    onClick={() => moveSection('awards', 'down')}
                                    className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                                    title="Đưa mục này xuống dưới"
                                  >
                                    <MoveDown className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setAwards((prev) => [...prev, { name: '', date: '' }]);
                                  markDirty();
                                }}
                                className="text-[11px] font-bold text-primary hover:underline cursor-pointer opacity-70 hover:opacity-100 ml-1"
                              >
                                + Thêm
                              </button>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            {awards.map((award, idx) => (
                              <div key={idx} className="group relative flex items-center gap-2 p-1 rounded hover:bg-slate-50/80 pr-8">
                                <div className="flex-1 min-w-0">
                                  <InlineText
                                    value={award.name || ''}
                                    onChange={(v) => {
                                      setAwards((prev) =>
                                        prev.map((item, i) => (i === idx ? { ...item, name: v } : item)),
                                      );
                                      markDirty();
                                    }}
                                    placeholder="Tên giải thưởng"
                                    className="text-slate-800 font-semibold"
                                    style={{ fontSize: `${0.85 * fontMultiplier}rem` }}
                                    defaultFontSizePx={resolveFontSizePx(0.85 * fontMultiplier * 16)}
                                    defaultFontFamily={currentFont.family}
                                  />
                                </div>
                                <div className="w-14 shrink-0">
                                  <InlineText
                                    value={award.date || ''}
                                    onChange={(v) => {
                                      setAwards((prev) =>
                                        prev.map((item, i) => (i === idx ? { ...item, date: v } : item)),
                                      );
                                      markDirty();
                                    }}
                                    placeholder="Năm"
                                    className="text-center text-slate-500 text-xs"
                                    defaultFontSizePx={resolveFontSizePx(0.75 * fontMultiplier * 16)}
                                    defaultFontFamily={currentFont.family}
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAwards((prev) => prev.filter((_, i) => i !== idx));
                                    markDirty();
                                  }}
                                  className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-400 hover:text-red-500 rounded bg-white print:hidden cursor-pointer"
                                  title="Xóa giải thưởng"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }

                    return null;
                  })}
                </div>

                {/* Bottom Watermark (Free Tier) */}
                <div className="mt-8 pt-3 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-400 select-none">
                  <span>Trang 1 / 1</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-slate-500">
                    <Sparkles className="h-3 w-3 text-primary" />
                    Được tạo bởi <b className="text-slate-700">TalentPulse</b> — talentpulse.vn
                  </span>
                </div>
              </div>
            )}

            {/* ================= TEMPLATE 2: MODERN 2-COLUMN TIMELINE ================= */}
            {templateType === 'template2' && (
              <div className="p-8 sm:p-10 flex flex-col justify-between min-h-[297mm]">
                <div>
                  {/* Top Header */}
                  <div className="flex flex-col sm:flex-row items-start justify-between gap-4 pb-5 mb-6 border-b-2 border-slate-200">
                    <div className="flex-1 min-w-0">
                      <InlineText
                        value={fullName}
                        onChange={(v) => {
                          setFullName(v);
                          markDirty();
                        }}
                        placeholder="HỌ VÀ TÊN"
                        asTitle={true}
                        className="font-black tracking-tight block"
                        style={{
                          color: currentTheme.color,
                          fontSize: `${1.75 * fontMultiplier}rem`,
                        }}
                        defaultFontSizePx={resolveFontSizePx(1.75 * fontMultiplier * 16)}
                        defaultFontFamily={currentFont.family}
                        defaultColor={currentTheme.color}
                      />
                      <InlineText
                        value={position}
                        onChange={(v) => {
                          setPosition(v);
                          markDirty();
                        }}
                        placeholder="VỊ TRÍ ỨNG TUYỂN"
                        className="font-bold text-slate-600 uppercase tracking-wider block mt-0.5"
                        style={{ fontSize: `${0.95 * fontMultiplier}rem` }}
                        defaultFontSizePx={resolveFontSizePx(0.95 * fontMultiplier * 16)}
                        defaultFontFamily={currentFont.family}
                      />
                      {visibleSections.objective && (
                        <InlineText
                          multiline={true}
                          rows={2}
                          value={careerObjective}
                          onChange={(v) => {
                            setCareerObjective(v);
                            markDirty();
                          }}
                          placeholder="Mục tiêu nghề nghiệp ngắn gọn..."
                          className="text-slate-600 mt-2 block leading-relaxed"
                          style={{ fontSize: `${0.825 * fontMultiplier}rem` }}
                          defaultFontSizePx={resolveFontSizePx(0.825 * fontMultiplier * 16)}
                          defaultFontFamily={currentFont.family}
                        />
                      )}
                    </div>

                    {/* Right Contacts Box */}
                    <div
                      className="rounded-xl p-3.5 space-y-1 text-xs text-slate-700 shrink-0 border border-slate-100"
                      style={{
                        backgroundColor: currentTheme.bgLight,
                        fontSize: `${0.825 * fontMultiplier}rem`,
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 shrink-0" style={{ color: currentTheme.color }} />
                        <InlineText
                          value={phone}
                          onChange={(v) => {
                            setPhone(v);
                            markDirty();
                          }}
                          placeholder="0123 456 789"
                          className="w-32"
                          defaultFontSizePx={resolveFontSizePx(0.825 * fontMultiplier * 16)}
                          defaultFontFamily={currentFont.family}
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 shrink-0" style={{ color: currentTheme.color }} />
                        <InlineText
                          value={email}
                          onChange={(v) => {
                            setEmail(v);
                            markDirty();
                          }}
                          placeholder="email@example.com"
                          className="w-36"
                          defaultFontSizePx={resolveFontSizePx(0.825 * fontMultiplier * 16)}
                          defaultFontFamily={currentFont.family}
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: currentTheme.color }} />
                        <InlineText
                          value={address}
                          onChange={(v) => {
                            setAddress(v);
                            markDirty();
                          }}
                          placeholder="Hà Nội, VN"
                          className="w-32"
                          defaultFontSizePx={resolveFontSizePx(0.825 * fontMultiplier * 16)}
                          defaultFontFamily={currentFont.family}
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Globe className="h-3.5 w-3.5 shrink-0" style={{ color: currentTheme.color }} />
                        <InlineText
                          value={link}
                          onChange={(v) => {
                            setLink(v);
                            markDirty();
                          }}
                          placeholder="linkedin.com"
                          className="w-32"
                          defaultFontSizePx={resolveFontSizePx(0.825 * fontMultiplier * 16)}
                          defaultFontFamily={currentFont.family}
                        />
                      </div>
                    </div>
                  </div>

                  {/* 2-Column Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-6">
                    {/* Left Column (Work Experience & Activities - 7 cols) */}
                    <div className="sm:col-span-7 space-y-6">
                      {/* Work Experience */}
                      {visibleSections.experience && (
                        <div>
                          <div className="flex items-center justify-between pb-1 mb-3.5 border-b border-slate-200">
                            <div className="flex items-center gap-2">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: currentTheme.color }}
                              />
                              <h2
                                className="text-xs font-black uppercase tracking-wider"
                                style={{
                                  color: currentTheme.color,
                                  fontSize: `${0.9 * fontMultiplier}rem`,
                                }}
                              >
                                {SECTION_LABELS[cvLanguage].experience}
                              </h2>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setWorkExperience((prev) => [
                                  ...prev,
                                  { companyName: '', position: '', startDate: '', endDate: '', description: '' },
                                ]);
                                markDirty();
                              }}
                              className="text-[11px] font-bold text-primary hover:underline cursor-pointer opacity-70 hover:opacity-100 print:hidden"
                            >
                              + Thêm
                            </button>
                          </div>

                          <div className="space-y-3.5 relative pl-3 border-l-2 border-slate-200 ml-1">
                            {workExperience.map((exp, idx) => (
                              <div key={idx} className="relative group p-2 rounded-lg hover:bg-slate-50/80 pr-14">
                                {/* Floating Action Buttons */}
                                <div className="absolute right-2 top-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 bg-white border border-slate-200 shadow-sm rounded-lg p-0.5 print:hidden">
                                  {idx > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setWorkExperience((prev) => {
                                          const arr = [...prev];
                                          const temp = arr[idx];
                                          arr[idx] = arr[idx - 1];
                                          arr[idx - 1] = temp;
                                          return arr;
                                        });
                                        markDirty();
                                      }}
                                      className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                                      title="Di chuyển lên"
                                    >
                                      <MoveUp className="h-3 w-3" />
                                    </button>
                                  )}
                                  {idx < workExperience.length - 1 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setWorkExperience((prev) => {
                                          const arr = [...prev];
                                          const temp = arr[idx];
                                          arr[idx] = arr[idx + 1];
                                          arr[idx + 1] = temp;
                                          return arr;
                                        });
                                        markDirty();
                                      }}
                                      className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                                      title="Di chuyển xuống"
                                    >
                                      <MoveDown className="h-3 w-3" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setWorkExperience((prev) => prev.filter((_, i) => i !== idx));
                                      markDirty();
                                    }}
                                    className="p-1 hover:bg-red-50 rounded text-red-500 cursor-pointer"
                                    title="Xóa mục này"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>

                                <span
                                  className="absolute -left-[19px] top-3 h-2.5 w-2.5 rounded-full border-2 border-white"
                                  style={{ backgroundColor: currentTheme.color }}
                                />
                                <div className="flex items-baseline justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <InlineText
                                      value={exp.position || ''}
                                      onChange={(v) => {
                                        setWorkExperience((prev) =>
                                          prev.map((item, i) => (i === idx ? { ...item, position: v } : item)),
                                        );
                                        markDirty();
                                      }}
                                      placeholder="Vị trí công việc"
                                      className="font-bold text-slate-900"
                                      style={{ fontSize: `${0.875 * fontMultiplier}rem` }}
                                      defaultFontSizePx={resolveFontSizePx(0.875 * fontMultiplier * 16)}
                                      defaultFontFamily={currentFont.family}
                                    />
                                  </div>
                                  <div className="flex items-center gap-1 text-[11px] text-slate-500 shrink-0 italic">
                                    <InlineText
                                      value={exp.startDate || ''}
                                      onChange={(v) => {
                                        setWorkExperience((prev) =>
                                          prev.map((item, i) => (i === idx ? { ...item, startDate: v } : item)),
                                        );
                                        markDirty();
                                      }}
                                      placeholder="Bắt đầu"
                                      className="w-14 text-right"
                                      defaultFontSizePx={resolveFontSizePx(0.75 * fontMultiplier * 16)}
                                      defaultFontFamily={currentFont.family}
                                    />
                                    <span>-</span>
                                    <InlineText
                                      value={exp.endDate || ''}
                                      onChange={(v) => {
                                        setWorkExperience((prev) =>
                                          prev.map((item, i) => (i === idx ? { ...item, endDate: v } : item)),
                                        );
                                        markDirty();
                                      }}
                                      placeholder="Kết thúc"
                                      className="w-14"
                                      defaultFontSizePx={resolveFontSizePx(0.75 * fontMultiplier * 16)}
                                      defaultFontFamily={currentFont.family}
                                    />
                                  </div>
                                </div>

                                <InlineText
                                  value={exp.companyName || ''}
                                  onChange={(v) => {
                                    setWorkExperience((prev) =>
                                      prev.map((item, i) => (i === idx ? { ...item, companyName: v } : item)),
                                    );
                                    markDirty();
                                  }}
                                  placeholder="Tên công ty"
                                  className="font-semibold text-xs mt-0.5 block"
                                  style={{ color: currentTheme.color }}
                                  defaultFontSizePx="12px"
                                  defaultFontFamily={currentFont.family}
                                  defaultColor={currentTheme.color}
                                />

                                <InlineText
                                  multiline={true}
                                  rows={2}
                                  value={exp.description || ''}
                                  onChange={(v) => {
                                    setWorkExperience((prev) =>
                                      prev.map((item, i) => (i === idx ? { ...item, description: v } : item)),
                                    );
                                    markDirty();
                                  }}
                                  placeholder="Mô tả công việc chi tiết..."
                                  className="text-slate-600 text-xs mt-1 block leading-relaxed"
                                  style={{ fontSize: `${0.8 * fontMultiplier}rem` }}
                                  defaultFontSizePx={resolveFontSizePx(0.8 * fontMultiplier * 16)}
                                  defaultFontFamily={currentFont.family}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Activities */}
                      {visibleSections.activities && (
                        <div>
                          <div className="flex items-center justify-between pb-1 mb-3.5 border-b border-slate-200">
                            <div className="flex items-center gap-2">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: currentTheme.color }}
                              />
                              <h2
                                className="text-xs font-black uppercase tracking-wider"
                                style={{
                                  color: currentTheme.color,
                                  fontSize: `${0.9 * fontMultiplier}rem`,
                                }}
                              >
                                {SECTION_LABELS[cvLanguage].activities}
                              </h2>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setActivities((prev) => [
                                  ...prev,
                                  { organizationName: '', position: '', startDate: '', endDate: '', description: '' },
                                ]);
                                markDirty();
                              }}
                              className="text-[11px] font-bold text-primary hover:underline cursor-pointer opacity-70 hover:opacity-100 print:hidden"
                            >
                              + Thêm
                            </button>
                          </div>

                          <div className="space-y-3 relative pl-3 border-l-2 border-slate-200 ml-1">
                            {activities.map((act, idx) => (
                              <div key={idx} className="relative group p-2 rounded-lg hover:bg-slate-50/80 pr-14">
                                {/* Floating Action Buttons */}
                                <div className="absolute right-2 top-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 bg-white border border-slate-200 shadow-sm rounded-lg p-0.5 print:hidden">
                                  {idx > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActivities((prev) => {
                                          const arr = [...prev];
                                          const temp = arr[idx];
                                          arr[idx] = arr[idx - 1];
                                          arr[idx - 1] = temp;
                                          return arr;
                                        });
                                        markDirty();
                                      }}
                                      className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                                      title="Di chuyển lên"
                                    >
                                      <MoveUp className="h-3 w-3" />
                                    </button>
                                  )}
                                  {idx < activities.length - 1 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActivities((prev) => {
                                          const arr = [...prev];
                                          const temp = arr[idx];
                                          arr[idx] = arr[idx + 1];
                                          arr[idx + 1] = temp;
                                          return arr;
                                        });
                                        markDirty();
                                      }}
                                      className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                                      title="Di chuyển xuống"
                                    >
                                      <MoveDown className="h-3 w-3" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActivities((prev) => prev.filter((_, i) => i !== idx));
                                      markDirty();
                                    }}
                                    className="p-1 hover:bg-red-50 rounded text-red-500 cursor-pointer"
                                    title="Xóa mục này"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>

                                <span
                                  className="absolute -left-[19px] top-3 h-2.5 w-2.5 rounded-full border-2 border-white"
                                  style={{ backgroundColor: currentTheme.color }}
                                />
                                <div className="flex items-baseline justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <InlineText
                                      value={act.organizationName || ''}
                                      onChange={(v) => {
                                        setActivities((prev) =>
                                          prev.map((item, i) => (i === idx ? { ...item, organizationName: v } : item)),
                                        );
                                        markDirty();
                                      }}
                                      placeholder="Tổ chức / Dự án"
                                      className="font-bold text-slate-900"
                                      style={{ fontSize: `${0.875 * fontMultiplier}rem` }}
                                      defaultFontSizePx={resolveFontSizePx(0.875 * fontMultiplier * 16)}
                                      defaultFontFamily={currentFont.family}
                                    />
                                  </div>
                                  <div className="flex items-center gap-1 text-[11px] text-slate-500 shrink-0 italic">
                                    <InlineText
                                      value={act.startDate || ''}
                                      onChange={(v) => {
                                        setActivities((prev) =>
                                          prev.map((item, i) => (i === idx ? { ...item, startDate: v } : item)),
                                        );
                                        markDirty();
                                      }}
                                      placeholder="Bắt đầu"
                                      className="w-14 text-right"
                                      defaultFontSizePx={resolveFontSizePx(0.75 * fontMultiplier * 16)}
                                      defaultFontFamily={currentFont.family}
                                    />
                                    <span>-</span>
                                    <InlineText
                                      value={act.endDate || ''}
                                      onChange={(v) => {
                                        setActivities((prev) =>
                                          prev.map((item, i) => (i === idx ? { ...item, endDate: v } : item)),
                                        );
                                        markDirty();
                                      }}
                                      placeholder="Kết thúc"
                                      className="w-14"
                                      defaultFontSizePx={resolveFontSizePx(0.75 * fontMultiplier * 16)}
                                      defaultFontFamily={currentFont.family}
                                    />
                                  </div>
                                </div>

                                <InlineText
                                  value={act.position || ''}
                                  onChange={(v) => {
                                    setActivities((prev) =>
                                      prev.map((item, i) => (i === idx ? { ...item, position: v } : item)),
                                    );
                                    markDirty();
                                  }}
                                  placeholder="Vị trí tham gia"
                                  className="font-medium text-xs text-slate-600 block mt-0.5 italic"
                                  defaultFontSizePx="12px"
                                  defaultFontFamily={currentFont.family}
                                />

                                <InlineText
                                  multiline={true}
                                  rows={1}
                                  value={act.description || ''}
                                  onChange={(v) => {
                                    setActivities((prev) =>
                                      prev.map((item, i) => (i === idx ? { ...item, description: v } : item)),
                                    );
                                    markDirty();
                                  }}
                                  placeholder="Mô tả đóng góp..."
                                  className="text-slate-600 text-xs mt-1 block"
                                  style={{ fontSize: `${0.8 * fontMultiplier}rem` }}
                                  defaultFontSizePx={resolveFontSizePx(0.8 * fontMultiplier * 16)}
                                  defaultFontFamily={currentFont.family}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right Column (Education, Skills, Certificates - 5 cols) */}
                    <div className="sm:col-span-5 space-y-6">
                      {/* Education */}
                      {visibleSections.education && (
                        <div>
                          <div className="flex items-center justify-between pb-1 mb-3 border-b border-slate-200">
                            <div className="flex items-center gap-2">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: currentTheme.color }}
                              />
                              <h2
                                className="text-xs font-black uppercase tracking-wider"
                                style={{
                                  color: currentTheme.color,
                                  fontSize: `${0.9 * fontMultiplier}rem`,
                                }}
                              >
                                {SECTION_LABELS[cvLanguage].education}
                              </h2>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setEducation((prev) => [
                                  ...prev,
                                  { schoolName: '', major: '', startDate: '', endDate: '', description: '' },
                                ]);
                                markDirty();
                              }}
                              className="text-[11px] font-bold text-primary hover:underline cursor-pointer opacity-70 hover:opacity-100 print:hidden"
                            >
                              + Thêm
                            </button>
                          </div>

                          <div className="space-y-3">
                            {education.map((edu, idx) => (
                              <div
                                key={idx}
                                className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-100 space-y-1"
                              >
                                <InlineText
                                  value={edu.schoolName || ''}
                                  onChange={(v) => {
                                    setEducation((prev) =>
                                      prev.map((item, i) => (i === idx ? { ...item, schoolName: v } : item)),
                                    );
                                    markDirty();
                                  }}
                                  placeholder="Tên trường học"
                                  className="font-bold text-slate-900 block"
                                  style={{ fontSize: `${0.85 * fontMultiplier}rem` }}
                                  defaultFontSizePx={resolveFontSizePx(0.85 * fontMultiplier * 16)}
                                  defaultFontFamily={currentFont.family}
                                />
                                <InlineText
                                  value={edu.major || ''}
                                  onChange={(v) => {
                                    setEducation((prev) =>
                                      prev.map((item, i) => (i === idx ? { ...item, major: v } : item)),
                                    );
                                    markDirty();
                                  }}
                                  placeholder="Chuyên ngành"
                                  className="font-semibold text-xs block"
                                  style={{ color: currentTheme.color }}
                                  defaultFontSizePx="12px"
                                  defaultFontFamily={currentFont.family}
                                  defaultColor={currentTheme.color}
                                />
                                <div className="flex items-center gap-1 text-[11px] text-slate-500 italic">
                                  <InlineText
                                    value={edu.startDate || ''}
                                    onChange={(v) => {
                                      setEducation((prev) =>
                                        prev.map((item, i) => (i === idx ? { ...item, startDate: v } : item)),
                                      );
                                      markDirty();
                                    }}
                                    placeholder="Bắt đầu"
                                    className="w-14"
                                    defaultFontSizePx={resolveFontSizePx(0.75 * fontMultiplier * 16)}
                                    defaultFontFamily={currentFont.family}
                                  />
                                  <span>-</span>
                                  <InlineText
                                    value={edu.endDate || ''}
                                    onChange={(v) => {
                                      setEducation((prev) =>
                                        prev.map((item, i) => (i === idx ? { ...item, endDate: v } : item)),
                                      );
                                      markDirty();
                                    }}
                                    placeholder="Kết thúc"
                                    className="w-14"
                                    defaultFontSizePx={resolveFontSizePx(0.75 * fontMultiplier * 16)}
                                    defaultFontFamily={currentFont.family}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Skills */}
                      {visibleSections.skills && (
                        <div>
                          <div className="flex items-center justify-between pb-1 mb-3 border-b border-slate-200">
                            <div className="flex items-center gap-2">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: currentTheme.color }}
                              />
                              <h2
                                className="text-xs font-black uppercase tracking-wider"
                                style={{
                                  color: currentTheme.color,
                                  fontSize: `${0.9 * fontMultiplier}rem`,
                                }}
                              >
                                {SECTION_LABELS[cvLanguage].skills}
                              </h2>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setSkills((prev) => [...prev, { name: '', description: '' }]);
                                markDirty();
                              }}
                              className="text-[11px] font-bold text-primary hover:underline cursor-pointer opacity-70 hover:opacity-100 print:hidden"
                            >
                              + Thêm
                            </button>
                          </div>

                          <div className="space-y-1.5">
                            {skills.map((skill, idx) => (
                              <div
                                key={idx}
                                className="group relative flex items-center gap-2 p-1 rounded hover:bg-slate-50 pr-8"
                              >
                                <div className="w-28 shrink-0">
                                  <InlineText
                                    value={skill.name || ''}
                                    onChange={(v) => {
                                      setSkills((prev) =>
                                        prev.map((item, i) => (i === idx ? { ...item, name: v } : item)),
                                      );
                                      markDirty();
                                    }}
                                    placeholder="Kỹ năng"
                                    className="font-bold text-slate-800"
                                    style={{ fontSize: `${0.825 * fontMultiplier}rem` }}
                                    defaultFontSizePx={resolveFontSizePx(0.825 * fontMultiplier * 16)}
                                    defaultFontFamily={currentFont.family}
                                  />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <InlineText
                                    value={skill.description || ''}
                                    onChange={(v) => {
                                      setSkills((prev) =>
                                        prev.map((item, i) => (i === idx ? { ...item, description: v } : item)),
                                      );
                                      markDirty();
                                    }}
                                    placeholder="Mô tả mức độ"
                                    className="text-slate-600 text-xs"
                                    defaultFontSizePx="12px"
                                    defaultFontFamily={currentFont.family}
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSkills((prev) => prev.filter((_, i) => i !== idx));
                                    markDirty();
                                  }}
                                  className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-400 hover:text-red-500 rounded bg-white print:hidden cursor-pointer"
                                  title="Xóa kỹ năng"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom Watermark (Free Tier) */}
                <div className="mt-8 pt-3 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-400 select-none">
                  <span>Trang 1 / 1</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-slate-500">
                    <Sparkles className="h-3 w-3 text-primary" />
                    Được tạo bởi <b className="text-slate-700">TalentPulse</b> — talentpulse.vn
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI Premium Modal */}
      <AnimatePresence>
        {showAiModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAiModal(false)}
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
            >
              <button
                type="button"
                onClick={() => setShowAiModal(false)}
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-lg shadow-amber-500/30">
                <Crown className="h-8 w-8" />
              </div>

              <div className="mt-4 text-center">
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-3 py-0.5 text-xs font-bold text-amber-600 dark:text-amber-400">
                  <Sparkles className="h-3.5 w-3.5" />
                  Tính năng Candidate Premium
                </span>

                <h3 className="mt-2 text-lg font-black text-slate-900 dark:text-white">
                  Trợ lý AI Tối ưu hóa CV
                </h3>

                <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  Trí tuệ nhân tạo của TalentPulse sẽ tự động phân tích mô tả công việc (JD), gợi ý từ khóa chuẩn ATS, chỉnh sửa câu văn chuyên nghiệp và tăng 85% cơ hội được gọi phỏng vấn.
                </p>

                <div className="mt-4 rounded-2xl bg-amber-50/70 p-3 text-left text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 border border-amber-200/60 dark:border-amber-800/60 space-y-1.5">
                  <p className="font-bold flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                    Đặc quyền gói Premium:
                  </p>
                  <p>• Viết lại kinh nghiệm làm việc chuẩn mô hình STAR.</p>
                  <p>• Chấm điểm độ tương thích CV với mọi vị trí tuyển dụng.</p>
                  <p>• Xuất file PDF sạch 100% không watermark logo.</p>
                </div>

                <div className="mt-6 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAiModal(false)}
                    className="flex-1 h-11 rounded-xl bg-slate-100 font-bold text-xs text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 cursor-pointer"
                  >
                    Đóng
                  </button>
                  <a
                    href="/#premium"
                    onClick={() => setShowAiModal(false)}
                    className="flex-1 h-11 flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 font-bold text-xs text-white shadow-lg shadow-amber-500/25 hover:from-amber-600 hover:to-amber-700 transition cursor-pointer"
                  >
                    <Crown className="h-4 w-4" />
                    <span>Nâng cấp ngay</span>
                  </a>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
