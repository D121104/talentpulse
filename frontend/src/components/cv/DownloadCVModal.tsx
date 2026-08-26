import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Sparkles, Check, Clock, Loader2, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { OnlineCV } from '../../lib/cvTypes';
import { useAuth } from '../../auth/AuthContext';

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
  const { user } = useAuth();
  const navigate = useNavigate();

  const [downloadingType, setDownloadingType] = useState<'free' | 'premium' | null>(null);
  const [countdown, setCountdown] = useState<number>(0);

  const isVerified = user?.isVerified ?? false;
  const isPremium = isUserPremium || Boolean(user?.isPremium);

  const freeWaitSeconds = isVerified ? 3 : 5;
  const premiumWaitSeconds = 1;

  if (!isOpen || !cv) return null;

  const handleDownloadFree = async () => {
    setDownloadingType('free');
    setCountdown(freeWaitSeconds);

    for (let i = freeWaitSeconds; i > 0; i--) {
      setCountdown(i);
      await new Promise((r) => setTimeout(r, 1000));
    }

    try {
      await onDownload(cv, false);
      onClose();
    } finally {
      setDownloadingType(null);
      setCountdown(0);
    }
  };

  const handleDownloadPremium = async () => {
    if (!isPremium) {
      navigate('/premium');
      return;
    }
    setDownloadingType('premium');
    setCountdown(premiumWaitSeconds);

    await new Promise((r) => setTimeout(r, 1000));

    try {
      await onDownload(cv, true);
      onClose();
    } finally {
      setDownloadingType(null);
      setCountdown(0);
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
          onClick={() => !downloadingType && onClose()}
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
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                {t('cv.downloadModalTitle', 'Tải & Xuất Bản CV (PDF)')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Chọn định dạng và tốc độ xuất bản phù hợp với cấp tài khoản của bạn
              </p>
            </div>
            <button
              type="button"
              disabled={!!downloadingType}
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-900 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 transition cursor-pointer disabled:opacity-50"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* 2 Option Cards Grid */}
          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* 1. Left Card: Premium / No Watermark */}
            <div className="flex flex-col justify-between rounded-2xl border-2 border-amber-400/50 bg-gradient-to-b from-amber-50/40 to-white p-5 shadow-sm dark:from-amber-950/15 dark:to-slate-900 dark:border-amber-500/40">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-900 dark:text-white font-extrabold text-sm sm:text-base">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500 text-white shadow-sm">
                      <Zap className="h-4 w-4" />
                    </div>
                    <span>Tải Premium Tức Thì (1s)</span>
                  </div>
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-black text-amber-700 dark:text-amber-300 border border-amber-500/30">
                    PREMIUM 👑
                  </span>
                </div>

                <div className="mt-4 flex items-center gap-4">
                  {/* Mockup Preview Graphic */}
                  <div className="relative h-28 w-24 shrink-0 rounded-lg border border-amber-200 bg-white p-2 shadow-inner dark:border-slate-700 dark:bg-slate-800">
                    <div className="h-2 w-12 rounded bg-slate-300 dark:bg-slate-600 mb-2" />
                    <div className="h-1.5 w-16 rounded bg-slate-200 dark:bg-slate-700 mb-1.5" />
                    <div className="h-1.5 w-14 rounded bg-slate-200 dark:bg-slate-700 mb-3" />
                    <div className="h-1 w-full rounded bg-slate-200 dark:bg-slate-700 mb-1" />
                    <div className="h-1 w-5/6 rounded bg-slate-200 dark:bg-slate-700 mb-1" />
                    <div className="h-1 w-4/6 rounded bg-slate-200 dark:bg-slate-700" />
                    <div className="absolute bottom-1.5 left-2 right-2 text-[7px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-0.5">
                      <Check className="h-2.5 w-2.5" /> Sạch 100% Logo
                    </div>
                  </div>

                  <div className="text-xs space-y-1.5 text-slate-600 dark:text-slate-300">
                    <div className="flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400">
                      <Check className="h-3.5 w-3.5" />
                      <span>Xóa hoàn toàn Watermark</span>
                    </div>
                    <div className="flex items-center gap-1.5 font-bold text-amber-600 dark:text-amber-400">
                      <Clock className="h-3.5 w-3.5" />
                      <span>Tốc độ siêu tốc: 1 giây</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed pt-0.5">
                      Không giới hạn lượt tải, xuất file chuẩn in ấn sắc nét không gắn bản quyền.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <button
                  type="button"
                  disabled={downloadingType === 'premium'}
                  onClick={handleDownloadPremium}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 px-4 py-3 text-xs sm:text-sm font-extrabold text-white shadow-lg shadow-amber-500/25 active:scale-98 transition cursor-pointer disabled:opacity-50"
                >
                  {downloadingType === 'premium' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Đang chuẩn bị PDF siêu tốc ({countdown}s)...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      <span>
                        {isPremium
                          ? 'Tải Ngay Không Watermark (Premium)'
                          : 'Nâng Cấp Premium Để Mở Khóa'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* 2. Right Card: Free with Watermark */}
            <div className="flex flex-col justify-between rounded-2xl border-2 border-slate-200 bg-gradient-to-b from-slate-50/60 to-white p-5 shadow-sm dark:from-slate-800/40 dark:to-slate-900 dark:border-slate-700">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-900 dark:text-white font-extrabold text-sm sm:text-base">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-white shadow-sm">
                      <Download className="h-4 w-4" />
                    </div>
                    <span>Tải CV Bản Tiêu Chuẩn</span>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black border ${
                    isVerified
                      ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                  }`}>
                    {isVerified ? 'Đã Xác Thực 🛡️ (3s)' : 'Thường (5s)'}
                  </span>
                </div>

                <div className="mt-4 flex items-center gap-4">
                  {/* Watermark Illustration */}
                  <div className="relative flex h-28 w-24 shrink-0 flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-2 shadow-inner dark:border-slate-700 dark:bg-slate-800/60">
                    <div className="h-10 w-14 rounded-md bg-primary/20 text-primary flex items-center justify-center font-black text-[9px] shadow-sm">
                      talentpulse
                    </div>
                    <span className="mt-2 text-[7px] text-slate-400 font-semibold">©talentpulse.vn</span>
                  </div>

                  <div className="text-xs space-y-1.5 text-slate-600 dark:text-slate-300">
                    <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-medium">
                      <Clock className="h-3.5 w-3.5" />
                      <span>
                        Thời gian chờ kết xuất: <strong>{freeWaitSeconds}s</strong>
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed pt-0.5">
                      Kèm biểu tượng bản quyền <b>©talentpulse.vn</b> ở chân trang của bản in PDF.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <button
                  type="button"
                  disabled={downloadingType === 'free'}
                  onClick={handleDownloadFree}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 px-4 py-3 text-xs sm:text-sm font-extrabold text-white shadow-md active:scale-98 transition cursor-pointer disabled:opacity-50"
                >
                  {downloadingType === 'free' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Đang kết xuất PDF ({countdown}s)...</span>
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      <span>Tải Miễn Phí ({freeWaitSeconds}s)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
