import { useEffect, useMemo, useState } from "react";
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
}

const MAX_HISTORY = 12;
const modes: Array<{ value: AssistantMode; label: string }> = [
  { value: "JOB_SEARCH", label: "Tìm việc" },
  { value: "CV_JOB_COMPARISON", label: "Hỏi về việc" },
  { value: "CV_ANALYSIS", label: "Rà soát CV" },
  { value: "ADVICE", label: "Tư vấn nghề nghiệp" },
];

function makeClientMessageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, "0")}`;
}

export default function CandidateAssistant() {
  const { user, accessToken } = useAuth();
  const location = useLocation();
  const isHrOnlyRoute =
    location.pathname === "/dashboard" ||
    location.pathname.startsWith("/hr/") ||
    location.pathname.startsWith("/employer/");
  const isCandidate = user?.role === "USER" || user?.role === "ADMIN";
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<AssistantMode>("JOB_SEARCH");
  const [session, setSession] = useState<AssistantSession | null>(null);
  const [hasConsent, setHasConsent] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [degraded, setDegraded] = useState(false);
  const [cvOptions, setCvOptions] = useState<AssistantCvOption[]>([]);
  const [selectedCvId, setSelectedCvId] = useState("");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<AssistantFilterInput>({});
  const visibleMessages = useMemo(
    () => messages.slice(-MAX_HISTORY),
    [messages],
  );
  const authIdentity = `${user?._id ?? "guest"}:${accessToken ?? "none"}`;

  useEffect(() => {
    setIsOpen(false);
    setSession(null);
    setHasConsent(false);
    setMessage("");
    setMessages([]);
    setIsLoading(false);
    setError("");
    setDegraded(false);
    setCvOptions([]);
    setSelectedCvId("");
    setSelectedJobId("");
    setShowFilters(false);
    setFilters({});
  }, [authIdentity]);

  useEffect(() => {
    if (!isOpen || !accessToken || !isCandidate) return;
    setError("");
    void Promise.all([
      assistantApi.currentConsent(accessToken),
      assistantApi.listCvOptions(accessToken),
    ])
      .then(([consent, options]) => {
        const granted = consent?.status === "GRANTED";
        setHasConsent(granted);
        setCvOptions(options);
        if (granted && !session)
          return assistantApi.createSession(mode, accessToken).then(setSession);
        return undefined;
      })
      .catch((requestError: unknown) => {
        setHasConsent(false);
        setError(
          getAssistantErrorCode(requestError) === "AI_CONSENT_REQUIRED"
            ? "Bạn cần cấp đồng ý trợ lý AI trong phần quản lý CV trước khi sử dụng."
            : "Trợ lý AI chưa sẵn sàng ở môi trường này.",
        );
      });
  }, [accessToken, isCandidate, isOpen, mode, session]);

  if (isHrOnlyRoute || !isCandidate) return null;

  const sendMessage = async (content = message) => {
    const text = content.trim();
    if (!text || isLoading || !accessToken || !session || !hasConsent) return;
    const clientMessageId = makeClientMessageId();
    setMessages((current) =>
      [
        ...current,
        { id: clientMessageId, role: "USER" as const, content: text },
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
          cvId: selectedCvId || undefined,
          jobIds: selectedJobId ? [selectedJobId] : undefined,
          filters,
        },
        accessToken,
      );
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
          },
        ].slice(-MAX_HISTORY),
      );
    } catch (requestError) {
      setDegraded(isAssistantUnavailable(requestError));
      setError(
        getAssistantErrorCode(requestError) === "AI_CONSENT_REQUIRED"
          ? "Đồng ý trợ lý AI không còn hiệu lực. Hãy kiểm tra lại phần quản lý CV."
          : isAssistantUnavailable(requestError)
            ? "Trợ lý AI chưa được bật ở môi trường này."
            : "Không thể kết nối trợ lý AI. Bạn có thể thử lại.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const retry = () => {
    const last = visibleMessages[visibleMessages.length - 1];
    if (last?.role === "USER") void sendMessage(last.content);
  };

  return (
    <div className="fixed bottom-4 right-4 z-[60] sm:bottom-6 sm:right-6">
      {isOpen && (
        <section
          className="mb-3 flex h-[min(680px,calc(100vh-6rem))] w-[min(390px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          aria-label="Candidate AI assistant"
        >
          <header className="flex items-center justify-between bg-gradient-to-r from-primary to-cyan-500 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              <div>
                <h2 className="text-sm font-extrabold">Trợ lý TalentPulse</h2>
                <p className="text-[11px] text-white/80">
                  Câu trả lời có căn cứ
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Đóng trợ lý"
            >
              <X className="h-5 w-5" />
            </button>
          </header>
          <div className="space-y-3 border-b border-slate-100 p-3 dark:border-slate-800">
            <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Chế độ
              <select
                value={mode}
                onChange={(event) => {
                  setMode(event.target.value as AssistantMode);
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
            <div className="grid grid-cols-2 gap-2">
              <select
                value={selectedCvId}
                onChange={(event) => setSelectedCvId(event.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="">Không chọn CV</option>
                {cvOptions.map((cv) => (
                  <option key={cv.id} value={cv.id}>
                    {cv.title}
                  </option>
                ))}
              </select>
              <input
                value={selectedJobId}
                onChange={(event) => setSelectedJobId(event.target.value)}
                placeholder="Job ID (tuỳ chọn)"
                className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowFilters((current) => !current)}
              className="inline-flex items-center gap-1 text-xs font-bold text-primary"
            >
              <Filter className="h-3.5 w-3.5" /> Bộ lọc rõ ràng{" "}
              <ChevronDown
                className={`h-3.5 w-3.5 transition ${showFilters ? "rotate-180" : ""}`}
              />
            </button>
            {showFilters && (
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={filters.location || ""}
                  onChange={(event) =>
                    setFilters({
                      ...filters,
                      location: event.target.value || undefined,
                    })
                  }
                  placeholder="Địa điểm"
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                <select
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
                  className="col-span-2 rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
            )}
            <p className="text-[11px] text-slate-500">
              Quota: được máy chủ kiểm soát; endpoint quota riêng chưa có.
            </p>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50/70 p-3 dark:bg-slate-950/40">
            {!hasConsent && (
              <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-4 text-xs text-amber-800">
                Trợ lý cần consent của ứng viên. Hãy bật consent trong trang{" "}
                <Link to="/my-cv" className="font-bold underline">
                  Quản lý CV
                </Link>
                .
              </div>
            )}
            {visibleMessages.length === 0 && hasConsent && (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900">
                Hỏi về việc làm, CV hoặc định hướng nghề nghiệp. Trợ lý chỉ trả
                lời dựa trên dữ liệu có căn cứ.
              </div>
            )}
            {visibleMessages.map((item) => (
              <div
                key={item.id}
                className={`max-w-[92%] rounded-2xl px-3 py-2 text-sm ${item.role === "USER" ? "ml-auto bg-primary text-white" : "bg-white text-slate-700 shadow-sm dark:bg-slate-800 dark:text-slate-200"}`}
              >
                <p className="whitespace-pre-wrap">{item.content}</p>
                {item.state === "NO_EVIDENCE" && (
                  <p className="mt-2 text-[11px] font-bold text-amber-600">
                    NO_EVIDENCE · Chưa đủ dữ liệu để kết luận.
                  </p>
                )}
                {item.citations
                  ?.filter((citation) => citation.sourceType === "JOB")
                  .map((citation) => (
                    <Link
                      key={`${item.id}-${citation.sourceId}`}
                      to={`/jobs/${encodeURIComponent(citation.sourceId)}`}
                      className="mt-2 block truncate border-t border-slate-200 pt-2 text-xs font-bold text-primary hover:underline"
                    >
                      {citation.label || "Xem việc làm được trích dẫn"}
                    </Link>
                  ))}
              </div>
            ))}
            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Đang tìm thông tin
                có căn cứ…
              </div>
            )}
            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
                <p>{error}</p>
                <button
                  type="button"
                  onClick={retry}
                  className="mt-1 inline-flex items-center gap-1 font-bold"
                >
                  <RefreshCw className="h-3 w-3" /> Thử lại
                </button>
              </div>
            )}
            {degraded && !error && (
              <p className="text-[11px] text-amber-600">
                Chế độ degraded: một số dữ liệu AI chưa sẵn sàng.
              </p>
            )}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage();
            }}
            className="flex gap-2 border-t border-slate-100 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
          >
            <input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              disabled={isLoading || !hasConsent || !session}
              placeholder="Nhập câu hỏi…"
              className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            <button
              type="submit"
              disabled={!message.trim() || isLoading || !hasConsent || !session}
              className="rounded-xl bg-primary px-3 text-white disabled:opacity-40"
              aria-label="Gửi tin nhắn"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </section>
      )}
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="ml-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-xl shadow-primary/30 transition hover:scale-105 active:scale-95"
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
