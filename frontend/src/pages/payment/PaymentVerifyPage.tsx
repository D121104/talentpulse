import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';

export default function PaymentVerifyPage() {
  const { orderCode } = useParams<{ orderCode?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const isMock = searchParams.get('mock') === 'true';
  const statusParam = searchParams.get('status') || (isMock ? 'success' : 'pending');
  const [dots, setDots] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 400);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate(
        `/payment-history?orderCode=${orderCode || ''}&status=${statusParam}`,
        { replace: true }
      );
    }, 2500);

    return () => clearTimeout(timer);
  }, [orderCode, statusParam, navigate]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100">
      <Header />

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 p-8 sm:p-10 border border-slate-200/80 dark:border-slate-800 shadow-xl text-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
          <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10 text-primary dark:bg-primary/20 shadow-inner">
            {statusParam === 'success' || statusParam === 'paid' ? (
              <CheckCircle2 className="h-10 w-10 text-emerald-500 animate-bounce" />
            ) : statusParam === 'cancelled' ? (
              <XCircle className="h-10 w-10 text-slate-400" />
            ) : (
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
            )}
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">
              Đang xác nhận kết quả thanh toán{dots}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Mã đơn hàng: <strong className="font-mono text-primary">#{orderCode || 'N/A'}</strong>
            </p>
          </div>

          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-4 border border-slate-200/80 dark:border-slate-700/60 text-xs text-slate-600 dark:text-slate-300 space-y-1">
            <p className="flex items-center justify-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
              <Clock className="h-3.5 w-3.5 text-primary" />
              Đang tự động đồng bộ trạng thái qua PayOS...
            </p>
            <p className="text-[11px] text-slate-400">
              Hệ thống sẽ chuyển tiếp bạn đến trang Lịch sử thanh toán trong giây lát.
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
