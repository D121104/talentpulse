import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  description?: string;
  duration?: number;
}

interface ToastContextType {
  showToast: (toast: Omit<ToastItem, 'id'>) => void;
  success: (message: string, description?: string) => void;
  error: (message: string, description?: string) => void;
  info: (message: string, description?: string) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({ type, message, description, duration = 3500 }: Omit<ToastItem, 'id'>) => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const newToast: ToastItem = { id, type, message, description, duration };

      setToasts((prev) => {
        // Prevent duplicate messages if already showing identical message
        const isDuplicate = prev.some((t) => t.message === message);
        if (isDuplicate) return prev;
        // Keep max 3 toasts
        const next = [...prev, newToast];
        return next.slice(-3);
      });

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast],
  );

  const success = useCallback(
    (message: string, description?: string) => {
      showToast({ type: 'success', message, description });
    },
    [showToast],
  );

  const error = useCallback(
    (message: string, description?: string) => {
      showToast({ type: 'error', message, description });
    },
    [showToast],
  );

  const info = useCallback(
    (message: string, description?: string) => {
      showToast({ type: 'info', message, description });
    },
    [showToast],
  );

  const contextValue = useMemo(
    () => ({ showToast, success, error, info, removeToast }),
    [showToast, success, error, info, removeToast],
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}

      {/* Floating Toasts Container */}
      <div className="fixed top-5 right-5 z-50 flex flex-col gap-3 pointer-events-none max-w-sm sm:max-w-md w-full px-4 sm:px-0">
        <AnimatePresence mode="popLayout">
          {toasts.map((t) => {
            const isSuccess = t.type === 'success';
            const isError = t.type === 'error';

            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: -20, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -16, scale: 0.92 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className={`pointer-events-auto relative overflow-hidden rounded-2xl border p-4 shadow-2xl backdrop-blur-2xl transition-all ${
                  isSuccess
                    ? 'border-emerald-200/90 bg-white/95 text-slate-900 shadow-emerald-950/10 dark:border-emerald-800/80 dark:bg-slate-900/95 dark:text-white'
                    : isError
                    ? 'border-red-200/90 bg-white/95 text-slate-900 shadow-red-950/10 dark:border-red-800/80 dark:bg-slate-900/95 dark:text-white'
                    : 'border-primary/30 bg-white/95 text-slate-900 shadow-primary/10 dark:border-primary/40 dark:bg-slate-900/95 dark:text-white'
                }`}
              >
                <div className="flex items-start gap-3.5">
                  {/* Icon */}
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-xs ${
                      isSuccess
                        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400'
                        : isError
                        ? 'bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-400'
                        : 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light'
                    }`}
                  >
                    {isSuccess && <CheckCircle2 className="h-5 w-5" />}
                    {isError && <AlertCircle className="h-5 w-5" />}
                    {!isSuccess && !isError && <Info className="h-5 w-5" />}
                  </div>

                  {/* Message & Description */}
                  <div className="min-w-0 flex-1 pt-0.5">
                    <h4 className="text-sm font-black tracking-tight leading-snug">
                      {t.message}
                    </h4>
                    {t.description && (
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        {t.description}
                      </p>
                    )}
                  </div>

                  {/* Close button */}
                  <button
                    type="button"
                    onClick={() => removeToast(t.id)}
                    className="shrink-0 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                    aria-label="Close notification"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Progress bar line */}
                <motion.div
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{ duration: (t.duration || 3500) / 1000, ease: 'linear' }}
                  className={`absolute bottom-0 left-0 h-1 ${
                    isSuccess
                      ? 'bg-emerald-500 dark:bg-emerald-400'
                      : isError
                      ? 'bg-red-500 dark:bg-red-400'
                      : 'bg-primary dark:bg-primary-light'
                  }`}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
