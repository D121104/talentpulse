import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { AuthLayout } from './AuthLayout';
import { ApiError, getGoogleLoginUrl } from '../../lib/api';
import { useAuth } from '../../auth/AuthContext';

function getDestination(user: { role: string; isApproved?: boolean }) {
  if (user.role === 'HR' && !user.isApproved) return '/pending-approval';
  return user.role === 'USER' ? '/my-cv' : '/dashboard';
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const registered = new URLSearchParams(location.search).get('registered');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const session = await login({ email, password });
      navigate(getDestination(session.user), { replace: true });
    } catch (submissionError) {
      setError(
        submissionError instanceof ApiError
          ? submissionError.message
          : 'Khong the dang nhap. Vui long thu lai.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <div className="mx-auto max-w-md">
        <Link to="/" className="mb-10 inline-flex text-sm font-semibold text-slate-500 transition-colors hover:text-primary lg:hidden">
          Ve trang chu
        </Link>
        <div className="mb-8">
          <p className="text-sm font-semibold text-primary">Chao mung tro lai</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Dang nhap tai khoan</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">Tiep tuc hanh trinh tim kiem co hoi phu hop voi ban.</p>
        </div>

        {registered && (
          <p role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/30 dark:text-emerald-300">
            Dang ky thanh cong. Hay dang nhap de bat dau.
          </p>
        )}
        {error && <p role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-300">{error}</p>}

        <form className="space-y-5" onSubmit={handleSubmit} noValidate>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">Email</span>
            <span className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 shadow-sm transition focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 dark:border-slate-700 dark:bg-slate-800">
              <Mail className="h-4 w-4 shrink-0 text-slate-400" />
              <input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-12 w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white" placeholder="you@example.com" />
            </span>
          </label>
          <label className="block">
            <span className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-700 dark:text-slate-200">
              Mat khau
              <span className="text-xs font-medium text-slate-400">Toi thieu 8 ky tu</span>
            </span>
            <span className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 shadow-sm transition focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 dark:border-slate-700 dark:bg-slate-800">
              <LockKeyhole className="h-4 w-4 shrink-0 text-slate-400" />
              <input required minLength={8} type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-12 w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white" placeholder="Nhap mat khau" />
              <button type="button" onClick={() => setShowPassword((current) => !current)} className="rounded-md p-1 text-slate-400 transition hover:text-primary" aria-label={showPassword ? 'An mat khau' : 'Hien mat khau'}>
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </span>
          </label>
          <button disabled={isSubmitting} className="flex h-12 w-full items-center justify-center rounded-xl bg-primary text-sm font-bold text-white shadow-lg shadow-primary/20 transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60" type="submit">
            {isSubmitting ? 'Dang dang nhap...' : 'Dang nhap'}
          </button>
        </form>

        <div className="my-7 flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />hoac<span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" /></div>
        <a href={getGoogleLoginUrl()} className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:border-primary/40 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700">
          <span className="text-base font-bold text-[#4285F4]">G</span>Tiep tuc voi Google
        </a>
        <p className="mt-7 text-center text-sm text-slate-500 dark:text-slate-400">Chua co tai khoan? <Link className="font-semibold text-primary hover:text-primary-dark" to="/register">Dang ky ngay</Link></p>
        <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-slate-400"><ShieldCheck className="h-3.5 w-3.5" />Phien dang nhap duoc bao ve bang cookie an toan.</p>
      </div>
    </AuthLayout>
  );
}
