import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  ChevronRight,
  FileText,
  Search,
  LayoutGrid,
  Briefcase,
  Sparkles,
  GraduationCap,
  FileCheck2,
  SlidersHorizontal,
  Bot,
  ChevronDown,
  Crown,
} from 'lucide-react';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import { CVPreviewCanvas } from '../../components/cv/CVPreviewCanvas';
import { MobileNoticeModal } from '../../components/cv/MobileNoticeModal';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../context/ToastContext';
import { onlineCvApi } from '../../lib/cvApi';
import type { CVTemplateType } from '../../lib/cvTypes';

interface TemplateItem {
  id: CVTemplateType;
  title: string;
  subtitle: string;
  category: 'all' | 'simple' | 'professional' | 'modern' | 'impressive' | 'harvard' | 'ats';
  tags: string[];
  colors: string[];
  recommendedRole: string;
  isPremium?: boolean;
}

const TEMPLATES: TemplateItem[] = [
  {
    id: 'template1',
    title: 'Tiêu chuẩn',
    subtitle: 'Bố cục 1 cột tối ưu ATS, rõ ràng và mạch lạc',
    category: 'ats',
    tags: ['ATS', 'Đơn giản'],
    colors: ['#0F172A', '#2563EB', '#475569', '#DC2626', '#0D9488'],
    recommendedRole: 'Phù hợp mọi ngành nghề & hệ thống ATS',
    isPremium: false,
  },
  {
    id: 'template1',
    title: 'Tiêu chuẩn (ít kinh nghiệm)',
    subtitle: 'Tập trung vào học vấn, kỹ năng và hoạt động ngoại khóa',
    category: 'simple',
    tags: ['ATS', 'Đơn giản', 'Chuyên nghiệp'],
    colors: ['#475569', '#2563EB', '#0F172A', '#0D9488', '#991B1B'],
    recommendedRole: 'Dành cho sinh viên mới tốt nghiệp hoặc thực tập sinh',
    isPremium: false,
  },
  {
    id: 'template2',
    title: 'Thanh lịch (Executive 2 Cột)',
    subtitle: 'Bố cục 2 cột thanh lịch với dòng thời gian tinh tế',
    category: 'professional',
    tags: ['PREMIUM', 'Hiện đại', 'Chuyên nghiệp'],
    colors: ['#DC2626', '#2563EB', '#0F172A', '#0D9488', '#4F46E5'],
    recommendedRole: 'Phù hợp Quản lý, Marketing, HR & Kinh doanh',
    isPremium: true,
  },
  {
    id: 'template2',
    title: 'Hiện đại (Modern Timeline Pro)',
    subtitle: 'Đường phân cách trực quan nổi bật các mốc sự nghiệp',
    category: 'modern',
    tags: ['PREMIUM', 'Hiện đại', 'Ấn tượng'],
    colors: ['#2563EB', '#0D9488', '#4F46E5', '#0F172A', '#991B1B'],
    recommendedRole: 'Dành cho Lập trình viên, Designer & Project Manager',
    isPremium: true,
  },
  {
    id: 'template1',
    title: 'Kỹ sư Công nghệ (ATS Pro)',
    subtitle: 'Tối ưu mật độ từ khóa kỹ thuật cho ngành Tech/IT',
    category: 'impressive',
    tags: ['ATS', 'Kỹ thuật', 'Chuyên nghiệp'],
    colors: ['#2563EB', '#0F172A', '#0D9488', '#475569', '#DC2626'],
    recommendedRole: 'Software Engineer, Data Engineer, DevOps & QA',
    isPremium: false,
  },
  {
    id: 'template1',
    title: 'Harvard Classic Minimalist',
    subtitle: 'Phong cách kinh điển Ivy League, tối giản và uy tín',
    category: 'harvard',
    tags: ['Harvard', 'Đơn giản', 'Trang trọng'],
    colors: ['#0F172A', '#991B1B', '#2563EB', '#475569', '#0D9488'],
    recommendedRole: 'Dành cho Luật, Tài chính, Tư vấn & Học thuật',
    isPremium: false,
  },
];

// Sample default data for template demo cards
const SAMPLE_PREVIEW_DATA = {
  fullName: 'TRẦN QUỐC AN',
  position: 'Senior Fullstack Developer',
  phone: '0368 932 861',
  email: 'quocan.work@talentpulse.vn',
  link: 'github.com/quocantran',
  address: 'Hà Nội, Việt Nam',
  careerObjective:
    'Lập trình viên Fullstack với hơn 4 năm kinh nghiệm xây dựng hệ thống phần mềm hiệu năng cao, tối ưu cơ sở dữ liệu và triển khai kiến trúc microservices mở rộng.',
  education: [
    {
      schoolName: 'Học viện Công nghệ Bưu chính Viễn thông (PTIT)',
      major: 'Kỹ sư Công nghệ Thông tin',
      startDate: '2020',
      endDate: '2024',
      description: 'Tốt nghiệp loại Giỏi. Nghiên cứu AI và kiến trúc phân tán.',
    },
  ],
  workExperience: [
    {
      companyName: 'Tập đoàn Công nghệ TalentPulse',
      position: 'Lead Fullstack Developer',
      startDate: '2024',
      endDate: 'Hiện tại',
      description:
        'Phát triển hệ sinh thái tuyển dụng thông minh tích hợp AI matching, xử lý hơn 100k người dùng.',
    },
    {
      companyName: 'Fintech Solutions Co.',
      position: 'Software Engineer',
      startDate: '2022',
      endDate: '2024',
      description:
        'Xây dựng các module thanh toán an toàn, tối ưu hóa truy vấn PostgreSQL giảm 45% latency.',
    },
  ],
  skills: [
    { name: 'NestJS / Node.js', description: 'Chuyên sâu' },
    { name: 'React / TypeScript', description: 'Thành thạo' },
    { name: 'PostgreSQL & Redis', description: 'Tối ưu hóa' },
    { name: 'Docker / CI-CD', description: 'Triển khai' },
  ],
  activities: [
    {
      organizationName: 'Cộng đồng Nhà phát triển Trẻ',
      position: 'Technical Speaker',
      startDate: '2023',
      endDate: '2025',
      description: 'Chia sẻ kiến thức về Clean Code và kiến trúc Backend hiện đại.',
    },
  ],
  certificates: [
    { name: 'AWS Certified Solutions Architect', date: '2024' },
    { name: 'TOEIC 850 / 990', date: '2023' },
  ],
  awards: [
    { name: 'Giải Nhất Cuộc thi Lập trình Sáng tạo', date: '2023' },
  ],
};

export default function CVTemplatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, accessToken } = useAuth();
  const toast = useToast();

  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [selectedLanguage, setSelectedLanguage] = useState<'vi' | 'en'>('vi');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedColorMap, setSelectedColorMap] = useState<Record<string, string>>({});
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);
  const [isMobileNoticeOpen, setIsMobileNoticeOpen] = useState(false);
  const [currentCvCount, setCurrentCvCount] = useState<number>(0);
  const [isMobileScreen, setIsMobileScreen] = useState(false);

  const isUserPremium = Boolean(user?.isPremium);
  const maxLimit = isUserPremium ? 9999 : user?.isVerified ? 6 : 3;

  useEffect(() => {
    const checkScreen = () => {
      setIsMobileScreen(window.innerWidth < 1024);
    };
    checkScreen();
    window.addEventListener('resize', checkScreen);
    return () => window.removeEventListener('resize', checkScreen);
  }, []);

  useEffect(() => {
    if (accessToken) {
      onlineCvApi
        .findAll(accessToken)
        .then((cvs) => {
          setCurrentCvCount(cvs?.length || 0);
        })
        .catch(() => {});
    }
  }, [accessToken]);

  const categories = [
    { id: 'all', label: t('cv.allCategories', 'Tất cả'), icon: LayoutGrid },
    { id: 'simple', label: t('cv.simpleCategory', 'Đơn giản'), icon: FileCheck2 },
    { id: 'professional', label: t('cv.proCategory', 'Chuyên nghiệp'), icon: Briefcase },
    { id: 'modern', label: t('cv.modernCategory', 'Hiện đại'), icon: Sparkles },
    { id: 'impressive', label: t('cv.impressiveCategory', 'Ấn tượng'), icon: SlidersHorizontal },
    { id: 'harvard', label: t('cv.harvardCategory', 'Harvard'), icon: GraduationCap },
    { id: 'ats', label: t('cv.atsCategory', 'ATS'), icon: FileText },
  ];

  const handleUseTemplate = (template: TemplateItem) => {
    if (isMobileScreen) {
      setIsMobileNoticeOpen(true);
      return;
    }

    // 1. Check CV limit
    if (!isUserPremium && currentCvCount >= maxLimit) {
      toast.error(
        `Đạt giới hạn ${maxLimit} CV`,
        user?.isVerified
          ? 'Vui lòng nâng cấp gói Candidate Premium để tạo không giới hạn CV.'
          : 'Vui lòng xác thực tài khoản qua email (nhận 6 CV) hoặc nâng cấp Premium.',
      );
      return;
    }

    // 2. Check Premium template lock
    if (template.isPremium && !isUserPremium) {
      toast.info(
        'Mẫu CV Cao Cấp (Premium)',
        'Mẫu CV này chỉ dành cho tài khoản Candidate Premium. Vui lòng nâng cấp để sử dụng 100% mẫu CV Cao Cấp.',
      );
      navigate('/premium');
      return;
    }

    navigate('/cv-editor/new', {
      state: {
        templateType: template.id,
        cvLanguage: selectedLanguage,
      },
    });
  };

  const filteredTemplates = TEMPLATES.filter((tpl) => {
    const matchCategory = activeCategory === 'all' || tpl.category === activeCategory;
    const matchSearch =
      tpl.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tpl.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchCategory && matchSearch;
  });

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950 font-sans">
      <Header />

      <main className="flex-1 pt-20 sm:pt-24 lg:pt-28 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          {/* 1. Breadcrumbs */}
          <nav className="flex items-center gap-2 text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400 mb-6">
            <Link to="/" className="hover:text-primary transition-colors">
              {t('cv.breadcrumbHome', 'Trang chủ')}
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <Link to="/my-cv" className="hover:text-primary transition-colors">
              {t('cv.breadcrumbMyCv', 'CV của tôi')}
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="font-bold text-slate-900 dark:text-white">
              {t('cv.breadcrumbTemplates', 'Chọn mẫu CV')}
            </span>
          </nav>

          {/* 2. Top Banner Header (Matches user screenshot) */}
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-6 mb-6">
            <div className="max-w-3xl">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight">
                Mẫu CV xin việc {selectedLanguage === 'vi' ? 'tiếng Việt' : 'tiếng Anh'}{' '}
                <span className="text-primary">Đơn giản</span> chuẩn 2026
              </h1>
              <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {t(
                  'cv.templateHeroDesc',
                  'Tuyển chọn mẫu CV có thiết kế đơn giản, ưu tiên tính dễ đọc và dễ sử dụng. Dành cho ứng viên muốn tập trung vào khả năng truyền tải thông tin một cách đầy đủ và rõ ràng - hơn là những chi tiết trang trí cầu kỳ.',
                )}
              </p>
            </div>

            {/* AI Assistant Robot Vector / Badge on Right */}
            <div className="hidden lg:flex shrink-0 items-center gap-3 rounded-2xl bg-white/80 dark:bg-slate-900/80 p-3.5 border border-slate-200/80 dark:border-slate-800 shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary dark:bg-primary/20">
                <Bot className="h-7 w-7 text-primary animate-bounce" style={{ animationDuration: '3s' }} />
              </div>
              <div className="text-xs">
                <p className="font-extrabold text-slate-900 dark:text-white">TalentPulse AI</p>
                <p className="text-slate-500 dark:text-slate-400">Chuẩn hóa cấu trúc ATS 2026</p>
              </div>
            </div>
          </div>

          {/* 3. Category Pill Filter Bar & Language Dropdown (Matches user screenshot) */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 mb-8">
            {/* Filter Pills with Icons */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 lg:pb-0 scrollbar-none">
              {categories.map((cat) => {
                const Icon = cat.icon;
                const isActive = activeCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setActiveCategory(cat.id)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer shadow-xs ${
                      isActive
                        ? 'bg-primary text-white shadow-md shadow-primary/20 scale-102'
                        : 'bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800'
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Right Controls: Search & Language Dropdown */}
            <div className="flex items-center gap-3 shrink-0">
              {/* Search input */}
              <div className="relative w-full sm:w-60">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder={t('cv.searchPlaceholder', 'Tìm kiếm mẫu CV...')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-10 w-full rounded-full border border-slate-200 bg-white pl-9 pr-4 text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-800 dark:bg-slate-900 dark:text-white shadow-xs"
                />
              </div>

              {/* Language Selector Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsLangDropdownOpen((prev) => !prev)}
                  className="flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-xs sm:text-sm font-bold text-slate-800 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 shadow-xs cursor-pointer"
                >
                  <span className="text-base">{selectedLanguage === 'vi' ? '🇻🇳' : '🇬🇧'}</span>
                  <span>{selectedLanguage === 'vi' ? t('cv.langVi', 'Tiếng Việt') : t('cv.langEn', 'Tiếng Anh')}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                </button>

                {isLangDropdownOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-40 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-800 dark:bg-slate-900 z-30">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedLanguage('vi');
                        setIsLangDropdownOpen(false);
                      }}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-bold transition cursor-pointer ${
                        selectedLanguage === 'vi'
                          ? 'bg-primary/10 text-primary dark:bg-primary/20'
                          : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className="text-base">🇻🇳</span>
                      <span>{t('cv.langVi', 'Tiếng Việt')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedLanguage('en');
                        setIsLangDropdownOpen(false);
                      }}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-bold transition cursor-pointer ${
                        selectedLanguage === 'en'
                          ? 'bg-primary/10 text-primary dark:bg-primary/20'
                          : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className="text-base">🇬🇧</span>
                      <span>{t('cv.langEn', 'Tiếng Anh')}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 4. Templates Grid: EXACTLY 3 CVs PER ROW (Matches user screenshot) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-7">
            {filteredTemplates.map((template, index) => {
              const activeColor = selectedColorMap[String(index)] || template.colors[0] || '#2563EB';

              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: index * 0.05 }}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm transition-all hover:border-primary/50 hover:shadow-xl dark:border-slate-800/90 dark:bg-slate-900"
                >
                  {/* Template Live Thumbnail Preview Container */}
                  <div className="relative aspect-[210/297] w-full overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-950">
                    <div className="pointer-events-none absolute inset-0 flex justify-center overflow-hidden">
                      <div className="w-[210mm] scale-[0.40] sm:scale-[0.42] md:scale-[0.44] lg:scale-[0.43] origin-top">
                        <CVPreviewCanvas
                          data={{
                            ...SAMPLE_PREVIEW_DATA,
                            templateType: template.id,
                          }}
                          cvLanguage={selectedLanguage}
                          fontFamilyId={template.id === 'template1' ? 'times' : 'inter'}
                          themeColorId={
                            activeColor === '#0F172A'
                              ? 'midnight-slate'
                              : activeColor === '#0D9488'
                              ? 'emerald-teal'
                              : activeColor === '#4F46E5'
                              ? 'indigo-purple'
                              : activeColor === '#991B1B' || activeColor === '#DC2626'
                              ? 'deep-ruby'
                              : 'primary-blue'
                          }
                          isPremium={true}
                        />
                      </div>
                    </div>

                    {/* Hover Overlay with Action Button */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/65 p-6 opacity-0 backdrop-blur-[2px] transition-all duration-200 group-hover:opacity-100">
                      {template.isPremium && !isUserPremium ? (
                        <button
                          type="button"
                          onClick={() => handleUseTemplate(template)}
                          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-3 text-xs sm:text-sm font-extrabold text-white shadow-2xl shadow-amber-500/40 transition hover:from-amber-600 hover:to-amber-700 hover:scale-105 active:scale-95 cursor-pointer"
                        >
                          <Crown className="h-4 w-4" />
                          <span>Mở Khóa Premium Để Dùng</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleUseTemplate(template)}
                          className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-xs sm:text-sm font-extrabold text-white shadow-2xl shadow-primary/40 transition hover:bg-primary-dark hover:scale-105 active:scale-95 cursor-pointer"
                        >
                          <FileText className="h-4 w-4" />
                          <span>{t('cv.useTemplateBtn', 'Dùng mẫu này')}</span>
                        </button>
                      )}
                      <p className="mt-2 text-[11px] font-semibold text-white/80 text-center">
                        {template.isPremium && !isUserPremium
                          ? 'Đặc quyền gói Candidate Premium'
                          : t('cv.editInBrowser', 'Chỉnh sửa trực tiếp trên trình duyệt')}
                      </p>
                    </div>
                  </div>

                  {/* Card Bottom Meta (Color Dots, Title, Tags matching screenshot) */}
                  <div className="mt-3.5 flex flex-col flex-1 justify-between">
                    {/* Color Swatch Dots & VIP Badge */}
                    <div className="flex items-center justify-between gap-1.5 mb-2">
                      <div className="flex items-center gap-1.5">
                        {template.colors.map((color, cIdx) => (
                          <button
                            key={cIdx}
                            type="button"
                            onClick={() =>
                              setSelectedColorMap((prev) => ({
                                ...prev,
                                [String(index)]: color,
                              }))
                            }
                            className={`h-4.5 w-4.5 rounded-full transition-all cursor-pointer ${
                              activeColor === color
                                ? 'ring-2 ring-primary ring-offset-2 scale-110'
                                : 'hover:scale-110 opacity-75 hover:opacity-100'
                            }`}
                            style={{ backgroundColor: color }}
                            aria-label={`Color ${color}`}
                          />
                        ))}
                      </div>

                      {template.isPremium && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-black text-amber-700 dark:text-amber-300 shadow-xs">
                          <Crown className="h-3 w-3" /> PREMIUM
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <h3 className="text-base font-extrabold text-slate-900 dark:text-white group-hover:text-primary transition-colors leading-snug">
                      {template.title}
                    </h3>

                    {/* Tag Badges */}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {template.tags.map((tag, tIdx) => (
                        <span
                          key={tIdx}
                          className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </main>

      <Footer />

      {/* Mobile restriction notice modal */}
      <MobileNoticeModal
        isOpen={isMobileNoticeOpen}
        onClose={() => setIsMobileNoticeOpen(false)}
      />
    </div>
  );
}
