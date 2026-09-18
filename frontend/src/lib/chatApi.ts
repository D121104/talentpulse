import { apiRequest } from './api';

const API_BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1').replace(/\/$/, '');

export interface ConversationPartner {
  _id: string;
  name: string;
  avatar: string | null;
  role: 'COMPANY' | 'CANDIDATE';
  subtitle?: string;
}

export interface ConversationItem {
  _id: string;
  candidateId: string;
  companyId: string;
  partner: ConversationPartner;
  lastMessageText: string | null;
  lastMessageAt: string | null;
  lastSenderId: string | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatReaction {
  userId: string;
  emoji: string;
  userName?: string;
  createdAt?: string;
}

export interface ChatMessageItem {
  _id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string | null;
  senderRole: 'CANDIDATE' | 'HR';
  messageType: 'TEXT' | 'IMAGE' | 'FILE';
  content: string;
  fileName?: string;
  fileSize?: number;
  isRead: boolean;
  readAt?: string;
  reactions: ChatReaction[];
  isMe: boolean;
  createdAt: string;
}

export interface AppliedPartnerItem {
  companyId?: string;
  companyName?: string;
  companyLogo?: string;
  companyAddress?: string;
  candidateId?: string;
  candidateName?: string;
  candidateAvatar?: string;
  candidateEmail?: string;
  jobTitle: string;
  applicationStatus: string;
  appliedAt: string;
  hasConversation: boolean;
  conversationId?: string | null;
}

export const chatApi = {
  // 1. Get all conversations of current user
  async getConversations(search?: string, token?: string): Promise<ConversationItem[]> {
    const query = search ? `?search=${encodeURIComponent(search.trim())}` : '';
    const res = await apiRequest<any>(`/chat/conversations${query}`, {
      method: 'GET',
      accessToken: token,
    });
    return Array.isArray(res) ? res : res?.data || [];
  },

  // 2. Get single conversation detail
  async getConversationById(id: string, token?: string): Promise<ConversationItem> {
    const res = await apiRequest<any>(`/chat/conversations/${id}`, {
      method: 'GET',
      accessToken: token,
    });
    return res?.data || res;
  },

  // 3. Start or get existing conversation
  async startConversation(
    dto: { companyId?: string; candidateId?: string },
    token?: string,
  ): Promise<ConversationItem> {
    const res = await apiRequest<any>('/chat/conversations', {
      method: 'POST',
      body: dto,
      accessToken: token,
    });
    return res?.data || res;
  },

  // 4. Get messages of a conversation
  async getMessages(
    conversationId: string,
    page = 1,
    limit = 50,
    token?: string,
  ): Promise<{ result: ChatMessageItem[]; meta: any }> {
    const res = await apiRequest<any>(
      `/chat/conversations/${conversationId}/messages?page=${page}&limit=${limit}`,
      {
        method: 'GET',
        accessToken: token,
      },
    );
    const list = Array.isArray(res?.result)
      ? res.result
      : Array.isArray(res?.data?.result)
      ? res.data.result
      : Array.isArray(res)
      ? res
      : [];
    const meta = res?.meta || res?.data?.meta || {};
    return { result: list, meta };
  },

  // 5. Send message
  async sendMessage(
    conversationId: string,
    payload: {
      content: string;
      messageType?: 'TEXT' | 'IMAGE' | 'FILE';
      fileName?: string;
      fileSize?: number;
    },
    token?: string,
  ): Promise<ChatMessageItem> {
    const res = await apiRequest<any>(`/chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: payload,
      accessToken: token,
    });
    return res?.data || res;
  },

  // 6. Mark conversation as read
  async markAsRead(conversationId: string, token?: string): Promise<{ success: boolean }> {
    const res = await apiRequest<any>(`/chat/conversations/${conversationId}/read`, {
      method: 'PUT',
      accessToken: token,
    });
    return res?.data || res;
  },

  // 7. Add reaction
  async addReaction(
    messageId: string,
    emoji: string,
    token?: string,
  ): Promise<{ messageId: string; conversationId: string; reactions: ChatReaction[] }> {
    const res = await apiRequest<any>(`/chat/messages/${messageId}/reaction`, {
      method: 'POST',
      body: { emoji },
      accessToken: token,
    });
    return res?.data || res;
  },

  // 8. Get applied partners
  async getAppliedPartners(search?: string, token?: string): Promise<AppliedPartnerItem[]> {
    const query = search ? `?search=${encodeURIComponent(search.trim())}` : '';
    const res = await apiRequest<any>(`/chat/applied-partners${query}`, {
      method: 'GET',
      accessToken: token,
    });
    return Array.isArray(res) ? res : res?.data || [];
  },

  // 9. Get total unread messages count
  async getUnreadCount(token?: string): Promise<number> {
    try {
      const res = await apiRequest<any>('/chat/unread-count', {
        method: 'GET',
        accessToken: token,
      });
      return Number(res?.count ?? res?.data?.count ?? 0);
    } catch {
      return 0;
    }
  },

  // 10. Upload file attachment (Image or Document)
  async uploadAttachment(
    file: File,
    token?: string,
  ): Promise<{ url: string; fileName: string; fileSize: number; fileType: 'IMAGE' | 'FILE' }> {
    const isImage = file.type.startsWith('image/');
    const endpoint = isImage ? `${API_BASE}/files/upload-image` : `${API_BASE}/files/upload`;

    const formData = new FormData();
    formData.append('fileUpload', file);

    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || 'Tải tệp đính kèm thất bại');
    }

    const data = await response.json();
    const resultUrl = data?.url || data?.data?.url || data?.fileName;

    return {
      url: resultUrl,
      fileName: file.name,
      fileSize: file.size,
      fileType: isImage ? 'IMAGE' : 'FILE',
    };
  },
};
