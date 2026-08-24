import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Monitor, Megaphone, Landmark, Palette, TrendingUp, Users, HeartPulse, HardHat, ArrowRight } from 'lucide-react';

const icons = [Monitor, Megaphone, Landmark, Palette, TrendingUp, Users, HeartPulse, HardHat];
const keys = ['it', 'marketing', 'finance', 'design', 'sales', 'hr', 'healthcare', 'engineering'] as const;
const colors = [
  'from-blue-500/10 to-blue-600/5 text-blue-600 dark:text-blue-400',
  'from-pink-500/10 to-pink-600/5 text-pink-600 dark:text-pink-400',
  'from-emerald-500/10 to-emerald-600/5 text-emerald-600 dark:text-emerald-400',
  'from-purple-500/10 to-purple-600/5 text-purple-600 dark:text-purple-400',
  'from-orange-500/10 to-orange-600/5 text-orange-600 dark:text-orange-400',
  'from-cyan-500/10 to-cyan-600/5 text-cyan-600 dark:text-cyan-400',
  'from-rose-500/10 to-rose-600/5 text-rose-600 dark:text-rose-400',
  'from-amber-500/10 to-amber-600/5 text-amber-600 dark:text-amber-400',
];

export default function JobCategories() {
  const { t } = useTranslation();

  return (
    <section id="categories" className="bg-slate-50 dark:bg-slate-900 py-20 lg:py-28 overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="text-center max-w-2xl mx-auto mb-14"
        >
          <span className="inline-flex items-center rounded-full bg-primary/10 dark:bg-primary/20 px-4 py-1.5 text-xs font-bold text-primary uppercase tracking-wider mb-4 border border-primary/10">
            {t('categories.badge')}
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight">
            {t('categories.title')}{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">
              {t('categories.titleHighlight')}
            </span>{' '}
            {t('categories.titleSuffix')}
          </h2>
        </motion.div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
          {keys.map((key, i) => {
            const Icon = icons[i];
            return (
              <motion.div
                key={key}
                initial={{ opacity: 0, y: 20, filter: 'blur(6px)' }}
                whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.5, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
              >
                <a
                  href="#"
                  className="group relative flex flex-col items-start p-6 rounded-2xl bg-white dark:bg-slate-800/60 border border-gray-200/60 dark:border-slate-700/60 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer overflow-hidden"
                >
                  {/* Hover Spotlight */}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                  <div className={`relative z-10 w-12 h-12 rounded-2xl bg-gradient-to-br ${colors[i]} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="relative z-10 text-base font-bold text-slate-800 dark:text-white mb-1">
                    {t(`categories.items.${key}.name`)}
                  </h3>
                  <p className="relative z-10 text-sm text-slate-500 dark:text-slate-400">
                    {t(`categories.items.${key}.count`)}
                  </p>
                  <ArrowRight className="relative z-10 w-4 h-4 text-primary mt-3 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
                </a>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
