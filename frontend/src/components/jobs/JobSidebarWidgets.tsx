import { Link } from 'react-router-dom';
import {
  Sparkles,
  Building2,
  TrendingUp,
  Crown,
  FileText,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';

interface JobSidebarWidgetsProps {
  onSelectSkill?: (skill: string) => void;
  onSelectCompany?: (companyId: string) => void;
}

export const TOP_COMPANIES = [
  {
    _id: 'softroad',
    name: 'CÔNG TY TNHH SOFTROAD',
    logo: 'https://cdn-new.topcv.vn/unsafe/150x/https://static.topcv.vn/company_logos/3b55ceb292c31e9c80d859a72173cf58-656557e4e1dfa.jpg',
    openJobs: 8,
    location: 'Hà Nội',
  },
  {
    _id: 'viettel',
    name: 'Tổng Công ty Dịch vụ Số Viettel',
    logo: 'https://cdn-new.topcv.vn/unsafe/150x/https://static.topcv.vn/company_logos/52c6f1a80d50711eb44ea0951bc4f63c-66f62b662d5eb.jpg',
    openJobs: 15,
    location: 'Toàn quốc',
  },
  {
    _id: 'fpt',
    name: 'FPT Software',
    logo: 'https://cdn-new.topcv.vn/unsafe/150x/https://static.topcv.vn/company_logos/fpt-software-605d8f635aa94.jpg',
    openJobs: 24,
    location: 'Hà Nội, TP.HCM, Đà Nẵng',
  },
  {
    _id: 'vng',
    name: 'VNG Corporation',
    logo: 'https://cdn-new.topcv.vn/unsafe/150x/https://static.topcv.vn/company_logos/vng-corporation-5c4a7e37130df.jpg',
    openJobs: 12,
    location: 'Hồ Chí Minh',
  },
];

export const SKILL_CLOUD = [
  'ReactJS',
  'NodeJS',
  'TypeScript',
  'Fullstack',
  'Python',
  'Django',
  'Java',
  'Spring Boot',
  'Golang',
  'Docker',
  'Kubernetes',
  'AWS',
  'DevOps',
  'PostgreSQL',
  'MongoDB',
  'Redis',
  'Kafka',
  'NextJS',
  'VueJS',
  'NestJS',
  'Flutter',
  'React Native',
];

export default function JobSidebarWidgets({
  onSelectSkill,
}: JobSidebarWidgetsProps) {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      {/* WIDGET 1: AI CV MATCHING PROMPT */}
      <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-primary to-indigo-700 rounded-2xl p-5 text-white shadow-xl shadow-primary/15">
        {/* Glow decorative */}
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-white/10 rounded-full blur-xl pointer-events-none" />

        <div className="relative z-10">
          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-white/15 text-white backdrop-blur-md mb-3 border border-white/20">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            TalentPulse AI Match
          </div>

          <h3 className="text-base font-bold text-white leading-snug">
            Tìm việc làm phù hợp chính xác theo CV của bạn
          </h3>

          <p className="mt-1.5 text-xs text-blue-100/90 leading-relaxed">
            AI tự động phân tích kỹ năng, số năm kinh nghiệm và gợi ý công việc
            khớp đến 95%.
          </p>

          <div className="mt-4 flex flex-col gap-2">
            {user ? (
              <Link
                to="/my-cv"
                className="w-full py-2.5 px-4 bg-white hover:bg-blue-50 text-primary font-bold text-xs rounded-xl transition-all shadow-md text-center flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                Quản lý CV & Xem gợi ý
              </Link>
            ) : (
              <>
                <Link
                  to="/cv-templates"
                  className="w-full py-2.5 px-4 bg-white hover:bg-blue-50 text-primary font-bold text-xs rounded-xl transition-all shadow-md text-center flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Tạo CV Online Miễn Phí
                </Link>
                <Link
                  to="/login"
                  className="w-full py-2 px-3 bg-white/15 hover:bg-white/25 text-white font-medium text-xs rounded-xl transition-colors text-center backdrop-blur-md"
                >
                  Đăng nhập để AI gợi ý
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* WIDGET 2: TOP EMPLOYERS SPOTLIGHT */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
              Công ty hàng đầu
            </h3>
          </div>
          <span className="text-[11px] font-semibold text-primary">Nổi bật</span>
        </div>

        <div className="mt-3 space-y-3">
          {TOP_COMPANIES.map((company) => (
            <div
              key={company._id}
              className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors group cursor-pointer border border-transparent hover:border-slate-200/80 dark:hover:border-slate-700/80"
              onClick={() => {
                if (onSelectSkill) onSelectSkill(company.name);
              }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1 shrink-0 flex items-center justify-center">
                  <img
                    src={company.logo}
                    alt={company.name}
                    className="w-full h-full object-contain rounded-lg"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate group-hover:text-primary transition-colors">
                    {company.name}
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {company.openJobs} việc làm đang tuyển
                  </p>
                </div>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
            </div>
          ))}
        </div>
      </div>

      {/* WIDGET 3: POPULAR TECH SKILLS CLOUD */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <TrendingUp className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
            Kỹ năng IT tìm kiếm nhiều
          </h3>
        </div>

        <div className="mt-3.5 flex flex-wrap gap-1.5">
          {SKILL_CLOUD.map((skill) => (
            <button
              key={skill}
              type="button"
              onClick={() => onSelectSkill?.(skill)}
              className="text-xs font-medium px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-primary hover:text-white dark:hover:bg-primary dark:hover:text-white border border-slate-200/60 dark:border-slate-700/60 transition-all cursor-pointer"
            >
              {skill}
            </button>
          ))}
        </div>
      </div>

      {/* WIDGET 4: CANDIDATE PREMIUM BANNER */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 rounded-2xl p-5 border border-amber-500/30 text-white shadow-xl">
        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400 uppercase tracking-wider mb-2">
          <Crown className="w-4 h-4 fill-amber-400" />
          TalentPulse Candidate Premium
        </div>

        <h4 className="text-sm font-bold text-white">
          Nhân đôi cơ hội trúng tuyển với gói Premium
        </h4>

        <ul className="mt-3 space-y-1.5 text-xs text-slate-300">
          <li className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            Đẩy hồ sơ lên TOP 1 khi nộp đơn
          </li>
          <li className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            Mẫu CV ATS chuẩn quốc tế không giới hạn
          </li>
          <li className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            Xem ai đã xem CV của bạn
          </li>
        </ul>

        <Link
          to="/premium"
          className="mt-4 w-full py-2 px-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-md shadow-amber-500/20 text-center flex items-center justify-center gap-1 cursor-pointer"
        >
          Nâng cấp ngay
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
