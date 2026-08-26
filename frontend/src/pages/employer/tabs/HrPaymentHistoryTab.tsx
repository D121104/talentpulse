import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../auth/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { paymentApi, PaymentOrder, PaymentStatus } from '../../../lib/paymentApi';
import { getPaymentSocket } from '../../../lib/socket';
import { PaymentCountdownBadge } from '../../../components/premium/PaymentCountdownBadge';
import { formatDateTime } from '../../../lib/dateUtils';
import {
  Receipt,
  Crown,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  ExternalLink,
  Ban,
  RefreshCw,
  Search,
  X,
  TrendingUp,
} from 'lucide-react';

export const HrPaymentHistoryTab: React.FC = () => {
  const { user, accessToken } = useAuth();
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();

  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<PaymentOrder | null>(null);
  const [cancellingOrderCode, setCancellingOrderCode] = useState<number | null>(null);

  const fetchOrders = useCallback(async (showRefreshing = false) => {
    if (!accessToken) return;
    if (showRefreshing) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const data: any = await paymentApi.getPaymentHistory(accessToken);
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.data)
        ? data.data
        : [];
      setOrders(list);
    } catch (err: any) {
      toastError(err?.message || 'Không thể tải lịch sử thanh toán');
      setOrders([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [accessToken, toastError]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Realtime Socket.IO
  useEffect(() => {
    if (!user?._id) return;
    try {
      const socket = getPaymentSocket();

      const handleConnect = () => {
        socket.emit('join', { userId: user._id });
      };

      if (socket.connected) {
        handleConnect();
      } else {
        socket.on('connect', handleConnect);
      }

      const handleStatusChanged = (payload: {
        orderCode: number;
        status: PaymentStatus;
        message?: string;
      }) => {
        setOrders((prev) => {
          const arr = Array.isArray(prev) ? prev : [];
          return arr.map((o) =>
            o.orderCode === payload.orderCode
              ? { ...o, status: payload.status, paidAt: payload.status === 'PAID' ? new Date().toISOString() : o.paidAt }
              : o
          );
        });

        if (payload.status === 'PAID') {
          toastSuccess(payload.message || `Đơn hàng #${payload.orderCode} đã thanh toán thành công!`);
        } else if (payload.status === 'CANCELLED') {
          toastInfo(`Đơn hàng #${payload.orderCode} đã bị hủy.`);
        } else if (payload.status === 'EXPIRED') {
          toastError(`Đơn hàng #${payload.orderCode} đã hết hạn thanh toán.`);
        }
      };

      socket.on('payment:status-changed', handleStatusChanged);

      return () => {
        socket.off('connect', handleConnect);
        socket.off('payment:status-changed', handleStatusChanged);
      };
    } catch (err) {
      console.warn('Socket.IO initialization error in HR tab:', err);
    }
  }, [user?._id, toastSuccess, toastInfo, toastError]);

  const handleCancelOrder = async (orderCode: number) => {
    if (!accessToken) return;
    if (!window.confirm(`Bạn có chắc chắn muốn hủy đơn hàng #${orderCode}?`)) return;

    setCancellingOrderCode(orderCode);
    try {
      await paymentApi.cancelPaymentOrder(accessToken, orderCode);
      toastSuccess(`Đã hủy đơn hàng #${orderCode} thành công.`);
      setOrders((prev) => {
        const arr = Array.isArray(prev) ? prev : [];
        return arr.map((o) =>
          o.orderCode === orderCode ? { ...o, status: 'CANCELLED' } : o
        );
      });
    } catch (err: any) {
      toastError(err?.message || 'Không thể hủy đơn hàng');
    } finally {
      setCancellingOrderCode(null);
    }
  };

  const safeOrders = Array.isArray(orders) ? orders : [];

  const filteredOrders = safeOrders.filter((o) => {
    const matchesStatus = statusFilter === 'ALL' || o.status === statusFilter;
    const matchesSearch =
      searchQuery === '' ||
      String(o.orderCode).includes(searchQuery) ||
      (o.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.transactionReference || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const totalPaidAmount = safeOrders
    .filter((o) => o.status === 'PAID')
    .reduce((sum, o) => sum + Number(o.amount || 0), 0);
  const paidCount = safeOrders.filter((o) => o.status === 'PAID').length;
  const pendingCount = safeOrders.filter((o) => o.status === 'PENDING').length;

  const renderStatusBadge = (status: PaymentStatus, expiresAt?: string | null) => {
    switch (status) {
      case 'PAID':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Đã thanh toán
          </span>
        );
      case 'PENDING':
        return <PaymentCountdownBadge expiresAt={expiresAt} />;
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-500/10 px-3 py-1 text-xs font-bold text-slate-500 dark:text-slate-400 border border-slate-500/20">
            <XCircle className="h-3.5 w-3.5" />
            Đã hủy
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-xs font-bold text-rose-600 dark:text-rose-400 border border-rose-500/20">
            <AlertTriangle className="h-3.5 w-3.5" />
            Hết hạn
          </span>
        );
      default:
        return <span>{status}</span>;
    }
  };

  const getCycleLabel = (cycle: string) => {
    switch (cycle) {
      case 'monthly':
        return '1 Tháng';
      case 'semi_annual':
        return '6 Tháng';
      case 'annual':
        return '1 Năm';
      default:
        return cycle;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-0.5 text-xs font-bold text-primary">
            <Receipt className="h-3.5 w-3.5" />
            <span>Hóa Đơn &amp; Giao Dịch Doanh Nghiệp</span>
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
            Lịch Sử Giao Dịch &amp; Hóa Đơn VAT
          </h2>
          <p className="text-xs text-slate-500">
            Toàn bộ các hóa đơn nâng cấp gói HR Premium Enterprise của doanh nghiệp.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchOrders(true)}
            disabled={isRefreshing}
            className="flex items-center gap-2 rounded-xl bg-slate-100 dark:bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-white dark:bg-slate-900 p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shrink-0">
            <Crown className="h-6 w-6 text-amber-500" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400">Gói hiện tại</span>
            <p className="text-sm font-extrabold text-slate-900 dark:text-white">
              {user?.isPremium ? '👑 HR Premium' : 'HR Standard (Free)'}
            </p>
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 shrink-0">
            <TrendingUp className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400">Tổng chi tiêu</span>
            <p className="text-base font-black text-emerald-600 dark:text-emerald-400">
              {totalPaidAmount.toLocaleString('vi-VN')} đ
            </p>
            <p className="text-[10px] text-slate-500 font-medium">
              {paidCount} giao dịch thành công
            </p>
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 shrink-0">
            <Clock className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400">Đơn đang chờ</span>
            <p className="text-base font-black text-amber-600 dark:text-amber-400">
              {pendingCount} đơn hàng
            </p>
          </div>
        </div>
      </div>

      {/* Filter & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: 'ALL', label: 'Tất cả' },
            { id: 'PAID', label: 'Đã thanh toán' },
            { id: 'PENDING', label: 'Chờ xử lý' },
            { id: 'CANCELLED', label: 'Đã hủy' },
            { id: 'EXPIRED', label: 'Hết hạn' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-primary text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm mã đơn hàng..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 pl-9 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
        {isLoading ? (
          <div className="py-16 text-center space-y-2">
            <RefreshCw className="h-6 w-6 animate-spin text-primary mx-auto" />
            <p className="text-xs text-slate-500 font-semibold">Đang tải lịch sử giao dịch...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="py-14 text-center space-y-2 text-xs text-slate-500">
            <Receipt className="h-8 w-8 mx-auto text-slate-400" />
            <p className="font-bold text-slate-700 dark:text-slate-300">Không có hóa đơn giao dịch nào</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200/80 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Mã đơn</th>
                  <th className="py-3 px-4">Gói</th>
                  <th className="py-3 px-4">Chu kỳ</th>
                  <th className="py-3 px-4">Số tiền</th>
                  <th className="py-3 px-4">Trạng thái</th>
                  <th className="py-3 px-4">Ngày tạo</th>
                  <th className="py-3 px-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredOrders.map((order) => (
                  <tr key={order._id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="py-3.5 px-4 font-mono font-black text-primary hover:underline cursor-pointer" onClick={() => setSelectedOrder(order)}>
                      #{order.orderCode}
                    </td>
                    <td className="py-3.5 px-4 font-bold">
                      {order.planType === 'HR_PREMIUM' ? 'HR ENTERPRISE' : 'CANDIDATE PREMIUM'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                      {getCycleLabel(order.billingCycle)} ({order.durationDays} ngày)
                    </td>
                    <td className="py-3.5 px-4 font-extrabold text-slate-900 dark:text-white">
                      {Number(order.amount).toLocaleString('vi-VN')} đ
                    </td>
                    <td className="py-3.5 px-4">{renderStatusBadge(order.status, order.expiresAt)}</td>
                    <td className="py-3.5 px-4 text-slate-500 font-medium">
                      {formatDateTime(order.createdAt)}
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-1.5">
                      {order.status === 'PENDING' && order.checkoutUrl && (
                        <a
                          href={order.checkoutUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-[11px] font-bold text-white shadow-xs"
                        >
                          <span>Thanh toán</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {order.status === 'PENDING' && (
                        <button
                          onClick={() => handleCancelOrder(order.orderCode)}
                          disabled={cancellingOrderCode === order.orderCode}
                          className="inline-flex items-center gap-1 rounded-lg bg-rose-500/10 px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-500/20"
                        >
                          <Ban className="h-3 w-3" />
                          <span>Hủy</span>
                        </button>
                      )}
                      <button
                        onClick={() => setSelectedOrder(order)}
                        className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-300"
                      >
                        <Receipt className="h-3 w-3" />
                        <span>Hóa đơn</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invoice Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setSelectedOrder(null)}
          />

          <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-3xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-gradient-to-r from-slate-900 to-primary p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Receipt className="h-5 w-5 text-amber-300" />
                <h3 className="text-base font-black">Hóa Đơn Điện Tử #{selectedOrder.orderCode}</h3>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="rounded-full p-1.5 text-white/70 hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="flex justify-between items-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                <span className="font-bold text-slate-500">Trạng thái:</span>
                <div>{renderStatusBadge(selectedOrder.status, selectedOrder.expiresAt)}</div>
              </div>

              <div className="space-y-2 border-b border-dashed border-slate-200 dark:border-slate-800 pb-3">
                <div className="flex justify-between">
                  <span className="text-slate-500">Gói dịch vụ:</span>
                  <span className="font-bold">HR Premium Enterprise</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Chu kỳ:</span>
                  <span>{getCycleLabel(selectedOrder.billingCycle)} ({selectedOrder.durationDays} ngày)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Ngày tạo:</span>
                  <span>{formatDateTime(selectedOrder.createdAt)}</span>
                </div>
                {selectedOrder.paidAt && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Ngày thanh toán:</span>
                    <span className="font-bold text-emerald-600">{formatDateTime(selectedOrder.paidAt)}</span>
                  </div>
                )}
                {selectedOrder.transactionReference && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Mã giao dịch:</span>
                    <span className="font-mono">{selectedOrder.transactionReference}</span>
                  </div>
                )}
              </div>

              {selectedOrder.vatInvoiceRequested && (
                <div className="rounded-xl bg-blue-50/50 dark:bg-blue-900/10 p-3 border border-blue-100 dark:border-blue-900/30 space-y-1">
                  <span className="font-bold text-blue-900 dark:text-blue-300 block">Thông tin xuất hóa đơn VAT:</span>
                  <p className="text-slate-700 dark:text-slate-300"><strong>Công ty:</strong> {selectedOrder.vatCompanyName}</p>
                  <p className="text-slate-700 dark:text-slate-300"><strong>MST:</strong> {selectedOrder.vatTaxCode}</p>
                  {selectedOrder.vatAddress && (
                    <p className="text-slate-700 dark:text-slate-300"><strong>Địa chỉ:</strong> {selectedOrder.vatAddress}</p>
                  )}
                </div>
              )}

              <div className="flex justify-between items-center text-sm font-black pt-1">
                <span>Tổng thanh toán:</span>
                <span className="text-lg text-primary">{Number(selectedOrder.amount).toLocaleString('vi-VN')} đ</span>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => window.print()}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-200"
                >
                  In hóa đơn
                </button>
                {selectedOrder.status === 'PENDING' && selectedOrder.checkoutUrl && (
                  <a
                    href={selectedOrder.checkoutUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 py-2.5 rounded-xl bg-primary font-bold text-white text-center"
                  >
                    Thanh toán ngay
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
