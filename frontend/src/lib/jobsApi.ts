import { apiRequest } from './api';

export interface PublicJob {
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
  isHot?: boolean;
  company?: { _id: string; name: string; logo?: string };
  createdAt: string;
}

export const jobsApi = {
  getById: (id: string) => apiRequest<PublicJob>(`/jobs/${encodeURIComponent(id)}`),
  list: (query = '') => apiRequest<{ meta?: unknown; result: PublicJob[] }>(`/jobs${query ? `?${query}` : ''}`),
};
