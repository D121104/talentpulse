import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useToast } from './ToastContext';
import { getNotificationSocket } from '../lib/socket';
import { employerApi, type NotificationItem } from '../lib/employerApi';

interface NotificationContextType {
  unreadCount: number;
  notifications: NotificationItem[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  currentPage: number;
  totalPages: number;
  fetchNotifications: (
    page?: number,
    limit?: number,
    isAppend?: boolean,
  ) => Promise<void>;
  loadMoreNotifications: (limit?: number) => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(
  undefined,
);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user, accessToken } = useAuth();
  const { info } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(false);

  // Set of received notification IDs to strictly prevent duplicate processing
  const processedNotifIdsRef = useRef<Set<string>>(new Set());

  // Fetch unread count from API
  const fetchUnreadCount = useCallback(async () => {
    if (!accessToken) {
      setUnreadCount(0);
      return;
    }
    try {
      const res = await employerApi.getUnreadNotificationsCount(accessToken);
      const count =
        typeof res === 'number'
          ? res
          : (res as any)?.count !== undefined
          ? (res as any).count
          : (res as any)?.data?.count || 0;
      setUnreadCount(Number(count) || 0);
    } catch {
      // Ignore count fetch errors
    }
  }, [accessToken]);

  // Fetch paginated notifications list (limit default: 10)
  const fetchNotifications = useCallback(
    async (page = 1, limit = 10, isAppend = false) => {
      if (!accessToken) return;
      try {
        if (isAppend) {
          setLoadingMore(true);
        } else {
          setLoading(true);
        }

        const res = await employerApi.getNotifications(page, limit, accessToken);
        const list: NotificationItem[] = Array.isArray(res?.result)
          ? res.result
          : Array.isArray((res as any)?.data?.result)
          ? (res as any).data.result
          : [];

        const meta = res?.meta || (res as any)?.data?.meta || {};
        const curPage = Number(meta.current) || page;
        const totalPgs = Number(meta.pages) || 1;

        setCurrentPage(curPage);
        setTotalPages(totalPgs);
        setHasMore(curPage < totalPgs);

        // Update unread count if returned by API
        if (meta.unreadCount !== undefined) {
          setUnreadCount(Number(meta.unreadCount) || 0);
        }

        if (isAppend) {
          setNotifications((prev) => {
            const existingIds = new Set(prev.map((item) => item._id));
            const newItems = list.filter((item) => !existingIds.has(item._id));
            return [...prev, ...newItems];
          });
        } else {
          setNotifications(list);
          // Register IDs into processed set
          list.forEach((item) => {
            if (item._id) processedNotifIdsRef.current.add(item._id);
          });
        }
      } catch {
        // Ignore fetch errors
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [accessToken],
  );

  // Load next page of notifications (limit: 10)
  const loadMoreNotifications = useCallback(
    async (limit = 10) => {
      if (loading || loadingMore || !hasMore || !accessToken) return;
      const nextPage = currentPage + 1;
      await fetchNotifications(nextPage, limit, true);
    },
    [loading, loadingMore, hasMore, accessToken, currentPage, fetchNotifications],
  );

  // Initial load when auth state changes
  useEffect(() => {
    if (user?._id && accessToken) {
      processedNotifIdsRef.current.clear();
      void fetchUnreadCount();
      void fetchNotifications(1, 10);
    } else {
      setUnreadCount(0);
      setNotifications([]);
      setCurrentPage(1);
      setTotalPages(1);
      setHasMore(false);
      processedNotifIdsRef.current.clear();
    }
  }, [user?._id, accessToken, fetchUnreadCount, fetchNotifications]);

  // Realtime Socket.IO Connection & Listener
  useEffect(() => {
    if (!user?._id) return;

    const socket = getNotificationSocket(user._id);

    const handleNewNotification = (notif: any) => {
      if (!notif) return;

      const notifId = notif._id || `${Date.now()}-${Math.random()}`;

      // Strictly check if this notification was already processed (Rate-limited update of existing unread notification)
      if (processedNotifIdsRef.current.has(notifId)) {
        setNotifications((prev) =>
          prev.map((item) =>
            item._id === notifId
              ? {
                  ...item,
                  title: notif.title || item.title,
                  content: notif.content || item.content,
                  data: notif.data || item.data,
                  createdAt: notif.updatedAt || notif.createdAt || item.createdAt,
                }
              : item,
          ),
        );
        return;
      }
      processedNotifIdsRef.current.add(notifId);

      // 1. Increment unread count by exactly 1
      setUnreadCount((prev) => prev + 1);

      // 2. Prepend new notification to the active list
      const newItem: NotificationItem = {
        _id: notifId,
        userId: notif.userId || user._id,
        title: notif.title || 'Thông báo mới',
        content: notif.content || '',
        type: notif.type || 'SYSTEM',
        targetType: notif.targetType || 'NONE',
        targetId: notif.targetId,
        data: notif.data,
        isRead: false,
        createdAt: notif.createdAt || new Date().toISOString(),
      };

      setNotifications((prev) => [
        newItem,
        ...prev.filter((item) => item._id !== notifId),
      ]);

      // 3. Trigger immediate Toast in top-right corner (ONLY if NOT on /messages page for chat notifications)
      if (notif?.title) {
        const isChatMessage =
          notif.data?.type === 'CHAT_MESSAGE' ||
          notif.data?.conversationId ||
          (notif.title && notif.title.toLowerCase().includes('tin nhắn'));

        const isOnMessagesPage =
          location.pathname.startsWith('/messages') ||
          window.location.pathname.startsWith('/messages');

        // Khi người dùng đang ở trang nhắn tin (/messages), hoàn toàn không hiện toast thông báo tin nhắn nữa
        if (isChatMessage && isOnMessagesPage) {
          return;
        }

        const convId = notif.data?.conversationId || notif.targetId;
        const onClick = isChatMessage
          ? () => {
              if (convId) {
                navigate(`/messages?conversationId=${convId}`);
              } else {
                navigate('/messages');
              }
            }
          : undefined;

        info(
          notif.title,
          notif.content || 'Bạn có một thông báo mới từ hệ thống.',
          onClick,
        );
      }
    };

    const handleUnreadCount = (data: any) => {
      if (typeof data?.count === 'number') {
        setUnreadCount(data.count);
      }
    };

    socket.on('notification', handleNewNotification);
    socket.on('notification_unread_count', handleUnreadCount);

    return () => {
      socket.off('notification', handleNewNotification);
      socket.off('notification_unread_count', handleUnreadCount);
    };
  }, [user?._id, info]);

  // Mark single notification as read
  const markAsRead = useCallback(
    async (id: string) => {
      if (!accessToken) return;
      try {
        await employerApi.markNotificationAsRead(id, accessToken);
        setNotifications((prev) =>
          prev.map((n) => (n._id === id ? { ...n, isRead: true } : n)),
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch {
        // Ignore mark error
      }
    },
    [accessToken],
  );

  // Mark all notifications as read
  const markAllAsRead = useCallback(async () => {
    if (!accessToken) return;
    try {
      await employerApi.markAllNotificationsAsRead(accessToken);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      // Ignore mark all error
    }
  }, [accessToken]);

  const contextValue = useMemo(
    () => ({
      unreadCount,
      notifications,
      loading,
      loadingMore,
      hasMore,
      currentPage,
      totalPages,
      fetchNotifications,
      loadMoreNotifications,
      fetchUnreadCount,
      markAsRead,
      markAllAsRead,
    }),
    [
      unreadCount,
      notifications,
      loading,
      loadingMore,
      hasMore,
      currentPage,
      totalPages,
      fetchNotifications,
      loadMoreNotifications,
      fetchUnreadCount,
      markAsRead,
      markAllAsRead,
    ],
  );

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error(
      'useNotification must be used within a NotificationProvider',
    );
  }
  return context;
}
