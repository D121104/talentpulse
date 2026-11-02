import { apiRequest } from './api';
import type {
  OnlineCV,
  GenerateOnlineCVJobAcceptedResponse,
  GenerateOnlineCVJobRequest,
} from './cvTypes';
export type GenerateCareerProfileCvResponse =
  | OnlineCV
  | { onlineCv: OnlineCV; profileVersion?: number };

import type {
  CandidateCareerProfile,
  CandidateCareerProfileInput,
  GenerateCareerProfileCvRequest,
} from './careerProfileTypes';


export const careerProfileApi = {
  getMe: (accessToken?: string | null) =>
    apiRequest<CandidateCareerProfile>('/candidate-career-profile/me', {
      accessToken,
    }),

  updateMe: (
    profile: CandidateCareerProfileInput,
    accessToken?: string | null,
  ) =>
    apiRequest<CandidateCareerProfile>('/candidate-career-profile/me', {
      method: 'PUT',
      body: profile,
      accessToken,
    }),

  generateCv: (
    request: GenerateCareerProfileCvRequest,
    accessToken?: string | null,
  ) =>
    apiRequest<GenerateCareerProfileCvResponse>(
      '/online-cvs/generate-from-career-profile',
      {
        method: 'POST',
        body: request,
        accessToken,
      },
    ),

  generateCvJob: (
    request: GenerateCareerProfileCvRequest,
    idempotencyKey: string,
    accessToken?: string | null,
  ) =>
    apiRequest<GenerateOnlineCVJobAcceptedResponse>(
      '/online-cvs/generation-jobs/from-career-profile',
      {
        method: 'POST',
        body: request as GenerateOnlineCVJobRequest,
        headers: { 'Idempotency-Key': idempotencyKey },
        accessToken,
      },
    ),
};
