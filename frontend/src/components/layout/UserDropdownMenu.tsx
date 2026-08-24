import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  MessageSquare,
  ChevronDown,
  Briefcase,
  FileText,
  BellRing,
  ShieldCheck,
  Crown,
  LogOut,
  CheckCircle2,
  Send,
  Sparkles,
  SlidersHorizontal,
  FileCheck,
  Eye,
  UserCog,
  KeyRound,
  Settings2,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { UserAvatar } from '../common/UserAvatar';

export function UserDropdownMenu() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    jobs: true,
    cv: true,
    notifications: false,
    security: false,
    upgrade: false,
  });

  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleMouseEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 200);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  const handleLogout = async () => {
    setIsOpen(false);
    await logout();
    navigate('/', { replace: true });
  };

  if (!user) return null;

  // Short ID generator
  const shortId = user._id ? user._id.slice(0, 8).toUpperCase() : '7852642';

  return (
    <div className="flex items-center gap-1.5 sm:gap-2.5">
      {/* Quick Action: Notifications Icon */}
      <button
        type="button"
        className="relative flex h-10 w-10 items-center justify-center rounded-full bg-slate-100/80 text-slate-600 transition hover:bg-primary/10 hover:text-primary dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-primary/20 dark:hover:text-primary-light cursor-pointer"
        aria-label={t('userMenu.notifications')}
        title={t('userMenu.notifications')}
      >
        <Bell className="h-5 w-5" />
        {/* Subtle unread badge dot in Primary Blue */}
        <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary ring-2 ring-white dark:ring-slate-900" />
      </button>

      {/* Quick Action: Messages Icon */}
      <button
        type="button"
        className="relative flex h-10 w-10 items-center justify-center rounded-full bg-slate-100/80 text-slate-600 transition hover:bg-primary/10 hover:text-primary dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-primary/20 dark:hover:text-primary-light cursor-pointer"
        aria-label={t('userMenu.messages')}
        title={t('userMenu.messages')}
      >
        <MessageSquare className="h-5 w-5" />
      </button>

      {/* Avatar Dropdown Wrapper */}
      <div
        ref={containerRef}
        className="relative"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Avatar Trigger Button */}
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="group relative flex items-center rounded-full p-0.5 focus:outline-none cursor-pointer"
          aria-expanded={isOpen}
          aria-label="User profile menu"
        >
          <UserAvatar
            src={user.avatar}
            alt={user.name}
            size="md"
            className="border border-slate-200 shadow-sm transition-all group-hover:ring-2 group-hover:ring-primary/40 dark:border-slate-700"
          />

          {/* Small corner chevron badge */}
          <span className="absolute -bottom-0.5 -right-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
          </span>
        </button>

        {/* Dropdown Menu Modal/Panel */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="absolute right-0 top-full mt-2 w-[375px] sm:w-[415px] max-h-[85vh] overflow-y-auto rounded-[26px] border border-slate-200/90 bg-white/95 p-5 shadow-2xl shadow-slate-950/15 backdrop-blur-2xl dark:border-slate-700/90 dark:bg-slate-900/95 dark:shadow-black/40 z-50 divide-y divide-slate-100 dark:divide-slate-800/80"
            >
              {/* 1. Header Profile Information */}
              <div className="pb-4.5 pt-1">
                <div className="flex items-center gap-4">
                  {/* Large Avatar */}
                  <UserAvatar
                    src={user.avatar}
                    alt={user.name}
                    size="lg"
                    className="border border-slate-200 shadow-inner dark:border-slate-700"
                  />

                  {/* Name, Verified Status & ID/Email */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h3 className="truncate text-[18px] sm:text-[19px] font-extrabold text-slate-900 dark:text-white leading-snug">
                        {user.name || 'Người dùng'}
                      </h3>
                    </div>

                    <div className="mt-0.5 flex items-center gap-1.5 text-[13.5px]">
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                      <span className="font-semibold text-primary dark:text-primary-light">
                        {t('userMenu.verifiedAccount')}
                      </span>
                    </div>

                    <p className="mt-1 truncate text-[13px] text-slate-400 dark:text-slate-500">
                      {t('userMenu.idPrefix')} {shortId} &bull; {user.email}
                    </p>
                  </div>
                </div>
              </div>

              {/* 2. Menu Sections */}
              <div className="py-3 space-y-1">
                {/* Section 1: Quản lý tìm việc */}
                <div className="rounded-xl transition-colors">
                  <button
                    type="button"
                    onClick={() => toggleSection('jobs')}
                    className="flex w-full items-center justify-between px-3 py-2.5 text-[15.5px] font-bold text-slate-800 dark:text-slate-100 hover:bg-primary/5 dark:hover:bg-primary/10 rounded-xl transition cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <span className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light">
                        <Briefcase className="h-4.5 w-4.5" />
                        <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-white dark:ring-slate-900" />
                      </span>
                      <span>{t('userMenu.jobManagement')}</span>
                    </div>
                    <ChevronDown
                      className={`h-4.5 w-4.5 text-slate-400 transition-transform duration-200 ${
                        openSections.jobs ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {openSections.jobs && (
                    <div className="ml-10 mt-1 space-y-0.5 border-l-2 border-slate-100 dark:border-slate-800 pl-4 pb-1 text-[14px]">
                      <Link
                        to="/applied-jobs"
                        onClick={() => setIsOpen(false)}
                        className="flex items-center gap-2.5 py-2 text-slate-600 hover:text-primary dark:text-slate-400 dark:hover:text-primary-light transition-colors"
                      >
                        <Send className="h-4 w-4 text-slate-400" />
                        <span>{t('userMenu.appliedJobs')}</span>
                      </Link>
                      <Link
                        to="/matching-jobs"
                        onClick={() => setIsOpen(false)}
                        className="flex items-center gap-2.5 py-2 text-slate-600 hover:text-primary dark:text-slate-400 dark:hover:text-primary-light transition-colors"
                      >
                        <Sparkles className="h-4 w-4 text-primary" />
                        <span>{t('userMenu.matchingJobs')}</span>
                      </Link>
                      <Link
                        to="/job-alerts"
                        onClick={() => setIsOpen(false)}
                        className="flex items-center gap-2.5 py-2 text-slate-600 hover:text-primary dark:text-slate-400 dark:hover:text-primary-light transition-colors"
                      >
                        <SlidersHorizontal className="h-4 w-4 text-slate-400" />
                        <span>{t('userMenu.jobAlertSettings')}</span>
                      </Link>
                    </div>
                  )}
                </div>

                {/* Section 2: Quản lý CV & Cover letter */}
                <div className="rounded-xl transition-colors">
                  <button
                    type="button"
                    onClick={() => toggleSection('cv')}
                    className="flex w-full items-center justify-between px-3 py-2.5 text-[15.5px] font-bold text-slate-800 dark:text-slate-100 hover:bg-primary/5 dark:hover:bg-primary/10 rounded-xl transition cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light">
                        <FileText className="h-4.5 w-4.5" />
                      </span>
                      <span>{t('userMenu.cvManagement')}</span>
                    </div>
                    <ChevronDown
                      className={`h-4.5 w-4.5 text-slate-400 transition-transform duration-200 ${
                        openSections.cv ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {openSections.cv && (
                    <div className="ml-10 mt-1 space-y-0.5 border-l-2 border-slate-100 dark:border-slate-800 pl-4 pb-1 text-[14px]">
                      <Link
                        to="/my-cv"
                        onClick={() => setIsOpen(false)}
                        className="flex items-center gap-2.5 py-2 font-bold text-primary dark:text-primary-light hover:underline transition-colors"
                      >
                        <FileCheck className="h-4 w-4" />
                        <span>{t('userMenu.myCvs')}</span>
                      </Link>
                      <Link
                        to="/profile-viewers"
                        onClick={() => setIsOpen(false)}
                        className="flex items-center gap-2.5 py-2 text-slate-600 hover:text-primary dark:text-slate-400 dark:hover:text-primary-light transition-colors"
                      >
                        <Eye className="h-4 w-4 text-slate-400" />
                        <span>{t('userMenu.profileViewers')}</span>
                      </Link>
                    </div>
                  )}
                </div>

                {/* Section 3: Cài đặt email & thông báo */}
                <div className="rounded-xl transition-colors">
                  <button
                    type="button"
                    onClick={() => toggleSection('notifications')}
                    className="flex w-full items-center justify-between px-3 py-2.5 text-[15.5px] font-bold text-slate-800 dark:text-slate-100 hover:bg-primary/5 dark:hover:bg-primary/10 rounded-xl transition cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light">
                        <BellRing className="h-4.5 w-4.5" />
                      </span>
                      <span>{t('userMenu.emailAndNotifications')}</span>
                    </div>
                    <ChevronDown
                      className={`h-4.5 w-4.5 text-slate-400 transition-transform duration-200 ${
                        openSections.notifications ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {openSections.notifications && (
                    <div className="ml-10 mt-1 space-y-0.5 border-l-2 border-slate-100 dark:border-slate-800 pl-4 pb-1 text-[14px]">
                      <Link
                        to="/settings/notifications"
                        onClick={() => setIsOpen(false)}
                        className="flex items-center gap-2.5 py-2 text-slate-600 hover:text-primary dark:text-slate-400 dark:hover:text-primary-light transition-colors"
                      >
                        <Settings2 className="h-4 w-4 text-slate-400" />
                        <span>{t('userMenu.notificationSettings')}</span>
                      </Link>
                    </div>
                  )}
                </div>

                {/* Section 4: Cá nhân & Bảo mật */}
                <div className="rounded-xl transition-colors">
                  <button
                    type="button"
                    onClick={() => toggleSection('security')}
                    className="flex w-full items-center justify-between px-3 py-2.5 text-[15.5px] font-bold text-slate-800 dark:text-slate-100 hover:bg-primary/5 dark:hover:bg-primary/10 rounded-xl transition cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light">
                        <ShieldCheck className="h-4.5 w-4.5" />
                      </span>
                      <span>{t('userMenu.personalAndSecurity')}</span>
                    </div>
                    <ChevronDown
                      className={`h-4.5 w-4.5 text-slate-400 transition-transform duration-200 ${
                        openSections.security ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {openSections.security && (
                    <div className="ml-10 mt-1 space-y-0.5 border-l-2 border-slate-100 dark:border-slate-800 pl-4 pb-1 text-[14px]">
                      <Link
                        to="/settings/profile"
                        onClick={() => setIsOpen(false)}
                        className="flex items-center gap-2.5 py-2 text-slate-600 hover:text-primary dark:text-slate-400 dark:hover:text-primary-light transition-colors"
                      >
                        <UserCog className="h-4 w-4 text-slate-400" />
                        <span>{t('userMenu.updateProfile')}</span>
                      </Link>
                      <Link
                        to="/settings/password"
                        onClick={() => setIsOpen(false)}
                        className="flex items-center gap-2.5 py-2 text-slate-600 hover:text-primary dark:text-slate-400 dark:hover:text-primary-light transition-colors"
                      >
                        <KeyRound className="h-4 w-4 text-slate-400" />
                        <span>{t('userMenu.changePassword')}</span>
                      </Link>
                    </div>
                  )}
                </div>

                {/* Section 5: Nâng cấp tài khoản */}
                <div className="rounded-xl transition-colors">
                  <button
                    type="button"
                    onClick={() => toggleSection('upgrade')}
                    className="flex w-full items-center justify-between px-3 py-2.5 text-[15.5px] font-bold text-slate-800 dark:text-slate-100 hover:bg-amber-500/5 dark:hover:bg-amber-500/10 rounded-xl transition cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
                        <Crown className="h-4.5 w-4.5" />
                      </span>
                      <span>{t('userMenu.upgradeAccount')}</span>
                    </div>
                    <ChevronDown
                      className={`h-4.5 w-4.5 text-slate-400 transition-transform duration-200 ${
                        openSections.upgrade ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {openSections.upgrade && (
                    <div className="ml-10 mt-1 space-y-0.5 border-l-2 border-slate-100 dark:border-slate-800 pl-4 pb-1 text-[14px]">
                      <a
                        href="#premium"
                        onClick={() => setIsOpen(false)}
                        className="flex items-center gap-2.5 py-2 font-bold text-amber-600 dark:text-amber-400 hover:underline transition-colors"
                      >
                        <Crown className="h-4 w-4" />
                        <span>{user.role === 'HR' ? t('userMenu.hrPremium') : t('userMenu.candidatePremium')}</span>
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* 3. Footer Action: Sign Out Button */}
              <div className="pt-3.5">
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="flex h-12 w-full items-center justify-center gap-2.5 rounded-2xl bg-slate-100 text-[15px] font-bold text-slate-700 transition-all hover:bg-red-50 hover:text-red-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-red-950/40 dark:hover:text-red-400 cursor-pointer shadow-xs active:scale-98"
                >
                  <LogOut className="h-4.5 w-4.5" />
                  <span>{t('userMenu.signOut')}</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
