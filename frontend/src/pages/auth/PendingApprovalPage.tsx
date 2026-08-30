import { Link } from 'react-router-dom';
import { Clock3, LogOut } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';

export default function PendingApprovalPage() {
  const { logout, user } = useAuth();

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <section className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-950/10 dark:border-slate-700 dark:bg-slate-900 sm:p-12">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300"><Clock3 className="h-8 w-8" /></span>
        <p className="mt-7 text-sm font-bold text-primary">Dang ky HR da duoc ghi nhan</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Tai khoan dang cho duyet</h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-slate-500 dark:text-slate-400">{user?.email ? `Quan tri vien se xem xet tai khoan ${user.email} cua ban. ` : ''}Ban se co the truy cap cong cu tuyen dung ngay sau khi duoc phe duyet.</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"><Link to="/" className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 transition hover:border-primary hover:text-primary dark:border-slate-700 dark:text-slate-200">Ve trang chu</Link><button onClick={() => void logout()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white transition hover:bg-primary-dark"><LogOut className="h-4 w-4" />Dang xuat</button></div>
      </section>
    </main>
  );
}
