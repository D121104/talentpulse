import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  X,
  ShieldCheck,
  Crown,
  History,
  Sparkles,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { useCountdown } from '../../hooks/useCountdown';
import { useAuth } from '../../auth/AuthContext';
import { getPaymentSocket } from '../../lib/socket';
import { paymentApi, PaymentStatus } from '../../lib/paymentApi';

export interface WaitingPaymentInfo {
  orderCode: number;
  amount: number;
  planTitle: string;
  checkoutUrl: string;
  expiresAt: string;
  planType?: 'CANDIDATE_PREMIUM' | 'HR_PREMIUM';
}

interface PaymentWaitingModalProps {
  isOpen: boolean;
  onClose: () => void;
  paymentInfo: WaitingPaymentInfo | null;
}

export const PaymentWaitingModal: React.FC<PaymentWaitingModalProps> = ({
  isOpen,
  onClose,
  paymentInfo,
}) => {
  const { user, accessToken } = useAuth();
  const navigate = useNavigate();
  const [currentStatus, setCurrentStatus] = useState<PaymentStatus>('PENDING');

  // Track whether the countdown has actually started ticking (totalSeconds > 0 observed)
  // to prevent false expiry on first render before hook processes valid expiresAt
  const hasStartedCountdown = useRef(false);

  const { formatted, isExpired, totalSeconds } = useCountdown(
    paymentInfo?.expiresAt
  );

  // Mark that countdown has genuinely started once we observe totalSeconds > 0
  useEffect(() => {
    if (totalSeconds > 0) {
      hasStartedCountdown.current = true;
    }
  }, [totalSeconds]);

  // Reset the ref when modal opens with new payment
  useEffect(() => {
    if (isOpen && paymentInfo) {
      hasStartedCountdown.current = false;
    }
  }, [isOpen, paymentInfo?.orderCode]);

  // Total TTL assumption: 15 minutes (900 seconds) for circle progress percentage
  const totalDuration = 900;
  const progressRatio = Math.max(0, Math.min(1, totalSeconds / totalDuration));
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - progressRatio * circumference;

  // Listen to socket status updates
  useEffect(() => {
    if (!isOpen || !paymentInfo || !user?._id) return;

    setCurrentStatus('PENDING');

    try {
      const socket = getPaymentSocket();

      const handleConnect = () => {
        socket.emit('join', { userId: user._id });
      };

      if (socket.connected) {
        handleConnect();
      } else {
        socket.on('connect', handleConnect);
      }

      const handleStatusChanged = (payload: {
        orderCode: number;
        status: PaymentStatus;
      }) => {
        if (payload.orderCode === paymentInfo.orderCode) {
          setCurrentStatus(payload.status);
        }
      };

      socket.on('payment:status-changed', handleStatusChanged);

      return () => {
        socket.off('connect', handleConnect);
        socket.off('payment:status-changed', handleStatusChanged);
      };
    } catch (err) {
      console.warn('Socket connection warning in PaymentWaitingModal:', err);
    }
  }, [isOpen, paymentInfo?.orderCode, user?._id]);

  // Immediately expire and cancel on PayOS gateway when countdown hits 00:00
  // Guard: only fire if the countdown has actually been running (hasStartedCountdown)
  useEffect(() => {
    if (!isOpen || !paymentInfo || currentStatus !== 'PENDING') return;

    if (isExpired && hasStartedCountdown.current) {
      setCurrentStatus('EXPIRED');
      if (accessToken) {
        paymentApi
          .expirePaymentOrder(accessToken, paymentInfo.orderCode)
          .catch((err) => {
            console.warn('Failed to notify backend of order expiry:', err);
          });
      }
    }
  }, [isExpired, isOpen, paymentInfo?.orderCode, currentStatus, accessToken]);

  if (!isOpen || !paymentInfo) return null;

  const isSuccess = currentStatus === 'PAID';
  const isFailedOrExpired =
    currentStatus === 'EXPIRED' ||
    currentStatus === 'CANCELLED' ||
    (isExpired && currentStatus === 'PENDING');

  const handleReopenCheckout = () => {
    if (paymentInfo.checkoutUrl) {
      window.open(paymentInfo.checkoutUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleGoToHistory = () => {
    onClose();
    if (user?.role === 'HR') {
      navigate('/dashboard?tab=payment-history');
    } else {
      navigate('/payment-history');
    }
  };

  const handleCompleteAndReload = () => {
    onClose();
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 animate-fade-in">
      {/* Backdrop with strong blur */}
      <div
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-3xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200/80 dark:border-slate-800 animate-in zoom-in-95 duration-200">
        {/* Top Header */}
        <div className="relative bg-gradient-to-r from-slate-900 via-primary-dark to-primary p-6 text-white overflow-hidden">
          <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-xl" />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-md border border-white/20">
                {isSuccess ? (
                  <Sparkles className="h-5 w-5 text-emerald-300" />
                ) : (
                  <Crown className="h-5 w-5 text-amber-400" />
                )}
              </div>
              <div>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-amber-300">
                  {isSuccess ? 'Giao Dịch Thành Công' : 'Cổng Thanh Toán PayOS 24/7'}
                </span>
                <h3 className="text-lg font-black text-white leading-tight">
                  {isSuccess
                    ? 'Kích Hoạt Gói Premium Thành Công!'
                    : isFailedOrExpired
                    ? 'Đơn Hàng Đã Kết Thúc'
                    : 'Đang Chờ Bạn Thanh Toán...'}
                </h3>
              </div>
            </div>

            <button
              onClick={onClose}
              className="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
              title="Đóng cửa sổ"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 sm:p-8 space-y-6 text-center">
          {/* ========================================================================= */}
          {/* STATE 1: SUCCESS STATE                                                    */}
          {/* ========================================================================= */}
          {isSuccess ? (
            <div className="space-y-5 py-4 animate-in zoom-in-90 duration-300">
              <div className="relative mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 border-2 border-emerald-500 shadow-xl shadow-emerald-500/20">
                <CheckCircle2 className="h-12 w-12 text-emerald-500 animate-bounce" />
                <span className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white text-[10px] font-bold">
                  ✓
                </span>
              </div>

              <div className="space-y-1.5">
                <h4 className="text-xl font-black text-slate-900 dark:text-white">
                  Thanh Toán Hoàn Tất!
                </h4>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-sm mx-auto">
                  Tài khoản của bạn đã được nâng cấp lên <strong>{paymentInfo.planTitle}</strong>. Chúc bạn có trải nghiệm tuyệt vời!
                </p>
              </div>

              {/* Order Info Card */}
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-4 border border-slate-200/80 dark:border-slate-700/60 text-xs space-y-2 text-left">
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Mã đơn hàng:</span>
                  <span className="font-bold font-mono text-slate-900 dark:text-white">
                    #{paymentInfo.orderCode}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Số tiền:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {paymentInfo.amount.toLocaleString('vi-VN')} đ
                  </span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCompleteAndReload}
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs sm:text-sm shadow-lg shadow-emerald-600/25 transition cursor-pointer"
                >
                  <span>Bắt Đầu Sử Dụng Ngay</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : isFailedOrExpired ? (
            /* ========================================================================= */
            /* STATE 2: EXPIRED / CANCELLED STATE                                        */
            /* ========================================================================= */
            <div className="space-y-5 py-4 animate-in zoom-in-90 duration-300">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-rose-500/10 dark:bg-rose-500/20 border-2 border-rose-500 text-rose-500 shadow-xl shadow-rose-500/20">
                <AlertTriangle className="h-10 w-10" />
              </div>

              <div className="space-y-1">
                <h4 className="text-lg font-black text-slate-900 dark:text-white">
                  Đơn Hàng Đã Hết Hạn Thanh Toán
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                  Thời gian thanh toán cho đơn hàng #{paymentInfo.orderCode} đã kết thúc. Vui lòng tạo đơn hàng mới để tiếp tục nâng cấp.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition cursor-pointer"
                >
                  Đóng Cửa Sổ
                </button>
                <button
                  type="button"
                  onClick={handleGoToHistory}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary hover:bg-primary-dark text-white font-bold text-xs shadow-md transition cursor-pointer"
                >
                  <History className="h-4 w-4" />
                  <span>Xem Lịch Sử</span>
                </button>
              </div>
            </div>
          ) : (
            /* ========================================================================= */
            /* STATE 3: PENDING & COUNTDOWN ACTIVE STATE                                  */
            /* ========================================================================= */
            <div className="space-y-6">
              {/* Circular SVG Countdown */}
              <div className="relative mx-auto flex items-center justify-center h-44 w-44">
                {/* SVG Progress Ring */}
                <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 160 160">
                  {/* Background Track */}
                  <circle
                    cx="80"
                    cy="80"
                    r={radius}
                    className="stroke-slate-100 dark:stroke-slate-800"
                    strokeWidth="10"
                    fill="transparent"
                  />
                  {/* Glowing Animated Progress Stroke */}
                  <circle
                    cx="80"
                    cy="80"
                    r={radius}
                    className={`transition-all duration-1000 ${
                      totalSeconds < 60
                        ? 'stroke-rose-500'
                        : totalSeconds < 300
                        ? 'stroke-amber-500'
                        : 'stroke-primary'
                    }`}
                    strokeWidth="10"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    fill="transparent"
                  />
                </svg>

                {/* Center Content */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">
                    Thời Gian Còn Lại
                  </span>
                  <span className="font-mono text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
                    {formatted}
                  </span>
                  <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                    Tự động đồng bộ
                  </span>
                </div>
              </div>

              {/* Status Notice */}
              <div className="space-y-1.5">
                <h4 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center justify-center gap-2">
                  <RefreshCw className="h-4 w-4 text-primary animate-spin" />
                  <span>Trang thanh toán PayOS đã mở ở tab mới</span>
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
                  Vui lòng quét mã QR hoặc hoàn tất thanh toán trên tab PayOS. Hệ thống sẽ tự động kích hoạt gói ngay khi bạn thanh toán thành công!
                </p>
              </div>

              {/* Order Quick Details */}
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-4 border border-slate-200/80 dark:border-slate-700/60 text-xs space-y-2 text-left">
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Gói dịch vụ:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {paymentInfo.planTitle}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Mã đơn hàng:</span>
                  <span className="font-mono font-bold text-primary dark:text-primary-light">
                    #{paymentInfo.orderCode}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-400 border-t border-slate-200/60 dark:border-slate-700/60 pt-2 font-bold">
                  <span>Số tiền:</span>
                  <span className="text-slate-900 dark:text-white text-sm">
                    {paymentInfo.amount.toLocaleString('vi-VN')} đ
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleReopenCheckout}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-gradient-to-r from-primary to-primary-dark hover:from-primary-dark hover:to-primary text-white font-extrabold text-xs sm:text-sm shadow-lg shadow-primary/25 hover:shadow-xl transition cursor-pointer"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span>Mở Lại Tab Thanh Toán PayOS</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-semibold transition cursor-pointer"
                  >
                    Đóng Cửa Sổ
                  </button>
                  <button
                    type="button"
                    onClick={handleGoToHistory}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition cursor-pointer"
                  >
                    <History className="h-3.5 w-3.5" />
                    <span>Lịch Sử Giao Dịch</span>
                  </button>
                </div>
              </div>

              {/* Security Footer Note */}
              <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500 pt-1">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                <span>Giao dịch an toàn &amp; mã hóa 100% qua cổng PayOS</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
