import { apiRequest } from './api';
import type {
  OnlineCV,
  CreateOnlineCVDto,
  UpdateOnlineCVDto,
  UserCV,
  CreateUserCVDto,
} from './cvTypes';

const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1').replace(/\/$/, '');

export const onlineCvApi = {
  create: (dto: CreateOnlineCVDto, accessToken?: string | null) =>
    apiRequest<OnlineCV>('/online-cvs', {
      method: 'POST',
      body: dto,
      accessToken,
    }),

  findAll: (accessToken?: string | null) =>
    apiRequest<OnlineCV[]>('/online-cvs', {
      accessToken,
    }),

  findOne: (id: string, accessToken?: string | null) =>
    apiRequest<OnlineCV>(`/online-cvs/${id}`, {
      accessToken,
    }),

  update: (id: string, dto: UpdateOnlineCVDto, accessToken?: string | null) =>
    apiRequest<OnlineCV>(`/online-cvs/${id}`, {
      method: 'PATCH',
      body: dto,
      accessToken,
    }),

  remove: (id: string, accessToken?: string | null) =>
    apiRequest<{ message: string }>(`/online-cvs/${id}`, {
      method: 'DELETE',
      accessToken,
    }),

  getPreview: (id: string, accessToken?: string | null) =>
    apiRequest<{ html: string }>(`/online-cvs/${id}/preview`, {
      accessToken,
    }),

  exportPdf: (id: string, accessToken?: string | null, htmlContent?: string, isPremium?: boolean) =>
    apiRequest<{ _id: string; pdfUrl: string; message: string }>(`/online-cvs/${id}/export`, {
      method: 'POST',
      body: { htmlContent, isPremium },
      accessToken,
    }),
};

export const userCvApi = {
  findAll: (accessToken?: string | null) =>
    apiRequest<UserCV[]>('/user-cvs', {
      accessToken,
    }),

  create: (dto: CreateUserCVDto, accessToken?: string | null) =>
    apiRequest<UserCV>('/user-cvs', {
      method: 'POST',
      body: dto,
      accessToken,
    }),

  setPrimary: (id: string, accessToken?: string | null) =>
    apiRequest<UserCV>(`/user-cvs/${id}/set-primary`, {
      method: 'PATCH',
      accessToken,
    }),

  remove: (id: string, accessToken?: string | null) =>
    apiRequest<{ message: string }>(`/user-cvs/${id}`, {
      method: 'DELETE',
      accessToken,
    }),
};

export const fileUploadApi = {
  uploadCvFile: async (file: File, accessToken?: string | null): Promise<{ url: string; fileName: string }> => {
    const formData = new FormData();
    formData.append('fileUpload', file);

    const response = await fetch(`${API_URL}/files/upload`, {
      method: 'POST',
      body: formData,
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });

    const payload = await response.json().catch(() => null);
    const data = payload?.data ?? payload;

    if (!response.ok) {
      const message =
        (Array.isArray(payload?.message) ? payload.message.join(', ') : payload?.message) ??
        data?.message ??
        'Không thể tải file lên';
      throw new Error(message);
    }

    return data;
  },

  uploadImageFile: async (file: File, accessToken?: string | null): Promise<{ url: string; fileName: string }> => {
    const formData = new FormData();
    formData.append('fileUpload', file);

    const response = await fetch(`${API_URL}/files/upload-image`, {
      method: 'POST',
      body: formData,
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });

    const payload = await response.json().catch(() => null);
    const data = payload?.data ?? payload;

    if (!response.ok) {
      const message =
        (Array.isArray(payload?.message) ? payload.message.join(', ') : payload?.message) ??
        data?.message ??
        'Không thể tải ảnh lên';
      throw new Error(message);
    }

    return data;
  },
};
