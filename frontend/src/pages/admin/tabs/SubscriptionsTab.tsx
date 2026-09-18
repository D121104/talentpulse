import React, { useState, useEffect, useCallback } from 'react';
import {
  Crown,
  Clock,
  Search,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  PlusCircle,
  Building2,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../../auth/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { adminApi, type AdminSubscriptionItem } from '../../../lib/adminApi';

interface SubscriptionsTabProps {
  subscriptions?: AdminSubscriptionItem[];
  isLoading?: boolean;
  onExtend?: (userId: string, additionalDays: number, note?: string) => Promise<void>;
  onCancel?: (userId: string, reason?: string) => Promise<void>;
}

export const SubscriptionsTab: React.FC<SubscriptionsTabProps> = ({
  subscriptions: initialSubscriptions,
  isLoading: initialLoading,
  onExtend: externalExtend,
  onCancel: externalCancel,
}) => {
  const { accessToken } = useAuth();
  const { success, error, info } = useToast();

  const [subscriptions, setSubscriptions] = useState<AdminSubscriptionItem[]>(
    initialSubscriptions || [],
  );
  const [isLoading, setIsLoading] = useState<boolean>(
    initialLoading !== undefined ? initialLoading : !initialSubscriptions,
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchSubscriptions = useCallback(async () => {
    if (!accessToken) return;
    try {
      setIsLoading(true);
      const data = await adminApi.getSubscriptions(accessToken, { pageSize: 100 });
      setSubscriptions(data);
    } catch (err: any) {
      console.error('Failed to load subscriptions', err);
      error(err.message || 'Không thể tải danh sách thuê bao');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [accessToken, error]);

  useEffect(() => {
    if (initialSubscriptions !== undefined) {
      setSubscriptions(initialSubscriptions);
      return;
    }
    fetchSubscriptions();
  }, [initialSubscriptions, fetchSubscriptions]);

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'USER' | 'HR'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'EXPIRED'>('ALL');

  // Extend Modal State
  const [extendModalUser, setExtendModalUser] = useState<AdminSubscriptionItem | null>(null);
  const [extendDays, setExtendDays] = useState<number>(30);
  const [extendNote, setExtendNote] = useState<string>('');
  const [isSubmittingExtend, setIsSubmittingExtend] = useState(false);

  // Cancel Modal State
  const [cancelModalUser, setCancelModalUser] = useState<AdminSubscriptionItem | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);

  const handleConfirmExtend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extendModalUser) return;
    try {
      setIsSubmittingExtend(true);
      if (externalExtend) {
        await externalExtend(extendModalUser._id, extendDays, extendNote);
      } else if (accessToken) {
        await adminApi.extendSubscription(accessToken, extendModalUser._id, extendDays, extendNote);
        success(`Đã gia hạn thành công thêm ${extendDays} ngày cho người dùng`);
        fetchSubscriptions();
      }
      setExtendModalUser(null);
      setExtendNote('');
    } catch (err: any) {
      error(err.message || 'Gia hạn thất bại');
    } finally {
      setIsSubmittingExtend(false);
    }
  };

  const handleConfirmCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelModalUser) return;
    try {
      setIsSubmittingCancel(true);
      if (externalCancel) {
        await externalCancel(cancelModalUser._id, cancelReason);
      } else if (accessToken) {
        await adminApi.cancelSubscription(accessToken, cancelModalUser._id, cancelReason);
        info('Đã thu hồi gói Premium của người dùng');
        fetchSubscriptions();
      }
      setCancelModalUser(null);
      setCancelReason('');
    } catch (err: any) {
      error(err.message || 'Hủy gói thất bại');
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    fetchSubscriptions();
  };

  const filteredSubscriptions = subscriptions.filter((sub) => {
    const matchSearch =
      sub.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (sub.companyName && sub.companyName.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchRole = roleFilter === 'ALL' || sub.role === roleFilter;

    const matchStatus =
      statusFilter === 'ALL'
        ? true
        : statusFilter === 'ACTIVE'
        ? !sub.isExpired
        : sub.isExpired;

    return matchSearch && matchRole && matchStatus;
  });

  if (isLoading && subscriptions.length === 0) {
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
            placeholder="Tìm theo tên ứng viên, HR, email hoặc công ty..."
            className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setRoleFilter('ALL')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                roleFilter === 'ALL'
                  ? 'bg-white text-primary shadow-xs dark:bg-slate-900 dark:text-primary-light'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Tất cả vai trò
            </button>
            <button
              type="button"
              onClick={() => setRoleFilter('USER')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                roleFilter === 'USER'
                  ? 'bg-white text-primary shadow-xs dark:bg-slate-900 dark:text-primary-light'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Ứng viên
            </button>
            <button
              type="button"
              onClick={() => setRoleFilter('HR')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                roleFilter === 'HR'
                  ? 'bg-white text-primary shadow-xs dark:bg-slate-900 dark:text-primary-light'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Doanh nghiệp
            </button>
          </div>

          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                statusFilter === 'ALL'
                  ? 'bg-white text-primary shadow-xs dark:bg-slate-900 dark:text-primary-light'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Tất cả
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('ACTIVE')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                statusFilter === 'ACTIVE'
                  ? 'bg-emerald-50 text-emerald-700 shadow-xs dark:bg-emerald-950/50 dark:text-emerald-300'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Còn hạn
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('EXPIRED')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                statusFilter === 'EXPIRED'
                  ? 'bg-rose-50 text-rose-700 shadow-xs dark:bg-rose-950/50 dark:text-rose-300'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Đã hết hạn
            </button>
          </div>

          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      {/* Subscriptions Table */}
      <div className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
                <th className="py-3.5 px-4 font-bold">Người dùng</th>
                <th className="py-3.5 px-4 font-bold">Vai trò</th>
                <th className="py-3.5 px-4 font-bold">Gói Premium</th>
                <th className="py-3.5 px-4 font-bold">Ngày hết hạn</th>
                <th className="py-3.5 px-4 font-bold">Thời gian còn lại</th>
                <th className="py-3.5 px-4 font-bold">Trạng thái</th>
                <th className="py-3.5 px-4 text-right font-bold">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredSubscriptions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    Không tìm thấy người dùng thuê bao nào phù hợp
                  </td>
                </tr>
              ) : (
                filteredSubscriptions.map((sub) => {
                  const isHR = sub.role === 'HR';
                  return (
                    <tr
                      key={sub._id}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition"
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          {sub.avatar ? (
                            <img
                              src={sub.avatar}
                              alt={sub.name}
                              className="h-8 w-8 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                            />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 font-bold dark:bg-slate-800 dark:text-slate-300">
                              {sub.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white">
                              {sub.name}
                            </p>
                            <p className="text-[11px] text-slate-400">{sub.email}</p>
                            {isHR && sub.companyName && (
                              <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold flex items-center gap-1 mt-0.5">
                                <Building2 className="h-3 w-3" />
                                {sub.companyName}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold ${
                            isHR
                              ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300'
                              : 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                          }`}
                        >
                          {isHR ? 'Doanh Nghiệp' : 'Ứng Viên'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
                          <Crown className="h-3.5 w-3.5 text-amber-500" />
                          <span>{sub.premiumPlan}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 font-medium whitespace-nowrap">
                        {sub.premiumExpiresAt
                          ? new Date(sub.premiumExpiresAt).toLocaleDateString('vi-VN')
                          : '—'}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {sub.isExpired ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-500">
                            <Clock className="h-3 w-3" />
                            Đã hết hạn
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                            <Clock className="h-3 w-3" />
                            Còn {sub.daysRemaining} ngày
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {sub.isPremium && !sub.isExpired ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100/70 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                            <CheckCircle2 className="h-3 w-3" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                            <XCircle className="h-3 w-3" />
                            Expired
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right space-x-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setExtendModalUser(sub);
                            setExtendDays(30);
                            setExtendNote('');
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-primary/20 dark:bg-primary/20 dark:text-primary-light transition cursor-pointer"
                        >
                          <PlusCircle className="h-3.5 w-3.5" />
                          Gia Hạn
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setCancelModalUser(sub);
                            setCancelReason('');
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-400 transition cursor-pointer"
                        >
                          Hủy VIP
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Extend Modal */}
      {extendModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <PlusCircle className="h-5 w-5 text-primary" />
              Gia Hạn Gói Premium Thủ Công
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Gia hạn cho: <strong>{extendModalUser.name}</strong> ({extendModalUser.email})
            </p>

            <form onSubmit={handleConfirmExtend} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Số ngày muốn cộng thêm:
                </label>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {[30, 90, 365].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setExtendDays(d)}
                      className={`rounded-xl py-2 font-bold transition border cursor-pointer ${
                        extendDays === d
                          ? 'border-primary bg-primary/10 text-primary dark:text-primary-light'
                          : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300'
                      }`}
                    >
                      +{d} ngày
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min="1"
                  required
                  value={extendDays}
                  onChange={(e) => setExtendDays(Number(e.target.value))}
                  placeholder="Hoặc tự nhập số ngày..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-primary dark:border-slate-800 dark:bg-slate-800 dark:text-primary-light"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Ghi chú quản trị (Lý do gia hạn):
                </label>
                <textarea
                  rows={3}
                  value={extendNote}
                  onChange={(e) => setExtendNote(e.target.value)}
                  placeholder="VD: Khách hàng mua qua chuyển khoản trực tiếp, hoặc chương trình tri ân..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setExtendModalUser(null)}
                  className="rounded-xl px-4 py-2 font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingExtend}
                  className="rounded-xl bg-primary px-5 py-2 font-bold text-white shadow-md shadow-primary/25 hover:bg-primary-dark disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingExtend ? 'Đang xử lý...' : `Xác Nhận (+${extendDays} Ngày)`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {cancelModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <h3 className="text-base font-black text-rose-600 flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" />
              Xác Nhận Thu Hồi Gói Premium
            </h3>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Bạn có chắc chắn muốn hủy kích hoạt gói Premium của người dùng{' '}
              <strong>{cancelModalUser.name}</strong> ({cancelModalUser.email})? Người dùng sẽ bị mất ngay lập tức các đặc quyền VIP.
            </p>

            <form onSubmit={handleConfirmCancel} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Lý do thu hồi gói:
                </label>
                <textarea
                  rows={3}
                  required
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="VD: Yêu cầu hoàn tiền từ PayOS, vi phạm chính sách đăng tin spam..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCancelModalUser(null)}
                  className="rounded-xl px-4 py-2 font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Không Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCancel}
                  className="rounded-xl bg-rose-600 px-5 py-2 font-bold text-white shadow-md shadow-rose-600/25 hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingCancel ? 'Đang hủy...' : 'Xác Nhận Hủy Premium'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
