export const DEFAULT_AI_LOCALE = 'en';
export const AI_LOCALE_PATTERN = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{2,8})?$/;

export enum AiChatSessionMode {
  JOB_SEARCH = 'JOB_SEARCH',
  CV_ANALYSIS = 'CV_ANALYSIS',
  CV_JOB_COMPARISON = 'CV_JOB_COMPARISON',
  ADVICE = 'ADVICE',
}

export enum AiChatMessageRole {
  USER = 'USER',
  ASSISTANT = 'ASSISTANT',
}
export enum AiChatMessageStatus {
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}
export enum AiQuotaReservationStatus {
  RESERVED = 'RESERVED',
  COMMITTED = 'COMMITTED',
  RELEASED = 'RELEASED',
}

export interface CandidateAssistantJobContext {
  id: string;
  title: string;
  description: string | null;
  skills: string[];
  location: string | null;
  level: string | null;
  salary: number | null;
  company: { id: string; name: string } | null;
  jobSourceVersion: string;
}

export interface CandidateAssistantCitation {
  sourceId: string;
  sourceType: 'JOB' | 'CV' | 'APPLICATION';
  label?: string;
}
export interface CandidateAssistantBlock {
  type: string;
  text?: string;
  data?: Record<string, unknown>;
}
export interface CandidateAssistantResponse {
  blocks: CandidateAssistantBlock[];
  citations: CandidateAssistantCitation[];
  filterState?: Record<string, unknown> | null;
}

export interface CandidateAssistantAiRequest {
  requestId: string;
  traceId: string;
  operationAttemptId: string;
  clientMessageId: string;
  userId: string;
  sessionId: string;
  mode: AiChatSessionMode;
  /** Locale requested by the client; omitted by legacy callers. */
  locale?: string;
  message: string;
  history: Array<{ role: AiChatMessageRole; content: string }>;
  jobs: CandidateAssistantJobContext[];
  cv?: {
    cvId: string;
    contentHash: string;
    contentVersion: string;
    title: string | null;
    skills: string[];
    education: string[];
    experience: string[];
    certificates: string[];
    sanitizedText: string;
  };
  filters: Record<string, unknown>;
  consentVersion?: string;
}

export interface CandidateAssistantAiClient {
  generate(
    request: CandidateAssistantAiRequest,
  ): Promise<CandidateAssistantResponse>;
}

export const CANDIDATE_ASSISTANT_AI_CLIENT = Symbol(
  'CANDIDATE_ASSISTANT_AI_CLIENT',
);
