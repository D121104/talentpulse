import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, CheckCircle2, LockKeyhole, Mail, UserRound } from 'lucide-react';
import { AuthLayout } from './AuthLayout';
import { ApiError, authApi } from '../../lib/api';

type AccountType = 'candidate' | 'hr';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [accountType, setAccountType] = useState<AccountType>('candidate');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [taxCode, setTaxCode] = useState('');
  const [companyScale, setCompanyScale] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Xac nhan mat khau chua khop.');
      return;
    }

    setIsSubmitting(true);
    try {
      const request = { name, email, password };
      if (accountType === 'candidate') {
        await authApi.register(request);
        navigate('/login?registered=1', { replace: true });
      } else {
        await authApi.registerHr({
          ...request,
          companyName,
          taxCode,
          companyScale,
        });
        navigate('/pending-approval', { replace: true });
      }
    } catch (submissionError) {
      setError(submissionError instanceof ApiError ? submissionError.message : 'Khong the dang ky. Vui long thu lai.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <div className="mx-auto max-w-md">
        <Link to="/" className="mb-8 inline-flex text-sm font-semibold text-slate-500 transition-colors hover:text-primary lg:hidden">Ve trang chu</Link>
        <div className="mb-7"><p className="text-sm font-semibold text-primary">Bat dau mien phi</p><h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Tao tai khoan moi</h2><p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Chon vai tro de bat dau dung TalentPulse.</p></div>
        <div className="mb-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          {([['candidate', 'Ung vien', UserRound], ['hr', 'Nha tuyen dung', Building2]] as const).map(([type, label, Icon]) => <button key={type} type="button" onClick={() => setAccountType(type)} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-bold transition ${accountType === type ? 'bg-white text-primary shadow-sm dark:bg-slate-700' : 'text-slate-500 dark:text-slate-400'}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}
        </div>
        {error && <p role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-300">{error}</p>}
        <form className="space-y-4" onSubmit={submit} noValidate>
          <AuthField label="Ho va ten" icon={UserRound}><input required autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Nguyen Van A" /></AuthField>
          <AuthField label="Email" icon={Mail}><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></AuthField>
          <AuthField label="Mat khau" icon={LockKeyhole}><input required minLength={8} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Toi thieu 8 ky tu" /></AuthField>
          <AuthField label="Xac nhan mat khau" icon={CheckCircle2}><input required minLength={8} type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Nhap lai mat khau" /></AuthField>
          {accountType === 'hr' && <div className="space-y-4 rounded-2xl border border-primary/15 bg-primary/[0.03] p-4 dark:bg-primary/5"><p className="text-xs font-bold uppercase tracking-wider text-primary">Thong tin doanh nghiep</p><AuthField label="Ten cong ty" icon={Building2}><input value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="Cong ty cua ban" /></AuthField><div className="grid grid-cols-2 gap-3"><label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Ma so thue<input value={taxCode} onChange={(event) => setTaxCode(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-800" /></label><label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Quy mo<input value={companyScale} onChange={(event) => setCompanyScale(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-800" placeholder="10-50" /></label></div></div>}
          <button disabled={isSubmitting} type="submit" className="mt-2 flex h-12 w-full items-center justify-center rounded-xl bg-primary text-sm font-bold text-white shadow-lg shadow-primary/20 transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60">{isSubmitting ? 'Dang tao tai khoan...' : accountType === 'hr' ? 'Gui yeu cau dang ky HR' : 'Tao tai khoan'}</button>
        </form>
        {accountType === 'hr' && <p className="mt-4 text-center text-xs leading-relaxed text-slate-400">Tai khoan HR can duoc quan tri vien phe duyet truoc khi truy cap chuc nang tuyen dung.</p>}
        <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">Da co tai khoan? <Link className="font-semibold text-primary hover:text-primary-dark" to="/login">Dang nhap</Link></p>
      </div>
    </AuthLayout>
  );
}

function AuthField({ label, icon: Icon, children }: { label: string; icon: typeof Mail; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</span><span className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 shadow-sm transition focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 dark:border-slate-700 dark:bg-slate-800"><Icon className="h-4 w-4 shrink-0 text-slate-400" />{children}</span></label>;
}
