import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  Sparkles,
  Bot,
  Flame,
  Search,
  Check,
  RefreshCw,
  Building2,
  User,
} from 'lucide-react';
import { useAuth } from '../../../auth/AuthContext';
import { useToast } from '../../../context/ToastContext';
import {
  adminApi,
  type AdminPackageItem,
  type CreatePackageInput,
  type UpdatePackageInput,
} from '../../../lib/adminApi';

interface PremiumPackagesTabProps {
  packages?: AdminPackageItem[];
  isLoading?: boolean;
  onCreatePackage?: (data: CreatePackageInput) => Promise<void>;
  onUpdatePackage?: (id: string, data: UpdatePackageInput) => Promise<void>;
  onToggleActive?: (id: string) => Promise<void>;
  onDeletePackage?: (id: string) => Promise<void>;
}

const CANDIDATE_FEATURE_PRESETS = [
  'Không giới hạn tạo và tải CV chất lượng cao',
  'Đẩy Top hồ sơ 24h mỗi ngày (HOT Profile)',
  'Xem danh sách NTD đã ghé thăm hồ sơ',
  'Huy hiệu Candidate Premium VIP nổi bật',
  'AI Career Assistant: phân tích và chấm điểm CV',
  'Tải CV định dạng PDF chuẩn ATS không watermark',
];

const HR_FEATURE_PRESETS = [
  'Đăng tin tuyển dụng không giới hạn',
  'Gắn nhãn HOT JOB và đẩy Top hiển thị đầu trang',
  'Mở khóa tìm kiếm hồ sơ ứng viên nâng cao',
  'Huy hiệu Nhà tuyển dụng Uy tín Premium',
  'AI Sourcing & Matching ứng viên tự động',
  'Tài khoản chuyên biệt chăm sóc 24/7',
];

export const PremiumPackagesTab: React.FC<PremiumPackagesTabProps> = ({
  packages: initialPackages,
  isLoading: initialLoading,
  onCreatePackage: externalCreate,
  onUpdatePackage: externalUpdate,
  onToggleActive: externalToggle,
  onDeletePackage: externalDelete,
}) => {
  const { accessToken } = useAuth();
  const { success, error } = useToast();

  const [packages, setPackages] = useState<AdminPackageItem[]>(initialPackages || []);
  const [isLoading, setIsLoading] = useState<boolean>(
    initialLoading !== undefined ? initialLoading : !initialPackages,
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchPackages = useCallback(async () => {
    if (!accessToken) return;
    try {
      setIsLoading(true);
      const data = await adminApi.getAllPackages(accessToken);
      setPackages(data);
    } catch (err: any) {
      console.error('Failed to load packages', err);
      error(err.message || 'Không thể tải danh sách gói Premium');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [accessToken, error]);

  useEffect(() => {
    if (initialPackages !== undefined) {
      setPackages(initialPackages);
      return;
    }
    fetchPackages();
  }, [initialPackages, fetchPackages]);

  const handleCreatePackage = async (data: CreatePackageInput) => {
    if (externalCreate) {
      await externalCreate(data);
      return;
    }
    if (!accessToken) return;
    try {
      await adminApi.createPackage(accessToken, data);
      success('Đã tạo gói Premium mới thành công');
      fetchPackages();
    } catch (err: any) {
      error(err.message || 'Tạo gói thất bại');
      throw err;
    }
  };

  const handleUpdatePackage = async (id: string, data: UpdatePackageInput) => {
    if (externalUpdate) {
      await externalUpdate(id, data);
      return;
    }
    if (!accessToken) return;
    try {
      await adminApi.updatePackage(accessToken, id, data);
      success('Đã cập nhật thông tin gói thành công');
      fetchPackages();
    } catch (err: any) {
      error(err.message || 'Cập nhật gói thất bại');
      throw err;
    }
  };

  const handleToggleActive = async (id: string) => {
    if (externalToggle) {
      await externalToggle(id);
      return;
    }
    if (!accessToken) return;
    try {
      await adminApi.togglePackageActive(accessToken, id);
      success('Đã cập nhật trạng thái hiển thị gói');
      fetchPackages();
    } catch (err: any) {
      error(err.message || 'Thay đổi trạng thái thất bại');
    }
  };

  const handleDeletePackage = async (id: string) => {
    if (externalDelete) {
      await externalDelete(id);
      return;
    }
    if (!accessToken) return;
    try {
      await adminApi.deletePackage(accessToken, id);
      success('Đã xóa gói Premium');
      fetchPackages();
    } catch (err: any) {
      error(err.message || 'Xóa gói thất bại');
    }
  };

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    fetchPackages();
  };

  const [filterType, setFilterType] = useState<'ALL' | 'CANDIDATE_PREMIUM' | 'HR_PREMIUM'>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPkg, setEditingPkg] = useState<AdminPackageItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [featureInput, setFeatureInput] = useState('');

  // Form State
  const [formData, setFormData] = useState<CreatePackageInput>({
    code: '',
    planType: 'CANDIDATE_PREMIUM',
    billingCycle: 'monthly',
    name: '',
    description: '',
    price: 49000,
    originalPrice: 49000,
    durationDays: 30,
    aiQuota: 20,
    badge: '',
    features: [],
    hotJobLimit: 0,
    candidateSearchLimit: 0,
    isActive: true,
    displayOrder: 1,
  });

  const filteredPackages = packages.filter((pkg) => {
    if (filterType === 'ALL') return true;
    return pkg.planType === filterType;
  });

  const handleOpenCreateModal = () => {
    setEditingPkg(null);
    const targetPlan = filterType === 'HR_PREMIUM' ? 'HR_PREMIUM' : 'CANDIDATE_PREMIUM';
    const isTargetHR = targetPlan === 'HR_PREMIUM';

    setFormData({
      code: isTargetHR ? `HR_${Date.now().toString().slice(-4)}` : `CANDIDATE_${Date.now().toString().slice(-4)}`,
      planType: targetPlan,
      billingCycle: 'monthly',
      name: '',
      description: '',
      price: isTargetHR ? 199000 : 49000,
      originalPrice: isTargetHR ? 299000 : 79000,
      durationDays: 30,
      aiQuota: isTargetHR ? 100 : 30,
      badge: 'Phổ biến',
      features: isTargetHR
        ? [
            'Đăng tin tuyển dụng không giới hạn',
            'Gắn nhãn HOT JOB cho 3 vị trí',
            'Mở khóa tìm kiếm hồ sơ ứng viên nâng cao (50 CV/ngày)',
          ]
        : [
            'Không giới hạn tạo và tải CV chất lượng cao',
            'Đẩy Top hồ sơ 24h mỗi ngày',
            'Huy hiệu Candidate Premium VIP nổi bật',
          ],
      hotJobLimit: isTargetHR ? 3 : 0,
      candidateSearchLimit: isTargetHR ? 50 : 0,
      isActive: true,
      displayOrder: packages.length + 1,
    });
    setFeatureInput('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (pkg: AdminPackageItem) => {
    setEditingPkg(pkg);
    const isHR = pkg.planType === 'HR_PREMIUM';
    setFormData({
      code: pkg.code,
      planType: pkg.planType,
      billingCycle: pkg.billingCycle,
      name: pkg.name,
      description: pkg.description || '',
      price: Number(pkg.price) || 0,
      originalPrice:
        pkg.originalPrice !== null && pkg.originalPrice !== undefined
          ? Number(pkg.originalPrice)
          : undefined,
      durationDays: Number(pkg.durationDays) || 30,
      aiQuota: Number(pkg.aiQuota) || 0,
      badge: pkg.badge || '',
      features: pkg.features || [],
      hotJobLimit: isHR ? Number(pkg.hotJobLimit || 0) : 0,
      candidateSearchLimit: isHR ? Number(pkg.candidateSearchLimit || 0) : 0,
      isActive: Boolean(pkg.isActive),
      displayOrder: Number(pkg.displayOrder || 0),
    });
    setFeatureInput('');
    setIsModalOpen(true);
  };

  const handleAddFeature = (customFeature?: string) => {
    const textToAdd = (customFeature || featureInput).trim();
    if (!textToAdd) return;
    if ((formData.features || []).includes(textToAdd)) return;

    setFormData((prev: CreatePackageInput) => ({
      ...prev,
      features: [...(prev.features || []), textToAdd],
    }));
    if (!customFeature) {
      setFeatureInput('');
    }
  };

  const handleRemoveFeature = (idx: number) => {
    setFormData((prev: CreatePackageInput) => ({
      ...prev,
      features: (prev.features || []).filter((_: string, i: number) => i !== idx),
    }));
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      const isHR = formData.planType === 'HR_PREMIUM';

      const numericPrice = Number(formData.price) >= 0 ? Number(formData.price) : 0;
      const rawOrig = formData.originalPrice;
      const numericOriginalPrice =
        rawOrig !== undefined && rawOrig !== null && String(rawOrig).trim() !== ''
          ? Number(rawOrig)
          : undefined;

      if (editingPkg) {
        // Strip code, planType, billingCycle from update payload to adhere to strict validation
        const updateData: UpdatePackageInput = {
          name: formData.name.trim(),
          description: formData.description?.trim() || undefined,
          price: numericPrice,
          originalPrice: numericOriginalPrice,
          durationDays: Number(formData.durationDays) || 30,
          aiQuota: Number(formData.aiQuota || 0),
          badge: formData.badge?.trim() || undefined,
          features: formData.features || [],
          hotJobLimit: isHR ? Number(formData.hotJobLimit || 0) : 0,
          candidateSearchLimit: isHR ? Number(formData.candidateSearchLimit || 0) : 0,
          isActive: Boolean(formData.isActive),
          displayOrder: Number(formData.displayOrder || 1),
        };
        await handleUpdatePackage(editingPkg._id, updateData);
      } else {
        const createData: CreatePackageInput = {
          code: formData.code.trim().toUpperCase(),
          planType: formData.planType,
          billingCycle: formData.billingCycle,
          name: formData.name.trim(),
          description: formData.description?.trim() || undefined,
          price: numericPrice,
          originalPrice: numericOriginalPrice,
          durationDays: Number(formData.durationDays) || 30,
          aiQuota: Number(formData.aiQuota || 0),
          badge: formData.badge?.trim() || undefined,
          features: formData.features || [],
          hotJobLimit: isHR ? Number(formData.hotJobLimit || 0) : 0,
          candidateSearchLimit: isHR ? Number(formData.candidateSearchLimit || 0) : 0,
          isActive: Boolean(formData.isActive),
          displayOrder: Number(formData.displayOrder || 1),
        };
        await handleCreatePackage(createData);
      }
      setIsModalOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormHR = formData.planType === 'HR_PREMIUM';

  if (isLoading && packages.length === 0) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-20 rounded-2xl bg-slate-100 dark:bg-slate-800/60" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-80 rounded-3xl bg-slate-100 dark:bg-slate-800/60" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Dynamic Pricing Alert Notification */}
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50/80 via-white to-purple-50/80 p-5 dark:border-indigo-900/60 dark:bg-slate-900 shadow-xs">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-600/20">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              Quản lý gói dịch vụ Premium &amp; Phân quyền động (Database Source of Truth)
            </h4>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Mọi chỉnh sửa về <strong>Giá bán (VND)</strong>, <strong>Thời hạn sử dụng</strong>,{' '}
              <strong>Giới hạn tin HOT</strong>, <strong>Lượt tìm kiếm CV</strong> và{' '}
              <strong>AI Quota</strong> tại đây sẽ tự động đồng bộ thời gian thực tới trang quản lý chiến dịch của nhà tuyển dụng và cổng thanh toán <strong>PayOS</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="inline-flex rounded-2xl bg-slate-100 p-1.5 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700">
          <button
            type="button"
            onClick={() => setFilterType('ALL')}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
              filterType === 'ALL'
                ? 'bg-white text-primary shadow-xs dark:bg-slate-900 dark:text-primary-light'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            Tất cả ({packages.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('CANDIDATE_PREMIUM')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
              filterType === 'CANDIDATE_PREMIUM'
                ? 'bg-white text-blue-600 shadow-xs dark:bg-slate-900 dark:text-blue-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <User className="h-3.5 w-3.5" />
            <span>Gói Ứng Viên ({packages.filter((p) => p.planType === 'CANDIDATE_PREMIUM').length})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterType('HR_PREMIUM')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
              filterType === 'HR_PREMIUM'
                ? 'bg-white text-purple-600 shadow-xs dark:bg-slate-900 dark:text-purple-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Building2 className="h-3.5 w-3.5" />
            <span>Gói Nhà Tuyển Dụng ({packages.filter((p) => p.planType === 'HR_PREMIUM').length})</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
            <span>Làm mới</span>
          </button>

          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-primary/20 hover:bg-primary-dark transition cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Thêm Gói Mới
          </button>
        </div>
      </div>

      {/* 1. Grid of Package Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredPackages.map((pkg) => {
          const isHR = pkg.planType === 'HR_PREMIUM';
          const cycleLabel =
            pkg.billingCycle === 'monthly'
              ? '1 Tháng'
              : pkg.billingCycle === 'semi_annual'
              ? '6 Tháng'
              : '1 Năm';

          return (
            <div
              key={pkg._id}
              className={`relative flex flex-col justify-between rounded-3xl border p-6 transition-all duration-200 ${
                pkg.isActive
                  ? 'border-slate-200/90 bg-white shadow-xs hover:border-primary/50 dark:border-slate-800 dark:bg-slate-900'
                  : 'border-slate-200 bg-slate-50/70 opacity-65 dark:border-slate-800 dark:bg-slate-900/40'
              }`}
            >
              <div>
                {/* Header with Type & Status */}
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${
                      isHR
                        ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300'
                        : 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                    }`}
                  >
                    {isHR ? <Building2 className="h-3 w-3" /> : <User className="h-3 w-3" />}
                    {isHR ? 'GÓI NHÀ TUYỂN DỤNG' : 'GÓI ỨNG VIÊN'}
                  </span>

                  {pkg.badge && (
                    <span className="rounded-full bg-amber-400 text-slate-950 px-2 py-0.5 text-[10px] font-black">
                      {pkg.badge}
                    </span>
                  )}
                </div>

                <div className="mt-3">
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">
                    {pkg.name}
                  </h3>
                  <p className="text-[11px] font-medium text-slate-400">
                    Mã: <code className="text-slate-600 dark:text-slate-300 font-bold">{pkg.code}</code> &bull; Chu kỳ: <strong>{cycleLabel}</strong> ({pkg.durationDays} ngày)
                  </p>
                </div>

                {/* Price Display */}
                <div className="my-4 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-black text-primary dark:text-primary-light">
                      {pkg.price.toLocaleString('vi-VN')} đ
                    </span>
                    <span className="text-xs text-slate-400">/ {cycleLabel}</span>
                  </div>
                  {pkg.originalPrice && pkg.originalPrice > pkg.price && (
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs text-slate-400 line-through">
                        {pkg.originalPrice.toLocaleString('vi-VN')} đ
                      </span>
                      <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-black text-emerald-600 dark:text-emerald-400">
                        -{Math.round((1 - pkg.price / pkg.originalPrice) * 100)}%
                      </span>
                    </div>
                  )}
                </div>

                {/* Key Quota Pills */}
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 rounded-xl bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300 border border-violet-200 dark:border-violet-800/50">
                    <Bot className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                    <span>
                      AI Quota: <strong>{pkg.aiQuota} lượt</strong> {isHR ? 'sourcing & matching' : 'tư vấn & chấm điểm CV'}
                    </span>
                  </div>

                  {isHR ? (
                    <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1">
                        <Flame className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        <span>{pkg.hotJobLimit} tin HOT</span>
                      </div>
                      <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1">
                        <Search className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                        <span>{pkg.candidateSearchLimit >= 999999 ? 'Không giới hạn' : `${pkg.candidateSearchLimit} CV/ngày`}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      <div className="flex items-center gap-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 px-2.5 py-1">
                        <Sparkles className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                        <span>Đẩy TOP hồ sơ</span>
                      </div>
                      <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-2.5 py-1">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        <span>Không giới hạn CV</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Features list */}
                {pkg.features && pkg.features.length > 0 && (
                  <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800 pt-3">
                    {pkg.features.slice(0, 4).map((f, idx) => (
                      <li key={idx} className="flex items-center gap-2">
                        <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        <span className="truncate">{f}</span>
                      </li>
                    ))}
                    {pkg.features.length > 4 && (
                      <li className="text-[11px] text-slate-400 italic">
                        +{pkg.features.length - 4} đặc quyền khác...
                      </li>
                    )}
                  </ul>
                )}
              </div>

              {/* Actions Footer */}
              <div className="mt-6 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-4">
                <button
                  type="button"
                  onClick={() => handleToggleActive(pkg._id)}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                    pkg.isActive
                      ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : 'bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300'
                  }`}
                >
                  {pkg.isActive ? (
                    <>
                      <CheckCircle2 className="h-3 w-3" />
                      Đang kích hoạt
                    </>
                  ) : (
                    <>
                      <XCircle className="h-3 w-3" />
                      Đang ẩn
                    </>
                  )}
                </button>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(pkg)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition cursor-pointer"
                    title="Chỉnh sửa gói"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Bạn có chắc muốn xóa gói "${pkg.name}"?`)) {
                        handleDeletePackage(pkg._id);
                      }
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900/50 dark:text-rose-400 dark:hover:bg-rose-950/40 transition cursor-pointer"
                    title="Xóa gói"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 2. Modal for Create / Edit Package */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-2xl rounded-3xl bg-white p-6 sm:p-8 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
                    isFormHR
                      ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300'
                      : 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                  }`}
                >
                  {isFormHR ? <Building2 className="h-5 w-5" /> : <User className="h-5 w-5" />}
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">
                    {editingPkg
                      ? `Cập Nhật Gói ${isFormHR ? 'Nhà Tuyển Dụng' : 'Ứng Viên'}`
                      : `Tạo Gói Mới (${isFormHR ? 'Nhà Tuyển Dụng' : 'Ứng Viên'})`}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Cấu hình giá tiền, hạn sử dụng, đặc quyền và hạn mức theo cơ sở dữ liệu
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="mt-6 space-y-4 text-xs">
              {/* Section 1: Target Audience Selection */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Đối Tượng Áp Dụng *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={Boolean(editingPkg)}
                    onClick={() =>
                      setFormData({
                        ...formData,
                        planType: 'CANDIDATE_PREMIUM',
                        hotJobLimit: 0,
                        candidateSearchLimit: 0,
                      })
                    }
                    className={`p-3 rounded-2xl border text-left transition flex items-center gap-3 cursor-pointer ${
                      formData.planType === 'CANDIDATE_PREMIUM'
                        ? 'border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300 font-bold ring-1 ring-blue-500'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    } disabled:opacity-75 disabled:cursor-not-allowed`}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300">
                      <User className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-bold text-xs">Ứng Viên (Candidate)</p>
                      <p className="text-[10px] text-slate-400 font-normal">Tạo CV Pro, đẩy Top hồ sơ, AI chấm điểm</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    disabled={Boolean(editingPkg)}
                    onClick={() =>
                      setFormData({
                        ...formData,
                        planType: 'HR_PREMIUM',
                        hotJobLimit: formData.hotJobLimit && formData.hotJobLimit > 0 ? formData.hotJobLimit : 5,
                        candidateSearchLimit:
                          formData.candidateSearchLimit && formData.candidateSearchLimit > 0
                            ? formData.candidateSearchLimit
                            : 100,
                      })
                    }
                    className={`p-3 rounded-2xl border text-left transition flex items-center gap-3 cursor-pointer ${
                      formData.planType === 'HR_PREMIUM'
                        ? 'border-purple-500 bg-purple-500/10 text-purple-700 dark:text-purple-300 font-bold ring-1 ring-purple-500'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    } disabled:opacity-75 disabled:cursor-not-allowed`}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-950/60 dark:text-purple-300">
                      <Building2 className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-bold text-xs">Doanh Nghiệp (HR)</p>
                      <p className="text-[10px] text-slate-400 font-normal">Đăng tin không giới hạn, đẩy HOT, search CV</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Row 1: Code & Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Mã Định Danh (Code) *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(editingPkg)}
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    placeholder={isFormHR ? 'VD: HR_ANNUAL_VIP' : 'VD: CANDIDATE_PRO_YEAR'}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-xs dark:border-slate-800 dark:bg-slate-800/80 dark:text-white disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tên Hiển Thị (Name) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder={isFormHR ? 'VD: HR Premium Enterprise' : 'VD: Candidate Premium'}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              {/* Row 2: Billing Cycle & Duration */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Chu Kỳ Thanh Toán *
                  </label>
                  <select
                    disabled={Boolean(editingPkg)}
                    value={formData.billingCycle}
                    onChange={(e) => {
                      const cycle = e.target.value as 'monthly' | 'semi_annual' | 'annual';
                      const defaultDays = cycle === 'monthly' ? 30 : cycle === 'semi_annual' ? 180 : 365;
                      setFormData({
                        ...formData,
                        billingCycle: cycle,
                        durationDays: defaultDays,
                      });
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-800 dark:text-white disabled:opacity-60"
                  >
                    <option value="monthly">1 Tháng (monthly)</option>
                    <option value="semi_annual">6 Tháng (semi_annual)</option>
                    <option value="annual">1 Năm (annual)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Thời Hạn Sử Dụng (Ngày) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formData.durationDays ?? ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        durationDays: e.target.value === '' ? ('' as any) : Number(e.target.value),
                      })
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              {/* Row 3: Price & Original Price */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Giá Bán (VND) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formData.price ?? ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        price: e.target.value === '' ? ('' as any) : Number(e.target.value),
                      })
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-primary dark:border-slate-800 dark:bg-slate-800 dark:text-primary-light"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Giá Gốc (VND)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.originalPrice ?? ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        originalPrice:
                          e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              {/* Row 4: Dynamic Quota by Audience */}
              {isFormHR ? (
                <div className="space-y-3 p-4 rounded-2xl bg-purple-50/60 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/40">
                  <div className="flex items-center gap-2 text-xs font-bold text-purple-900 dark:text-purple-300">
                    <Building2 className="h-4 w-4 text-purple-600" />
                    <span>Hạn mức đặc quyền Nhà Tuyển Dụng (HR)</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                        AI Quota (Lượt truy vấn AI) *
                      </label>
                      <input
                        type="number"
                        min="0"
                        required
                        value={formData.aiQuota ?? ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            aiQuota: e.target.value === '' ? ('' as any) : Number(e.target.value),
                          })
                        }
                        placeholder="VD: 500"
                        className="w-full rounded-xl border border-purple-200 bg-white px-3 py-2 text-xs font-bold text-purple-700 dark:border-purple-800 dark:bg-slate-800 dark:text-purple-300"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Giới Hạn Tin Hot (Đồng thời) *
                      </label>
                      <input
                        type="number"
                        min="0"
                        required
                        value={formData.hotJobLimit ?? ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            hotJobLimit: e.target.value === '' ? ('' as any) : Number(e.target.value),
                          })
                        }
                        placeholder="VD: 3, 5, 10"
                        className="w-full rounded-xl border border-purple-200 bg-white px-3 py-2 text-xs font-bold text-purple-700 dark:border-purple-800 dark:bg-slate-800 dark:text-purple-300"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Lượt Tìm CV Ứng Viên / Ngày *
                      </label>
                      <input
                        type="number"
                        min="0"
                        required
                        value={formData.candidateSearchLimit ?? ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            candidateSearchLimit:
                              e.target.value === '' ? ('' as any) : Number(e.target.value),
                          })
                        }
                        placeholder="VD: 50, 100, 999999"
                        className="w-full rounded-xl border border-purple-200 bg-white px-3 py-2 text-xs font-bold text-purple-700 dark:border-purple-800 dark:bg-slate-800 dark:text-purple-300"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-purple-700/80 dark:text-purple-300/80">
                    💡 Nhập <strong>999999</strong> ở lượt tìm CV nếu muốn không giới hạn. Giới hạn tin HOT là số lượng tin được đẩy lên đầu trang đồng thời trong 24h.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40">
                  <div className="flex items-center gap-2 text-xs font-bold text-blue-900 dark:text-blue-300">
                    <User className="h-4 w-4 text-blue-600" />
                    <span>Hạn mức đặc quyền Ứng Viên (Candidate)</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                        AI Quota (Lượt tư vấn &amp; chấm điểm CV) *
                      </label>
                      <input
                        type="number"
                        min="0"
                        required
                        value={formData.aiQuota ?? ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            aiQuota: e.target.value === '' ? ('' as any) : Number(e.target.value),
                          })
                        }
                        placeholder="VD: 50"
                        className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700 dark:border-blue-800 dark:bg-slate-800 dark:text-blue-300"
                      />
                    </div>
                    <div className="flex items-center pt-5 text-xs text-blue-700 dark:text-blue-300">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mr-1.5" />
                      <span>Không giới hạn số lượng CV được tạo &amp; tải</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-blue-700/80 dark:text-blue-300/80">
                    💡 Gói Ứng viên tập trung vào tối ưu CV, đẩy Top hồ sơ và phân tích nghề nghiệp bằng AI. Các thông số đẩy HOT tin tuyển dụng và tìm kiếm ứng viên của HR tự động vô hiệu hóa (0).
                  </p>
                </div>
              )}

              {/* Row 5: Badge & Display Order */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nhãn Nổi Bật (Badge)
                  </label>
                  <input
                    type="text"
                    value={formData.badge ?? ''}
                    onChange={(e) => setFormData({ ...formData, badge: e.target.value })}
                    placeholder="VD: Phổ Biến Nhất, Tiết Kiệm 33%"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Thứ Tự Sắp Xếp
                  </label>
                  <input
                    type="number"
                    value={formData.displayOrder ?? 1}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        displayOrder: e.target.value === '' ? ('' as any) : Number(e.target.value),
                      })
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              {/* Features Tag Input & Presets */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Danh Sách Đặc Quyền &amp; Tính Năng (Features)
                </label>

                {/* Preset Chips */}
                <div className="mb-2">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    Gợi ý đặc quyền phù hợp cho {isFormHR ? 'Nhà Tuyển Dụng' : 'Ứng Viên'} (nhấp để thêm):
                  </span>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {(isFormHR ? HR_FEATURE_PRESETS : CANDIDATE_FEATURE_PRESETS).map((preset, idx) => {
                      const isAdded = (formData.features || []).includes(preset);
                      return (
                        <button
                          key={idx}
                          type="button"
                          disabled={isAdded}
                          onClick={() => handleAddFeature(preset)}
                          className={`rounded-lg px-2 py-1 text-[11px] font-medium transition cursor-pointer ${
                            isAdded
                              ? 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 cursor-not-allowed'
                              : isFormHR
                              ? 'bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-950/40 dark:text-purple-300'
                              : 'bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300'
                          }`}
                        >
                          + {preset}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={featureInput}
                    onChange={(e) => setFeatureInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddFeature();
                      }
                    }}
                    placeholder="Nhập đặc quyền tùy chỉnh rồi bấm Thêm..."
                    className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddFeature()}
                    className="rounded-xl bg-slate-800 px-4 py-2 font-bold text-white hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 cursor-pointer"
                  >
                    Thêm
                  </button>
                </div>

                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {(formData.features || []).map((feat: string, idx: number) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-800 dark:bg-slate-800 dark:text-slate-200 border border-slate-200/60 dark:border-slate-700"
                    >
                      <span>{feat}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveFeature(idx)}
                        className="text-slate-400 hover:text-rose-500 ml-1 cursor-pointer"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Active Toggle */}
              <div className="pt-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary dark:border-slate-700 dark:bg-slate-900"
                  />
                  <span className="font-bold text-slate-700 dark:text-slate-300">
                    Kích hoạt hiển thị gói cho người dùng chọn và thanh toán
                  </span>
                </label>
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl px-4 py-2.5 font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-xl bg-primary px-5 py-2.5 font-bold text-white shadow-md shadow-primary/25 hover:bg-primary-dark cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Đang lưu...' : editingPkg ? 'Lưu Thay Đổi' : 'Tạo Gói Ngay'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
