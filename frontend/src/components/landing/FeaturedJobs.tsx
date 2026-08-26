import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { MapPin, Clock, Flame, ArrowRight } from 'lucide-react';

const mockJobs = [
  { title: 'Senior Frontend Developer', company: 'FPT Software', logo: 'F', location: 'Hà Nội', salary: '25 - 40 triệu', tags: ['React', 'TypeScript'], hot: true, days: 2 },
  { title: 'Product Manager', company: 'VNG Corporation', logo: 'V', location: 'TP. Hồ Chí Minh', salary: '30 - 50 triệu', tags: ['Agile', 'SaaS'], hot: true, days: 1 },
  { title: 'Data Engineer', company: 'Tiki', logo: 'T', location: 'TP. Hồ Chí Minh', salary: '20 - 35 triệu', tags: ['Python', 'Spark'], hot: false, days: 3 },
  { title: 'UX/UI Designer', company: 'Momo', logo: 'M', location: 'TP. Hồ Chí Minh', salary: '18 - 30 triệu', tags: ['Figma', 'Design System'], hot: false, days: 5 },
  { title: 'DevOps Engineer', company: 'VinGroup', logo: 'VG', location: 'Hà Nội', salary: '25 - 45 triệu', tags: ['AWS', 'K8s'], hot: true, days: 1 },
  { title: 'Marketing Specialist', company: 'Shopee', logo: 'S', location: 'TP. Hồ Chí Minh', salary: '15 - 25 triệu', tags: ['SEO', 'Content'], hot: false, days: 4 },
];

export default function FeaturedJobs() {
  const { t } = useTranslation();

  return (
    <section id="featured-jobs" className="bg-white dark:bg-slate-950 py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col sm:flex-row items-start sm:items-end justify-between mb-12 gap-4"
        >
          <div>
            <span className="inline-flex items-center rounded-full bg-primary/10 dark:bg-primary/20 px-4 py-1.5 text-xs font-bold text-primary uppercase tracking-wider mb-4 border border-primary/10">
              {t('featuredJobs.badge')}
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight">
              {t('featuredJobs.title')}{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">
                {t('featuredJobs.titleHighlight')}
              </span>{' '}
              {t('featuredJobs.titleSuffix')}
            </h2>
          </div>
          <a href="#" className="flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary-dark transition-colors cursor-pointer group whitespace-nowrap">
            {t('featuredJobs.viewAll')}
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </a>
        </motion.div>

        {/* Jobs Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {mockJobs.map((job, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20, filter: 'blur(6px)' }}
              whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.5, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
            >
              <a
                href="#"
                className="group relative flex flex-col p-6 rounded-2xl bg-white dark:bg-slate-800/60 border border-gray-200/60 dark:border-slate-700/60 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer overflow-hidden h-full"
              >
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                <div className="relative z-10">
                  {/* Top Row */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/15 to-accent/10 flex items-center justify-center text-sm font-bold text-primary">
                        {job.logo}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{job.company}</p>
                      </div>
                    </div>
                    {job.hot && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gradient-to-r from-red-500 to-amber-500 text-white font-extrabold text-xs shadow-md shadow-red-500/25 animate-pulse tracking-wide select-none">
                        <Flame className="w-3.5 h-3.5 fill-white" />
                        <span>{t('featuredJobs.hot')} TOP</span>
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <h3 className="text-base font-bold text-slate-800 dark:text-white mb-3 group-hover:text-primary transition-colors">
                    {job.title}
                  </h3>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {job.tags.map((tag) => (
                      <span key={tag} className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-700/60 text-xs font-medium text-slate-600 dark:text-slate-300">
                        {tag}
                      </span>
                    ))}
                  </div>

                  {/* Meta */}
                  <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 mt-auto">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" /> {job.location}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> {job.days} {t('featuredJobs.daysAgo')}
                    </span>
                  </div>

                  {/* Salary */}
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-700 flex items-center justify-between">
                    <span className="text-sm font-bold text-primary">{job.salary}</span>
                    <span className="text-xs font-semibold text-primary opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
                      {t('featuredJobs.applyNow')} <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              </a>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
