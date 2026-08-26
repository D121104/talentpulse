import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  User,
  KeyRound,
  Save,
  Lock,
  Loader2,
} from 'lucide-react';
import { employerApi } from '../../../lib/employerApi';
import { useToast } from '../../../context/ToastContext';
import { useAuth } from '../../../auth/AuthContext';

interface HrAccountTabProps {
  accessToken: string | null;
  onRefreshUser: () => Promise<void>;
}

export function HrAccountTab({ accessToken, onRefreshUser }: HrAccountTabProps) {
  const { t } = useTranslation();
  const { success, error, info } = useToast();
  const { user } = useAuth();

  const [profileForm, setProfileForm] = useState({
    name: user?.name || '',
    address: user?.address || '',
    gender: user?.gender || 'male',
    age: user?.age || 28,
    avatar: user?.avatar || '',
  });

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const res = await employerApi.uploadImage(file, accessToken || undefined);
      const avatarUrl = res.url || res.fileName;
      setProfileForm((prev) => ({ ...prev, avatar: avatarUrl }));
      success(t('employer.companyTab.uploadLogoBtn'));
    } catch (err: any) {
      error(err.message || 'Tải ảnh đại diện thất bại');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !user?._id) return;

    setIsUpdatingProfile(true);
    try {
      await employerApi.updateUserProfile(user._id, profileForm, accessToken);
      success(t('employer.accountTab.saveProfileBtn'));
      await onRefreshUser();
    } catch (err: any) {
      error(err.message || 'Cập nhật thất bại');
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;

    if (passwordForm.newPassword.length < 6) {
      info(t('employer.accountTab.newPassLabel'));
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      info(t('employer.accountTab.confirmPassLabel'));
      return;
    }

    setIsUpdatingPassword(true);
    try {
      await employerApi.changeUserPassword(
        {
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
          password: passwordForm.newPassword,
        },
        accessToken,
      );
      success(t('employer.accountTab.changePassBtn'));
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err: any) {
      error(err.message || 'Đổi mật khẩu thất bại');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header */}
      <div className="border-b border-slate-200 pb-4 dark:border-slate-800">
        <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
          {t('employer.accountTab.title')}
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
          {t('employer.accountTab.subtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Profile Card */}
        <form onSubmit={handleSaveProfile} className="rounded-3xl border border-slate-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-5">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <User className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {t('employer.accountTab.profileTitle')}
              </h3>
              <p className="text-xs text-slate-500">{t('employer.accountTab.profileDesc')}</p>
            </div>
          </div>

          {/* Avatar Upload */}
          <div className="flex items-center gap-4">
            <div className="relative h-16 w-16 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xl overflow-hidden border-2 border-primary/20 shrink-0">
              {profileForm.avatar ? (
                <img src={profileForm.avatar} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                (profileForm.name?.[0] || 'U').toUpperCase()
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {t('employer.accountTab.avatarLabel')}
              </label>
              <div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="text-xs text-slate-500 file:mr-2 file:py-1 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {t('employer.accountTab.nameLabel')} <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={profileForm.name}
                onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {t('employer.accountTab.emailLabel')}
              </label>
              <input
                type="email"
                disabled
                value={user?.email || ''}
                className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400 cursor-not-allowed"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {t('employer.accountTab.addressLabel')}
              </label>
              <input
                type="text"
                value={profileForm.address}
                onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                placeholder="Hà Nội, Việt Nam"
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="submit"
              disabled={isUpdatingProfile}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-primary-dark transition active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {isUpdatingProfile ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              <span>{t('employer.accountTab.saveProfileBtn')}</span>
            </button>
          </div>
        </form>

        {/* Password & Security Card */}
        <form onSubmit={handleChangePassword} className="rounded-3xl border border-slate-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-5">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
              <KeyRound className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {t('employer.accountTab.securityTitle')}
              </h3>
              <p className="text-xs text-slate-500">{t('employer.accountTab.securityDesc')}</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {t('employer.accountTab.currentPassLabel')} <span className="text-rose-500">*</span>
              </label>
              <input
                type="password"
                required
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {t('employer.accountTab.newPassLabel')} <span className="text-rose-500">*</span>
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {t('employer.accountTab.confirmPassLabel')} <span className="text-rose-500">*</span>
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="submit"
              disabled={isUpdatingPassword}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-slate-800 transition active:scale-95 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white cursor-pointer"
            >
              {isUpdatingPassword ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
              <span>{t('employer.accountTab.changePassBtn')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

