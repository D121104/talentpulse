import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { UserCircle, Search, BrainCircuit, ClipboardList, SlidersHorizontal, CheckCircle } from 'lucide-react';

const candidateIcons = [UserCircle, Search, BrainCircuit];
const employerIcons = [ClipboardList, SlidersHorizontal, CheckCircle];

export default function HowItWorks() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'candidate' | 'employer'>('candidate');

  const steps = activeTab === 'candidate'
    ? ['step1', 'step2', 'step3'].map((s, i) => ({
        icon: candidateIcons[i],
        title: t(`howItWorks.candidate.${s}.title`),
        desc: t(`howItWorks.candidate.${s}.desc`),
      }))
    : ['step1', 'step2', 'step3'].map((s, i) => ({
        icon: employerIcons[i],
        title: t(`howItWorks.employer.${s}.title`),
        desc: t(`howItWorks.employer.${s}.desc`),
      }));

  return (
    <section className="bg-white dark:bg-slate-950 py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="text-center max-w-2xl mx-auto mb-12"
        >
          <span className="inline-flex items-center rounded-full bg-primary/10 dark:bg-primary/20 px-4 py-1.5 text-xs font-bold text-primary uppercase tracking-wider mb-4 border border-primary/10">
            {t('howItWorks.badge')}
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight">
            {t('howItWorks.title')}{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">
              {t('howItWorks.titleHighlight')}
            </span>{' '}
            {t('howItWorks.titleSuffix')}
          </h2>
        </motion.div>

        {/* Tab Switcher */}
        <div className="flex justify-center mb-12">
          <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-gray-200/60 dark:border-slate-700">
            {(['candidate', 'employer'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-2.5 text-sm font-semibold rounded-lg transition-all duration-300 cursor-pointer ${
                  activeTab === tab
                    ? 'bg-white dark:bg-slate-700 text-primary shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {tab === 'candidate' ? t('howItWorks.tabCandidate') : t('howItWorks.tabEmployer')}
              </button>
            ))}
          </div>
        </div>

        {/* Steps */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8"
          >
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <div
                  key={i}
                  className="group relative flex flex-col items-center text-center p-8 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-gray-200/60 dark:border-slate-700/60 hover:border-primary/30 hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
                >
                  {/* Step Number */}
                  <div className="absolute -top-3 left-6 px-3 py-1 rounded-full bg-primary text-white text-xs font-bold shadow-sm shadow-primary/25">
                    {i + 1}
                  </div>

                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/10 to-accent/10 dark:from-primary/20 dark:to-accent/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                    <Icon className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-3">{step.title}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{step.desc}</p>
                </div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
