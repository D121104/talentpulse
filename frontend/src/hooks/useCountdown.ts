import { useState, useEffect } from 'react';
import { parseDate } from '../lib/dateUtils';

export interface UseCountdownReturn {
  minutes: number;
  seconds: number;
  totalSeconds: number;
  formatted: string;
  isExpired: boolean;
}

export function useCountdown(targetDate?: string | Date | null): UseCountdownReturn {
  const calculateRemaining = () => {
    if (!targetDate) {
      // No target date = countdown not started yet, NOT expired
      return {
        minutes: 0,
        seconds: 0,
        totalSeconds: 0,
        formatted: '--:--',
        isExpired: false,
      };
    }

    const parsed = parseDate(targetDate);
    if (!parsed) {
      // Invalid date = treat as not started, NOT expired
      return {
        minutes: 0,
        seconds: 0,
        totalSeconds: 0,
        formatted: '--:--',
        isExpired: false,
      };
    }

    const targetTime = parsed.getTime();

    const now = Date.now();
    const remainingMs = Math.max(0, targetTime - now);
    const totalSeconds = Math.floor(remainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    const isExpired = totalSeconds <= 0;

    return {
      minutes,
      seconds,
      totalSeconds,
      formatted,
      isExpired,
    };
  };

  const [countdown, setCountdown] = useState<UseCountdownReturn>(calculateRemaining);

  useEffect(() => {
    // Initial calculate on date change
    setCountdown(calculateRemaining());

    if (!targetDate) return;

    const timer = setInterval(() => {
      const updated = calculateRemaining();
      setCountdown(updated);
      if (updated.isExpired) {
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [targetDate]);

  return countdown;
}
