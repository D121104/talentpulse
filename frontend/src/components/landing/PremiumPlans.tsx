import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Check, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { paymentApi } from '../../lib/paymentApi';
import { AdminPackageItem } from '../../lib/adminApi';

export default function PremiumPlans() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { status } = useAuth();
  const [packages, setPackages] = useState<AdminPackageItem[]>([]);

  useEffect(() => {
    let mounted = true;
    paymentApi
      .getPublicPackages()
      .then((data) => {
        if (mounted && Array.isArray(data) && data.length > 0) {
          setPackages(data);
        }
      })
      .catch((err) => {
        console.warn('Could not fetch dynamic packages for landing page, using fallback', err);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Find monthly packages (or primary packages) from DB
  const candidatePkg =
    packages.find((p) => p.planType === 'CANDIDATE_PREMIUM' && p.billingCycle === 'monthly') ||
    packages.find((p) => p.planType === 'CANDIDATE_PREMIUM');

  const hrPkg =
    packages.find((p) => p.planType === 'HR_PREMIUM' && p.billingCycle === 'monthly') ||
    packages.find((p) => p.planType === 'HR_PREMIUM');

  const candidateFeatures: string[] =
    candidatePkg?.features && candidatePkg.features.length > 0
      ? candidatePkg.features
      : (t('premium.candidate.features', { returnObjects: true }) as string[]);

  const hrFeatures: string[] =
    hrPkg?.features && hrPkg.features.length > 0
      ? hrPkg.features
      : (t('premium.hr.features', { returnObjects: true }) as string[]);

  const candidatePriceText = candidatePkg
    ? `${candidatePkg.price.toLocaleString('vi-VN')}đ`
    : t('premium.candidate.price');

  const hrPriceText = hrPkg
    ? `${hrPkg.price.toLocaleString('vi-VN')}đ`
    : t('premium.hr.price');

  const candidatePeriodText = candidatePkg
    ? candidatePkg.billingCycle === 'annual'
      ? '/năm'
      : candidatePkg.billingCycle === 'semi_annual'
      ? '/6 tháng'
      : '/tháng'
    : t('premium.candidate.period');

  const hrPeriodText = hrPkg
    ? hrPkg.billingCycle === 'annual'
      ? '/năm'
      : hrPkg.billingCycle === 'semi_annual'
      ? '/6 tháng'
      : '/tháng'
    : t('premium.hr.period');

  const handleAction = (_target?: 'candidate' | 'hr') => {
    if (status !== 'authenticated') {
      navigate('/login');
      return;
    }
    navigate('/premium');
  };

  return (
    <section id="premium" className="bg-slate-50 dark:bg-slate-900 py-20 lg:py-28 overflow-hidden relative">
      <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-b from-primary/5 to-transparent rounded-full blur-3xl" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="text-center max-w-2xl mx-auto mb-14"
        >
          <span className="inline-flex items-center rounded-full bg-primary/10 dark:bg-primary/20 px-4 py-1.5 text-xs font-bold text-primary uppercase tracking-wider mb-4 border border-primary/10">
            {t('premium.badge')}
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight">
            {t('premium.title')}{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">
              {t('premium.titleHighlight')}
            </span>
          </h2>
        </motion.div>

        {/* Plans Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 max-w-4xl mx-auto">
          {/* Candidate Plan */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="group relative rounded-[24px] bg-white dark:bg-slate-800/60 border border-gray-200/60 dark:border-slate-700/60 p-8 shadow-sm hover:shadow-xl transition-all duration-500 overflow-hidden"
          >
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xl font-bold text-slate-800 dark:text-white">
                  {candidatePkg?.name || t('premium.candidate.title')}
                </h3>
                {candidatePkg?.badge && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary dark:bg-primary/20">
                    <Sparkles className="h-3 w-3" />
                    {candidatePkg.badge}
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                {candidatePkg?.description || t('premium.candidate.desc')}
              </p>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-4xl font-extrabold text-slate-900 dark:text-white">
                  {candidatePriceText}
                </span>
                <span className="text-sm text-slate-500">{candidatePeriodText}</span>
              </div>
              <ul className="space-y-3 mb-8">
                {candidateFeatures.map((feature, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="mt-0.5 w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 text-primary" />
                    </div>
                    <span className="text-sm text-slate-600 dark:text-slate-300">{feature}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => handleAction('candidate')}
                className="w-full py-3 text-sm font-semibold text-primary border-2 border-primary/30 hover:bg-primary hover:text-white rounded-xl transition-all duration-300 active:scale-95 cursor-pointer"
              >
                {t('premium.candidate.cta')}
              </button>
            </div>
          </motion.div>

          {/* HR Plan */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="group relative rounded-[24px] bg-gradient-to-br from-primary to-primary-dark text-white p-8 shadow-xl shadow-primary/20 hover:shadow-2xl hover:shadow-primary/30 transition-all duration-500 overflow-hidden"
          >
            {/* Popular badge */}
            <div className="absolute top-4 right-4 px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm text-xs font-bold">
              {hrPkg?.badge || 'Popular'}
            </div>
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent" />
            <div className="relative z-10">
              <h3 className="text-xl font-bold mb-2">
                {hrPkg?.name || t('premium.hr.title')}
              </h3>
              <p className="text-sm text-white/70 mb-6">
                {hrPkg?.description || t('premium.hr.desc')}
              </p>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-4xl font-extrabold">{hrPriceText}</span>
                <span className="text-sm text-white/60">{hrPeriodText}</span>
              </div>
              <ul className="space-y-3 mb-8">
                {hrFeatures.map((feature, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="mt-0.5 w-5 h-5 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                    <span className="text-sm text-white/90">{feature}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => handleAction('hr')}
                className="w-full py-3 text-sm font-semibold text-primary bg-white hover:bg-white/90 rounded-xl transition-all duration-300 active:scale-95 cursor-pointer shadow-sm"
              >
                {t('premium.hr.cta')}
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
