import React, { useState } from 'react';
import {
  Check,
  X as CloseIcon,
  Crown,
  Sparkles,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';

export type BillingCycle = 'monthly' | 'semi_annual' | 'annual';
export type PlanAudience = 'candidate' | 'hr';

interface PremiumPricingTableProps {
  audience: PlanAudience;
  currentPlan?: string;
  isUserPremium?: boolean;
  onSelectPlan: (planInfo: {
    planType: 'CANDIDATE_PREMIUM' | 'HR_PREMIUM';
    billingCycle: BillingCycle;
    price: number;
    originalPrice: number;
    title: string;
  }) => void;
}

export const PremiumPricingTable: React.FC<PremiumPricingTableProps> = ({
  audience,
  isUserPremium = false,
  onSelectPlan,
}) => {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('annual');

  // Pricing configuration
  const pricingData = {
    candidate: {
      free: {
        title: 'Tài khoản Thường',
        sub: 'Dành cho ứng viên mới bắt đầu tìm việc',
        priceMonthly: 0,
        priceSemiAnnual: 0,
        priceAnnual: 0,
      },
      verified: {
        title: 'Đã Xác Thực',
        sub: 'Tăng 2x độ tin cậy với nhà tuyển dụng',
        priceMonthly: 0,
        priceSemiAnnual: 0,
        priceAnnual: 0,
      },
      premium: {
        title: 'Candidate Premium',
        sub: 'Bứt phá sự nghiệp & tiếp cận NTD hàng đầu',
        badge: 'Khuyên Dùng - Phổ Biến Nhất',
        monthly: { price: 49000, original: 49000, periodText: '/ tháng', discount: '' },
        semi_annual: { price: 249000, original: 294000, periodText: '/ 6 tháng (41.500đ/tháng)', discount: 'Tiết kiệm 15%' },
        annual: { price: 399000, original: 588000, periodText: '/ 1 năm (33.250đ/tháng)', discount: 'Tiết kiệm 32%' },
      },
    },
    hr: {
      free: {
        title: 'HR Standard',
        sub: 'Dành cho nhà tuyển dụng đăng tin cơ bản',
        priceMonthly: 0,
        priceSemiAnnual: 0,
        priceAnnual: 0,
      },
      verified: {
        title: 'Doanh Nghiệp Xác Minh',
        sub: 'Tăng uy tín thương hiệu tuyển dụng',
        priceMonthly: 0,
        priceSemiAnnual: 0,
        priceAnnual: 0,
      },
      premium: {
        title: 'HR Premium Enterprise',
        sub: 'Tuyển dụng không giới hạn & AI Sourcing đỉnh cao',
        badge: 'Lựa Chọn Hàng Đầu Của HR Pro',
        monthly: { price: 299000, original: 299000, periodText: '/ tháng', discount: '' },
        semi_annual: { price: 1490000, original: 1794000, periodText: '/ 6 tháng (248.000đ/tháng)', discount: 'Tiết kiệm 17%' },
        annual: { price: 2390000, original: 3588000, periodText: '/ 1 năm (199.000đ/tháng)', discount: 'Tiết kiệm 33%' },
      },
    },
  };

  const isCandidate = audience === 'candidate';
  const candPricing = pricingData.candidate.premium[billingCycle];
  const hrPricing = pricingData.hr.premium[billingCycle];

  // Feature comparison matrix data (similar to the provided TopCV VIP reference image)
  const candidateMatrix = [
    {
      category: '1. Thời hạn & Dung lượng lưu trữ',
      features: [
        { name: 'Thời hạn sử dụng', free: 'Vĩnh viễn', verified: 'Vĩnh viễn', premium: billingCycle === 'annual' ? '1 Năm' : billingCycle === 'semi_annual' ? '6 Tháng' : '1 Tháng' },
        { name: 'Số lượng CV tạo tối đa', free: '3 CV', verified: '6 CV', premium: 'Không giới hạn (25+ CV)' },
        { name: 'Số lượng Cover Letter', free: '3 thư', verified: '6 thư', premium: 'Không giới hạn' },
        { name: 'Thời gian chờ tải & xuất PDF', free: '5s', verified: '3s', premium: 'Tức thì (1s - Ưu tiên)' },
      ],
    },
    {
      category: '2. Nâng cao Hiển thị & Độ uy tín',
      features: [
        { name: 'Ưu tiên đẩy Top hiển thị với NTD', free: false, verified: '1 lần/tháng', premium: '1 lần/ngày (Top 1 Search)' },
        { name: 'Biểu tượng tích xanh xác minh', free: false, verified: true, premium: true },
        { name: 'Sử dụng 100% mẫu CV Cao Cấp', free: false, verified: false, premium: true },
        { name: 'Sử dụng mẫu Cover Letter chuẩn Pro', free: false, verified: false, premium: true },
        { name: 'Xóa Watermark / Thương hiệu trên CV', free: false, verified: false, premium: true },
      ],
    },
    {
      category: '3. Trí tuệ Nhân tạo & Phân tích cơ hội',
      features: [
        { name: 'Chấm điểm CV bằng AI (ATS Score)', free: '1 lần/tháng', verified: '3 lần/tháng', premium: 'Không giới hạn' },
        { name: 'Gợi ý từ khóa tối ưu theo vị trí tuyển', free: false, verified: false, premium: true },
        { name: 'Xem thông tin mức độ cạnh tranh việc làm', free: '3 việc làm', verified: '5 việc làm', premium: 'Không giới hạn việc làm' },
        { name: 'Tự động ghép đôi việc làm tương thích >90%', free: false, verified: true, premium: true },
      ],
    },
    {
      category: '4. Đặc quyền & Quà tặng đối tác',
      features: [
        { name: 'Bộ khóa học Tin học VP (Word/Excel/PPT)', free: false, verified: false, premium: true },
        { name: 'Cẩm nang phỏng vấn & đàm phán lương', free: false, verified: false, premium: true },
        { name: 'Hỗ trợ sửa CV 1-1 qua chuyên gia', free: false, verified: false, premium: 'Ưu tiên phản hồi' },
      ],
    },
  ];

  const hrMatrix = [
    {
      category: '1. Hạn mức & Chiến dịch tuyển dụng',
      features: [
        { name: 'Hạn mức tin tuyển dụng hoạt động', free: 'Tối đa 6 tin cùng lúc', verified: 'Tối đa 6 tin cùng lúc', premium: 'KHÔNG GIỚI HẠN' },
        { name: 'Thời hạn hiển thị tin', free: '30 ngày', verified: '30 ngày', premium: 'Tùy chỉnh linh hoạt' },
        { name: 'Gắn nhãn HOT / VIP ngọn lửa nổi bật', free: false, verified: false, premium: true },
        { name: 'Tính năng Đẩy TOP tin lên đầu trang tìm kiếm', free: false, verified: false, premium: 'Không giới hạn (Đẩy bất kỳ lúc nào)' },
      ],
    },
    {
      category: '2. Tìm kiếm & Quản lý Ứng viên',
      features: [
        { name: 'Mở khóa toàn bộ SĐT, Email ứng viên', free: 'Xem CV đã ẩn', verified: '5 liên hệ/tháng', premium: 'Mở khóa 100% không giới hạn' },
        { name: 'Tìm kiếm ứng viên theo Skill nâng cao', free: 'Cơ bản', verified: 'Nâng cao', premium: 'Bộ lọc chuyên sâu AI' },
        { name: 'Tải trọn bộ CV ứng viên dạng ZIP/PDF', free: false, verified: true, premium: true },
        { name: 'Huy hiệu Doanh nghiệp VIP Uy tín', free: false, verified: true, premium: true },
      ],
    },
    {
      category: '3. Công nghệ AI Tuyển dụng',
      features: [
        { name: 'AI Sourcing & Đánh giá độ khớp CV (%)', free: '10 hồ sơ đầu', verified: '20 hồ sơ', premium: 'Tất cả hồ sơ tự động' },
        { name: 'Tự động gợi ý Top ứng viên tiềm năng', free: false, verified: false, premium: 'Gửi hàng ngày' },
        { name: 'Gợi ý câu hỏi phỏng vấn chuẩn kỹ năng', free: false, verified: false, premium: true },
      ],
    },
    {
      category: '4. Báo cáo & Hỗ trợ Doanh nghiệp',
      features: [
        { name: 'Xuất báo cáo tuyển dụng Excel/PDF', free: false, verified: true, premium: true },
        { name: 'Hóa đơn tài chính VAT điện tử hợp lệ', free: false, verified: true, premium: true },
        { name: 'Chuyên viên tư vấn Account Manager 1-1', free: false, verified: false, premium: 'Hỗ trợ 24/7' },
      ],
    },
  ];

  const activeMatrix = isCandidate ? candidateMatrix : hrMatrix;

  const handleSelectPackage = (isFreeOrVerified: boolean) => {
    if (isFreeOrVerified) return;
    if (isCandidate) {
      onSelectPlan({
        planType: 'CANDIDATE_PREMIUM',
        billingCycle,
        price: candPricing.price,
        originalPrice: candPricing.original,
        title: 'Candidate Premium',
      });
    } else {
      onSelectPlan({
        planType: 'HR_PREMIUM',
        billingCycle,
        price: hrPricing.price,
        originalPrice: hrPricing.original,
        title: 'HR Premium Enterprise',
      });
    }
  };

  return (
    <div className="space-y-12">
      {/* 1. Billing Cycle Segmented Switcher */}
      <div className="flex flex-col items-center justify-center gap-3">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Chọn chu kỳ thanh toán
        </span>
        <div className="inline-flex items-center rounded-2xl bg-slate-100 p-1.5 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 shadow-inner">
          <button
            type="button"
            onClick={() => setBillingCycle('monthly')}
            className={`rounded-xl px-4 sm:px-6 py-2.5 text-xs sm:text-sm font-bold transition-all duration-200 cursor-pointer ${
              billingCycle === 'monthly'
                ? 'bg-white text-primary shadow-sm dark:bg-slate-900 dark:text-primary-light'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            1 Tháng
          </button>
          <button
            type="button"
            onClick={() => setBillingCycle('semi_annual')}
            className={`relative rounded-xl px-4 sm:px-6 py-2.5 text-xs sm:text-sm font-bold transition-all duration-200 cursor-pointer ${
              billingCycle === 'semi_annual'
                ? 'bg-white text-primary shadow-sm dark:bg-slate-900 dark:text-primary-light'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            6 Tháng
            <span className="ml-1.5 inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-black text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
              -15%
            </span>
          </button>
          <button
            type="button"
            onClick={() => setBillingCycle('annual')}
            className={`relative rounded-xl px-4 sm:px-6 py-2.5 text-xs sm:text-sm font-bold transition-all duration-200 cursor-pointer ${
              billingCycle === 'annual'
                ? 'bg-primary text-white shadow-md shadow-primary/25'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            1 Năm
            <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-400 text-slate-950 px-2 py-0.5 text-[10px] font-extrabold shadow-2xs">
              Tiết kiệm 33% ⭐
            </span>
          </button>
        </div>
      </div>

      {/* 2. Top Plan Cards Summary (3 Cards) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
        {/* Card 1: Miễn phí / Thường */}
        <div className="relative flex flex-col justify-between rounded-3xl border border-slate-200/90 bg-white p-7 shadow-xs dark:border-slate-800 dark:bg-slate-900/80 transition-all hover:border-slate-300">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {isCandidate ? 'Thường' : 'HR Tiêu Chuẩn'}
              </h3>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                Miễn phí
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 min-h-[36px]">
              {isCandidate
                ? 'Trải nghiệm tìm việc và tạo CV cơ bản không mất phí.'
                : 'Tài khoản nhà tuyển dụng miễn phí tối đa 5 tin/ngày.'}
            </p>
            <div className="my-6 border-t border-b border-slate-100 dark:border-slate-800/80 py-4">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black text-slate-900 dark:text-white">0 đ</span>
                <span className="text-xs text-slate-400">/ vĩnh viễn</span>
              </div>
            </div>
            <ul className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>{isCandidate ? 'Tạo tối đa 3 CV cơ bản' : 'Đăng tối đa 5 tin tuyển dụng/ngày'}</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>{isCandidate ? 'Ứng tuyển việc làm trực tiếp' : 'Xem và duyệt hồ sơ ứng tuyển'}</span>
              </li>
              <li className="flex items-center gap-2 text-slate-400">
                <CloseIcon className="h-4 w-4 text-slate-300 dark:text-slate-600 shrink-0" />
                <span>{isCandidate ? 'Không ưu tiên đẩy Top hồ sơ' : 'Không có tính năng tin VIP / Nổi bật'}</span>
              </li>
            </ul>
          </div>
          <div className="mt-8 pt-4">
            <button
              type="button"
              disabled
              className="w-full rounded-2xl border border-slate-200 bg-slate-100 py-3 text-xs font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 cursor-not-allowed"
            >
              Đang sử dụng
            </button>
          </div>
        </div>

        {/* Card 2: Đã Xác Thực */}
        <div className="relative flex flex-col justify-between rounded-3xl border border-slate-200/90 bg-white p-7 shadow-xs dark:border-slate-800 dark:bg-slate-900/80 transition-all hover:border-slate-300">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {isCandidate ? 'Đã Xác Thực' : 'Doanh Nghiệp Đã Xác Minh'}
              </h3>
              <span className="flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-primary dark:bg-blue-950/50 dark:text-primary-light">
                <ShieldCheck className="h-3.5 w-3.5" />
                Xác thực
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 min-h-[36px]">
              {isCandidate
                ? 'Xác thực tài khoản qua Email & SĐT để tăng độ tin cậy với NTD.'
                : 'Xác minh thông tin doanh nghiệp (GPKD / MST) tăng uy tín.'}
            </p>
            <div className="my-6 border-t border-b border-slate-100 dark:border-slate-800/80 py-4">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black text-slate-900 dark:text-white">0 đ</span>
                <span className="text-xs text-slate-400">/ miễn phí xác thực</span>
              </div>
            </div>
            <ul className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>{isCandidate ? 'Huy hiệu hồ sơ đã xác thực' : 'Huy hiệu Công ty đã xác thực'}</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>{isCandidate ? 'Đẩy Top hồ sơ 1 lần/tháng' : 'Ưu tiên hiển thị tin 1 lần/tháng'}</span>
              </li>
              <li className="flex items-center gap-2 text-slate-400">
                <CloseIcon className="h-4 w-4 text-slate-300 dark:text-slate-600 shrink-0" />
                <span>{isCandidate ? 'Chưa mở khóa trọn bộ mẫu CV Pro' : 'Vẫn giới hạn 5 tin tuyển dụng/ngày'}</span>
              </li>
            </ul>
          </div>
          <div className="mt-8 pt-4">
            <button
              type="button"
              disabled
              className="w-full rounded-2xl border border-primary/30 bg-primary/5 py-3 text-xs font-bold text-primary dark:border-primary/40 dark:bg-primary/10 dark:text-primary-light"
            >
              Đã xác thực
            </button>
          </div>
        </div>

        {/* Card 3: PREMIUM (TALENTPULSE ROYAL BLUE HIGHLIGHTED CARD) */}
        <div className="relative flex flex-col justify-between rounded-3xl border-2 border-primary bg-gradient-to-b from-primary/5 via-white to-primary/10 p-7 shadow-xl shadow-primary/15 dark:from-primary/20 dark:via-slate-900 dark:to-primary/10 dark:border-primary-light">
          {/* Highlight Badge */}
          <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-gradient-to-r from-primary to-primary-dark px-4 py-1 text-[11px] font-black text-white shadow-md shadow-primary/30">
            <Crown className="h-3.5 w-3.5 text-amber-300" />
            <span>{isCandidate ? 'CANDIDATE PREMIUM' : 'HR ENTERPRISE'}</span>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-3 mt-1">
              <h3 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-500" />
                <span>{isCandidate ? 'Candidate Premium' : 'HR Premium'}</span>
              </h3>
              <span className="rounded-full bg-amber-400 text-slate-950 px-2.5 py-0.5 text-[11px] font-black shadow-2xs">
                PRO
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 font-medium min-h-[36px]">
              {isCandidate
                ? 'Mở khóa 100% đặc quyền: AI Chấm điểm, Mẫu CV Pro & Đẩy Top mỗi ngày.'
                : 'Đăng tin KHÔNG GIỚI HẠN, Mở khóa SĐT ứng viên & AI Sourcing tự động.'}
            </p>

            {/* Price section */}
            <div className="my-6 border-t border-b border-primary/20 dark:border-primary/30 py-4 bg-primary/5 dark:bg-primary/10 rounded-2xl px-4">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-black text-primary dark:text-primary-light tracking-tight">
                  {(isCandidate ? candPricing.price : hrPricing.price).toLocaleString('vi-VN')} đ
                </span>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {isCandidate ? candPricing.periodText : hrPricing.periodText}
                </span>
              </div>
              {((isCandidate && candPricing.original > candPricing.price) ||
                (!isCandidate && hrPricing.original > hrPricing.price)) && (
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-xs text-slate-400 line-through">
                    {(isCandidate ? candPricing.original : hrPricing.original).toLocaleString('vi-VN')} đ
                  </span>
                  <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400">
                    {isCandidate ? candPricing.discount : hrPricing.discount}
                  </span>
                </div>
              )}
            </div>

            {/* Features Highlight */}
            <ul className="space-y-3 text-xs text-slate-700 dark:text-slate-200 font-medium">
              <li className="flex items-center gap-2">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white shrink-0 shadow-2xs">
                  <Check className="h-3.5 w-3.5" />
                </div>
                <strong className="text-primary dark:text-primary-light">
                  {isCandidate ? 'Đẩy Top hồ sơ 1 lần/ngày' : 'Đăng tin KHÔNG GIỚI HẠN (bỏ giới hạn 5 tin)'}
                </strong>
              </li>
              <li className="flex items-center gap-2">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white shrink-0 shadow-2xs">
                  <Check className="h-3.5 w-3.5" />
                </div>
                <span>{isCandidate ? 'Mở khóa 50+ mẫu CV & Cover Letter Pro' : 'Mở khóa 100% SĐT, Email ứng viên trực tiếp'}</span>
              </li>
              <li className="flex items-center gap-2">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white shrink-0 shadow-2xs">
                  <Check className="h-3.5 w-3.5" />
                </div>
                <span>{isCandidate ? 'AI CV ATS Scoring & Phân tích cạnh tranh' : 'AI Sourcing & Đánh giá khớp CV tự động'}</span>
              </li>
              <li className="flex items-center gap-2">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white shrink-0 shadow-2xs">
                  <Check className="h-3.5 w-3.5" />
                </div>
                <span>{isCandidate ? 'Xuất PDF không logo & Tốc độ siêu tốc' : 'Hóa đơn VAT điện tử & Hỗ trợ 1-1'}</span>
              </li>
            </ul>
          </div>

          <div className="mt-8 pt-4">
            <button
              type="button"
              onClick={() => handleSelectPackage(false)}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-primary-dark hover:from-primary-dark hover:to-primary py-3.5 text-sm font-extrabold text-white shadow-lg shadow-primary/30 transition-all duration-300 hover:scale-[1.02] active:scale-95 cursor-pointer"
            >
              <span>{isUserPremium ? 'Gia Hạn Gói Premium' : 'Nâng Cấp Ngay'}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 3. Full Feature Comparison Matrix (Detailed Table inspired by User's Reference Image) */}
      <div className="rounded-3xl border border-slate-200/90 bg-white overflow-hidden shadow-xs dark:border-slate-800 dark:bg-slate-900/90">
        <div className="p-6 sm:p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-primary dark:text-primary-light">
                So sánh chi tiết quyền lợi
              </span>
              <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
                Bảng Đối Chiếu Tính Năng Theo Loại Tài Khoản
              </h3>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Cập nhật liên tục &bull; Kích hoạt tức thì 24/7
            </div>
          </div>
        </div>

        {/* The Matrix Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            {/* Table Header */}
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/90 dark:border-slate-800 dark:bg-slate-800/60 text-xs font-extrabold text-slate-700 dark:text-slate-200">
                <th className="py-4.5 px-6 w-2/5">Tính năng & Quyền lợi</th>
                <th className="py-4.5 px-4 text-center w-1/5">
                  <div className="font-bold text-slate-700 dark:text-slate-300">Thường</div>
                  <div className="text-[11px] font-normal text-slate-500">Miễn phí</div>
                </th>
                <th className="py-4.5 px-4 text-center w-1/5">
                  <div className="font-bold text-slate-700 dark:text-slate-300">Đã Xác Thực</div>
                  <div className="text-[11px] font-normal text-slate-500">Miễn phí</div>
                </th>
                <th className="py-4.5 px-4 text-center w-1/5 bg-primary/10 dark:bg-primary/20 border-l border-r border-primary/20">
                  <div className="flex items-center justify-center gap-1 text-primary dark:text-primary-light font-black">
                    <Crown className="h-3.5 w-3.5 text-amber-500" />
                    <span>{isCandidate ? 'Candidate Premium' : 'HR Premium'}</span>
                  </div>
                  <div className="text-[11px] font-extrabold text-primary dark:text-primary-light">
                    {(isCandidate ? candPricing.price : hrPricing.price).toLocaleString('vi-VN')} đ
                  </div>
                </th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs sm:text-sm">
              {activeMatrix.map((cat, catIdx) => (
                <React.Fragment key={catIdx}>
                  {/* Category Header Row */}
                  <tr className="bg-slate-100/70 dark:bg-slate-800/80 font-extrabold text-slate-900 dark:text-white">
                    <td colSpan={4} className="py-3 px-6 text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      {cat.category}
                    </td>
                  </tr>

                  {/* Feature Rows */}
                  {cat.features.map((feat, featIdx) => (
                    <tr
                      key={featIdx}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      {/* Feature Name */}
                      <td className="py-3.5 px-6 font-medium text-slate-800 dark:text-slate-200">
                        {feat.name}
                      </td>

                      {/* Free Column */}
                      <td className="py-3.5 px-4 text-center text-slate-600 dark:text-slate-400">
                        {typeof feat.free === 'boolean' ? (
                          feat.free ? (
                            <Check className="h-4 w-4 text-emerald-500 mx-auto" />
                          ) : (
                            <span className="text-slate-300 dark:text-slate-600">&mdash;</span>
                          )
                        ) : (
                          feat.free
                        )}
                      </td>

                      {/* Verified Column */}
                      <td className="py-3.5 px-4 text-center text-slate-600 dark:text-slate-400">
                        {typeof feat.verified === 'boolean' ? (
                          feat.verified ? (
                            <Check className="h-4 w-4 text-emerald-500 mx-auto" />
                          ) : (
                            <span className="text-slate-300 dark:text-slate-600">&mdash;</span>
                          )
                        ) : (
                          feat.verified
                        )}
                      </td>

                      {/* Premium Column (Highlighted) */}
                      <td className="py-3.5 px-4 text-center font-bold text-primary dark:text-primary-light bg-primary/5 dark:bg-primary/15 border-l border-r border-primary/20">
                        {typeof feat.premium === 'boolean' ? (
                          feat.premium ? (
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white mx-auto shadow-2xs">
                              <Check className="h-3.5 w-3.5" />
                            </div>
                          ) : (
                            <span className="text-slate-300 dark:text-slate-600">&mdash;</span>
                          )
                        ) : (
                          <span className="font-extrabold text-primary dark:text-primary-light">
                            {feat.premium}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}

              {/* Bottom Sticky Action Row */}
              <tr className="bg-slate-50/90 dark:bg-slate-800/80 border-t-2 border-slate-200 dark:border-slate-700">
                <td className="py-5 px-6 font-bold text-slate-700 dark:text-slate-300">
                  Lựa chọn gói phù hợp
                </td>
                <td className="py-5 px-4 text-center">
                  <button
                    disabled
                    className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-xs font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                  >
                    Đang dùng
                  </button>
                </td>
                <td className="py-5 px-4 text-center">
                  <button
                    disabled
                    className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-2 text-xs font-bold text-primary dark:border-primary/30 dark:bg-primary/10 dark:text-primary-light"
                  >
                    Đã xác thực
                  </button>
                </td>
                <td className="py-5 px-4 text-center bg-primary/10 dark:bg-primary/20 border-l border-r border-primary/20">
                  <button
                    type="button"
                    onClick={() => handleSelectPackage(false)}
                    className="rounded-xl bg-primary hover:bg-primary-dark px-5 py-2.5 text-xs font-black text-white shadow-md shadow-primary/30 transition-all active:scale-95 cursor-pointer"
                  >
                    Nâng cấp ngay
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
