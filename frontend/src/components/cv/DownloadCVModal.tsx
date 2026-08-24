import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShieldCheck, Download, Sparkles, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { OnlineCV } from '../../lib/cvTypes';

interface DownloadCVModalProps {
  isOpen: boolean;
  onClose: () => void;
  cv: OnlineCV | null;
  onDownload: (cv: OnlineCV, isPremium: boolean) => Promise<void>;
  isUserPremium?: boolean;
}

export function DownloadCVModal({
  isOpen,
  onClose,
  cv,
  onDownload,
  isUserPremium = false,
}: DownloadCVModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [downloadingType, setDownloadingType] = useState<'free' | 'premium' | null>(null);

  if (!isOpen || !cv) return null;

  const handleDownloadFree = async () => {
    setDownloadingType('free');
    try {
      await onDownload(cv, false);
      onClose();
    } finally {
      setDownloadingType(null);
    }
  };

  const handleDownloadPremium = async () => {
    if (!isUserPremium) {
      navigate('/checkout?plan=candidate-premium');
      return;
    }
    setDownloadingType('premium');
    try {
      await onDownload(cv, true);
      onClose();
    } finally {
      setDownloadingType(null);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
        />

        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-2xl dark:border-slate-800 dark:bg-slate-900 z-10"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-xl sm:text-2xl font-black text-primary dark:text-primary-light">
              {t('cv.downloadModalTitle', 'Tải CV')}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-900 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* 2 Option Cards Grid */}
          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* 1. Left Card: Premium / No Watermark */}
            <div className="flex flex-col justify-between rounded-2xl border-2 border-amber-400/40 bg-gradient-to-b from-amber-50/40 to-white p-5 shadow-sm dark:from-amber-950/10 dark:to-slate-900 dark:border-amber-500/30">
              <div>
                <div className="flex items-center gap-2 text-slate-900 dark:text-white font-extrabold text-sm sm:text-base">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-white shadow-sm">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <span>Tải CV không kèm biểu tượng ©talentpulse.vn</span>
                </div>

                <div className="mt-5 flex items-center gap-4">
                  {/* Mockup Preview Graphic */}
                  <div className="relative h-28 w-24 shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-2 shadow-inner dark:border-slate-700 dark:bg-slate-800">
                    <div className="h-2 w-12 rounded bg-slate-300 dark:bg-slate-600 mb-2" />
                    <div className="h-1.5 w-16 rounded bg-slate-200 dark:bg-slate-700 mb-1.5" />
                    <div className="h-1.5 w-14 rounded bg-slate-200 dark:bg-slate-700 mb-3" />
                    <div className="h-1 w-full rounded bg-slate-200 dark:bg-slate-700 mb-1" />
                    <div className="h-1 w-5/6 rounded bg-slate-200 dark:bg-slate-700 mb-1" />
                    <div className="h-1 w-4/6 rounded bg-slate-200 dark:bg-slate-700" />
                    <div className="absolute bottom-1.5 left-2 right-2 text-[7px] text-primary font-bold flex items-center gap-0.5">
                      <Check className="h-2.5 w-2.5" /> Chuẩn nét Premium
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Không giới hạn lượt tải, số CV và số mẫu thiết kế trong vòng 24 giờ. Xuất bản PDF sắc nét không kèm watermark logo hệ thống.
                  </p>
                </div>
              </div>

              <div className="mt-6">
                <button
                  type="button"
                  disabled={downloadingType === 'premium'}
                  onClick={handleDownloadPremium}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-3 text-xs sm:text-sm font-extrabold text-white shadow-lg shadow-amber-500/25 hover:from-amber-600 hover:to-amber-700 active:scale-98 transition cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>
                    {isUserPremium
                      ? downloadingType === 'premium'
                        ? 'Đang tải về...'
                        : 'Tải CV không có biểu tượng (Premium)'
                      : 'Đăng ký Premium'}
                  </span>
                </button>
              </div>
            </div>

            {/* 2. Right Card: Free with Watermark */}
            <div className="flex flex-col justify-between rounded-2xl border-2 border-primary/20 bg-gradient-to-b from-blue-50/40 to-white p-5 shadow-sm dark:from-blue-950/10 dark:to-slate-900 dark:border-primary/30">
              <div>
                <div className="flex items-center gap-2 text-slate-900 dark:text-white font-extrabold text-sm sm:text-base">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-white shadow-sm">
                    <Download className="h-4 w-4" />
                  </div>
                  <span>Tải CV miễn phí</span>
                </div>

                <div className="mt-5 flex items-center gap-4">
                  {/* Folder / Watermark Illustration */}
                  <div className="relative flex h-28 w-24 shrink-0 flex-col items-center justify-center rounded-lg border border-blue-200 bg-blue-50/80 p-2 shadow-inner dark:border-blue-900/50 dark:bg-blue-950/30">
                    <div className="h-10 w-14 rounded-md bg-primary text-white flex items-center justify-center font-black text-[9px] shadow-sm">
                      talentpulse
                    </div>
                    <span className="mt-2 text-[8px] text-slate-400 font-semibold">©talentpulse.vn</span>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Kèm biểu tượng <b>©talentpulse.vn</b> ở góc chân trang của bản in PDF.
                  </p>
                </div>
              </div>

              <div className="mt-6">
                <button
                  type="button"
                  disabled={downloadingType === 'free'}
                  onClick={handleDownloadFree}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs sm:text-sm font-extrabold text-white shadow-lg shadow-primary/25 hover:bg-primary-dark active:scale-98 transition cursor-pointer disabled:opacity-50"
                >
                  <Download className={`h-4 w-4 ${downloadingType === 'free' ? 'animate-bounce' : ''}`} />
                  <span>
                    {downloadingType === 'free' ? 'Đang tạo PDF & tải về...' : 'Tải CV miễn phí'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
