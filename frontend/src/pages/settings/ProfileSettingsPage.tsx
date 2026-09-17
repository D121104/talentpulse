import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  UserRound,
  Mail,
  MapPin,
  Calendar,
  Building2,
  Camera,
  Trash2,
  Upload,
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Briefcase,
  Eye,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { SettingsLayout } from './SettingsLayout';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../context/ToastContext';
import { userApi, type CandidateSettingsData } from '../../lib/userApi';

const GENDER_OPTIONS = [
  { value: 'male', label: 'Nam' },
  { value: 'female', label: 'Nữ' },
  { value: 'other', label: 'Khác' },
];

export default function ProfileSettingsPage() {
  const { user, accessToken, updateUser } = useAuth();
  const { success, error, info } = useToast();

  const isHr = user?.role === 'HR';
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form states
  const [name, setName] = useState(user?.name || '');
  const [avatar, setAvatar] = useState(user?.avatar || '');
  const [gender, setGender] = useState(user?.gender || 'male');
  const [age, setAge] = useState<number | ''>(user?.age ?? '');
  const [address, setAddress] = useState(user?.address || '');

  // Candidate specific settings
  const [candidateSettings, setCandidateSettings] = useState<CandidateSettingsData>({
    isJobSeeking: user?.isJobSeeking ?? true,
    isJobRecommendation: user?.isJobRecommendation ?? true,
    allowRecruiterSearch: user?.allowRecruiterSearch ?? true,
  });
  const [isLoadingCandidateSettings, setIsLoadingCandidateSettings] = useState(false);

  // Processing states
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  // Sync state when user prop updates
  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setAvatar(user.avatar || '');
      setGender(user.gender || 'male');
      setAge(user.age ?? '');
      setAddress(user.address || '');
    }
  }, [user]);

  // Load candidate settings from backend on mount (if candidate)
  useEffect(() => {
    if (!isHr && accessToken) {
      setIsLoadingCandidateSettings(true);
      userApi
        .getCandidateSettings(accessToken)
        .then((data) => {
          if (data) {
            setCandidateSettings({
              isJobSeeking: data.isJobSeeking ?? true,
              isJobRecommendation: data.isJobRecommendation ?? true,
              allowRecruiterSearch: data.allowRecruiterSearch ?? true,
            });
          }
        })
        .catch((err) => {
          console.warn('Failed to load candidate settings', err);
        })
        .finally(() => {
          setIsLoadingCandidateSettings(false);
        });
    }
  }, [isHr, accessToken]);

  // Handle Avatar Upload
  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit: 5MB
    if (file.size > 5 * 1024 * 1024) {
      error('Kích thước ảnh không được vượt quá 5MB');
      return;
    }

    // Check mime type
    if (!file.type.startsWith('image/')) {
      error('Vui lòng chọn tệp hình ảnh hợp lệ (PNG, JPG, WEBP)');
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const res = await userApi.uploadAvatar(file, accessToken || undefined);
      const newAvatarUrl = res.url || res.fileName;
      setAvatar(newAvatarUrl);
      success('Tải ảnh đại diện lên thành công! Hãy nhấn Lưu thay đổi.');
    } catch (err: any) {
      error(err.message || 'Tải ảnh đại diện thất bại');
    } finally {
      setIsUploadingAvatar(false);
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Handle Delete/Reset Avatar
  const handleRemoveAvatar = () => {
    setAvatar('');
    info('Đã gỡ ảnh đại diện. Nhấn Lưu thay đổi để hoàn tất.');
  };

  // Submit Profile Form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?._id || !accessToken) return;

    if (!name.trim()) {
      error('Họ và tên không được để trống');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        name: name.trim(),
        avatar: avatar.trim(),
        gender,
        age: age === '' ? undefined : Number(age),
        address: address.trim(),
      };

      // 1. Update basic user profile
      await userApi.updateProfile(user._id, payload, accessToken);

      // 2. If candidate, update job search & visibility settings
      if (!isHr) {
        await userApi.updateCandidateSettings(candidateSettings, accessToken);
      }

      // 3. Immediately reflect changes in AuthContext
      updateUser({
        ...payload,
        ...(!isHr ? candidateSettings : {}),
      });

      success('Cập nhật thông tin cá nhân thành công!');
    } catch (err: any) {
      error(err.message || 'Cập nhật thất bại. Vui lòng thử lại.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingsLayout activeTab="profile">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Card 1: Avatar & Personal Information */}
        <div className="rounded-3xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-sm space-y-8">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-5">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
              <UserRound className="h-5 w-5 text-primary" />
              <span>Thông tin định danh</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Ảnh đại diện và các thông tin cơ bản được hiển thị trong hồ sơ kết nối của bạn.
            </p>
          </div>

          {/* Avatar Section */}
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 pt-2">
            <div className="relative group">
              <div className="h-28 w-28 rounded-3xl bg-gradient-to-tr from-primary to-sky-500 p-0.5 shadow-lg overflow-hidden shrink-0">
                <div className="h-full w-full rounded-[22px] bg-white dark:bg-slate-900 flex items-center justify-center overflow-hidden relative">
                  {avatar ? (
                    <img
                      src={avatar}
                      alt="Avatar Preview"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-3xl font-black text-primary">
                      {(name?.[0] || 'U').toUpperCase()}
                    </span>
                  )}

                  {/* Upload Overlay on hover */}
                  <button
                    type="button"
                    disabled={isUploadingAvatar}
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-xs gap-1 cursor-pointer"
                  >
                    {isUploadingAvatar ? (
                      <Loader2 className="h-6 w-6 animate-spin" />
                    ) : (
                      <>
                        <Camera className="h-6 w-6" />
                        <span className="font-semibold text-[11px]">Đổi ảnh</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-2.5 text-center sm:text-left flex-1">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
                <button
                  type="button"
                  disabled={isUploadingAvatar}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold shadow-sm hover:bg-primary-dark transition active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {isUploadingAvatar ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  <span>Chọn ảnh mới</span>
                </button>

                {avatar && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-rose-200 text-rose-600 dark:border-rose-900/60 dark:text-rose-400 text-xs font-semibold hover:bg-rose-50 dark:hover:bg-rose-950/40 transition active:scale-95 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Gỡ ảnh</span>
                  </button>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarSelect}
                  className="hidden"
                />
              </div>

              <p className="text-[12px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Định dạng JPG, PNG hoặc WEBP. Dung lượng tối đa 5MB. Ảnh rõ nét sẽ giúp hồ sơ của bạn trông chuyên nghiệp hơn.
              </p>
            </div>
          </div>

          {/* Form Fields Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-2">
            {/* Full Name */}
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <span>Họ và tên</span>
                <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <UserRound className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ví dụ: Nguyễn Văn A"
                  className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
                />
              </div>
            </div>

            {/* Email Address (Read-only) */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                <span>Địa chỉ Email</span>
                {user?.isVerified ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                    <CheckCircle2 className="h-3 w-3" />
                    <span>Đã xác thực</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-semibold">
                    <AlertCircle className="h-3 w-3" />
                    <span>Chưa xác thực</span>
                  </span>
                )}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  type="email"
                  disabled
                  value={user?.email || ''}
                  className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/50 pl-10 pr-4 py-2.5 text-sm text-slate-500 dark:text-slate-400 cursor-not-allowed select-all"
                />
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Email dùng để đăng nhập và không thể trực tiếp thay đổi.
              </p>
            </div>

            {/* Age */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Tuổi / Độ tuổi
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Calendar className="h-4 w-4" />
                </div>
                <input
                  type="number"
                  min={18}
                  max={80}
                  value={age}
                  onChange={(e) => setAge(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                  placeholder="Ví dụ: 25"
                  className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
                />
              </div>
            </div>

            {/* Gender Selector */}
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                Giới tính
              </label>
              <div className="grid grid-cols-3 gap-3">
                {GENDER_OPTIONS.map((opt) => {
                  const isSelected = gender === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setGender(opt.value)}
                      className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-2xl text-xs font-bold border transition-all cursor-pointer ${
                        isSelected
                          ? 'border-primary bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light shadow-sm'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <span>{opt.label}</span>
                      {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Address */}
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Địa chỉ / Tỉnh thành
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <MapPin className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Ví dụ: Cầu Giấy, Hà Nội hoặc Quận 1, TP. Hồ Chí Minh"
                  className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Card 2 (Role: Candidate): Job Seeking & Visibility Settings */}
        {!isHr && (
          <div className="rounded-3xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-sm space-y-6">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
                  <Briefcase className="h-5 w-5 text-primary" />
                  <span>Cài đặt tìm việc & quyền riêng tư</span>
                </h2>
                {isLoadingCandidateSettings && (
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                )}
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                Tùy chỉnh mức độ hiển thị hồ sơ để nhận đúng cơ hội việc làm mong muốn.
              </p>
            </div>

            <div className="space-y-5">
              {/* Toggle 1: isJobSeeking */}
              <div className="flex items-start justify-between gap-4 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                      Bật trạng thái đang tìm việc
                    </span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        candidateSettings.isJobSeeking
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                      }`}
                    >
                      {candidateSettings.isJobSeeking ? 'Đang mở' : 'Đang tắt'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Bật để thông báo cho các nhà tuyển dụng biết bạn đang sẵn sàng đón nhận cơ hội nghề nghiệp mới.
                  </p>
                </div>

                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                  <input
                    type="checkbox"
                    checked={Boolean(candidateSettings.isJobSeeking)}
                    onChange={(e) =>
                      setCandidateSettings((prev) => ({
                        ...prev,
                        isJobSeeking: e.target.checked,
                      }))
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-primary" />
                </label>
              </div>

              {/* Toggle 2: isJobRecommendation */}
              <div className="flex items-start justify-between gap-4 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                      Gợi ý việc làm phù hợp (AI Matching)
                    </span>
                    <span className="flex h-4 w-4 items-center justify-center text-amber-500">
                      <Sparkles className="h-3.5 w-3.5" />
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Hệ thống AI sẽ tự động phân tích CV và gửi thông báo khi có vị trí tuyển dụng phù hợp với bạn.
                  </p>
                </div>

                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                  <input
                    type="checkbox"
                    checked={Boolean(candidateSettings.isJobRecommendation)}
                    onChange={(e) =>
                      setCandidateSettings((prev) => ({
                        ...prev,
                        isJobRecommendation: e.target.checked,
                      }))
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-primary" />
                </label>
              </div>

              {/* Toggle 3: allowRecruiterSearch */}
              <div className="flex items-start justify-between gap-4 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                      Cho phép nhà tuyển dụng tìm kiếm hồ sơ
                    </span>
                    <Eye className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Hồ sơ CV của bạn sẽ hiển thị trong kho tìm kiếm ứng viên của các nhà tuyển dụng trên TalentPulse.
                  </p>
                </div>

                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                  <input
                    type="checkbox"
                    checked={Boolean(candidateSettings.allowRecruiterSearch)}
                    onChange={(e) =>
                      setCandidateSettings((prev) => ({
                        ...prev,
                        allowRecruiterSearch: e.target.checked,
                      }))
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-primary" />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Card 2 (Role: HR): Associated Company Info */}
        {isHr && (
          <div className="rounded-3xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-sm space-y-5">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
                  <Building2 className="h-5 w-5 text-primary" />
                  <span>Doanh nghiệp liên kết</span>
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Tài khoản của bạn thuộc quyền quản lý và tuyển dụng của doanh nghiệp.
                </p>
              </div>

              <Link
                to="/dashboard?tab=company"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-primary dark:hover:text-primary-light transition"
              >
                <span>Hồ sơ công ty</span>
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-lg shrink-0">
                <Building2 className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  {user?.company?.name || 'Doanh nghiệp chưa cập nhật'}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {user?.company?._id ? `Mã công ty: ${user.company._id}` : 'Chưa có ID công ty'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Action Button Bar */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="submit"
            disabled={isSaving || isUploadingAvatar}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-primary text-white text-sm font-bold shadow-lg shadow-primary/25 hover:bg-primary-dark transition active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Đang lưu...</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                <span>Lưu thay đổi</span>
              </>
            )}
          </button>
        </div>
      </form>
    </SettingsLayout>
  );
}
