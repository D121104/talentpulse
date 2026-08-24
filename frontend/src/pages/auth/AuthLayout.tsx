import { Link } from 'react-router-dom';
import { BriefcaseBusiness, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-50 px-4 py-8 dark:bg-slate-950 sm:px-6 lg:flex lg:items-center lg:justify-center">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl dark:bg-primary/15" />
        <div className="absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />
      </div>
      <section className="relative z-10 mx-auto grid w-full max-w-5xl overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-2xl shadow-slate-950/10 dark:border-slate-700/70 dark:bg-slate-900 lg:grid-cols-[0.9fr_1.1fr]">
        <aside className="hidden min-h-full flex-col justify-between bg-gradient-to-br from-primary via-primary-dark to-slate-900 p-10 text-white lg:flex">
          <Link to="/" className="flex items-center gap-3 text-lg font-bold tracking-tight">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
              <BriefcaseBusiness className="h-5 w-5" />
            </span>
            TalentPulse
          </Link>
          <div>
            <span className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold ring-1 ring-white/15">
              <Sparkles className="h-3.5 w-3.5" />
              Smart career matching
            </span>
            <h1 className="max-w-sm text-4xl font-extrabold leading-tight tracking-tight">
              Xay dung hanh trinh su nghiep phu hop voi ban.
            </h1>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-white/70">
              Quan ly ho so, theo doi co hoi va ket noi voi nha tuyen dung tren cung mot nen tang.
            </p>
          </div>
          <p className="text-xs text-white/50">TalentPulse recruitment platform</p>
        </aside>
        <div className="p-6 sm:p-10 lg:p-12">{children}</div>
      </section>
    </main>
  );
}
