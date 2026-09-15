import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles,
  Building2,
  TrendingUp,
  Crown,
  FileText,
  ArrowRight,
  CheckCircle2,
  Briefcase,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import {
  TopHiringCompany,
  getTopHiringCompaniesApi,
  getCompanyInitial,
} from '../../lib/jobApi';

interface JobSidebarWidgetsProps {
  onSelectSkill?: (skill: string) => void;
  onSelectCompany?: (companyName: string) => void;
}

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
  onSelectCompany,
}: JobSidebarWidgetsProps) {
  const { user } = useAuth();
  const [companies, setCompanies] = useState<TopHiringCompany[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadTopCompanies() {
      try {
        setLoadingCompanies(true);
        const data = await getTopHiringCompaniesApi(10);
        if (isMounted) {
          setCompanies(Array.isArray(data) ? data : []);
        }
      } catch {
        if (isMounted) {
          setCompanies([]);
        }
      } finally {
        if (isMounted) {
          setLoadingCompanies(false);
        }
      }
    }
    loadTopCompanies();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleCompanyClick = (company: TopHiringCompany) => {
    if (onSelectCompany) {
      onSelectCompany(company.name);
    } else if (onSelectSkill) {
      onSelectSkill(company.name);
    }
  };

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

      {/* WIDGET 2: TOP 10 HIRING COMPANIES SPOTLIGHT */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                Top 10 Nhà tuyển dụng hàng đầu
              </h3>
            </div>
          </div>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60">
            Tuyển nhiều nhất
          </span>
        </div>

        <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800/60">
          {loadingCompanies ? (
            <div className="space-y-3 py-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-1.5 animate-pulse">
                  <div className="w-9 h-9 rounded-xl bg-slate-200 dark:bg-slate-800" />
                  <div className="flex-1 space-y-1.5">
                    <div className="w-3/4 h-3 bg-slate-200 dark:bg-slate-800 rounded" />
                    <div className="w-1/2 h-2.5 bg-slate-200 dark:bg-slate-800 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : companies.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
              Chưa có dữ liệu công ty tuyển dụng
            </div>
          ) : (
            <div className="space-y-1 max-h-[480px] overflow-y-auto pr-1">
              {companies.map((company, index) => {
                const rank = index + 1;
                const rankBadgeColor =
                  rank === 1
                    ? 'bg-amber-500 text-white'
                    : rank === 2
                    ? 'bg-slate-400 text-white'
                    : rank === 3
                    ? 'bg-amber-700 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400';

                return (
                  <div
                    key={company._id}
                    onClick={() => handleCompanyClick(company)}
                    className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-all group cursor-pointer border border-transparent hover:border-slate-200/80 dark:hover:border-slate-700/80"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Rank number badge */}
                      <span
                        className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 ${rankBadgeColor}`}
                      >
                        {rank}
                      </span>

                      {/* Logo or Fallback Letter */}
                      <div className="w-9 h-9 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800 p-0.5 shrink-0 flex items-center justify-center overflow-hidden">
                        {company.logo ? (
                          <img
                            src={company.logo}
                            alt={company.name}
                            className="w-full h-full object-contain rounded-lg"
                            loading="lazy"
                            onError={(e) => {
                              const target = e.target as HTMLElement;
                              target.style.display = 'none';
                              if (target.nextElementSibling) {
                                (target.nextElementSibling as HTMLElement).style.display = 'flex';
                              }
                            }}
                          />
                        ) : null}
                        <div
                          style={{ display: company.logo ? 'none' : 'flex' }}
                          className="w-full h-full rounded-lg bg-gradient-to-br from-primary/10 to-primary/20 text-primary font-bold text-xs items-center justify-center"
                        >
                          {getCompanyInitial(company.name)}
                        </div>
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate group-hover:text-primary transition-colors">
                            {company.name}
                          </h4>
                          {company.isPremium && (
                            <Crown className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                          <Briefcase className="w-3 h-3 text-primary/70 shrink-0" />
                          <span className="font-semibold text-primary dark:text-primary-light">
                            {company.openJobs}
                          </span>{' '}
                          việc làm đang tuyển
                        </p>
                      </div>
                    </div>

                    <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0 ml-1.5" />
                  </div>
                );
              })}
            </div>
          )}
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
