import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import { Search, MapPin, ChevronLeft, ChevronRight, Maximize2, X } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

export default function HeroSection() {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const [currentSlide, setCurrentSlide] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const mockupRef = useRef<HTMLDivElement>(null);

  // Scroll-driven animation: smooth scale-down & fade-out as user scrolls past the mockup
  const { scrollYProgress } = useScroll({
    target: mockupRef,
    offset: ['start 75%', 'end 10%'],
  });

  const scale = useTransform(scrollYProgress, [0, 0.55, 1], [1, 0.94, 0.72]);
  const opacity = useTransform(scrollYProgress, [0, 0.7, 1], [1, 0.85, 0]);
  const y = useTransform(scrollYProgress, [0, 1], [0, 50]);

  const slides = [
    {
      id: 0,
      title: 'Dashboard Thống kê Tuyển dụng',
      url: 'talentpulse.app/dashboard',
      darkImg: '/images/dashboard-dark.png',
      lightImg: '/images/dashboard-light.png',
    },
    {
      id: 1,
      title: 'Quản lý Ứng viên & AI Matching',
      url: 'talentpulse.app/candidates',
      darkImg: '/images/dashboard1-dark.png',
      lightImg: '/images/dasboard1-light.png',
    },
  ];

  // Preload all slide images for both light & dark modes to prevent any flicker
  useEffect(() => {
    slides.forEach((s) => {
      const imgDark = new Image();
      imgDark.src = s.darkImg;
      const imgLight = new Image();
      imgLight.src = s.lightImg;
    });
  }, []);

  // Auto slide transition every 4.5 seconds (pauses on hover or when preview is open)
  useEffect(() => {
    if (isHovered || isPreviewOpen) return;
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 4500);

    return () => clearInterval(timer);
  }, [isHovered, isPreviewOpen, slides.length]);

  // Keyboard navigation for preview modal (ESC to close, Left/Right arrow keys to switch)
  useEffect(() => {
    if (!isPreviewOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsPreviewOpen(false);
      } else if (e.key === 'ArrowLeft') {
        setCurrentSlide((prev) => (prev === 0 ? slides.length - 1 : prev - 1));
      } else if (e.key === 'ArrowRight') {
        setCurrentSlide((prev) => (prev + 1) % slides.length);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPreviewOpen, slides.length]);

  const activeSlide = slides[currentSlide];

  return (
    <section className="relative flex min-h-screen w-full flex-col items-center pt-28 pb-16 lg:pt-36 overflow-hidden bg-white dark:bg-slate-950">
      {/* Perspective Grid Background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden perspective-grid z-0 opacity-40 dark:opacity-30">
        <div className="absolute inset-0 perspective-grid-inner">
          <div className="grid-lines h-[300vh] w-[200vw] -ml-[50%]" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-white via-white/60 to-transparent dark:from-slate-950 dark:via-slate-950/60" />
      </div>

      {/* Radial Glow */}
      <div className="pointer-events-none absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-gradient-radial from-primary/8 via-accent/4 to-transparent rounded-full blur-3xl z-0" />

      <div className="relative z-10 flex w-full flex-col items-center px-4">
        <div className="mx-auto max-w-4xl text-center flex flex-col items-center w-full">
          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 30, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-[1.1]"
          >
            {t('hero.headline')}{' '}
            <span
              className="animate-aurora py-1"
              style={{
                backgroundImage: 'linear-gradient(to right, #2563EB, #06B6D4, #3B82F6, #2563EB, #2563EB)',
              }}
            >
              {t('hero.headlineHighlight')}
            </span>{' '}
            {t('hero.headlineSuffix')}
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="mt-6 text-lg lg:text-xl text-slate-500 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed"
          >
            {t('hero.subtitle')}{' '}
            <span className="font-semibold text-slate-700 dark:text-slate-200">{t('hero.subtitleBold')}</span>{' '}
            {t('hero.subtitleMid')}{' '}
            <span className="font-semibold text-slate-700 dark:text-slate-200">{t('hero.subtitleBold2')}</span>{' '}
            {t('hero.subtitleEnd')}
          </motion.p>

          {/* Search Bar */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="mt-10 w-full max-w-2xl"
          >
            <div className="flex flex-col sm:flex-row items-stretch bg-white dark:bg-slate-800 rounded-2xl border border-gray-200/80 dark:border-slate-700 shadow-xl shadow-slate-900/5 dark:shadow-black/20 p-2 gap-2">
              <div className="flex items-center gap-2 flex-1 px-3">
                <Search className="w-5 h-5 text-slate-400 shrink-0" />
                <input
                  type="text"
                  placeholder={t('hero.searchPlaceholder')}
                  className="w-full py-2.5 text-sm bg-transparent text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none"
                />
              </div>
              <div className="hidden sm:block w-px bg-gray-200 dark:bg-slate-700 my-2" />
              <div className="flex items-center gap-2 px-3 sm:w-44">
                <MapPin className="w-5 h-5 text-slate-400 shrink-0" />
                <select className="w-full py-2.5 text-sm bg-transparent text-slate-700 dark:text-slate-200 outline-none appearance-none cursor-pointer">
                  <option>{t('hero.locationPlaceholder')}</option>
                  <option>Hà Nội</option>
                  <option>TP. Hồ Chí Minh</option>
                  <option>Đà Nẵng</option>
                </select>
              </div>
              <button className="px-6 py-3 bg-primary hover:bg-primary-dark text-white text-sm font-semibold rounded-xl transition-all duration-300 active:scale-95 shadow-sm shadow-primary/25 hover:shadow-md hover:shadow-primary/30 cursor-pointer whitespace-nowrap">
                {t('hero.searchBtn')}
              </button>
            </div>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="mt-10 flex flex-wrap items-center justify-center gap-8 sm:gap-16"
          >
            {[
              { value: t('hero.stat1'), label: t('hero.stat1Label') },
              { value: t('hero.stat2'), label: t('hero.stat2Label') },
              { value: t('hero.stat3'), label: t('hero.stat3Label') },
            ].map((stat) => (
              <div key={stat.label} className="flex flex-col items-center gap-1">
                <span className="text-2xl sm:text-3xl font-extrabold text-primary tracking-tight">{stat.value}</span>
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{stat.label}</span>
              </div>
            ))}
          </motion.div>

          {/* Upright Dashboard Slider Mockup with Scroll-Driven Scale-Down & Fade-Out */}
          <div ref={mockupRef} className="mt-14 lg:mt-18 w-full max-w-[1100px] relative z-10 mx-auto">
            <motion.div
              style={{ scale, opacity, y }}
              className="w-full origin-top transition-shadow duration-300"
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
            >
              <div className="relative w-full rounded-[22px] sm:rounded-[26px] bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.18)] dark:shadow-[0_25px_80px_-15px_rgba(0,0,0,0.65)] overflow-hidden">
                {/* Window Header */}
                <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-3.5 border-b border-slate-200/80 dark:border-slate-800 bg-slate-100/95 dark:bg-slate-900/95 backdrop-blur-md">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-rose-500/90 shadow-xs" />
                    <div className="w-3 h-3 rounded-full bg-amber-500/90 shadow-xs" />
                    <div className="w-3 h-3 rounded-full bg-emerald-500/90 shadow-xs" />
                  </div>

                  {/* Browser URL Bar with animated URL text */}
                  <div className="flex items-center gap-2 px-4 sm:px-6 py-1 rounded-full bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 text-xs text-slate-600 dark:text-slate-300 font-mono shadow-inner">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={activeSlide.url}
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                        transition={{ duration: 0.2 }}
                      >
                        {activeSlide.url}
                      </motion.span>
                    </AnimatePresence>
                  </div>

                  {/* Slide Name Badge + Click to Zoom hint */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsPreviewOpen(true)}
                      className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-primary/10 hover:bg-primary/20 px-3 py-1 text-xs font-bold text-primary dark:text-primary-light transition cursor-pointer"
                      title="Click để phóng to xem toàn diện"
                    >
                      <Maximize2 className="h-3 w-3" />
                      <span>Xem toàn màn hình</span>
                    </button>
                  </div>
                </div>

                {/* Slider Image Screen with Layered Crossfade (Zero Flicker / Zero Layout Shift) */}
                <div
                  onClick={() => setIsPreviewOpen(true)}
                  className="group relative w-full bg-slate-900 overflow-hidden cursor-zoom-in select-none"
                >
                  {slides.map((slide, index) => {
                    const isCurrent = currentSlide === index;
                    const imgSrc = theme === 'dark' ? slide.darkImg : slide.lightImg;
                    return (
                      <motion.img
                        key={slide.id}
                        src={imgSrc}
                        alt={slide.title}
                        initial={false}
                        animate={{
                          opacity: isCurrent ? 1 : 0,
                        }}
                        transition={{ duration: 0.45, ease: 'easeInOut' }}
                        className={`w-full h-auto block select-none pointer-events-none ${
                          index > 0 ? 'absolute inset-0' : 'relative'
                        }`}
                      />
                    );
                  })}

                  {/* Hover Overlay Hint */}
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/15 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <span className="inline-flex items-center gap-2 rounded-2xl bg-slate-900/85 px-4 py-2 text-xs font-bold text-white shadow-xl backdrop-blur-md border border-white/10">
                      <Maximize2 className="h-3.5 w-3.5" />
                      <span>Click để xem ảnh toàn diện</span>
                    </span>
                  </div>

                  {/* Subtle Left / Right Navigation Chevrons on Hover */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentSlide((prev) => (prev === 0 ? slides.length - 1 : prev - 1));
                    }}
                    aria-label="Previous Slide"
                    className="absolute left-3 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-slate-900/75 text-white backdrop-blur-md border border-white/15 opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110 active:scale-95 cursor-pointer z-20"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentSlide((prev) => (prev + 1) % slides.length);
                    }}
                    aria-label="Next Slide"
                    className="absolute right-3 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-slate-900/75 text-white backdrop-blur-md border border-white/15 opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110 active:scale-95 cursor-pointer z-20"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* 2 Navigation Dots (Pill & Dot indicators) */}
              <div className="mt-6 flex items-center justify-center gap-2.5">
                {slides.map((slide, index) => {
                  const isActive = currentSlide === index;
                  return (
                    <button
                      key={slide.id}
                      type="button"
                      onClick={() => setCurrentSlide(index)}
                      aria-label={`Chuyển đến màn hình ${index + 1}: ${slide.title}`}
                      className={`transition-all duration-300 rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                        isActive
                          ? 'w-8 h-2.5 bg-primary shadow-md shadow-primary/30'
                          : 'w-2.5 h-2.5 bg-slate-300 dark:bg-slate-700 hover:bg-slate-400 dark:hover:bg-slate-600'
                      }`}
                    />
                  );
                })}
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* FULL-SCREEN LIGHTBOX PREVIEW MODAL                                        */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {isPreviewOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsPreviewOpen(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-3 sm:p-6 cursor-zoom-out"
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-6xl w-full max-h-[92vh] flex flex-col rounded-2xl overflow-hidden bg-slate-900 border border-slate-700/80 shadow-2xl cursor-default"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 bg-slate-900/95 border-b border-slate-800 text-white">
                <div className="flex items-center gap-3">
                  <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-bold text-sm text-slate-100">{activeSlide.title}</span>
                  <span className="text-xs text-slate-400 font-mono hidden sm:inline">({activeSlide.url})</span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 hidden md:inline">
                    Click ngoài hoặc nhấn ESC để đóng
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsPreviewOpen(false)}
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition cursor-pointer"
                  >
                    <X className="w-4.5 h-4.5" />
                  </button>
                </div>
              </div>

              {/* Modal Image Display with Layered Smooth Crossfade */}
              <div className="relative flex-1 min-h-[350px] max-h-[78vh] overflow-hidden bg-slate-950 p-2 sm:p-4 flex items-center justify-center">
                {slides.map((slide, index) => {
                  const isCurrent = currentSlide === index;
                  const imgSrc = theme === 'dark' ? slide.darkImg : slide.lightImg;
                  return (
                    <motion.img
                      key={`modal-${slide.id}`}
                      src={imgSrc}
                      alt={slide.title}
                      initial={false}
                      animate={{
                        opacity: isCurrent ? 1 : 0,
                      }}
                      transition={{ duration: 0.35, ease: 'easeInOut' }}
                      className={`max-h-[75vh] w-auto max-w-full object-contain rounded-xl shadow-2xl select-none pointer-events-none ${
                        index > 0 ? 'absolute' : 'relative'
                      }`}
                    />
                  );
                })}

                {/* Left/Right Buttons inside Lightbox */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentSlide((prev) => (prev === 0 ? slides.length - 1 : prev - 1));
                  }}
                  className="absolute left-4 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-slate-900/85 text-white backdrop-blur-md border border-white/20 hover:bg-primary transition hover:scale-110 active:scale-95 cursor-pointer shadow-xl z-20"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentSlide((prev) => (prev + 1) % slides.length);
                  }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-slate-900/85 text-white backdrop-blur-md border border-white/20 hover:bg-primary transition hover:scale-110 active:scale-95 cursor-pointer shadow-xl z-20"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </div>

              {/* Modal Footer with Slide Selector */}
              <div className="flex items-center justify-center gap-3 py-3 bg-slate-900/95 border-t border-slate-800">
                {slides.map((slide, index) => (
                  <button
                    key={slide.id}
                    type="button"
                    onClick={() => setCurrentSlide(index)}
                    className={`transition-all duration-300 rounded-full cursor-pointer ${
                      currentSlide === index
                        ? 'w-8 h-2 bg-primary shadow-md shadow-primary/40'
                        : 'w-2 h-2 bg-slate-600 hover:bg-slate-400'
                    }`}
                  />
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
