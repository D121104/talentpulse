import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  CheckCircle2,
  XCircle,
  Lock,
  Unlock,
  ShieldCheck,
  Building2,
  Crown,
  AlertTriangle,
  UserCheck,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../../auth/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { adminApi, type AdminUserItem } from '../../../lib/adminApi';

interface UsersTabProps {
  users?: AdminUserItem[];
  isLoading?: boolean;
  onApproveHr?: (userId: string) => Promise<void>;
  onRejectHr?: (userId: string) => Promise<void>;
  onLockUser?: (userId: string, reason?: string) => Promise<void>;
  onUnlockUser?: (userId: string) => Promise<void>;
}

export const UsersTab: React.FC<UsersTabProps> = ({
  users: initialUsers,
  isLoading: initialLoading,
  onApproveHr: externalApprove,
  onRejectHr: externalReject,
  onLockUser: externalLock,
  onUnlockUser: externalUnlock,
}) => {
  const { accessToken } = useAuth();
  const { success, error, info } = useToast();

  const [users, setUsers] = useState<AdminUserItem[]>(initialUsers || []);
  const [isLoading, setIsLoading] = useState<boolean>(
    initialLoading !== undefined ? initialLoading : !initialUsers,
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchUsers = useCallback(async () => {
    if (!accessToken) return;
    try {
      setIsLoading(true);
      const data = await adminApi.getUsers(accessToken, { pageSize: 100 });
      setUsers(data);
    } catch (err: any) {
      console.error('Failed to load users', err);
      error(err.message || 'Không thể tải danh sách người dùng');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [accessToken, error]);

  useEffect(() => {
    if (initialUsers !== undefined) {
      setUsers(initialUsers);
      return;
    }
    fetchUsers();
  }, [initialUsers, fetchUsers]);

  const handleApproveHr = async (userId: string) => {
    if (externalApprove) {
      await externalApprove(userId);
      return;
    }
    if (!accessToken) return;
    try {
      await adminApi.approveHr(accessToken, userId);
      success('Đã phê duyệt nhà tuyển dụng thành công');
      fetchUsers();
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
      fetchUsers();
    } catch (err: any) {
      error(err.message || 'Từ chối thất bại');
    }
  };

  const handleLockUser = async (userId: string, reason?: string) => {
    if (externalLock) {
      await externalLock(userId, reason);
      return;
    }
    if (!accessToken) return;
    try {
      await adminApi.lockUser(accessToken, userId, reason);
      info('Đã khóa tài khoản người dùng');
      fetchUsers();
    } catch (err: any) {
      error(err.message || 'Khóa tài khoản thất bại');
    }
  };

  const handleUnlockUser = async (userId: string) => {
    if (externalUnlock) {
      await externalUnlock(userId);
      return;
    }
    if (!accessToken) return;
    try {
      await adminApi.unlockUser(accessToken, userId);
      success('Đã mở khóa tài khoản thành công');
      fetchUsers();
    } catch (err: any) {
      error(err.message || 'Mở khóa thất bại');
    }
  };

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    fetchUsers();
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'USER' | 'HR' | 'ADMIN' | 'PENDING_HR'>('ALL');
  const [lockModalUser, setLockModalUser] = useState<AdminUserItem | null>(null);
  const [lockReason, setLockReason] = useState('Vi phạm điều khoản dịch vụ và chính sách TalentPulse');
  const [isSubmittingLock, setIsSubmittingLock] = useState(false);

  const filteredUsers = users.filter((u) => {
    const matchSearch =
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.companyName && u.companyName.toLowerCase().includes(searchTerm.toLowerCase()));

    let matchRole = true;
    if (roleFilter === 'USER') matchRole = u.role === 'USER';
    else if (roleFilter === 'HR') matchRole = u.role === 'HR';
    else if (roleFilter === 'ADMIN') matchRole = u.role === 'ADMIN';
    else if (roleFilter === 'PENDING_HR') matchRole = u.role === 'HR' && !u.isApproved;

    return matchSearch && matchRole;
  });

  const handleConfirmLock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lockModalUser) return;
    try {
      setIsSubmittingLock(true);
      await handleLockUser(lockModalUser._id, lockReason);
      setLockModalUser(null);
    } finally {
      setIsSubmittingLock(false);
    }
  };

  if (isLoading && users.length === 0) {
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
            placeholder="Tìm theo tên, email hoặc tên công ty..."
            className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
          />
        </div>

        {/* Role Filters & Refresh */}
        <div className="flex items-center gap-2">
          <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            {[
              { id: 'ALL', label: `Tất cả (${users.length})` },
              { id: 'USER', label: `Ứng viên (${users.filter((u) => u.role === 'USER').length})` },
              { id: 'HR', label: `Doanh nghiệp (${users.filter((u) => u.role === 'HR').length})` },
              {
                id: 'PENDING_HR',
                label: `Chờ duyệt HR (${users.filter((u) => u.role === 'HR' && !u.isApproved).length})`,
                badge: true,
              },
              { id: 'ADMIN', label: `Admin (${users.filter((u) => u.role === 'ADMIN').length})` },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setRoleFilter(tab.id as any)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                  roleFilter === tab.id
                    ? 'bg-white text-primary shadow-xs dark:bg-slate-900 dark:text-primary-light'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
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

      {/* Users Table */}
      <div className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
                <th className="py-3.5 px-4 font-bold">Người dùng</th>
                <th className="py-3.5 px-4 font-bold">Vai trò</th>
                <th className="py-3.5 px-4 font-bold">Gói dịch vụ</th>
                <th className="py-3.5 px-4 font-bold">Phê duyệt (HR)</th>
                <th className="py-3.5 px-4 font-bold">Trạng thái khóa</th>
                <th className="py-3.5 px-4 font-bold">Ngày tham gia</th>
                <th className="py-3.5 px-4 text-right font-bold">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    Không tìm thấy người dùng nào phù hợp
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isHR = u.role === 'HR';
                  const isAdmin = u.role === 'ADMIN';

                  return (
                    <tr
                      key={u._id}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition"
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          {u.avatar ? (
                            <img
                              src={u.avatar}
                              alt={u.name}
                              className="h-8 w-8 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 font-bold dark:bg-slate-800 dark:text-slate-300">
                              {u.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-bold text-slate-900 dark:text-white">{u.name}</p>
                              {u.isVerified && (
                                <ShieldCheck className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400">{u.email}</p>
                            {isHR && u.companyName && (
                              <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold flex items-center gap-1 mt-0.5">
                                <Building2 className="h-3 w-3" />
                                {u.companyName}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold ${
                            isAdmin
                              ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                              : isHR
                              ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300'
                              : 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                          }`}
                        >
                          {isAdmin ? 'Quản Trị Viên' : isHR ? 'Nhà Tuyển Dụng' : 'Ứng Viên'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        {u.isPremium ? (
                          <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold">
                            <Crown className="h-3.5 w-3.5" />
                            <span>{u.premiumPlan || 'Premium'}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Thường</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {isHR ? (
                          u.isApproved ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" />
                              Đã duyệt
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-500">
                              <UserCheck className="h-3 w-3" />
                              Chờ duyệt
                            </span>
                          )
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {u.isLocked ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                            <Lock className="h-3 w-3" />
                            Đã khóa
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500">
                            Bình thường
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap">
                        {new Date(u.createdAt).toLocaleDateString('vi-VN')}
                      </td>

                      <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                        {/* HR Approval buttons if pending */}
                        {isHR && !u.isApproved && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleApproveHr(u._id)}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-2xs hover:bg-emerald-700 transition cursor-pointer"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              Duyệt
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRejectHr(u._id)}
                              className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-400 transition cursor-pointer"
                            >
                              <XCircle className="h-3 w-3" />
                              Từ chối
                            </button>
                          </>
                        )}

                        {/* Lock / Unlock Toggle (cannot lock another Admin or yourself) */}
                        {!isAdmin && (
                          u.isLocked ? (
                            <button
                              type="button"
                              onClick={() => handleUnlockUser(u._id)}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 transition cursor-pointer"
                            >
                              <Unlock className="h-3 w-3" />
                              Mở khóa
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setLockModalUser(u);
                                setLockReason('Vi phạm điều khoản dịch vụ và chính sách TalentPulse');
                              }}
                              className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-rose-50 hover:text-rose-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-rose-400 transition cursor-pointer"
                            >
                              <Lock className="h-3 w-3" />
                              Khóa
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lock User Modal */}
      {lockModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <h3 className="text-base font-black text-rose-600 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Khóa Tài Khoản Người Dùng
            </h3>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Bạn đang thực hiện khóa tài khoản <strong>{lockModalUser.name}</strong> ({lockModalUser.email}).
              Người dùng này sẽ không thể đăng nhập vào hệ thống TalentPulse cho đến khi được mở khóa.
            </p>

            <form onSubmit={handleConfirmLock} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Lý do khóa tài khoản:
                </label>
                <textarea
                  rows={3}
                  required
                  value={lockReason}
                  onChange={(e) => setLockReason(e.target.value)}
                  placeholder="Nhập lý do vi phạm..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setLockModalUser(null)}
                  className="rounded-xl px-4 py-2 font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingLock}
                  className="rounded-xl bg-rose-600 px-5 py-2 font-bold text-white shadow-md shadow-rose-600/25 hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingLock ? 'Đang khóa...' : 'Xác Nhận Khóa Tài Khoản'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
