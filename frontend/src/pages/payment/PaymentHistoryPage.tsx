import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../context/ToastContext';
import { paymentApi, PaymentOrder, PaymentStatus } from '../../lib/paymentApi';
import { getPaymentSocket } from '../../lib/socket';
import { PaymentCountdownBadge } from '../../components/premium/PaymentCountdownBadge';
import { formatDateTime, formatDate } from '../../lib/dateUtils';
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
  ArrowRight,
  Printer,
  X,
  TrendingUp,
} from 'lucide-react';

export default function PaymentHistoryPage() {
  const { user, accessToken } = useAuth();
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();
  const [searchParams] = useSearchParams();

  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<PaymentOrder | null>(null);
  const [cancellingOrderCode, setCancellingOrderCode] = useState<number | null>(null);

  // Fetch orders from API
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

  // Handle URL query status (e.g. from PayOS redirect)
  useEffect(() => {
    const statusParam = searchParams.get('status');
    const orderCodeParam = searchParams.get('orderCode');

    if (statusParam && orderCodeParam) {
      if (statusParam === 'paid' || statusParam === 'success') {
        toastSuccess(`Đơn hàng #${orderCodeParam} đã thanh toán thành công! Gói Premium đã được kích hoạt.`);
      } else if (statusParam === 'cancelled') {
        toastInfo(`Đơn hàng #${orderCodeParam} đã được hủy.`);
      } else if (statusParam === 'expired') {
        toastError(`Đơn hàng #${orderCodeParam} đã hết thời gian thanh toán.`);
      }
    }
  }, [searchParams, toastSuccess, toastInfo, toastError]);

  // Connect Socket.IO for realtime status updates
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
          toastSuccess(
            payload.message || `Đơn hàng #${payload.orderCode} đã thanh toán thành công!`
          );
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
      console.warn('Socket.IO initialization error:', err);
    }
  }, [user?._id, toastSuccess, toastInfo, toastError]);

  // Cancel order action
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

  // Safe Orders array
  const safeOrders = Array.isArray(orders) ? orders : [];

  // Filtered orders
  const filteredOrders = safeOrders.filter((o) => {
    const matchesStatus =
      statusFilter === 'ALL' || o.status === statusFilter;
    const matchesSearch =
      searchQuery === '' ||
      String(o.orderCode).includes(searchQuery) ||
      (o.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.transactionReference || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  // Calculate KPIs
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
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
            {status}
          </span>
        );
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
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100">
      <Header />

      <main className="flex-1 pt-24 pb-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-8">
          {/* Header Banner */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-primary-dark to-primary p-8 sm:p-10 text-white shadow-xl">
            <div className="pointer-events-none absolute -right-10 -bottom-10 h-64 w-64 rounded-full bg-white/10 blur-2xl" />

            <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1 text-xs font-black tracking-wider uppercase backdrop-blur-md border border-white/20">
                  <Receipt className="h-3.5 w-3.5 text-amber-300" />
                  <span>Quản Lý Hóa Đơn &amp; Giao Dịch</span>
                </div>
                <h1 className="text-2xl sm:text-4xl font-black tracking-tight">
                  Lịch Sử Thanh Toán PayOS
                </h1>
                <p className="text-sm text-slate-200 max-w-xl">
                  Theo dõi trạng thái đơn hàng thời gian thực, quản lý hóa đơn VAT điện tử và nâng cấp gói dịch vụ nhanh chóng.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Link
                  to={user?.role === 'HR' ? '/dashboard?tab=premium' : '/premium'}
                  className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-xs sm:text-sm font-extrabold text-primary shadow-lg hover:bg-slate-50 active:scale-95 transition-all cursor-pointer"
                >
                  <Crown className="h-4 w-4 text-amber-500" />
                  <span>Nâng cấp gói Premium</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <button
                  onClick={() => fetchOrders(true)}
                  disabled={isRefreshing}
                  className="flex items-center justify-center rounded-2xl bg-white/10 p-3 text-white backdrop-blur-md border border-white/20 hover:bg-white/20 transition-all cursor-pointer disabled:opacity-50"
                  title="Làm mới dữ liệu"
                >
                  <RefreshCw className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
          </div>

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
            {/* Active Plan */}
            <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary dark:bg-primary/20 shrink-0">
                <Crown className="h-7 w-7 text-amber-500" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  Gói dịch vụ hiện tại
                </span>
                <h4 className="text-base font-extrabold text-slate-900 dark:text-white truncate">
                  {user?.isPremium
                    ? user?.premiumPlan === 'CANDIDATE_PREMIUM'
                      ? 'Candidate Premium'
                      : 'HR Premium Enterprise'
                    : 'Tài khoản Thường (Free)'}
                </h4>
                <p className="text-[11px] font-semibold text-slate-500 mt-0.5">
                  {user?.isPremium && user?.premiumExpiresAt
                    ? `Hạn dùng: ${formatDate(user.premiumExpiresAt)}`
                    : 'Chưa nâng cấp Premium'}
                </p>
              </div>
            </div>

            {/* Total Spent */}
            <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 shrink-0">
                <TrendingUp className="h-7 w-7" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  Tổng tiền đã thanh toán
                </span>
                <h4 className="text-xl font-black text-emerald-600 dark:text-emerald-400 truncate">
                  {totalPaidAmount.toLocaleString('vi-VN')} đ
                </h4>
                <p className="text-[11px] font-semibold text-slate-500 mt-0.5">
                  {paidCount} giao dịch thành công
                </p>
              </div>
            </div>

            {/* Pending Orders */}
            <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 shrink-0">
                <Clock className="h-7 w-7" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  Đơn đang chờ xử lý
                </span>
                <h4 className="text-xl font-black text-amber-600 dark:text-amber-400 truncate">
                  {pendingCount} đơn hàng
                </h4>
                <p className="text-[11px] font-semibold text-slate-500 mt-0.5">
                  Đồng bộ tức thì qua PayOS
                </p>
              </div>
            </div>
          </div>

          {/* Filter & Search Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800">
            {/* Status Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {[
                { id: 'ALL', label: 'Tất cả' },
                { id: 'PAID', label: 'Đã thanh toán' },
                { id: 'PENDING', label: 'Chờ thanh toán' },
                { id: 'CANCELLED', label: 'Đã hủy' },
                { id: 'EXPIRED', label: 'Hết hạn' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={`rounded-xl px-3.5 py-2 text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    statusFilter === tab.id
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm mã đơn, giao dịch..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 pl-10 pr-4 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {/* Orders Table */}
          <div className="overflow-hidden rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
            {isLoading ? (
              <div className="py-20 text-center space-y-3">
                <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto" />
                <p className="text-sm font-semibold text-slate-500">
                  Đang tải danh sách hóa đơn thanh toán...
                </p>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="py-16 text-center space-y-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100 dark:bg-slate-800 text-slate-400 mx-auto">
                  <Receipt className="h-8 w-8" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-base font-bold text-slate-900 dark:text-white">
                    Chưa có giao dịch thanh toán nào
                  </h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Nâng cấp gói Premium để bứt phá tuyển dụng và trải nghiệm các tính năng AI đỉnh cao.
                  </p>
                </div>
                <Link
                  to={user?.role === 'HR' ? '/dashboard?tab=premium' : '/premium'}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-white shadow-md hover:bg-primary-dark transition-all"
                >
                  <Crown className="h-4 w-4" />
                  <span>Xem các gói Premium</span>
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-200/80 dark:border-slate-800">
                    <tr>
                      <th className="py-3.5 px-5">Mã đơn hàng</th>
                      <th className="py-3.5 px-4">Gói dịch vụ</th>
                      <th className="py-3.5 px-4">Chu kỳ</th>
                      <th className="py-3.5 px-4">Số tiền</th>
                      <th className="py-3.5 px-4">Trạng thái</th>
                      <th className="py-3.5 px-4">Ngày tạo</th>
                      <th className="py-3.5 px-5 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                    {filteredOrders.map((order) => {
                      const isCandidate = order.planType === 'CANDIDATE_PREMIUM';
                      return (
                        <tr
                          key={order._id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          {/* Order Code */}
                          <td className="py-4 px-5">
                            <button
                              onClick={() => setSelectedOrder(order)}
                              className="font-black text-primary dark:text-primary-light hover:underline font-mono text-sm cursor-pointer"
                            >
                              #{order.orderCode}
                            </button>
                            {order.transactionReference && (
                              <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                                Ref: {order.transactionReference}
                              </p>
                            )}
                          </td>

                          {/* Plan Type */}
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-2">
                              <span
                                className={`rounded-md px-2 py-0.5 text-[10px] font-black ${
                                  isCandidate
                                    ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                    : 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                                }`}
                              >
                                {isCandidate ? 'CANDIDATE PREMIUM' : 'HR ENTERPRISE'}
                              </span>
                            </div>
                          </td>

                          {/* Cycle */}
                          <td className="py-4 px-4 font-semibold text-slate-700 dark:text-slate-300">
                            {getCycleLabel(order.billingCycle)} ({order.durationDays} ngày)
                          </td>

                          {/* Amount */}
                          <td className="py-4 px-4 font-extrabold text-slate-900 dark:text-white">
                            {Number(order.amount).toLocaleString('vi-VN')} đ
                          </td>

                          {/* Status */}
                          <td className="py-4 px-4">{renderStatusBadge(order.status, order.expiresAt)}</td>

                          {/* Created Date */}
                          <td className="py-4 px-4 text-slate-500 font-medium">
                            {formatDateTime(order.createdAt)}
                          </td>

                          {/* Actions */}
                          <td className="py-4 px-5 text-right space-x-2">
                            {order.status === 'PENDING' && order.checkoutUrl && (
                              <a
                                href={order.checkoutUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 rounded-xl bg-primary px-3 py-1.5 text-[11px] font-bold text-white shadow-xs hover:bg-primary-dark transition-all cursor-pointer"
                              >
                                <span>Thanh toán</span>
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}

                            {order.status === 'PENDING' && (
                              <button
                                onClick={() => handleCancelOrder(order.orderCode)}
                                disabled={cancellingOrderCode === order.orderCode}
                                className="inline-flex items-center gap-1 rounded-xl bg-rose-500/10 px-3 py-1.5 text-[11px] font-bold text-rose-600 hover:bg-rose-500/20 transition-all cursor-pointer disabled:opacity-50"
                              >
                                <Ban className="h-3 w-3" />
                                <span>Hủy</span>
                              </button>
                            )}

                            <button
                              onClick={() => setSelectedOrder(order)}
                              className="inline-flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all cursor-pointer"
                            >
                              <Receipt className="h-3 w-3" />
                              <span>Hóa đơn</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />

      {/* Invoice Receipt Detail Modal */}
      {selectedOrder &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <div
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setSelectedOrder(null)}
            />

            <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-3xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150">
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-slate-900 to-primary p-6 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur-md">
                    <Receipt className="h-5 w-5 text-amber-300" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black">Chi Tiết Hóa Đơn Điện Tử</h3>
                    <p className="text-xs text-slate-200">Đơn hàng #{selectedOrder.orderCode}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Receipt Body */}
              <div className="p-6 space-y-5 text-xs">
                {/* Status Header */}
                <div className="flex items-center justify-between rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-4 border border-slate-200/80 dark:border-slate-700/60">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase tracking-wider font-bold">
                      Trạng thái đơn hàng
                    </span>
                    <div className="mt-1">
                      {renderStatusBadge(selectedOrder.status, selectedOrder.expiresAt)}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400 block text-[10px] uppercase tracking-wider font-bold">
                      Loại gói
                    </span>
                    <span className="font-extrabold text-slate-900 dark:text-white">
                      {selectedOrder.planType === 'CANDIDATE_PREMIUM'
                        ? 'Candidate VIP'
                        : 'HR Enterprise'}
                    </span>
                  </div>
                </div>

                {/* Details Breakdown */}
                <div className="space-y-2.5 border-b border-dashed border-slate-200 dark:border-slate-700/80 pb-4">
                  <div className="flex justify-between text-slate-600 dark:text-slate-300">
                    <span>Chu kỳ đăng ký:</span>
                    <span className="font-bold">
                      {getCycleLabel(selectedOrder.billingCycle)} ({selectedOrder.durationDays} ngày)
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-300">
                    <span>Thời gian khởi tạo:</span>
                    <span className="font-medium">
                      {formatDateTime(selectedOrder.createdAt)}
                    </span>
                  </div>
                  {selectedOrder.paidAt && (
                    <div className="flex justify-between text-slate-600 dark:text-slate-300">
                      <span>Thời gian thanh toán:</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        {formatDateTime(selectedOrder.paidAt)}
                      </span>
                    </div>
                  )}
                  {selectedOrder.transactionReference && (
                    <div className="flex justify-between text-slate-600 dark:text-slate-300">
                      <span>Mã đối soát PayOS:</span>
                      <span className="font-mono font-bold">
                        {selectedOrder.transactionReference}
                      </span>
                    </div>
                  )}
                  {selectedOrder.counterAccountName && (
                    <div className="flex justify-between text-slate-600 dark:text-slate-300">
                      <span>Tài khoản thanh toán:</span>
                      <span className="font-medium">
                        {selectedOrder.counterAccountName} ({selectedOrder.counterAccountBankName})
                      </span>
                    </div>
                  )}
                </div>

                {/* VAT Info (if requested) */}
                {selectedOrder.vatInvoiceRequested && (
                  <div className="rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 p-4 border border-blue-100 dark:border-blue-900/40 text-xs space-y-1.5">
                    <span className="font-extrabold text-blue-900 dark:text-blue-300 block">
                      Thông Tin Xuất Hóa Đơn VAT:
                    </span>
                    <p className="text-slate-700 dark:text-slate-300">
                      <strong>Tên doanh nghiệp:</strong> {selectedOrder.vatCompanyName}
                    </p>
                    <p className="text-slate-700 dark:text-slate-300">
                      <strong>Mã số thuế:</strong> {selectedOrder.vatTaxCode}
                    </p>
                    {selectedOrder.vatAddress && (
                      <p className="text-slate-700 dark:text-slate-300">
                        <strong>Địa chỉ:</strong> {selectedOrder.vatAddress}
                      </p>
                    )}
                  </div>
                )}

                {/* Total */}
                <div className="flex justify-between items-center text-sm font-black pt-1">
                  <span>Tổng tiền đã thanh toán:</span>
                  <span className="text-xl text-primary dark:text-primary-light">
                    {Number(selectedOrder.amount).toLocaleString('vi-VN')} đ
                  </span>
                </div>

                {/* Modal Actions */}
                <div className="flex items-center gap-3 pt-3">
                  <button
                    onClick={() => window.print()}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 dark:bg-slate-800 py-3 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                  >
                    <Printer className="h-4 w-4" />
                    <span>In hóa đơn</span>
                  </button>
                  {selectedOrder.status === 'PENDING' && selectedOrder.checkoutUrl && (
                    <a
                      href={selectedOrder.checkoutUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-xs font-extrabold text-white shadow-md hover:bg-primary-dark transition-colors cursor-pointer"
                    >
                      <span>Thanh toán ngay</span>
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
