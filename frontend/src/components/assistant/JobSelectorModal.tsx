import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Briefcase,
  Building2,
  MapPin,
  DollarSign,
  X,
  Link as LinkIcon,
  Check,
  Loader2,
} from "lucide-react";
import { searchJobsApi, formatSalary, type JobItem } from "../../lib/jobApi";

export interface SelectedJobInfo {
  id: string;
  title: string;
  companyName?: string;
  salary?: string;
  location?: string;
}

interface JobSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (job: SelectedJobInfo) => void;
  currentSelectedId?: string;
  accessToken?: string | null;
}

export default function JobSelectorModal({
  isOpen,
  onClose,
  onSelect,
  currentSelectedId,
  accessToken,
}: JobSelectorModalProps) {
  const [tab, setTab] = useState<"search" | "manual">("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [manualError, setManualError] = useState("");

  const searchTimeoutRef = useRef<number | null>(null);

  // Load popular / recent jobs on initial open or when search query changes
  useEffect(() => {
    if (!isOpen) return;

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    searchTimeoutRef.current = window.setTimeout(() => {
      setIsLoading(true);
      searchJobsApi(
        {
          query: searchQuery.trim() || undefined,
          limit: 10,
        },
        accessToken,
      )
        .then((res) => {
          setJobs(res?.result || []);
        })
        .catch(() => {
          setJobs([]);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }, 250);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [isOpen, searchQuery, accessToken]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleSelectJob = (job: JobItem) => {
    onSelect({
      id: job._id,
      title: job.name,
      companyName: job.company?.name || "Công ty tuyển dụng",
      salary: formatSalary(job.salary),
      location: job.location,
    });
    onClose();
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setManualError("");
    const raw = manualInput.trim();
    if (!raw) {
      setManualError("Vui lòng nhập ID hoặc link bài tuyển dụng");
      return;
    }

    // Extract UUID from URL or direct string
    const uuidMatch = raw.match(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
    if (!uuidMatch) {
      setManualError("ID hoặc đường dẫn không hợp lệ. Vui lòng kiểm tra lại.");
      return;
    }

    const id = uuidMatch[0];
    onSelect({
      id,
      title: `Việc làm (${id.slice(0, 8)}...)`,
    });
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 15 }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
            className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-50 text-primary dark:bg-blue-950/50 dark:text-cyan-400">
                  <Briefcase className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Chọn việc làm để so khớp với CV
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Đối chiếu kỹ năng, kinh nghiệm và mức độ phù hợp
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="cursor-pointer rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-2.5 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="flex rounded-xl bg-slate-200/70 p-1 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => setTab("search")}
                  className={`cursor-pointer flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${
                    tab === "search"
                      ? "bg-white text-primary shadow-xs dark:bg-slate-700 dark:text-cyan-300"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  }`}
                >
                  Tìm việc làm
                </button>
                <button
                  type="button"
                  onClick={() => setTab("manual")}
                  className={`cursor-pointer flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${
                    tab === "manual"
                      ? "bg-white text-primary shadow-xs dark:bg-slate-700 dark:text-cyan-300"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  }`}
                >
                  Dán Link / ID
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5">
              {tab === "search" ? (
                <div className="space-y-3.5">
                  {/* Search Input */}
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Tìm theo chức danh, từ khóa, công ty..."
                      className="w-full rounded-2xl border border-slate-200/90 bg-slate-50/80 py-2.5 pl-10 pr-4 text-xs text-slate-800 outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:focus:border-cyan-400"
                    />
                  </div>

                  {/* Jobs List */}
                  {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      <span className="mt-2 text-xs">Đang tải danh sách việc làm...</span>
                    </div>
                  ) : jobs.length === 0 ? (
                    <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                      Không tìm thấy việc làm phù hợp. Thử tìm với từ khóa khác hoặc dán link bài đăng.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {jobs.map((job) => {
                        const isSelected = job._id === currentSelectedId;
                        return (
                          <div
                            key={job._id}
                            onClick={() => handleSelectJob(job)}
                            className={`group cursor-pointer rounded-2xl border p-3 transition-all ${
                              isSelected
                                ? "border-primary bg-primary/5 shadow-xs dark:border-cyan-500/40 dark:bg-cyan-950/20"
                                : "border-slate-200/80 bg-white hover:border-primary/40 hover:bg-slate-50/70 dark:border-slate-800 dark:bg-slate-850 dark:hover:border-slate-700 dark:hover:bg-slate-800"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <h4 className="truncate text-xs font-bold text-slate-800 group-hover:text-primary dark:text-slate-100 dark:group-hover:text-cyan-300">
                                    {job.name}
                                  </h4>
                                  {isSelected && (
                                    <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary dark:bg-cyan-950/50 dark:text-cyan-300">
                                      <Check className="h-3 w-3" /> Đang chọn
                                    </span>
                                  )}
                                </div>

                                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                                  <Building2 className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate">
                                    {job.company?.name || "Công ty tuyển dụng"}
                                  </span>
                                </div>

                                <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                                  {job.location && (
                                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
                                      <MapPin className="h-3 w-3" />
                                      {job.location}
                                    </span>
                                  )}
                                  {job.salary !== undefined && job.salary !== null && (
                                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                                      <DollarSign className="h-3 w-3" />
                                      {formatSalary(job.salary)}
                                    </span>
                                  )}
                                  {job.level && (
                                    <span className="rounded-md bg-blue-50 px-2 py-0.5 font-medium text-blue-700 dark:bg-blue-950/40 dark:text-cyan-300">
                                      {job.level}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <button
                                type="button"
                                className="cursor-pointer shrink-0 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition group-hover:bg-primary group-hover:text-white dark:bg-slate-800 dark:text-slate-300 dark:group-hover:bg-primary dark:group-hover:text-white"
                              >
                                {isSelected ? "Đã chọn" : "Chọn việc này"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <form onSubmit={handleManualSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Dán đường link việc làm hoặc ID bài đăng
                    </label>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      Ví dụ: <code className="rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">https://talentpulse.com/jobs/1234abcd-...</code> hoặc mã UUID
                    </p>
                    <div className="relative mt-2">
                      <LinkIcon className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={manualInput}
                        onChange={(e) => setManualInput(e.target.value)}
                        placeholder="https://talentpulse.com/jobs/... hoặc mã ID"
                        className="w-full rounded-2xl border border-slate-200/90 bg-slate-50/80 py-2.5 pl-10 pr-4 text-xs text-slate-800 outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:focus:border-cyan-400"
                      />
                    </div>
                    {manualError && (
                      <p className="mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-400">
                        {manualError}
                      </p>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="cursor-pointer w-full rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-600/20 transition hover:brightness-110"
                  >
                    Xác nhận việc làm
                  </button>
                </form>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
