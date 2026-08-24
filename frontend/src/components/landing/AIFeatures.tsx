import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { MessageSquareText, BarChart3, Sparkles } from 'lucide-react';

export default function AIFeatures() {
  const { t } = useTranslation();

  return (
    <section id="ai-features" className="bg-slate-50 dark:bg-slate-900 py-20 lg:py-28 overflow-hidden relative">
      {/* Subtle glow */}
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-radial from-primary/5 to-transparent rounded-full blur-3xl" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="text-center max-w-3xl mx-auto mb-14"
        >
          <span className="inline-flex items-center rounded-full bg-primary/10 dark:bg-primary/20 px-4 py-1.5 text-xs font-bold text-primary uppercase tracking-wider mb-4 border border-primary/10">
            {t('aiFeatures.badge')}
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight">
            {t('aiFeatures.title')}{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">
              {t('aiFeatures.titleHighlight')}
            </span>
          </h2>
        </motion.div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6">
          {/* Feature 1 — Large Card */}
          <motion.div
            initial={{ opacity: 0, y: 30, filter: 'blur(6px)' }}
            whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-7 group"
          >
            <div className="relative flex flex-col h-full rounded-[24px] border border-gray-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-800/60 shadow-sm overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-500">
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative z-10 p-8 lg:p-10 flex-1 flex flex-col">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/15 to-accent/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <MessageSquareText className="w-6 h-6 text-primary" />
                  </div>
                  <span className="px-3 py-1 rounded-full bg-primary/10 text-xs font-bold text-primary">{t('aiFeatures.feature1.tag')}</span>
                </div>
                <h3 className="text-xl lg:text-2xl font-bold text-slate-800 dark:text-white mb-3">{t('aiFeatures.feature1.title')}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-6">{t('aiFeatures.feature1.desc')}</p>

                {/* Chat UI Preview */}
                <div className="mt-auto rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-gray-100 dark:border-slate-700 p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                      <Sparkles className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-xl rounded-tl-sm px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300 border border-gray-100 dark:border-slate-700">
                      CV của bạn phù hợp 85% với vị trí Frontend Developer. Bạn nên bổ sung kỹ năng TypeScript và Next.js.
                    </div>
                  </div>
                  <div className="flex items-start gap-3 flex-row-reverse">
                    <div className="w-7 h-7 rounded-full bg-accent/15 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-accent">U</span>
                    </div>
                    <div className="bg-primary/10 dark:bg-primary/20 rounded-xl rounded-tr-sm px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200">
                      Gợi ý thêm cách cải thiện CV phần kinh nghiệm làm việc?
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Feature 2 & 3 — Stacked */}
          <div className="lg:col-span-5 flex flex-col gap-5 lg:gap-6">
            {/* Feature 2 */}
            <motion.div
              initial={{ opacity: 0, y: 30, filter: 'blur(6px)' }}
              whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
              className="group flex-1"
            >
              <div className="relative flex flex-col h-full rounded-[24px] border border-gray-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-800/60 shadow-sm overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-500">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative z-10 p-8 flex-1 flex flex-col">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent/15 to-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      <BarChart3 className="w-6 h-6 text-accent" />
                    </div>
                    <span className="px-3 py-1 rounded-full bg-accent/10 text-xs font-bold text-accent">{t('aiFeatures.feature2.tag')}</span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2">{t('aiFeatures.feature2.title')}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{t('aiFeatures.feature2.desc')}</p>

                  {/* Score Bars */}
                  <div className="mt-auto pt-4 space-y-2.5">
                    {[{ label: 'Skills Match', value: 92 }, { label: 'Experience', value: 78 }, { label: 'Overall Fit', value: 85 }].map((item) => (
                      <div key={item.label} className="flex items-center gap-3">
                        <span className="text-xs text-slate-500 dark:text-slate-400 w-24 shrink-0">{item.label}</span>
                        <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
                            style={{ width: `${item.value}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-primary w-8">{item.value}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Feature 3 */}
            <motion.div
              initial={{ opacity: 0, y: 30, filter: 'blur(6px)' }}
              whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="group flex-1"
            >
              <div className="relative flex flex-col h-full rounded-[24px] border border-gray-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-800/60 shadow-sm overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-500">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative z-10 p-8 flex-1 flex flex-col">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/15 to-accent/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      <Sparkles className="w-6 h-6 text-primary" />
                    </div>
                    <span className="px-3 py-1 rounded-full bg-primary/10 text-xs font-bold text-primary">{t('aiFeatures.feature3.tag')}</span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2">{t('aiFeatures.feature3.title')}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{t('aiFeatures.feature3.desc')}</p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
