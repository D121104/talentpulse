import { useState, useRef, useEffect, useMemo, useCallback, type UIEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  CheckCheck,
  Filter,
  Briefcase,
  FileText,
  Eye,
  Building2,
  Sparkles,
  CheckCircle2,
  XCircle,
  Inbox,
  ArrowRight,
  Loader2,
  MessageSquare,
} from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../auth/AuthContext';
import type { NotificationItem } from '../../lib/employerApi';

// Category tab definition
type CategoryFilter = 'ALL' | 'JOB' | 'RESUME' | 'COMPANY' | 'SYSTEM';

interface TabItem {
  id: CategoryFilter;
  label: string;
}

const CATEGORY_TABS: TabItem[] = [
  { id: 'ALL', label: 'Tất cả' },
  { id: 'JOB', label: 'Việc làm' },
  { id: 'RESUME', label: 'Trạng thái CV' },
  { id: 'COMPANY', label: 'Kết nối' },
  { id: 'SYSTEM', label: 'Hệ thống' },
];

// Helper to clean raw leading emojis from backend titles for uniform SVG vector display
function cleanNotificationTitle(title: string): string {
  if (!title) return 'Thông báo';
  return title.replace(/^[\p{Emoji}\s]+/u, '').trim() || title;
}

// Format date group header ("Hôm nay - 15/09/2026", "Hôm qua - 14/09/2026", "10/09/2026")
function formatDateGroupKey(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'Gần đây';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const targetDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const pad = (n: number) => String(n).padStart(2, '0');
  const formattedDate = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

  if (targetDay.getTime() === today.getTime()) {
    return `Hôm nay - ${formattedDate}`;
  }
  if (targetDay.getTime() === yesterday.getTime()) {
    return `Hôm qua - ${formattedDate}`;
  }
  return formattedDate;
}

// Format time string for individual item ("10/09/2026" or "14:30 • 10/09/2026")
function formatItemTimestamp(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  const pad = (n: number) => String(n).padStart(2, '0');
  const dateFormatted = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  const timeFormatted = `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  if (diffMinutes < 1) return 'Vừa xong';
  if (diffMinutes < 60) return `${diffMinutes} phút trước`;
  if (diffHours < 24) return `${diffHours} giờ trước • ${timeFormatted}`;
  return `${dateFormatted}`;
}

export function NotificationDropdown() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    unreadCount,
    notifications,
    loading,
    loadingMore,
    hasMore,
    fetchNotifications,
    loadMoreNotifications,
    markAsRead,
    markAllAsRead,
  } = useNotification();

  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<CategoryFilter>('ALL');
  const [onlyUnread, setOnlyUnread] = useState<boolean>(false);
  const [isMarkingAll, setIsMarkingAll] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const observerTarget = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click or Escape key
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // When opening dropdown, fetch latest 10 notifications (limit = 10)
  const handleToggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next) {
        void fetchNotifications(1, 10);
      }
      return next;
    });
  }, [fetchNotifications]);

  // Infinite scroll Intersection Observer
  useEffect(() => {
    if (!isOpen) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          void loadMoreNotifications(10);
        }
      },
      {
        root: scrollContainerRef.current,
        rootMargin: '120px',
        threshold: 0.1,
      },
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [isOpen, hasMore, loadingMore, loading, loadMoreNotifications]);

  // Fallback onScroll handler for infinite scroll
  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (
      scrollHeight - scrollTop - clientHeight < 100 &&
      hasMore &&
      !loadingMore &&
      !loading
    ) {
      void loadMoreNotifications(10);
    }
  };

  // Filter notifications according to activeTab and onlyUnread
  const filteredNotifications = useMemo(() => {
    return notifications.filter((item) => {
      // 1. Check Unread filter
      if (onlyUnread && item.isRead) {
        return false;
      }

      // 2. Check Category filter
      if (activeTab === 'ALL') return true;

      const typeUpper = (item.type || '').toUpperCase();
      const targetTypeUpper = (item.targetType || '').toUpperCase();
      const titleLower = (item.title || '').toLowerCase();

      if (activeTab === 'JOB') {
        return (
          typeUpper === 'JOB' ||
          targetTypeUpper === 'JOB' ||
          (item.data?.jobId && typeUpper !== 'RESUME')
        );
      }

      if (activeTab === 'RESUME') {
        return (
          typeUpper === 'RESUME' ||
          typeUpper === 'APPLICATION' ||
          targetTypeUpper === 'APPLICATION' ||
          titleLower.includes('ứng tuyển') ||
          titleLower.includes('hồ sơ') ||
          titleLower.includes('cv')
        );
      }

      if (activeTab === 'COMPANY') {
        return (
          typeUpper === 'COMPANY' ||
          targetTypeUpper === 'COMPANY' ||
          titleLower.includes('xem hồ sơ') ||
          titleLower.includes('kết nối') ||
          titleLower.includes('doanh nghiệp') ||
          item.data?.type === 'CHAT_MESSAGE' ||
          titleLower.includes('tin nhắn')
        );
      }

      if (activeTab === 'SYSTEM') {
        return (
          typeUpper === 'SYSTEM' ||
          (!['JOB', 'RESUME', 'APPLICATION', 'COMPANY'].includes(typeUpper) &&
            targetTypeUpper !== 'JOB' &&
            targetTypeUpper !== 'APPLICATION')
        );
      }

      return true;
    });
  }, [notifications, activeTab, onlyUnread]);

  // Group filtered notifications by date
  const groupedNotifications = useMemo(() => {
    const groups: { dateKey: string; items: NotificationItem[] }[] = [];
    const map = new Map<string, NotificationItem[]>();

    for (const notif of filteredNotifications) {
      const key = formatDateGroupKey(notif.createdAt);
      if (!map.has(key)) {
        map.set(key, []);
        groups.push({ dateKey: key, items: map.get(key)! });
      }
      map.get(key)!.push(notif);
    }

    return groups;
  }, [filteredNotifications]);

  // Handle click on a single notification with robust ID resolution
  const handleItemClick = async (item: NotificationItem) => {
    if (!item.isRead) {
      void markAsRead(item._id);
    }
    setIsOpen(false);

    const typeUpper = (item.type || '').toUpperCase();
    const targetType = (item.targetType || '').toLowerCase();
    const titleLower = (item.title || '').toLowerCase();

    // 0. Chat / Direct Message Notification
    if (
      item.data?.type === 'CHAT_MESSAGE' ||
      item.data?.conversationId ||
      titleLower.includes('tin nhắn')
    ) {
      const convId = item.data?.conversationId || item.targetId;
      if (convId) {
        navigate(`/messages?conversationId=${convId}`);
        return;
      }
      navigate('/messages');
      return;
    }

    // 1. Recruiter viewed candidate profile -> profile viewers page
    if (
      titleLower.includes('xem hồ sơ') ||
      item.data?.cvType ||
      (targetType === 'company' && typeUpper === 'RESUME')
    ) {
      navigate('/profile-viewers');
      return;
    }

    // 2. Extract valid jobId with strict priority:
    // When data.jobId exists, it is ALWAYS the actual job ID (can be string or object {_id})
    // targetId is ONLY a jobId if targetType is 'job'. If targetType is 'application', targetId is applicationId!
    const rawJobId =
      typeof item.data?.jobId === 'object' && item.data?.jobId !== null
        ? item.data.jobId._id
        : item.data?.jobId;

    const actualJobId =
      (typeof rawJobId === 'string' && rawJobId.trim() ? rawJobId.trim() : null) ||
      (targetType === 'job' && item.targetId ? item.targetId : null);

    // 3. For HR user: if an application arrived, navigate to HR candidate management
    if (
      user?.role === 'HR' &&
      (titleLower.includes('đơn ứng tuyển') || titleLower.includes('ứng viên'))
    ) {
      const appId =
        item.data?.applicationId ||
        (targetType === 'application' ? item.targetId : null);
      if (actualJobId) {
        navigate(
          `/dashboard?tab=candidates&jobId=${actualJobId}${
            appId ? `&applicationId=${appId}` : ''
          }`,
        );
      } else {
        navigate('/dashboard?tab=candidates');
      }
      return;
    }

    // 4. If actualJobId is resolved, navigate to the valid Job Detail Page
    if (actualJobId) {
      navigate(`/jobs/${actualJobId}`);
      return;
    }

    // 5. Fallback for Candidate Application notifications if no jobId was found
    if (
      typeUpper === 'RESUME' ||
      typeUpper === 'APPLICATION' ||
      targetType === 'application'
    ) {
      navigate('/applied-jobs');
      return;
    }

    // 6. Fallback for Company notifications
    if (typeUpper === 'COMPANY' || targetType === 'company') {
      const companyId =
        item.data?.companyId || (targetType === 'company' ? item.targetId : null);
      if (companyId) {
        navigate(`/companies`);
      } else {
        navigate('/companies');
      }
      return;
    }

    // 7. General fallback
    if (user?.role === 'HR') {
      navigate('/dashboard?tab=notifications');
    } else {
      navigate('/applied-jobs');
    }
  };

  // Handle Mark All As Read
  const handleMarkAll = async () => {
    if (unreadCount === 0 || isMarkingAll) return;
    try {
      setIsMarkingAll(true);
      await markAllAsRead();
    } finally {
      setIsMarkingAll(false);
    }
  };

  // Determine Sub-badge and Logo for a notification
  const renderItemVisuals = (item: NotificationItem) => {
    const typeUpper = (item.type || '').toUpperCase();
    const titleLower = (item.title || '').toLowerCase();
    const status = item.data?.status || '';

    // Check if company logo or sender avatar is present
    const logoUrl =
      item.data?.companyLogo ||
      item.data?.logo ||
      item.data?.company?.logo ||
      item.data?.senderAvatar;
    const companyName =
      item.data?.companyName ||
      item.data?.company?.name ||
      item.data?.senderName ||
      '';
    const initial = companyName ? companyName.charAt(0).toUpperCase() : 'TP';

    // Sub-badge icon + color
    let subBadgeBg = 'bg-primary text-white';
    let subBadgeIcon = <Sparkles className="h-2.5 w-2.5" />;

    if (
      item.data?.type === 'CHAT_MESSAGE' ||
      typeUpper === 'MESSAGE' ||
      titleLower.includes('tin nhắn')
    ) {
      // Chat message notification -> Blue message bubble badge
      subBadgeBg = 'bg-blue-600 text-white';
      subBadgeIcon = <MessageSquare className="h-2.5 w-2.5" />;
    } else if (
      typeUpper === 'JOB' ||
      item.targetType === 'job' ||
      (item.data?.jobId && typeUpper !== 'RESUME')
    ) {
      // Job notification -> Orange/Amber briefcase badge (matching mockup)
      subBadgeBg = 'bg-amber-500 text-white';
      subBadgeIcon = <Briefcase className="h-2.5 w-2.5" />;
    } else if (typeUpper === 'RESUME' || typeUpper === 'APPLICATION') {
      // Application / CV status badge
      if (
        status === 'APPROVED' ||
        titleLower.includes('phù hợp') ||
        titleLower.includes('chúc mừng')
      ) {
        subBadgeBg = 'bg-emerald-500 text-white';
        subBadgeIcon = <CheckCircle2 className="h-2.5 w-2.5" />;
      } else if (
        status === 'REJECTED' ||
        titleLower.includes('chưa phù hợp') ||
        titleLower.includes('từ chối')
      ) {
        subBadgeBg = 'bg-slate-500 text-white';
        subBadgeIcon = <XCircle className="h-2.5 w-2.5" />;
      } else {
        // Reviewing, considering -> Blue document badge (matching mockup)
        subBadgeBg = 'bg-primary text-white';
        subBadgeIcon = <FileText className="h-2.5 w-2.5" />;
      }
    } else if (
      typeUpper === 'COMPANY' ||
      titleLower.includes('xem hồ sơ') ||
      titleLower.includes('ntd đã xem')
    ) {
      // Recruiter profile viewer -> Indigo eye badge
      subBadgeBg = 'bg-indigo-600 text-white';
      subBadgeIcon = <Eye className="h-2.5 w-2.5" />;
    }

    return (
      <div className="relative flex-shrink-0">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200/80 bg-white p-1 shadow-xs dark:border-slate-800 dark:bg-slate-800">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={companyName || 'Logo'}
              className="h-full w-full rounded-lg object-contain"
              onError={(e) => {
                // Fallback to text avatar on error
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-lg bg-primary/10 text-xs font-black text-primary dark:bg-primary/20 dark:text-primary-light">
              {companyName ? (
                <span>{initial}</span>
              ) : typeUpper === 'JOB' ? (
                <Briefcase className="h-5 w-5 text-primary" />
              ) : typeUpper === 'RESUME' ? (
                <FileText className="h-5 w-5 text-primary" />
              ) : typeUpper === 'COMPANY' ? (
                <Building2 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              ) : (
                <Sparkles className="h-5 w-5 text-primary" />
              )}
            </div>
          )}
        </div>

        {/* Mini Corner Sub-badge */}
        <span
          className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-white dark:ring-slate-900 shadow-xs ${subBadgeBg}`}
        >
          {subBadgeIcon}
        </span>
      </div>
    );
  };

  return (
    <div ref={containerRef} className="relative">
      {/* 1. Bell Trigger Button */}
      <button
        type="button"
        onClick={handleToggle}
        aria-label="Thông báo hệ thống"
        aria-expanded={isOpen}
        title="Thông báo"
        className="relative flex h-10 w-10 items-center justify-center rounded-full bg-slate-100/80 text-slate-600 transition-all duration-200 hover:bg-primary/10 hover:text-primary active:scale-95 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-primary/20 dark:hover:text-primary-light cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        <Bell className="h-5 w-5 transition-transform group-hover:rotate-6" />

        {/* Unread Count Red Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 px-1.5 items-center justify-center rounded-full bg-rose-500 text-[11px] font-bold text-white shadow-sm ring-2 ring-white dark:ring-slate-900 animate-in zoom-in-75">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* 2. Notification Popover Modal */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="absolute right-0 top-full mt-2.5 w-[360px] sm:w-[420px] max-w-[calc(100vw-20px)] rounded-2xl border border-slate-200/90 bg-white/95 shadow-2xl backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/95 z-50 overflow-hidden flex flex-col"
          >
            {/* Popover Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800/80">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Thông báo
                </h3>
                {unreadCount > 0 && (
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary dark:bg-primary/20 dark:text-primary-light">
                    {unreadCount} mới
                  </span>
                )}
              </div>

              {/* Action Buttons: Filter & Mark all as read */}
              <div className="flex items-center gap-1">
                {/* Filter toggle button (Chỉ xem chưa đọc) */}
                <button
                  type="button"
                  onClick={() => setOnlyUnread((prev) => !prev)}
                  title={
                    onlyUnread
                      ? 'Hiển thị tất cả thông báo'
                      : 'Chỉ hiển thị thông báo chưa đọc'
                  }
                  className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors cursor-pointer ${
                    onlyUnread
                      ? 'bg-primary text-white shadow-xs'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <Filter className="h-4 w-4" />
                </button>

                {/* Mark all as read button */}
                <button
                  type="button"
                  onClick={() => void handleMarkAll()}
                  disabled={unreadCount === 0 || isMarkingAll}
                  title="Đánh dấu tất cả là đã đọc"
                  className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors cursor-pointer ${
                    unreadCount > 0
                      ? 'text-slate-600 hover:bg-slate-100 hover:text-primary dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-primary-light'
                      : 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                  }`}
                >
                  <CheckCheck
                    className={`h-4.5 w-4.5 ${
                      isMarkingAll ? 'animate-spin' : ''
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Horizontal Filter Tabs (TalentPulse Royal Blue Theme - NO TOPCV GREEN) */}
            <div className="flex items-center gap-1.5 overflow-x-auto px-4 py-2.5 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/50 no-scrollbar">
              {CATEGORY_TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs transition-all duration-150 cursor-pointer ${
                      isActive
                        ? 'border border-primary/40 bg-primary/10 font-bold text-primary shadow-xs dark:border-primary/50 dark:bg-primary/20 dark:text-primary-light'
                        : 'border border-slate-200/80 bg-white font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700/80 dark:bg-slate-800/80 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Scrollable Notifications List with Infinite Scroll (limit 10 offset 10) */}
            <div
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto max-h-[410px] divide-y divide-slate-100/80 dark:divide-slate-800/60"
            >
              {loading && notifications.length === 0 ? (
                /* Loading Initial State Skeleton */
                <div className="p-4 space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-start gap-3 animate-pulse">
                      <div className="h-12 w-12 rounded-xl bg-slate-200 dark:bg-slate-800 flex-shrink-0" />
                      <div className="flex-1 space-y-2 py-1">
                        <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
                        <div className="h-2.5 bg-slate-100 dark:bg-slate-800/60 rounded w-full" />
                        <div className="h-2.5 bg-slate-100 dark:bg-slate-800/60 rounded w-1/3" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : groupedNotifications.length === 0 ? (
                /* Empty State */
                <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                  <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/5 text-primary dark:bg-primary/15 dark:text-primary-light">
                    <Inbox className="h-7 w-7" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Chưa có thông báo nào
                  </h4>
                  <p className="mt-1 max-w-[240px] text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {onlyUnread
                      ? 'Bạn đã đọc tất cả thông báo trong mục này.'
                      : activeTab === 'JOB'
                      ? 'Chưa có thông báo việc làm mới từ các công ty bạn quan tâm.'
                      : activeTab === 'RESUME'
                      ? 'Chưa có cập nhật trạng thái hồ sơ ứng tuyển nào.'
                      : activeTab === 'COMPANY'
                      ? 'Chưa có thông báo kết nối hoặc nhà tuyển dụng xem hồ sơ.'
                      : 'Hệ thống sẽ gửi thông báo khi có hoạt động mới liên quan đến bạn.'}
                  </p>
                </div>
              ) : (
                /* Grouped Notification List by Date */
                <>
                  {groupedNotifications.map((group) => (
                    <div key={group.dateKey} className="space-y-0.5">
                      {/* Date Divider (matches reference mockup date headers) */}
                      <div className="sticky top-0 z-10 bg-slate-50/90 px-4 py-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider backdrop-blur-xs dark:bg-slate-900/90 dark:text-slate-400 border-b border-slate-100/60 dark:border-slate-800/60">
                        {group.dateKey}
                      </div>

                      {/* Cards within this Date */}
                      {group.items.map((item) => {
                        const cleanTitle = cleanNotificationTitle(item.title);
                        const isUnread = !item.isRead;

                        return (
                          <div
                            key={item._id}
                            onClick={() => void handleItemClick(item)}
                            className={`group relative flex items-start gap-3 px-4 py-3.5 transition-all duration-150 cursor-pointer ${
                              isUnread
                                ? 'bg-blue-50/40 hover:bg-blue-50/80 dark:bg-blue-950/20 dark:hover:bg-blue-950/30'
                                : 'bg-white hover:bg-slate-50/90 dark:bg-slate-900 dark:hover:bg-slate-800/60'
                            }`}
                          >
                            {/* Visual Logo / Sub-badge */}
                            {renderItemVisuals(item)}

                            {/* Content Middle */}
                            <div className="min-w-0 flex-1">
                              <h4
                                className={`text-sm leading-snug line-clamp-2 ${
                                  isUnread
                                    ? 'font-bold text-slate-900 dark:text-white'
                                    : 'font-medium text-slate-700 dark:text-slate-200'
                                }`}
                              >
                                {cleanTitle}
                              </h4>

                              {item.content && (
                                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                                  {item.content}
                                </p>
                              )}

                              <span className="mt-1.5 inline-block text-[11px] font-medium text-slate-400 dark:text-slate-500">
                                {formatItemTimestamp(item.createdAt)}
                              </span>
                            </div>

                            {/* Right Action & Unread Dot */}
                            <div className="flex flex-col items-center justify-between self-stretch pl-1">
                              {isUnread && (
                                <span
                                  className="h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-rose-200 dark:ring-rose-950/60 shadow-xs"
                                  title="Chưa đọc"
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}

                  {/* Infinite Scroll Bottom Sentinel & Loader */}
                  <div ref={observerTarget} className="py-2 text-center">
                    {loadingMore && (
                      <div className="flex items-center justify-center gap-2 py-3 text-xs text-primary font-semibold">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Đang tải thêm thông báo...</span>
                      </div>
                    )}
                    {!hasMore && notifications.length >= 10 && (
                      <div className="py-3 text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                        Đã hiển thị tất cả thông báo
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Popover Footer */}
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-4 py-2.5 dark:border-slate-800/80 dark:bg-slate-900/60">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {filteredNotifications.length} thông báo
              </span>

              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  if (user?.role === 'HR') {
                    navigate('/dashboard?tab=notifications');
                  } else {
                    navigate('/profile-viewers');
                  }
                }}
                className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:text-primary-dark dark:hover:text-primary-light transition-colors cursor-pointer"
              >
                <span>
                  {user?.role === 'HR'
                    ? 'Xem trên trang quản trị'
                    : 'Nhà tuyển dụng xem CV'}
                </span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default NotificationDropdown;
