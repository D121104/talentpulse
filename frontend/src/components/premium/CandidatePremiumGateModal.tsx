import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Sparkles, Navigation, X, ArrowRight, ShieldCheck } from 'lucide-react';

interface CandidatePremiumGateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CandidatePremiumGateModal: React.FC<CandidatePremiumGateModalProps> = ({
  isOpen,
  onClose,
}) => {
  const navigate = useNavigate();

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm"
        />

        {/* Modal Card */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 15 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative z-10 w-full max-w-lg rounded-3xl bg-white p-6 sm:p-8 shadow-2xl border border-slate-200/80 dark:bg-slate-900 dark:border-slate-800"
        >
          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-5 right-5 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Header Icon */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-500/25">
              <MapPin className="w-6 h-6" />
            </div>
            <div>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60">
                <Sparkles className="w-3 h-3 text-amber-500" />
                Gói Ứng viên Premium
              </span>
              <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mt-1">
                Tìm việc làm theo Bản đồ
              </h3>
            </div>
          </div>

          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-5">
            Tính năng tìm kiếm việc làm qua bản đồ tương tác với toạ độ thực tế và đo khoảng cách di chuyển chính xác chỉ áp dụng cho tài khoản Ứng viên Premium.
          </p>

          {/* Feature List */}
          <div className="space-y-3 mb-6 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-700/50 text-xs sm:text-sm text-slate-700 dark:text-slate-200">
            <div className="flex items-start gap-2.5">
              <Navigation className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
              <span>
                <strong>Quét việc làm gần nhà:</strong> Lựa chọn bán kính 5km, 10km, 15km hoặc 20km theo vị trí GPS của bạn.
              </span>
            </div>
            <div className="flex items-start gap-2.5">
              <MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
              <span>
                <strong>Đo khoảng cách tức thì:</strong> Tự động tính khoảng cách chính xác từ nơi bạn ở đến từng văn phòng tuyển dụng.
              </span>
            </div>
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
              <span>
                <strong>Bản đồ trực quan:</strong> Tra cứu nhanh văn phòng công ty, hướng đi và điều kiện làm việc onsite/hybrid.
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate('/pricing');
              }}
              className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-md shadow-blue-500/25 hover:bg-blue-700 transition-all cursor-pointer"
            >
              <span>Nâng cấp gói Premium</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto rounded-xl px-5 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
            >
              Để sau
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default CandidatePremiumGateModal;
