import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  CheckCircle2,
  XCircle,
  Flame,
  MapPin,
  DollarSign,
  ExternalLink,
  Eye,
  EyeOff,
  Building2,
  RefreshCw,
  X,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../auth/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { adminApi, type AdminJobItem } from '../../../lib/adminApi';

interface JobsTabProps {
  jobs?: AdminJobItem[];
  isLoading?: boolean;
  onToggleActive?: (id: string) => Promise<void>;
}

export const JobsTab: React.FC<JobsTabProps> = ({
  jobs: initialJobs,
  isLoading: initialLoading,
  onToggleActive: externalToggle,
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const companyFilterId = searchParams.get('companyId');
  const companyFilterName = searchParams.get('companyName');

  const { accessToken } = useAuth();
  const { success, error } = useToast();

  const [jobs, setJobs] = useState<AdminJobItem[]>(initialJobs || []);
  const [isLoading, setIsLoading] = useState<boolean>(
    initialLoading !== undefined ? initialLoading : !initialJobs,
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchJobs = useCallback(async () => {
    if (!accessToken) return;
    try {
      setIsLoading(true);
      const data = await adminApi.getJobs(accessToken, {
        pageSize: 100,
        companyId: companyFilterId || undefined,
      });
      setJobs(data);
    } catch (err: any) {
      console.error('Failed to load jobs', err);
      error(err.message || 'Không thể tải danh sách tin tuyển dụng');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [accessToken, companyFilterId, error]);

  useEffect(() => {
    if (initialJobs !== undefined) {
      setJobs(initialJobs);
      return;
    }
    fetchJobs();
  }, [initialJobs, fetchJobs]);

  const handleToggleActive = async (id: string) => {
    if (externalToggle) {
      await externalToggle(id);
      return;
    }
    if (!accessToken) return;
    try {
      await adminApi.toggleJobActive(accessToken, id);
      success('Đã thay đổi trạng thái hiển thị của việc làm');
      fetchJobs();
    } catch (err: any) {
      error(err.message || 'Thao tác thất bại');
    }
  };

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    fetchJobs();
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  const getJobTitle = (job: AdminJobItem): string => {
    return job.title || job.name || 'Tin tuyển dụng';
  };

  const getJobLocation = (loc: any): string => {
    if (!loc) return 'Toàn quốc';
    if (typeof loc === 'string') return loc;
    if (typeof loc === 'object') {
      if (typeof loc.name === 'string') return loc.name;
      if (typeof loc.address === 'string') return loc.address;
      if (Array.isArray(loc.coordinates) && loc.coordinates.length >= 2) {
        const [lng, lat] = loc.coordinates;
        if (typeof lat === 'number' && typeof lng === 'number') {
          return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        }
      }
    }
    return 'Toàn quốc';
  };

  const formatSalary = (salary?: string | number): string => {
    if (!salary) return 'Thỏa thuận';
    const num = Number(salary);
    if (!isNaN(num) && num > 0) {
      return `${num.toLocaleString('vi-VN')} đ`;
    }
    return String(salary);
  };

  const filteredJobs = jobs.filter((job) => {
    const title = getJobTitle(job).toLowerCase();
    const companyName = (job.company?.name || '').toLowerCase();
    const locationText = getJobLocation(job.location).toLowerCase();
    const query = searchTerm.toLowerCase();

    const matchSearch =
      title.includes(query) ||
      companyName.includes(query) ||
      locationText.includes(query);

    const matchStatus =
      statusFilter === 'ALL' ? true : statusFilter === 'ACTIVE' ? job.isActive : !job.isActive;

    const matchCompany = companyFilterId
      ? job.company?._id === companyFilterId ||
        Boolean(companyFilterName && job.company?.name?.toLowerCase() === companyFilterName.toLowerCase())
      : true;

    return matchSearch && matchStatus && matchCompany;
  });

  if (isLoading && jobs.length === 0) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-14 rounded-2xl bg-slate-100 dark:bg-slate-800/60" />
        <div className="h-96 rounded-2xl bg-slate-100 dark:bg-slate-800/60" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Active Company Filter Notice */}
      {(companyFilterName || companyFilterId) && (
        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-primary/10 border border-primary/20 text-xs text-primary dark:text-primary-light">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 shrink-0 text-primary" />
            <span>
              Đang lọc tin tuyển dụng theo doanh nghiệp:{' '}
              <strong className="underline underline-offset-2">
                {companyFilterName || companyFilterId}
              </strong>{' '}
              ({filteredJobs.length} việc làm)
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              const newParams = new URLSearchParams(searchParams);
              newParams.delete('companyId');
              newParams.delete('companyName');
              setSearchParams(newParams);
            }}
            className="inline-flex items-center gap-1 rounded-lg bg-white/80 dark:bg-slate-800 px-2.5 py-1 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 shadow-xs transition cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
            <span>Bỏ lọc doanh nghiệp</span>
          </button>
        </div>
      )}

      {/* Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo chức danh việc làm, công ty, địa điểm..."
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
              Tất cả ({jobs.length})
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
              Đang hiển thị ({jobs.filter((j) => j.isActive).length})
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
              Đã ẩn / Tạm dừng ({jobs.filter((j) => !j.isActive).length})
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

      {/* Jobs Table */}
      <div className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
                <th className="py-3.5 px-4 font-bold">Vị trí tuyển dụng</th>
                <th className="py-3.5 px-4 font-bold">Doanh nghiệp</th>
                <th className="py-3.5 px-4 font-bold">Địa điểm & Mức lương</th>
                <th className="py-3.5 px-4 font-bold">Nhãn HOT</th>
                <th className="py-3.5 px-4 font-bold">Trạng thái duyệt</th>
                <th className="py-3.5 px-4 font-bold">Ngày đăng</th>
                <th className="py-3.5 px-4 text-right font-bold">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    Không tìm thấy việc làm nào phù hợp
                  </td>
                </tr>
              ) : (
                filteredJobs.map((job) => (
                  <tr
                    key={job._id}
                    className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition"
                  >
                    <td className="py-3.5 px-4">
                      <div className="max-w-[240px]">
                        <p className="font-bold text-slate-900 dark:text-white truncate">
                          {getJobTitle(job)}
                        </p>
                        <p className="text-[11px] text-slate-400 capitalize">
                          {job.level || 'Chuyên viên'} &bull; {job.experience || '1-3 năm'}
                        </p>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        {job.company?.logo ? (
                          <img
                            src={job.company.logo}
                            alt={job.company?.name || 'Company Logo'}
                            className="h-6 w-6 rounded-md object-contain border border-slate-200"
                          />
                        ) : (
                          <Building2 className="h-4 w-4 text-slate-400" />
                        )}
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[160px]">
                          {job.company?.name || 'Chưa liên kết'}
                        </span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate max-w-[140px]" title={getJobLocation(job.location)}>
                            {getJobLocation(job.location)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
                          <DollarSign className="h-3 w-3 shrink-0" />
                          <span>{formatSalary(job.salary)}</span>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      {job.isHot ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-black text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                          <Flame className="h-3 w-3 text-amber-500" />
                          HOT VIP
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">Thường</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      {job.isActive ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                          <CheckCircle2 className="h-3 w-3" />
                          Hiển thị
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-500 font-bold">
                          <XCircle className="h-3 w-3" />
                          Đang ẩn
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap">
                      {new Date(job.createdAt).toLocaleDateString('vi-VN')}
                    </td>

                    <td className="py-3.5 px-4 text-right space-x-2 whitespace-nowrap">
                      <Link
                        to={`/jobs/${job._id}`}
                        target="_blank"
                        className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 transition"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Xem tin
                      </Link>

                      <button
                        type="button"
                        onClick={() => handleToggleActive(job._id)}
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
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
