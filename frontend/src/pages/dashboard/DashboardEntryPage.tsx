import { Link } from 'react-router-dom';
import { ArrowRight, BriefcaseBusiness, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';

const roleContent = {
  USER: { title: 'Khong gian ung vien', description: 'Tai khoan cua ban da san sang. Cac trang tim viec, CV va quan ly ung tuyen se duoc ket noi o buoc tiep theo.', icon: UserRound },
  HR: { title: 'Khong gian nha tuyen dung', description: 'Tai khoan HR da duoc phe duyet va san sang quan ly cong ty, tin dang va ung vien.', icon: BriefcaseBusiness },
  ADMIN: { title: 'Khong gian quan tri', description: 'Tai khoan quan tri da duoc xac thuc. Ban co the tiep tuc den cac cong cu quan ly he thong.', icon: ShieldCheck },
};

export default function DashboardEntryPage() {
  const { user, logout } = useAuth();
  if (!user) return null;
  const content = roleContent[user.role];
  const Icon = content.icon;

  return <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950 sm:px-6"><section className="mx-auto max-w-3xl rounded-[28px] border border-slate-200 bg-white p-8 shadow-xl shadow-slate-950/10 dark:border-slate-700 dark:bg-slate-900 sm:p-12"><div className="flex items-start justify-between gap-4"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Icon className="h-7 w-7" /></span><button onClick={() => void logout()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-red-300 hover:text-red-600 dark:border-slate-700 dark:text-slate-300"><LogOut className="h-4 w-4" />Dang xuat</button></div><p className="mt-10 text-sm font-bold text-primary">Xin chao, {user.name}</p><h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">{content.title}</h1><p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">{content.description}</p><Link to="/" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white transition hover:bg-primary-dark">Kham pha TalentPulse <ArrowRight className="h-4 w-4" /></Link></section></main>;
}
