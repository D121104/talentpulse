import { motion } from 'framer-motion';
import { Building2, Search, ArrowRight, Crown, ShieldAlert, Sparkles } from 'lucide-react';

interface CompanyRequiredGateProps {
  title?: string;
  description?: string;
  onNavigateTab: (tab: string, extraData?: any) => void;
}

export function CompanyRequiredGate({
  title = 'Yêu cầu Thiết lập hoặc Gia nhập Doanh nghiệp',
  description = 'Tài khoản HR của bạn hiện chưa liên kết với doanh nghiệp nào. Vui lòng tạo hồ sơ công ty mới hoặc gửi đơn xin gia nhập công ty có sẵn để mở khóa tính năng này.',
  onNavigateTab,
}: CompanyRequiredGateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-3xl border border-slate-200/90 bg-white p-8 sm:p-12 shadow-xl shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 text-center max-w-3xl mx-auto my-6"
    >
      {/* Background Decorative Glows */}
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl" />

      {/* Top Badge */}
      <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/80 bg-amber-50 px-3.5 py-1.5 text-xs font-bold text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-300 mb-6">
        <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <span>Chưa liên kết Doanh nghiệp</span>
      </div>

      {/* Main Illustration Icon */}
      <div className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-tr from-primary/20 via-primary/10 to-teal-500/10 border border-primary/20 shadow-inner">
        <Building2 className="h-10 w-10 text-primary" />
        <span className="absolute -top-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-white shadow-md">
          <Sparkles className="h-4 w-4" />
        </span>
      </div>

      {/* Title & Description */}
      <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
        {title}
      </h2>
      <p className="mt-2.5 text-sm sm:text-base leading-relaxed text-slate-600 dark:text-slate-300 max-w-xl mx-auto">
        {description}
      </p>

      {/* 2 Options Preview */}
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
        <div
          onClick={() => onNavigateTab('company')}
          className="group flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50/80 p-5 transition-all hover:border-primary/50 hover:bg-primary/5 dark:border-slate-800 dark:bg-slate-800/40 cursor-pointer"
        >
          <div>
            <div className="flex items-center gap-2 text-primary font-bold text-sm mb-1.5">
              <Crown className="h-4 w-4 text-amber-500" />
              <span>Khởi tạo Công ty mới</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Bạn sẽ là <strong>HR Trưởng</strong>, toàn quyền quản lý tin tuyển dụng và duyệt các thành viên HR khác.
            </p>
          </div>
          <div className="mt-4 flex items-center gap-1.5 text-xs font-bold text-primary group-hover:underline">
            <span>Tạo công ty ngay</span>
            <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>

        <div
          onClick={() => onNavigateTab('company')}
          className="group flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50/80 p-5 transition-all hover:border-primary/50 hover:bg-primary/5 dark:border-slate-800 dark:bg-slate-800/40 cursor-pointer"
        >
          <div>
            <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400 font-bold text-sm mb-1.5">
              <Search className="h-4 w-4" />
              <span>Gia nhập Công ty có sẵn</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Tìm kiếm công ty theo tên và gửi đơn xin gia nhập. Trở thành <strong>HR Thành viên</strong> sau khi được duyệt.
            </p>
          </div>
          <div className="mt-4 flex items-center gap-1.5 text-xs font-bold text-teal-600 dark:text-teal-400 group-hover:underline">
            <span>Tìm kiếm công ty</span>
            <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>
      </div>

      {/* Main CTA Button */}
      <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
        <button
          type="button"
          onClick={() => onNavigateTab('company')}
          className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-primary-dark px-8 py-3.5 text-sm font-bold text-white shadow-xl shadow-primary/25 hover:from-primary-dark hover:to-primary active:scale-95 transition-all cursor-pointer"
        >
          <Building2 className="h-4.5 w-4.5" />
          <span>Đi đến Thiết lập & Quản lý Doanh nghiệp</span>
          <ArrowRight className="h-4.5 w-4.5" />
        </button>
      </div>
    </motion.div>
  );
}
