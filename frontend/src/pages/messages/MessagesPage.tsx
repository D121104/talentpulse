import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  MessageSquare,
  Search,
  Send,
  Paperclip,
  Smile,
  Check,
  CheckCheck,
  Building2,
  UserRound,
  ArrowLeft,
  Sparkles,
  Loader2,
  FileText,
  Download,
  X,
  ExternalLink,
  RefreshCw,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useChat } from '../../context/ChatContext';
import {
  chatApi,
  type ConversationItem,
  type ChatMessageItem,
  type AppliedPartnerItem,
} from '../../lib/chatApi';
import { getChatSocket } from '../../lib/socket';
import { formatDate } from '../../lib/dateUtils';

const QUICK_EMOJIS = ['👍', '❤️', '😊', '👋', '🙏', '🚀', '💼', '💯', '✨', '😂', '😮', '👏'];

export default function MessagesPage() {
  const { user, accessToken } = useAuth();
  const { error: toastError, success: toastSuccess } = useToast();
  const { setActiveConversationId, decrementUnreadCount } = useChat();
  const [searchParams, setSearchParams] = useSearchParams();

  // State
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConversation, setActiveConversation] = useState<ConversationItem | null>(null);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [appliedPartners, setAppliedPartners] = useState<AppliedPartnerItem[]>([]);

  // Loading states
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingApplied, setIsLoadingApplied] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Search queries
  const [searchConvQuery, setSearchConvQuery] = useState('');

  // Input state
  const [inputText, setInputText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<{ url: string; name: string; size: number; isImg: boolean } | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Partner typing state
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mobile layout panel view: 'list' | 'chat' | 'applied'
  const [mobileView, setMobileView] = useState<'list' | 'chat' | 'applied'>('list');

  // Lightbox Image Preview Modal
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  const isHr = user?.role === 'HR';

  // 1. Scroll to bottom of message container without affecting window scroll
  const scrollToBottom = useCallback((smooth = true) => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      });
    }
  }, []);

  // Guard set to prevent redundant mark-as-read network calls
  const readRequestedConvsRef = useRef<Set<string>>(new Set());
  const lastProcessedUrlConvIdRef = useRef<string | null>(null);

  // 2. Helper to immediately mark conversation as read in UI & Backend
  const markConversationAsRead = useCallback(
    async (convId: string) => {
      if (!convId || !accessToken) return;

      // 1. Reset unread count in conversations list
      setConversations((prev) => {
        let countToDecrement = 0;
        let changed = false;
        const updated = prev.map((c) => {
          if (String(c._id).toLowerCase() === String(convId).toLowerCase()) {
            if (c.unreadCount > 0) {
              countToDecrement = c.unreadCount;
              changed = true;
              return { ...c, unreadCount: 0 };
            }
          }
          return c;
        });
        if (countToDecrement > 0) {
          decrementUnreadCount(countToDecrement);
        }
        return changed ? updated : prev;
      });

      // 2. Reset in activeConversation state
      setActiveConversation((prev) => {
        if (!prev || String(prev._id).toLowerCase() !== String(convId).toLowerCase()) return prev;
        if (prev.unreadCount === 0) return prev;
        return { ...prev, unreadCount: 0 };
      });

      // 3. Inform backend ONLY once per read session to completely prevent infinite loops
      if (!readRequestedConvsRef.current.has(convId)) {
        readRequestedConvsRef.current.add(convId);
        try {
          await chatApi.markAsRead(convId, accessToken);
        } catch (err) {
          console.error('Failed to mark conversation as read on server', err);
        }
      }
    },
    [accessToken, decrementUnreadCount],
  );

  // 3. Fetch conversations
  const loadConversations = useCallback(
    async (selectId?: string) => {
      if (!accessToken) return;
      try {
        const list = await chatApi.getConversations(searchConvQuery, accessToken);
        setConversations(list);

        // Auto select conversation if requested by parameter
        if (selectId) {
          const found = list.find((c) => String(c._id).toLowerCase() === String(selectId).toLowerCase());
          if (found) {
            setActiveConversation({ ...found, unreadCount: 0 });
            setMobileView('chat');
            void markConversationAsRead(found._id);
          }
        }
      } catch (err: any) {
        console.error('Failed to load conversations', err);
      } finally {
        setIsLoadingConversations(false);
      }
    },
    [accessToken, searchConvQuery, markConversationAsRead],
  );

  // 4. Fetch applied partners (Applied companies or candidates)
  const loadAppliedPartners = useCallback(async () => {
    if (!accessToken) return;
    try {
      const list = await chatApi.getAppliedPartners('', accessToken);
      setAppliedPartners(list);
    } catch (err: any) {
      console.error('Failed to load applied partners', err);
    } finally {
      setIsLoadingApplied(false);
    }
  }, [accessToken]);

  // Initial load
  useEffect(() => {
    void loadConversations();
    void loadAppliedPartners();
  }, [loadConversations, loadAppliedPartners]);

  // React to URL query parameter conversationId changes (processed once per query change)
  const queryConversationId = searchParams.get('conversationId');
  useEffect(() => {
    if (!queryConversationId || !accessToken) return;
    if (lastProcessedUrlConvIdRef.current === queryConversationId) return;
    lastProcessedUrlConvIdRef.current = queryConversationId;

    let isMounted = true;
    chatApi
      .getConversationById(queryConversationId, accessToken)
      .then((conv) => {
        if (!isMounted || !conv?._id) return;
        setConversations((prev) => {
          if (prev.some((c) => String(c._id).toLowerCase() === String(conv._id).toLowerCase())) {
            return prev.map((c) =>
              String(c._id).toLowerCase() === String(conv._id).toLowerCase()
                ? { ...c, unreadCount: 0 }
                : c,
            );
          }
          return [{ ...conv, unreadCount: 0 }, ...prev];
        });
        setActiveConversation({ ...conv, unreadCount: 0 });
        setMobileView('chat');
        void markConversationAsRead(conv._id);
      })
      .catch((err) => {
        console.error('Failed to load target conversation from URL', err);
      });

    return () => {
      isMounted = false;
    };
  }, [queryConversationId, accessToken, markConversationAsRead]);

  // Sync active conversation with ChatContext
  useEffect(() => {
    setActiveConversationId(activeConversation?._id || null);
    return () => setActiveConversationId(null);
  }, [activeConversation?._id, setActiveConversationId]);

  // 4. Load messages when active conversation changes
  const activeConvId = activeConversation?._id;
  useEffect(() => {
    if (!activeConvId || !accessToken) {
      setMessages([]);
      return;
    }

    let isMounted = true;
    setIsLoadingMessages(true);

    const fetchMsgs = async () => {
      try {
        const { result } = await chatApi.getMessages(activeConvId, 1, 100, accessToken);
        if (isMounted) {
          setMessages(result);
          setTimeout(() => scrollToBottom(false), 50);

          // Mark as read whenever conversation messages are loaded
          void markConversationAsRead(activeConvId);
        }
      } catch (err: any) {
        if (isMounted) {
          toastError(err.message || 'Không thể tải tin nhắn');
        }
      } finally {
        if (isMounted) setIsLoadingMessages(false);
      }
    };

    void fetchMsgs();

    return () => {
      isMounted = false;
    };
  }, [activeConvId, accessToken, markConversationAsRead, scrollToBottom, toastError]);

  // Active conversation ref for resilient socket listeners without stale closures
  const activeConversationIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeConversationIdRef.current = activeConversation?._id || null;
  }, [activeConversation?._id]);

  // 5a. Join room for active conversation and auto re-join on reconnect
  useEffect(() => {
    if (!user?._id || !activeConversation?._id) return;
    const socket = getChatSocket(user._id);
    socket.emit('join_conversation', { conversationId: activeConversation._id });

    const handleReconnect = () => {
      socket.emit('join_conversation', { conversationId: activeConversation._id });
    };
    socket.on('connect', handleReconnect);

    return () => {
      socket.off('connect', handleReconnect);
      socket.emit('leave_conversation', { conversationId: activeConversation._id });
    };
  }, [user?._id, activeConversation?._id]);

  // 5b. Socket.io Realtime Listener for Chat Messages & Events (Stays mounted)
  useEffect(() => {
    if (!user?._id) return;
    const socket = getChatSocket(user._id);

    const handleNewMessage = (newMsg: ChatMessageItem) => {
      if (!newMsg || !newMsg.conversationId) return;

      const activeId = activeConversationIdRef.current;
      const isCurrentChat =
        Boolean(activeId) &&
        String(newMsg.conversationId).toLowerCase() === String(activeId).toLowerCase();
      const isMyMessage = user?._id
        ? String(newMsg.senderId) === String(user._id)
        : Boolean(newMsg.isMe);

      if (isCurrentChat) {
        setMessages((prev) => {
          if (prev.some((m) => m._id === newMsg._id)) return prev;
          return [...prev, { ...newMsg, isMe: isMyMessage }];
        });
        setTimeout(() => scrollToBottom(true), 60);

        // Mark read if we are in this room and it's not my message
        if (!isMyMessage && accessToken) {
          void chatApi.markAsRead(newMsg.conversationId, accessToken);
        }
      } else if (!isMyMessage) {
        // Clear read guard so user can mark read when opening this conversation later
        readRequestedConvsRef.current.delete(newMsg.conversationId);
      }

      // Update or prepend conversation in left list
      setConversations((prev) => {
        const exists = prev.some(
          (c) => String(c._id).toLowerCase() === String(newMsg.conversationId).toLowerCase(),
        );
        if (!exists) {
          // If conversation wasn't in the left list, fetch and prepend it!
          if (accessToken) {
            void chatApi.getConversationById(newMsg.conversationId, accessToken).then((c) => {
              if (c?._id) {
                setConversations((p) => {
                  if (p.some((x) => String(x._id).toLowerCase() === String(c._id).toLowerCase())) return p;
                  return [c, ...p];
                });
              }
            });
          }
          return prev;
        }

        return prev.map((c) =>
          String(c._id).toLowerCase() === String(newMsg.conversationId).toLowerCase()
            ? {
                ...c,
                lastMessageText:
                  newMsg.messageType === 'IMAGE'
                    ? '[Hình ảnh]'
                    : newMsg.messageType === 'FILE'
                    ? `[Tệp: ${newMsg.fileName || 'tệp'}]`
                    : newMsg.content,
                lastMessageAt: newMsg.createdAt,
                lastSenderId: newMsg.senderId,
                unreadCount: isCurrentChat
                  ? 0
                  : c.unreadCount + (isMyMessage ? 0 : 1),
              }
            : c,
        );
      });
    };

    const handleReadReceipt = (data: { conversationId: string; readByRole: string; readAt: string }) => {
      const activeId = activeConversationIdRef.current;
      if (
        activeId &&
        String(data.conversationId).toLowerCase() === String(activeId).toLowerCase()
      ) {
        setMessages((prev) =>
          prev.map((m) =>
            user?._id && String(m.senderId) === String(user._id)
              ? { ...m, isRead: true, readAt: data.readAt }
              : m,
          ),
        );
      }
    };

    const handleReaction = (data: { messageId: string; conversationId: string; reactions: any[] }) => {
      const activeId = activeConversationIdRef.current;
      if (
        activeId &&
        String(data.conversationId).toLowerCase() === String(activeId).toLowerCase()
      ) {
        setMessages((prev) =>
          prev.map((m) => (m._id === data.messageId ? { ...m, reactions: data.reactions } : m)),
        );
      }
    };

    const handleTyping = (data: { conversationId: string; isTyping: boolean; userName?: string }) => {
      const activeId = activeConversationIdRef.current;
      if (
        activeId &&
        String(data.conversationId).toLowerCase() === String(activeId).toLowerCase()
      ) {
        setIsPartnerTyping(data.isTyping);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        if (data.isTyping) {
          typingTimeoutRef.current = setTimeout(() => {
            setIsPartnerTyping(false);
          }, 3500);
        }
      }
    };

    socket.on('chat:new_message', handleNewMessage);
    socket.on('chat:read', handleReadReceipt);
    socket.on('chat:reaction', handleReaction);
    socket.on('chat:typing', handleTyping);

    return () => {
      socket.off('chat:new_message', handleNewMessage);
      socket.off('chat:read', handleReadReceipt);
      socket.off('chat:reaction', handleReaction);
      socket.off('chat:typing', handleTyping);
    };
  }, [user?._id, accessToken, scrollToBottom]);

  // 6. Handle Typing broadcast
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    if (activeConversation?._id) {
      void markConversationAsRead(activeConversation._id);
    }
    if (!user?._id || !activeConversation?._id) return;
    const socket = getChatSocket(user._id);
    socket.emit('typing', {
      conversationId: activeConversation._id,
      isTyping: e.target.value.trim().length > 0,
      userName: user.name,
      userId: user._id,
    });
  };

  // 7. Handle File Selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      toastError('Kích thước tệp không được vượt quá 15MB');
      return;
    }

    const isImg = file.type.startsWith('image/');
    setSelectedFile(file);
    setFilePreview({
      url: isImg ? URL.createObjectURL(file) : '',
      name: file.name,
      size: file.size,
      isImg,
    });
  };

  const removeSelectedFile = () => {
    if (filePreview?.url && filePreview.isImg) {
      URL.revokeObjectURL(filePreview.url);
    }
    setSelectedFile(null);
    setFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // 8. Handle Send Message
  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!inputText.trim() && !selectedFile) || !activeConversation || !accessToken || isSending) {
      return;
    }

    setIsSending(true);
    try {
      let content = inputText.trim();
      let messageType: 'TEXT' | 'IMAGE' | 'FILE' = 'TEXT';
      let fileName: string | undefined;
      let fileSize: number | undefined;

      // Upload attachment if any
      if (selectedFile) {
        setIsUploading(true);
        const uploaded = await chatApi.uploadAttachment(selectedFile, accessToken);
        content = uploaded.url;
        messageType = uploaded.fileType;
        fileName = uploaded.fileName;
        fileSize = uploaded.fileSize;
        setIsUploading(false);
      }

      const sentMsg = await chatApi.sendMessage(
        activeConversation._id,
        {
          content,
          messageType,
          fileName,
          fileSize,
        },
        accessToken,
      );

      if (sentMsg?._id) {
        setMessages((prev) => {
          if (prev.some((m) => m._id === sentMsg._id)) return prev;
          return [...prev, { ...sentMsg, isMe: true }];
        });
        setTimeout(() => scrollToBottom(true), 50);

        setConversations((prev) =>
          prev.map((c) =>
            String(c._id).toLowerCase() === String(activeConversation._id).toLowerCase()
              ? {
                  ...c,
                  lastMessageText:
                    sentMsg.messageType === 'IMAGE'
                      ? '[Hình ảnh]'
                      : sentMsg.messageType === 'FILE'
                      ? `[Tệp: ${sentMsg.fileName || 'tệp'}]`
                      : sentMsg.content,
                  lastMessageAt: sentMsg.createdAt,
                  lastSenderId: user?._id || sentMsg.senderId,
                  unreadCount: 0,
                }
              : c,
          ),
        );
      }

      setInputText('');
      removeSelectedFile();
      setShowEmojiPicker(false);
      chatInputRef.current?.focus();

      // Reset typing indicator
      if (user?._id) {
        const socket = getChatSocket(user._id);
        socket.emit('typing', {
          conversationId: activeConversation._id,
          isTyping: false,
        });
      }
    } catch (err: any) {
      toastError(err.message || 'Gửi tin nhắn thất bại');
    } finally {
      setIsSending(false);
      setIsUploading(false);
    }
  };

  // 9. Quick Start Conversation from Right Sidebar
  const handleStartChatWithPartner = async (partner: AppliedPartnerItem) => {
    if (!accessToken) return;
    try {
      const conv = await chatApi.startConversation(
        {
          companyId: partner.companyId,
          candidateId: partner.candidateId,
        },
        accessToken,
      );

      // Add or update in list
      setConversations((prev) => {
        const exists = prev.some((c) => c._id === conv._id);
        return exists ? prev : [conv, ...prev];
      });

      setActiveConversation(conv);
      setSearchParams({ conversationId: conv._id });
      setMobileView('chat');
      toastSuccess(`Đã mở cuộc trò chuyện với ${conv.partner.name}`);
    } catch (err: any) {
      toastError(err.message || 'Không thể mở cuộc trò chuyện.');
    }
  };

  // 10. Handle Add Reaction
  const handleReaction = async (messageId: string, emoji: string) => {
    if (!accessToken) return;
    try {
      await chatApi.addReaction(messageId, emoji, accessToken);
    } catch (err: any) {
      toastError(err.message || 'Không thể thả biểu cảm');
    }
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-slate-950 font-sans overflow-hidden text-slate-900 dark:text-slate-100">
      {/* ========================================================================= */}
      {/* COLUMN 1 (LEFT): BRAND, SEARCH, PROMO BANNER & CONVERSATIONS LIST        */}
      {/* ========================================================================= */}
      <aside
        className={`w-full sm:w-80 md:w-96 flex-col border-r border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 sm:flex shrink-0 ${
          mobileView === 'list' ? 'flex' : 'hidden sm:flex'
        }`}
      >
        {/* Top Header of Column 1 (h-16 baseline aligned) */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200/80 px-4 bg-white dark:border-slate-800 dark:bg-slate-900 z-10">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-primary to-blue-500 text-white shadow-sm shadow-primary/30">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-black tracking-tight text-slate-900 dark:text-white">
                TalentPulse <span className="text-primary dark:text-primary-light">Connect</span>
              </span>
              <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-primary dark:bg-blue-950/80 dark:text-blue-300 border border-blue-200 dark:border-blue-900/50">
                Beta
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Link
              to="/"
              className="group flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition"
              title="Về trang chủ"
            >
              <ArrowLeft className="h-3.5 w-3.5 transition group-hover:-translate-x-0.5" />
              <span className="hidden md:inline">Trang chủ</span>
            </Link>
            <button
              type="button"
              onClick={() => {
                void loadConversations();
                void loadAppliedPartners();
              }}
              className="p-1.5 text-slate-400 hover:text-primary rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              title="Làm mới dữ liệu"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Search Box */}
        <div className="p-3 border-b border-slate-100 dark:border-slate-800/60">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchConvQuery}
              onChange={(e) => setSearchConvQuery(e.target.value)}
              placeholder={isHr ? 'Tìm tên ứng viên đã nộp...' : 'Tìm tên công ty, nhà tuyển dụng...'}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/80 pl-8 pr-7 py-2 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:border-primary focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/60 dark:text-white dark:focus:bg-slate-800 transition"
            />
            {searchConvQuery && (
              <button
                type="button"
                onClick={() => setSearchConvQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Promo Banner (Image 1 & 2 inspired) */}
        <div className="p-3 border-b border-slate-100 dark:border-slate-800/60">
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-blue-800 p-3.5 text-white shadow-md shadow-blue-500/10">
            <div className="relative z-10">
              <span className="inline-flex items-center gap-1 rounded-md bg-white/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide backdrop-blur-xs">
                <Sparkles className="h-2.5 w-2.5 text-amber-300" />
                Kết nối trực tiếp
              </span>
              <h4 className="mt-1 text-xs font-black leading-tight text-white">
                {isHr ? 'Trò chuyện 1-1 cùng Ứng viên tiềm năng' : 'Kết nối sâu hơn cùng Doanh nghiệp'}
              </h4>
              <p className="mt-0.5 text-[10px] text-blue-100 leading-snug">
                Trao đổi phỏng vấn & giải đáp nhanh thắc mắc về hồ sơ nộp
              </p>
            </div>
            <div className="absolute -right-3 -bottom-4 h-16 w-16 rounded-full bg-white/10 blur-sm pointer-events-none" />
          </div>
        </div>

        {/* Mobile View Switcher Tabs (Only visible on small mobile screens) */}
        <div className="flex sm:hidden items-center justify-around border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-1.5 text-xs">
          <button
            type="button"
            onClick={() => setMobileView('list')}
            className={`rounded-lg px-3 py-1 font-bold ${mobileView === 'list' ? 'bg-white text-primary shadow-xs dark:bg-slate-800 dark:text-white' : 'text-slate-500'}`}
          >
            Hội thoại ({conversations.length})
          </button>
          <button
            type="button"
            onClick={() => setMobileView('applied')}
            className={`rounded-lg px-3 py-1 font-bold ${mobileView === 'applied' ? 'bg-white text-primary shadow-xs dark:bg-slate-800 dark:text-white' : 'text-slate-500'}`}
          >
            {isHr ? 'Ứng viên' : 'Đã ứng tuyển'} ({appliedPartners.length})
          </button>
        </div>

        {/* Conversations Scrollable List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
          {isLoadingConversations ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin text-primary mb-2" />
              <span className="text-xs">Đang tải cuộc trò chuyện...</span>
            </div>
          ) : conversations.length > 0 ? (
            conversations.map((conv) => {
              const isActive =
                Boolean(activeConversation?._id) &&
                String(activeConversation?._id).toLowerCase() === String(conv._id).toLowerCase();
              return (
                <button
                  key={conv._id}
                  type="button"
                  onClick={() => {
                    setActiveConversation({ ...conv, unreadCount: 0 });
                    setSearchParams({ conversationId: conv._id });
                    setMobileView('chat');
                    void markConversationAsRead(conv._id);
                  }}
                  className={`w-full flex items-center gap-3 p-3.5 text-left transition-all cursor-pointer ${
                    isActive
                      ? 'bg-primary/5 dark:bg-primary/10 border-l-4 border-primary'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  {/* Avatar - Clean, no fake online dot */}
                  <div className="relative shrink-0">
                    <div className="h-11 w-11 rounded-2xl bg-white border border-slate-200 dark:border-slate-700 dark:bg-slate-800 overflow-hidden flex items-center justify-center shadow-xs">
                      {conv.partner.avatar ? (
                        <img
                          src={conv.partner.avatar}
                          alt={conv.partner.name}
                          className="h-full w-full object-cover"
                        />
                      ) : isHr ? (
                        <UserRound className="h-5 w-5 text-slate-400" />
                      ) : (
                        <Building2 className="h-5 w-5 text-primary" />
                      )}
                    </div>
                  </div>

                  {/* Meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <h4
                        className={`truncate text-xs font-bold ${
                          isActive
                            ? 'text-primary dark:text-primary-light'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {conv.partner.name}
                      </h4>
                      {conv.lastMessageAt && (
                        <span className="shrink-0 text-[10px] text-slate-400 font-medium">
                          {formatDate(conv.lastMessageAt)}
                        </span>
                      )}
                    </div>

                    <p className="truncate text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {conv.partner.subtitle && (
                        <span className="font-semibold text-slate-600 dark:text-slate-300">
                          {conv.partner.subtitle} &bull;{' '}
                        </span>
                      )}
                      {conv.lastMessageText || 'Hãy bắt đầu cuộc trò chuyện 👋'}
                    </p>
                  </div>

                  {/* Unread Badge (Only show if not active conversation) */}
                  {conv.unreadCount > 0 && !isActive && (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-500 text-[10px] font-black text-white shadow-xs animate-pulse">
                      {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                    </span>
                  )}
                </button>
              );
            })
          ) : (
            /* Empty state (Image 1 style) */
            <div className="flex flex-col items-center justify-center p-8 text-center h-64">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 mb-3">
                <MessageSquare className="h-8 w-8 text-slate-300 dark:text-slate-600" />
              </div>
              <h5 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Bạn chưa có cuộc trò chuyện nào
              </h5>
              <p className="text-[11px] text-slate-400 mt-1 max-w-[200px]">
                {isHr
                  ? 'Chọn ứng viên đã nộp hồ sơ ở cột bên phải để bắt đầu trao đổi.'
                  : 'Chọn tin tuyển dụng đã ứng tuyển ở cột bên phải để nhắn tin cho HR.'}
              </p>
            </div>
          )}
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* COLUMN 2 (CENTER): CHAT STREAM & MESSAGES                                 */}
      {/* ========================================================================= */}
      <main
        className={`flex-1 flex flex-col bg-white dark:bg-slate-900 sm:flex min-w-0 ${
          mobileView === 'chat' ? 'flex' : 'hidden sm:flex'
        }`}
      >
        {/* Chat Room Header (h-16 baseline aligned) */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200/80 bg-white px-4 sm:px-6 dark:border-slate-800 dark:bg-slate-900 z-10">
          {activeConversation ? (
            <>
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setMobileView('list')}
                  className="sm:hidden p-1.5 rounded-xl hover:bg-slate-100 text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>

                {/* Avatar - Clean, no fake online dot */}
                <div className="h-10 w-10 rounded-xl bg-slate-100 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 overflow-hidden flex items-center justify-center shrink-0">
                  {activeConversation.partner.avatar ? (
                    <img
                      src={activeConversation.partner.avatar}
                      alt={activeConversation.partner.name}
                      className="h-full w-full object-cover"
                    />
                  ) : isHr ? (
                    <UserRound className="h-5 w-5 text-slate-400" />
                  ) : (
                    <Building2 className="h-5 w-5 text-primary" />
                  )}
                </div>

                {/* Partner Name & Subtitle - NO fake online tag */}
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span className="truncate">{activeConversation.partner.name}</span>
                    <ShieldCheck className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                  </h3>
                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    {activeConversation.partner.subtitle || (isHr ? 'Ứng viên đã nộp hồ sơ' : 'Phòng nhân sự')}
                  </p>
                </div>
              </div>

              {/* Header Action: View Profile / Job */}
              <div className="flex items-center gap-2 shrink-0">
                {!isHr && activeConversation.companyId && (
                  <Link
                    to={`/companies/${activeConversation.companyId}`}
                    target="_blank"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition cursor-pointer"
                  >
                    <span>Xem công ty</span>
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => setMobileView('applied')}
                  className="sm:hidden p-1.5 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  title="Xem danh sách"
                >
                  <FileText className="h-4 w-4" />
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  TalentPulse Connect:
                </span>
                <span className="text-xs text-primary dark:text-primary-light font-semibold hidden sm:inline">
                  New way to follow your chance. More engage, more success.
                </span>
              </div>
              <div className="text-[11px] text-slate-400 font-medium hidden md:block">
                Hệ thống trò chuyện bảo mật 1-1
              </div>
            </div>
          )}
        </div>

        {/* Message Stream Area */}
        {activeConversation ? (
          <>
            <div
              ref={messagesContainerRef}
              onClick={() => {
                if (activeConversation?._id) void markConversationAsRead(activeConversation._id);
              }}
              className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-gradient-to-b from-slate-50/60 to-white dark:from-slate-950/40 dark:to-slate-900"
            >
              {/* Welcoming Top Card (Image 2 style) */}
              <div className="flex flex-col items-center justify-center p-6 text-center border-b border-dashed border-slate-200 dark:border-slate-800 mb-6">
                <div className="h-16 w-16 rounded-2xl bg-white border border-slate-200 p-2 dark:border-slate-700 dark:bg-slate-800 shadow-sm mb-3 flex items-center justify-center overflow-hidden">
                  {activeConversation.partner.avatar ? (
                    <img
                      src={activeConversation.partner.avatar}
                      alt="Avatar"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <Building2 className="h-8 w-8 text-primary" />
                  )}
                </div>
                <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  {activeConversation.partner.name}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {activeConversation.partner.subtitle || (isHr ? 'Ứng viên đã nộp hồ sơ' : 'Phòng nhân sự doanh nghiệp')}
                </p>
                <p className="mt-2 text-xs font-medium text-primary dark:text-primary-light">
                  Hãy bắt đầu cuộc trò chuyện bằng một lời chào 👋
                </p>
              </div>

              {/* Messages List */}
              {isLoadingMessages ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : messages.length > 0 ? (
                messages.map((msg, index) => {
                  const isMe = user?._id
                    ? String(msg.senderId) === String(user._id)
                    : Boolean(msg.isMe);
                  const showAvatar =
                    !isMe &&
                    (index === messages.length - 1 ||
                      messages[index + 1]?.senderId !== msg.senderId);

                  return (
                    <div
                      key={msg._id}
                      className={`flex items-end gap-2 group ${
                        isMe ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      {/* Partner Avatar on left */}
                      {!isMe && (
                        <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 mb-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                          {showAvatar ? (
                            activeConversation.partner.avatar ? (
                              <img
                                src={activeConversation.partner.avatar}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-primary">
                                {activeConversation.partner.name.charAt(0)}
                              </div>
                            )
                          ) : (
                            <div className="w-8 h-8" />
                          )}
                        </div>
                      )}

                      {/* Message Bubble Container */}
                      <div
                        className={`flex flex-col max-w-[78%] sm:max-w-[65%] space-y-1 ${
                          isMe ? 'items-end' : 'items-start'
                        }`}
                      >
                        {/* Bubble */}
                        <div className="relative group/bubble">
                          {msg.messageType === 'IMAGE' ? (
                            <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm cursor-pointer">
                              <img
                                src={msg.content}
                                alt="Đính kèm"
                                onClick={() => setPreviewImageUrl(msg.content)}
                                className="max-h-72 w-auto object-cover hover:opacity-95 transition"
                              />
                            </div>
                          ) : msg.messageType === 'FILE' ? (
                            <a
                              href={msg.content}
                              target="_blank"
                              rel="noreferrer"
                              download={msg.fileName || 'tai-ve'}
                              className={`flex items-center gap-3 p-3 rounded-2xl transition shadow-xs ${
                                isMe
                                  ? 'bg-primary text-white hover:bg-primary-dark'
                                  : 'bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white'
                              }`}
                            >
                              <div
                                className={`p-2 rounded-xl ${
                                  isMe
                                    ? 'bg-white/20 text-white'
                                    : 'bg-primary/10 text-primary'
                                }`}
                              >
                                <FileText className="h-5 w-5" />
                              </div>
                              <div className="min-w-0 pr-2">
                                <p className="truncate text-xs font-bold">{msg.fileName || 'Tệp đính kèm'}</p>
                                {msg.fileSize && (
                                  <span className="text-[10px] opacity-80">
                                    {(msg.fileSize / (1024 * 1024)).toFixed(2)} MB
                                  </span>
                                )}
                              </div>
                              <Download className="h-4 w-4 shrink-0 opacity-70" />
                            </a>
                          ) : (
                            <div
                              className={`rounded-2xl px-4 py-2.5 text-xs sm:text-sm leading-relaxed shadow-xs break-words ${
                                isMe
                                  ? 'bg-primary text-white rounded-br-xs'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-bl-xs border border-slate-200/60 dark:border-slate-700/60'
                              }`}
                            >
                              {msg.content}
                            </div>
                          )}

                          {/* Quick Emoji Reaction hover popup */}
                          <div
                            className={`absolute top-1/2 -translate-y-1/2 hidden group-hover/bubble:flex items-center gap-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 shadow-md z-10 ${
                              isMe ? '-left-28' : '-right-28'
                            }`}
                          >
                            {['👍', '❤️', '😂', '😮', '🙏'].map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => handleReaction(msg._id, emoji)}
                                className="h-6 w-6 hover:scale-125 transition-transform flex items-center justify-center text-xs cursor-pointer"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Reactions Pill Display on Bubble */}
                        {msg.reactions && msg.reactions.length > 0 && (
                          <div className="flex items-center gap-1 pl-1 flex-wrap">
                            {msg.reactions.map((r, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-0.5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 text-[10px] font-bold shadow-xs"
                                title={`${r.userName || 'Người dùng'} đã thả ${r.emoji}`}
                              >
                                <span>{r.emoji}</span>
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Read status & Time for my messages */}
                        <div
                          className={`flex items-center gap-1 text-[10px] text-slate-400 ${
                            isMe ? 'justify-end pr-1' : 'justify-start pl-1'
                          }`}
                        >
                          <span>{formatDate(msg.createdAt)}</span>
                          {isMe && (
                            <span>
                              {msg.isRead ? (
                                <span className="flex items-center gap-0.5 text-blue-500 font-bold">
                                  <CheckCheck className="h-3 w-3" />
                                  <span>Đã xem</span>
                                </span>
                              ) : (
                                <span className="flex items-center gap-0.5">
                                  <Check className="h-3 w-3" />
                                  <span>Đã gửi</span>
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : null}

              {/* Partner Typing Indicator */}
              {isPartnerTyping && (
                <div className="flex items-center gap-2 text-xs text-slate-400 pl-8 animate-pulse">
                  <span className="flex gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" />
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0.2s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0.4s]" />
                  </span>
                  <span>{activeConversation.partner.name} đang nhập tin nhắn...</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Selected File / Image Attachment Preview Bar */}
            {filePreview && (
              <div className="flex items-center justify-between gap-3 px-4 py-2 bg-blue-50/80 dark:bg-blue-950/30 border-t border-blue-100 dark:border-blue-900/40 text-xs text-blue-900 dark:text-blue-300">
                <div className="flex items-center gap-2 min-w-0">
                  {filePreview.isImg ? (
                    <img
                      src={filePreview.url}
                      alt="Preview"
                      className="h-9 w-9 rounded-lg object-cover border border-blue-200 shrink-0"
                    />
                  ) : (
                    <FileText className="h-5 w-5 text-blue-600 shrink-0" />
                  )}
                  <div className="min-w-0 truncate">
                    <span className="font-bold block truncate">{filePreview.name}</span>
                    <span className="text-[10px] opacity-75">
                      {(filePreview.size / 1024).toFixed(1)} KB
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={removeSelectedFile}
                  className="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-white dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Emoji Picker Tray */}
            {showEmojiPicker && (
              <div className="px-4 py-2 bg-white dark:bg-slate-800 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 overflow-x-auto">
                <span className="text-xs text-slate-400 shrink-0 font-medium">Biểu cảm:</span>
                {QUICK_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      setInputText((prev) => prev + emoji);
                      setShowEmojiPicker(false);
                      chatInputRef.current?.focus();
                    }}
                    className="h-8 w-8 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg flex items-center justify-center text-sm transition cursor-pointer"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}

            {/* Bottom Input Area (Messenger / Image 2 style) */}
            <div className="p-3 sm:p-4 bg-white dark:bg-slate-900 border-t border-slate-200/80 dark:border-slate-800">
              <form onSubmit={handleSendMessage} className="flex items-center gap-2 max-w-4xl mx-auto">
                {/* File Upload Trigger */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,.zip,.rar"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSending || isUploading}
                  className="p-2.5 rounded-xl text-slate-500 hover:text-primary hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0 disabled:opacity-50"
                  title="Đính kèm tệp tin hoặc ảnh"
                >
                  <Paperclip className="h-5 w-5" />
                </button>

                {/* Emoji Button */}
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker((prev) => !prev)}
                  className="p-2.5 rounded-xl text-slate-500 hover:text-primary hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
                  title="Chọn biểu cảm icon"
                >
                  <Smile className="h-5 w-5" />
                </button>

                {/* Auto-growing Text Input */}
                <div className="flex-1 relative">
                  <textarea
                    ref={chatInputRef}
                    value={inputText}
                    onChange={handleInputChange}
                    onFocus={() => {
                      if (activeConversation?._id) {
                        void markConversationAsRead(activeConversation._id);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void handleSendMessage();
                      }
                    }}
                    rows={1}
                    placeholder="Nhập tin nhắn... (Nhấn Enter để gửi)"
                    className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-800 transition max-h-32"
                  />
                </div>

                {/* Send Button */}
                <button
                  type="submit"
                  disabled={(!inputText.trim() && !selectedFile) || isSending || isUploading}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-white shadow-md shadow-primary/25 hover:bg-primary-dark transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer active:scale-95"
                  title="Gửi tin nhắn"
                >
                  {isSending || isUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </form>
            </div>
          </>
        ) : (
          /* Empty State when no conversation selected */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/50 dark:bg-slate-950/20">
            <div className="h-20 w-20 rounded-3xl bg-primary/10 text-primary flex items-center justify-center shadow-inner mb-4">
              <MessageSquare className="h-10 w-10" />
            </div>
            <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
              Chào mừng bạn đến với TalentPulse Connect!
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1.5 max-w-md leading-relaxed">
              {isHr
                ? 'Hãy chọn một cuộc hội thoại từ danh sách bên trái hoặc bấm "Nhắn tin" với ứng viên đã nộp hồ sơ ở cột bên phải để bắt đầu trao đổi.'
                : 'Hãy chọn một cuộc trò chuyện từ danh sách hoặc nhắn tin trực tiếp với các doanh nghiệp bạn đã nộp hồ sơ ở cột bên phải.'}
            </p>
            <div className="mt-6 flex items-center gap-2 text-xs text-slate-400">
              <ShieldCheck className="h-4 w-4 text-blue-500" />
              <span>Bảo mật 100% &bull; Trò chuyện thời gian thực</span>
            </div>
          </div>
        )}
      </main>

      {/* ========================================================================= */}
      {/* COLUMN 3 (RIGHT): APPLIED JOBS / APPLIED CANDIDATES LIST                  */}
      {/* ========================================================================= */}
      <aside
        className={`w-full sm:w-80 md:w-88 flex-col border-l border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 sm:flex shrink-0 ${
          mobileView === 'applied' ? 'flex' : 'hidden lg:flex'
        }`}
      >
        {/* Column 3 Header (h-16 baseline aligned) */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200/80 px-4 bg-white dark:border-slate-800 dark:bg-slate-900 z-10">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setMobileView('list')}
              className="sm:hidden p-1.5 rounded-xl hover:bg-slate-100 text-slate-600 dark:text-slate-300 mr-1 cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white truncate">
              {isHr ? 'Ứng viên đã nộp hồ sơ' : 'Tin tuyển dụng đã ứng tuyển'}
            </h4>
            <span className="rounded-full bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light px-2 py-0.5 text-[10px] font-bold shrink-0">
              {appliedPartners.length}
            </span>
          </div>

          <button
            type="button"
            onClick={() => void loadAppliedPartners()}
            className="p-1.5 text-slate-400 hover:text-primary rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
            title="Làm mới danh sách"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* List of Applied Partners */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 p-2 space-y-1">
          {isLoadingApplied ? (
            <div className="flex items-center justify-center p-8 text-center text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin text-primary mb-1" />
            </div>
          ) : appliedPartners.length > 0 ? (
            appliedPartners.map((item, index) => {
              const partnerName = isHr ? item.candidateName : item.companyName;
              const partnerAvatar = isHr ? item.candidateAvatar : item.companyLogo;

              return (
                <div
                  key={index}
                  className="p-3 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-xl bg-slate-100 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center">
                      {partnerAvatar ? (
                        <img
                          src={partnerAvatar}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : isHr ? (
                        <UserRound className="h-5 w-5 text-slate-400" />
                      ) : (
                        <Building2 className="h-5 w-5 text-primary" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <h5 className="truncate text-xs font-bold text-slate-900 dark:text-white">
                        {item.jobTitle}
                      </h5>
                      <p className="truncate text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {partnerName}
                      </p>
                      <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 mt-0.5">
                        <Clock className="h-2.5 w-2.5" />
                        <span>{formatDate(item.appliedAt)}</span>
                      </span>
                    </div>
                  </div>

                  {/* Quick Chat Button (Image 1 & 2 button style) */}
                  <button
                    type="button"
                    onClick={() => handleStartChatWithPartner(item)}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 hover:bg-primary text-primary hover:text-white px-3 py-1 text-xs font-bold transition shadow-xs cursor-pointer active:scale-95 shrink-0"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span>Nhắn tin</span>
                  </button>
                </div>
              );
            })
          ) : (
            <div className="py-12 text-center text-xs text-slate-400 p-4">
              {isHr
                ? 'Chưa có ứng viên nào nộp hồ sơ vào công ty của bạn.'
                : 'Bạn chưa nộp hồ sơ vào công việc nào. Hãy nộp CV trước khi bắt đầu trò chuyện với HR.'}
            </div>
          )}
        </div>
      </aside>

      {/* 3. LIGHTBOX IMAGE PREVIEW MODAL */}
      {previewImageUrl && (
        <div
          onClick={() => setPreviewImageUrl(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 cursor-pointer"
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <button
              type="button"
              onClick={() => setPreviewImageUrl(null)}
              className="absolute -top-10 right-0 p-2 text-white hover:text-rose-400 transition cursor-pointer"
            >
              <X className="h-6 w-6" />
            </button>
            <img
              src={previewImageUrl}
              alt="Ảnh đính kèm"
              className="max-h-[85vh] w-auto rounded-2xl object-contain shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}
