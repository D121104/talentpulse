import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  CheckCircle2,
  XCircle,
  Globe,
  MapPin,
  Briefcase,
  Power,
  RefreshCw,
  ExternalLink,
  X,
  Flame,
  DollarSign,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useAuth } from '../../../auth/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { adminApi, type AdminCompanyItem, type AdminJobItem } from '../../../lib/adminApi';

interface CompaniesTabProps {
  companies?: AdminCompanyItem[];
  isLoading?: boolean;
  onToggleActive?: (id: string) => Promise<void>;
}

export const CompaniesTab: React.FC<CompaniesTabProps> = ({
  companies: initialCompanies,
  isLoading: initialLoading,
  onToggleActive: externalToggle,
}) => {
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const { success, error } = useToast();

  const [companies, setCompanies] = useState<AdminCompanyItem[]>(initialCompanies || []);
  const [isLoading, setIsLoading] = useState<boolean>(
    initialLoading !== undefined ? initialLoading : !initialCompanies,
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Selected company modal for viewing jobs
  const [selectedCompany, setSelectedCompany] = useState<AdminCompanyItem | null>(null);
  const [companyJobs, setCompanyJobs] = useState<AdminJobItem[]>([]);
  const [isLoadingCompanyJobs, setIsLoadingCompanyJobs] = useState(false);

  const fetchCompanies = useCallback(async () => {
    if (!accessToken) return;
    try {
      setIsLoading(true);
      const data = await adminApi.getCompanies(accessToken, { pageSize: 100 });
      setCompanies(data);
    } catch (err: any) {
      console.error('Failed to load companies', err);
      error(err.message || 'Không thể tải danh sách doanh nghiệp');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [accessToken, error]);

  useEffect(() => {
    if (initialCompanies !== undefined) {
      setCompanies(initialCompanies);
      return;
    }
    fetchCompanies();
  }, [initialCompanies, fetchCompanies]);

  const handleToggleActive = async (id: string) => {
    if (externalToggle) {
      await externalToggle(id);
      return;
    }
    if (!accessToken) return;
    try {
      await adminApi.toggleCompanyActive(accessToken, id);
      success('Đã cập nhật trạng thái hoạt động của doanh nghiệp');
      fetchCompanies();
    } catch (err: any) {
      error(err.message || 'Thao tác thất bại');
    }
  };

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    fetchCompanies();
  };

  // Open modal and fetch jobs for the company
  const handleOpenCompanyJobs = async (company: AdminCompanyItem) => {
    setSelectedCompany(company);
    setIsLoadingCompanyJobs(true);
    try {
      if (!accessToken) return;
      const jobs = await adminApi.getJobs(accessToken, {
        companyId: company._id,
        pageSize: 100,
      });
      setCompanyJobs(jobs);
    } catch (err: any) {
      error(err.message || 'Không thể tải danh sách việc làm');
    } finally {
      setIsLoadingCompanyJobs(false);
    }
  };

  const handleCloseJobsModal = () => {
    setSelectedCompany(null);
    setCompanyJobs([]);
  };

  // Toggle active state of a job from inside the modal
  const handleToggleJobActiveInModal = async (jobId: string) => {
    if (!accessToken) return;
    try {
      await adminApi.toggleJobActive(accessToken, jobId);
      success('Đã cập nhật trạng thái việc làm');
      if (selectedCompany) {
        const updated = await adminApi.getJobs(accessToken, {
          companyId: selectedCompany._id,
          pageSize: 100,
        });
        setCompanyJobs(updated);
      }
      fetchCompanies();
    } catch (err: any) {
      error(err.message || 'Thao tác thất bại');
    }
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  const getCompanyLocation = (c: AdminCompanyItem): string => {
    if (c.address && typeof c.address === 'string' && c.address.trim()) {
      return c.address;
    }
    if (c.location) {
      if (typeof c.location === 'string' && c.location.trim()) {
        return c.location;
      }
      if (typeof c.location === 'object' && Array.isArray((c.location as any).coordinates)) {
        const [lng, lat] = (c.location as any).coordinates;
        if (typeof lat === 'number' && typeof lng === 'number') {
          return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        }
      }
    }
    return '';
  };

  const formatSalary = (salary?: string | number): string => {
    if (!salary) return 'Thỏa thuận';
    const num = Number(salary);
    if (!isNaN(num) && num > 0) {
      return `${num.toLocaleString('vi-VN')} đ`;
    }
    return String(salary);
  };

  const filteredCompanies = companies.filter((c) => {
    const locStr = getCompanyLocation(c).toLowerCase();
    const query = searchTerm.toLowerCase();
    const matchSearch =
      (c.name || '').toLowerCase().includes(query) ||
      (c.taxCode && c.taxCode.toLowerCase().includes(query)) ||
      locStr.includes(query);

    const matchStatus =
      statusFilter === 'ALL' ? true : statusFilter === 'ACTIVE' ? c.isActive : !c.isActive;

    return matchSearch && matchStatus;
  });

  if (isLoading && companies.length === 0) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-14 rounded-2xl bg-slate-100 dark:bg-slate-800/60" />
        <div className="h-96 rounded-2xl bg-slate-100 dark:bg-slate-800/60" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo tên doanh nghiệp, mã số thuế, địa điểm..."
            className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
          />
        </div>

        {/* Status Filter & Refresh */}
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                statusFilter === 'ALL'
                  ? 'bg-white text-primary shadow-xs dark:bg-slate-900 dark:text-primary-light'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Tất cả ({companies.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('ACTIVE')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                statusFilter === 'ACTIVE'
                  ? 'bg-white text-primary shadow-xs dark:bg-slate-900 dark:text-primary-light'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Đang hoạt động ({companies.filter((c) => c.isActive).length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('INACTIVE')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                statusFilter === 'INACTIVE'
                  ? 'bg-white text-primary shadow-xs dark:bg-slate-900 dark:text-primary-light'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Tạm khóa ({companies.filter((c) => !c.isActive).length})
            </button>
          </div>

          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
            <span className="hidden sm:inline">Làm mới</span>
          </button>
        </div>
      </div>

      {/* Companies Table */}
      <div className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
                <th className="py-3.5 px-4 font-bold">Doanh nghiệp</th>
                <th className="py-3.5 px-4 font-bold">Mã số thuế</th>
                <th className="py-3.5 px-4 font-bold">Địa điểm / Website</th>
                <th className="py-3.5 px-4 font-bold">Số tin đang tuyển</th>
                <th className="py-3.5 px-4 font-bold">Trạng thái</th>
                <th className="py-3.5 px-4 text-right font-bold">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredCompanies.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    Không tìm thấy doanh nghiệp nào phù hợp
                  </td>
                </tr>
              ) : (
                filteredCompanies.map((c) => (
                  <tr
                    key={c._id}
                    className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition"
                  >
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        {c.logo ? (
                          <img
                            src={c.logo}
                            alt={c.name}
                            className="h-9 w-9 rounded-xl object-contain border border-slate-200 bg-white p-0.5 dark:border-slate-700"
                          />
                        ) : (
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-600 font-bold dark:bg-purple-950/50 dark:text-purple-300">
                            {c.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">{c.name}</p>
                          {c.industry && (
                            <p className="text-[11px] text-slate-400">{c.industry}</p>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-mono font-medium text-slate-700 dark:text-slate-300">
                      {c.taxCode || '—'}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="space-y-0.5">
                        {getCompanyLocation(c) ? (
                          <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate max-w-[160px]" title={getCompanyLocation(c)}>
                              {getCompanyLocation(c)}
                            </span>
                          </div>
                        ) : null}
                        {c.website && (
                          <a
                            href={c.website.startsWith('http') ? c.website : `https://${c.website}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 text-primary dark:text-primary-light hover:underline"
                          >
                            <Globe className="h-3 w-3 shrink-0" />
                            <span className="truncate max-w-[160px]">{c.website}</span>
                          </a>
                        )}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-bold text-slate-800 dark:text-slate-200">
                      <button
                        type="button"
                        onClick={() => handleOpenCompanyJobs(c)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary dark:bg-primary/20 dark:hover:bg-primary/30 dark:text-primary-light px-2.5 py-1 text-xs font-bold transition cursor-pointer"
                        title="Xem danh sách việc làm của doanh nghiệp"
                      >
                        <Briefcase className="h-3.5 w-3.5" />
                        <span>{c.jobCount ?? 0} tin</span>
                        <ExternalLink className="h-3 w-3 opacity-70" />
                      </button>
                    </td>

                    <td className="py-3.5 px-4">
                      {c.isActive ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                          <CheckCircle2 className="h-3 w-3" />
                          Hoạt động
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-500 font-bold">
                          <XCircle className="h-3 w-3" />
                          Tạm khóa
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(c._id)}
                        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${
                          c.isActive
                            ? 'bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-400'
                            : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400'
                        }`}
                      >
                        <Power className="h-3 w-3" />
                        {c.isActive ? 'Khóa DN' : 'Mở khóa DN'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Company Jobs List */}
      {selectedCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-3xl rounded-3xl bg-white p-6 sm:p-8 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                {selectedCompany.logo ? (
                  <img
                    src={selectedCompany.logo}
                    alt={selectedCompany.name}
                    className="h-10 w-10 rounded-xl object-contain border border-slate-200 bg-white p-0.5 dark:border-slate-700"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-700 font-bold dark:bg-purple-950/50 dark:text-purple-300">
                    {selectedCompany.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {selectedCompany.name}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Danh sách việc làm ({companyJobs.length} tin)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    navigate(
                      `/admin/jobs?companyId=${selectedCompany._id}&companyName=${encodeURIComponent(
                        selectedCompany.name,
                      )}`,
                    );
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 dark:text-primary-light transition cursor-pointer"
                >
                  <span>Mở trong Quản lý việc làm</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleCloseJobsModal}
                  className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto py-4">
              {isLoadingCompanyJobs ? (
                <div className="space-y-3 py-6 animate-pulse">
                  <div className="h-14 rounded-xl bg-slate-100 dark:bg-slate-800" />
                  <div className="h-14 rounded-xl bg-slate-100 dark:bg-slate-800" />
                  <div className="h-14 rounded-xl bg-slate-100 dark:bg-slate-800" />
                </div>
              ) : companyJobs.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <Briefcase className="mx-auto h-10 w-10 mb-2 opacity-40" />
                  <p className="text-sm font-semibold">Công ty chưa đăng tin tuyển dụng nào</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden">
                  {companyJobs.map((job) => {
                    const jobTitle = job.name || job.title || 'Tin tuyển dụng';
                    return (
                      <div
                        key={job._id}
                        className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition"
                      >
                        <div className="space-y-1 max-w-md">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">
                              {jobTitle}
                            </p>
                            {job.isHot && (
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                                <Flame className="h-3 w-3 text-amber-500" />
                                HOT VIP
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                            <span className="flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                              <DollarSign className="h-3 w-3" />
                              {formatSalary(job.salary)}
                            </span>
                            {job.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {typeof job.location === 'string'
                                  ? job.location
                                  : 'Theo thỏa thuận'}
                              </span>
                            )}
                            <span>&bull; {job.level || 'Chuyên viên'}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                              job.isActive
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                            }`}
                          >
                            {job.isActive ? 'Hiển thị' : 'Đang ẩn'}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleToggleJobActiveInModal(job._id)}
                            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${
                              job.isActive
                                ? 'bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-400'
                                : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400'
                            }`}
                          >
                            {job.isActive ? (
                              <>
                                <EyeOff className="h-3 w-3" />
                                Ẩn tin
                              </>
                            ) : (
                              <>
                                <Eye className="h-3 w-3" />
                                Hiện tin
                              </>
                            )}
                          </button>

                          <a
                            href={`/jobs/${job._id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 transition"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Xem
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={handleCloseJobsModal}
                className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
