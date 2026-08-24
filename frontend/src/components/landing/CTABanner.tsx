import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ArrowRight, Briefcase } from 'lucide-react';

export default function CTABanner() {
  const { t } = useTranslation();

  return (
    <section className="bg-white dark:bg-slate-950 py-16 lg:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-primary via-primary-dark to-slate-900 p-10 lg:p-16 text-center"
        >
          {/* Background Pattern */}
          <div className="pointer-events-none absolute inset-0 opacity-10">
            <div className="absolute inset-0" style={{
              backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
              backgroundSize: '32px 32px',
            }} />
          </div>
          <div className="pointer-events-none absolute -top-20 -right-20 w-80 h-80 bg-accent/20 rounded-full blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-20 w-80 h-80 bg-primary-light/20 rounded-full blur-3xl" />

          <div className="relative z-10 max-w-2xl mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center mx-auto mb-6">
              <Briefcase className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight leading-tight mb-4">
              {t('cta.title')}
            </h2>
            <p className="text-base text-white/70 mb-8 max-w-lg mx-auto leading-relaxed">
              {t('cta.subtitle')}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href="/register"
                className="flex items-center gap-2 px-7 py-3.5 bg-white text-primary font-bold text-sm rounded-xl hover:bg-white/90 transition-all duration-300 active:scale-95 cursor-pointer shadow-lg shadow-black/10"
              >
                {t('cta.btnCandidate')}
                <ArrowRight className="w-4 h-4" />
              </a>
              <a
                href="/register?role=hr"
                className="flex items-center gap-2 px-7 py-3.5 bg-white/10 backdrop-blur-sm text-white font-bold text-sm rounded-xl border border-white/20 hover:bg-white/20 transition-all duration-300 active:scale-95 cursor-pointer"
              >
                {t('cta.btnEmployer')}
              </a>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
