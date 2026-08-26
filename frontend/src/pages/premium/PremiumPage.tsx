import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import {
  PremiumPricingTable,
} from '../../components/premium/PremiumPricingTable';
import { PremiumCheckoutModal } from '../../components/premium/PremiumCheckoutModal';
import { PaymentWaitingModal, WaitingPaymentInfo } from '../../components/premium/PaymentWaitingModal';
import { useAuth } from '../../auth/AuthContext';
import {
  Crown,
  Zap,
  ShieldCheck,
  ChevronDown,
  TrendingUp,
  Headphones,
} from 'lucide-react';

export default function PremiumPage() {
  const { user } = useAuth();

  // If user is HR, redirect them directly to their dedicated HR Premium dashboard tab
  if (user?.role === 'HR') {
    return <Navigate to="/dashboard?tab=premium" replace />;
  }

  const [selectedPlanInfo, setSelectedPlanInfo] = useState<any | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [waitingPayment, setWaitingPayment] = useState<WaitingPaymentInfo | null>(null);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const faqs = [
    {
      q: 'Gói Candidate Premium được kích hoạt trong bao lâu sau khi thanh toán?',
      a: 'Tài khoản của bạn sẽ được nâng cấp tức thì (dưới 30 giây) ngay khi hệ thống ghi nhận giao dịch thành công qua PayOS, MoMo hoặc Chuyển khoản ngân hàng 24/7.',
    },
    {
      q: 'Gói Candidate Premium có giúp tôi tìm được việc làm nhanh hơn không?',
      a: 'Theo thống kê thực tế, hồ sơ ứng viên sở hữu huy hiệu Premium và tính năng Đẩy Top hồ sơ nhận được tỷ lệ xem CV cao hơn gấp 5.2 lần và nhận lời mời phỏng vấn nhanh hơn 3 lần so với tài khoản thông thường.',
    },
    {
      q: 'Tính năng AI Chấm điểm & Gợi ý từ khóa ATS hoạt động như thế nào?',
      a: 'Hệ thống AI sẽ tự động phân tích CV của bạn dựa trên hàng nghìn vị trí tuyển dụng thực tế, chấm điểm tương thích theo thang điểm 100 và gợi ý các từ khóa chuyên môn giúp CV luôn nổi bật trong mắt nhà tuyển dụng.',
    },
    {
      q: 'Tôi có thể tạo và tải bao nhiêu mẫu CV khi nâng cấp gói Premium?',
      a: 'Bạn được mở khóa 100% toàn bộ kho mẫu CV chuyên nghiệp, tạo không giới hạn CV & Cover Letter và xuất file PDF chất lượng cao không gắn logo thương hiệu.',
    },
    {
      q: 'Chính sách hoàn tiền và hỗ trợ ứng viên như thế nào?',
      a: 'Chúng tôi cam kết hoàn tiền 100% trong vòng 7 ngày đầu tiên nếu bạn không hài lòng với trải nghiệm dịch vụ. Đội ngũ chuyên viên luôn sẵn sàng hỗ trợ bạn 24/7.',
    },
  ];

  const handleSelectPlan = (planInfo: any) => {
    setSelectedPlanInfo(planInfo);
    setIsCheckoutOpen(true);
  };

  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100">
      <Header />

      <main className="flex-1 pt-24 pb-20">
        {/* ========================================================================= */}
        {/* 1. HERO SECTION FOR CANDIDATE PREMIUM                                     */}
        {/* ========================================================================= */}
        <section className="relative overflow-hidden pt-8 pb-14 text-center">
          {/* Subtle Background Glows */}
          <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-96 w-[700px] rounded-full bg-primary/10 dark:bg-primary/20 blur-3xl" />

          <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 space-y-5">
            {/* Top Pill Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-black text-primary dark:border-primary/30 dark:bg-primary/15 dark:text-primary-light shadow-xs">
              <Crown className="h-4 w-4 text-amber-500" />
              <span>GÓI ĐĂNG KÝ CANDIDATE PREMIUM</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-slate-900 dark:text-white leading-[1.15]">
              Nâng Tầm Sự Nghiệp &amp; <br className="hidden sm:inline" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-primary-light to-blue-600 dark:from-primary-light dark:via-blue-400 dark:to-cyan-400">
                Tiếp Cận Nhà Tuyển Dụng Hàng Đầu
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed">
              Đẩy Top hồ sơ mỗi ngày, mở khóa toàn bộ 50+ mẫu CV Cao Cấp và tự động chấm điểm độ khớp công việc bằng Trí tuệ Nhân tạo AI.
            </p>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* 2. PRICING CARDS & DETAILED MATRIX TABLE (CANDIDATE ONLY)                 */}
        {/* ========================================================================= */}
        <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <PremiumPricingTable
            audience="candidate"
            currentPlan={user?.premiumPlan}
            isUserPremium={user?.isPremium}
            onSelectPlan={handleSelectPlan}
          />
        </section>

        {/* ========================================================================= */}
        {/* 3. VALUE PROPOSITIONS & BENTO HIGHLIGHTS                                  */}
        {/* ========================================================================= */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 mt-20">
          <div className="text-center mb-12 space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-primary dark:text-primary-light">
              Đặc quyền vượt trội
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
              Tại Sao Nên Nâng Cấp Gói Tài Khoản Tại TalentPulse?
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Bento Card 1 */}
            <div className="rounded-3xl border border-slate-200/90 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 shadow-xs space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light">
                <Zap className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Công Nghệ AI Matching Chuẩn ATS
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Tự động quét, phân tích và chấm điểm độ tương đồng giữa CV và yêu cầu công việc, đưa ra đề xuất tối ưu từ khóa giúp hồ sơ luôn vượt qua bộ lọc ATS.
              </p>
            </div>

            {/* Bento Card 2 */}
            <div className="rounded-3xl border border-slate-200/90 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 shadow-xs space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light">
                <TrendingUp className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Ưu Tiên Đẩy Top Tiếp Cận Hàng Ngày
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Hồ sơ ứng viên và tin tuyển dụng của bạn luôn được gắn huy hiệu nổi bật và ưu tiên đứng đầu danh sách tìm kiếm, tăng 500% lượt xem và tương tác.
              </p>
            </div>

            {/* Bento Card 3 */}
            <div className="rounded-3xl border border-slate-200/90 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 shadow-xs space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light">
                <Headphones className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Hỗ Trợ 1-1 Chuyên Nghiệp 24/7
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Đội ngũ chuyên gia nhân sự và Account Manager hỗ trợ sửa CV, tư vấn chiến lược đăng tin tuyển dụng và xuất hóa đơn VAT điện tử nhanh chóng.
              </p>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* 4. FAQ ACCORDION SECTION                                                  */}
        {/* ========================================================================= */}
        <section className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 mt-20">
          <div className="text-center mb-10 space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-primary dark:text-primary-light">
              Giải đáp thắc mắc
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
              Câu Hỏi Thường Gặp
            </h2>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div
                  key={idx}
                  className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white dark:border-slate-800 dark:bg-slate-900 transition-all"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    className="flex w-full items-center justify-between p-5 text-left text-sm sm:text-base font-bold text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                  >
                    <span>{faq.q}</span>
                    <ChevronDown
                      className={`h-5 w-5 text-slate-400 transition-transform duration-200 shrink-0 ml-3 ${
                        isOpen ? 'rotate-180 text-primary' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 pt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800 leading-relaxed animate-fade-in">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ========================================================================= */}
        {/* 5. GUARANTEE BANNER                                                       */}
        {/* ========================================================================= */}
        <section className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 mt-16">
          <div className="rounded-3xl border border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-5 dark:border-primary/30 dark:from-primary/20 dark:via-primary/10">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-white shrink-0 shadow-lg shadow-primary/30">
              <ShieldCheck className="h-8 w-8" />
            </div>
            <div className="space-y-1 text-center sm:text-left">
              <h4 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Cam Kết An Toàn &amp; Bảo Mật Tuyệt Đối 100%
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Toàn bộ giao dịch đều được mã hóa SSL 256-bit qua cổng thanh toán bảo mật VNPAY / MoMo. Hỗ trợ kích hoạt tức thì và hoàn tiền 100% trong 7 ngày nếu không hài lòng.
              </p>
            </div>
          </div>
        </section>
      </main>

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

      <Footer />
    </div>
  );
}
