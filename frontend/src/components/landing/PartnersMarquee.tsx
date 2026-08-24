import { useTranslation } from 'react-i18next';

const partners = ['FPT Software', 'VNG', 'Tiki', 'VinGroup', 'Momo', 'Shopee', 'Grab', 'Samsung Vietnam'];

export default function PartnersMarquee() {
  const { t } = useTranslation();

  const PartnerItem = ({ name }: { name: string }) => (
    <div className="flex items-center gap-2 mx-10 text-slate-400 dark:text-slate-600 hover:text-slate-700 dark:hover:text-slate-300 transition-colors duration-300 cursor-pointer shrink-0">
      <div className="w-8 h-8 rounded-lg bg-slate-200/60 dark:bg-slate-700/60 flex items-center justify-center">
        <span className="text-xs font-bold text-slate-400 dark:text-slate-500">{name.charAt(0)}</span>
      </div>
      <span className="text-lg font-bold tracking-tight whitespace-nowrap">{name}</span>
    </div>
  );

  return (
    <section className="bg-white dark:bg-slate-950 py-10 border-b border-gray-100 dark:border-slate-800">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-center text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-8">
          {t('partners.title')}
        </p>
      </div>

      <div className="relative flex w-full items-center overflow-hidden pause-on-hover">
        <div className="flex gap-0 animate-marquee-item" style={{ animation: 'marquee 35s linear infinite' }}>
          {partners.map((p) => <PartnerItem key={`a-${p}`} name={p} />)}
          {partners.map((p) => <PartnerItem key={`b-${p}`} name={p} />)}
        </div>
        <div className="flex gap-0 animate-marquee-item" style={{ animation: 'marquee 35s linear infinite' }} aria-hidden="true">
          {partners.map((p) => <PartnerItem key={`c-${p}`} name={p} />)}
          {partners.map((p) => <PartnerItem key={`d-${p}`} name={p} />)}
        </div>

        {/* Edge Masks */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-white dark:from-slate-950" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-white dark:from-slate-950" />
      </div>
    </section>
  );
}
