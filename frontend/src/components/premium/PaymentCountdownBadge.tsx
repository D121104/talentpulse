import React from 'react';
import { Clock, AlertTriangle } from 'lucide-react';
import { useCountdown } from '../../hooks/useCountdown';

interface PaymentCountdownBadgeProps {
  expiresAt?: string | null;
  className?: string;
}

export const PaymentCountdownBadge: React.FC<PaymentCountdownBadgeProps> = ({
  expiresAt,
  className = '',
}) => {
  const { formatted, isExpired, totalSeconds } = useCountdown(expiresAt);

  if (isExpired || !expiresAt) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-xs font-bold text-rose-600 dark:text-rose-400 border border-rose-500/20 ${className}`}
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        <span>Hết hạn</span>
      </span>
    );
  }

  // < 1 minute: Urgent critical state (Rose red pulse)
  if (totalSeconds < 60) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 px-3 py-1 text-xs font-black text-rose-600 dark:text-rose-400 border border-rose-500/30 animate-pulse ${className}`}
        title={`Đơn hàng sẽ tự động hủy sau ${totalSeconds} giây nếu chưa thanh toán`}
      >
        <Clock className="h-3.5 w-3.5 animate-spin text-rose-500" style={{ animationDuration: '3s' }} />
        <span>Còn {formatted}</span>
      </span>
    );
  }

  // < 5 minutes: Warning state (Amber)
  if (totalSeconds < 300) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-700 dark:text-amber-300 border border-amber-500/30 ${className}`}
        title={`Đơn hàng còn ${formatted} để hoàn tất thanh toán`}
      >
        <Clock className="h-3.5 w-3.5 text-amber-500" />
        <span>Còn {formatted}</span>
      </span>
    );
  }

  // Normal pending state (> 5 minutes: Blue/Indigo/Primary)
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary dark:text-primary-light border border-primary/20 ${className}`}
      title={`Thời gian chờ thanh toán: ${formatted}`}
    >
      <Clock className="h-3.5 w-3.5 text-primary" />
      <span>Còn {formatted}</span>
    </span>
  );
};
