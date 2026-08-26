import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Crown,
  CheckCircle2,
  ShieldCheck,
  ArrowRight,
  ReceiptText,
  Loader2,
  QrCode,
  Lock,
} from 'lucide-react';
import { BillingCycle } from './PremiumPricingTable';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../auth/AuthContext';
import { paymentApi } from '../../lib/paymentApi';

import { WaitingPaymentInfo } from './PaymentWaitingModal';

interface PremiumCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  planInfo: {
    planType: 'CANDIDATE_PREMIUM' | 'HR_PREMIUM';
    billingCycle: BillingCycle;
    price: number;
    originalPrice: number;
    title: string;
  } | null;
  userEmail?: string;
  userName?: string;
  onPaymentCreated?: (paymentInfo: WaitingPaymentInfo) => void;
}

export const PremiumCheckoutModal: React.FC<PremiumCheckoutModalProps> = ({
  isOpen,
  onClose,
  planInfo,
  onPaymentCreated,
}) => {
  const { accessToken } = useAuth();
  const { error: toastError, success: toastSuccess } = useToast();

  const [needVatInvoice, setNeedVatInvoice] = useState(false);
  const [companyTaxCode, setCompanyTaxCode] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen || !planInfo) return null;

  const isHr = planInfo.planType === 'HR_PREMIUM';
  const cycleText =
    planInfo.billingCycle === 'annual'
      ? 'Gói 1 Năm (Tiết kiệm 33%)'
      : planInfo.billingCycle === 'semi_annual'
      ? 'Gói 6 Tháng (Tiết kiệm 15%)'
      : 'Gói 1 Tháng';

  const discountAmount =
    planInfo.originalPrice > planInfo.price
      ? planInfo.originalPrice - planInfo.price
      : 0;

  const handleCreatePayosOrder = async () => {
    if (!accessToken) {
      toastError('Vui lòng đăng nhập để thực hiện thanh toán.');
      return;
    }

    if (needVatInvoice) {
      if (!companyTaxCode.trim() || !companyName.trim()) {
        toastError('Vui lòng nhập Mã số thuế và Tên công ty để xuất hóa đơn VAT.');
        return;
      }
    }

    try {
      setIsProcessing(true);

      const result = await paymentApi.createPaymentOrder(accessToken, {
        planType: planInfo.planType,
        billingCycle: planInfo.billingCycle,
        vatInvoiceRequested: needVatInvoice,
        vatCompanyName: needVatInvoice ? companyName.trim() : undefined,
        vatTaxCode: needVatInvoice ? companyTaxCode.trim() : undefined,
        vatAddress: needVatInvoice ? companyAddress.trim() : undefined,
      });

      if (result?.checkoutUrl) {
        // Open PayOS checkout in a new tab without navigating away
        window.open(result.checkoutUrl, '_blank', 'noopener,noreferrer');
        setIsProcessing(false);
        onClose();
        if (onPaymentCreated) {
          onPaymentCreated({
            orderCode: result.orderCode,
            amount: result.amount || planInfo.price,
            planTitle: planInfo.title,
            checkoutUrl: result.checkoutUrl,
            expiresAt: result.expiresAt,
            planType: planInfo.planType,
          });
        } else {
          toastSuccess('Đã mở trang thanh toán PayOS trong tab mới.', 'Vui lòng hoàn tất thanh toán trên tab vừa mở.');
        }
      } else {
        throw new Error('Không nhận được liên kết thanh toán từ PayOS');
      }
    } catch (err: any) {
      setIsProcessing(false);
      toastError(err?.message || 'Không thể tạo đơn hàng thanh toán PayOS. Vui lòng thử lại.');
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
        onClick={() => !isProcessing && onClose()}
      />

      {/* Modal Container */}
      <div className="relative z-10 w-full max-w-xl overflow-hidden rounded-3xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200/80 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200">
        {/* Header with Royal Blue Gradient */}
        <div className="relative bg-gradient-to-r from-slate-900 via-primary-dark to-primary p-6 text-white overflow-hidden">
          <div className="pointer-events-none absolute -right-10 -bottom-10 h-36 w-36 rounded-full bg-white/10 blur-xl" />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 shadow-inner">
                <Crown className="h-6 w-6 text-amber-400" />
              </div>
              <div>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-amber-300">
                  Cổng Thanh Toán PayOS &bull; Tự Động 24/7
                </span>
                <h3 className="text-xl font-black text-white leading-tight">
                  Xác Nhận Nâng Cấp Gói Premium
                </h3>
              </div>
            </div>

            <button
              onClick={() => !isProcessing && onClose()}
              disabled={isProcessing}
              className="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 sm:p-7 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Order Summary Card */}
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-5 border border-slate-200/80 dark:border-slate-700/60 space-y-3.5">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  Gói dịch vụ
                </span>
                <h4 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2 mt-0.5">
                  {planInfo.title}
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-black text-primary dark:bg-primary/20 dark:text-primary-light border border-primary/20">
                    {isHr ? 'HR ENTERPRISE' : 'CANDIDATE PREMIUM'}
                  </span>
                </h4>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  Chu kỳ
                </span>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                  {cycleText}
                </p>
              </div>
            </div>

            <div className="border-t border-slate-200/80 dark:border-slate-700/60 pt-3 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Giá gốc:</span>
                <span className="line-through font-semibold">
                  {planInfo.originalPrice.toLocaleString('vi-VN')} đ
                </span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-bold">
                  <span>Ưu đãi gói chu kỳ:</span>
                  <span>-{discountAmount.toLocaleString('vi-VN')} đ</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-black text-slate-900 dark:text-white pt-1 border-t border-dashed border-slate-200 dark:border-slate-700">
                <span>Tổng thanh toán:</span>
                <span className="text-lg text-primary dark:text-primary-light">
                  {planInfo.price.toLocaleString('vi-VN')} đ
                </span>
              </div>
            </div>
          </div>

          {/* PayOS Gateway Branding Card */}
          <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 dark:bg-primary/10 p-4 sm:p-5">
            <div className="flex items-center gap-3.5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white dark:bg-slate-800 text-primary shadow-sm border border-primary/20 shrink-0">
                <QrCode className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-slate-900 dark:text-white text-sm">
                    Thanh Toán Tự Động Qua PayOS
                  </span>
                  <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-black text-emerald-600 dark:text-emerald-400">
                    Kích hoạt tức thì
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                  Hỗ trợ quét mã VietQR trên mọi ngân hàng, thẻ ATM nội địa &amp; thẻ Quốc tế 24/7.
                </p>
              </div>
            </div>
          </div>

          {/* VAT Invoice Accordion */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 transition-all">
            <label className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-2.5">
                <ReceiptText className="h-4 w-4 text-slate-500" />
                <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
                  Xuất hóa đơn tài chính VAT (Điện tử)
                </span>
              </div>
              <input
                type="checkbox"
                checked={needVatInvoice}
                onChange={(e) => setNeedVatInvoice(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
              />
            </label>

            {needVatInvoice && (
              <div className="mt-3.5 space-y-2.5 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Mã số thuế doanh nghiệp *
                  </label>
                  <input
                    type="text"
                    value={companyTaxCode}
                    onChange={(e) => setCompanyTaxCode(e.target.value)}
                    placeholder="VD: 0101234567"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Tên công ty / Doanh nghiệp *
                  </label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="VD: CÔNG TY CỔ PHẦN CÔNG NGHỆ TALENTPULSE"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Địa chỉ công ty
                  </label>
                  <input
                    type="text"
                    value={companyAddress}
                    onChange={(e) => setCompanyAddress(e.target.value)}
                    placeholder="VD: Tầng 12, Tòa nhà Keangnam, Hà Nội"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Security & Guarantee Badges */}
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 px-1">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
              Bảo mật SSL 256-bit
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
              Hoàn tiền 100% trong 7 ngày
            </span>
          </div>

          {/* Action Buttons */}
          <div className="pt-2">
            <button
              onClick={handleCreatePayosOrder}
              disabled={isProcessing}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-gradient-to-r from-primary to-primary-dark text-white font-extrabold text-sm sm:text-base shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/35 active:scale-98 transition-all cursor-pointer disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Đang kết nối PayOS Gateway...</span>
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" />
                  <span>Thanh Toán Ngay &bull; {planInfo.price.toLocaleString('vi-VN')} đ</span>
                  <ArrowRight className="h-4 w-4 ml-1" />
                </>
              )}
            </button>
            <p className="text-[11px] text-center text-slate-400 mt-2.5">
              Bằng việc bấm thanh toán, bạn đồng ý với Điều khoản dịch vụ &amp; Chính sách bảo mật của TalentPulse.
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
