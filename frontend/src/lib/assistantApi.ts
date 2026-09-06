import { apiRequest, ApiError } from './api';
import type { UserCV, OnlineCV } from './cvTypes';

export type AssistantMode = 'JOB_SEARCH' | 'CV_ANALYSIS' | 'CV_JOB_COMPARISON' | 'ADVICE';
export type AssistantState = 'READY' | 'DEGRADED' | 'NO_EVIDENCE';

export interface AssistantFilterInput {
  location?: string;
  workMode?: 'onsite' | 'hybrid' | 'remote';
  employmentType?: string;
  experienceLevel?: string;
  minSalary?: number;
  maxSalary?: number;
  skills?: string[];
}

export interface AssistantCitation {
  sourceId: string;
  sourceType: 'JOB' | 'CV' | 'APPLICATION';
  label?: string;
}

export interface AssistantBlock {
  type: string;
  text?: string;
  data?: Record<string, unknown>;
}

export interface AssistantMessage {
  _id: string;
  role: 'USER' | 'ASSISTANT';
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  content: string | null;
  clientMessageId: string | null;
  blocks: AssistantBlock[] | null;
  citations: AssistantCitation[] | null;
  filterState?: Record<string, unknown> | null;
  errorCode?: string | null;
  createdAt: string;
}

export interface AssistantSession {
  _id: string;
  mode: AssistantMode;
  title?: string | null;
  archivedAt?: string | null;
}

export interface AssistantSessionResponse {
  userMessage: AssistantMessage;
  assistantMessage?: AssistantMessage;
}

export interface AssistantCvOption {
  id: string;
  title: string;
  source: 'online' | 'uploaded';
}

export interface AssistantConsentPolicy {
  consentVersion: string;
  policyHash: string;
}

export interface AssistantConsent {
  _id: string;
  consentVersion: string;
  policyHash: string;
  status: 'GRANTED' | 'REVOKED';
  grantedAt?: string | null;
  revokedAt?: string | null;
}

export interface AssistantConsentMutation extends AssistantConsentPolicy {
  source: string;
  sourceMetadata?: Record<string, string>;
}

export const assistantApi = {
  createSession: (mode: AssistantMode, accessToken: string) =>
    apiRequest<AssistantSession>('/ai/candidate-assistant/sessions', {
      method: 'POST',
      body: { mode },
      accessToken,
    }),

  sendMessage: (
    sessionId: string,
    input: {
      content: string;
      clientMessageId: string;
      jobIds?: string[];
      cvId?: string;
      filters?: AssistantFilterInput;
    },
    accessToken: string,
  ) =>
    apiRequest<AssistantSessionResponse>(`/ai/candidate-assistant/sessions/${encodeURIComponent(sessionId)}/messages`, {
      method: 'POST',
      body: input,
      accessToken,
    }),

  listCvOptions: async (accessToken: string): Promise<AssistantCvOption[]> => {
    const [online, uploaded] = await Promise.all([
      apiRequest<OnlineCV[]>('/online-cvs', { accessToken }),
      apiRequest<UserCV[]>('/user-cvs', { accessToken }),
    ]);
    return [
      ...online.map((cv) => ({ id: cv._id, title: cv.title || cv.fullName || 'Online CV', source: 'online' as const })),
      ...uploaded.map((cv) => ({ id: cv._id, title: cv.title || 'Uploaded CV', source: 'uploaded' as const })),
    ];
  },

  currentConsent: (accessToken: string) =>
    apiRequest<AssistantConsent | null>('/ai/candidate-assistant/consent/current', { accessToken }),

  grantConsent: (input: AssistantConsentMutation, accessToken: string) =>
    apiRequest<AssistantConsent>('/ai/candidate-assistant/consent/grant', { method: 'POST', body: input, accessToken }),

  revokeConsent: (input: AssistantConsentMutation, accessToken: string) =>
    apiRequest<AssistantConsent>('/ai/candidate-assistant/consent/revoke', { method: 'POST', body: input, accessToken }),
};

export function isAssistantUnavailable(error: unknown): boolean {
  return error instanceof ApiError && [404, 405, 501].includes(error.status);
}

export function getAssistantErrorCode(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  return error.code ?? null;
}
