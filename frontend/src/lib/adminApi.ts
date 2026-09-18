import { apiRequest } from './api';

export interface AdminPackageItem {
  _id: string;
  code: string;
  planType: 'CANDIDATE_PREMIUM' | 'HR_PREMIUM';
  billingCycle: 'monthly' | 'semi_annual' | 'annual';
  name: string;
  description: string | null;
  price: number;
  originalPrice: number | null;
  durationDays: number;
  aiQuota: number;
  badge: string | null;
  features: string[];
  hotJobLimit: number;
  candidateSearchLimit: number;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type CreatePackageInput = Partial<AdminPackageItem> & {
  code: string;
  planType: 'CANDIDATE_PREMIUM' | 'HR_PREMIUM';
  billingCycle: 'monthly' | 'semi_annual' | 'annual';
  name: string;
  price: number;
  durationDays: number;
  aiQuota: number;
};

export type UpdatePackageInput = Partial<AdminPackageItem>;

export interface AdminTransactionItem {
  _id: string;
  orderCode: number;
  planType: 'CANDIDATE_PREMIUM' | 'HR_PREMIUM';
  billingCycle: 'monthly' | 'semi_annual' | 'annual';
  durationDays: number;
  amount: number;
  status: 'PENDING' | 'PAID' | 'CANCELLED' | 'EXPIRED' | 'FAILED';
  checkoutUrl: string | null;
  paidAt: string | null;
  expiresAt: string;
  vatInvoiceRequested: boolean;
  vatCompanyName: string | null;
  vatTaxCode: string | null;
  createdAt: string;
  user: {
    _id: string;
    name: string;
    email: string;
    avatar: string | null;
    role: string;
  } | null;
}

export interface AdminSubscriptionItem {
  _id: string;
  name: string;
  email: string;
  avatar: string | null;
  role: string;
  companyName: string | null;
  premiumPlan: string;
  isPremium: boolean;
  premiumExpiresAt: string | null;
  daysRemaining: number;
  isExpired: boolean;
}

export interface AdminUserItem {
  _id: string;
  name: string;
  email: string;
  avatar?: string | null;
  role: 'USER' | 'HR' | 'ADMIN' | string;
  companyName?: string | null;
  isVerified?: boolean;
  isApproved?: boolean;
  isLocked?: boolean;
  lockedReason?: string | null;
  createdAt: string;
  isPremium?: boolean;
  premiumPlan?: string | null;
}

export interface AdminCompanyItem {
  _id: string;
  name: string;
  logo?: string | null;
  taxCode?: string | null;
  industry?: string | null;
  address?: string | null;
  location?: {
    type?: string;
    coordinates?: [number, number];
  } | string | null;
  website?: string | null;
  isVerified: boolean;
  isActive: boolean;
  jobCount?: number;
  createdAt?: string;
}

export interface AdminJobItem {
  _id: string;
  title?: string;
  name?: string;
  company?: {
    _id: string;
    name: string;
    logo?: string | null;
  } | null;
  location?: string | { type?: string; coordinates?: [number, number] } | any;
  salary?: string | number;
  level?: string;
  experience?: string;
  isHot?: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface AdminSkillItem {
  _id: string;
  name: string;
  category?: string;
  description?: string;
  createdAt: string;
}

export interface AdminDashboardOverviewStats {
  users: {
    total: number;
    candidates: number;
    hrs: number;
    pendingApprovalHrs: number;
    lockedUsers: number;
  };
  companies: {
    total: number;
    verified: number;
  };
  jobs: {
    total: number;
    active: number;
    hot: number;
  };
  revenue: {
    totalRevenue: number;
    todayRevenue: number;
    paidOrdersCount: number;
    activeSubscriptions: number;
  };
  pendingHrApprovals: Array<{
    _id: string;
    name: string;
    email: string;
    createdAt: string;
    companyName?: string | null;
  }>;
}

export type AdminDashboardStats = AdminDashboardOverviewStats;

export const adminApi = {
  // 1. Dashboard Overview Stats
  getDashboardStats: (accessToken: string) => {
    return apiRequest<AdminDashboardOverviewStats>('/admin/dashboard/stats', {
      accessToken,
    });
  },

  // 2. Premium Packages Management
  getAllPackages: (accessToken: string) => {
    return apiRequest<AdminPackageItem[]>('/payments/admin/packages', {
      accessToken,
    });
  },

  createPackage: (accessToken: string, data: CreatePackageInput) => {
    return apiRequest<AdminPackageItem>('/payments/admin/packages', {
      method: 'POST',
      body: data,
      accessToken,
    });
  },

  updatePackage: (accessToken: string, id: string, data: UpdatePackageInput) => {
    return apiRequest<AdminPackageItem>(`/payments/admin/packages/${id}`, {
      method: 'PATCH',
      body: data,
      accessToken,
    });
  },

  togglePackageActive: (accessToken: string, id: string) => {
    return apiRequest<AdminPackageItem>(`/payments/admin/packages/${id}/toggle`, {
      method: 'PATCH',
      accessToken,
    });
  },

  deletePackage: (accessToken: string, id: string) => {
    return apiRequest<{ message: string }>(`/payments/admin/packages/${id}`, {
      method: 'DELETE',
      accessToken,
    });
  },

  // 3. Transactions & Subscriptions
  getTransactions: async (
    accessToken: string,
    params: { current?: number; pageSize?: number; status?: string; planType?: string; search?: string } = {},
  ): Promise<AdminTransactionItem[]> => {
    const qs = new URLSearchParams();
    if (params.current) qs.append('current', String(params.current));
    if (params.pageSize) qs.append('pageSize', String(params.pageSize));
    if (params.status) qs.append('status', params.status);
    if (params.planType) qs.append('planType', params.planType);
    if (params.search) qs.append('search', params.search);

    const res = await apiRequest<any>(`/payments/admin/transactions?${qs.toString()}`, {
      accessToken,
    });
    return Array.isArray(res) ? res : res?.result ?? [];
  },

  getSubscriptions: async (
    accessToken: string,
    params: { current?: number; pageSize?: number; role?: string; status?: string; search?: string } = {},
  ): Promise<AdminSubscriptionItem[]> => {
    const qs = new URLSearchParams();
    if (params.current) qs.append('current', String(params.current));
    if (params.pageSize) qs.append('pageSize', String(params.pageSize));
    if (params.role) qs.append('role', params.role);
    if (params.status) qs.append('status', params.status);
    if (params.search) qs.append('search', params.search);

    const res = await apiRequest<any>(`/payments/admin/subscriptions?${qs.toString()}`, {
      accessToken,
    });
    return Array.isArray(res) ? res : res?.result ?? [];
  },

  extendSubscription: (accessToken: string, userId: string, days: number, note?: string) => {
    return apiRequest<{ message: string }>(`/payments/admin/subscriptions/${userId}/extend`, {
      method: 'POST',
      body: { days, note },
      accessToken,
    });
  },

  cancelSubscription: (accessToken: string, userId: string, reason?: string) => {
    return apiRequest<{ message: string }>(`/payments/admin/subscriptions/${userId}/cancel`, {
      method: 'POST',
      body: { reason },
      accessToken,
    });
  },

  // 4. Users Moderation
  getUsers: async (
    accessToken: string,
    params: { current?: number; pageSize?: number; role?: string; search?: string } = {},
  ): Promise<AdminUserItem[]> => {
    const qs = new URLSearchParams();
    if (params.current) qs.append('current', String(params.current));
    if (params.pageSize) qs.append('pageSize', String(params.pageSize));
    if (params.role) qs.append('role', params.role);
    if (params.search) qs.append('name', params.search);

    const res = await apiRequest<any>(`/users?${qs.toString()}`, {
      accessToken,
    });
    return Array.isArray(res) ? res : res?.result ?? [];
  },

  getPendingHrs: (accessToken: string) => {
    return apiRequest<any[]>('/users/admin/pending-hrs', {
      accessToken,
    });
  },

  approveHr: (accessToken: string, userId: string) => {
    return apiRequest<any>(`/users/${userId}/approve-hr`, {
      method: 'POST',
      accessToken,
    });
  },

  rejectHr: (accessToken: string, userId: string) => {
    return apiRequest<any>(`/users/${userId}`, {
      method: 'DELETE',
      accessToken,
    });
  },

  lockUser: (accessToken: string, userId: string, reason?: string) => {
    return apiRequest<any>(`/users/${userId}/lock`, {
      method: 'POST',
      body: { reason: reason || 'Vi phạm điều khoản dịch vụ' },
      accessToken,
    });
  },

  unlockUser: (accessToken: string, userId: string) => {
    return apiRequest<any>(`/users/${userId}/unlock`, {
      method: 'POST',
      accessToken,
    });
  },

  // 5. Companies Moderation
  getCompanies: async (
    accessToken: string,
    params: { current?: number; pageSize?: number; name?: string } = {},
  ): Promise<AdminCompanyItem[]> => {
    const qs = new URLSearchParams();
    if (params.current) qs.append('current', String(params.current));
    if (params.pageSize) qs.append('pageSize', String(params.pageSize));
    if (params.name) qs.append('name', params.name);

    const res = await apiRequest<any>(`/companies/by-admin/all?${qs.toString()}`, {
      accessToken,
    });
    return Array.isArray(res) ? res : res?.result ?? [];
  },

  verifyCompany: (accessToken: string, companyId: string, isVerified?: boolean) => {
    return apiRequest<any>(`/companies/verify/${companyId}`, {
      method: 'POST',
      body: { isVerified },
      accessToken,
    });
  },

  toggleCompanyActive: (accessToken: string, companyId: string) => {
    return apiRequest<any>(`/admin/companies/${companyId}/toggle-active`, {
      method: 'PATCH',
      accessToken,
    });
  },

  // 6. Jobs Moderation
  getJobs: async (
    accessToken: string,
    params: { current?: number; pageSize?: number; name?: string; companyId?: string } = {},
  ): Promise<AdminJobItem[]> => {
    const qs = new URLSearchParams();
    if (params.current) qs.append('current', String(params.current));
    if (params.pageSize) qs.append('pageSize', String(params.pageSize));
    if (params.name) qs.append('name', params.name);
    if (params.companyId) qs.append('companyId', params.companyId);

    const res = await apiRequest<any>(`/jobs?${qs.toString()}`, {
      accessToken,
    });
    return Array.isArray(res) ? res : res?.result ?? [];
  },

  toggleJobActive: (accessToken: string, jobId: string) => {
    return apiRequest<any>(`/admin/jobs/${jobId}/toggle-active`, {
      method: 'PATCH',
      accessToken,
    });
  },

  // 7. Skills Management
  getSkills: async (
    params: { current?: number; pageSize?: number; name?: string } = {},
  ): Promise<AdminSkillItem[]> => {
    const qs = new URLSearchParams();
    if (params.current) qs.append('current', String(params.current));
    if (params.pageSize) qs.append('pageSize', String(params.pageSize));
    if (params.name) qs.append('name', params.name);

    const res = await apiRequest<any>(`/skills?${qs.toString()}`);
    return Array.isArray(res) ? res : res?.result ?? [];
  },

  createSkill: (
    accessToken: string,
    data: { name: string; category?: string; description?: string },
  ) => {
    return apiRequest<any>('/skills', {
      method: 'POST',
      body: data,
      accessToken,
    });
  },

  updateSkill: (
    accessToken: string,
    id: string,
    data: { name?: string; category?: string; description?: string },
  ) => {
    return apiRequest<any>(`/skills/${id}`, {
      method: 'PATCH',
      body: data,
      accessToken,
    });
  },

  deleteSkill: (accessToken: string, id: string) => {
    return apiRequest<any>(`/skills/${id}`, {
      method: 'DELETE',
      accessToken,
    });
  },
};
