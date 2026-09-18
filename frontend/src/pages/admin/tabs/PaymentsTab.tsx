import React, { useState, useEffect, useCallback } from 'react';
import {
  CreditCard,
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  FileText,
  ExternalLink,
  Eye,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../../auth/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { adminApi, type AdminTransactionItem } from '../../../lib/adminApi';

interface PaymentsTabProps {
  transactions?: AdminTransactionItem[];
  isLoading?: boolean;
}

export const PaymentsTab: React.FC<PaymentsTabProps> = ({
  transactions: initialTransactions,
  isLoading: initialLoading,
}) => {
  const { accessToken } = useAuth();
  const { error } = useToast();

  const [transactions, setTransactions] = useState<AdminTransactionItem[]>(
    initialTransactions || [],
  );
  const [isLoading, setIsLoading] = useState<boolean>(
    initialLoading !== undefined ? initialLoading : !initialTransactions,
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchTransactions = useCallback(async () => {
    if (!accessToken) return;
    try {
      setIsLoading(true);
      const data = await adminApi.getTransactions(accessToken, { pageSize: 100 });
      setTransactions(data);
    } catch (err: any) {
      console.error('Failed to load transactions', err);
      error(err.message || 'Không thể tải danh sách giao dịch');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [accessToken, error]);

  useEffect(() => {
    if (initialTransactions !== undefined) {
      setTransactions(initialTransactions);
      return;
    }
    fetchTransactions();
  }, [initialTransactions, fetchTransactions]);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedTx, setSelectedTx] = useState<AdminTransactionItem | null>(null);

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    fetchTransactions();
  };

  const filteredTransactions = transactions.filter((tx) => {
    const matchSearch =
      tx.orderCode.toString().includes(searchTerm) ||
      (tx.user &&
        (tx.user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          tx.user.email.toLowerCase().includes(searchTerm.toLowerCase())));

    const matchStatus = statusFilter === 'ALL' || tx.status === statusFilter;

    return matchSearch && matchStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PAID':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            <CheckCircle2 className="h-3 w-3" />
            Đã thanh toán
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            <Clock className="h-3 w-3" />
            Chờ thanh toán
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            <XCircle className="h-3 w-3" />
            Đã hủy
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
            <AlertCircle className="h-3 w-3" />
            Hết hạn
          </span>
        );
      default:
        return (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
            {status}
          </span>
        );
    }
  };

  if (isLoading && transactions.length === 0) {
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
            placeholder="Tìm theo Mã đơn hàng (orderCode), tên hoặc email..."
            className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
          />
        </div>

        {/* Filter Badges & Refresh */}
        <div className="flex items-center gap-2">
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-slate-100 p-1 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            {[
              { id: 'ALL', label: 'Tất cả' },
              { id: 'PAID', label: 'Thành công (PAID)' },
              { id: 'PENDING', label: 'Chờ thanh toán' },
              { id: 'CANCELLED', label: 'Đã hủy' },
              { id: 'EXPIRED', label: 'Hết hạn' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setStatusFilter(item.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                  statusFilter === item.id
                    ? 'bg-white text-primary shadow-xs dark:bg-slate-900 dark:text-primary-light'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {item.label}
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

      {/* Transactions Table */}
      <div className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
                <th className="py-3.5 px-4 font-bold">Mã đơn (OrderCode)</th>
                <th className="py-3.5 px-4 font-bold">Người mua</th>
                <th className="py-3.5 px-4 font-bold">Gói dịch vụ</th>
                <th className="py-3.5 px-4 font-bold">Số tiền (VND)</th>
                <th className="py-3.5 px-4 font-bold">Trạng thái</th>
                <th className="py-3.5 px-4 font-bold">Hóa đơn VAT</th>
                <th className="py-3.5 px-4 font-bold">Thời gian</th>
                <th className="py-3.5 px-4 text-right font-bold">Chi tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Không tìm thấy giao dịch nào phù hợp
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => {
                  const cycleLabel =
                    tx.billingCycle === 'monthly'
                      ? '1 Tháng'
                      : tx.billingCycle === 'semi_annual'
                      ? '6 Tháng'
                      : '1 Năm';

                  return (
                    <tr
                      key={tx._id}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition"
                    >
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white">
                        #{tx.orderCode}
                      </td>

                      <td className="py-3.5 px-4">
                        {tx.user ? (
                          <div className="flex items-center gap-2.5">
                            {tx.user.avatar ? (
                              <img
                                src={tx.user.avatar}
                                alt={tx.user.name}
                                className="h-7 w-7 rounded-full object-cover"
                              />
                            ) : (
                              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600 font-bold dark:bg-slate-800 dark:text-slate-300">
                                {tx.user.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <p className="font-bold text-slate-900 dark:text-white">
                                {tx.user.name}
                              </p>
                              <p className="text-[11px] text-slate-400">{tx.user.email}</p>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">User không tồn tại</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <p className="font-bold text-slate-800 dark:text-slate-200">
                          {tx.planType === 'HR_PREMIUM' ? 'HR Premium' : 'Candidate Premium'}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {cycleLabel} ({tx.durationDays} ngày)
                        </p>
                      </td>

                      <td className="py-3.5 px-4 font-extrabold text-primary dark:text-primary-light">
                        {tx.amount.toLocaleString('vi-VN')} đ
                      </td>

                      <td className="py-3.5 px-4">{getStatusBadge(tx.status)}</td>

                      <td className="py-3.5 px-4">
                        {tx.vatInvoiceRequested ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                            <FileText className="h-3 w-3" />
                            Có VAT
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Không</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        <p>{new Date(tx.createdAt).toLocaleDateString('vi-VN')}</p>
                        <p className="text-[10px] text-slate-400">
                          {new Date(tx.createdAt).toLocaleTimeString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedTx(tx)}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition cursor-pointer"
                        >
                          <Eye className="h-3 w-3" />
                          Xem
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

      {/* Transaction Detail Modal */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 sm:p-8 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    Chi Tiết Giao Dịch #{selectedTx.orderCode}
                  </h3>
                  <p className="text-xs text-slate-400">Cổng thanh toán PayOS</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTx(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            <div className="mt-6 space-y-4 text-xs">
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <span className="font-medium text-slate-500 dark:text-slate-400">Trạng thái:</span>
                <div>{getStatusBadge(selectedTx.status)}</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                  <span className="text-slate-400 text-[11px]">Số tiền</span>
                  <p className="text-base font-black text-primary dark:text-primary-light mt-0.5">
                    {selectedTx.amount.toLocaleString('vi-VN')} đ
                  </p>
                </div>
                <div className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                  <span className="text-slate-400 text-[11px]">Gói / Chu kỳ</span>
                  <p className="font-bold text-slate-900 dark:text-white mt-0.5">
                    {selectedTx.planType} ({selectedTx.billingCycle})
                  </p>
                </div>
              </div>

              {selectedTx.user && (
                <div className="p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-1.5">
                  <span className="font-bold text-slate-700 dark:text-slate-300">Thông tin người mua:</span>
                  <p className="text-slate-900 dark:text-white font-medium">
                    {selectedTx.user.name} ({selectedTx.user.role})
                  </p>
                  <p className="text-slate-400">{selectedTx.user.email}</p>
                </div>
              )}

              <div className="p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-2">
                <span className="font-bold text-slate-700 dark:text-slate-300">Thời gian:</span>
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Khởi tạo:</span>
                  <span className="font-medium">{new Date(selectedTx.createdAt).toLocaleString('vi-VN')}</span>
                </div>
                {selectedTx.paidAt && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                    <span>Thanh toán lúc:</span>
                    <span className="font-bold">{new Date(selectedTx.paidAt).toLocaleString('vi-VN')}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Hạn thanh toán:</span>
                  <span className="font-medium">{new Date(selectedTx.expiresAt).toLocaleString('vi-VN')}</span>
                </div>
              </div>

              {selectedTx.vatInvoiceRequested && (
                <div className="p-3.5 rounded-2xl border border-indigo-200 bg-indigo-50/50 dark:border-indigo-900 dark:bg-indigo-950/20 space-y-1.5">
                  <span className="font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" />
                    Thông Tin Xuất Hóa Đơn VAT
                  </span>
                  <p className="text-slate-800 dark:text-slate-200 font-medium">
                    Doanh nghiệp: {selectedTx.vatCompanyName || 'Chưa cập nhật'}
                  </p>
                  <p className="text-slate-600 dark:text-slate-400">
                    Mã số thuế: {selectedTx.vatTaxCode || 'Chưa cập nhật'}
                  </p>
                </div>
              )}

              {selectedTx.checkoutUrl && selectedTx.status === 'PENDING' && (
                <div className="pt-2">
                  <a
                    href={selectedTx.checkoutUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 font-bold text-white shadow-md shadow-primary/20 hover:bg-primary-dark transition"
                  >
                    <span>Mở Link Thanh Toán PayOS</span>
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
