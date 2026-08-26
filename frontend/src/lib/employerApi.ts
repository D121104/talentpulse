import { apiRequest } from './api';

const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1').replace(/\/$/, '');

export interface SkillItem {
  _id: string;
  name: string;
  isDeleted?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CompanyInfo {
  _id: string;
  name: string;
  description?: string;
  address?: string;
  logo?: string;
  taxCode?: string;
  scale?: string;
  isActive?: boolean;
  usersFollow?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface HrDashboardStats {
  hasCompany: boolean;
  isProfileComplete: boolean;
  isPremium?: boolean;
  premiumPlan?: string;
  premiumExpiresAt?: string | null;
  company: CompanyInfo | null;
  stats: {
    totalJobs: number;
    activeJobs: number;
    todayJobsPostedCount: number;
    maxDailyJobs: number;
    totalApplications: number;
    pendingApplications: number;
    reviewingApplications: number;
    consideringApplications?: number;
    approvedApplications: number;
    rejectedApplications: number;
    followersCount: number;
    dailyApplicationStats: {
      date: string;
      label: string;
      count: number;
    }[];
    topJobs: {
      _id: string;
      name: string;
      salary: number;
      level: string;
      location: string;
      createdAt: string;
      endDate: string;
      isActive: boolean;
      applicationsCount: number;
    }[];
    recentApplications: {
      _id: string;
      status: string;
      createdAt: string;
      job: { _id: string; name: string };
      user: {
        _id: string;
        name: string;
        email: string;
        avatar?: string;
        address?: string;
      } | null;
      cv: {
        _id: string;
        title: string;
        url: string;
      } | null;
    }[];
  };
}

export interface HrMember {
  _id: string;
  name: string;
  email: string;
  avatar?: string;
  address?: string;
  role: string;
  isLead?: boolean;
  hrRole?: 'LEAD' | 'MEMBER';
  createdAt: string;
}

export interface PendingHrRequest {
  userId: string;
  name: string;
  email: string;
  avatar?: string;
  requestedAt: string;
}

export interface HrJobItem {
  _id: string;
  name: string;
  skills: string[];
  salary: number;
  quantity: number;
  level: string;
  description: string;
  location: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  applicationsCount?: number;
  company?: {
    _id: string;
    name: string;
    logo?: string;
  };
  createdAt: string;
}

export interface ApplicationItem {
  _id: string;
  status: 'PENDING' | 'REVIEWING' | 'CONSIDERING' | 'APPROVED' | 'REJECTED';
  coverLetter?: string;
  createdAt: string;
  updatedAt?: string;
  history?: {
    status: string;
    updatedAt: string;
    updatedBy: { _id: string; email: string };
  }[];
  jobId: {
    _id: string;
    name: string;
    salary?: number;
    level?: string;
    location?: string;
  };
  userId: {
    _id: string;
    name: string;
    email: string;
    avatar?: string;
    address?: string;
    gender?: string;
  };
  cvId: {
    _id: string;
    title: string;
    url: string;
  };
}

export interface AIRankedCandidate {
  applicationId: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  candidateAvatar?: string;
  cvId: string;
  cvTitle: string;
  cvUrl: string;
  matchScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  shortExplanation: string;
  applicationStatus: string;
  appliedAt: string;
}

export interface NotificationItem {
  _id: string;
  title: string;
  content: string;
  type: string;
  targetType: string;
  targetId: string;
  isRead: boolean;
  createdAt: string;
}

export const employerApi = {
  // 1. Dashboard Stats
  getDashboardStats: (accessToken: string) =>
    apiRequest<HrDashboardStats>('/companies/hr/dashboard-stats', { accessToken }),

  // 2. Company Management
  getCompanyDetails: (id: string, accessToken: string) =>
    apiRequest<CompanyInfo>(`/companies/${id}`, { accessToken }),

  updateCompany: (id: string, data: Partial<CompanyInfo>, accessToken: string) =>
    apiRequest<CompanyInfo>(`/companies/${id}`, { method: 'PATCH', body: data, accessToken }),

  createCompanyByHr: (data: { name: string; description?: string; address?: string; logo?: string; taxCode?: string; scale?: string }, accessToken: string) =>
    apiRequest<CompanyInfo>('/companies/hr/create', { method: 'POST', body: data, accessToken }),

  requestJoinCompany: (companyId: string, accessToken: string) =>
    apiRequest<{ message: string }>(`/companies/${companyId}/request-join`, { method: 'POST', accessToken }),

  getAllCompanies: (query = '', accessToken?: string) =>
    apiRequest<{ meta: any; result: CompanyInfo[] }>(`/companies?${query}`, { accessToken }),

  // 3. HR Team Members & Requests
  getCompanyHrs: (companyId: string, accessToken: string) =>
    apiRequest<HrMember[]>(`/companies/${companyId}/hrs`, { accessToken }),

  getPendingHrs: (companyId: string, accessToken: string) =>
    apiRequest<PendingHrRequest[]>(`/companies/${companyId}/pending-hrs`, { accessToken }),

  approveHr: (companyId: string, userId: string, accessToken: string) =>
    apiRequest<{ message: string }>(`/companies/${companyId}/approve-hr/${userId}`, { method: 'POST', accessToken }),

  rejectHr: (companyId: string, userId: string, accessToken: string) =>
    apiRequest<{ message: string }>(`/companies/${companyId}/reject-hr/${userId}`, { method: 'POST', accessToken }),

  isCompanyCreator: (companyId: string, accessToken: string) =>
    apiRequest<boolean>(`/companies/${companyId}/is-creator`, { accessToken }),

  removeHrFromCompany: (companyId: string, hrId: string, accessToken: string) =>
    apiRequest<{ message: string }>('/users/hrs/remove-from-company', {
      method: 'POST',
      body: { companyId, hrId },
      accessToken,
    }),

  leaveCompany: (accessToken: string) =>
    apiRequest<{ message: string }>('/users/leave-company', { method: 'POST', accessToken }),

  // 4. Job Recruitment Campaigns
  getHrJobs: (params: { current?: number; pageSize?: number } = {}, accessToken: string) => {
    const qs = new URLSearchParams();
    if (params.current) qs.append('current', String(params.current));
    if (params.pageSize) qs.append('pageSize', String(params.pageSize));
    return apiRequest<{ meta: any; result: HrJobItem[] }>(`/jobs/by-hr/all?${qs.toString()}`, { accessToken });
  },

  getJobById: (id: string, accessToken?: string) =>
    apiRequest<HrJobItem>(`/jobs/${id}`, { accessToken }),

  searchHrJobs: (name: string, params: { current?: number; pageSize?: number } = {}, accessToken: string) => {
    const qs = new URLSearchParams();
    if (name) qs.append('name', name);
    if (params.current) qs.append('current', String(params.current));
    if (params.pageSize) qs.append('pageSize', String(params.pageSize));
    return apiRequest<{ meta: any; result: HrJobItem[] }>(`/jobs/by-hr/search?${qs.toString()}`, { accessToken });
  },

  createJob: (
    data: {
      name: string;
      skills: string[];
      company: { _id: string; name: string; logo?: string };
      salary: number;
      quantity: number;
      level: string;
      description: string;
      location: string;
      startDate: string;
      endDate: string;
      isActive?: boolean;
    },
    accessToken: string,
  ) => apiRequest<HrJobItem>('/jobs', { method: 'POST', body: data, accessToken }),

  updateJob: (id: string, data: Partial<HrJobItem>, accessToken: string) =>
    apiRequest<HrJobItem>(`/jobs/${id}`, { method: 'PATCH', body: data, accessToken }),

  deleteJob: (id: string, accessToken: string) =>
    apiRequest<{ message: string }>(`/jobs/${id}`, { method: 'DELETE', accessToken }),

  // 4.1. Skills Management & Suggestions
  getSkills: (params: { current?: number; pageSize?: number; name?: string } = {}, accessToken?: string) => {
    const qs = new URLSearchParams();
    if (params.current) qs.append('current', String(params.current));
    if (params.pageSize) qs.append('pageSize', String(params.pageSize));
    if (params.name) qs.append('name', params.name);
    return apiRequest<{ meta: any; result: SkillItem[] }>(`/skills?${qs.toString()}`, { accessToken });
  },

  createSkill: (data: { name: string; description?: string }, accessToken: string) =>
    apiRequest<SkillItem>('/skills', { method: 'POST', body: data, accessToken }),

  // 5. Candidate Applications
  getApplications: (params: { current?: number; pageSize?: number; status?: string; companyId?: string } = {}, accessToken: string) => {
    const qs = new URLSearchParams();
    if (params.current) qs.append('current', String(params.current));
    if (params.pageSize) qs.append('pageSize', String(params.pageSize));
    if (params.status) qs.append('status', params.status);
    return apiRequest<{ meta: any; result: ApplicationItem[] }>(`/applications?${qs.toString()}`, { accessToken });
  },

  getApplicationsByJob: (jobId: string, params: { current?: number; pageSize?: number; status?: string } = {}, accessToken: string) => {
    const qs = new URLSearchParams();
    if (params.current) qs.append('current', String(params.current));
    if (params.pageSize) qs.append('pageSize', String(params.pageSize));
    if (params.status) qs.append('status', params.status);
    return apiRequest<{ meta: any; result: ApplicationItem[] }>(`/applications/by-job/${jobId}?${qs.toString()}`, { accessToken });
  },

  getApplicationDetail: (id: string, accessToken: string) =>
    apiRequest<ApplicationItem>(`/applications/${id}`, { accessToken }),

  markApplicationAsViewed: (id: string, accessToken: string) =>
    apiRequest<ApplicationItem>(`/applications/${id}/view`, {
      method: 'PATCH',
      accessToken,
    }),

  updateApplicationStatus: (
    id: string,
    status: 'PENDING' | 'REVIEWING' | 'CONSIDERING' | 'APPROVED' | 'REJECTED',
    accessToken: string,
  ) =>
    apiRequest<ApplicationItem>(`/applications/${id}/status`, {
      method: 'PATCH',
      body: { status },
      accessToken,
    }),

  getAIRankedCandidates: (jobId: string, topN = 10, accessToken: string) =>
    apiRequest<{
      jobId: string;
      jobName: string;
      totalApplications: number;
      rankedCandidates: AIRankedCandidate[];
      processedAt: string;
    }>(`/applications/by-job/${jobId}/ai-rank?topN=${topN}`, { accessToken }),

  searchCandidatesByCV: (
    jobId: string,
    query: { skills?: string; education?: string; address?: string; certificates?: string },
    accessToken: string,
  ) => {
    const qs = new URLSearchParams();
    if (query.skills) qs.append('skills', query.skills);
    if (query.education) qs.append('education', query.education);
    if (query.address) qs.append('address', query.address);
    if (query.certificates) qs.append('certificates', query.certificates);
    return apiRequest<{ total: number; result: any[] }>(`/applications/by-job/${jobId}/search-cv?${qs.toString()}`, { accessToken });
  },

  // 6. Image Upload
  uploadImage: async (file: File, accessToken?: string) => {
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
      throw new Error(json.message || 'Tải ảnh lên thất bại');
    }
    return (json.data ?? json) as { fileName: string; url?: string };
  },

  // 7. Notifications
  getNotifications: (page = 1, limit = 15, accessToken: string) =>
    apiRequest<{ meta: any; result: NotificationItem[] }>(`/notifications?page=${page}&limit=${limit}`, { accessToken }),

  getUnreadNotificationsCount: (accessToken: string) =>
    apiRequest<{ count: number }>('/notifications/unread-count', { accessToken }),

  markNotificationAsRead: (id: string, accessToken: string) =>
    apiRequest<any>(`/notifications/${id}/read`, { method: 'PATCH', accessToken }),

  markAllNotificationsAsRead: (accessToken: string) =>
    apiRequest<any>('/notifications/mark-all-read', { method: 'POST', accessToken }),

  // 8. User / Profile
  updateUserProfile: (id: string, data: { name?: string; avatar?: string; address?: string; gender?: string; age?: number }, accessToken: string) =>
    apiRequest<any>(`/users/${id}`, { method: 'PATCH', body: data, accessToken }),

  changeUserPassword: (data: { currentPassword?: string; newPassword?: string; password?: string }, accessToken: string) =>
    apiRequest<any>('/users/change-password', { method: 'POST', body: data, accessToken }),
};
