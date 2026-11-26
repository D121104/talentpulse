import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Bot,
  ChevronDown,
  Filter,
  Loader2,
  MessageCircle,
  RefreshCw,
  Send,
  X,
} from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import {
  assistantApi,
  assistantLocaleForUi,
  getAssistantErrorCode,
  isAssistantUnavailable,
  type AssistantFilterInput,
  type AssistantMessage,
  type AssistantMode,
  type AssistantSession,
} from "../../lib/assistantApi";
import type { AssistantCvOption } from "../../lib/assistantApi";

interface ChatMessage {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  state?: "NO_EVIDENCE";
  citations?: AssistantMessage["citations"];
  generationMetadata?: AssistantMessage["generationMetadata"];
  clientMessageId?: string;
}

const MAX_HISTORY = 12;
const modes: Array<{ value: AssistantMode; label: string }> = [
  { value: "JOB_SEARCH", label: "Tìm việc" },
  { value: "CV_JOB_COMPARISON", label: "Hỏi về việc" },
  { value: "CV_ANALYSIS", label: "Rà soát CV" },
  { value: "ADVICE", label: "Tư vấn nghề nghiệp" },
];

function modeAllowsCv(assistantMode: AssistantMode): boolean {
  return (
    assistantMode === "CV_ANALYSIS" ||
    assistantMode === "CV_JOB_COMPARISON"
  );
}

const JOB_METADATA_PATTERN =
  /\s*\(\s*job_id:\s*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\s*;\s*citation:\s*\[[^\]]+\]\s*\)/gi;
const METADATA_ONLY_PATTERN =
  /^\s*(?:[-*]\s*)?job_id:\s*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\s*$/i;
const INLINE_MARKDOWN_PATTERN = /(\*\*[^*\n]+\*\*|`[^`\n]+`)/g;

type AssistantContentBlock =
  | { kind: "text"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] };

function assistantContentBlocks(content: string): AssistantContentBlock[] {
  const blocks: AssistantContentBlock[] = [];
  let list: Extract<AssistantContentBlock, { kind: "list" }> | null = null;
  const flushList = () => {
    if (list) blocks.push(list);
    list = null;
  };
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || METADATA_ONLY_PATTERN.test(line)) {
      flushList();
      continue;
    }
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    const item = line.match(/^([-*]|\d+[.)])\s+(.+)$/);
    if (heading) {
      flushList();
      blocks.push({ kind: "heading", text: heading[1] });
    } else if (item) {
      const ordered = /^\d/.test(item[1]);
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { kind: "list", ordered, items: [] };
      }
      list.items.push(item[2]);
    } else {
      flushList();
      blocks.push({ kind: "text", text: line });
    }
  }
  flushList();
  return blocks;
}

function formatSalaryText(text: string, locale: string): string {
  const scientific = /(?<![\w.])\d+(?:\.\d+)?e[+-]?\d+(?![\w.])/gi;
  const currency = /^\s*(?:(?:VND|VNĐ|USD|EUR|GBP|JPY)\b|[₫đ$€£](?!\p{L}))/iu;
  return text.replace(scientific, (value, offset: number) => {
    const before = text.slice(0, offset);
    const after = text.slice(offset + value.length);
    // Only the amount/range immediately after a salary label, or beside currency.
    const salaryPrefix = /(?:salary|mức lương|lương|compensation|pay)\s*[:：]?\s*(?:[\d.,e+-]+\s*(?:-|–|to|đến)\s*)?$/i;
    if (!salaryPrefix.test(before) && !currency.test(after) && !/(?:USD|EUR|GBP|VND|\$|€|£)\s*$/i.test(before)) return value;
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0 || amount > Number.MAX_SAFE_INTEGER) return value;
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 20 }).format(amount);
  });
}

type InlinePart = { text: string; sourceId?: string };

function assistantInlineParts(text: string, citations: AssistantMessage["citations"] = null): InlinePart[] {
  const jobs = citations?.filter((citation) => citation.sourceType === "JOB") ?? [];
  const explicitIds = [...text.matchAll(/(?:job_id:\s*|\bjob:)([0-9a-f-]{36})/gi)].map((match) => match[1].toLowerCase());
  const clean = text.replace(JOB_METADATA_PATTERN, "");
  const candidates = jobs.filter((job) => job.label && (explicitIds.length === 0 || explicitIds.includes(job.sourceId.toLowerCase())));
  const matches: Array<{ start: number; end: number; sourceId: string }> = [];
  for (const job of candidates) {
    const label = job.label!;
    if (new Set(candidates.filter((item) => item.label === label).map((item) => item.sourceId)).size !== 1) continue;
    let start = clean.indexOf(label);
    while (start !== -1) {
      const end = start + label.length;
      if (!/[\p{L}\p{N}_]/u.test(clean[start - 1] ?? "") && !/[\p{L}\p{N}_]/u.test(clean[end] ?? "")) matches.push({ start, end, sourceId: job.sourceId });
      start = clean.indexOf(label, end);
    }
  }
  // Overlapping titles cannot establish which job the sentence refers to.
  const unique = matches.filter((match, index) => !matches.some((other, otherIndex) => index !== otherIndex && match.start < other.end && other.start < match.end));
  const parts: InlinePart[] = [];
  let cursor = 0;
  for (const match of unique.sort((a, b) => a.start - b.start)) {
    parts.push({ text: clean.slice(cursor, match.start) }, { text: clean.slice(match.start, match.end), sourceId: match.sourceId });
    cursor = match.end;
  }
  parts.push({ text: clean.slice(cursor) });
  return parts;
}

function renderAssistantInline(text: string, citations: AssistantMessage["citations"] = null): ReactNode {
  if (text.includes("**") || text.includes("`")) return text.split(INLINE_MARKDOWN_PATTERN).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{renderAssistantInline(part.slice(2, -2), citations)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index} className="rounded bg-slate-100 px-1 dark:bg-slate-700">{part.slice(1, -1)}</code>;
    return <span key={index}>{renderAssistantLinks(part, citations)}</span>;
  });
  return renderAssistantLinks(text, citations);
}

function renderAssistantLinks(text: string, citations: AssistantMessage["citations"]): ReactNode {
  return assistantInlineParts(text, citations).map((part, index) => part.sourceId ? (
    <Link key={index} to={`/jobs/${encodeURIComponent(part.sourceId)}`} className="font-bold text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary focus-visible:outline-primary">{part.text}</Link>
  ) : <span key={index}>{part.text}</span>);
}

function AssistantMessageContent({ content, citations, locale }: { content: string; citations: AssistantMessage["citations"]; locale: string }) {
  return (
    <div className="min-w-0 space-y-2 break-words [overflow-wrap:anywhere]">
      {assistantContentBlocks(formatSalaryText(content, locale)).map((block, index) => {
        if (block.kind === "heading")
           return <h3 key={index} className="font-bold text-slate-900 dark:text-white">{renderAssistantInline(block.text, citations)}</h3>;
        if (block.kind === "list") {
          const List = block.ordered ? "ol" : "ul";
          return <List key={index} className={`${block.ordered ? "list-decimal" : "list-disc"} space-y-1 pl-5`}>
            {block.items.map((item, itemIndex) => <li key={itemIndex}>{renderAssistantInline(item, citations)}</li>)}
          </List>;
        }
        return <p key={index} className="whitespace-pre-wrap">{renderAssistantInline(block.text, citations)}</p>;
      })}
    </div>
  );
}

function AssistantMessageProvenance({ metadata }: { metadata: AssistantMessage["generationMetadata"] | undefined }) {
  if (!metadata) return null;
  if (metadata.source === "llm") {
    return <p className="mt-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">Nội dung do AI tạo</p>;
  }
  const reasons: Record<NonNullable<typeof metadata.fallbackReason>, string> = {
    provider_error: "Dịch vụ tạo nội dung AI tạm thời không phản hồi.",
    validation_error: "Nội dung AI tạo chưa đáp ứng yêu cầu kiểm tra của hệ thống.",
    locale_mismatch: "Nội dung AI tạo chưa đúng ngôn ngữ yêu cầu.",
    insufficient_evidence: "Chưa có đủ dữ liệu để tạo câu trả lời có căn cứ.",
    empty_answer: "AI chưa trả về nội dung trả lời.",
  };
  return (
    <details className="mt-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
      <summary className="cursor-pointer rounded focus-visible:outline-primary">Phản hồi dự phòng</summary>
      <p>{metadata.fallbackReason ? reasons[metadata.fallbackReason] : "Hệ thống dùng phản hồi dự phòng; chưa có thông tin về lý do."}</p>
    </details>
  );
}

function makeClientMessageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, "0")}`;
}

export default function CandidateAssistant() {
  const { user, accessToken } = useAuth();
  const { i18n } = useTranslation();
  const location = useLocation();
  const isHrOnlyRoute =
    location.pathname === "/dashboard" ||
    location.pathname.startsWith("/hr/") ||
    location.pathname.startsWith("/employer/");
  const isAdmin = user?.role === "ADMIN";
  const isCandidate = user?.role === "USER" || isAdmin;
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<AssistantMode>("JOB_SEARCH");
  const [session, setSession] = useState<AssistantSession | null>(null);
  const [hasConsent, setHasConsent] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [cvOptions, setCvOptions] = useState<AssistantCvOption[]>([]);
  const [selectedCvId, setSelectedCvId] = useState("");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const wasLoadingRef = useRef(false);
  const [filters, setFilters] = useState<AssistantFilterInput>({});
  const [quota, setQuota] = useState<Awaited<
    ReturnType<typeof assistantApi.quota>
  > | null>(null);
  const visibleMessages = useMemo(
    () => messages.slice(-MAX_HISTORY),
    [messages],
  );
  const authIdentity = `${user?._id ?? "guest"}:${accessToken ?? "none"}`;
  const identityRef = useRef(authIdentity);
  identityRef.current = authIdentity;
  const cvAllowed = modeAllowsCv(mode);
  const assistantLocale = assistantLocaleForUi(
    i18n.resolvedLanguage || i18n.language,
  );

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen, session]);

  useEffect(() => {
    const requestSettled = wasLoadingRef.current && !isLoading;
    wasLoadingRef.current = isLoading;
    if (
      requestSettled &&
      isOpen &&
      document.hasFocus() &&
      (!document.activeElement || document.activeElement === document.body)
    ) {
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [isLoading, isOpen]);

  useEffect(() => {
    if (isOpen) messageEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [isOpen, messages, isLoading, error]);

  const closeAssistant = () => {
    setIsOpen(false);
    launcherRef.current?.focus();
  };

  useEffect(() => {
    setIsOpen(false);
    setSession(null);
    setHasConsent(false);
    setMessage("");
    setMessages([]);
    setIsLoading(false);
    setError("");
    setCvOptions([]);
    setSelectedCvId("");
    setSelectedJobId("");
    setShowFilters(false);
    setFilters({});
    setQuota(null);
  }, [authIdentity]);

  useEffect(() => {
    if (!isOpen || !accessToken || !isCandidate) return;
    let active = true;
    setError("");
    void Promise.all([
      isAdmin ? Promise.resolve(null) : assistantApi.currentConsent(accessToken),
      assistantApi.listCvOptions(accessToken),
    ])
      .then(([consent, options]) => {
        if (!active) return;
        const granted = isAdmin || consent?.status === "GRANTED";
        setHasConsent(granted);
        setCvOptions(options);
        setSelectedCvId((current) => options.some((cv) => cv.key === current && !cv.disabled) ? current : "");
        return assistantApi.quota(accessToken).then((currentQuota) => {
          if (!active) return;
          setQuota(currentQuota);
          if (granted && !session)
            return assistantApi
              .createSession(mode, accessToken)
              .then((created) => { if (active) setSession(created); });
          return undefined;
        });
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setHasConsent(false);
        setError(
          getAssistantErrorCode(requestError) === "AI_CONSENT_REQUIRED"
            ? "Bạn cần cấp đồng ý trợ lý AI trong phần quản lý CV trước khi sử dụng."
            : "Trợ lý AI chưa sẵn sàng ở môi trường này.",
        );
      });
    return () => { active = false; };
  }, [accessToken, isAdmin, isCandidate, isOpen, mode, session]);

  if (isHrOnlyRoute || !isCandidate) return null;

  const sendMessage = async (
    content = message,
    retryClientMessageId?: string,
  ) => {
    const text = content.trim();
    if (!text || isLoading || !accessToken || !session || (!isAdmin && !hasConsent)) return;
    const selectedCv = cvAllowed ? cvOptions.find((cv) => cv.key === selectedCvId && !cv.disabled) : undefined;
    if (cvAllowed && selectedCvId && !selectedCv) {
      setSelectedCvId("");
      setError("CV đã chọn không còn khả dụng. Hãy chọn lại CV.");
      return;
    }
    const clientMessageId = retryClientMessageId || makeClientMessageId();
    const requestIdentity = authIdentity;
    setMessages((current) =>
      retryClientMessageId
        ? current
        : [
            ...current,
            {
              id: clientMessageId,
              role: "USER" as const,
              content: text,
              clientMessageId,
            },
          ].slice(-MAX_HISTORY),
    );
    setMessage("");
    setError("");
    setIsLoading(true);
    try {
      const response = await assistantApi.sendMessage(
        session._id,
        {
          content: text,
          clientMessageId,
          ...(selectedCv
            ? { cvId: selectedCv.id, cvSource: selectedCv.source }
            : {}),
          jobIds: selectedJobId ? [selectedJobId] : undefined,
          filters,
          locale: assistantLocale,
        },
        accessToken,
      );
      if (identityRef.current !== requestIdentity) return;
      const assistant = response.assistantMessage;
      if (!assistant)
        throw new Error("AI response did not include an assistant message");
      const state: ChatMessage["state"] =
        assistant.status === "FAILED" ||
        !assistant.content ||
        assistant.blocks?.some((block) => block.type === "NO_EVIDENCE")
          ? "NO_EVIDENCE"
          : undefined;
      setMessages((current) =>
        [
          ...current,
          {
            id: assistant._id,
            role: "ASSISTANT" as const,
            content: assistant.content || "Chưa có đủ bằng chứng để trả lời.",
            state,
            citations: assistant.citations,
            generationMetadata: assistant.generationMetadata ?? null,
          },
        ].slice(-MAX_HISTORY),
      );
    } catch (requestError) {
      if (identityRef.current !== requestIdentity) return;
      const errorCode = getAssistantErrorCode(requestError);
      if (errorCode === "AI_CONSENT_REQUIRED") setHasConsent(false);
      if (errorCode === "CV_NOT_READY") {
        setSelectedCvId("");
        void assistantApi.listCvOptions(accessToken).then((options) => {
          if (identityRef.current === requestIdentity) setCvOptions(options);
        }).catch(() => {
          if (identityRef.current === requestIdentity) setCvOptions([]);
        });
      }
      setError(
        errorCode === "AI_CONSENT_REQUIRED"
          ? "Đồng ý trợ lý AI không còn hiệu lực. Hãy kiểm tra lại phần quản lý CV."
          : errorCode === "CV_NOT_READY"
            ? "CV chưa có nội dung đọc được để phân tích. Với CV online, hãy bổ sung nội dung; với tệp tải lên, hãy kiểm tra trạng thái xử lý tại Quản lý CV."
            : isAssistantUnavailable(requestError)
              ? "Trợ lý AI chưa được bật ở môi trường này."
              : "Không thể kết nối trợ lý AI. Bạn có thể thử lại.",
      );
    } finally {
      if (identityRef.current === requestIdentity) setIsLoading(false);
    }
  };

  const retry = () => {
    const last = visibleMessages[visibleMessages.length - 1];
    if (last?.role === "USER")
      void sendMessage(last.content, last.clientMessageId || last.id);
  };

  return (
    <div className="fixed bottom-4 right-4 z-[60] sm:bottom-6 sm:right-6">
      {isOpen && (
        <section
          id="candidate-assistant"
          className="mb-3 flex h-[min(720px,calc(100dvh-6rem))] w-[min(440px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 [&_button]:focus-visible:outline-none [&_button]:focus-visible:ring-2 [&_button]:focus-visible:ring-primary [&_button]:focus-visible:ring-offset-2 [&_input]:focus-visible:outline-primary [&_select]:focus-visible:outline-primary"
          role="region"
          aria-labelledby="assistant-title"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              closeAssistant();
            }
          }}
        >
          <header className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Bot className="h-5 w-5" aria-hidden="true" /></span>
              <div>
                <h2 id="assistant-title" className="text-sm font-bold text-slate-900 dark:text-white">Trợ lý TalentPulse</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Việc làm & định hướng nghề nghiệp
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={closeAssistant}
              className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Đóng trợ lý"
            >
              <X className="h-5 w-5" />
            </button>
          </header>
          <div className="max-h-[35%] shrink-0 space-y-3 overflow-y-auto border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Chế độ
              <select
                disabled={isLoading}
                value={mode}
                onChange={(event) => {
                  const nextMode = event.target.value as AssistantMode;
                  setMode(nextMode);
                  if (!modeAllowsCv(nextMode)) setSelectedCvId("");
                  setSession(null);
                }}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                {modes.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" aria-expanded={showContext} aria-controls="assistant-context" onClick={() => setShowContext((current) => !current)} className="flex min-h-10 w-full items-center justify-between rounded-lg px-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800">
              <span>CV, việc làm & bộ lọc{selectedCvId || selectedJobId || Object.values(filters).some(Boolean) ? " · Đã tùy chỉnh" : " · Tùy chọn"}</span>
              <ChevronDown aria-hidden="true" className={`h-4 w-4 transition ${showContext ? "rotate-180" : ""}`} />
            </button>
            {showContext && <fieldset id="assistant-context" disabled={isLoading} className="space-y-3 disabled:opacity-60">
            <legend className="sr-only">Ngữ cảnh câu hỏi</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <select
                value={selectedCvId}
                onChange={(event) => setSelectedCvId(event.target.value)}
                disabled={!cvAllowed || cvOptions.length === 0}
                aria-label={cvAllowed ? "Chọn CV" : "CV không áp dụng ở chế độ này"}
                title={
                  cvAllowed
                    ? "Chọn CV để rà soát hoặc so sánh với việc"
                    : "CV chỉ dùng trong chế độ Rà soát CV hoặc Hỏi về việc"
                }
                className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="">
                  {cvAllowed ? "Không chọn CV" : "CV không áp dụng ở chế độ này"}
                </option>
                {cvOptions.map((cv) => (
                  <option key={cv.key} value={cv.key} disabled={cv.disabled}>
                    {cv.title}{cv.status ? ` · ${cv.status}` : ""}
                  </option>
                ))}
              </select>
              {cvAllowed && (
                <p className="col-span-2 text-[11px] text-slate-500">
                  {cvOptions.length === 0
                    ? "Bạn chưa có CV. Hãy thêm CV tại Quản lý CV."
                    : "Chọn CV tải lên đã xử lý xong hoặc CV online. CV online dùng nội dung hiện tại; CV trống không thể phân tích."}{" "}
                  <Link to="/my-cv" className="underline">Quản lý CV</Link>
                </p>
              )}
              {!cvAllowed && (
                <p className="col-span-2 text-[11px] text-slate-500">
                  CV chỉ dùng trong chế độ Rà soát CV hoặc Hỏi về việc.
                </p>
              )}
              <input
                value={selectedJobId}
                onChange={(event) => setSelectedJobId(event.target.value)}
                placeholder="Job ID (tuỳ chọn)"
                aria-label="Mã việc làm (tùy chọn)"
                className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowFilters((current) => !current)}
              aria-expanded={showFilters}
              aria-controls="assistant-filters"
              className="inline-flex items-center gap-1 text-xs font-bold text-primary"
            >
              <Filter className="h-3.5 w-3.5" /> Bộ lọc tìm việc{" "}
              <ChevronDown
                className={`h-3.5 w-3.5 transition ${showFilters ? "rotate-180" : ""}`}
              />
            </button>
            {showFilters && (
              <div id="assistant-filters" className="grid grid-cols-2 gap-2">
                <input
                  value={filters.location || ""}
                  onChange={(event) =>
                    setFilters({
                      ...filters,
                      location: event.target.value || undefined,
                    })
                  }
                  placeholder="Địa điểm"
                  aria-label="Địa điểm"
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                <select
                  aria-label="Hình thức làm việc"
                  value={filters.workMode || ""}
                  onChange={(event) =>
                    setFilters({
                      ...filters,
                      workMode: (event.target.value ||
                        undefined) as AssistantFilterInput["workMode"],
                    })
                  }
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="">Hình thức</option>
                  <option value="remote">Remote</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="onsite">Onsite</option>
                </select>
                <input
                  value={filters.experienceLevel || ""}
                  onChange={(event) =>
                    setFilters({
                      ...filters,
                      experienceLevel: event.target.value || undefined,
                    })
                  }
                  placeholder="Kinh nghiệm"
                  aria-label="Kinh nghiệm"
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                <input
                  value={filters.skills?.join(", ") || ""}
                  onChange={(event) =>
                    setFilters({
                      ...filters,
                      skills:
                        event.target.value
                          .split(",")
                          .map((skill) => skill.trim())
                          .filter(Boolean) || undefined,
                    })
                  }
                  placeholder="Kỹ năng, cách nhau bằng dấu phẩy"
                  aria-label="Kỹ năng, cách nhau bằng dấu phẩy"
                  className="col-span-2 rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
            )}
            </fieldset>}
            <p className="text-[11px] text-slate-500">
              Hạn mức AI hôm nay:{" "}
              {quota
                ? quota.isUnlimited
                  ? "không giới hạn"
                  : `${quota.remaining ?? 0}/${quota.limit ?? 0} lượt còn lại`
                : "đang tải…"}{" "}
              (UTC+7).
            </p>
          </div>
          <div role="log" aria-label="Hội thoại với trợ lý" aria-relevant="additions" className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-slate-50/70 p-4 dark:bg-slate-950/40">
            {!isAdmin && !hasConsent && (
              <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-4 text-xs text-amber-800">
                Bạn cần đồng ý cho trợ lý AI sử dụng dữ liệu trong trang{" "}
                <Link to="/my-cv" className="font-bold underline">
                  Quản lý CV
                </Link>
                .
              </div>
            )}
            {visibleMessages.length === 0 && hasConsent && (
              <div className="py-4">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Bạn muốn tìm hiểu điều gì?</h3>
                <p className="mb-4 mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">Chọn chế độ phía trên, rồi đặt câu hỏi. Bạn có thể bắt đầu với gợi ý sau.</p>
                {(mode === "JOB_SEARCH" ? ["Tìm việc frontend làm từ xa", "Tìm việc cho lập trình viên mới ra trường"] : mode === "CV_ANALYSIS" ? ["CV của tôi cần cải thiện những điểm nào?"] : mode === "CV_JOB_COMPARISON" ? ["CV của tôi phù hợp với công việc này như thế nào?"] : ["Tôi nên chuẩn bị gì cho buổi phỏng vấn?"]).map((prompt) => (
                  <button key={prompt} type="button" disabled={!session || isLoading} onClick={() => { setMessage(prompt); inputRef.current?.focus(); }} className="mb-2 block w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-left text-sm text-slate-700 transition hover:border-primary hover:text-primary disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">{prompt}</button>
                ))}
              </div>
            )}
            {visibleMessages.map((item) => (
              <div
                key={item.id}
                className={`max-w-[95%] rounded-2xl px-4 py-3 text-sm leading-7 ${item.role === "USER" ? "ml-auto rounded-br-md bg-primary text-white" : "rounded-bl-md border border-slate-100 bg-white text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}
              >
                <span className="sr-only">{item.role === "USER" ? "Bạn: " : "Trợ lý: "}</span>
                {item.role === "ASSISTANT" ? (
                  <AssistantMessageContent content={item.content} citations={item.citations ?? null} locale={assistantLocale} />
                ) : (
                  <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                    {item.content}
                  </p>
                )}
                {item.state === "NO_EVIDENCE" && (
                  <p className="mt-2 text-[11px] font-bold text-amber-600">
                    Chưa đủ dữ liệu để kết luận.
                  </p>
                )}
                {item.role === "ASSISTANT" && <AssistantMessageProvenance metadata={item.generationMetadata} />}
              </div>
            ))}
            {isLoading && (
              <div role="status" className="flex items-center gap-2 rounded-2xl bg-white p-3 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin" /> Đang suy nghĩ...
              </div>
            )}
            {error && (
              <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">
                <p>{error}</p>
                {visibleMessages[visibleMessages.length - 1]?.role === "USER" && <button
                  type="button"
                  disabled={isLoading}
                  onClick={retry}
                  className="mt-1 inline-flex items-center gap-1 font-bold"
                >
                  <RefreshCw className="h-3 w-3" /> Thử lại
                </button>}
              </div>
            )}
            <div ref={messageEndRef} />
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage();
            }}
            className="shrink-0 border-t border-slate-100 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
          >
            <label htmlFor="assistant-question" className="sr-only">Câu hỏi cho trợ lý</label>
            <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              id="assistant-question"
              rows={2}
              value={message}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              onChange={(event) => setMessage(event.target.value)}
              disabled={isLoading || (!isAdmin && !hasConsent) || !session}
              placeholder="Nhập câu hỏi…"
              className="max-h-32 min-w-0 flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-base leading-6 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white sm:text-sm"
            />
            <button
              type="submit"
              disabled={!message.trim() || isLoading || (!isAdmin && !hasConsent) || !session}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Gửi tin nhắn"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
            </div>
            <p className="mt-2 text-[11px] leading-4 text-slate-500 dark:text-slate-400">Enter để gửi · Shift + Enter để xuống dòng. Kiểm tra lại thông tin trước khi ứng tuyển.</p>
          </form>
        </section>
      )}
      <button
        ref={launcherRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls="candidate-assistant"
        onClick={() => setIsOpen((current) => !current)}
        className="ml-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-xl shadow-primary/30 transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 active:scale-95 motion-reduce:transform-none"
        aria-label={isOpen ? "Đóng trợ lý" : "Mở trợ lý"}
      >
        {isOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <MessageCircle className="h-6 w-6" />
        )}
      </button>
    </div>
  );
}
