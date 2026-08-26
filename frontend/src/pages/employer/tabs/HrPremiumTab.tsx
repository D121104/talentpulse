import React, { useState } from 'react';
import {
  Crown,
  Sparkles,
  Zap,
  Building2,
  ReceiptText,
  Headphones,
} from 'lucide-react';
import {
  PremiumPricingTable,
} from '../../../components/premium/PremiumPricingTable';
import { PremiumCheckoutModal } from '../../../components/premium/PremiumCheckoutModal';
import { PaymentWaitingModal, WaitingPaymentInfo } from '../../../components/premium/PaymentWaitingModal';
import { HrDashboardStats } from '../../../lib/employerApi';
import { useAuth } from '../../../auth/AuthContext';

interface HrPremiumTabProps {
  statsData: HrDashboardStats | null;
  accessToken: string | null;
  onRefreshStats: () => Promise<void>;
}

export const HrPremiumTab: React.FC<HrPremiumTabProps> = ({
  statsData,
}) => {
  const { user } = useAuth();
  const [selectedPlanInfo, setSelectedPlanInfo] = useState<any | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [waitingPayment, setWaitingPayment] = useState<WaitingPaymentInfo | null>(null);

  const isPremium = statsData?.isPremium ?? false;
  const planName = statsData?.premiumPlan ?? 'FREE';
  const todayPostedCount = statsData?.stats?.todayJobsPostedCount ?? 0;
  const maxDailyJobs = statsData?.stats?.maxDailyJobs ?? 5;

  const handleSelectPlan = (planInfo: any) => {
    setSelectedPlanInfo(planInfo);
    setIsCheckoutOpen(true);
  };

  return (
    <div className="space-y-8 animate-fade-in-up pb-12">
      {/* 1. Header Banner & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-3xl border border-slate-200/90 bg-white p-6 sm:p-8 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
              <Crown className="h-5 w-5" />
            </span>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Gói Dịch Vụ &amp; Đăng Ký HR Premium
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Mở rộng chiến dịch tuyển dụng, tiếp cận không giới hạn ứng viên tài năng cùng công nghệ AI.
          </p>
        </div>

        {/* Current Status Pill */}
        <div>
          {isPremium ? (
            <div className="flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-black text-amber-700 dark:text-amber-300">
              <Crown className="h-4 w-4 text-amber-500" />
              <span>Gói Hiện Tại: HR Premium (Không Giới Hạn)</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <span className="h-2 w-2 rounded-full bg-slate-400" />
              <span>
                Gói Hiện Tại: Standard ({todayPostedCount}/{maxDailyJobs} tin hôm nay)
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 2. Highlights for Employer */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 dark:border-primary/30 dark:bg-primary/10 space-y-2">
          <div className="flex items-center gap-2 text-primary dark:text-primary-light font-bold text-sm">
            <Zap className="h-4.5 w-4.5" />
            <span>Đăng Tin Không Giới Hạn</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Dỡ bỏ hoàn toàn giới hạn 5 tin/ngày, tạo và quản lý hàng chục vị trí tuyển dụng đồng thời.
          </p>
        </div>

        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 dark:border-primary/30 dark:bg-primary/10 space-y-2">
          <div className="flex items-center gap-2 text-primary dark:text-primary-light font-bold text-sm">
            <Building2 className="h-4.5 w-4.5" />
            <span>Mở Khóa Thông Tin Ứng Viên</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Xem trọn vẹn số điện thoại, email và portfolio của ứng viên tiềm năng để liên hệ phỏng vấn trực tiếp.
          </p>
        </div>

        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 dark:border-primary/30 dark:bg-primary/10 space-y-2">
          <div className="flex items-center gap-2 text-primary dark:text-primary-light font-bold text-sm">
            <ReceiptText className="h-4.5 w-4.5" />
            <span>Xuất Hóa Đơn VAT Điện Tử</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Cung cấp đầy đủ hóa đơn tài chính VAT hợp lệ cho doanh nghiệp, khấu trừ thuế GTGT dễ dàng.
          </p>
        </div>
      </div>

      {/* 3. Pricing & Feature Matrix */}
      <div className="rounded-3xl border border-slate-200/90 bg-white p-6 sm:p-8 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
        <PremiumPricingTable
          audience="hr"
          currentPlan={planName}
          isUserPremium={isPremium}
          onSelectPlan={handleSelectPlan}
        />
      </div>

      {/* 4. Enterprise Custom Contract CTA */}
      <div className="rounded-3xl border border-slate-200/90 bg-gradient-to-r from-slate-900 to-slate-800 p-6 sm:p-8 text-white flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xl">
        <div className="space-y-1 text-center sm:text-left">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold text-amber-300 mb-2">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Doanh Nghiệp &amp; Tập Đoàn Lớn</span>
          </div>
          <h3 className="text-lg sm:text-xl font-extrabold">
            Cần Tư Vấn Gói Doanh Nghiệp Tùy Chỉnh (Enterprise Custom)?
          </h3>
          <p className="text-xs text-slate-300 max-w-xl">
            Nếu công ty của bạn có quy mô tuyển dụng lớn trên 100+ vị trí hoặc cần tích hợp API hệ thống ATS riêng, hãy liên hệ ngay với đội ngũ chuyên gia của chúng tôi.
          </p>
        </div>

        <button
          type="button"
          onClick={() => handleSelectPlan({
            planType: 'HR_PREMIUM',
            billingCycle: 'annual',
            price: 2390000,
            originalPrice: 3588000,
            title: 'HR Premium Enterprise (1 Năm)',
          })}
          className="flex items-center gap-2 rounded-2xl bg-white hover:bg-slate-100 text-slate-900 px-6 py-3 text-xs font-black shadow-lg transition active:scale-95 cursor-pointer shrink-0"
        >
          <Headphones className="h-4 w-4 text-primary" />
          <span>Liên Hệ Tư Vấn 1-1</span>
        </button>
      </div>

      {/* Checkout Modal */}
      <PremiumCheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        planInfo={selectedPlanInfo}
        userEmail={user?.email}
        userName={user?.name}
        onPaymentCreated={(info) => {
          setWaitingPayment(info);
        }}
      />

      {/* Waiting for Payment Countdown Modal */}
      <PaymentWaitingModal
        isOpen={!!waitingPayment}
        onClose={() => setWaitingPayment(null)}
        paymentInfo={waitingPayment}
      />
    </div>
  );
};
