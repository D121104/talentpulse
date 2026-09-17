import { apiRequest } from './api';

const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1').replace(/\/$/, '');

// ================= Candidate Boost & CV System Types =================
export interface BoostStatusResult {
  tier: 'FREE' | 'VERIFIED' | 'PREMIUM';
  isVerified: boolean;
  isPremium: boolean;
  isBoosted: boolean;
  canBoost: boolean;
  lastBoostedAt: string | null;
  boostExpiresAt: string | null;
  remainingCooldownSeconds: number;
  remainingCooldownText: string;
  boostLimitText: string;
}

export interface BoostProfileResult {
  message: string;
  lastBoostedAt: string;
  boostExpiresAt: string;
  isBoosted: boolean;
}

export interface CandidateSettings {
  isJobSeeking: boolean;
  isJobRecommendation: boolean;
  allowRecruiterSearch: boolean;
}

export const candidateApi = {
  getBoostStatus: (accessToken?: string | null) =>
    apiRequest<BoostStatusResult>('/users/candidate/boost-status', {
      method: 'GET',
      accessToken,
    }),

  boostProfile: (accessToken?: string | null) =>
    apiRequest<BoostProfileResult>('/users/candidate/boost-profile', {
      method: 'POST',
      accessToken,
    }),

  getSettings: (accessToken?: string | null) =>
    apiRequest<CandidateSettings>('/users/candidate/settings', {
      method: 'GET',
      accessToken,
    }),

  updateSettings: (
    settings: Partial<CandidateSettings>,
    accessToken?: string | null,
  ) =>
    apiRequest<{ message: string; settings: CandidateSettings }>(
      '/users/candidate/settings',
      {
        method: 'PATCH',
        body: settings,
        accessToken,
      },
    ),
};

// ================= User Account & Settings Types =================
export interface UpdateProfilePayload {
  name?: string;
  avatar?: string;
  gender?: string;
  age?: number;
  address?: string;
}

export interface ChangePasswordPayload {
  oldPassword?: string;
  currentPassword?: string;
  newPassword: string;
}

export type CandidateSettingsData = CandidateSettings;

export const userApi = {
  // 1. Cập nhật thông tin tài khoản (Dành cho cả Candidate và HR)
  updateProfile: (id: string, data: UpdateProfilePayload, accessToken: string) =>
    apiRequest<any>(`/users/${id}`, {
      method: 'PATCH',
      body: data,
      accessToken,
    }),

  // 2. Đổi mật khẩu
  changePassword: (data: ChangePasswordPayload, accessToken: string) =>
    apiRequest<{ message: string }>('/users/change-password', {
      method: 'POST',
      body: {
        ...data,
        oldPassword: data.oldPassword || data.currentPassword,
        currentPassword: data.currentPassword || data.oldPassword,
      },
      accessToken,
    }),

  // 3. Lấy cài đặt tìm việc & quyền riêng tư của ứng viên
  getCandidateSettings: (accessToken: string) =>
    apiRequest<CandidateSettingsData>('/users/candidate/settings', {
      method: 'GET',
      accessToken,
    }),

  // 4. Cập nhật cài đặt tìm việc & quyền riêng tư của ứng viên
  updateCandidateSettings: (settings: CandidateSettingsData, accessToken: string) =>
    apiRequest<{ message: string; settings: CandidateSettingsData }>('/users/candidate/settings', {
      method: 'PATCH',
      body: settings,
      accessToken,
    }),

  // 5. Tải ảnh đại diện lên Cloudinary
  uploadAvatar: async (file: File, accessToken?: string) => {
    const formData = new FormData();
    formData.append('fileUpload', file);

    const headers: Record<string, string> = {};
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    const res = await fetch(`${API_URL}/files/upload-image`, {
      method: 'POST',
      body: formData,
      headers,
      credentials: 'include',
    });

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.message || 'Tải ảnh đại diện thất bại');
    }
    return (json.data ?? json) as { fileName: string; url?: string };
  },
};
