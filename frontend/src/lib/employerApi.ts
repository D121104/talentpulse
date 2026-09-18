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
  lat?: number | null;
  lon?: number | null;
  website?: string | null;
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
    maxActiveJobs?: number;
    todayJobsPostedCount: number;
    maxDailyJobs: number;
    hotJobLimit?: number;
    candidateSearchLimit?: number;
    aiQuota?: number;
    packageName?: string;
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
  workingModel?: string;
  education?: string;
  benefits?: string[];
  categories?: string[];
  description: string;
  location: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  isHot?: boolean;
  boostedAt?: string | null;
  boostExpiresAt?: string | null;
  applicationsCount?: number;
  company?: {
    _id: string;
    name: string;
    logo?: string;
    scale?: string;
    address?: string;
  };
  createdAt: string;
}

export type ApplicationStatusType =
  | 'PENDING'
  | 'REVIEWING'
  | 'CONSIDERING'
  | 'INTERVIEWING'
  | 'SUITABLE'
  | 'APPROVED'
  | 'REJECTED'
  | 'WITHDRAWN';

export type InterviewRoundType = 'TECHNICAL' | 'HR' | 'CULTURE' | 'FINAL';

export type InterviewRoundStatus =
  | 'PENDING_CONFIRMATION'
  | 'CONFIRMED'
  | 'DECLINED'
  | 'RESCHEDULED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export type InterviewResult = 'PENDING' | 'PASSED' | 'FAILED' | 'ON_HOLD';

export interface InterviewParticipantItem {
  _id: string;
  roundId: string;
  userId: string;
  role: 'INTERVIEWER' | 'CANDIDATE' | 'OBSERVER';
  joinedAt?: string;
  leftAt?: string;
  feedback?: string;
  rating?: number;
  user?: {
    _id: string;
    name: string;
    email: string;
    avatar?: string;
  };
}

export interface InterviewRoundItem {
  _id: string;
  applicationId: string;
  companyId: string;
  roundNumber: number;
  title: string;
  roundType: InterviewRoundType;
  status: InterviewRoundStatus;
  scheduledAt: string;
  scheduledEndAt: string;
  durationMinutes: number;
  roomId: string;
  roomPassword?: string;
  meetingLink?: string;
  location?: string;
  isOnline: boolean;
  notes?: string;
  description?: string;
  result: InterviewResult;
  candidateFeedback?: string;
  interviewerFeedback?: string;
  feedback?: string;
  score?: number;
  inviteSentAt?: string;
  confirmedAt?: string;
  declinedAt?: string;
  startedAt?: string;
  endedAt?: string;
  version: number;
  company?: {
    _id: string;
    name?: string;
    logo?: string;
  };
  application?: {
    _id: string;
    status: ApplicationStatusType;
    company?: {
      _id: string;
      name?: string;
      logo?: string;
    };
    job?: {
      _id: string;
      name: string;
      salary?: number;
      level?: string;
      location?: string;
    };
    user?: {
      _id: string;
      name: string;
      email: string;
      avatar?: string;
      address?: string;
    };
  };
  participants?: InterviewParticipantItem[];
}

export interface CreateInterviewRoundPayload {
  applicationId: string;
  title: string;
  roundType?: InterviewRoundType;
  roundNumber?: number;
  scheduledAt: string;
  scheduledEndAt: string;
  isOnline?: boolean;
  location?: string;
  notes?: string;
  interviewerIds?: string[];
  sendEmailInvite?: boolean;
}

export interface ApplicationItem {
  _id: string;
  status: ApplicationStatusType;
  version?: number;
  withdrawnAt?: string;
  withdrawReason?: string;
  coverLetter?: string;
  createdAt: string;
  updatedAt?: string;
  history?: {
    status: string;
    updatedAt: string;
    updatedBy: { _id: string; email: string };
    reason?: string;
    note?: string;
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

export interface CandidatePublicItem {
  candidateUserId: string;
  name: string;
  avatar?: string | null;
  title: string;
  skills: string[];
  location: string;
  experienceYears?: number;
  experiencePlacesCount?: number;
  experienceSummary?: string;
  companyMatchScore?: number;
  isRecommendedForCompany?: boolean;
  recommendationReason?: string;
  cvType: 'ONLINE_CV' | 'UPLOADED_CV';
  cvId: string;
  isVerified: boolean;
  isPremium: boolean;
  isBoosted: boolean;
  canUnlock: boolean;
  isUnlocked: boolean;
  createdAt: string;
}

export interface UnlockedCandidateInfo {
  isNewUnlock?: boolean;
  candidate: {
    _id: string;
    name: string;
    email: string;
    phone: string;
    address: string;
    avatar?: string | null;
  };
  cv: {
    _id: string;
    type: 'ONLINE_CV' | 'UPLOADED_CV';
    title: string;
    templateType?: string;
    position?: string;
    phone?: string;
    email?: string;
    link?: string;
    address?: string;
    careerObjective?: string;
    education?: any[];
    workExperience?: any[];
    skills?: any[];
    activities?: any[];
    certificates?: any[];
    awards?: any[];
    pdfUrl?: string | null;
    downloadUrl?: string;
    fileType?: string;
  };
  message?: string;
}

export interface CandidateQuotaInfo {
  usedToday: number;
  limit: number;
  remaining: number;
  isUnlimited: boolean;
  timezone: string;
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
  userId?: string;
  data?: Record<string, any>;
}

export interface CandidateEmployerViewItem {
  _id: string;
  accessType: 'ONLINE_CV' | 'UPLOADED_CV';
  accessedAt: string;
  hr: {
    _id: string;
    name: string;
    avatar?: string | null;
    roleTitle?: string;
  } | null;
  company: {
    _id: string;
    name: string;
    logo?: string | null;
    address?: string | null;
    scale?: string | null;
    description?: string | null;
  };
  cv: {
    _id?: string;
    title: string;
    templateType?: string;
    fileType?: string;
    type?: string;
  };
}

export interface CandidateEmployerViewsResponse {
  stats: {
    viewsThisWeek: number;
    viewsThisMonth: number;
    totalViews: number;
    searchableCvCount: number;
  };
  meta: {
    current: number;
    pageSize: number;
    pages: number;
    total: number;
  };
  result: CandidateEmployerViewItem[];
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

  createCompanyByHr: (data: Partial<CompanyInfo> & { name: string }, accessToken: string) =>
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
      company: { _id: string; name: string; logo?: string; scale?: string; address?: string };
      salary: number;
      quantity: number;
      level: string;
      workingModel?: string;
      education?: string;
      benefits?: string[];
      categories?: string[];
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

  boostJob: (id: string, accessToken: string) =>
    apiRequest<{ message: string; job: HrJobItem }>(`/jobs/${id}/boost`, {
      method: 'PATCH',
      accessToken,
    }),

  unboostJob: (id: string, accessToken: string) =>
    apiRequest<{ message: string; job: HrJobItem }>(`/jobs/${id}/unboost`, {
      method: 'PATCH',
      accessToken,
    }),

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

  getApplicationsByCompany: (params: { current?: number; pageSize?: number; status?: string } = {}, accessToken: string) => {
    return employerApi.getApplications(params, accessToken);
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
    status: ApplicationStatusType,
    accessToken: string,
    options?: {
      note?: string;
      reason?: string;
      sendEmail?: boolean;
      customEmailSubject?: string;
      customEmailContent?: string;
      expectedVersion?: number;
    },
  ) =>
    apiRequest<ApplicationItem>(`/applications/${id}/status`, {
      method: 'PATCH',
      body: { status, ...options },
      accessToken,
    }),

  withdrawApplication: (
    id: string,
    accessToken: string,
    options?: { reason?: string; expectedVersion?: number },
  ) =>
    apiRequest<ApplicationItem>(`/applications/${id}/withdraw`, {
      method: 'POST',
      body: options || {},
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

  // 9. HR Candidate Search & Unlock Quota System
  searchCandidatesGlobal: (
    query: { keyword?: string; skills?: string; location?: string; current?: number; pageSize?: number },
    accessToken: string,
  ) => {
    const qs = new URLSearchParams();
    if (query.keyword) qs.append('keyword', query.keyword);
    if (query.skills) qs.append('skills', query.skills);
    if (query.location) qs.append('location', query.location);
    if (query.current) qs.append('current', String(query.current));
    if (query.pageSize) qs.append('pageSize', String(query.pageSize));
    return apiRequest<{ meta: any; result: CandidatePublicItem[] }>(`/hr/candidates?${qs.toString()}`, { accessToken });
  },

  getCandidateQuota: (accessToken: string) =>
    apiRequest<CandidateQuotaInfo>('/hr/candidates/quota', { accessToken }),

  unlockCandidate: (
    candidateUserId: string,
    data: { cvType: 'ONLINE_CV' | 'UPLOADED_CV'; cvId: string },
    accessToken: string,
  ) =>
    apiRequest<UnlockedCandidateInfo>(`/hr/candidates/${candidateUserId}/unlock`, {
      method: 'POST',
      body: data,
      accessToken,
    }),

  getCandidateUnlockHistory: (params: { current?: number; pageSize?: number } = {}, accessToken: string) => {
    const qs = new URLSearchParams();
    if (params.current) qs.append('current', String(params.current));
    if (params.pageSize) qs.append('pageSize', String(params.pageSize));
    return apiRequest<{ meta: any; result: any[] }>(`/hr/candidates/my-unlocks?${qs.toString()}`, { accessToken });
  },

  // 10. Candidate Profile Views History & Job Seeking Settings
  getCandidateEmployerViews: (params: { current?: number; pageSize?: number } = {}, accessToken: string) => {
    const qs = new URLSearchParams();
    if (params.current) qs.append('current', String(params.current));
    if (params.pageSize) qs.append('pageSize', String(params.pageSize));
    return apiRequest<CandidateEmployerViewsResponse>(`/candidate/employer-views?${qs.toString()}`, { accessToken });
  },

  updateCandidateJobSettings: (
    settings: {
      isJobSeeking?: boolean;
      isJobRecommendation?: boolean;
      allowRecruiterSearch?: boolean;
    },
    accessToken: string,
  ) => {
    return apiRequest<{ message: string; settings: any }>('/users/candidate/settings', {
      method: 'PATCH',
      body: settings,
      accessToken,
    });
  },

  // 11. Interview Management & Calendar APIs
  getCalendarInterviews: (
    params: { startDate?: string; endDate?: string } = {},
    accessToken: string,
  ) => {
    const qs = new URLSearchParams();
    if (params.startDate) qs.append('startDate', params.startDate);
    if (params.endDate) qs.append('endDate', params.endDate);
    return apiRequest<InterviewRoundItem[]>(`/interviews/calendar?${qs.toString()}`, {
      accessToken,
    });
  },

  getInterviews: (
    params: {
      applicationId?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
    } = {},
    accessToken: string,
  ) => {
    const qs = new URLSearchParams();
    if (params.applicationId) qs.append('applicationId', params.applicationId);
    if (params.status) qs.append('status', params.status);
    if (params.startDate) qs.append('startDate', params.startDate);
    if (params.endDate) qs.append('endDate', params.endDate);
    return apiRequest<InterviewRoundItem[]>(`/interviews?${qs.toString()}`, {
      accessToken,
    });
  },

  getInterviewDetail: (id: string, accessToken: string) =>
    apiRequest<InterviewRoundItem>(`/interviews/${id}`, { accessToken }),

  getInterviewRoom: (roomId: string, accessToken: string) =>
    apiRequest<{ round: InterviewRoundItem; userRoleInRoom: 'INTERVIEWER' | 'CANDIDATE' }>(
      `/interviews/room/${roomId}`,
      { accessToken },
    ),

  endInterviewRoom: (roomId: string, accessToken: string) =>
    apiRequest<{ success: boolean; message: string }>(
      `/interviews/room/${roomId}/end`,
      { method: 'POST', accessToken },
    ),

  createInterviewRound: (
    data: CreateInterviewRoundPayload,
    accessToken: string,
  ) =>
    apiRequest<InterviewRoundItem>('/interviews', {
      method: 'POST',
      body: data,
      accessToken,
    }),

  updateInterviewRound: (
    id: string,
    data: Partial<InterviewRoundItem> & { expectedVersion?: number },
    accessToken: string,
  ) =>
    apiRequest<InterviewRoundItem>(`/interviews/${id}`, {
      method: 'PATCH',
      body: data,
      accessToken,
    }),

  confirmInterview: (
    id: string,
    data: { action: 'CONFIRM' | 'DECLINE'; feedback?: string },
    accessToken: string,
  ) =>
    apiRequest<InterviewRoundItem>(`/interviews/${id}/confirm`, {
      method: 'POST',
      body: data,
      accessToken,
    }),

  sendOnlineInterviewInvite: (
    id: string,
    customMessage: string | undefined,
    accessToken: string,
  ) =>
    apiRequest<InterviewRoundItem>(`/interviews/${id}/send-online-invite`, {
      method: 'POST',
      body: { customMessage },
      accessToken,
    }),
};
