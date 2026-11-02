import { apiRequest } from "./api";
import type {
  OnlineCV,
  CreateOnlineCVDto,
  UpdateOnlineCVDto,
  GenerateOnlineCVDraftRequest,
  GenerateOnlineCVDraftResponse,
  GenerateOnlineCVJobRequest,
  GenerateOnlineCVJobAcceptedResponse,
  GenerateOnlineCVJobStatusResponse,
  UserCV,
  CreateUserCVDto,
  AiCvGenerationConsent,
  AiCvGenerationConsentPolicy,
} from "./cvTypes";

import { API_URL } from "./api";

export const onlineCvApi = {
  create: (dto: CreateOnlineCVDto, accessToken?: string | null) =>
    apiRequest<OnlineCV>("/online-cvs", {
      method: "POST",
      body: dto,
      accessToken,
    }),

  findAll: (accessToken?: string | null) =>
    apiRequest<OnlineCV[]>("/online-cvs", {
      accessToken,
    }),

  findOne: (id: string, accessToken?: string | null) =>
    apiRequest<OnlineCV>(`/online-cvs/${id}`, {
      accessToken,
    }),

  update: (id: string, dto: UpdateOnlineCVDto, accessToken?: string | null) =>
    apiRequest<OnlineCV>(`/online-cvs/${id}`, {
      method: "PATCH",
      body: dto,
      accessToken,
    }),

  generateDraft: (
    id: string,
    request: GenerateOnlineCVDraftRequest = {},
    accessToken?: string | null,
  ) =>
    apiRequest<GenerateOnlineCVDraftResponse>(`/online-cvs/${id}/generate`, {
      method: 'POST',
      body: request,
      accessToken,
    }),

  createGenerationJob: (
    id: string,
    request: GenerateOnlineCVJobRequest = {},
    idempotencyKey: string,
    accessToken?: string | null,
  ) =>
    apiRequest<GenerateOnlineCVJobAcceptedResponse>(
      `/online-cvs/${id}/generation-jobs`,
      {
        method: "POST",
        body: request,
        headers: { "Idempotency-Key": idempotencyKey },
        accessToken,
      },
    ),

  createGenerationJobFromCareerProfile: (
    request: GenerateOnlineCVJobRequest,
    idempotencyKey: string,
    accessToken?: string | null,
  ) =>
    apiRequest<GenerateOnlineCVJobAcceptedResponse>(
      "/online-cvs/generation-jobs/from-career-profile",
      {
        method: "POST",
        body: request,
        headers: { "Idempotency-Key": idempotencyKey },
        accessToken,
      },
    ),

  getGenerationJob: (
    id: string,
    operationId: string,
    accessToken?: string | null,
    signal?: AbortSignal,
  ) =>
    apiRequest<GenerateOnlineCVJobStatusResponse>(
      `/online-cvs/${id}/generation-jobs/${operationId}`,
      { accessToken, signal },
    ),

  cancelGenerationJob: (
    id: string,
    operationId: string,
    accessToken?: string | null,
    signal?: AbortSignal,
  ) =>
    apiRequest<GenerateOnlineCVJobStatusResponse>(
      `/online-cvs/${id}/generation-jobs/${operationId}`,
      { method: "DELETE", accessToken, signal },
    ),

  remove: (id: string, accessToken?: string | null) =>
    apiRequest<{ message: string }>(`/online-cvs/${id}`, {
      method: "DELETE",
      accessToken,
    }),

  getPreview: (id: string, accessToken?: string | null) =>
    apiRequest<{ html: string }>(`/online-cvs/${id}/preview`, {
      accessToken,
    }),

  exportPdf: (
    id: string,
    accessToken?: string | null,
    htmlContent?: string,
    isPremium?: boolean,
  ) =>
    apiRequest<{ _id: string; pdfUrl: string; message: string }>(
      `/online-cvs/${id}/export`,
      {
        method: "POST",
        body: { htmlContent, isPremium },
        accessToken,
      },
    ),

  setPrimary: (id: string, accessToken?: string | null) =>
    apiRequest<OnlineCV>(`/online-cvs/${id}/set-primary`, {
      method: "PATCH",
      accessToken,
    }),

  toggleSearchable: (
    id: string,
    isSearchable?: boolean,
    accessToken?: string | null,
  ) =>
    apiRequest<{ _id: string; isSearchable: boolean; message: string }>(
      `/online-cvs/${id}/searchable`,
      {
        method: "PATCH",
        body: { isSearchable },
        accessToken,
      },
  ),
};

export const aiCvConsentApi = {
  policy: (accessToken?: string | null) =>
    apiRequest<AiCvGenerationConsentPolicy>(
      "/ai/cv-consents/policy/cv_generation",
      { accessToken },
    ),

  current: (accessToken?: string | null) =>
    apiRequest<AiCvGenerationConsent | null>(
      "/ai/cv-consents/current/cv_generation",
      { accessToken },
    ),

  grant: (
    policy: AiCvGenerationConsentPolicy,
    accessToken?: string | null,
  ) =>
    apiRequest<AiCvGenerationConsent>("/ai/cv-consents/grant", {
      method: "POST",
      body: {
        scope: policy.scope,
        consentVersion: policy.consentVersion,
        policyHash: policy.policyHash,
        source: "web",
        sourceMetadata: { locale: document.documentElement.lang || "vi" },
      },
      accessToken,
    }),

  revoke: (
    policy: AiCvGenerationConsentPolicy,
    accessToken?: string | null,
  ) =>
    apiRequest<AiCvGenerationConsent>("/ai/cv-consents/revoke", {
      method: "POST",
      body: {
        scope: policy.scope,
        consentVersion: policy.consentVersion,
        policyHash: policy.policyHash,
        source: "web",
        sourceMetadata: { locale: document.documentElement.lang || "vi" },
      },
      accessToken,
    }),
};

export const userCvApi = {
  findAll: (accessToken?: string | null) =>
    apiRequest<UserCV[]>("/user-cvs", {
      accessToken,
    }),

  create: (dto: CreateUserCVDto, accessToken?: string | null) =>
    apiRequest<UserCV>("/user-cvs", {
      method: "POST",
      body: dto,
      accessToken,
    }),

  setPrimary: (id: string, accessToken?: string | null) =>
    apiRequest<UserCV>(`/user-cvs/${id}/set-primary`, {
      method: "PATCH",
      accessToken,
    }),

  toggleSearchable: (
    id: string,
    isSearchable?: boolean,
    accessToken?: string | null,
  ) =>
    apiRequest<{ _id: string; isSearchable: boolean; message: string }>(
      `/user-cvs/${id}/searchable`,
      {
        method: "PATCH",
        body: { isSearchable },
        accessToken,
      },
    ),

  remove: (id: string, accessToken?: string | null) =>
    apiRequest<{ message: string }>(`/user-cvs/${id}`, {
      method: "DELETE",
      accessToken,
    }),
};

export const fileUploadApi = {
  uploadCvFile: async (
    file: File,
    accessToken?: string | null,
  ): Promise<{ url: string; fileName: string }> => {
    const formData = new FormData();
    formData.append("fileUpload", file);

    const response = await fetch(`${API_URL}/files/upload`, {
      method: "POST",
      body: formData,
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });

    const payload = await response.json().catch(() => null);
    const data = payload?.data ?? payload;

    if (!response.ok) {
      const message =
        (Array.isArray(payload?.message)
          ? payload.message.join(", ")
          : payload?.message) ??
        data?.message ??
        "Không thể tải file lên";
      throw new Error(message);
    }

    return data;
  },

  uploadImageFile: async (
    file: File,
    accessToken?: string | null,
  ): Promise<{ url: string; fileName: string }> => {
    const formData = new FormData();
    formData.append("fileUpload", file);

    const response = await fetch(`${API_URL}/files/upload-image`, {
      method: "POST",
      body: formData,
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });

    const payload = await response.json().catch(() => null);
    const data = payload?.data ?? payload;

    if (!response.ok) {
      const message =
        (Array.isArray(payload?.message)
          ? payload.message.join(", ")
          : payload?.message) ??
        data?.message ??
        "Không thể tải ảnh lên";
      throw new Error(message);
    }

    return data;
  },
};
