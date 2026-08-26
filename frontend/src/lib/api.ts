import type {
  AuthSession,
  LoginInput,
  RegisterHrInput,
  RegisterInput,
} from '../auth/types';

const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  accessToken?: string | null;
  retryAfterRefresh?: boolean;
};

let refreshHandler: (() => Promise<string | null>) | null = null;

export function configureRefreshHandler(handler: (() => Promise<string | null>) | null) {
  refreshHandler = handler;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);
  const data = payload?.data ?? payload;

  if (!response.ok) {
    const message =
      (Array.isArray(payload?.message)
        ? payload.message.join(', ')
        : payload?.message) ??
      data?.message ??
      'Đã xảy ra lỗi. Vui lòng thử lại.';
    throw new ApiError(message, response.status);
  }

  return data as T;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, accessToken, retryAfterRefresh = true, headers, ...requestOptions } = options;
  const response = await fetch(`${API_URL}${path}`, {
    ...requestOptions,
    credentials: 'include',
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (response.status === 401 && retryAfterRefresh && refreshHandler) {
    const refreshedAccessToken = await refreshHandler();
    if (refreshedAccessToken) {
      return apiRequest<T>(path, {
        ...options,
        accessToken: refreshedAccessToken,
        retryAfterRefresh: false,
      });
    }
  }

  return parseResponse<T>(response);
}

export const authApi = {
  login: (input: LoginInput) =>
    apiRequest<AuthSession>('/auth/login', { method: 'POST', body: input }),
  register: (input: RegisterInput) =>
    apiRequest<{ user: AuthSession['user'] }>('/auth/register', { method: 'POST', body: input }),
  registerHr: (input: RegisterHrInput) =>
    apiRequest<{ user: AuthSession['user'] }>('/auth/hr/register', {
      method: 'POST',
      body: input,
    }),
  refresh: () => apiRequest<AuthSession>('/auth/refresh', { method: 'POST', retryAfterRefresh: false }),
  account: (accessToken: string) =>
    apiRequest<{ user: AuthSession['user'] }>('/auth/account', { accessToken }),
  logout: (accessToken: string) =>
    apiRequest<{ message: string }>('/auth/logout', { method: 'POST', accessToken }),
  exchangeGoogleCode: (code: string) =>
    apiRequest<AuthSession>('/auth/google/exchange', { method: 'POST', body: { code } }),
  verifyAccount: (token: string) =>
    apiRequest<{ message: string; user: AuthSession['user'] }>('/auth/verify-account', {
      method: 'POST',
      body: { token },
    }),
  resendVerification: (data: { email?: string; userId?: string }) =>
    apiRequest<{ message: string }>('/auth/resend-verification', {
      method: 'POST',
      body: data,
    }),
};

export function getGoogleLoginUrl() {
  return `${API_URL}/auth/google`;
}
