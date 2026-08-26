import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bell,
  CheckCheck,
  Briefcase,
  Users,
  Loader2,
} from 'lucide-react';
import { employerApi, type NotificationItem } from '../../../lib/employerApi';
import { useToast } from '../../../context/ToastContext';
import { formatDateTime } from '../../../lib/dateUtils';

interface NotificationsTabProps {
  accessToken: string | null;
  onRefreshStats: () => Promise<void>;
}

export function NotificationsTab({ accessToken, onRefreshStats }: NotificationsTabProps) {
  const { t } = useTranslation();
  const { success, error } = useToast();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'UNREAD'>('ALL');

  const fetchNotifications = async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const res = await employerApi.getNotifications(1, 30, accessToken);
      setNotifications(res.result || []);
    } catch (err) {
      console.error('Failed to load notifications', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchNotifications();
  }, [accessToken]);

  const handleMarkAsRead = async (id: string) => {
    if (!accessToken) return;
    try {
      await employerApi.markNotificationAsRead(id, accessToken);
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, isRead: true } : n)),
      );
      await onRefreshStats();
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllRead = async () => {
    if (!accessToken) return;
    try {
      await employerApi.markAllNotificationsAsRead(accessToken);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      success(t('employer.notificationsTab.markAllRead'));
      await onRefreshStats();
    } catch (err: any) {
      error(err.message || 'Thao tác thất bại');
    }
  };

  const filtered = notifications.filter((n) => {
    if (filter === 'UNREAD') return !n.isRead;
    return true;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {t('employer.notificationsTab.title')}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t('employer.notificationsTab.subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 cursor-pointer"
          >
            <CheckCheck className="h-4 w-4 text-primary" />
            <span>{t('employer.notificationsTab.markAllRead')}</span>
          </button>
        </div>
      </div>

      {/* 2. Filter Pills */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setFilter('ALL')}
          className={`rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer ${
            filter === 'ALL'
              ? 'bg-primary text-white shadow-sm'
              : 'border border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
          }`}
        >
          {t('employer.notificationsTab.filterAll')} ({notifications.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter('UNREAD')}
          className={`rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer ${
            filter === 'UNREAD'
              ? 'bg-primary text-white shadow-sm'
              : 'border border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
          }`}
        >
          {t('employer.notificationsTab.filterUnread')} ({notifications.filter((n) => !n.isRead).length})
        </button>
      </div>

      {/* 3. Notifications List */}
      {isLoading ? (
        <div className="py-20 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="mt-2 text-xs text-slate-400">{t('employer.jobsTab.submittingBtn')}</p>
        </div>
      ) : filtered.length > 0 ? (
        <div className="rounded-3xl border border-slate-200/90 bg-white overflow-hidden shadow-sm dark:border-slate-800 dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
          {filtered.map((item) => (
            <div
              key={item._id}
              onClick={() => !item.isRead && handleMarkAsRead(item._id)}
              className={`flex items-start justify-between gap-4 p-5 transition cursor-pointer ${
                !item.isRead
                  ? 'bg-blue-50/40 hover:bg-blue-50/80 dark:bg-blue-950/20 dark:hover:bg-blue-950/40'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <div className="flex items-start gap-3.5">
                <span
                  className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl shrink-0 ${
                    item.type === 'RESUME'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      : item.type === 'JOB'
                      ? 'bg-blue-100 text-primary dark:bg-blue-950 dark:text-blue-300'
                      : 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
                  }`}
                >
                  {item.type === 'RESUME' ? (
                    <Users className="h-4.5 w-4.5" />
                  ) : item.type === 'JOB' ? (
                    <Briefcase className="h-4.5 w-4.5" />
                  ) : (
                    <Bell className="h-4.5 w-4.5" />
                  )}
                </span>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      {item.title}
                    </h4>
                    {!item.isRead && (
                      <span className="h-2 w-2 rounded-full bg-primary" />
                    )}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {item.content}
                  </p>
                  <span className="text-[11px] text-slate-400 block pt-1">
                    {formatDateTime(item.createdAt)}
                  </span>
                </div>
              </div>

              {!item.isRead && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleMarkAsRead(item._id);
                  }}
                  className="rounded-lg p-1.5 text-xs text-slate-400 hover:bg-white hover:text-primary transition dark:hover:bg-slate-800 shrink-0 cursor-pointer"
                  title={t('employer.notificationsTab.markReadBtn')}
                >
                  <CheckCheck className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
          <Bell className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600 mb-2" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            {t('employer.notificationsTab.emptyTitle')}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t('employer.notificationsTab.emptyDesc')}
          </p>
        </div>
      )}
    </div>
  );
}

