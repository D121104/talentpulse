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
  message: string;
  history: Array<{ role: AiChatMessageRole; content: string }>;
  jobs: CandidateAssistantJobContext[];
  cv?: {
    cvId: string;
    contentHash: string;
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
