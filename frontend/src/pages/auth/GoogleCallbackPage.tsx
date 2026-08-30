import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, LoaderCircle } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { ApiError } from '../../lib/api';

export default function GoogleCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { completeGoogleLogin } = useAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    if (!code) {
      setError('Google khong tra ve ma xac thuc hop le.');
      return;
    }

    void completeGoogleLogin(code)
      .then((session) => {
        navigate(
          session.user.role === 'HR' && !session.user.isApproved
            ? '/pending-approval'
            : session.user.role === 'USER'
              ? '/my-cv'
              : '/dashboard',
          { replace: true },
        );
      })
      .catch((exchangeError) => {
        setError(
          exchangeError instanceof ApiError
            ? exchangeError.message
            : 'Khong the hoan tat dang nhap Google.',
        );
      });
  }, [completeGoogleLogin, navigate, searchParams]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-950/10 dark:border-slate-700 dark:bg-slate-900">
        {error ? <AlertCircle className="mx-auto h-10 w-10 text-red-500" /> : <LoaderCircle className="mx-auto h-10 w-10 animate-spin text-primary" />}
        <h1 className="mt-5 text-xl font-extrabold text-slate-900 dark:text-white">{error ? 'Dang nhap Google khong thanh cong' : 'Dang hoan tat dang nhap Google'}</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{error || 'He thong dang tao phien dang nhap an toan cho ban.'}</p>
        {error && <Link to="/login" className="mt-6 inline-flex rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white transition hover:bg-primary-dark">Quay lai dang nhap</Link>}
      </section>
    </main>
  );
}
