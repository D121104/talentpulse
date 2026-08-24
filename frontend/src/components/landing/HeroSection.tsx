import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Search, MapPin } from 'lucide-react';

export default function HeroSection() {
  const { t } = useTranslation();

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

          {/* 3D Perspective Dashboard Mockup */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="mt-16 lg:mt-20 w-full max-w-[1000px] relative z-10 mx-auto"
            style={{ perspective: '2000px' }}
          >
            <div
              className="w-full origin-bottom transition-all duration-700"
              style={{
                transformStyle: 'preserve-3d',
                transform: 'translateY(20px) scale(0.96) rotateX(16deg) rotateZ(-3deg)',
              }}
            >
              <div className="relative w-full rounded-[20px] bg-white dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 shadow-[0_25px_70px_-15px_rgba(0,0,0,0.15)] dark:shadow-[0_25px_70px_-15px_rgba(0,0,0,0.5)] overflow-hidden">
                {/* Safari Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-slate-700 bg-gray-50/80 dark:bg-slate-800/80">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-400" />
                    <div className="w-3 h-3 rounded-full bg-amber-400" />
                    <div className="w-3 h-3 rounded-full bg-emerald-400" />
                  </div>
                  <div className="flex items-center gap-2 px-6 py-1 rounded-full bg-white dark:bg-slate-900 border border-gray-200/60 dark:border-slate-700 text-xs text-slate-500 font-mono">
                    <span>talentpulse.app/dashboard</span>
                  </div>
                  <div className="w-10" />
                </div>

                {/* Mock Dashboard Content */}
                <div className="p-6 space-y-4 bg-slate-50 dark:bg-slate-900">
                  {/* Top bar */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/10" />
                      <div className="h-3 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-20 bg-primary/10 rounded-lg" />
                      <div className="h-8 w-8 bg-slate-200 dark:bg-slate-700 rounded-lg" />
                    </div>
                  </div>
                  {/* Stat Cards */}
                  <div className="grid grid-cols-4 gap-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="rounded-xl bg-white dark:bg-slate-800 p-4 border border-gray-100 dark:border-slate-700">
                        <div className="h-2.5 w-16 bg-slate-200 dark:bg-slate-700 rounded mb-3" />
                        <div className="h-5 w-12 bg-primary/15 rounded" />
                      </div>
                    ))}
                  </div>
                  {/* Chart placeholder */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2 rounded-xl bg-white dark:bg-slate-800 p-4 h-32 border border-gray-100 dark:border-slate-700">
                      <div className="h-2.5 w-24 bg-slate-200 dark:bg-slate-700 rounded mb-4" />
                      <div className="flex items-end gap-2 h-16">
                        {[40, 65, 45, 80, 55, 90, 70, 85, 60, 75].map((h, i) => (
                          <div key={i} className="flex-1 bg-primary/20 dark:bg-primary/30 rounded-t" style={{ height: `${h}%` }} />
                        ))}
                      </div>
                    </div>
                    <div className="rounded-xl bg-white dark:bg-slate-800 p-4 h-32 border border-gray-100 dark:border-slate-700">
                      <div className="h-2.5 w-20 bg-slate-200 dark:bg-slate-700 rounded mb-4" />
                      <div className="flex items-center justify-center h-16">
                        <div className="w-16 h-16 rounded-full border-4 border-primary/30 border-t-primary" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
