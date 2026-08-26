import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  Search,
  MapPin,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import {
  employerApi,
  type HrJobItem,
} from '../../../lib/employerApi';
import { useToast } from '../../../context/ToastContext';
import { CompanyRequiredGate } from '../components/CompanyRequiredGate';
import { formatDate } from '../../../lib/dateUtils';

interface CVSearchTabProps {
  accessToken: string | null;
  hasCompany?: boolean;
  onNavigateTab: (tab: string, extraData?: any) => void;
}

export function CVSearchTab({
  accessToken,
  hasCompany = false,
  onNavigateTab,
}: CVSearchTabProps) {
  const { t } = useTranslation();
  const { error, info } = useToast();

  const [jobs, setJobs] = useState<HrJobItem[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>('');

  const [searchCriteria, setSearchCriteria] = useState({
    skills: '',
    education: '',
    address: '',
    certificates: '',
  });

  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    const loadJobs = async () => {
      if (!accessToken || !hasCompany) return;
      try {
        const res = await employerApi.getHrJobs({ pageSize: 50 }, accessToken);
        const jobList = res.result || [];
        setJobs(jobList);
        if (jobList.length > 0) {
          setSelectedJobId(jobList[0]._id);
        }
      } catch (err) {
        console.error(err);
      }
    };
    void loadJobs();
  }, [accessToken, hasCompany]);

  if (!hasCompany) {
    return (
      <CompanyRequiredGate
        title="Tìm kiếm Hồ sơ CV Ứng viên"
        description="Tính năng tìm kiếm và lọc CV ứng viên theo bộ kỹ năng chỉ dành cho HR đã liên kết với doanh nghiệp tuyển dụng."
        onNavigateTab={onNavigateTab}
      />
    );
  }

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;

    if (!selectedJobId) {
      info(t('employer.searchCvTab.targetJobLabel'));
      return;
    }

    if (
      !searchCriteria.skills &&
      !searchCriteria.education &&
      !searchCriteria.address &&
      !searchCriteria.certificates
    ) {
      info(t('employer.searchCvTab.searchSkillsPlaceholder'));
      return;
    }

    setIsSearching(true);
    setHasSearched(true);
    try {
      const res = await employerApi.searchCandidatesByCV(selectedJobId, searchCriteria, accessToken);
      setResults(res.result || []);
    } catch (err: any) {
      error(err.message || 'Tìm kiếm thất bại');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header */}
      <div className="border-b border-slate-200 pb-4 dark:border-slate-800">
        <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
          {t('employer.searchCvTab.title')}
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
          {t('employer.searchCvTab.subtitle')}
        </p>
      </div>

      {/* 2. Search Criteria Card */}
      <div className="rounded-3xl border border-slate-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Target Job */}
            <div className="sm:col-span-2 lg:col-span-4 space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {t('employer.searchCvTab.targetJobLabel')} <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedJobId}
                onChange={(e) => setSelectedJobId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white font-medium"
              >
                {jobs.map((job) => (
                  <option key={job._id} value={job._id}>
                    {job.name} ({job.level} - {job.location})
                  </option>
                ))}
              </select>
            </div>

            {/* Skills */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {t('employer.searchCvTab.skillsLabel')}
              </label>
              <input
                type="text"
                value={searchCriteria.skills}
                onChange={(e) => setSearchCriteria({ ...searchCriteria, skills: e.target.value })}
                placeholder={t('employer.searchCvTab.searchSkillsPlaceholder')}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            {/* Education */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {t('employer.searchCvTab.educationLabel')}
              </label>
              <input
                type="text"
                value={searchCriteria.education}
                onChange={(e) => setSearchCriteria({ ...searchCriteria, education: e.target.value })}
                placeholder={t('employer.searchCvTab.educationPlaceholder')}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            {/* Location / Address */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {t('employer.searchCvTab.addressLabel')}
              </label>
              <input
                type="text"
                value={searchCriteria.address}
                onChange={(e) => setSearchCriteria({ ...searchCriteria, address: e.target.value })}
                placeholder={t('employer.searchCvTab.addressPlaceholder')}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            {/* Certificates */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {t('employer.searchCvTab.certificatesLabel')}
              </label>
              <input
                type="text"
                value={searchCriteria.certificates}
                onChange={(e) => setSearchCriteria({ ...searchCriteria, certificates: e.target.value })}
                placeholder={t('employer.searchCvTab.certificatesPlaceholder')}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => {
                setSearchCriteria({ skills: '', education: '', address: '', certificates: '' });
                setResults([]);
                setHasSearched(false);
              }}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 transition dark:border-slate-700 dark:text-slate-300 cursor-pointer"
            >
              {t('employer.searchCvTab.resetBtn')}
            </button>
            <button
              type="submit"
              disabled={isSearching}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-primary/20 hover:bg-primary-dark transition active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span>{t('employer.searchCvTab.searchCandidatesBtn')}</span>
            </button>
          </div>
        </form>
      </div>

      {/* 3. Search Results */}
      {isSearching ? (
        <div className="py-20 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="mt-2 text-xs text-slate-400">{t('employer.searchCvTab.searchingBtn')}</p>
        </div>
      ) : hasSearched && results.length > 0 ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{t('employer.searchCvTab.foundResults', { count: results.length })}</span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {results.map((res) => (
              <motion.div
                key={res._id}
                whileHover={{ y: -2 }}
                className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative h-11 w-11 shrink-0 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-sm">
                      {(res.userId?.name?.[0] || 'U').toUpperCase()}
                      {res.userId?.isBoosted && (
                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[9px] text-white shadow-xs">
                          🚀
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {res.userId?.name || 'Candidate'}
                        </h4>
                        {res.userId?.isPremium ? (
                          <span title="Candidate Premium" className="text-xs">
                            👑
                          </span>
                        ) : res.userId?.isVerified ? (
                          <span title="Ứng viên đã xác thực" className="inline-flex items-center text-sky-500">
                            🛡️
                          </span>
                        ) : null}
                        {res.userId?.isBoosted && (
                          <span className="rounded-full bg-indigo-500/15 border border-indigo-500/30 px-2 py-0.5 text-[10px] font-black text-indigo-700 dark:text-indigo-300 animate-pulse">
                            🚀 Đang Đẩy Top
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 truncate">{res.userId?.email}</p>
                    </div>
                  </div>

                  {res.cvId?.url && (
                    <a
                      href={res.cvId.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 shrink-0 rounded-xl bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary hover:text-white transition"
                    >
                      <span>{t('employer.candidatesTab.btnViewCv')}</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>

                {/* Match Highlights */}
                <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/50 text-xs space-y-1.5">
                  {res.matchInfo?.matchedSkills?.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-slate-600 dark:text-slate-400">{t('employer.searchCvTab.matchedSkillsLabel')}:</span>
                      {res.matchInfo.matchedSkills.map((sk: string) => (
                        <span key={sk} className="rounded-md bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          {sk}
                        </span>
                      ))}
                    </div>
                  )}

                  {res.userId?.address && (
                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                      <MapPin className="h-3.5 w-3.5 text-slate-400" />
                      <span>{res.userId.address}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs dark:border-slate-800">
                  <span className="text-slate-400 font-medium">
                    {formatDate(res.createdAt)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onNavigateTab('candidates', { selectedApplicationId: res._id })}
                    className="font-bold text-primary hover:underline cursor-pointer"
                  >
                    {t('employer.candidatesTab.btnReview')} &rarr;
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      ) : hasSearched ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
          <Search className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600 mb-2" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            {t('employer.searchCvTab.noResultsTitle')}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            {t('employer.searchCvTab.noResultsDesc')}
          </p>
        </div>
      ) : null}
    </div>
  );
}

