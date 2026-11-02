import { useState, useEffect, useRef } from "react";
import {
  useParams,
  useSearchParams,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Save,
  Type,
  LayoutGrid,
  Sparkles,
  Layers,
  ZoomIn,
  ZoomOut,
  Crown,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  X,
  Sun,
  Moon,
  Globe,
  MoveUp,
  MoveDown,
  Plus,
} from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { useToast } from "../../context/ToastContext";
import { formatDate } from "../../lib/dateUtils";
import { ApiError } from "../../lib/api";
import { onlineCvApi } from "../../lib/cvApi";
import {
  CV_FONTS,
  CV_THEMES,
  CV_TEMPLATE_LABELS,
  filterMeaningfulCvEntries,
  resolveLoadedCvLocale,
} from "../../lib/cvTypes";
import type {
  OnlineCV,
  CVTemplateType,
  EducationEntry,
  WorkExperienceEntry,
  SkillEntry,
  ActivityEntry,
  ProjectEntry,
  CertificateEntry,
  AwardEntry,
  CVFontOption,
  CVThemeOption,
  CVGenerationMode,
  CVGenerationStatus,
  CVGenerationJobStatus,
  CVGenerationDraft,
  GenerateOnlineCVDraftResponse,
  GenerateOnlineCVJobStatusResponse,
  CreateOnlineCVDto,
  UpdateOnlineCVDto,
  CVLocale,
} from "../../lib/cvTypes";
import { CV_EDITOR_TEMPLATES } from "../../components/cv/editor/templates";
import {
  normalizeCvGenerationWarnings,
} from "../../lib/cvWarningNormalization";

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord =>
  value && typeof value === "object" ? (value as UnknownRecord) : {};

const asText = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const createIdempotencyKey = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `cv-generation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const localizedGenerationStatus = (
  status: CVGenerationJobStatus | "IDLE",
  locale: CVLocale,
): string => {
  const messages: Record<string, [string, string]> = {
    QUEUED: ["Yêu cầu đã được tiếp nhận. Đang xếp hàng xử lý...", "Request accepted. Waiting to start..."],
    PROCESSING: ["Đang tạo bản nháp CV...", "Creating your CV draft..."],
    CANCEL_REQUESTED: ["Đang xử lý yêu cầu hủy...", "Processing cancellation request..."],
    COMPLETE: ["Đã tạo xong bản nháp CV.", "Your CV draft is ready."],
    DEGRADED: ["Đã tạo bản nháp an toàn. Hãy kiểm tra nội dung.", "A safe draft is ready. Review the content."],
    STALE: ["Yêu cầu đã hết hiệu lực. Bạn có thể thử lại.", "This request is no longer current. You can try again."],
    FAILED: ["Không thể tạo bản nháp lúc này. Vui lòng thử lại.", "The draft could not be created. Please try again."],
    CANCELLED: ["Đã hủy tạo bản nháp.", "Draft generation was cancelled."],
    IDLE: ["", ""],
  };
  const [vi, en] = messages[status] || messages.FAILED;
  return locale === "vi-VN" ? vi : en;
};

const normalizeGenerationMode = (
  value: unknown,
): CVGenerationMode | undefined =>
  value === "EDITOR_ONLY" || value === "MANUAL" ? value : undefined;

const normalizeContentKey = (value: string): string =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}+#]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");

const dedupeTextValues = (values: readonly string[]): string[] => {
  const seen = new Set<string>();
  return values.reduce<string[]>((result, value) => {
    const cleaned = value.trim().replace(/\s+/g, " ");
    const key = normalizeContentKey(cleaned);
    if (cleaned && key && !seen.has(key)) {
      seen.add(key);
      result.push(cleaned);
    }
    return result;
  }, []);
};

const dedupeMappedEntries = <T extends UnknownRecord>(
  entries: T[],
  fields: string[],
): T[] => {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = fields
      .map((field) => {
        const value = entry[field];
        return Array.isArray(value)
          ? value
              .filter((item): item is string => typeof item === "string")
              .join(" ")
          : typeof value === "string"
            ? value
            : "";
      })
      .map(normalizeContentKey)
      .join("|");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const normalizeSectionOrder = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    // Both templates intentionally render one combined activities/projects timeline.
    const canonical = item === "projects" ? "activities" : item;
    if (!result.includes(canonical)) result.push(canonical);
  }
  return result;
};

function mapGeneratedDraftResponse(
  response: GenerateOnlineCVDraftResponse | GenerateOnlineCVJobStatusResponse,
): {
  draft: CVGenerationDraft;
  status: CVGenerationStatus;
  warnings: string[];
  generationMode?: CVGenerationMode;
  locale?: CVLocale;
} {
  const rawResponse = asRecord(response);
  const rawDraft = asRecord(
    rawResponse.draft ||
      rawResponse.document ||
      rawResponse.cv ||
      rawResponse.current ||
      rawResponse.currentGeneration ||
      rawResponse.generation ||
      rawResponse.result ||
      rawResponse,
  );
  const mapEntry = (value: unknown, fields: Record<string, string>) => {
    const entry = asRecord(value);
    return Object.fromEntries(
      Object.entries(fields)
        .map(([target, source]) => [
          target,
          asText(entry[target] ?? entry[source]),
        ])
        .filter(([, item]) => item !== undefined),
    );
  };
  const mapStringEntries = (value: unknown, fields: Record<string, string>) => {
    if (!Array.isArray(value)) return undefined;
    const mapped = value.map((item) =>
      typeof item === "string"
        ? { [Object.keys(fields)[0]]: item }
        : mapEntry(item, fields),
    );
    return filterMeaningfulCvEntries(
      dedupeMappedEntries(mapped, Object.keys(fields)),
    );
  };

  const rawWorkExperience = rawDraft.workExperience ?? rawDraft.work_experience;
  const workExperience = Array.isArray(rawWorkExperience)
    ? dedupeMappedEntries(
        rawWorkExperience.map((item) => {
          const entry = asRecord(item);
          const bullets = Array.isArray(entry.bullets)
            ? dedupeTextValues(
                entry.bullets.filter(
                  (bullet): bullet is string => typeof bullet === "string",
                ),
              )
            : [];
          return {
            ...mapEntry(item, {
              companyName: "company_name",
              position: "position",
              startDate: "start_date",
              endDate: "end_date",
              description: "description",
            }),
            ...(bullets.length > 0 ? { description: bullets.join("\n") } : {}),
          };
        }),
        ["companyName", "position", "startDate", "endDate", "description"],
      )
    : undefined;

  const rawProjects = rawDraft.projects;
  const projects = Array.isArray(rawProjects)
    ? dedupeMappedEntries(
        rawProjects.map((item) => {
          const entry = asRecord(item);
          const bullets = Array.isArray(entry.bullets)
            ? dedupeTextValues(
                entry.bullets.filter(
                  (bullet): bullet is string => typeof bullet === "string",
                ),
              )
            : [];
          return {
            ...mapEntry(item, {
              projectName: "project_name",
              role: "role",
              startDate: "start_date",
              endDate: "end_date",
              description: "description",
            }),
            ...(Array.isArray(entry.technologies)
              ? {
                  technologies: entry.technologies.filter(
                    (technology): technology is string =>
                      typeof technology === "string",
                  ),
                }
              : {}),
            ...(bullets.length > 0 ? { description: bullets.join("\n") } : {}),
          };
        }),
        [
          "projectName",
          "role",
          "startDate",
          "endDate",
          "description",
          "technologies",
        ],
      )
    : undefined;

  const education = Array.isArray(rawDraft.education)
    ? dedupeMappedEntries(
        rawDraft.education.map((item) => {
          const entry = asRecord(item);
          return {
            ...mapEntry(item, {
              schoolName: "school_name",
              major: "major",
              startDate: "start_date",
              endDate: "end_date",
              description: "description",
            }),
            ...(asText(entry.major ?? entry.degree)
              ? { major: asText(entry.major ?? entry.degree) }
              : {}),
          };
        }),
        ["schoolName", "major", "startDate", "endDate", "description"],
      )
    : undefined;

  const rawSkills = rawDraft.skills;
  const skills = Array.isArray(rawSkills)
    ? dedupeMappedEntries(
        rawSkills.map((item) =>
          typeof item === "string"
            ? { name: item }
            : mapEntry(item, { name: "name", description: "description" }),
        ),
        ["name", "description"],
      )
    : undefined;
  const rawSectionOrder = rawDraft.sectionOrder ?? rawDraft.section_order;
  const sectionOrder = normalizeSectionOrder(rawSectionOrder);

  const draft: CVGenerationDraft = {
    title: asText(rawDraft.title),
    fullName: asText(rawDraft.fullName ?? rawDraft.full_name),
    position: asText(rawDraft.position ?? rawDraft.headline),
    phone: asText(rawDraft.phone),
    email: asText(rawDraft.email),
    link: asText(rawDraft.link),
    address: asText(rawDraft.address),
    careerObjective: asText(
      rawDraft.careerObjective ?? rawDraft.career_objective,
    ),
    education,
    workExperience,
    skills,
    activities: mapStringEntries(rawDraft.activities, {
      organizationName: "organization_name",
      position: "position",
      startDate: "start_date",
      endDate: "end_date",
      description: "description",
    }),
    projects,
    certificates: mapStringEntries(rawDraft.certificates, {
      name: "name",
      issuer: "issuer",
      date: "date",
      credentialUrl: "credential_url",
    }),
    awards: mapStringEntries(rawDraft.awards, {
      name: "name",
      issuer: "issuer",
      date: "date",
      description: "description",
    }),
    sectionOrder,
  };

  const status = rawResponse.status;
  const revision = asRecord(rawResponse.revision ?? rawDraft.revision);
  const responseWarnings = Array.isArray(rawResponse.warnings)
    ? rawResponse.warnings.filter(
        (warning): warning is string => typeof warning === "string",
      )
    : [];
  const revisionWarnings = Array.isArray(revision.warnings)
    ? revision.warnings.filter(
        (warning): warning is string => typeof warning === "string",
      )
    : [];
  const warnings =
    responseWarnings.length > 0 ? responseWarnings : revisionWarnings;
  const normalizedStatus: CVGenerationStatus =
    status === "DEGRADED" || status === "NO_EVIDENCE" || status === "COMPLETE"
      ? status
      : warnings.length > 0
        ? "DEGRADED"
        : "COMPLETE";
  const rawLocale = rawResponse.locale ?? revision.locale ?? rawDraft.locale;
  const locale: CVLocale | undefined =
    rawLocale === "en-US" || rawLocale === "vi-VN" ? rawLocale : undefined;
  const generationMode = normalizeGenerationMode(
    rawResponse.generationMode ??
      rawResponse.generation_mode ??
      rawDraft.generationMode ??
      rawDraft.generation_mode,
  );

  return { draft, status: normalizedStatus, warnings, generationMode, locale };
}

// ================= MAIN CV EDITOR PAGE =================
export default function CVEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, accessToken } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const toast = useToast();

  const isNew = id === "new" || !id;
  const locationState = location.state as {
    templateType?: CVTemplateType;
    cvLanguage?: "vi" | "en";
    locale?: CVLocale;
    themeColorId?: string;
  } | null;

  const initialTemplate: CVTemplateType =
    locationState?.templateType ||
    (searchParams.get("template") as CVTemplateType) ||
    "template1";
  const initialThemeColor = locationState?.themeColorId || "primary-blue";
  const initialLanguage: "vi" | "en" =
    locationState?.cvLanguage ||
    (locationState?.locale === "en-US" ? "en" : "vi");

  // Core Form State
  const [title, setTitle] = useState<string>("CV Chưa đặt tên");
  const [isTitleManual, setIsTitleManual] = useState<boolean>(false);
  const [templateType, setTemplateType] =
    useState<CVTemplateType>(initialTemplate);
  const [fontFamilyId, setFontFamilyId] = useState<string>(
    initialTemplate === "template1" ? "times" : "inter",
  );
  const [themeColorId, setThemeColorId] = useState<string>(initialThemeColor);
  const [fontSize, setFontSize] = useState<"small" | "medium" | "large">(
    "medium",
  );
  const [lineSpacing, setLineSpacing] = useState<number>(1.3);

  // Form Fields
  const [fullName, setFullName] = useState<string>(user?.name || "");
  const [position, setPosition] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [email, setEmail] = useState<string>(user?.email || "");
  const [link, setLink] = useState<string>("");
  const [address, setAddress] = useState<string>(user?.address || "");
  const [careerObjective, setCareerObjective] = useState<string>("");

  const [education, setEducation] = useState<EducationEntry[]>([]);

  const [workExperience, setWorkExperience] = useState<WorkExperienceEntry[]>(
    [],
  );

  const [skills, setSkills] = useState<SkillEntry[]>([]);

  const [activities, setActivities] = useState<ActivityEntry[]>([]);

  const [projects, setProjects] = useState<ProjectEntry[]>([]);

  const [certificates, setCertificates] = useState<CertificateEntry[]>([]);

  const [awards, setAwards] = useState<AwardEntry[]>([]);

  // Section Visibility
  const [visibleSections, setVisibleSections] = useState({
    objective: true,
    education: true,
    experience: true,
    skills: true,
    activities: true,
    certificates: false,
    awards: false,
  });

  // Dynamic Section Order
  const DEFAULT_SECTION_ORDER = [
    "objective",
    "education",
    "experience",
    "skills",
    "activities",
    "certificates",
    "awards",
  ];
  const [sectionOrder, setSectionOrder] = useState<string[]>(
    DEFAULT_SECTION_ORDER,
  );

  const moveSection = (sectionKey: string, direction: "up" | "down") => {
    setSectionOrder((prev) => {
      const idx = prev.indexOf(sectionKey);
      if (idx === -1) return prev;
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(targetIdx, 0, item);
      markDirty();
      return next;
    });
  };

  // CV Display Language
  const [cvLanguage, setCvLanguage] = useState<"vi" | "en">(initialLanguage);
  const cvLocale: CVLocale = cvLanguage === "en" ? "en-US" : "vi-VN";
  const localeLabels = CV_TEMPLATE_LABELS[cvLocale];

  const SECTION_LABELS = {
    vi: {
      objective: "MỤC TIÊU NGHỀ NGHIỆP",
      education: "HỌC VẤN",
      experience: "KINH NGHIỆM LÀM VIỆC",
      skills: "KỸ NĂNG CHUYÊN MÔN",
      activities: "HOẠT ĐỘNG & DỰ ÁN",
      certificates: "CHỨNG CHỈ",
      awards: "GIẢI THƯỞNG",
      personalInfo: "THÔNG TIN CÁ NHÂN",
      contact: "THÔNG TIN LIÊN HỆ",
    },
    en: {
      objective: "CAREER OBJECTIVE",
      education: "EDUCATION",
      experience: "WORK EXPERIENCE",
      skills: "PROFESSIONAL SKILLS",
      activities: "ACTIVITIES & PROJECTS",
      certificates: "CERTIFICATES",
      awards: "HONORS & AWARDS",
      personalInfo: "PERSONAL INFORMATION",
      contact: "CONTACT INFORMATION",
    },
  };

  // UI States
  const [activeSidebarTool, setActiveSidebarTool] = useState<
    "design" | "sections" | "templates" | "language" | "ai" | "library" | null
  >("design");
  const [isSaving, setIsSaving] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [isLoadingExistingCv, setIsLoadingExistingCv] = useState(!isNew);
  const [isDirty, setIsDirty] = useState(false);
  const [draftRevision, setDraftRevision] = useState(0);
  const [editorCvId, setEditorCvId] = useState<string | null>(
    isNew ? null : id || null,
  );
  const [generationMode, setGenerationMode] =
    useState<CVGenerationMode>("MANUAL");
  const [contentVersion, setContentVersion] = useState(1);
  const contentVersionRef = useRef(contentVersion);
  contentVersionRef.current = contentVersion;
  const [generationStatus, setGenerationStatus] =
    useState<CVGenerationStatus>("IDLE");
  const [generationWarnings, setGenerationWarnings] = useState<string[]>([]);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationJobId, setGenerationJobId] = useState("");
  const [generationJobStatus, setGenerationJobStatus] = useState<
    CVGenerationJobStatus | "IDLE"
  >(searchParams.get("generation") ? "QUEUED" : "IDLE");
  const [generationOperationId, setGenerationOperationId] = useState(
    searchParams.get("generation") || "",
  );
  const generationTimerRef = useRef<number | null>(null);
  const pollingOperationRef = useRef<string | null>(null);
  const pollingStoppedRef = useRef(false);
  const pollingInFlightRef = useRef(false);
  const generationAbortRef = useRef<AbortController | null>(null);
  const [zoomScale, setZoomScale] = useState<number>(0.9);
  const [showAiModal, setShowAiModal] = useState(false);
  const [existingCvs, setExistingCvs] = useState<OnlineCV[]>([]);
  const [pageCount, setPageCount] = useState<number>(1);
  const cvPaperRef = useRef<HTMLDivElement>(null);
  const latestPayloadRef = useRef<UpdateOnlineCVDto | null>(null);
  const latestDraftRevisionRef = useRef(0);
  const normalizedGenerationWarnings = normalizeCvGenerationWarnings(
    generationWarnings,
    generationStatus,
    cvLocale,
  );
  const generationProvenance = normalizedGenerationWarnings.provenance;
  const visibleGenerationWarnings = normalizedGenerationWarnings.messages;
  const hasActionableGenerationWarnings = visibleGenerationWarnings.length > 0;
  const hasGenerationBannerWarning =
    generationProvenance !== "ai" ||
    generationStatus === "NO_EVIDENCE" ||
    hasActionableGenerationWarnings;
  const generationIsActive =
    generationJobStatus === "QUEUED" ||
    generationJobStatus === "PROCESSING" ||
    generationJobStatus === "CANCEL_REQUESTED";
  const generationQueryOperationId = searchParams.get("generation");
  const generationContextRef = useRef({
    pathname: location.pathname,
    cvId: editorCvId || id,
    accessToken,
    operationId: generationQueryOperationId,
  });
  generationContextRef.current = {
    pathname: location.pathname,
    cvId: editorCvId || id,
    accessToken,
    operationId: generationQueryOperationId,
  };
  const generationContextIsCurrent = () =>
    generationRequestContextIsCurrent() &&
    generationContextRef.current.cvId === (editorCvId || id) &&
    generationContextRef.current.accessToken === accessToken &&
    generationContextRef.current.operationId === generationQueryOperationId;
  const generationRequestContextIsCurrent = () =>
    !pollingStoppedRef.current &&
    generationContextRef.current.pathname === location.pathname &&
    generationContextRef.current.accessToken === accessToken &&
    generationContextRef.current.operationId === generationQueryOperationId;

  // Measure and calculate exact page count
  const calculatePages = () => {
    if (!cvPaperRef.current) return;
    const a4HeightPx = (297 * 96) / 25.4; // 1122.519685px
    const scale = zoomScale || 1;
    const rect = cvPaperRef.current.getBoundingClientRect();
    const actualHeight =
      rect.height > 0 ? rect.height / scale : cvPaperRef.current.scrollHeight;
    const innerTemplate = cvPaperRef.current
      .firstElementChild as HTMLElement | null;
    const innerHeight = innerTemplate
      ? innerTemplate.scrollHeight
      : actualHeight;
    const heightToEvaluate = Math.max(actualHeight, innerHeight);

    const computedPages = Math.max(
      1,
      Math.ceil((heightToEvaluate - 10) / a4HeightPx),
    );
    setPageCount(computedPages);
  };

  useEffect(() => {
    calculatePages();
  }, [
    fullName,
    position,
    phone,
    email,
    link,
    address,
    careerObjective,
    education,
    workExperience,
    skills,
    activities,
    projects,
    certificates,
    awards,
    fontSize,
    lineSpacing,
    sectionOrder,
    visibleSections,
    templateType,
    zoomScale,
  ]);

  useEffect(() => {
    calculatePages();

    const handleContentChange = () => {
      calculatePages();
    };

    const ro = new ResizeObserver(() => {
      calculatePages();
    });

    if (cvPaperRef.current) {
      ro.observe(cvPaperRef.current);
    }

    window.addEventListener(
      "talentpulse:cv-content-change",
      handleContentChange,
    );
    window.addEventListener("resize", handleContentChange);

    return () => {
      ro.disconnect();
      window.removeEventListener(
        "talentpulse:cv-content-change",
        handleContentChange,
      );
      window.removeEventListener("resize", handleContentChange);
    };
  }, [zoomScale]);

  const currentFont: CVFontOption =
    CV_FONTS.find((f) => f.id === fontFamilyId) || CV_FONTS[0];
  const currentTheme: CVThemeOption =
    CV_THEMES.find((t) => t.id === themeColorId) || CV_THEMES[0];

  const fontSizeMultipliers = {
    small: 0.9,
    medium: 1.0,
    large: 1.1,
  };
  const fontMultiplier = fontSizeMultipliers[fontSize] || 1.0;

  // Mark dirty
  const markDirty = () => {
    if (generationIsActive) return;
    setIsDirty(true);
    setDraftRevision((revision) => revision + 1);
  };

  // Prevent accidental page close / reload when dirty
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // Load existing CV data if editing
  useEffect(() => {
    if (isNew || !id) {
      setIsLoadingExistingCv(false);
      return;
    }
    if (!accessToken) return;

    setIsLoadingExistingCv(true);
    void (async () => {
      try {
        const cv = await onlineCvApi.findOne(id, accessToken);
        if (cv) {
          // Apply revision locale before loaded fields can trigger an autosave.
          const loadedLocale = resolveLoadedCvLocale(cv.revision);
          setCvLanguage(loadedLocale === "en-US" ? "en" : "vi");
          setTitle(
            cv.title ||
              `CV - ${cv.fullName || "Chưa đặt tên"}${cv.position ? ` - ${cv.position}` : ""}`,
          );
          setIsTitleManual(true);
          setEditorCvId(cv._id);
          setContentVersion(cv.contentVersion || 1);
          setTemplateType(cv.templateType || "template1");
          const loadedWarnings = cv.revision?.warnings || [];
          const loadedGenerationMode =
            cv.generationMode ||
            (cv.revision?.generatedAt ? "EDITOR_ONLY" : "MANUAL");
          setGenerationMode(loadedGenerationMode);
          setGenerationWarnings(loadedWarnings);
          if (!generationQueryOperationId) {
            setGenerationStatus(
              loadedGenerationMode === "EDITOR_ONLY"
                ? loadedWarnings.length > 0
                  ? "DEGRADED"
                  : "COMPLETE"
                : "IDLE",
            );
            setGenerationJobStatus(
              loadedGenerationMode === "EDITOR_ONLY"
                ? loadedWarnings.length > 0
                  ? "DEGRADED"
                  : "COMPLETE"
                : "IDLE",
            );
          }
          setFullName(cv.fullName || "");
          setPosition(cv.position || "");
          setPhone(cv.phone || "");
          setEmail(cv.email || "");
          setLink(cv.link || "");
          setAddress(cv.address || "");
          setCareerObjective(cv.careerObjective || "");

          const normalizedSectionOrder = normalizeSectionOrder(cv.sectionOrder);
          if (normalizedSectionOrder && normalizedSectionOrder.length > 0) {
            setSectionOrder(normalizedSectionOrder);
          }
          if (cv.fontFamily) setFontFamilyId(cv.fontFamily);
          if (cv.themeColor) setThemeColorId(cv.themeColor);
          if (cv.fontSize) setFontSize(cv.fontSize);

          if (Array.isArray(cv.education))
            setEducation(filterMeaningfulCvEntries(cv.education));
          if (Array.isArray(cv.workExperience))
            setWorkExperience(filterMeaningfulCvEntries(cv.workExperience));
          if (Array.isArray(cv.skills))
            setSkills(filterMeaningfulCvEntries(cv.skills));
          if (Array.isArray(cv.activities)) {
            setActivities(filterMeaningfulCvEntries(cv.activities));
            setVisibleSections((prev) => ({
              ...prev,
              activities: cv.activities!.some(
                (entry) => filterMeaningfulCvEntries([entry]).length > 0,
              ),
            }));
          }
          if (Array.isArray(cv.projects)) {
            setProjects(filterMeaningfulCvEntries(cv.projects));
            setVisibleSections((prev) => ({
              ...prev,
              activities:
                filterMeaningfulCvEntries(cv.activities).length +
                  filterMeaningfulCvEntries(cv.projects).length >
                0,
            }));
          }
          if (Array.isArray(cv.certificates)) {
            setCertificates(filterMeaningfulCvEntries(cv.certificates));
            setVisibleSections((prev) => ({
              ...prev,
              certificates:
                filterMeaningfulCvEntries(cv.certificates).length > 0,
            }));
          }
          if (Array.isArray(cv.awards)) {
            setAwards(filterMeaningfulCvEntries(cv.awards));
            setVisibleSections((prev) => ({
              ...prev,
              awards: filterMeaningfulCvEntries(cv.awards).length > 0,
            }));
          }
        }
      } catch (error) {
        console.error("Failed to load CV:", error);
      } finally {
        setIsLoadingExistingCv(false);
      }
    })();
  }, [id, isNew, accessToken, generationQueryOperationId]);

  // Fetch existing user CVs for library tool
  useEffect(() => {
    if (accessToken) {
      onlineCvApi
        .findAll(accessToken)
        .then((data) => setExistingCvs(data || []))
        .catch(() => {});
    }
  }, [accessToken]);

  // Auto-set template and language if navigating with state/query on new CV
  useEffect(() => {
    if (isNew) {
      const selectedTpl =
        locationState?.templateType ||
        (searchParams.get("template") as CVTemplateType);
      if (selectedTpl) {
        setTemplateType(selectedTpl);
        setFontFamilyId(selectedTpl === "template1" ? "times" : "inter");
      }
      if (locationState?.themeColorId) {
        setThemeColorId(locationState.themeColorId);
      }
      if (locationState?.cvLanguage) {
        setCvLanguage(locationState.cvLanguage);
      }
    }
  }, [isNew, location.state, searchParams]);

  // Auto-set title on initial name/position change
  useEffect(() => {
    if (isNew && fullName && !isTitleManual) {
      setTitle(`CV - ${fullName}${position ? ` - ${position}` : ""}`);
    }
  }, [fullName, position, isNew, isTitleManual]);

  // Serializes the live interactive canvas into clean, static HTML for Puppeteer
  const generateStaticPrintHtml = (rootEl: HTMLElement): string => {
    const clone = rootEl.cloneNode(true) as HTMLElement;
    clone.style.transform = "none";
    clone.style.margin = "0 auto";
    clone.style.boxShadow = "none";

    // Remove any interactive UI elements, edit buttons, toolbars, popovers
    clone
      .querySelectorAll(
        '.print\\:hidden, button, [role="toolbar"], [data-toolbar], [data-cv-empty-entry="true"]',
      )
      .forEach((el) => el.remove());

    const liveInputs = Array.from(
      rootEl.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        "input, textarea",
      ),
    ).filter((input) => !input.closest('[data-cv-empty-entry="true"]'));
    const cloneInputs = clone.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement
    >("input, textarea");

    cloneInputs.forEach((input, index) => {
      const liveInput = liveInputs[index];
      const isTextarea = input.tagName === "TEXTAREA";
      const tag = isTextarea ? "div" : "span";
      const replacement = document.createElement(tag);

      replacement.className = input.className
        .replace(/border-[^\s]+/g, "")
        .replace(/focus:[^\s]+/g, "")
        .replace(/hover:[^\s]+/g, "");
      replacement.style.cssText = input.style.cssText;
      replacement.style.border = "none";
      replacement.style.outline = "none";
      replacement.style.background = "transparent";
      replacement.style.boxShadow = "none";
      replacement.style.display = isTextarea ? "block" : "inline-block";
      replacement.style.whiteSpace = "pre-wrap";
      replacement.style.wordBreak = "break-word";

      const textVal = liveInput
        ? liveInput.value
        : input.value || input.getAttribute("value") || "";
      replacement.textContent = textVal;

      input.parentNode?.replaceChild(replacement, input);
    });

    return clone.outerHTML;
  };

  const buildCvPayload = (
    includeHtmlContent: boolean,
    payloadGenerationMode: CVGenerationMode = generationMode,
    includeGenerationMode = true,
  ): CreateOnlineCVDto => {
    const payload: CreateOnlineCVDto = {
      title:
        title.trim() ||
        `CV - ${fullName.trim()}${position ? ` - ${position.trim()}` : ""}`,
      templateType,
      locale: cvLocale,
      fullName: fullName.trim(),
      position: position.trim() || undefined,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      link: link.trim() || undefined,
      address: address.trim() || undefined,
      careerObjective: visibleSections.objective
        ? careerObjective.trim()
        : undefined,
      education: visibleSections.education
        ? filterMeaningfulCvEntries(education)
        : [],
      workExperience: visibleSections.experience
        ? filterMeaningfulCvEntries(workExperience)
        : [],
      skills: visibleSections.skills ? filterMeaningfulCvEntries(skills) : [],
      activities: visibleSections.activities
        ? filterMeaningfulCvEntries(activities)
        : [],
      projects: visibleSections.activities
        ? filterMeaningfulCvEntries(projects)
        : [],
      certificates: visibleSections.certificates
        ? filterMeaningfulCvEntries(certificates)
        : [],
      awards: visibleSections.awards ? filterMeaningfulCvEntries(awards) : [],
      sectionOrder,
      fontFamily: fontFamilyId,
      themeColor: themeColorId,
      fontSize,
    };

    if (includeGenerationMode) payload.generationMode = payloadGenerationMode;

    if (includeHtmlContent && payloadGenerationMode !== "EDITOR_ONLY") {
      const printCanvas = document.getElementById("cv-print-area");
      payload.htmlContent = printCanvas
        ? generateStaticPrintHtml(printCanvas)
        : "";
    }

    return payload;
  };

  latestPayloadRef.current = {
    ...buildCvPayload(false, generationMode, false),
    expectedContentVersion: contentVersionRef.current,
  };
  latestDraftRevisionRef.current = draftRevision;

  // Generated drafts and subsequent manual edits use the same PATCH contract.
  useEffect(() => {
    const activeCvId = editorCvId || (!isNew ? id : null);
    if (
      !activeCvId ||
      !accessToken ||
      isLoadingExistingCv ||
      !isDirty ||
      isSaving ||
      generationIsActive
    ) {
      return;
    }

    const revision = draftRevision;
    const timer = window.setTimeout(() => {
      const payload = latestPayloadRef.current;
      if (!payload) return;

      setIsAutoSaving(true);
      void onlineCvApi
        .update(activeCvId, payload, accessToken)
        .then((saved) => {
          if (generationContextRef.current.cvId !== activeCvId ||
              generationContextRef.current.accessToken !== accessToken) return;
          contentVersionRef.current = saved.contentVersion || contentVersionRef.current;
          setContentVersion(contentVersionRef.current);
          if (latestDraftRevisionRef.current === revision) setIsDirty(false);
        })
        .catch((error: any) => {
          toast.error(
            "Lỗi tự động lưu CV",
            error.message || "Không thể tự động lưu thay đổi.",
          );
        })
        .finally(() => setIsAutoSaving(false));
    }, 900);

    return () => window.clearTimeout(timer);
  }, [
    accessToken,
    draftRevision,
    editorCvId,
    generationIsActive,
    id,
    isDirty,
    isLoadingExistingCv,
    isNew,
    isSaving,
    toast,
  ]);

  const applyGeneratedDraft = (
    response: GenerateOnlineCVDraftResponse | GenerateOnlineCVJobStatusResponse,
  ) => {
    const mappedResponse = mapGeneratedDraftResponse(response);
    const draft = mappedResponse.draft;
    if (mappedResponse.locale)
      setCvLanguage(mappedResponse.locale === "en-US" ? "en" : "vi");
    if (draft.title && !isTitleManual) setTitle(draft.title);
    if (draft.fullName !== undefined) setFullName(draft.fullName || "");
    if (draft.position !== undefined) setPosition(draft.position || "");
    if (draft.phone !== undefined) setPhone(draft.phone || "");
    if (draft.email !== undefined) setEmail(draft.email || "");
    if (draft.link !== undefined) setLink(draft.link || "");
    if (draft.address !== undefined) setAddress(draft.address || "");
    if (draft.careerObjective !== undefined)
      setCareerObjective(draft.careerObjective || "");
    if (draft.education)
      setEducation(filterMeaningfulCvEntries(draft.education));
    if (draft.workExperience)
      setWorkExperience(filterMeaningfulCvEntries(draft.workExperience));
    if (draft.skills) setSkills(filterMeaningfulCvEntries(draft.skills));
    if (draft.activities)
      setActivities(filterMeaningfulCvEntries(draft.activities));
    if (draft.projects) setProjects(filterMeaningfulCvEntries(draft.projects));
    if (draft.certificates)
      setCertificates(filterMeaningfulCvEntries(draft.certificates));
    if (draft.awards) setAwards(filterMeaningfulCvEntries(draft.awards));
    if (draft.sectionOrder?.length) setSectionOrder(draft.sectionOrder);
    if (draft.fontFamily) setFontFamilyId(draft.fontFamily);
    if (draft.themeColor) setThemeColorId(draft.themeColor);
    if (draft.fontSize) setFontSize(draft.fontSize);
    if (draft.lineSpacing) setLineSpacing(draft.lineSpacing);

    setVisibleSections((previous) => ({
      ...previous,
      ...(draft.activities || draft.projects
        ? {
            activities:
              (draft.activities?.length || 0) + (draft.projects?.length || 0) >
              0,
          }
        : {}),
      ...(draft.certificates
        ? { certificates: draft.certificates.length > 0 }
        : {}),
      ...(draft.awards ? { awards: draft.awards.length > 0 } : {}),
    }));
    // The generate endpoint is editor-only even if an older response omitted the mode.
    setGenerationMode(mappedResponse.generationMode || "EDITOR_ONLY");
    if (response.contentVersion !== undefined) {
      contentVersionRef.current = response.contentVersion;
      setContentVersion(response.contentVersion);
    }
    setGenerationWarnings(mappedResponse.warnings);
    setGenerationStatus(mappedResponse.status);
    setGenerationError(null);
    markDirty();
  };

  const clearGenerationTimer = () => {
    if (generationTimerRef.current !== null) {
      window.clearTimeout(generationTimerRef.current);
      generationTimerRef.current = null;
    }
  };

  const clearGenerationQuery = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("generation");
    navigate(
      { pathname: location.pathname, search: next.toString() ? `?${next}` : "" },
      { replace: true },
    );
  };

  const persistGenerationQuery = (cvId: string, operationId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("generation", operationId);
    navigate(
      {
        pathname: `/cv-editor/${cvId}`,
        search: `?${next.toString()}`,
      },
      { replace: true },
    );
  };

  const applyTerminalGenerationResult = async (
    result: GenerateOnlineCVJobStatusResponse,
    cvId: string,
  ): Promise<void> => {
    const signal = generationAbortRef.current?.signal;
    if (
      pollingStoppedRef.current ||
      !generationContextIsCurrent() ||
      pollingOperationRef.current !== result.operationId
    ) {
      return;
    }
    let draftFetchFailed = false;
    const rawResult = asRecord(result);
    const currentPayload =
      result.current ||
      rawResult.currentGeneration ||
      rawResult.generation ||
      rawResult.result;
    const hasResultPayload = Boolean(
      result.draft ||
        currentPayload ||
        rawResult.fullName ||
        rawResult.full_name,
    );
    if (hasResultPayload) {
      applyGeneratedDraft({
        ...result,
        ...(currentPayload && !result.draft ? { cv: currentPayload } : {}),
      } as GenerateOnlineCVJobStatusResponse);
    } else {
      try {
        const current = await onlineCvApi.findOne(cvId, accessToken);
        if (
          pollingStoppedRef.current ||
          signal?.aborted ||
          !generationContextIsCurrent() ||
          pollingOperationRef.current !== result.operationId
        ) {
          return;
        }
        applyGeneratedDraft({
          ...result,
          contentVersion: current.contentVersion,
          cv: current,
        } as GenerateOnlineCVJobStatusResponse);
      } catch {
        if (signal?.aborted || !generationContextIsCurrent() || pollingOperationRef.current !== result.operationId) return;
        draftFetchFailed = true;
      }
    }
    setGenerationStatus(result.status === "DEGRADED" ? "DEGRADED" : "COMPLETE");
    setGenerationError(
      draftFetchFailed ? localizedGenerationStatus("FAILED", cvLocale) : null,
    );
  };

  const scheduleGenerationPoll = (cvId: string, operationId: string, delaySeconds: number) => {
    clearGenerationTimer();
    generationTimerRef.current = window.setTimeout(() => {
      void pollGenerationJob(cvId, operationId);
    }, Math.max(1, Math.min(delaySeconds || 5, 60)) * 1000);
  };

  const pollGenerationJob = async (cvId: string, operationId: string): Promise<void> => {
    const signal = generationAbortRef.current?.signal;
    if (
      pollingStoppedRef.current ||
      pollingOperationRef.current !== operationId ||
      !accessToken
    ) {
      return;
    }
    if (pollingInFlightRef.current) {
      scheduleGenerationPoll(cvId, operationId, 5);
      return;
    }

    pollingInFlightRef.current = true;
    try {
      const result = await onlineCvApi.getGenerationJob(
        cvId,
        operationId,
        accessToken,
        signal,
      );
      if (
        pollingStoppedRef.current ||
        signal?.aborted ||
        !generationContextIsCurrent() ||
        pollingOperationRef.current !== operationId
      ) {
        return;
      }

      const status = result.status;
      if (
        status === "QUEUED" ||
        status === "PROCESSING" ||
        status === "CANCEL_REQUESTED"
      ) {
        setGenerationJobStatus(status);
        setGenerationStatus("GENERATING");
        scheduleGenerationPoll(cvId, operationId, result.pollAfterSeconds || 5);
        return;
      }

      clearGenerationTimer();
      if (status === "COMPLETE" || status === "DEGRADED") {
        await applyTerminalGenerationResult(result, cvId);
        if (signal?.aborted || !generationContextIsCurrent() || pollingOperationRef.current !== operationId) return;
        setGenerationJobStatus(status);
        pollingOperationRef.current = null;
        clearGenerationQuery();
        return;
      }

      const terminalStatus = status === "CANCELLED" || status === "STALE" ? status : "FAILED";
      setGenerationJobStatus(terminalStatus);
      setGenerationStatus(terminalStatus);
      setGenerationError(localizedGenerationStatus(terminalStatus, cvLocale));
      pollingOperationRef.current = null;
      clearGenerationQuery();
    } catch (error) {
      if (pollingStoppedRef.current || signal?.aborted || !generationContextIsCurrent() || pollingOperationRef.current !== operationId) return;
      if (error instanceof ApiError && [401, 403, 404, 409].includes(error.status)) {
        const terminalStatus: CVGenerationJobStatus =
          error.status === 404 || error.status === 409 ? "STALE" : "FAILED";
        setGenerationJobStatus(terminalStatus);
        setGenerationStatus(terminalStatus);
        setGenerationError(localizedGenerationStatus(terminalStatus, cvLocale));
        pollingOperationRef.current = null;
        clearGenerationQuery();
      } else {
        setGenerationError(localizedGenerationStatus("FAILED", cvLocale));
        scheduleGenerationPoll(cvId, operationId, 5);
      }
    } finally {
      if (generationAbortRef.current?.signal === signal) pollingInFlightRef.current = false;
    }
  };

  const startGenerationPolling = (
    cvId: string,
    operationId: string,
    pollAfterSeconds = 5,
  ) => {
    clearGenerationTimer();
    generationAbortRef.current?.abort();
    generationAbortRef.current = new AbortController();
    pollingInFlightRef.current = false;
    pollingStoppedRef.current = false;
    pollingOperationRef.current = operationId;
    setGenerationOperationId(operationId);
    setGenerationJobStatus("QUEUED");
    setGenerationStatus("GENERATING");
    setGenerationError(null);
    void pollGenerationJob(cvId, operationId);
    scheduleGenerationPoll(cvId, operationId, pollAfterSeconds);
  };

  const cancelGeneration = async () => {
    const cvId = editorCvId || id;
    const operationId = generationOperationId;
    if (!cvId || !operationId || !accessToken || !generationIsActive) return;
    clearGenerationTimer();
    generationAbortRef.current?.abort();
    generationAbortRef.current = new AbortController();
    const signal = generationAbortRef.current.signal;
    pollingInFlightRef.current = false;
    pollingOperationRef.current = operationId;
    try {
      const result = await onlineCvApi.cancelGenerationJob(
        cvId,
        operationId,
        accessToken,
        signal,
      );
      if (signal.aborted || !generationContextIsCurrent() || pollingOperationRef.current !== operationId) return;
      if (result.status === "COMPLETE" || result.status === "DEGRADED") {
        await applyTerminalGenerationResult(result, cvId);
        if (signal.aborted || !generationContextIsCurrent() || pollingOperationRef.current !== operationId) return;
        setGenerationJobStatus(result.status);
        pollingOperationRef.current = null;
        clearGenerationQuery();
        return;
      }
      if (
        result.status === "CANCEL_REQUESTED" ||
        result.status === "QUEUED" ||
        result.status === "PROCESSING"
      ) {
        startGenerationPolling(
          cvId,
          operationId,
          result.pollAfterSeconds || 5,
        );
        setGenerationJobStatus(result.status);
        return;
      }
      const terminalStatus =
        result.status === "STALE" || result.status === "FAILED"
          ? result.status
          : "CANCELLED";
      setGenerationJobStatus(terminalStatus);
      setGenerationStatus(terminalStatus);
      setGenerationError(localizedGenerationStatus(terminalStatus, cvLocale));
      pollingOperationRef.current = null;
      clearGenerationQuery();
    } catch (error) {
      if (signal.aborted || !generationContextIsCurrent() || pollingOperationRef.current !== operationId) return;
      if (error instanceof ApiError && [401, 403, 404, 409].includes(error.status)) {
        const terminalStatus: CVGenerationJobStatus =
          error.status === 404 || error.status === 409 ? "STALE" : "FAILED";
        setGenerationJobStatus(terminalStatus);
        setGenerationStatus(terminalStatus);
        setGenerationError(localizedGenerationStatus(terminalStatus, cvLocale));
        pollingOperationRef.current = null;
        clearGenerationQuery();
      } else {
        pollingOperationRef.current = operationId;
        setGenerationError(localizedGenerationStatus("FAILED", cvLocale));
        startGenerationPolling(cvId, operationId, 5);
      }
    }
  };

  useEffect(() => () => {
    pollingStoppedRef.current = true;
    pollingOperationRef.current = null;
    generationAbortRef.current?.abort();
    generationAbortRef.current = null;
    clearGenerationTimer();
  }, []);

  useEffect(() => {
    if (!accessToken || !editorCvId || !generationQueryOperationId) {
      return () => {
        if (pollingOperationRef.current) {
          pollingOperationRef.current = null;
          generationAbortRef.current?.abort();
          generationAbortRef.current = null;
          clearGenerationTimer();
        }
      };
    }
    if (pollingOperationRef.current !== generationQueryOperationId) {
      startGenerationPolling(editorCvId, generationQueryOperationId);
    }
    return () => {
      generationAbortRef.current?.abort();
      generationAbortRef.current = null;
      pollingOperationRef.current = null;
      clearGenerationTimer();
    };
    // Polling is fenced by operationId and cleaned up on unmount or route changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, editorCvId, generationQueryOperationId]);

  useEffect(() => {
    if (generationIsActive && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }, [generationIsActive]);

  const persistCv = async (
    redirectAfterSave: boolean,
    payloadGenerationMode: CVGenerationMode = generationMode,
  ): Promise<string | null> => {
    if (!fullName.trim()) {
      alert("Vui lòng nhập Họ và tên trong CV!");
      return null;
    }

    setIsSaving(true);
    try {
      const activeCvId = editorCvId || (!isNew ? id : null);
      const payload = buildCvPayload(
        payloadGenerationMode !== "EDITOR_ONLY",
        payloadGenerationMode,
        !activeCvId || payloadGenerationMode !== "EDITOR_ONLY",
      );
      const saved = activeCvId
        ? await onlineCvApi.update(activeCvId, {
            ...payload,
            expectedContentVersion: contentVersionRef.current,
          }, accessToken)
        : await onlineCvApi.create(payload, accessToken);
      if (!generationRequestContextIsCurrent()) return null;
      setEditorCvId(saved._id);
      contentVersionRef.current = saved.contentVersion || contentVersionRef.current;
      setContentVersion(contentVersionRef.current);
      setGenerationMode(saved.generationMode || generationMode);
      setIsDirty(false);

      if (!redirectAfterSave) return saved._id;

      const message = activeCvId
        ? "Cập nhật CV thành công!"
        : "Tạo mới CV thành công!";
      const description = `Bản CV "${title.trim() || fullName}" đã được lưu vào danh sách của bạn.`;

      setTimeout(() => {
        navigate("/my-cv", {
          state: {
            toast: {
              type: "success",
              message,
              description,
            },
          },
        });
      }, 200);
      return saved._id;
    } catch (error: any) {
      toast.error(
        "Lỗi khi lưu CV",
        error.message || "Không thể lưu CV. Vui lòng thử lại!",
      );
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveCV = () => {
    void persistCv(true);
  };

  const handleGenerateWithAi = async () => {
    setGenerationError(null);
    setGenerationWarnings([]);
    setGenerationStatus("GENERATING");
    setGenerationJobStatus("QUEUED");

    try {
      if (isDirty) {
        const savedId = await persistCv(false, generationMode);
        if (!generationRequestContextIsCurrent()) return;
        if (!savedId) throw new Error("cv_save_failed");
      }
      const cvId =
        editorCvId ||
        (!isNew ? id : null) ||
        (await persistCv(false, "MANUAL"));
      if (!generationRequestContextIsCurrent()) return;
      if (!cvId) {
        setGenerationStatus("FAILED");
        setGenerationJobStatus("FAILED");
        setGenerationError(
          cvLocale === "vi-VN"
            ? "Hãy nhập họ tên trước khi tạo CV bằng AI."
            : "Enter a full name before creating an AI CV.",
        );
        return;
      }

      const response = await onlineCvApi.createGenerationJob(
        cvId,
        {
          ...(generationJobId.trim() ? { jobId: generationJobId.trim() } : {}),
          expectedContentVersion: contentVersionRef.current,
        },
        createIdempotencyKey(),
        accessToken,
      );
      if (!generationRequestContextIsCurrent()) return;
      if (!response.operationId || !response.onlineCvId) {
        throw new Error("invalid_generation_response");
      }
      setEditorCvId(response.onlineCvId);
      setShowAiModal(false);
      persistGenerationQuery(response.onlineCvId, response.operationId);
      startGenerationPolling(
        response.onlineCvId,
        response.operationId,
        response.pollAfterSeconds,
      );
    } catch {
      if (!generationRequestContextIsCurrent()) return;
      setGenerationStatus("FAILED");
      setGenerationJobStatus("FAILED");
      setGenerationError(localizedGenerationStatus("FAILED", cvLocale));
    }
  };

  // Back button handler returning to previous page
  const handleBack = () => {
    if (
      isDirty &&
      !window.confirm("Bạn có thay đổi chưa lưu. Bạn có chắc muốn rời đi?")
    ) {
      return;
    }
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/cv-templates");
    }
  };

  return (
    <div className="flex h-screen flex-col bg-slate-200 dark:bg-slate-950 font-sans overflow-hidden">
      {/* 1. TOP BAR */}
      <header className="h-16 shrink-0 border-b border-slate-200/80 bg-white px-4 sm:px-6 flex items-center justify-between z-30 shadow-xs dark:border-slate-800 dark:bg-slate-900 print:hidden">
        {/* Left: Back & Title */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={handleBack}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition cursor-pointer shrink-0"
            title="Quay lại trang trước"
            aria-label="Quay lại"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </button>

          {/* Editable CV Title */}
          <div className="flex items-center gap-2 min-w-0">
            <input
              type="text"
              value={title}
              disabled={generationIsActive}
              onChange={(e) => {
                setIsTitleManual(true);
                setTitle(e.target.value);
                markDirty();
              }}
              placeholder="Nhập tên CV..."
              className="font-bold text-sm sm:text-base text-slate-900 dark:text-white bg-transparent border-b border-transparent hover:border-slate-300 focus:border-primary focus:outline-none px-1 py-0.5 max-w-[200px] sm:max-w-[320px] truncate"
            />
            {isDirty && (
              <span
                className="flex h-2 w-2 rounded-full bg-amber-500 shrink-0"
                title="Có thay đổi chưa lưu"
              />
            )}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Dark / Light Mode Toggle Button */}
          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-100/80 text-slate-600 hover:bg-slate-200 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition cursor-pointer"
            title={
              theme === "dark"
                ? "Chuyển sang chế độ Sáng"
                : "Chuyển sang chế độ Tối"
            }
            aria-label="Toggle Theme"
          >
            {theme === "dark" ? (
              <Sun className="h-4.5 w-4.5 text-amber-400" />
            ) : (
              <Moon className="h-4.5 w-4.5 text-slate-600" />
            )}
          </button>

          {/* Manual Save Button */}
          <button
            type="button"
            onClick={handleSaveCV}
            disabled={isSaving || isAutoSaving || generationIsActive}
            className="flex h-10 items-center gap-2 rounded-xl bg-primary px-4 sm:px-6 text-xs sm:text-sm font-extrabold text-white shadow-md shadow-primary/25 transition hover:bg-primary-dark active:scale-98 cursor-pointer disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            <span>
              {isSaving
                ? "Đang lưu..."
                : isAutoSaving
                  ? "Đang tự lưu..."
                  : "Lưu CV"}
            </span>
          </button>
        </div>
      </header>

      {/* 2. MAIN WORKSPACE */}
      <div className="relative flex flex-1 overflow-hidden">
        {generationIsActive && (
          <div
            className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/35 p-6 backdrop-blur-[2px]"
            role="status"
            aria-live="polite"
          >
            <div className="w-full max-w-sm rounded-2xl border border-white/20 bg-white/95 p-6 text-center shadow-2xl dark:border-slate-700 dark:bg-slate-900/95">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
              <p className="mt-3 text-sm font-bold text-slate-900 dark:text-white">
                {localizedGenerationStatus(generationJobStatus, cvLocale)}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {cvLocale === "vi-VN"
                  ? "Bạn có thể hủy yêu cầu, nội dung hiện tại vẫn được giữ nguyên."
                  : "You can cancel the request; your current content will be kept."}
              </p>
              <button
                type="button"
                onClick={() => void cancelGeneration()}
                className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-rose-200 px-4 text-xs font-bold text-rose-700 transition hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-300 dark:hover:bg-rose-950/30"
              >
                <X className="h-4 w-4" />
                {cvLocale === "vi-VN" ? "Hủy tạo bản nháp" : "Cancel generation"}
              </button>
            </div>
          </div>
        )}
        {/* SIDEBAR TOOLBAR (Icons Column - 64px) */}
        <aside inert={generationIsActive} aria-hidden={generationIsActive} className="w-16 shrink-0 border-r border-slate-200/80 bg-white py-4 flex flex-col items-center justify-between dark:border-slate-800 dark:bg-slate-900 z-20 print:hidden">
          <div className="flex flex-col items-center gap-2">
            {/* Tool 1: Design & Font */}
            <button
              type="button"
              onClick={() =>
                setActiveSidebarTool((prev) =>
                  prev === "design" ? null : "design",
                )
              }
              className={`flex h-11 w-11 flex-col items-center justify-center rounded-xl text-[10px] font-bold transition-all cursor-pointer ${
                activeSidebarTool === "design"
                  ? "bg-primary text-white shadow-md shadow-primary/25"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              }`}
              title="Thiết kế & Font chữ"
            >
              <Type className="h-4.5 w-4.5" />
              <span className="mt-0.5 scale-90">Font</span>
            </button>

            {/* Tool 2: Add Sections */}
            <button
              type="button"
              onClick={() =>
                setActiveSidebarTool((prev) =>
                  prev === "sections" ? null : "sections",
                )
              }
              className={`flex h-11 w-11 flex-col items-center justify-center rounded-xl text-[10px] font-bold transition-all cursor-pointer ${
                activeSidebarTool === "sections"
                  ? "bg-primary text-white shadow-md shadow-primary/25"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              }`}
              title="Thêm mục"
            >
              <Plus className="h-4.5 w-4.5" />
              <span className="mt-0.5 scale-90">Mục</span>
            </button>

            {/* Tool 3: Templates */}
            <button
              type="button"
              onClick={() =>
                setActiveSidebarTool((prev) =>
                  prev === "templates" ? null : "templates",
                )
              }
              className={`flex h-11 w-11 flex-col items-center justify-center rounded-xl text-[10px] font-bold transition-all cursor-pointer ${
                activeSidebarTool === "templates"
                  ? "bg-primary text-white shadow-md shadow-primary/25"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              }`}
              title="Đổi mẫu CV"
            >
              <LayoutGrid className="h-4.5 w-4.5" />
              <span className="mt-0.5 scale-90">Mẫu</span>
            </button>

            {/* Tool 4: Language (Việt / Anh) */}
            <button
              type="button"
              onClick={() =>
                setActiveSidebarTool((prev) =>
                  prev === "language" ? null : "language",
                )
              }
              className={`flex h-11 w-11 flex-col items-center justify-center rounded-xl text-[10px] font-bold transition-all cursor-pointer ${
                activeSidebarTool === "language"
                  ? "bg-primary text-white shadow-md shadow-primary/25"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              }`}
              title="Ngôn ngữ CV (Việt / Anh)"
            >
              <Globe className="h-4.5 w-4.5" />
              <span className="mt-0.5 scale-90">Ngôn ngữ</span>
            </button>

            {/* Tool 5: AI CV generation */}
            <button
              type="button"
              onClick={() => setShowAiModal(true)}
              className="flex h-11 w-11 flex-col items-center justify-center rounded-xl text-[10px] font-bold text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-all cursor-pointer relative"
              title="Tạo CV bằng AI"
            >
              <Sparkles className="h-4.5 w-4.5 text-amber-500" />
              <span className="mt-0.5 scale-90 text-amber-600 dark:text-amber-400">
                AI
              </span>
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] text-white font-bold">
                <Crown className="h-2.5 w-2.5" />
              </span>
            </button>

            {/* Tool 6: Library */}
            <button
              type="button"
              onClick={() =>
                setActiveSidebarTool((prev) =>
                  prev === "library" ? null : "library",
                )
              }
              className={`flex h-11 w-11 flex-col items-center justify-center rounded-xl text-[10px] font-bold transition-all cursor-pointer ${
                activeSidebarTool === "library"
                  ? "bg-primary text-white shadow-md shadow-primary/25"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              }`}
              title="Thư viện CV của bạn"
            >
              <Layers className="h-4.5 w-4.5" />
              <span className="mt-0.5 scale-90">CV</span>
            </button>
          </div>
        </aside>

        {/* TOOL CONFIG FLYOUT PANEL (300px - Expandable) */}
        <AnimatePresence>
          {activeSidebarTool && (
            <motion.div
              inert={generationIsActive}
              aria-hidden={generationIsActive}
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 300, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="w-[300px] shrink-0 border-r border-slate-200/80 bg-white p-5 overflow-y-auto dark:border-slate-800 dark:bg-slate-900 z-10 print:hidden shadow-lg"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                  {activeSidebarTool === "design" && "Thiết kế & Font chữ"}
                  {activeSidebarTool === "sections" && "Bật / Tắt mục CV"}
                  {activeSidebarTool === "templates" && "Đổi mẫu giao diện"}
                  {activeSidebarTool === "language" && "Ngôn ngữ CV"}
                  {activeSidebarTool === "library" && "Thư viện CV của bạn"}
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveSidebarTool(null)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* TOOL 1: Design & Font */}
              {activeSidebarTool === "design" && (
                <div className="space-y-5 text-xs">
                  {/* Font Selection */}
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-2">
                      Font chữ toàn trang ({CV_FONTS.length} loại)
                    </label>
                    <div className="space-y-1.5">
                      {CV_FONTS.map((font) => (
                        <button
                          key={font.id}
                          type="button"
                          onClick={() => {
                            setFontFamilyId(font.id);
                            markDirty();
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left font-medium transition cursor-pointer ${
                            fontFamilyId === font.id
                              ? "bg-primary/10 text-primary border border-primary/30 font-bold dark:bg-primary/20"
                              : "bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-slate-800/60 dark:text-slate-300"
                          }`}
                        >
                          <span style={{ fontFamily: font.family }}>
                            {font.name}
                          </span>
                          {fontFamilyId === font.id && (
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Theme Colors */}
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-2">
                      Màu sắc chủ đạo
                    </label>
                    <div className="grid grid-cols-5 gap-2">
                      {CV_THEMES.map((theme) => (
                        <button
                          key={theme.id}
                          type="button"
                          onClick={() => {
                            setThemeColorId(theme.id);
                            markDirty();
                          }}
                          className={`h-9 w-full rounded-xl transition-all flex items-center justify-center cursor-pointer ${
                            themeColorId === theme.id
                              ? "ring-2 ring-primary ring-offset-2 scale-105 shadow-md"
                              : "hover:scale-105 opacity-85 hover:opacity-100"
                          }`}
                          style={{ backgroundColor: theme.color }}
                          title={theme.name}
                        >
                          {themeColorId === theme.id && (
                            <CheckCircle2 className="h-4 w-4 text-white" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Font Size Slider */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="font-bold text-slate-700 dark:text-slate-300">
                        Cỡ chữ cơ sở
                      </label>
                      <span className="text-slate-500 font-semibold capitalize">
                        {fontSize === "small"
                          ? "Nhỏ (~13px)"
                          : fontSize === "medium"
                            ? "Vừa (~14px)"
                            : "Lớn (~16px)"}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                      {(["small", "medium", "large"] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => {
                            setFontSize(s);
                            markDirty();
                          }}
                          className={`py-1.5 rounded-lg text-center font-bold text-xs transition cursor-pointer ${
                            fontSize === s
                              ? "bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          {s === "small"
                            ? "Nhỏ"
                            : s === "medium"
                              ? "Vừa"
                              : "Lớn"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Line Spacing */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="font-bold text-slate-700 dark:text-slate-300">
                        Khoảng cách dòng
                      </label>
                      <span className="text-slate-500 font-semibold">
                        {lineSpacing}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="1.0"
                      max="1.8"
                      step="0.1"
                      value={lineSpacing}
                      onChange={(e) => {
                        setLineSpacing(parseFloat(e.target.value));
                        markDirty();
                      }}
                      className="w-full accent-primary cursor-pointer"
                    />
                  </div>
                </div>
              )}

              {/* TOOL 2: Add / Remove & Reorder Sections */}
              {activeSidebarTool === "sections" && (
                <div className="space-y-2 text-xs">
                  <p className="text-slate-500 text-[11px] mb-2">
                    Bật tắt &amp; sắp xếp thứ tự hiển thị các khối thông tin trên
                    CV:
                  </p>

                  {sectionOrder.map((secId, idx) => {
                    const labelMap: Record<string, string> = {
                      objective: "Mục tiêu nghề nghiệp",
                      education: "Học vấn",
                      experience: "Kinh nghiệm làm việc",
                      skills: "Kỹ năng chuyên môn",
                      activities: "Hoạt động & Dự án",
                      certificates: "Chứng chỉ",
                      awards: "Giải thưởng & Danh hiệu",
                    };
                    const label = labelMap[secId] || secId;
                    return (
                      <div
                        key={secId}
                        className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {/* Reorder Up/Down */}
                          <div className="flex flex-col gap-0.5 shrink-0">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => moveSection(secId, "up")}
                              className="p-0.5 rounded text-slate-400 hover:text-primary disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                              title="Di chuyển lên"
                            >
                              <MoveUp className="h-2.5 w-2.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === sectionOrder.length - 1}
                              onClick={() => moveSection(secId, "down")}
                              className="p-0.5 rounded text-slate-400 hover:text-primary disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                              title="Di chuyển xuống"
                            >
                              <MoveDown className="h-2.5 w-2.5" />
                            </button>
                          </div>
                          <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                            {label}
                          </span>
                        </div>

                        <input
                          type="checkbox"
                          checked={
                            visibleSections[
                              secId as keyof typeof visibleSections
                            ]
                          }
                          onChange={(e) => {
                            setVisibleSections((prev) => ({
                              ...prev,
                              [secId]: e.target.checked,
                            }));
                            markDirty();
                          }}
                          className="h-4 w-4 rounded-md text-primary focus:ring-primary accent-primary cursor-pointer shrink-0 ml-2"
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* TOOL 3: Switch Template */}
              {activeSidebarTool === "templates" && (
                <div className="space-y-4 text-xs">
                  <div
                    onClick={() => {
                      setTemplateType("template1");
                      markDirty();
                    }}
                    className={`p-3 rounded-2xl border-2 transition cursor-pointer ${
                      templateType === "template1"
                        ? "border-primary bg-primary/5 dark:bg-primary/10"
                        : "border-slate-200 hover:border-slate-300 dark:border-slate-800"
                    }`}
                  >
                    <p className="font-extrabold text-slate-900 dark:text-white">
                      Mẫu 1: Tiêu chuẩn ATS (Classic)
                    </p>
                    <p className="text-slate-500 mt-1 text-[11px]">
                      Bố cục 1 cột truyền thống, dễ đọc và tối ưu điểm quét ATS.
                    </p>
                  </div>

                  <div
                    onClick={() => {
                      if (!user?.isPremium) {
                        toast.info(
                          "Mẫu CV Cao Cấp (Premium)",
                          "Mẫu Hiện đại 2 Cột chỉ dành riêng cho tài khoản Candidate Premium. Vui lòng nâng cấp để mở khóa.",
                        );
                        return;
                      }
                      setTemplateType("template2");
                      markDirty();
                    }}
                    className={`p-3 rounded-2xl border-2 transition cursor-pointer relative ${
                      templateType === "template2"
                        ? "border-primary bg-primary/5 dark:bg-primary/10"
                        : "border-slate-200 hover:border-slate-300 dark:border-slate-800"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-extrabold text-slate-900 dark:text-white">
                        Mẫu 2: Hiện đại 2 Cột (Modern Timeline)
                      </p>
                      <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-black text-amber-700 dark:text-amber-300">
                        👑 PREMIUM
                      </span>
                    </div>
                    <p className="text-slate-500 mt-1 text-[11px]">
                      Bố cục 2 cột năng động với dòng thời gian trực quan.
                    </p>
                  </div>
                </div>
              )}

              {/* TOOL 4: Language (Việt / Anh) */}
              {activeSidebarTool === "language" && (
                <div className="space-y-4 text-xs">
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Ngôn ngữ hiển thị tiêu đề CV
                    </label>
                    <p className="text-[11.5px] text-slate-500 mb-3 leading-relaxed">
                      Chuyển đổi các tiêu đề mục lớn (Mục tiêu, Học vấn, Kinh
                      nghiệm, Kỹ năng,...) giữa Tiếng Việt và Tiếng Anh.
                    </p>
                  </div>

                  <div className="space-y-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setCvLanguage("vi");
                        markDirty();
                      }}
                      className={`w-full flex items-center justify-between p-3.5 rounded-2xl border-2 transition cursor-pointer ${
                        cvLanguage === "vi"
                          ? "border-primary bg-primary/5 dark:bg-primary/10 text-slate-900 dark:text-white font-bold shadow-xs"
                          : "border-slate-200 hover:border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl">🇻🇳</span>
                        <div className="text-left">
                          <p className="font-bold text-xs text-slate-900 dark:text-white">
                            Tiếng Việt
                          </p>
                          <p className="text-[10.5px] text-slate-400">
                            Mục tiêu, Học vấn, Kinh nghiệm, Kỹ năng...
                          </p>
                        </div>
                      </div>
                      {cvLanguage === "vi" && (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setCvLanguage("en");
                        markDirty();
                      }}
                      className={`w-full flex items-center justify-between p-3.5 rounded-2xl border-2 transition cursor-pointer ${
                        cvLanguage === "en"
                          ? "border-primary bg-primary/5 dark:bg-primary/10 text-slate-900 dark:text-white font-bold shadow-xs"
                          : "border-slate-200 hover:border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl">🇬🇧</span>
                        <div className="text-left">
                          <p className="font-bold text-xs text-slate-900 dark:text-white">
                            English (Tiếng Anh)
                          </p>
                          <p className="text-[10.5px] text-slate-400">
                            Objective, Education, Experience, Skills...
                          </p>
                        </div>
                      </div>
                      {cvLanguage === "en" && (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* TOOL 5: Existing CVs */}
              {activeSidebarTool === "library" && (
                <div className="space-y-3 text-xs">
                  <p className="text-slate-500 text-[11px]">
                    Các CV bạn đã lưu:
                  </p>
                  {existingCvs.length === 0 ? (
                    <p className="italic text-slate-400">
                      Chưa có CV nào khác.
                    </p>
                  ) : (
                    existingCvs.map((cv) => (
                      <button
                        key={cv._id}
                        type="button"
                        onClick={() => {
                          if (
                            isDirty &&
                            !window.confirm(
                              "Rời khỏi CV hiện tại mà không lưu?",
                            )
                          )
                            return;
                          navigate(`/cv-editor/${cv._id}`);
                        }}
                        className={`w-full p-2.5 text-left rounded-xl border transition cursor-pointer ${
                          cv._id === id
                            ? "border-primary bg-primary/10 text-primary font-bold"
                            : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        <p className="font-bold truncate">
                          {cv.title || cv.fullName || "CV không tên"}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {cv.templateType === "template1" ? "Mẫu 1" : "Mẫu 2"}{" "}
                          &bull; {formatDate(cv.createdAt)}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* 3. CENTER WYSIWYG A4 CANVAS (Interactive In-Place Editing) */}
        <div inert={generationIsActive} aria-hidden={generationIsActive} className="flex-1 overflow-auto flex flex-col items-center py-6 px-4 sm:px-8 relative select-none">
          {/* Zoom & Canvas Floating Controls */}
          <div className="sticky top-2 z-20 mb-6 flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/90 px-4 py-1.5 shadow-lg shadow-slate-900/10 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90 print:hidden select-none">
            <button
              type="button"
              onClick={() => setZoomScale((s) => Math.max(0.4, s - 0.1))}
              className="flex h-7 w-7 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
              title="Thu nhỏ"
            >
              <ZoomOut className="h-4 w-4" />
            </button>

            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 w-12 text-center">
              {Math.round(zoomScale * 100)}%
            </span>

            <button
              type="button"
              onClick={() => setZoomScale((s) => Math.min(1.4, s + 0.1))}
              className="flex h-7 w-7 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
              title="Phóng to"
            >
              <ZoomIn className="h-4 w-4" />
            </button>

            <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-700 mx-1.5" />

            <button
              type="button"
              onClick={() => setZoomScale(0.9)}
              className="px-2.5 py-0.5 rounded-md text-[11px] font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
            >
              Chuẩn A4
            </button>

            <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-700 mx-1.5" />

            <span className="text-[11px] text-slate-400 italic hidden sm:inline">
              💡 Rê chuột vào từng ô để định dạng cỡ chữ, màu sắc, font, in
              đậm/nghiêng
            </span>
          </div>

          {!generationIsActive &&
            (generationJobStatus === "STALE" ||
              generationJobStatus === "FAILED" ||
              generationJobStatus === "CANCELLED") &&
            generationError && (
              <div
                className="mb-4 flex w-full max-w-[210mm] items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-xs text-amber-900 shadow-sm dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200"
                role="status"
                aria-live="polite"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{generationError}</span>
              </div>
            )}

          {generationMode === "EDITOR_ONLY" && (
            <div
              className={`mb-4 w-full max-w-[210mm] rounded-xl border px-4 py-3 text-left text-xs shadow-sm ${
                hasGenerationBannerWarning
                  ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200"
                  : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-200"
              }`}
              role="status"
              aria-live="polite"
            >
              <div className="flex items-center gap-2 font-bold">
                {hasGenerationBannerWarning ? (
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                )}
                <span>
                  {generationProvenance === "mixed"
                    ? localeLabels.statusMixed
                    : generationProvenance === "fallback"
                      ? localeLabels.statusFallback
                      : localeLabels.statusAi}
                </span>
              </div>
              {hasActionableGenerationWarnings && (
                <>
                  <p className="mt-2 font-semibold">
                    {localeLabels.warningsTitle}
                  </p>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {visibleGenerationWarnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          {/* ================= IN-PLACE A4 PAPER CANVAS ================= */}
          <div
            id="cv-print-area"
            ref={cvPaperRef}
            className="relative bg-white shadow-2xl transition-all select-text overflow-visible rounded-md print:shadow-none print:rounded-none print:m-0 shrink-0 h-auto"
            style={{
              transform: zoomScale !== 1 ? `scale(${zoomScale})` : undefined,
              transformOrigin: "top center",
              width: "210mm",
              minHeight: "297mm",
              height: "auto",
              fontFamily: currentFont.family,
              lineHeight: lineSpacing,
              color: "#1E293B",
            }}
          >
            {/* Dynamic Page Break Lines (When CV has 2+ pages) */}
            {pageCount > 1 &&
              Array.from({ length: pageCount - 1 }, (_, i) => i + 2).map(
                (pageNum) => (
                  <div
                    key={pageNum}
                    className="pointer-events-none absolute left-0 right-0 z-30 select-none print:hidden flex items-center"
                    style={{
                      top: `calc(297mm * ${pageNum - 1})`,
                      transform: "translateY(-50%)",
                    }}
                  >
                    {/* Badge on left without line overlap */}
                    <div className="shrink-0 -ml-3 sm:-ml-4 flex items-center pr-2">
                      <span className="inline-flex items-center justify-center rounded-md bg-primary px-2.5 py-0.5 text-[11px] font-black text-white shadow-md shadow-primary/30 ring-2 ring-white dark:ring-slate-900 tracking-tight">
                        Trang {pageNum}
                      </span>
                    </div>

                    {/* Dashed Line spanning to the right */}
                    <div className="flex-1 border-t-2 border-dashed border-primary dark:border-primary-light opacity-85" />
                  </div>
                ),
              )}

            {/* ================= DYNAMIC CV TEMPLATE COMPONENT ================= */}
            {(() => {
              const SelectedTemplate =
                CV_EDITOR_TEMPLATES[templateType] ||
                CV_EDITOR_TEMPLATES.template1;
              return (
                <SelectedTemplate
                  currentTheme={currentTheme}
                  locale={cvLocale}
                  labels={localeLabels}
                  currentFont={currentFont}
                  fontMultiplier={fontMultiplier}
                  lineSpacing={lineSpacing}
                  fullName={fullName}
                  setFullName={setFullName}
                  position={position}
                  setPosition={setPosition}
                  phone={phone}
                  setPhone={setPhone}
                  email={email}
                  setEmail={setEmail}
                  link={link}
                  setLink={setLink}
                  address={address}
                  setAddress={setAddress}
                  careerObjective={careerObjective}
                  setCareerObjective={setCareerObjective}
                  education={education}
                  setEducation={setEducation}
                  workExperience={workExperience}
                  setWorkExperience={setWorkExperience}
                  skills={skills}
                  setSkills={setSkills}
                  activities={activities}
                  setActivities={setActivities}
                  projects={projects}
                  setProjects={setProjects}
                  certificates={certificates}
                  setCertificates={setCertificates}
                  awards={awards}
                  setAwards={setAwards}
                  visibleSections={visibleSections}
                  sectionOrder={sectionOrder}
                  moveSection={moveSection}
                  sectionLabels={
                    SECTION_LABELS[cvLanguage] || SECTION_LABELS.vi
                  }
                  markDirty={markDirty}
                  pageCount={pageCount}
                  bulletDescriptions={generationMode === "EDITOR_ONLY"}
                />
              );
            })()}
          </div>
        </div>
      </div>

      {/* AI CV generation modal */}
      <AnimatePresence>
        {showAiModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() =>
                !generationIsActive && setShowAiModal(false)
              }
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
            >
              <button
                type="button"
                onClick={() => setShowAiModal(false)}
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-lg shadow-amber-500/30">
                <Sparkles className="h-8 w-8" />
              </div>

              <div className="mt-4 text-center">
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-3 py-0.5 text-xs font-bold text-amber-600 dark:text-amber-400">
                  <Sparkles className="h-3.5 w-3.5" />
                  Bản nháp có thể chỉnh sửa
                </span>

                <h3 className="mt-2 text-lg font-black text-slate-900 dark:text-white">
                  Tạo CV bằng AI
                </h3>

                <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  AI sẽ dùng dữ liệu CV hiện tại để tạo một bản nháp có cấu
                  trúc. Bạn luôn có thể rà soát và chỉnh sửa trực tiếp trong
                  trình biên tập.
                </p>

                <div className="mt-5 text-left">
                  <label
                    className="text-xs font-bold text-slate-700 dark:text-slate-300"
                    htmlFor="cv-generation-job-id"
                  >
                    Mã công việc mục tiêu{" "}
                    <span className="font-normal text-slate-400">
                      (không bắt buộc)
                    </span>
                  </label>
                  <input
                    id="cv-generation-job-id"
                    type="text"
                    value={generationJobId}
                    onChange={(event) => setGenerationJobId(event.target.value)}
                    placeholder="Dán job ID nếu muốn tối ưu theo một vị trí cụ thể"
                    disabled={generationIsActive}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                {generationError && (
                  <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-left text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{generationError}</span>
                  </div>
                )}

                <div className="mt-6 flex items-center gap-3">
                  <button
                    type="button"
                    disabled={generationIsActive}
                    onClick={() => setShowAiModal(false)}
                    className="flex-1 h-11 rounded-xl bg-slate-100 font-bold text-xs text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 cursor-pointer disabled:opacity-50"
                  >
                    Đóng
                  </button>
                  <button
                    type="button"
                    disabled={generationIsActive || isSaving || isAutoSaving}
                    onClick={() => void handleGenerateWithAi()}
                    className="flex-1 h-11 flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 font-bold text-xs text-white shadow-lg shadow-amber-500/25 hover:from-amber-600 hover:to-amber-700 transition cursor-pointer disabled:opacity-60"
                  >
                    {generationIsActive ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Đang tạo bản nháp...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        <span>Tạo bản nháp</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
