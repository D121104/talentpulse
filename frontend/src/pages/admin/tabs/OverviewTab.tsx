import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Briefcase,
  Building2,
  Crown,
  DollarSign,
  TrendingUp,
  UserCheck,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../../auth/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { adminApi, type AdminDashboardStats } from '../../../lib/adminApi';

interface OverviewTabProps {
  stats?: AdminDashboardStats | null;
  isLoading?: boolean;
  onNavigateTab?: (tab: string) => void;
  onApproveHr?: (userId: string) => Promise<void>;
  onRejectHr?: (userId: string) => Promise<void>;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  stats: initialStats,
  isLoading: initialLoading,
  onNavigateTab: externalNavigate,
  onApproveHr: externalApprove,
  onRejectHr: externalReject,
}) => {
  const { accessToken } = useAuth();
  const { success, error, info } = useToast();
  const navigate = useNavigate();

  const [stats, setStats] = useState<AdminDashboardStats | null>(initialStats || null);
  const [isLoading, setIsLoading] = useState<boolean>(
    initialLoading !== undefined ? initialLoading : !initialStats,
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchStats = useCallback(async () => {
    if (!accessToken) return;
    try {
      setIsLoading(true);
      const data = await adminApi.getDashboardStats(accessToken);
      setStats(data);
    } catch (err: any) {
      console.error('Failed to load stats', err);
      error(err.message || 'Không thể tải dữ liệu thống kê');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [accessToken, error]);

  useEffect(() => {
    if (initialStats !== undefined) {
      setStats(initialStats);
      return;
    }
    fetchStats();
  }, [initialStats, fetchStats]);

  const handleNavigate = (tab: string) => {
    if (externalNavigate) {
      externalNavigate(tab);
    } else {
      navigate(`/admin/${tab}`);
    }
  };

  const handleApproveHr = async (userId: string) => {
    if (externalApprove) {
      await externalApprove(userId);
      return;
    }
    if (!accessToken) return;
    try {
      await adminApi.approveHr(accessToken, userId);
      success('Đã phê duyệt tài khoản nhà tuyển dụng');
      fetchStats();
    } catch (err: any) {
      error(err.message || 'Phê duyệt thất bại');
    }
  };

  const handleRejectHr = async (userId: string) => {
    if (externalReject) {
      await externalReject(userId);
      return;
    }
    if (!accessToken) return;
    try {
      await adminApi.rejectHr(accessToken, userId);
      info('Đã từ chối tài khoản nhà tuyển dụng');
      fetchStats();
    } catch (err: any) {
      error(err.message || 'Từ chối thất bại');
    }
  };

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    fetchStats();
  };

  if (isLoading || !stats) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="h-32 rounded-2xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="h-72 rounded-2xl bg-slate-100 dark:bg-slate-800/60 lg:col-span-2" />
          <div className="h-72 rounded-2xl bg-slate-100 dark:bg-slate-800/60" />
        </div>
      </div>
    );
  }

  const { users, jobs, companies, revenue, pendingHrApprovals } = stats;

  const kpis = [
    {
      label: 'Tổng người dùng',
      value: users.total.toLocaleString('vi-VN'),
      sub: `${users.candidates} Ứng viên • ${users.hrs} Nhà tuyển dụng`,
      icon: Users,
      gradient: 'from-blue-600 to-indigo-600',
      tab: 'users',
    },
    {
      label: 'Việc làm hoạt động',
      value: jobs.active.toLocaleString('vi-VN'),
      sub: `Trên tổng số ${jobs.total} tin tuyển dụng`,
      icon: Briefcase,
      gradient: 'from-emerald-600 to-teal-600',
      tab: 'jobs',
    },
    {
      label: 'Doanh nghiệp',
      value: companies.total.toLocaleString('vi-VN'),
      sub: `${companies.verified} đã xác minh uy tín`,
      icon: Building2,
      gradient: 'from-purple-600 to-pink-600',
      tab: 'companies',
    },
    {
      label: 'Tổng doanh thu',
      value: `${revenue.totalRevenue.toLocaleString('vi-VN')} đ`,
      sub: `Hôm nay: ${revenue.todayRevenue.toLocaleString('vi-VN')} đ`,
      icon: DollarSign,
      gradient: 'from-amber-500 to-orange-600',
      tab: 'payments',
    },
  ];

  const secondaryKpis = [
    {
      label: 'Gói Premium đang kích hoạt',
      value: revenue.activeSubscriptions.toLocaleString('vi-VN'),
      sub: 'Tài khoản có quyền lợi VIP',
      icon: Crown,
      color: 'text-amber-500 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800',
      tab: 'subscriptions',
    },
    {
      label: 'Giao dịch thành công',
      value: revenue.paidOrdersCount.toLocaleString('vi-VN'),
      sub: `Tỷ lệ thành công ${(
        (revenue.paidOrdersCount / Math.max(1, revenue.paidOrdersCount + 2)) *
        100
      ).toFixed(1)}%`,
      icon: TrendingUp,
      color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800',
      tab: 'payments',
    },
    {
      label: 'HR Chờ phê duyệt',
      value: users.pendingApprovalHrs.toLocaleString('vi-VN'),
      sub: 'Cần xem xét kích hoạt tài khoản',
      icon: UserCheck,
      color: 'text-sky-500 bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800',
      tab: 'users',
    },
    {
      label: 'Tài khoản bị khóa',
      value: users.lockedUsers.toLocaleString('vi-VN'),
      sub: 'Vi phạm chính sách cộng đồng',
      icon: AlertTriangle,
      color: 'text-rose-500 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800',
      tab: 'users',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Action bar */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-850 dark:text-slate-300 dark:hover:bg-slate-800 transition cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
          <span>Làm mới số liệu</span>
        </button>
      </div>

      {/* 1. Primary Highlight Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {kpis.map((kpi, index) => {
          const Icon = kpi.icon;
          return (
            <div
              key={index}
              onClick={() => handleNavigate(kpi.tab)}
              className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {kpi.label}
                </span>
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr ${kpi.gradient} text-white shadow-md shadow-primary/10`}
                >
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  {kpi.value}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {kpi.sub}
                </p>
              </div>
              <div className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-primary dark:text-primary-light group-hover:underline">
                <span>Xem chi tiết</span>
                <ArrowUpRight className="h-3 w-3" />
              </div>
            </div>
          );
        })}
      </div>

      {/* 2. Secondary Indicator Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {secondaryKpis.map((sec, index) => {
          const Icon = sec.icon;
          return (
            <div
              key={index}
              onClick={() => handleNavigate(sec.tab)}
              className="flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900 transition-all hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer"
            >
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${sec.color}`}
              >
                <Icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xl font-extrabold text-slate-900 dark:text-white leading-tight">
                  {sec.value}
                </p>
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  {sec.label}
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  {sec.sub}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. Pending HR Approvals Quick Action & Revenue Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Pending HR Approval Table */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400">
                <UserCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Nhà Tuyển Dụng Chờ Duyệt
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {pendingHrApprovals.length} tài khoản mới đăng ký cần xét duyệt
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleNavigate('users')}
              className="text-xs font-bold text-primary hover:underline dark:text-primary-light cursor-pointer"
            >
              Xem tất cả
            </button>
          </div>

          <div className="mt-4 overflow-x-auto">
            {pendingHrApprovals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-500 dark:bg-emerald-950/40">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <p className="mt-2 text-sm font-bold text-slate-800 dark:text-slate-200">
                  Không có hồ sơ nào đang chờ duyệt
                </p>
                <p className="text-xs text-slate-400">
                  Tất cả nhà tuyển dụng đã được xử lý phê duyệt kịp thời.
                </p>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 dark:border-slate-800">
                    <th className="pb-3 font-semibold">Tên HR</th>
                    <th className="pb-3 font-semibold">Doanh nghiệp</th>
                    <th className="pb-3 font-semibold">Ngày ĐK</th>
                    <th className="pb-3 text-right font-semibold">Hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {pendingHrApprovals.map((hr: any) => (
                    <tr key={hr._id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="py-3 pr-2">
                        <p className="font-bold text-slate-900 dark:text-white">{hr.name}</p>
                        <p className="text-[11px] text-slate-400">{hr.email}</p>
                      </td>
                      <td className="py-3 pr-2 font-medium text-slate-700 dark:text-slate-300">
                        {hr.companyName || 'Chưa liên kết'}
                      </td>
                      <td className="py-3 pr-2 text-slate-400 whitespace-nowrap">
                        {new Date(hr.createdAt).toLocaleDateString('vi-VN')}
                      </td>
                      <td className="py-3 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleApproveHr(hr._id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-xs hover:bg-emerald-700 transition cursor-pointer"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          Duyệt
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRejectHr(hr._id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-400 transition cursor-pointer"
                        >
                          <XCircle className="h-3 w-3" />
                          Từ chối
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right: Quick Action Shortcuts & Quick Config */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">
              Lối Tắt Quản Trị
            </h3>
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => handleNavigate('packages')}
                className="flex w-full items-center justify-between rounded-xl border border-slate-200/80 p-3 text-left transition hover:border-primary/50 hover:bg-primary/5 dark:border-slate-800 dark:hover:border-primary-light/50 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                    <Crown className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      Cấu hình Gói Premium & AI Quota
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Chỉnh sửa giá tiền, quota và đặc quyền
                    </p>
                  </div>
                </div>
                <ArrowUpRight className="h-4 w-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => handleNavigate('payments')}
                className="flex w-full items-center justify-between rounded-xl border border-slate-200/80 p-3 text-left transition hover:border-primary/50 hover:bg-primary/5 dark:border-slate-800 dark:hover:border-primary-light/50 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                    <DollarSign className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      Giao dịch PayOS & Hóa đơn VAT
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Kiểm tra biến động số dư và webhook
                    </p>
                  </div>
                </div>
                <ArrowUpRight className="h-4 w-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => handleNavigate('subscriptions')}
                className="flex w-full items-center justify-between rounded-xl border border-slate-200/80 p-3 text-left transition hover:border-primary/50 hover:bg-primary/5 dark:border-slate-800 dark:hover:border-primary-light/50 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500">
                    <Clock className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      Quản lý Hạn Dùng Thuê Bao
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Gia hạn thủ công hoặc hủy quyền lợi
                    </p>
                  </div>
                </div>
                <ArrowUpRight className="h-4 w-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => handleNavigate('skills')}
                className="flex w-full items-center justify-between rounded-xl border border-slate-200/80 p-3 text-left transition hover:border-primary/50 hover:bg-primary/5 dark:border-slate-800 dark:hover:border-primary-light/50 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10 text-purple-500">
                    <ShieldCheck className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      Từ Điển Kỹ Năng Hệ Thống
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Chuẩn hóa skill match cho ứng viên & tin tuyển dụng
                    </p>
                  </div>
                </div>
                <ArrowUpRight className="h-4 w-4 text-slate-400" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
