import { apiRequest } from './api';

export interface CreateApplicationInput {
  cvId: string;
  jobId: string;
  companyId: string;
  coverLetter?: string;
  aiRankingConsent?: boolean;
}

export const applicationsApi = {
  create: (input: CreateApplicationInput, accessToken: string) =>
    apiRequest<{ _id: string; createdAt: string }>('/applications', {
      method: 'POST',
      body: input,
      accessToken,
    }),
  mine: (accessToken: string) =>
    apiRequest<unknown[]>('/applications/my-applications', { accessToken }),
};
