import { apiRequest } from './api';

export interface SkillItem {
  _id: string;
  name: string;
  isDeleted?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface SubscriberSubscription {
  _id: string;
  userId?: string;
  email: string;
  skills: SkillItem[];
  isActive: boolean;
  lastEmailSentAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface SaveSubscriberPayload {
  email?: string;
  skills: string[]; // List of existing skill _ids or names
  newSkillNames?: string[]; // Newly created skills
  isActive?: boolean;
}

export const subscriberApi = {
  // Get current user's email subscription and subscribed skills
  getMySubscription: (accessToken: string) => {
    return apiRequest<SubscriberSubscription | null>('/subscribers/me', {
      accessToken,
    });
  },

  // Save (create or update) user's email subscription
  saveSubscription: (payload: SaveSubscriberPayload, accessToken: string) => {
    return apiRequest<SubscriberSubscription>('/subscribers', {
      method: 'POST',
      body: payload,
      accessToken,
    });
  },

  // Toggle active status for receiving job alert emails
  toggleMySubscription: (accessToken: string) => {
    return apiRequest<SubscriberSubscription>('/subscribers/me/toggle', {
      method: 'PATCH',
      accessToken,
    });
  },

  // Search existing skills in the system with pagination
  searchSkills: (name: string, pageSize = 20, accessToken?: string) => {
    const qs = new URLSearchParams();
    if (name.trim()) qs.append('name', name.trim());
    qs.append('pageSize', String(pageSize));
    return apiRequest<{
      meta: { current: number; pageSize: number; pages: number; total: number };
      result: SkillItem[];
    }>(`/skills?${qs.toString()}`, {
      accessToken,
    });
  },
};
