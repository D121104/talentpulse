import { apiRequest, ApiError } from "./api";
import type { OnlineCV, UserCV } from "./cvTypes";

export type AssistantMode =
  | "JOB_SEARCH"
  | "CV_ANALYSIS"
  | "CV_JOB_COMPARISON"
  | "ADVICE";
export type AssistantState = "READY" | "DEGRADED" | "NO_EVIDENCE";

export const SUPPORTED_ASSISTANT_LOCALES = [
  "vi",
  "vi-VN",
  "en",
  "en-US",
] as const;
export type AssistantLocale = (typeof SUPPORTED_ASSISTANT_LOCALES)[number];
export const DEFAULT_ASSISTANT_LOCALE = "vi" as const;

/** Validate locale tags accepted by both the UI and assistant API. */
export function normalizeAssistantLocale(
  locale?: string,
): AssistantLocale | undefined {
  if (locale === undefined) return undefined;
  const normalized = locale.trim().toLowerCase();
  const supported = SUPPORTED_ASSISTANT_LOCALES.find(
    (candidate) => candidate.toLowerCase() === normalized,
  );
  if (!supported) throw new Error(`Unsupported assistant locale: ${locale}`);
  return supported;
}

/** Resolve i18next's selected language to the API's canonical base locale. */
export function assistantLocaleForUi(language?: string): "vi" | "en" {
  if (!language) return DEFAULT_ASSISTANT_LOCALE;
  const normalized = language.trim().toLowerCase();
  const supported = SUPPORTED_ASSISTANT_LOCALES.some(
    (candidate) => candidate.toLowerCase() === normalized,
  );
  if (!supported) return DEFAULT_ASSISTANT_LOCALE;
  return normalized.startsWith("en") ? "en" : "vi";
}

export interface AssistantFilterInput {
  location?: string;
  workMode?: "onsite" | "hybrid" | "remote";
  employmentType?: string;
  experienceLevel?: string;
  minSalary?: number;
  maxSalary?: number;
  skills?: string[];
}

export interface AssistantCitation {
  sourceId: string;
  sourceType: "JOB" | "CV" | "APPLICATION";
  label?: string;
}

export interface AssistantBlock {
  type: string;
  text?: string;
  data?: Record<string, unknown>;
}

export interface AssistantGenerationMetadata {
  source: "llm" | "deterministic_fallback";
  fallbackReason: null | "provider_error" | "validation_error" | "locale_mismatch" | "insufficient_evidence" | "empty_answer";
}

export interface AssistantMessage {
  _id: string;
  role: "USER" | "ASSISTANT";
  status: "PROCESSING" | "COMPLETED" | "FAILED";
  content: string | null;
  clientMessageId: string | null;
  blocks: AssistantBlock[] | null;
  citations: AssistantCitation[] | null;
  generationMetadata: AssistantGenerationMetadata | null;
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
  key: string;
  id: string;
  title: string;
  source: "online" | "upload";
  disabled: boolean;
  status?: string;
}

export interface AssistantConsentPolicy {
  purpose: string;
  consentVersion: string;
  policyHash: string;
}

export interface AssistantConsent {
  _id: string;
  consentVersion: string;
  policyHash: string;
  status: "GRANTED" | "REVOKED";
  grantedAt?: string | null;
  revokedAt?: string | null;
}

export interface AssistantQuota {
  usedToday: number;
  limit: number | null;
  remaining: number | null;
  isUnlimited: boolean;
  timezone: string;
}

export interface AssistantConsentMutation extends Pick<AssistantConsentPolicy, "consentVersion" | "policyHash"> {
  source: string;
  sourceMetadata?: Record<string, string>;
}

export const assistantApi = {
  createSession: (mode: AssistantMode, accessToken: string) =>
    apiRequest<AssistantSession>("/ai/candidate-assistant/sessions", {
      method: "POST",
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
      cvSource?: "upload" | "online";
      filters?: AssistantFilterInput;
      /** Optional for backwards compatibility; UI callers send an explicit locale. */
      locale?: string;
    },
    accessToken: string
  ) => {
    const locale = normalizeAssistantLocale(input.locale);
    return apiRequest<AssistantSessionResponse>(
      `/ai/candidate-assistant/sessions/${encodeURIComponent(
        sessionId
      )}/messages`,
      {
        method: "POST",
        body: locale ? { ...input, locale } : input,
        accessToken,
      },
    );
  },

  quota: (accessToken: string) =>
    apiRequest<AssistantQuota>("/ai/candidate-assistant/quota", {
      accessToken,
    }),

  listCvOptions: async (accessToken: string): Promise<AssistantCvOption[]> => {
    const [uploaded, online] = await Promise.all([
      apiRequest<UserCV[]>("/user-cvs", { accessToken }),
      apiRequest<OnlineCV[]>("/online-cvs", { accessToken }),
    ]);
    const onlineIds = new Set(online.map((cv) => cv._id));
    return [
      ...uploaded.filter((cv) => !cv.onlineCvId || !onlineIds.has(cv.onlineCvId)).map((cv): AssistantCvOption => {
        // Linked CVs are refreshed from current online content by the server.
        const ready = Boolean(cv.onlineCvId) || (cv.parseStatus === "READY" &&
          Boolean(cv.contentHash?.trim()) && Boolean(cv.parsedText?.trim()));
        const status = ready ? undefined : cv.parseStatus === "PENDING"
          ? "Đang chờ xử lý" : cv.parseStatus === "PROCESSING"
            ? "Đang xử lý" : cv.parseStatus === "FAILED"
              ? "Xử lý thất bại · hãy tải lại CV" : "Không đọc được nội dung · hãy tải lại CV";
        return {
        key: `upload:${cv._id}`,
        id: cv._id,
        title: cv.title || "CV của tôi",
        source: "upload",
        disabled: !ready,
        status,
      };
      }),
      ...online.map((cv): AssistantCvOption => ({
        key: `online:${cv._id}`,
        id: cv._id,
        title: cv.title || cv.fullName || "CV online",
        source: "online",
        disabled: false,
      })),
    ];
  },

  consentPolicy: (accessToken: string) =>
    apiRequest<AssistantConsentPolicy>(
      "/ai/candidate-assistant/consent/policy",
      { accessToken }
    ),

  currentConsent: (accessToken: string) =>
    apiRequest<AssistantConsent | null>(
      "/ai/candidate-assistant/consent/current",
      { accessToken }
    ),

  grantConsent: (input: AssistantConsentMutation, accessToken: string) =>
    apiRequest<AssistantConsent>("/ai/candidate-assistant/consent/grant", {
      method: "POST",
      body: input,
      accessToken,
    }),

  revokeConsent: (input: AssistantConsentMutation, accessToken: string) =>
    apiRequest<AssistantConsent>("/ai/candidate-assistant/consent/revoke", {
      method: "POST",
      body: input,
      accessToken,
    }),
};

export function isAssistantUnavailable(error: unknown): boolean {
  return error instanceof ApiError && [404, 405, 501].includes(error.status);
}

export function getAssistantErrorCode(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  return error.code ?? null;
}
