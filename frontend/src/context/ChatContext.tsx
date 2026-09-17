import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useToast } from './ToastContext';
import { getChatSocket } from '../lib/socket';
import { chatApi } from '../lib/chatApi';

interface ChatContextType {
  unreadCount: number;
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  fetchUnreadCount: () => Promise<void>;
  decrementUnreadCount: (amount?: number) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user, accessToken } = useAuth();
  const { info } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const activeConvRef = useRef<string | null>(null);

  useEffect(() => {
    activeConvRef.current = activeConversationId;
  }, [activeConversationId]);

  const fetchUnreadCount = useCallback(async () => {
    if (!accessToken || !user?._id) {
      setUnreadCount(0);
      return;
    }
    try {
      const count = await chatApi.getUnreadCount(accessToken);
      setUnreadCount(count);
    } catch {
      // Ignore count fetch errors
    }
  }, [accessToken, user?._id]);

  const decrementUnreadCount = useCallback((amount = 1) => {
    setUnreadCount((prev) => Math.max(0, prev - amount));
  }, []);

  useEffect(() => {
    if (user?._id && accessToken) {
      void fetchUnreadCount();
    } else {
      setUnreadCount(0);
    }
  }, [user?._id, accessToken, fetchUnreadCount]);

  // Realtime Socket listener for incoming chat notifications
  useEffect(() => {
    if (!user?._id) return;

    const socket = getChatSocket(user._id);

    const handleChatNotification = (data: any) => {
      if (!data) return;

      const isOnMessagesPage =
        location.pathname.startsWith('/messages') ||
        window.location.pathname.startsWith('/messages');

      // Nếu người dùng đã ở trang nhắn tin (/messages), hoàn toàn không popup toast nữa
      if (isOnMessagesPage) {
        return;
      }

      setUnreadCount((prev) => prev + 1);

      // Trigger interactive toast alert with direct navigation
      info(
        `💬 ${data.senderName || 'Tin nhắn mới'}`,
        data.content || 'Bạn nhận được một tin nhắn mới.',
        () => {
          if (data.conversationId) {
            navigate(`/messages?conversationId=${data.conversationId}`);
          } else {
            navigate('/messages');
          }
        },
      );
    };

    const handleUnreadCountUpdate = (data: { count: number }) => {
      if (typeof data?.count === 'number') {
        setUnreadCount(data.count);
      }
    };

    socket.on('chat:notification', handleChatNotification);
    socket.on('chat:unread_count', handleUnreadCountUpdate);

    return () => {
      socket.off('chat:notification', handleChatNotification);
      socket.off('chat:unread_count', handleUnreadCountUpdate);
    };
  }, [user?._id, info]);

  return (
    <ChatContext.Provider
      value={{
        unreadCount,
        activeConversationId,
        setActiveConversationId,
        fetchUnreadCount,
        decrementUnreadCount,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}
