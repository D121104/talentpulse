import { motion, AnimatePresence } from 'framer-motion';
import { Monitor, X, Smartphone, Sparkles, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface MobileNoticeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileNoticeModal({ isOpen, onClose }: MobileNoticeModalProps) {
  const { t } = useTranslation();

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Visual Illustration */}
            <div className="mx-auto mt-2 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light">
              <div className="relative flex items-center justify-center">
                <Monitor className="h-10 w-10 text-primary animate-pulse" />
                <span className="absolute -bottom-1 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-white shadow-sm">
                  <Smartphone className="h-3.5 w-3.5" />
                </span>
              </div>
            </div>

            {/* Content */}
            <div className="mt-5 text-center">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary dark:bg-primary/20 dark:text-primary-light">
                <Sparkles className="h-3.5 w-3.5" />
                <span>{t('cv.pcExperienceOnlyBadge', 'Trải nghiệm tối ưu trên Máy tính')}</span>
              </div>

              <h3 className="mt-3 text-lg font-black text-slate-900 dark:text-white">
                {t('cv.mobileNoticeTitle', 'Tính năng tạo CV Online')}
              </h3>

              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {t(
                  'cv.mobileNoticeDesc',
                  'Để đảm bảo thao tác kéo thả, định dạng font chữ, căn chỉnh bố cục và xem trước trang A4 chuẩn xác nhất, tính năng viết CV Online hiện chỉ hỗ trợ trên trình duyệt Máy tính (PC / Laptop).',
                )}
              </p>

              <div className="mt-4 rounded-2xl bg-slate-50 p-3.5 text-left text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-400 border border-slate-100 dark:border-slate-700/60 space-y-1.5">
                <p className="font-semibold text-slate-800 dark:text-slate-200">💡 Gợi ý cho bạn:</p>
                <p>• Mở liên kết <span className="font-mono text-primary font-bold">talentpulse.vn/my-cv</span> trên máy tính để viết CV ngay.</p>
                <p>• Hoặc sử dụng tính năng <b>"Tải CV lên (PDF / DOCX)"</b> có sẵn trên điện thoại.</p>
              </div>

              {/* Action Button */}
              <div className="mt-6">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-white shadow-lg shadow-primary/25 transition hover:bg-primary-dark active:scale-98 cursor-pointer"
                >
                  <span>{t('cv.understandGotIt', 'Tôi đã hiểu')}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
