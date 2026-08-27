import { apiRequest } from './api';

export interface JobCompany {
  _id?: string;
  name?: string;
  logo?: string;
  isActive?: boolean;
}

export interface JobItem {
  _id: string;
  name: string;
  description?: string;
  skills?: string[];
  company?: JobCompany;
  salary?: number | string | null;
  level?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  quantity?: number;
  isHot?: boolean;
  isFeatured?: boolean;
  isUrgent?: boolean;
  createdAt?: string;
  updatedAt?: string;
  _score?: number;
}

export interface SearchJobsParams {
  query?: string;
  location?: string;
  level?: string;
  skills?: string[];
  minSalary?: number;
  maxSalary?: number;
  isHot?: boolean;
  isFeatured?: boolean;
  isUrgent?: boolean;
  companyId?: string;
  sort?: 'relevance' | 'newest' | 'salary_desc' | 'salary_asc';
  page?: number;
  limit?: number;
}

export interface SearchJobsResponse {
  meta: {
    current: number;
    pageSize: number;
    pages: number;
    total: number;
  };
  result: JobItem[];
}

export async function searchJobsApi(
  params: SearchJobsParams,
  accessToken?: string | null,
): Promise<SearchJobsResponse> {
  const queryParams = new URLSearchParams();

  if (params.query) queryParams.append('query', params.query.trim());
  if (params.location && params.location !== 'Tất cả địa điểm') {
    queryParams.append('location', params.location.trim());
  }
  if (params.level && params.level !== 'Tất cả cấp bậc') {
    queryParams.append('level', params.level.trim());
  }
  if (params.skills && params.skills.length > 0) {
    queryParams.append('skills', params.skills.join(','));
  }
  if (params.minSalary !== undefined) {
    queryParams.append('minSalary', params.minSalary.toString());
  }
  if (params.maxSalary !== undefined) {
    queryParams.append('maxSalary', params.maxSalary.toString());
  }
  if (params.isHot !== undefined) {
    queryParams.append('isHot', params.isHot ? 'true' : 'false');
  }
  if (params.isFeatured !== undefined) {
    queryParams.append('isFeatured', params.isFeatured ? 'true' : 'false');
  }
  if (params.isUrgent !== undefined) {
    queryParams.append('isUrgent', params.isUrgent ? 'true' : 'false');
  }
  if (params.companyId) {
    queryParams.append('companyId', params.companyId);
  }
  if (params.sort) {
    queryParams.append('sort', params.sort);
  }
  if (params.page) {
    queryParams.append('page', params.page.toString());
  }
  if (params.limit) {
    queryParams.append('limit', params.limit.toString());
  }

  const res = await apiRequest<SearchJobsResponse>(
    `/jobs/search-es?${queryParams.toString()}`,
    {
      accessToken,
    },
  );

  return (
    res || {
      meta: { current: 1, pageSize: 10, pages: 1, total: 0 },
      result: [],
    }
  );
}

export async function getJobDetailApi(
  id: string,
  accessToken?: string | null,
): Promise<JobItem> {
  return await apiRequest<JobItem>(`/jobs/${id}`, { accessToken });
}

export async function getRelatedJobsApi(
  id: string,
  limit = 6,
  accessToken?: string | null,
): Promise<JobItem[]> {
  const res = await apiRequest<JobItem[]>(`/jobs/${id}/related?limit=${limit}`, {
    accessToken,
  });
  return Array.isArray(res) ? res : [];
}

export async function getSearchSuggestionsApi(
  query: string,
  limit = 8,
): Promise<string[]> {
  if (!query || query.trim().length < 2) return [];
  const res = await apiRequest<string[]>(
    `/jobs/search-suggestions?query=${encodeURIComponent(query.trim())}&limit=${limit}`,
  );
  return Array.isArray(res) ? res : [];
}

export async function applyJobApi(
  data: {
    cvId: string;
    jobId: string;
    companyId: string;
    coverLetter?: string;
  },
  accessToken: string,
): Promise<{ _id: string; status: string; message?: string }> {
  return await apiRequest<{ _id: string; status: string; message?: string }>(
    '/applications',
    {
      method: 'POST',
      body: data,
      accessToken,
    },
  );
}

// Utility functions
export function formatSalary(
  salary: number | string | null | undefined,
): string {
  if (
    salary === null ||
    salary === undefined ||
    salary === '' ||
    salary === 0 ||
    salary === '0'
  ) {
    return 'Thỏa thuận';
  }
  const num = typeof salary === 'string' ? parseFloat(salary) : salary;
  if (isNaN(num) || num <= 0) return 'Thỏa thuận';
  if (num >= 1000000) {
    const millions = (num / 1000000).toLocaleString('vi-VN', {
      maximumFractionDigits: 1,
    });
    return `Tới ${millions} triệu`;
  }
  return `${num.toLocaleString('vi-VN')} đ`;
}

export function getCompanyInitial(name?: string): string {
  if (!name) return 'TP';
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function formatLocation(loc?: string): string {
  if (!loc) return 'Toàn quốc';
  const parts = loc.split(',');
  const lastPart = parts[parts.length - 1].trim();
  if (lastPart.toLowerCase().includes('hà nội')) return 'Hà Nội';
  if (
    lastPart.toLowerCase().includes('hồ chí minh') ||
    lastPart.toLowerCase().includes('hcm')
  )
    return 'Hồ Chí Minh';
  if (lastPart.toLowerCase().includes('đà nẵng')) return 'Đà Nẵng';
  if (lastPart.toLowerCase().includes('cần thơ')) return 'Cần Thơ';
  if (lastPart.toLowerCase().includes('hải phòng')) return 'Hải Phòng';
  if (lastPart.toLowerCase().includes('bình dương')) return 'Bình Dương';
  return parts.length > 1 ? lastPart : loc;
}

export function formatDaysRemaining(endDate?: string | Date): string {
  if (!endDate) return 'Đang tuyển';
  const end = new Date(endDate).getTime();
  const now = Date.now();
  const diffDays = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return 'Hết hạn';
  if (diffDays === 1) return 'Còn 1 ngày';
  return `Còn ${diffDays} ngày`;
}

export function formatRelativeTime(date?: string | Date): string {
  if (!date) return '';
  const created = new Date(date).getTime();
  const now = Date.now();
  const diffHours = Math.floor((now - created) / (1000 * 60 * 60));
  if (diffHours < 1) return 'Vừa đăng';
  if (diffHours < 24) return `${diffHours} giờ trước`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Hôm qua';
  if (diffDays < 30) return `${diffDays} ngày trước`;
  return `${Math.floor(diffDays / 30)} tháng trước`;
}
