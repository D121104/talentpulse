import { useTranslation } from 'react-i18next';

export default function Footer() {
  const { t } = useTranslation();

  const candidateLinks = t('footer.candidate.links', { returnObjects: true }) as string[];
  const employerLinks = t('footer.employer.links', { returnObjects: true }) as string[];
  const supportLinks = t('footer.support.links', { returnObjects: true }) as string[];

  return (
    <footer className="bg-slate-900 dark:bg-slate-950 text-white pt-16 pb-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 lg:gap-8 mb-12">
          {/* Brand Column */}
          <div className="lg:col-span-2">
            <a href="/" className="inline-block mb-4">
              <img src="/logo-darkmode.svg" alt="TalentPulse" className="h-11 sm:h-12 w-auto" />
            </a>
            <p className="text-slate-400 text-sm leading-relaxed max-w-xs">
              {t('footer.about.desc')}
            </p>
            <div className="flex items-center gap-3 mt-6">
              {['facebook', 'linkedin', 'twitter'].map((social) => (
                <a
                  key={social}
                  href="#"
                  className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-primary flex items-center justify-center transition-all duration-300 cursor-pointer"
                  aria-label={social}
                >
                  <svg className="w-4 h-4 text-slate-400 hover:text-white" fill="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" opacity="0.3" />
                  </svg>
                </a>
              ))}
            </div>
          </div>

          {/* Candidate Links */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-4">{t('footer.candidate.title')}</h4>
            <ul className="space-y-3">
              {candidateLinks.map((link, i) => (
                <li key={i}>
                  <a href="#" className="text-sm text-slate-400 hover:text-white transition-colors duration-200">
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Employer Links */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-4">{t('footer.employer.title')}</h4>
            <ul className="space-y-3">
              {employerLinks.map((link, i) => (
                <li key={i}>
                  <a href="#" className="text-sm text-slate-400 hover:text-white transition-colors duration-200">
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Support Links */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-4">{t('footer.support.title')}</h4>
            <ul className="space-y-3">
              {supportLinks.map((link, i) => (
                <li key={i}>
                  <a href="#" className="text-sm text-slate-400 hover:text-white transition-colors duration-200">
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-slate-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-slate-500">{t('footer.copyright')}</p>
          <div className="flex items-center gap-6 text-sm text-slate-500">
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
