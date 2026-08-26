import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Building2,
  Users,
  Upload,
  Search,
  UserCheck,
  UserX,
  LogOut,
  Save,
  ShieldCheck,
  Clock,
  Loader2,
  Trash2,
  Crown,
  UserRound,
  Info,
  PlusCircle,
} from 'lucide-react';

import {
  employerApi,
  type CompanyInfo,
  type HrMember,
  type PendingHrRequest,
} from '../../../lib/employerApi';
import { useToast } from '../../../context/ToastContext';
import { formatDate } from '../../../lib/dateUtils';
import { useAuth } from '../../../auth/AuthContext';
import { RichTextEditor } from '../../../components/common/RichTextEditor';

interface CompanyProfileTabProps {
  company: CompanyInfo | null;
  hasCompany: boolean;
  accessToken: string | null;
  onRefreshData: () => Promise<void>;
}

export function CompanyProfileTab({
  company,
  hasCompany,
  accessToken,
  onRefreshData,
}: CompanyProfileTabProps) {
  const { t } = useTranslation();
  const { success, error, info } = useToast();
  const { user } = useAuth();

  // Navigation Sub-tab
  const [subTab, setSubTab] = useState<'profile' | 'team' | 'join' | 'create'>('profile');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: company?.name || '',
    taxCode: company?.taxCode || '',
    scale: company?.scale || '50-200',
    address: company?.address || '',
    description: company?.description || '',
    logo: company?.logo || '',
  });

  // HR Team State
  const [teamMembers, setTeamMembers] = useState<HrMember[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingHrRequest[]>([]);
  const [isCreator, setIsCreator] = useState(false);
  const [isLoadingTeam, setIsLoadingTeam] = useState(false);

  // Debounce Company Search & Join State
  const [searchQuery, setSearchQuery] = useState('');
  const [companyResults, setCompanyResults] = useState<CompanyInfo[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [joiningCompanyId, setJoiningCompanyId] = useState<string | null>(null);
  const [requestedCompanyIds, setRequestedCompanyIds] = useState<string[]>([]);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (hasCompany && company) {
      setSubTab('profile');
      setFormData({
        name: company.name || '',
        taxCode: company.taxCode || '',
        scale: company.scale || '50-200',
        address: company.address || '',
        description: company.description || '',
        logo: company.logo || '',
      });
      if (accessToken && company._id) {
        void fetchTeamData(company._id);
      }
    } else {
      setSubTab('join');
    }
  }, [hasCompany, company, accessToken]);

  const fetchTeamData = async (companyId: string) => {
    if (!accessToken) return;
    setIsLoadingTeam(true);
    try {
      const [members, creatorStatus, pending] = await Promise.all([
        employerApi.getCompanyHrs(companyId, accessToken).catch(() => []),
        employerApi.isCompanyCreator(companyId, accessToken).catch(() => false),
        employerApi.getPendingHrs(companyId, accessToken).catch(() => []),
      ]);
      setTeamMembers(members);
      setIsCreator(creatorStatus);
      setPendingRequests(pending);
    } catch (err) {
      console.error('Failed to load HR team data', err);
    } finally {
      setIsLoadingTeam(false);
    }
  };

  // Debounce Search Handler for Companies
  const executeSearch = useCallback(
    async (query: string) => {
      if (!query.trim() || !accessToken) {
        setCompanyResults([]);
        setIsSearching(false);
        return;
      }
      setIsSearching(true);
      try {
        const res = await employerApi.getAllCompanies(
          `name=${encodeURIComponent(query.trim())}&pageSize=8`,
          accessToken,
        );
        setCompanyResults(res.result || []);
      } catch (err) {
        console.error('Search failed', err);
      } finally {
        setIsSearching(false);
      }
    },
    [accessToken],
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!val.trim()) {
      setCompanyResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(() => {
      void executeSearch(val);
    }, 300);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !accessToken) return;

    if (file.size > 5 * 1024 * 1024) {
      error('Kích thước ảnh vượt quá 5MB');
      return;
    }

    setIsUploadingLogo(true);
    try {
      const res = await employerApi.uploadImage(file, accessToken);
      const logoUrl = res.url || res.fileName;
      setFormData((prev) => ({ ...prev, logo: logoUrl }));
      success(t('employer.companyTab.uploadLogoBtn', 'Tải logo lên thành công'));
    } catch (err: any) {
      console.error('Failed to upload logo', err);
      error(err?.message || 'Tải logo thất bại');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;

    if (!formData.name.trim()) {
      info(t('employer.companyTab.nameLabel', 'Vui lòng nhập tên công ty'));
      return;
    }

    if (!formData.description.trim() || formData.description === '<p></p>') {
      info(t('employer.companyTab.descLabel', 'Vui lòng nhập mô tả & giới thiệu doanh nghiệp'));
      return;
    }

    setIsSaving(true);
    try {
      if (hasCompany && company?._id) {
        await employerApi.updateCompany(
          company._id,
          {
            name: formData.name,
            taxCode: formData.taxCode,
            scale: formData.scale,
            address: formData.address,
            description: formData.description,
            logo: formData.logo,
          },
          accessToken,
        );
        success(t('employer.companyTab.saveCompanyBtn', 'Cập nhật thông tin công ty thành công!'));
      } else {
        await employerApi.createCompanyByHr(
          {
            name: formData.name,
            taxCode: formData.taxCode,
            scale: formData.scale,
            address: formData.address,
            description: formData.description,
            logo: formData.logo,
          },
          accessToken,
        );
        success('Khởi tạo công ty thành công! Bạn hiện là HR Trưởng của công ty.');
      }
      await onRefreshData();
    } catch (err: any) {
      console.error('Failed to save company', err);
      error(err?.response?.data?.message || err?.message || 'Không thể lưu thông tin công ty');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRequestJoin = async (targetCompanyId: string) => {
    if (!accessToken) return;
    setJoiningCompanyId(targetCompanyId);
    try {
      const res = await employerApi.requestJoinCompany(targetCompanyId, accessToken);
      success(res.message || 'Đã gửi yêu cầu tham gia công ty!');
      setRequestedCompanyIds((prev) => [...prev, targetCompanyId]);
      await onRefreshData();
    } catch (err: any) {
      error(err.message || 'Gửi yêu cầu tham gia thất bại');
    } finally {
      setJoiningCompanyId(null);
    }
  };

  const handleApproveHr = async (userId: string) => {
    if (!accessToken || !company?._id) return;
    try {
      const res = await employerApi.approveHr(company._id, userId, accessToken);
      success(res.message || 'Đã duyệt nhân sự vào công ty!');
      void fetchTeamData(company._id);
      await onRefreshData();
    } catch (err: any) {
      error(err.message || 'Duyệt nhân sự thất bại');
    }
  };

  const handleRejectHr = async (userId: string) => {
    if (!accessToken || !company?._id) return;
    try {
      const res = await employerApi.rejectHr(company._id, userId, accessToken);
      info(res.message || 'Đã từ chối yêu cầu tham gia');
      void fetchTeamData(company._id);
    } catch (err: any) {
      error(err.message || 'Từ chối thất bại');
    }
  };

  const handleRemoveHr = async (hrId: string, hrName: string) => {
    if (!accessToken || !company?._id) return;
    if (!window.confirm(`Bạn có chắc chắn muốn xóa HR "${hrName}" khỏi công ty?`)) return;

    try {
      const res = await employerApi.removeHrFromCompany(company._id, hrId, accessToken);
      success(res.message || 'Đã xóa HR khỏi công ty');
      void fetchTeamData(company._id);
    } catch (err: any) {
      error(err.message || 'Xóa HR thất bại');
    }
  };

  const handleLeaveCompany = async () => {
    if (!accessToken) return;
    if (!window.confirm('Bạn có chắc chắn muốn rời khỏi công ty hiện tại? Bạn sẽ mất quyền quản lý tin tuyển dụng của công ty này.')) return;

    try {
      const res = await employerApi.leaveCompany(accessToken);
      info(res.message || 'Đã rời khỏi công ty thành công');
      await onRefreshData();
    } catch (err: any) {
      error(err.message || 'Rời công ty thất bại');
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header & Navigation Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {t('employer.companyTab.title', 'Quản lý Doanh nghiệp & Đội ngũ HR')}
            </h2>
            {hasCompany && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-black ${
                  isCreator
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300/60'
                    : 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-300/60'
                }`}
              >
                {isCreator ? <Crown className="h-3 w-3" /> : <UserRound className="h-3 w-3" />}
                <span>{isCreator ? '👑 HR Trưởng' : '👤 HR Thành viên'}</span>
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t('employer.companyTab.subtitle', 'Quản lý thông tin công ty, phân quyền HR và duyệt đơn xin gia nhập')}
          </p>
        </div>

        {/* Sub-tabs pills */}
        <div className="flex items-center gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800/80">
          {hasCompany ? (
            <>
              <button
                type="button"
                onClick={() => setSubTab('profile')}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-bold transition cursor-pointer ${
                  subTab === 'profile'
                    ? 'bg-white text-primary shadow-sm dark:bg-slate-900 dark:text-primary-light'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                <Building2 className="h-4 w-4" />
                <span>{t('employer.companyTab.tabProfile', 'Hồ sơ công ty')}</span>
              </button>

              <button
                type="button"
                onClick={() => setSubTab('team')}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-bold transition cursor-pointer ${
                  subTab === 'team'
                    ? 'bg-white text-primary shadow-sm dark:bg-slate-900 dark:text-primary-light'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                <Users className="h-4 w-4" />
                <span>
                  {t('employer.companyTab.tabTeam', 'Đội ngũ HR')} ({teamMembers.length})
                </span>
                {pendingRequests.length > 0 && isCreator && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-black text-white animate-pulse">
                    {pendingRequests.length}
                  </span>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setSubTab('join')}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-bold transition cursor-pointer ${
                  subTab === 'join'
                    ? 'bg-white text-primary shadow-sm dark:bg-slate-900 dark:text-primary-light'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                <Search className="h-4 w-4" />
                <span>{t('employer.companyTab.tabJoin', 'Gia nhập công ty')}</span>
              </button>

              <button
                type="button"
                onClick={() => setSubTab('create')}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-bold transition cursor-pointer ${
                  subTab === 'create'
                    ? 'bg-white text-primary shadow-sm dark:bg-slate-900 dark:text-primary-light'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                <PlusCircle className="h-4 w-4" />
                <span>Tạo công ty mới</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. KHỞI TẠO HOẶC GIA NHẬP CÔNG TY (KHI CHƯA CÓ CÔNG TY)                   */}
      {/* ========================================================================= */}

      {!hasCompany && subTab === 'join' && (
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-6">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary mb-2">
                <Search className="h-3.5 w-3.5" />
                <span>Tìm kiếm & Gia nhập Đội ngũ HR</span>
              </div>
              <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                Gia nhập Doanh nghiệp có sẵn trên TalentPulse
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                Tìm kiếm tên công ty của bạn. Sau khi gửi yêu cầu, <strong>HR Trưởng</strong> của công ty sẽ xét duyệt để bạn trở thành HR Thành viên.
              </p>
            </div>

            {/* Debounce Search Box */}
            <div className="relative mb-4">
              <div className="relative">
                <Search className="absolute left-4 top-3.5 h-4.5 w-4.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  placeholder="Gõ tên doanh nghiệp để tìm kiếm ngay (VD: TalentPulse, Vingroup, FPT...)"
                  className="w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-11 py-3 text-sm font-medium text-slate-900 shadow-xs focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                {isSearching && (
                  <div className="absolute right-4 top-3.5">
                    <Loader2 className="h-4.5 w-4.5 animate-spin text-primary" />
                  </div>
                )}
              </div>

              {/* Real-time Debounce Search Dropdown Menu */}
              {searchQuery.trim().length > 0 && (
                <div className="mt-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-800 dark:bg-slate-900 max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
                  {isSearching ? (
                    <div className="py-8 text-center text-xs font-bold text-slate-400 flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span>Đang tìm kiếm doanh nghiệp...</span>
                    </div>
                  ) : companyResults.length > 0 ? (
                    companyResults.map((c) => {
                      const isPending =
                        requestedCompanyIds.includes(c._id) ||
                        Boolean((c as any).pendingHrs?.some((p: any) => p.userId === user?._id));

                      return (
                        <div
                          key={c._id}
                          className="flex items-center justify-between gap-4 p-3.5 rounded-xl hover:bg-slate-50 transition dark:hover:bg-slate-800/60"
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div className="h-12 w-12 rounded-xl border border-slate-200 bg-white flex items-center justify-center shrink-0 p-1.5 shadow-xs dark:border-slate-700 dark:bg-slate-800 overflow-hidden">
                              {c.logo ? (
                                <img src={c.logo} alt={c.name} className="h-full w-full object-contain" />
                              ) : (
                                <Building2 className="h-6 w-6 text-slate-400" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="truncate text-sm font-bold text-slate-900 dark:text-white">
                                  {c.name}
                                </h4>
                                {c.isActive && (
                                  <span className="rounded-md bg-emerald-100 px-1.5 py-0.2 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                    Active
                                  </span>
                                )}
                              </div>
                              <p className="truncate text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                {c.address || 'Chưa cập nhật địa chỉ'} &bull; {c.scale || 'Doanh nghiệp'}
                              </p>
                            </div>
                          </div>

                          <div className="shrink-0">
                            {isPending ? (
                              <span className="inline-flex items-center gap-1 rounded-xl bg-amber-100 px-3.5 py-2 text-xs font-bold text-amber-800 dark:bg-amber-950/80 dark:text-amber-300">
                                <Clock className="h-3.5 w-3.5" />
                                <span>Đang chờ duyệt</span>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleRequestJoin(c._id)}
                                disabled={joiningCompanyId === c._id}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition active:scale-95 disabled:opacity-50 cursor-pointer"
                              >
                                {joiningCompanyId === c._id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <UserCheck className="h-3.5 w-3.5" />
                                )}
                                <span>Xin gia nhập</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-8 text-center text-xs text-slate-400">
                      Không tìm thấy công ty nào có tên "{searchQuery}". Bạn có thể chuyển sang tab <strong>Tạo công ty mới</strong> để tự thiết lập.
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-blue-50/80 p-4 border border-blue-100 text-xs text-blue-800 dark:bg-blue-950/30 dark:border-blue-900/40 dark:text-blue-300 flex items-start gap-3">
              <Info className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
              <div>
                <strong>Lưu ý về quyền hạn:</strong> Khi gia nhập công ty có sẵn, bạn sẽ là <strong>HR Thành viên</strong> (có quyền đăng tin, quản lý CV và được phép rời công ty khi cần).
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. TẠO CÔNG TY MỚI HOẶC CHỈNH SỬA HỒ SƠ                                  */}
      {/* ========================================================================= */}

      {(subTab === 'profile' || subTab === 'create') && (
        <form onSubmit={handleSaveCompany} className="space-y-6">
          <div className="rounded-3xl border border-slate-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {/* Form Header */}
            <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light">
                  <Building2 className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                    {hasCompany ? 'Hồ sơ Doanh nghiệp' : 'Khởi tạo Công ty mới (Vai trò HR Trưởng)'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {hasCompany
                      ? 'Thông tin công ty đang hoạt động trên TalentPulse'
                      : 'Thiết lập thông tin doanh nghiệp. Công ty sẽ được kích hoạt hoạt động ngay lập tức.'}
                  </p>
                </div>
              </div>

              {hasCompany && (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>Hoạt động</span>
                  </span>
                </div>
              )}
            </div>

            {/* Notice about HR Trưởng Role */}
            {!hasCompany && (
              <div className="mb-6 rounded-2xl bg-amber-50/90 border border-amber-200/80 p-4 text-xs text-amber-900 dark:bg-amber-950/40 dark:border-amber-900/60 dark:text-amber-300 flex items-start gap-3">
                <Crown className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <strong>Quyền HR Trưởng:</strong> Khi bạn tạo công ty mới, hệ thống sẽ chỉ định bạn là <strong>HR Trưởng (Lead HR)</strong>. Bạn sẽ có quyền duyệt các HR khác xin vào công ty và xóa HR thành viên. HR Trưởng <strong>không được quyền rời công ty</strong> để đảm bảo tính sở hữu doanh nghiệp.
                </div>
              </div>
            )}

            {/* Logo Upload & Brand Identity */}
            <div className="mb-8 flex flex-col sm:flex-row items-start sm:items-center gap-6 rounded-2xl bg-slate-50/80 p-5 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
              <div className="relative flex h-24 w-24 sm:h-28 sm:w-28 shrink-0 items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white shadow-xs dark:border-slate-700 dark:bg-slate-900 overflow-hidden">
                {formData.logo ? (
                  <img src={formData.logo} alt="Company Logo" className="h-full w-full object-contain p-2" />
                ) : (
                  <Building2 className="h-10 w-10 text-slate-400" />
                )}
                {isUploadingLogo && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs">
                    <Loader2 className="h-6 w-6 animate-spin text-white" />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('employer.companyTab.logoLabel', 'Logo Doanh nghiệp')} <span className="text-rose-500">*</span>
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md">
                  Định dạng PNG, JPG hoặc WEBP. Tối đa 5MB. Logo rõ nét giúp tăng độ tin cậy và thu hút ứng viên chất lượng cao.
                </p>
                <div className="flex items-center gap-3 pt-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingLogo}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-primary-dark transition cursor-pointer"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>{isUploadingLogo ? 'Đang tải lên...' : 'Chọn ảnh Logo'}</span>
                  </button>
                  {formData.logo && (
                    <button
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, logo: '' }))}
                      className="text-xs font-semibold text-rose-500 hover:underline cursor-pointer"
                    >
                      Xóa ảnh
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Form Fields Grid */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {/* Company Name */}
              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {t('employer.companyTab.nameLabel', 'Tên Doanh nghiệp / Công ty')} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ví dụ: TalentPulse Technology Group"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              {/* Tax Code */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {t('employer.companyTab.taxCodeLabel', 'Mã số thuế')} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.taxCode}
                  onChange={(e) => setFormData({ ...formData, taxCode: e.target.value })}
                  placeholder="Ví dụ: 0108923456"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              {/* Scale / Size */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {t('employer.companyTab.scaleLabel', 'Quy mô nhân sự')} <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formData.scale}
                  onChange={(e) => setFormData({ ...formData, scale: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="1-50 nhân sự">1 - 50 nhân sự</option>
                  <option value="50-200 nhân sự">50 - 200 nhân sự</option>
                  <option value="200-500 nhân sự">200 - 500 nhân sự</option>
                  <option value="500-1000 nhân sự">500 - 1000 nhân sự</option>
                  <option value="1000+ nhân sự">1000+ nhân sự</option>
                </select>
              </div>

              {/* Address */}
              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {t('employer.companyTab.addressLabel', 'Địa chỉ trụ sở')} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Ví dụ: Tầng 12, Keangnam Landmark 72, Cầu Giấy, Hà Nội"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              {/* Description */}
              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {t('employer.companyTab.descLabel', 'Mô tả & Giới thiệu Doanh nghiệp')} <span className="text-rose-500">*</span>
                </label>
                <RichTextEditor
                  value={formData.description}
                  onChange={(html) => setFormData({ ...formData, description: html })}
                  placeholder="Mô tả chi tiết về sản phẩm, lĩnh vực hoạt động, văn hóa công ty và chế độ đãi ngộ..."
                  minHeight="220px"
                />
              </div>
            </div>

            {/* Save CTA */}
            <div className="mt-8 flex items-center justify-end gap-3 border-t border-slate-100 pt-5 dark:border-slate-800">
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-white shadow-lg shadow-primary/20 hover:bg-primary-dark transition active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Đang lưu thông tin...</span>
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    <span>{hasCompany ? 'Lưu thay đổi hồ sơ' : 'Khởi tạo Doanh nghiệp & Kích hoạt'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ========================================================================= */}
      {/* 4. QUẢN LÝ ĐỘI NGŨ HR (KHI ĐÃ CÓ CÔNG TY)                                 */}
      {/* ========================================================================= */}

      {hasCompany && subTab === 'team' && (
        <div className="space-y-6">
          {/* A. Pending Requests Section for Lead HR */}
          {isCreator && pendingRequests.length > 0 && (
            <div className="rounded-3xl border border-amber-200 bg-amber-50/60 p-6 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/20">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-amber-900 dark:text-amber-300 font-black text-base">
                  <Clock className="h-5 w-5 text-amber-600" />
                  <span>Đơn xin gia nhập công ty chờ bạn duyệt ({pendingRequests.length})</span>
                </div>
                <span className="rounded-full bg-amber-200/80 px-2.5 py-0.5 text-xs font-bold text-amber-900 dark:bg-amber-900 dark:text-amber-200">
                  Cần xử lý
                </span>
              </div>

              <div className="space-y-3">
                {pendingRequests.map((req) => (
                  <div
                    key={req.userId}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-xs dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-sm shrink-0 overflow-hidden border border-primary/20">
                        {req.avatar ? (
                          <img src={req.avatar} alt={req.name} className="h-full w-full object-cover" />
                        ) : (
                          (req.name?.[0] || 'U').toUpperCase()
                        )}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                          {req.name}
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {req.email} &bull; Ngày gửi: {formatDate(req.requestedAt)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleApproveHr(req.userId)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition cursor-pointer"
                      >
                        <UserCheck className="h-3.5 w-3.5" />
                        <span>Duyệt vào công ty</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRejectHr(req.userId)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-rose-50 hover:text-rose-600 transition dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                      >
                        <UserX className="h-3.5 w-3.5" />
                        <span>Từ chối</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* B. Active HR Members List */}
          <div className="rounded-3xl border border-slate-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 mb-6 gap-3 dark:border-slate-800">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  Danh sách thành viên tuyển dụng ({teamMembers.length})
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Tất cả HR trong công ty có thể cùng đăng tin tuyển dụng và quản lý ứng viên
                </p>
              </div>

              {/* Leave Company button: ENABLED ONLY FOR HR MEMBERS (DISABLED/HIDDEN FOR LEAD HR) */}
              {!isCreator ? (
                <button
                  type="button"
                  onClick={handleLeaveCompany}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50/50 px-3.5 py-2 text-xs font-bold text-rose-600 hover:bg-rose-100 transition dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-400 cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Rời công ty</span>
                </button>
              ) : (
                <div className="inline-flex items-center gap-1.5 text-xs text-slate-400 italic">
                  <Crown className="h-3.5 w-3.5 text-amber-500" />
                  <span>HR Trưởng (Không thể rời công ty)</span>
                </div>
              )}
            </div>

            {isLoadingTeam ? (
              <div className="py-12 text-center">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                <p className="mt-2 text-xs text-slate-400">Đang tải danh sách thành viên...</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {teamMembers.map((member) => {
                  const isCurrentUser = member._id === user?._id;
                  const memberIsLead = member.isLead || member.hrRole === 'LEAD';

                  return (
                    <div
                      key={member._id}
                      className="flex items-center justify-between py-4 gap-4"
                    >
                      <div className="flex items-center gap-3.5">
                        <div className="relative h-11 w-11 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-sm shrink-0 overflow-hidden border border-primary/20">
                          {member.avatar ? (
                            <img src={member.avatar} alt={member.name} className="h-full w-full object-cover" />
                          ) : (
                            (member.name?.[0] || 'U').toUpperCase()
                          )}
                          {memberIsLead && (
                            <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full bg-amber-500 ring-2 ring-white flex items-center justify-center text-[8px] text-white">
                              ★
                            </span>
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                              {member.name}
                            </h4>
                            {isCurrentUser && (
                              <span className="rounded-full bg-blue-100 px-2 py-0.2 text-[10px] font-extrabold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                                Bạn
                              </span>
                            )}
                            <span
                              className={`rounded-full px-2 py-0.2 text-[10px] font-bold ${
                                memberIsLead
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300/40'
                                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                              }`}
                            >
                              {memberIsLead ? '👑 HR Trưởng' : '👤 HR Thành viên'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {member.email} &bull; Gia nhập: {formatDate(member.createdAt)}
                          </p>
                        </div>
                      </div>

                      {/* Delete button: Only available to HR Trưởng to remove OTHER members */}
                      {isCreator && !isCurrentUser && !memberIsLead && (
                        <button
                          type="button"
                          onClick={() => handleRemoveHr(member._id, member.name)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 transition dark:border-rose-900/40 dark:hover:bg-rose-950/40 cursor-pointer"
                          title="Xóa HR này khỏi công ty"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Xóa khỏi công ty</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
